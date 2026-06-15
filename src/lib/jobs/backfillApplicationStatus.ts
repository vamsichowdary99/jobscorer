/**
 * One-shot text backfill for jobs.application_status.
 *
 * Strategy (chosen to dodge two PostgREST limits):
 *   1. Read every 'unknown' row in id-cursor pages. Cursor paging (id > last)
 *      is what makes the slice ADVANCE — a plain `.limit()` re-scans the same
 *      first 1000 unknown rows forever. Collect the ids that look closed.
 *   2. Mark the closed ids in small chunks — a single `.in('id', [~1000 uuids])`
 *      builds a URL too long and 414s, so chunk to 100.
 *   3. Mark the examined remainder 'open' with ONE filtered update
 *      (`.eq('application_status','unknown')`) — a filter, not a value list, so
 *      no URL-length problem. Guarded on `exhausted` so we never flip rows we
 *      didn't actually examine.
 * Idempotent.
 */
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { detectClosedFromText } from '@/lib/jobs/applicationStatus'

let _sb: ReturnType<typeof createServiceClient> | null = null
function sb() {
    if (_sb) return _sb
    _sb = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    return _sb
}

export interface BackfillStatusResult {
    selected: number
    marked_closed: number
    marked_open: number
    batches: number
    exhausted: boolean
    errors: number
    elapsed_ms: number
}

const MIN_UUID = '00000000-0000-0000-0000-000000000000'

export async function backfillApplicationStatus(
    opts: { batchSize?: number; maxBatches?: number } = {},
): Promise<BackfillStatusResult> {
    const t0 = Date.now()
    const batchSize = opts.batchSize ?? 1000
    const maxBatches = opts.maxBatches ?? 50

    let selected = 0, batches = 0, errors = 0, exhausted = false
    let cursor = MIN_UUID
    const closedIds: string[] = []

    // 1. Paginate unknown rows by id cursor; collect closed ids.
    for (let i = 0; i < maxBatches; i++) {
        const { data, error } = await sb()
            .from('jobs')
            .select('id, title, description')
            .eq('application_status', 'unknown')
            .gt('id', cursor)
            .order('id', { ascending: true })
            .limit(batchSize)

        if (error) { console.warn('[backfillApplicationStatus] select failed:', error.message); errors++; break }

        const rows = (data ?? []) as Array<{ id: string; title: string | null; description: string | null }>
        if (rows.length === 0) { exhausted = true; break }
        batches++
        selected += rows.length
        cursor = rows[rows.length - 1].id
        for (const r of rows) if (detectClosedFromText(r.title, r.description)) closedIds.push(r.id)
        if (rows.length < batchSize) { exhausted = true; break }
    }

    // 2. Mark closed ids in chunks (avoid 414 URI Too Long).
    let marked_closed = 0
    const CHUNK = 100
    for (let i = 0; i < closedIds.length; i += CHUNK) {
        const slice = closedIds.slice(i, i + CHUNK)
        // `as any`: sb() is an untyped service client; the jobs Update type isn't
        // declared so the payload infers `never` (same convention as lib/plan.ts).
        const { error } = await (sb() as any).from('jobs').update({ application_status: 'closed' }).in('id', slice)
        if (error) { console.warn('[backfillApplicationStatus] closed update failed:', error.message); errors++ }
        else marked_closed += slice.length
    }

    // 3. Mark the examined remainder 'open' in one filtered update — only safe
    //    when we read to the end (otherwise we'd flip un-examined rows).
    let marked_open = 0
    if (exhausted) {
        const { error, count } = await (sb() as any)
            .from('jobs')
            .update({ application_status: 'open' }, { count: 'exact' })
            .eq('application_status', 'unknown')
        if (error) { console.warn('[backfillApplicationStatus] open update failed:', error.message); errors++ }
        else marked_open = count ?? 0
    }

    return { selected, marked_closed, marked_open, batches, exhausted, errors, elapsed_ms: Date.now() - t0 }
}
