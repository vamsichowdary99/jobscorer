import { NextRequest, NextResponse } from 'next/server';
import { embedJob } from '@/lib/rag/embeddings';

export const maxDuration = 30;

/**
 * POST /api/rag/embed-job
 * Body: { job_id: string }
 * Header: X-Internal-Token: <N8N_INTERNAL_TOKEN>
 *
 * Generates a 1536-dim embedding for the job and upserts into job_embeddings.
 * Called by the Anti-Gravity Job Ingestion n8n workflow after each row insert.
 */
export async function POST(req: NextRequest) {
    const token = req.headers.get('x-internal-token') || '';
    const expected = process.env.N8N_INTERNAL_TOKEN || '';
    if (!expected || token !== expected) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
        body = (await req.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const jobId = String(body.job_id ?? '');
    if (!jobId) {
        return NextResponse.json({ error: 'job_id is required' }, { status: 400 });
    }

    try {
        const result = await embedJob(jobId);
        return NextResponse.json({ ok: true, job_id: jobId, ...result });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('[/api/rag/embed-job] error:', err);
        return NextResponse.json({ ok: false, job_id: jobId, error: msg }, { status: 500 });
    }
}
