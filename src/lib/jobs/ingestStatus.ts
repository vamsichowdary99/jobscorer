/**
 * resolveIngestStatus — decides the UI-facing status + counts for a queued
 * `ingest_jobs` run, reconciling two sources of truth that disagree in time:
 *
 *   - `job_queue.status` flips to `done` as soon as the n8n Queue Processor
 *     ACKs the ingestion webhook — which responds early, ~2 min BEFORE the
 *     jobs are actually written to the `jobs` table.
 *   - `job_ingestion_logs` is created `processing`/`running` and only flips to
 *     `completed` AFTER the jobs are inserted, and carries the real
 *     new_jobs_added / total_jobs_fetched counts.
 *
 * Reporting `completed` off the queue alone makes the search page refresh too
 * early (fetchJobsSince finds nothing → falls back to stale DB results) and
 * always shows "0 new jobs added" (the queue result omits the counts). So when
 * the queue says `done` and we have a linked log, we gate on the LOG: keep
 * reporting `processing` until the log itself completes, then surface the log's
 * real counts.
 *
 * Pure + side-effect free so it can be unit-tested without Supabase/Redis. The
 * route maps `cacheAction` onto the actual Redis writes.
 */

export interface QueueLike {
  status: 'pending' | 'processing' | 'done' | 'failed'
  result: {
    new_jobs_added?: number
    total_fetched?: number
    ingestion_log_id?: string
  } | null
}

export interface IngestLogLike {
  status: string
  new_jobs_added: number | null
  total_jobs_fetched: number | null
  created_at: string
}

export type UiStatus = 'queued' | 'processing' | 'completed' | 'failed'
export type CacheAction = 'none' | 'write-success' | 'invalidate'

export interface ResolvedStatus {
  status: UiStatus
  new_jobs_added: number
  total_jobs_fetched: number
  cacheAction: CacheAction
}

const QUEUE_TO_UI: Record<QueueLike['status'], UiStatus> = {
  pending: 'queued',
  processing: 'processing',
  done: 'completed',
  failed: 'failed',
}

// If the linked log is somehow still running this long after it started, stop
// gating and let the UI finish — better a possibly-stale refresh than a banner
// that spins forever. n8n ingestion runs complete in ~1–2 min in practice.
export const LOG_GATE_TIMEOUT_MS = 5 * 60 * 1000

export function resolveIngestStatus(
  job: QueueLike,
  log: IngestLogLike | null,
  nowMs: number = Date.now(),
): ResolvedStatus {
  const result = job.result ?? {}

  // Gate on the ingestion log only when the queue claims done AND we can track
  // the underlying log. Otherwise fall through to the plain queue mapping.
  if (job.status === 'done' && log) {
    if (log.status === 'failed') {
      return { status: 'failed', new_jobs_added: 0, total_jobs_fetched: 0, cacheAction: 'invalidate' }
    }

    const logDone = log.status === 'completed'
    const startedMs = Date.parse(log.created_at)
    const timedOut = Number.isFinite(startedMs) && nowMs - startedMs > LOG_GATE_TIMEOUT_MS

    if (!logDone && !timedOut) {
      // Jobs aren't written yet — keep the UI polling, don't finalize the cache.
      return { status: 'processing', new_jobs_added: 0, total_jobs_fetched: 0, cacheAction: 'none' }
    }

    return {
      status: 'completed',
      new_jobs_added: log.new_jobs_added ?? result.new_jobs_added ?? 0,
      total_jobs_fetched: log.total_jobs_fetched ?? result.total_fetched ?? 0,
      // Only cache real (log-completed) counts; a timed-out run's counts are unreliable.
      cacheAction: logDone ? 'write-success' : 'none',
    }
  }

  const status = QUEUE_TO_UI[job.status] ?? 'processing'
  return {
    status,
    new_jobs_added: result.new_jobs_added ?? 0,
    total_jobs_fetched: result.total_fetched ?? 0,
    cacheAction:
      job.status === 'failed' ? 'invalidate' : job.status === 'done' ? 'write-success' : 'none',
  }
}
