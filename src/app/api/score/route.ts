import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeRedis } from '@/lib/redis'
import { KEY, TTL } from '@/lib/redis-keys'
import { requireUserLimit } from '@/lib/rate-limit'
import { findBestJobMatches } from '@/lib/rag/search'
import { getResumeYearsOfExperience } from '@/lib/rag/resume-years'
import { enqueue } from '@/lib/queue'
import { logEstimatedUsage } from '@/lib/usage'
import { checkQuota } from '@/lib/plan'

// Allow scoring to take up to 2 minutes
export const maxDuration = 120

// If the best cosine similarity between the resume and ANY of the user's
// searched jobs is below this, scoring will almost certainly return all
// low_fit results. Gate the call and surface a warning instead.
const GATE_SIMILARITY_THRESHOLD = 0.15

// Freshness cap for RAG scoring. Anything older than this (measured by
// COALESCE(posted_date, created_at)) is dropped before GPT-4o sees it —
// stale postings waste tokens and frustrate the candidate when they apply
// to filled roles. 14 days fits the Indian fresher market's churn rate.
const RAG_MAX_POSTED_DAYS_OLD = 14

// Max job_ids per queued scoring call. The n8n scorer loops ~8s/job, and the
// Queue Processor aborts a dispatch after its timeout (170s). 10 jobs ≈ 80s
// leaves comfortable headroom so batches finish on the first attempt instead of
// timing out and retrying (which produced duplicate "zombie" executions).
const SCORE_BATCH_SIZE = 10

/**
 * Scoring proxy with per-(resume_id, job_id) Redis cache.
 *
 * Two modes (controlled by `mode` body field, default 'all'):
 *   - 'all'  : score every job_id passed in (legacy behavior, what the UI does today)
 *   - 'rag'  : ignore job_ids, instead pre-shortlist the top 10 semantically
 *              relevant jobs via the match_jobs RPC, then score only those.
 *              Cuts gpt-4o calls by ~90% (50 → 10 jobs).
 *
 * Cache logic is identical in both modes: per (resume_id, job_id) marker.
 */
