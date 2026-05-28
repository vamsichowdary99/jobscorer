import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { listUserQueue } from '@/lib/queue';

export const maxDuration = 30;

/**
 * GET /api/queue
 * Returns the current user's most recent queue items (default 20).
 * Phase 8 frontend uses this to render the QueueStatusBanner.
 */
export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const items = await listUserQueue(user.id, 20);
        return NextResponse.json({ ok: true, items });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('[/api/queue] error:', err);
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}
