import { NextRequest, NextResponse } from 'next/server';
import { embedResume } from '@/lib/rag/embeddings';
import { isValidInternalToken } from '@/lib/adminAuth';

export const maxDuration = 30;

/**
 * POST /api/rag/embed-resume
 * Body: { resume_id: string }
 * Header: X-Internal-Token: <N8N_INTERNAL_TOKEN>
 *
 * Generates a 1536-dim embedding for the resume's structured_data and upserts
 * into resume_embeddings. Called by AG-parse resume after parsing completes.
 */
export async function POST(req: NextRequest) {
    if (!isValidInternalToken(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
        body = (await req.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const resumeId = String(body.resume_id ?? '');
    if (!resumeId) {
        return NextResponse.json({ error: 'resume_id is required' }, { status: 400 });
    }

    try {
        const result = await embedResume(resumeId);
        return NextResponse.json({ ok: true, resume_id: resumeId, ...result });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('[/api/rag/embed-resume] error:', err);
        return NextResponse.json({ ok: false, resume_id: resumeId, error: msg }, { status: 500 });
    }
}
