import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { embedJob, embedResume } from '@/lib/rag/embeddings';
import { isValidAdminToken } from '@/lib/adminAuth';

type SB = ReturnType<typeof createServiceClient>;

// Long-running backfill — Vercel max is 60s on free tier; we cap a single
// invocation's work at 5 minutes locally and let the caller iterate.
export const maxDuration = 300;

/**
 * POST /api/rag/backfill
 * Header: X-Admin-Token: <SUPABASE_SERVICE_ROLE_KEY>
 * Body (optional):
 *   { scope?: 'jobs' | 'resumes' | 'all'   // default 'all'
 *   , limit?: number                       // batch size cap (default 200)
 *   , concurrency?: number                 // parallel embed calls (default 5)
 *   }
 *
 * Embeds rows that are missing an entry in *_embeddings. Idempotent. Cheap
 * (text-embedding-3-small at ~$0.02 per 1M tokens). Run repeatedly until
 * remaining counts hit zero.
 */
export async function POST(req: NextRequest) {
    if (!isValidAdminToken(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: { scope?: 'jobs' | 'resumes' | 'all'; limit?: number; concurrency?: number } = {};
    try {
        body = await req.json();
    } catch {
        // empty body is fine
    }
    const scope = body.scope ?? 'all';
    const limit = Math.min(Math.max(body.limit ?? 200, 1), 1000);
    const concurrency = Math.min(Math.max(body.concurrency ?? 5, 1), 20);

    const sb: SB = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const result: { jobs?: BackfillStats; resumes?: BackfillStats } = {};

    if (scope === 'jobs' || scope === 'all') {
        result.jobs = await backfillJobs(sb, limit, concurrency);
    }
    if (scope === 'resumes' || scope === 'all') {
        result.resumes = await backfillResumes(sb, limit, concurrency);
    }

    return NextResponse.json({ ok: true, scope, ...result });
}

interface BackfillStats {
    pending_before: number;
    embedded: number;
    failed: number;
    skipped: number;
    pending_after: number;
    sample_errors: string[];
}

async function backfillJobs(sb: SB, limit: number, concurrency: number): Promise<BackfillStats> {
    // Diff in JS: fetch all embedded ids → put in a Set → page through jobs
    // and pick only those missing. PostgREST doesn't support arbitrary SQL
    // subqueries in `.not.in()`; the Set-difference approach scales fine for
    // the project's job-table size (low thousands).
    const embeddedIds = new Set<string>();
    {
        let from = 0;
        const PAGE = 1000;
        while (true) {
            const { data, error } = await sb
                .from('job_embeddings' as any)
                .select('job_id')
                .range(from, from + PAGE - 1);
            if (error) {
                return { pending_before: 0, embedded: 0, failed: 0, skipped: 0, pending_after: 0, sample_errors: [error.message] };
            }
            const rows = (data ?? []) as { job_id: string }[];
            for (const r of rows) embeddedIds.add(r.job_id);
            if (rows.length < PAGE) break;
            from += PAGE;
        }
    }

    const { data: allJobs, error: jErr } = await sb
        .from('jobs')
        .select('id');
    if (jErr) {
        return { pending_before: 0, embedded: 0, failed: 0, skipped: 0, pending_after: 0, sample_errors: [jErr.message] };
    }
    const allIds = (allJobs ?? []).map((r: any) => r.id as string);
    const pendingIds = allIds.filter(id => !embeddedIds.has(id));
    const pendingBefore = pendingIds.length;

    const slice = pendingIds.slice(0, limit);
    const { embedded, failed, skipped, errors } = await processInBatches(slice, embedJob, concurrency);

    return {
        pending_before: pendingBefore,
        embedded, failed, skipped,
        pending_after: pendingBefore - embedded,
        sample_errors: errors.slice(0, 3),
    };
}

async function backfillResumes(sb: SB, limit: number, concurrency: number): Promise<BackfillStats> {
    const embeddedIds = new Set<string>();
    {
        let from = 0;
        const PAGE = 1000;
        while (true) {
            const { data, error } = await sb
                .from('resume_embeddings' as any)
                .select('resume_id')
                .range(from, from + PAGE - 1);
            if (error) {
                return { pending_before: 0, embedded: 0, failed: 0, skipped: 0, pending_after: 0, sample_errors: [error.message] };
            }
            const rows = (data ?? []) as { resume_id: string }[];
            for (const r of rows) embeddedIds.add(r.resume_id);
            if (rows.length < PAGE) break;
            from += PAGE;
        }
    }

    const { data: allResumes, error: rErr } = await sb
        .from('resumes')
        .select('id');
    if (rErr) {
        return { pending_before: 0, embedded: 0, failed: 0, skipped: 0, pending_after: 0, sample_errors: [rErr.message] };
    }
    const allIds = (allResumes ?? []).map((r: any) => r.id as string);
    const pendingIds = allIds.filter(id => !embeddedIds.has(id));
    const pendingBefore = pendingIds.length;

    const slice = pendingIds.slice(0, limit);
    const { embedded, failed, skipped, errors } = await processInBatches(slice, embedResume, concurrency);

    return {
        pending_before: pendingBefore,
        embedded, failed, skipped,
        pending_after: pendingBefore - embedded,
        sample_errors: errors.slice(0, 3),
    };
}

async function processInBatches(
    ids: string[],
    fn: (id: string) => Promise<{ embedded: boolean; reason?: string }>,
    concurrency: number,
): Promise<{ embedded: number; failed: number; skipped: number; errors: string[] }> {
    let embedded = 0, failed = 0, skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < ids.length; i += concurrency) {
        const slice = ids.slice(i, i + concurrency);
        const results = await Promise.allSettled(slice.map(id => fn(id)));
        for (let j = 0; j < results.length; j++) {
            const r = results[j];
            if (r.status === 'fulfilled') {
                if (r.value.embedded) embedded++;
                else skipped++;
            } else {
                failed++;
                if (errors.length < 5) {
                    const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
                    errors.push(`${slice[j]}: ${reason}`);
                }
            }
        }
    }
    return { embedded, failed, skipped, errors };
}
