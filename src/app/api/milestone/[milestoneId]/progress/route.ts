import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/milestone/[milestoneId]/progress
 * Body: { checklist_state: boolean[], github_url?: string, notes?: string }
 * Debounced autosave target (frontend calls this ~every 1.5s on change).
 * Upserts on (user_id, milestone_id) — ownership is enforced by resolving the
 * milestone's roadmap and checking it belongs to the caller before writing.
 */
export async function POST(
    req: NextRequest,
    ctx: { params: Promise<{ milestoneId: string }> }
) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { milestoneId } = await ctx.params
    if (!milestoneId) {
        return NextResponse.json({ success: false, error: 'Missing milestoneId' }, { status: 400 })
    }

    let body: Record<string, unknown>
    try {
        body = (await req.json()) as Record<string, unknown>
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
    }

    const checklist_state = Array.isArray(body.checklist_state)
        ? body.checklist_state.map((v) => Boolean(v))
        : []
    const github_url = typeof body.github_url === 'string' ? body.github_url : null
    const notes = typeof body.notes === 'string' ? body.notes : null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: milestone, error: milestoneError } = await (supabase as any)
        .from('project_milestones')
        .select('id, roadmap_id')
        .eq('id', milestoneId)
        .maybeSingle()

    if (milestoneError) {
        console.error('[milestone:progress] milestone fetch error:', milestoneError.message)
        return NextResponse.json({ success: false, error: 'Failed to load milestone' }, { status: 500 })
    }
    if (!milestone) {
        return NextResponse.json({ success: false, error: 'Milestone not found' }, { status: 404 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: roadmap, error: roadmapError } = await (supabase as any)
        .from('project_roadmaps')
        .select('id')
        .eq('id', milestone.roadmap_id)
        .eq('user_id', user.id)
        .maybeSingle()

    if (roadmapError) {
        console.error('[milestone:progress] roadmap ownership check error:', roadmapError.message)
        return NextResponse.json({ success: false, error: 'Failed to verify ownership' }, { status: 500 })
    }
    if (!roadmap) {
        return NextResponse.json({ success: false, error: 'Milestone not found' }, { status: 404 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: upsertError } = await (supabase as any)
        .from('milestone_progress')
        .upsert(
            {
                user_id: user.id,
                roadmap_id: milestone.roadmap_id,
                milestone_id: milestoneId,
                checklist_state,
                github_url,
                notes,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,milestone_id' }
        )

    if (upsertError) {
        console.error('[milestone:progress] upsert error:', upsertError.message)
        return NextResponse.json({ success: false, error: 'Failed to save progress' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