export async function POST(req: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rl = await requireUserLimit(user.id, 'score')
    if (rl) return rl

    let body: Record<string, unknown>
    try {
        body = (await req.json()) as Record<string, unknown>
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
    }
    body.userId = user.id

    const resumeId = String(body.resume_id ?? '')
    const incomingJobIds = Array.isArray(body.job_ids) ? (body.job_ids as string[]) : []
    const mode = (body.mode === 'rag' ? 'rag' : 'all') as 'rag' | 'all'
    const experienceLevel = typeof body.experience_level === 'string' ? body.experience_level : ''
    const forceScore = body.force_score === true

    // RAG mode shortlists candidates first; legacy 'all' mode keeps the full job_ids list.
    let jobIdsToScore: string[]
    let ragShortlistSize: number | undefined
    if (mode === 'rag') {
        if (!resumeId) {
            return NextResponse.json(
                { success: false, error: 'resume_id is required for mode=rag' },
                { status: 400 }
            )
        }
        try {
            const candidateYears = await getResumeYearsOfExperience(resumeId)
            // Junior/entry-level JDs routinely ask for 2-3 years even when they
            // are open to freshers. A +1 buffer was hiding most of them. Floor
            // at 3 so a 0-year fresher still sees roles asking up to 3 years.
            const maxYearsRequired = Math.max(3, candidateYears + 2)

            const matches = await findBestJobMatches(resumeId, {
                count: 25,
                experienceLevel: experienceLevel || null,
                maxYearsRequired,
                // Scope to the jobs the user searched for when provided.
                // Falls back to global search when results panel was empty.
                candidateJobIds: incomingJobIds.length > 0 ? incomingJobIds : undefined,
                // Skip stale jobs that are most likely filled or ghost reposts.
                maxPostedDaysOld: RAG_MAX_POSTED_DAYS_OLD,
            })
            jobIdsToScore = matches.map(m => m.job_id)
            ragShortlistSize = jobIdsToScore.length

            // Pre-score gate: if the best match in the searched set is below
            // the threshold, warn the user before burning GPT-4o tokens.
            const maxSimilarity = matches.length > 0
                ? Math.max(...matches.map(m => m.similarity))
                : 0
            console.log(
                `[/api/score] RAG: candidate=${candidateYears}y, maxYears=${maxYearsRequired}, ` +
                `matched=${ragShortlistSize}, maxSimilarity=${maxSimilarity.toFixed(3)}, ` +
                `scoped=${incomingJobIds.length > 0}, forceScore=${forceScore}`
            )

            if (!forceScore && incomingJobIds.length > 0 && maxSimilarity < GATE_SIMILARITY_THRESHOLD) {
                return NextResponse.json({
                    success: true,
                    gate_triggered: true,
                    max_similarity: maxSimilarity,
                    jobs_scored: 0,
                    rag_shortlist_size: 0,
                    candidate_years: candidateYears,
                })
            }

            if (jobIdsToScore.length === 0) {
                return NextResponse.json({
                    success: true,
                    mode,
                    jobs_scored: 0,
                    cache_hits: 0,
                    from_cache: false,
                    rag_shortlist_size: 0,
                    candidate_years: candidateYears,
                    note: 'No matching embeddings within experience/years filter',
                })
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error'
            console.error('[/api/score] RAG search failed:', err)
            return NextResponse.json(
                { success: false, error: `RAG shortlist failed: ${msg}` },
                { status: 500 }
            )
        }
    } else {
        if (!resumeId || incomingJobIds.length === 0) {
            return NextResponse.json(
                { success: false, error: 'resume_id and job_ids are required (for mode=all)' },
                { status: 400 }
            )
        }
        jobIdsToScore = incomingJobIds
    }

    // Two-layer cache lookup:
    //   1. Redis marker `score:<resumeId>:<jobId>` (24h TTL, set after a confirmed scoring)
    //   2. Supabase user_job_matches row (source of truth — written by n8n via the
    //      Queue Processor path, which doesn't touch Redis on its own)
    // Layer 2 backfills Layer 1 so subsequent clicks short-circuit at Redis speed.
    const cacheStatus = await safeRedis(async (r) => {
        const keys = jobIdsToScore.map((jid) => KEY.score(resumeId, jid))
        const hits = await r.mget(...keys)
        return hits
    })

    const redisMissing: string[] = []
    let cacheHits = 0
    if (cacheStatus) {
        jobIdsToScore.forEach((jid, i) => {
            if (cacheStatus[i]) {
                cacheHits++
            } else {
                redisMissing.push(jid)
            }
        })
    } else {
        redisMissing.push(...jobIdsToScore)
    }

    // Backfill from Supabase user_job_matches for anything Redis missed.
    // This is what fixes "second click re-runs scoring" — in queue mode Redis
    // never gets written by /api/score, so we'd otherwise re-enqueue scores
    // that already exist in user_job_matches.
    const missingJobIds: string[] = []
    let supabaseBackfilled = 0
    if (redisMissing.length > 0) {
        // Use service-role client for this check so RLS policy disagreements can't
        // mask existing rows. The user_id + resume_id filter still enforces ownership.
        const { createClient: createServiceClient } = await import('@supabase/supabase-js')
        const svc = createServiceClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        const { data: existing, error: existingErr } = await svc
            .from('user_job_matches')
            .select('job_id')
            .eq('user_id', user.id)
            .eq('resume_id', resumeId)
            .in('job_id', redisMissing)
            // Only treat a row as "already scored" if it actually has a score.
            // A half-written row (relevance_score still NULL from a failed/partial
            // n8n result) must NOT be cached as scored — that would suppress
            // re-scoring it for 24h. (H7)
            .not('relevance_score', 'is', null)
        if (existingErr) {
            console.warn('[/api/score] user_job_matches lookup failed:', existingErr.message)
            missingJobIds.push(...redisMissing)
        } else {
            const scoredSet = new Set((existing ?? []).map((r: { job_id: string }) => r.job_id))
            for (const jid of redisMissing) {
                if (scoredSet.has(jid)) {
                    cacheHits++
                    supabaseBackfilled++
                } else {
                    missingJobIds.push(jid)
                }
            }
            console.log(
                `[/api/score] cache check: total=${jobIdsToScore.length} redis_hit=${cacheHits - supabaseBackfilled} ` +
                `supabase_backfill=${supabaseBackfilled} missing=${missingJobIds.length} (resume=${resumeId.slice(0, 8)})`
            )
            // Promote the Supabase hits into Redis so the NEXT click is even faster.
            if (supabaseBackfilled > 0) {
                await safeRedis(async (r) => {
                    const pipe = r.pipeline()
                    for (const jid of scoredSet) {
                        pipe.set(KEY.score(resumeId, jid as string), 1, { ex: TTL.SCORE })
                    }
                    await pipe.exec()
                    return true
                })
            }
        }
    }

    if (missingJobIds.length === 0) {
        return NextResponse.json({
            success: true,
            mode,
            jobs_scored: jobIdsToScore.length,
            cache_hits: cacheHits,
            from_cache: true,
            from_supabase_backfill: supabaseBackfilled,
            rag_shortlist_size: ragShortlistSize,
        })
    }

    // Fresh scoring work exists → count one scoring run against the monthly quota
    // (a run scores a whole batch, so it's 1 unit regardless of job count).
    const scoreQuota = await checkQuota(user.id, 'score')
    if (scoreQuota) return scoreQuota

    // Queue mode (default): enqueue + return immediately. The Queue Processor
    // n8n workflow picks up pending rows, dispatches to /webhook/anti-gravity/score
    // and writes the result back into job_queue.result. Frontend polls
    // /api/queue/<id> (or subscribes via Realtime in Phase 8) to know when done.
    const queueMode = process.env.N8N_QUEUE_MODE !== 'disabled'
    if (queueMode) {
        try {
            // Split into batches so no single n8n scoring call exceeds the Queue
            // Processor's dispatch timeout. The scorer loops ~8s/job sequentially;
            // a 25-job batch took ~150s and blew past the old 110s timeout, which
            // then retried 3x — spawning zombie executions that re-scored the same
            // jobs and wasted GPT tokens. Capping at SCORE_BATCH_SIZE keeps each
            // call comfortably under the timeout so jobs complete on the first try.
            const batches: string[][] = []
            for (let i = 0; i < missingJobIds.length; i += SCORE_BATCH_SIZE) {
                batches.push(missingJobIds.slice(i, i + SCORE_BATCH_SIZE))
            }
            const enqueued: { job_id: string; queue_position: number }[] = []
            for (const batch of batches) {
                enqueued.push(await enqueue(user.id, 'score', {
                    user_id: user.id,
                    resume_id: resumeId,
                    job_ids: batch,
                    experience_level: experienceLevel,
                    mode,
                    rag_shortlist_size: ragShortlistSize ?? null,
                }))
            }
            // Estimated scoring cost = one per-job estimate × jobs dispatched.
            // Cache hits cost nothing, so only the freshly-sent jobs are logged.
            void logEstimatedUsage({ userId: user.id, feature: 'score', units: missingJobIds.length })
            return NextResponse.json({
                success: true,
                queued: true,
                // First batch's id drives the foreground queue poll; the matches
                // page also polls fetchMatches every 8s, so later batches surface
                // as their rows land regardless of which id is polled.
                queue_job_id: enqueued[0]?.job_id ?? null,
                queue_job_ids: enqueued.map(e => e.job_id),
                queue_batches: batches.length,
                queue_position: enqueued[0]?.queue_position ?? null,
                mode,
                cache_hits: cacheHits,
                sent_to_n8n: missingJobIds.length,
                rag_shortlist_size: ragShortlistSize,
                // Optimistic counter for UX so the UI can show "Scored N…" while
                // the queue processor is still running. Actual rows in
                // user_job_matches appear gradually.
                jobs_scored: cacheHits + missingJobIds.length,
            })
        } catch (err) {
            console.error('[/api/score] enqueue failed, falling back to direct call:', err)
            // fall through to direct call below
        }
    }

    const webhookUrl = process.env.N8N_SCORING_WEBHOOK_URL
    if (!webhookUrl) {
        return NextResponse.json(
            { success: false, error: 'N8N_SCORING_WEBHOOK_URL not configured' },
            { status: 500 }
        )
    }

    const n8nBody = { ...body, job_ids: missingJobIds }

    // Bound the outbound call — n8n workflows can hang for minutes. (M10)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)
    let response: Response
    try {
        response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(n8nBody),
            signal: controller.signal,
        })
    } catch (err) {
        console.error('[/api/score] scoring proxy fetch error:', err)
        return NextResponse.json({ success: false, error: 'Scoring service unavailable' }, { status: 502 })
    } finally {
        clearTimeout(timeout)
    }

    if (!response.ok) {
        const errorText = await response.text()
        // Log full upstream detail server-side; return a generic message. (M9)
        console.error('[/api/score] n8n scoring error:', response.status, errorText)
        return NextResponse.json(
            { success: false, error: 'Scoring service failed' },
            { status: response.status }
        )
    }

    // n8n sometimes returns 200 with an empty body (workflow's Respond node was
    // skipped, OR an internal node errored after the webhook acknowledged).
    // Treat empty/non-JSON as inconclusive — surface a warning and DO NOT cache,
    // so the user can re-trigger and we don't poison the cache with false-positives.
    const rawText = await response.text()
    let data: Record<string, unknown> = {}
    let n8nResponseTrusted = false
    if (rawText.trim()) {
        try {
            data = JSON.parse(rawText) as Record<string, unknown>
            // We trust the response only if n8n explicitly reports it scored at
            // least one job (jobs_scored > 0) or returns non-empty results array.
            const reportedScored = typeof data.jobs_scored === 'number' ? data.jobs_scored : null
            const hasResults = Array.isArray(data.results) && data.results.length > 0
            n8nResponseTrusted = (reportedScored !== null && reportedScored > 0) || hasResults
        } catch {
            console.warn('[/api/score] n8n returned non-JSON body:', rawText.slice(0, 200))
        }
    } else {
        console.warn('[/api/score] n8n returned empty body — workflow likely errored mid-execution')
    }

    // The cache write is the contract: "this (resumeId, jobId) pair has been
    // scored and a row exists in user_job_matches". If n8n didn't score
    // anything, writing to cache would silently hide future re-score attempts.
    // Cache ONLY when n8n's response confirms successful scoring.
    if (n8nResponseTrusted) {
        await safeRedis(async (r) => {
            const pipe = r.pipeline()
            for (const jid of missingJobIds) {
                pipe.set(KEY.score(resumeId, jid), 1, { ex: TTL.SCORE })
            }
            await pipe.exec()
            return true
        })
        // Direct (non-queue) fallback path: log estimated cost for the jobs n8n scored.
        void logEstimatedUsage({ userId: user.id, feature: 'score', units: missingJobIds.length })
    }

    // Surface mismatch so callers can detect silent n8n failures
    if (!n8nResponseTrusted) {
        console.warn(
            `[/api/score] n8n response not trusted; not caching. ` +
            `Sent ${missingJobIds.length} job_ids, got body=${rawText.slice(0, 100)}`
        )
    }

    const newScored = (data.jobs_scored as number | undefined) ?? 0
    return NextResponse.json({
        ...data,
        success: n8nResponseTrusted,
        mode,
        // Total jobs that have a score after this call (cache + freshly scored).
        // For breakdown:
        //   new_scored = jobs n8n actually processed in this call (0 if n8n silently failed)
        //   cache_hits = jobs that were already cached
        //   sent_to_n8n = how many we asked n8n to score (use to detect a silent failure)
        jobs_scored: cacheHits + newScored,
        new_scored: newScored,
        sent_to_n8n: missingJobIds.length,
        cache_hits: cacheHits,
        from_cache: false,
        rag_shortlist_size: ragShortlistSize,
        n8n_trusted: n8nResponseTrusted,
    })
}