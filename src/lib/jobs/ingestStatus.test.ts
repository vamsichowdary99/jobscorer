import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveIngestStatus, type QueueLike, type IngestLogLike } from './ingestStatus.ts'

const NOW = Date.parse('2026-05-27T16:30:00.000Z')

function queue(status: QueueLike['status'], result: QueueLike['result']): QueueLike {
  return { status, result }
}
function log(status: string, opts: Partial<IngestLogLike> = {}): IngestLogLike {
  return {
    status,
    new_jobs_added: opts.new_jobs_added ?? null,
    total_jobs_fetched: opts.total_jobs_fetched ?? null,
    // default: created 1 min before NOW (well within the gate timeout)
    created_at: opts.created_at ?? '2026-05-27T16:29:00.000Z',
  }
}

// THE BUG: queue is marked done ~2min before the ingestion log completes (jobs
// are written). We must NOT report completed while the log is still running,
// otherwise the UI refreshes too early and shows stale results.
test('queue done + log still processing → processing (gate, do not finalize)', () => {
  const r = resolveIngestStatus(queue('done', { ingestion_log_id: 'L1' }), log('processing'), NOW)
  assert.equal(r.status, 'processing')
  assert.equal(r.cacheAction, 'none')
})

test('queue done + log running → processing (gate)', () => {
  const r = resolveIngestStatus(queue('done', { ingestion_log_id: 'L1' }), log('running'), NOW)
  assert.equal(r.status, 'processing')
})

test('queue done + log completed → completed with REAL counts from log', () => {
  const r = resolveIngestStatus(
    queue('done', { ingestion_log_id: 'L1' }),
    log('completed', { new_jobs_added: 13, total_jobs_fetched: 18 }),
    NOW,
  )
  assert.equal(r.status, 'completed')
  assert.equal(r.new_jobs_added, 13)
  assert.equal(r.total_jobs_fetched, 18)
  assert.equal(r.cacheAction, 'write-success')
})

test('queue done + log failed → failed + invalidate cache', () => {
  const r = resolveIngestStatus(queue('done', { ingestion_log_id: 'L1' }), log('failed'), NOW)
  assert.equal(r.status, 'failed')
  assert.equal(r.cacheAction, 'invalidate')
})

test('safety: queue done + log stuck processing past timeout → completed (no hang)', () => {
  const r = resolveIngestStatus(
    queue('done', { ingestion_log_id: 'L1' }),
    log('processing', { created_at: '2026-05-27T16:20:00.000Z' }), // 10 min old
    NOW,
  )
  assert.equal(r.status, 'completed')
  assert.equal(r.cacheAction, 'none') // counts not trustworthy — don't cache
})

test('queue done + no log id → fall back to queue result counts', () => {
  const r = resolveIngestStatus(queue('done', { new_jobs_added: 7, total_fetched: 9 }), null, NOW)
  assert.equal(r.status, 'completed')
  assert.equal(r.new_jobs_added, 7)
  assert.equal(r.total_jobs_fetched, 9)
})

test('queue pending → queued', () => {
  const r = resolveIngestStatus(queue('pending', null), null, NOW)
  assert.equal(r.status, 'queued')
  assert.equal(r.cacheAction, 'none')
})

test('queue processing → processing', () => {
  const r = resolveIngestStatus(queue('processing', null), null, NOW)
  assert.equal(r.status, 'processing')
})

test('queue failed (no log) → failed + invalidate', () => {
  const r = resolveIngestStatus(queue('failed', null), null, NOW)
  assert.equal(r.status, 'failed')
  assert.equal(r.cacheAction, 'invalidate')
})
