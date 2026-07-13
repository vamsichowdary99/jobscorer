import type { SupabaseClient } from '@supabase/supabase-js'

export interface EarnedAchievement {
    achievement: string
    label: string
}

// Completion-gated only — no engagement bait. Copy stays professional (no emoji,
// no "Master"/gamey language) since the audience is IT-fresher job seekers, not gamers.
const ACHIEVEMENT_LABELS: Record<string, string> = {
    first_project_complete: 'First Project Complete',
    docker_deployed: 'Docker Deployed',
    aws_deployed: 'AWS Deployed',
    cicd_builder: 'CI/CD Pipeline Built',
    streak_3: '3 Milestones Completed in One Week',
}

function techStackMatches(techStack: string[], pattern: RegExp): boolean {
    return techStack.some((t) => pattern.test(t))
}

/**
 * Evaluates and records any newly-earned achievements for a just-completed roadmap.
 * Uses `ON CONFLICT DO NOTHING` on (user_id, achievement) so re-completing another
 * project never re-awards the same one — the `.select()` after upsert returns only
 * the rows that were actually newly inserted this call.
 */
/**
 * Never throws — achievement evaluation is a best-effort nice-to-have that runs
 * synchronously inside the milestone-complete response. A network blip here must
 * degrade to "no achievements this time," not fail the completion the user is
 * actually waiting on (which has already been persisted by the time this runs).
 */
export async function evaluateAchievements(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: SupabaseClient<any>,
    userId: string,
    roadmap: { id: string; tech_stack: string[] },
): Promise<EarnedAchievement[]> {
    try {
        const candidates = new Set<string>()

        const { count: completedRoadmaps } = await supabase
            .from('project_roadmaps')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('status', 'completed')
        if ((completedRoadmaps ?? 0) <= 1) candidates.add('first_project_complete')

        if (techStackMatches(roadmap.tech_stack, /docker/i)) candidates.add('docker_deployed')
        if (techStackMatches(roadmap.tech_stack, /\baws\b/i)) candidates.add('aws_deployed')
        if (techStackMatches(roadmap.tech_stack, /ci\/cd|cicd|jenkins|github actions/i)) candidates.add('cicd_builder')

        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        const { count: recentMilestones } = await supabase
            .from('milestone_progress')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('status', 'completed')
            .gte('completed_at', weekAgo)
        if ((recentMilestones ?? 0) >= 3) candidates.add('streak_3')

        if (candidates.size === 0) return []

        const rows = Array.from(candidates).map((achievement) => ({
            user_id: userId,
            achievement,
            label: ACHIEVEMENT_LABELS[achievement],
            roadmap_id: roadmap.id,
        }))

        const { data, error } = await supabase
            .from('user_achievements')
            .upsert(rows, { onConflict: 'user_id,achievement', ignoreDuplicates: true })
            .select('achievement, label')

        if (error) {
            console.warn('[achievements] upsert failed:', error.message)
            return []
        }
        return (data ?? []) as EarnedAchievement[]
    } catch (err) {
        console.warn('[achievements] evaluation threw:', err)
        return []
    }
}
