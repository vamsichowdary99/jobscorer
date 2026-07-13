import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/project-roadmap/[roadmapId]/complete
 * Finalizes a roadmap once every milestone has passed its checkpoint.
 * Evidence generation + achievement evaluation are wired in Phase 6 (they hook
 * into this same completion event once project_evidence exists).
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
        .select('id, status')
        .eq('id', roadmapId)
        .eq('user_id', user.id)
        .maybeSingle()

    if (fetchError) {
        console.error('[project-roadmap:complete] fetch error:', fetchError.message)
        return NextResponse.json({ success: false, error: 'Failed to load roadmap' }, { status: 500 })
    }
    if (!roadmap) {
        return NextResponse.json({ success: false, error: 'Roadmap not found' }, { status: 404 })
    }
    if (roadmap.status === 'completed') {
        return NextResponse.json({ success: true, already_completed: true })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: milestoneCount } = await (supabase as any)
        .from('project_milestones')
        .select('id', { count: 'exact', head: true })
        .eq('roadmap_id', roadmapId)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: completedCount } = await (supabase as any)
        .from('milestone_progress')
        .select('id', { count: 'exact', head: true })
        .eq('roadmap_id', roadmapId)
        .eq('user_id', user.id)
        .eq('status', 'completed')

    if (!milestoneCount || (completedCount ?? 0) < milestoneCount) {
        return NextResponse.json(
            { success: false, error: 'All milestones must pass Review My Work before the roadmap can be completed' },
            { status: 400 }
        )
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any)
        .from('project_roadmaps')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', roadmapId)
        .eq('user_id', user.id)

    if (updateError) {
        console.error('[project-roadmap:complete] update error:', updateError.message)
        return NextResponse.json({ success: false, error: 'Failed to complete roadmap' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
