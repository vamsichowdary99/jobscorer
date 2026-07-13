import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/project-roadmap/[roadmapId]/start
 * Marks a roadmap in_progress. Idempotent — only sets started_at the first time.
 */
export async function POST(
    _req: NextRequest,
    ctx: { params: Promise<{ roadmapId: string }> }
) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { roadmapId } = await ctx.params
    if (!roadmapId) {
        return NextResponse.json({ success: false, error: 'Missing roadmapId' }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: roadmap, error: fetchError } = await (supabase as any)
        .from('project_roadmaps')
        .select('id, status, started_at')
        .eq('id', roadmapId)
        .eq('user_id', user.id)
        .maybeSingle()

    if (fetchError) {
        console.error('[project-roadmap:start] fetch error:', fetchError.message)
        return NextResponse.json({ success: false, error: 'Failed to load roadmap' }, { status: 500 })
    }
    if (!roadmap) {
        return NextResponse.json({ success: false, error: 'Roadmap not found' }, { status: 404 })
    }

    if (roadmap.status === 'not_started') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updateError } = await (supabase as any)
            .from('project_roadmaps')
            .update({ status: 'in_progress', started_at: new Date().toISOString() })
            .eq('id', roadmapId)
            .eq('user_id', user.id)

        if (updateError) {
            console.error('[project-roadmap:start] update error:', updateError.message)
            return NextResponse.json({ success: false, error: 'Failed to start roadmap' }, { status: 500 })
        }
    }

    return NextResponse.json({ success: true })
}
