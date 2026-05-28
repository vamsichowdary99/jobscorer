import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getQueueJob } from '@/lib/queue'
import { safeRedis } from '@/lib/redis'
import { KEY, TTL } from '@/lib/redis-keys'
import { backfillNullYears } from '@/lib/jobs/backfill'
import { resolveIngestStatus, type IngestLogLike } from '@/lib/jobs/ingestStatus'

// In-process guard so the fire-and-forget years backfill runs at most once
// per ingestion_log_id, no matter how many times the UI polls this route.
const yearsBackfillFired = new Set<string>()

// CRITICAL: this endpoint is polled every 5s by the queue lifecycle hook.
// Next.js may cache GET responses by default. If a poll returns 'processing'
// and that response gets cached, every subsequent poll inherits the stale
// status — the UI stays on "processing…" even after n8n completes. Force
// dynamic + no-store to make every poll see fresh DB state.
export const dynamic = 'force-dynamic'
export const revalidate = 0

function jsonNoStore(body: unknown, init?: ResponseInit): NextResponse {
    const res = NextResponse.json(body as any, init)
    res.headers.set('Cache-Control', 'no-store, max-age=0')
    return res
}

// Server-side route — uses service role key to bypass RLS
export async function GET(request: NextRequest) {
    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) {
        return jsonNoStore({ error: 'Unauthorized' }, { status: 401 })
    }

    const id = request.nextUrl.searchParams.get('id')
    if (!id) {
        return jsonNoStore({ error: 'Missing id param' }, { status: 400 })
    }

    // Sentinel 1: cache-hit (Phase 2) — synthesise completed status
    if (id.startsWith('cache-hit:')) {
        return jsonNoStore({
            status: 'completed',
            new_jobs_added: 0,
            total_jobs_fetched: 0,
            cached: true,
        })
    }

    // Sentinel 2: queue (Phase 7) — look up the job_queue row and reconcile it
    // with the inner job_ingestion_logs row, which is the real "jobs written" signal.
    if (id.startsWith('queue:')) {
        const queueId = id.slice('queue:'.length)
        const job = await getQueueJob(queueId)
        if (!job) {
            return jsonNoStore({ error: 'Queue job not found' }, { status: 404 })
        }
        if (job.user_id !== user.id) {
            return jsonNoStore({ error: 'Forbidden' }, { status: 403 })
        }
        const result = (job.result ?? {}) as {
            new_jobs_added?: number
            total_fetched?: number
            ingestion_log_id?: string
        }

        // The Queue Processor marks ingest_jobs 'done' the instant the ingestion
        // webhook ACKs — but that webhook responds EARLY ('Respond Immediately')
        // and the SerpAPI/JSearch fetch keeps running ~1–2 min afterward, writing
        // the jobs (and the real counts) only when it finishes. The truth lives in
        // job_ingestion_logs, linked via result.ingestion_log_id. Follow that row
        // so we don't report 'completed' before the jobs are actually in the table
        // (which made the search page refresh too early and show stale results,
        // always with "0 new jobs added").
        let log: IngestLogLike | null = null
        if (job.status === 'done' && result.ingestion_log_id) {
            const svc = createServiceClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!
            )
            const { data } = await svc
                .from('job_ingestion_logs')
                .select('status, new_jobs_added, total_jobs_fetched, created_at')
                .eq('id', result.ingestion_log_id)
                .maybeSingle()
            log = (data as IngestLogLike | null) ?? null
        }

        const resolved = resolveIngestStatus({ status: job.status, result }, log)

        // Cache lifecycle, driven by the resolved outcome (not the raw queue status):
        //   - 'invalidate'    → let the user retry without waiting out the 6h TTL
        //   - 'write-success' → store the REAL counts, only once the log completes
        //   - 'none'          → still in flight; leave the enqueue-time pointer in place
        const payload = (job.payload ?? {}) as {
            role?: string
            location?: string
            experience_level?: string
        }
        if (payload.role && payload.location) {
            const cacheKey = KEY.jobs(payload.role, payload.location, payload.experience_level ?? '')
            if (resolved.cacheAction === 'invalidate') {
                await safeRedis(async (r) => { await r.del(cacheKey); return true })
            } else if (resolved.cacheAction === 'write-success') {
                await safeRedis(async (r) => {
                    await r.set(
                        cacheKey,
                        {
                            new_jobs_added: resolved.new_jobs_added,
                            total_jobs_fetched: resolved.total_jobs_fetched,
                            ingestion_log_id: result.ingestion_log_id ?? null,
                            queue_id: queueId,
                            cached_at: Date.now(),
                        },
                        { ex: TTL.JOBS }
                    )
                    return true
                })
            }
        }

        return jsonNoStore({
            status: resolved.status,
            new_jobs_added: resolved.new_jobs_added,
            total_jobs_fetched: resolved.total_jobs_fetched,
            queue_status: job.status,
            queue_id: queueId,
            retry_count: job.retry_count,
            error: job.error ?? (resolved.status === 'failed' ? 'Ingestion failed' : undefined),
            // Expose the underlying job_ingestion_logs row id for deeper UI detail.
            ingestion_log_id: result.ingestion_log_id,
        })
    }

    // Default: real job_ingestion_logs row id (legacy direct-call path)
    const supabase = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data, error } = await supabase
        .from('job_ingestion_logs')
        .select('status, new_jobs_added, total_jobs_fetched, errors, created_at')
        .eq('id', id)
        .single()

    if (error) {
        return jsonNoStore({ error: error.message }, { status: 500 })
    }

    // Auto-extract min_years_experience for the jobs the ingestion just wrote.
    // Fire-and-forget so polling latency isn't affected. Guarded so a chatty
    // UI polling at 5s intervals doesn't repeatedly enqueue the same backfill.
    if ((data as { status?: string })?.status === 'completed' && !yearsBackfillFired.has(id)) {
        yearsBackfillFired.add(id)
        const sinceIso = (data as { created_at?: string | null }).created_at ?? undefined
        // Keep limit > expected new_jobs_added so a single backfill call drains
        // the freshly-ingested batch. Concurrency 5 keeps OpenAI happy.
        void backfillNullYears({ limit: 200, concurrency: 5, sinceIso })
            .then(r => console.log(`[years] auto-backfill for ingestion ${id}:`, r))
            .catch(err => console.warn('[years] auto-backfill failed:', err))
    }

    return jsonNoStore(data)
}
