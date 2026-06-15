import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeRedis } from '@/lib/redis'
import { KEY, TTL } from '@/lib/redis-keys'
import { requireUserLimit } from '@/lib/rate-limit'
import { enqueue } from '@/lib/queue'
import { matchAndPromote } from '@/lib/poolMatch'
import { checkQuota } from '@/lib/plan'

// Pool hit threshold: when the warm pool has at least this many fresh matches
// for the user's query, we promote them into `jobs` and skip the n8n round-trip.
// Below this we still promote what's there, then fall through to ingestion to top up.
const POOL_HIT_THRESHOLD = 5

export const maxDuration = 60

/**
 * /api/ingest-jobs — three response shapes (UI handles all via the same
 * polling loop in dashboard/search/page.tsx):
 *
 *   1. Cache hit (within 6h)        → ingestion_log_id: 'cache-hit:<key>'
 *      ↳ /api/ingest-status returns {status:'completed', cached:true} immediately
 *
 *   2. Queued (Phase 7+)            → ingestion_log_id: 'queue:<job_id>',
 *                                     queue_position: <number>
 *      ↳ /api/ingest-status looks up job_queue row and maps its status
 *
 *   3. Direct n8n trigger (legacy)  → ingestion_log_id: <real UUID from job_ingestion_logs>
 *      ↳ retained as fallback if N8N_QUEUE_MODE=disabled
 *
 * Switch direct→queue is opt-out via env: setting N8N_QUEUE_MODE=disabled
 * keeps the legacy direct-call path. Default is queue mode.
 */
export async function POST(request: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rl = await requireUserLimit(user.id, 'ingest')
    if (rl) return rl

    let body: Record<string, unknown>
    try {
        body = (await request.json()) as Record<string, unknown>
    } catch {
        return NextResponse.json(
            { success: false, error: 'Invalid JSON body' },
            { status: 400 }
        )
    }

    const role = String(body.role ?? '')
    const location = String(body.location ?? '')
    const level = String(body.experience_level ?? '')
    const cacheKey = KEY.jobs(role, location, level)

    // 1. Cache hit short-circuit (avoid both n8n and queue when the result is fresh)
    const cachedHit = await safeRedis(async (r) => r.get<Record<string, unknown>>(cacheKey))
    if (cachedHit !== null && cachedHit !== undefined) {
        return NextResponse.json({
            ...(cachedHit as Record<string, unknown>),
            ingestion_log_id: `cache-hit:${cacheKey}`,
            cached: true,
        })
    }

    // 1.5. Pool check (Phase 2B). pool_jobs holds every normalized item we've ever
    // ingested (including filter-rejected ones). When prior ingestions surfaced jobs
    // matching this exact role/location/level, promote them into `jobs` and avoid
    // a fresh n8n/Apify run. Best-effort: any failure here falls through silently.
    try {
        const pool = await matchAndPromote({
            role,
            location,
            experience_level: level,
            max_age_days: Number(body.max_age_days ?? 7),
            limit: 25,
        })

        if (pool.matches.length >= POOL_HIT_THRESHOLD) {
            // Warm the cache so identical follow-up clicks short-circuit at step 1.
            // NX so we don't overwrite an existing entry that may already point at
            // a queue or real ingestion.
            await safeRedis(async (r) => {
                await r.set(
                    cacheKey,
                    {
                        new_jobs_added: pool.promoted,
                        total_jobs_fetched: pool.matches.length,
                        from_pool: true,
                        cached_at: Date.now(),
                    },
                    { ex: TTL.JOBS, nx: true }
                )
                return true
            })
            return NextResponse.json({
                success: true,
                ingestion_log_id: `cache-hit:pool:${cacheKey}`,
                cached: true,
                from_pool: true,
                pool_matches: pool.matches.length,
                pool_promoted: pool.promoted,
            })
        }
        // Below threshold but we still promoted what was there. The new rows are
        // already in `jobs`; the queue/n8n path below will top up with fresh fetches.
    } catch (err) {
        console.warn('[/api/ingest-jobs] pool check failed:', err)
        // Non-fatal — continue to existing path
    }

    // Past cache + pool short-circuits → a fresh, paid job fetch will run.
    // Count it against the monthly job-search quota.
    const overQuota = await checkQuota(user.id, 'job_search')
    if (overQuota) return overQuota

    // 2. Queue mode (default): enqueue the job and return immediately
    const queueMode = process.env.N8N_QUEUE_MODE !== 'disabled'
    if (queueMode) {
        try {
            const { job_id, queue_position } = await enqueue(user.id, 'ingest_jobs', {
                role,
                location,
                experience_level: level,
                country_code: body.country_code ?? 'IN',
                user_id: user.id,
            })

            // Write cache at enqueue time so identical-filter clicks within
            // TTL.JOBS short-circuit and don't trigger a new n8n run. NX so we
            // don't overwrite an existing entry (which would extend its TTL).
            // Cache stores the queue pointer; on cache-hit the read path
            // converts it to a `cache-hit:` sentinel anyway, but we keep the
            // queue id so /api/ingest-status can invalidate on failure.
            await safeRedis(async (r) => {
                await r.set(
                    cacheKey,
                    {
                        ingestion_log_id: `queue:${job_id}`,
                        queued_at: Date.now(),
                    },
                    { ex: TTL.JOBS, nx: true }
                )
                return true
            })

            return NextResponse.json({
                success: true,
                queued: true,
                ingestion_log_id: `queue:${job_id}`,
                queue_position,
            })
        } catch (err) {
            console.error('[/api/ingest-jobs] enqueue failed, falling back to direct call:', err)
            // fall through to direct call as a degraded path
        }
    }

    // 3. Direct call fallback (legacy or queue-failed)
    const webhookUrl = process.env.N8N_JOB_INGESTION_WEBHOOK_URL
    if (!webhookUrl) {
        console.error('[/api/ingest-jobs] N8N_JOB_INGESTION_WEBHOOK_URL not configured')
        return NextResponse.json(
            { success: false, error: 'Job ingestion is not configured' },
            { status: 500 }
        )
    }

    // Bound the outbound call — n8n workflows can hang for minutes. (M10)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)
    let n8nResponse: Response
    try {
        n8nResponse = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
        })
    } catch (err) {
        console.error('[/api/ingest-jobs] could not reach n8n:', err)
        return NextResponse.json(
            { success: false, error: 'Job ingestion service is unavailable' },
            { status: 502 }
        )
    } finally {
        clearTimeout(timeout)
    }

    const text = await n8nResponse.text()
    if (n8nResponse.ok && !text.trim()) {
        return NextResponse.json({ success: true, message: 'Job ingestion triggered' })
    }
    let data: unknown
    try {
        data = JSON.parse(text)
    } catch {
        if (n8nResponse.ok) {
            return NextResponse.json({ success: true, message: text || 'Job ingestion triggered' })
        }
        return NextResponse.json({ success: false, error: text }, { status: n8nResponse.status })
    }
    if (!n8nResponse.ok) {
        return NextResponse.json({ success: false, error: data }, { status: n8nResponse.status })
    }
    return NextResponse.json(data)
}
