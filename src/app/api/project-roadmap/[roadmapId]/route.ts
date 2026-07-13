import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { ProjectRoadmap, ProjectMilestone, MilestoneProgress } from '@/lib/types'

/**
 * GET /api/project-roadmap/[roadmapId]
 * Roadmap + milestones + per-milestone progress. Auth-gated: only the owner can read.
 */
export async function GET(
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
    const { data: roadmap, error: roadmapError } = await (supabase as any)
        .from('project_roadmaps')
        .select('*')
        .eq('id', roadmapId)
        .eq('user_id', user.id)
        .maybeSingle()

    if (roadmapError) {
        console.error('[project-roadmap:id] roadmap fetch error:', roadmapError.message)
        return NextResponse.json({ success: false, error: 'Failed to load roadmap' }, { status: 500 })
    }
    if (!roadmap) {
        return NextResponse.json({ success: false, error: 'Roadmap not found' }, { status: 404 })
    }
    const roadmapRow = roadmap as ProjectRoadmap

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: milestones, error: milestonesError } = await (supabase as any)
        .from('project_milestones')
        .select('*')
        .eq('roadmap_id', roadmapId)
        .order('milestone_number', { ascending: true })

    if (milestonesError) {
        console.error('[project-roadmap:id] milestones fetch error:', milestonesError.message)
        return NextResponse.json({ success: false, error: 'Failed to load milestones' }, { status: 500 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: progress, error: progressError } = await (supabase as any)
        .from('milestone_progress')
        .select('*')
        .eq('roadmap_id', roadmapId)
        .eq('user_id', user.id)

    if (progressError) {
        console.error('[project-roadmap:id] progress fetch error:', progressError.message)
        return NextResponse.json({ success: false, error: 'Failed to load milestone progress' }, { status: 500 })
    }

    const milestoneRows = (milestones ?? []) as ProjectMilestone[]
    const progressRows = (progress ?? []) as MilestoneProgress[]
    const progressByMilestone = new Map(progressRows.map((p) => [p.milestone_id, p]))
    const milestonesWithProgress = milestoneRows.map((m) => ({
        ...m,
        progress: progressByMilestone.get(m.id) ?? null,
        locked: m.milestone_number > roadmapRow.current_milestone,
    }))

    return NextResponse.json({ success: true, roadmap: roadmapRow, milestones: milestonesWithProgress })
}
