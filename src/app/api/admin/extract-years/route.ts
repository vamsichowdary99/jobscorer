import { NextRequest, NextResponse } from 'next/server';
import { backfillNullYears } from '@/lib/jobs/backfill';
import { isValidAdminToken } from '@/lib/adminAuth';

// Allow long backfills (gpt-4.1-mini fallback can take 1-2s per ambiguous JD)
export const maxDuration = 300;

/**
 * POST /api/admin/extract-years
 * Service-role-token-gated. Runs the years-of-experience extractor on a
 * batch of jobs whose min_years_experience column is still NULL.
 *
 * Auth: header `X-Admin-Token: <SUPABASE_SERVICE_ROLE_KEY>`
 *
 * Body (all optional):
 *   { limit?: number,             // default 50
 *     since_iso?: string,         // only consider jobs created at/after this ISO ts
 *     concurrency?: number,       // default 5
 *     force?: boolean }           // also re-process jobs that already have a value
 */
export async function POST(req: NextRequest) {
    if (!isValidAdminToken(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: Record<string, unknown> = {};
    try {
        body = (await req.json()) as Record<string, unknown>;
    } catch { /* allow empty body */ }

    const limit = typeof body.limit === 'number' ? body.limit : 50;
    const concurrency = typeof body.concurrency === 'number' ? body.concurrency : 5;
    const sinceIso = typeof body.since_iso === 'string' ? body.since_iso : undefined;
    const force = body.force === true;

    try {
        const result = await backfillNullYears({ limit, concurrency, sinceIso, force });
        return NextResponse.json({ ok: true, ...result });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('[/api/admin/extract-years] failed:', err);
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}
