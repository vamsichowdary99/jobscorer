import crypto from 'crypto'
import OpenAI from 'openai'
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProjectRoadmap, ProjectMilestone, MatchedSkillEvidence } from '@/lib/types'

export const PROJECT_COACH_MODEL = 'gpt-4.1-mini'

export function getOpenAI() {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

/** Deterministic cache key for a permanently-cacheable coach action. */
export function makeCacheKey(userId: string, milestoneId: string, taskIndex: number, actionType: string): string {
    return crypto.createHash('sha256').update(`${userId}:${milestoneId}:${taskIndex}:${actionType}`).digest('hex')
}

interface MilestoneContextResult {
    roadmap: Pick<ProjectRoadmap, 'id' | 'project_name' | 'tech_stack' | 'difficulty' | 'job_id' | 'resume_id'>
    milestone: Pick<ProjectMilestone, 'id' | 'roadmap_id' | 'milestone_number' | 'title' | 'goal' | 'tasks'>
}

/**
 * Resolves + ownership-checks a (roadmap_id, milestone_id) pair for the calling user.
 * Returns an error NextResponse to short-circuit the route, or the resolved context.
 */
export async function resolveMilestoneContext(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: SupabaseClient<any>,
    userId: string,
    roadmapId: string,
    milestoneId: string,
): Promise<NextResponse | MilestoneContextResult> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: milestone, error: milestoneError } = await (supabase as any)
        .from('project_milestones')
        .select('id, roadmap_id, milestone_number, title, goal, tasks')
        .eq('id', milestoneId)
        .maybeSingle()

    if (milestoneError) {
        console.error('[project-coach] milestone fetch error:', milestoneError.message)
        return NextResponse.json({ success: false, error: 'Failed to load milestone' }, { status: 500 })
    }
    if (!milestone || milestone.roadmap_id !== roadmapId) {
        return NextResponse.json({ success: false, error: 'Milestone not found' }, { status: 404 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: roadmap, error: roadmapError } = await (supabase as any)
        .from('project_roadmaps')
        .select('id, project_name, tech_stack, difficulty, job_id, resume_id')
        .eq('id', roadmapId)
        .eq('user_id', userId)
        .maybeSingle()

    if (roadmapError) {
        console.error('[project-coach] roadmap fetch error:', roadmapError.message)
        return NextResponse.json({ success: false, error: 'Failed to verify ownership' }, { status: 500 })
    }
    if (!roadmap) {
        return NextResponse.json({ success: false, error: 'Roadmap not found' }, { status: 404 })
    }

    return { roadmap, milestone }
}

/** Best-effort fetch of the candidate's currently matched skills for this roadmap's job. */
export async function getMatchedSkills(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: SupabaseClient<any>,
    userId: string,
    roadmap: MilestoneContextResult['roadmap'],
): Promise<string[]> {
    if (!roadmap.job_id) return []
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase as any)
            .from('user_job_matches')
            .select('matched_skills')
            .eq('user_id', userId)
            .eq('job_id', roadmap.job_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        const raw = (data?.matched_skills ?? []) as Array<MatchedSkillEvidence | string>
        return raw.map((s) => (typeof s === 'string' ? s : s.skill)).filter(Boolean)
    } catch {
        return []
    }
}

/** Insert one assistant_interactions row. Never throws — logging must not break the response. */
export async function logInteraction(opts: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: SupabaseClient<any>
    userId: string
    roadmapId: string
    milestoneId: string
    actionType: 'teach_me' | 'stuck' | 'review_work'
    cacheKey: string | null
    userInput: string | null
    aiResponse: string
    tokensUsed: number | null
}): Promise<void> {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (opts.supabase as any).from('assistant_interactions').insert({
            user_id: opts.userId,
            roadmap_id: opts.roadmapId,
            milestone_id: opts.milestoneId,
            action_type: opts.actionType,
            cache_key: opts.cacheKey,
            user_input: opts.userInput,
            ai_response: opts.aiResponse,
            tokens_used: opts.tokensUsed,
        })
    } catch (err) {
        console.warn('[project-coach] failed to log interaction:', err)
    }
}
