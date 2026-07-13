import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { CheckpointResult } from '@/lib/types'
import { evaluateAchievements, type EarnedAchievement } from '@/lib/achievements'

/**
 * POST /api/milestone/[milestoneId]/complete
 * Body: { github_url?: string }
 * Called after Review My Work returns passed:true. Rather than trusting a
 * client-supplied verdict, this route re-reads the most recent review_work
 * verdict that /api/project-coach/review-work persisted to
 * assistant_interactions for this (user, milestone) and requires passed:true
 * there. The GitHub URL used is the one that was actually reviewed, not
 * whatever the client's current request body claims — otherwise a client
 * could pass review against one repo and complete against another.
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

    void body // no longer a source of the completion verdict — see doc comment above

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lastReview, error: reviewError } = await (supabase as any)
        .from('assistant_interactions')
        .select('ai_response, user_input')
        .eq('user_id', user.id)
        .eq('milestone_id', milestoneId)
        .eq('action_type', 'review_work')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (reviewError) {
        console.error('[milestone:complete] review lookup error:', reviewError.message)
        return NextResponse.json({ success: false, error: 'Failed to verify review status' }, { status: 500 })
    }

    let checkpointResult: CheckpointResult | null = null
    let reviewedGithubUrl: string | undefined
    try {
        checkpointResult = lastReview?.ai_response ? JSON.parse(lastReview.ai_response) : null
        reviewedGithubUrl = lastReview?.user_input ? JSON.parse(lastReview.user_input).github_url || undefined : undefined
    } catch {
        checkpointResult = null
    }

    if (!checkpointResult || checkpointResult.passed !== true) {
        return NextResponse.json(
            { success: false, error: 'Run Review My Work and pass it before completing this milestone' },
            { status: 400 }
        )
    }
    const github_url = reviewedGithubUrl

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: milestone, error: milestoneError } = await (supabase as any)
        .from('project_milestones')
        .select('id, roadmap_id, milestone_number')
        .eq('id', milestoneId)
        .maybeSingle()

    if (milestoneError) {
        console.error('[milestone:complete] milestone fetch error:', milestoneError.message)
        return NextResponse.json({ success: false, error: 'Failed to load milestone' }, { status: 500 })
    }
    if (!milestone) {
        return NextResponse.json({ success: false, error: 'Milestone not found' }, { status: 404 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: roadmap, error: roadmapError } = await (supabase as any)
        .from('project_roadmaps')
        .select('id, current_milestone, status, tech_stack')
        .eq('id', milestone.roadmap_id)
        .eq('user_id', user.id)
        .maybeSingle()

    if (roadmapError) {
        console.error('[milestone:complete] roadmap fetch error:', roadmapError.message)
        return NextResponse.json({ success: false, error: 'Failed to verify ownership' }, { status: 500 })
    }
    if (!roadmap) {
        return NextResponse.json({ success: false, error: 'Roadmap not found' }, { status: 404 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingProgress } = await (supabase as any)
        .from('milestone_progress')
        .select('checklist_state, github_url, notes')
        .eq('user_id', user.id)
        .eq('milestone_id', milestoneId)
        .maybeSingle()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: upsertError } = await (supabase as any)
        .from('milestone_progress')
        .upsert(
            {
                user_id: user.id,
                roadmap_id: milestone.roadmap_id,
                milestone_id: milestoneId,
                checklist_state: existingProgress?.checklist_state ?? [],
                github_url: github_url ?? existingProgress?.github_url ?? null,
                notes: existingProgress?.notes ?? null,
                status: 'completed',
                checkpoint_result: checkpointResult,
                completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,milestone_id' }
        )

    if (upsertError) {
        console.error('[milestone:complete] upsert error:', upsertError.message)
        return NextResponse.json({ success: false, error: 'Failed to save completion' }, { status: 500 })
    }

    const newCurrentMilestone = Math.max(roadmap.current_milestone, milestone.milestone_number + 1)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: advanceError } = await (supabase as any)
        .from('project_roadmaps')
        .update({ current_milestone: newCurrentMilestone })
        .eq('id', milestone.roadmap_id)

    if (advanceError) {
        console.error('[milestone:complete] advance error:', advanceError.message)
        return NextResponse.json({ success: false, error: 'Failed to advance milestone' }, { status: 500 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: totalMilestones } = await (supabase as any)
        .from('project_milestones')
        .select('id', { count: 'exact', head: true })
        .eq('roadmap_id', milestone.roadmap_id)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: completedMilestones } = await (supabase as any)
        .from('milestone_progress')
        .select('id', { count: 'exact', head: true })
        .eq('roadmap_id', milestone.roadmap_id)
        .eq('user_id', user.id)
        .eq('status', 'completed')

    let roadmapCompleted = roadmap.status === 'completed'
    let achievementsEarned: EarnedAchievement[] = []
    if (!roadmapCompleted && totalMilestones && (completedMilestones ?? 0) >= totalMilestones) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: completeError } = await (supabase as any)
            .from('project_roadmaps')
            .update({ status: 'completed', completed_at: new Date().toISOString() })
            .eq('id', milestone.roadmap_id)
        if (!completeError) {
            roadmapCompleted = true
            void triggerEvidenceGeneration(user.id, milestone.roadmap_id)
            achievementsEarned = await evaluateAchievements(supabase, user.id, {
                id: milestone.roadmap_id,
                tech_stack: Array.isArray(roadmap.tech_stack) ? roadmap.tech_stack : [],
            })
        }
    }

    return NextResponse.json({
        success: true,
        current_milestone: newCurrentMilestone,
        roadmap_completed: roadmapCompleted,
        achievements_earned: achievementsEarned,
    })
}

/**
 * Fire-and-forget kickoff of the Evidence Generator n8n workflow (resume_bullet + readme_draft).
 * Never throws — evidence generation is a background nice-to-have, not something that should
 * fail or delay the milestone-complete response the user is waiting on.
 */
async function triggerEvidenceGeneration(userId: string, roadmapId: string): Promise<void> {
    const webhookUrl = process.env.N8N_PROJECT_EVIDENCE_WEBHOOK_URL
    if (!webhookUrl) return
    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, roadmap_id: roadmapId }),
            signal: AbortSignal.timeout(15_000),
        })
    } catch (err) {
        console.warn('[milestone:complete] evidence generation trigger failed:', err)
    }
}
