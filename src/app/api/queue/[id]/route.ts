import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getQueueJob } from '@/lib/queue';

export const maxDuration = 30;

/**
 * GET /api/queue/[id]
 * Returns a single queue job. Auth-gated: only the owner can read.
 */
export async function GET(
    _req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await ctx.params;
    if (!id) {
        return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    const job = await getQueueJob(id);
    if (!job) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (job.user_id !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ ok: true, job });
}
