import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { findBestJobMatches } from '@/lib/rag/search';

export const maxDuration = 30;

function tokensMatch(a: string, b: string): boolean {
    if (!a || !b) return false;
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length) return false;
    return timingSafeEqual(aBuf, bBuf);
}

/**
 * POST /api/rag/search
 * Body: {
 *   resume_id: string,
 *   count?: number,                    // default 10
 *   similarity_threshold?: number,     // default 0.3
 *   experience_level?: string | null   // optional filter
 * }
 * Header: X-Internal-Token: <N8N_INTERNAL_TOKEN>
 *
 * Returns the top-N semantically matching jobs for the resume:
 *   { ok: true, job_ids: string[], matches: [{job_id, similarity, content}, ...] }
 *
 * Called by the Anti-Gravity AI Scoring n8n workflow before per-job gpt-4o
 * scoring, so n8n only scores 10 jobs instead of N (≈90% token reduction).
 */
export async function POST(req: NextRequest) {
    const token = req.headers.get('x-internal-token') || '';
    const expected = process.env.N8N_INTERNAL_TOKEN || '';
    if (!tokensMatch(token, expected)) {
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

    const count = typeof body.count === 'number' ? body.count : 10;
    const similarityThreshold = typeof body.similarity_threshold === 'number'
        ? body.similarity_threshold
        : undefined;
    const experienceLevel = typeof body.experience_level === 'string' && body.experience_level
        ? body.experience_level
        : null;

    try {
        const matches = await findBestJobMatches(resumeId, {
            count,
            similarityThreshold,
            experienceLevel,
        });
        return NextResponse.json({
            ok: true,
            resume_id: resumeId,
            count: matches.length,
            job_ids: matches.map(m => m.job_id),
            matches,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('[/api/rag/search] error:', err);
        return NextResponse.json({ ok: false, resume_id: resumeId, error: msg }, { status: 500 });
    }
}
