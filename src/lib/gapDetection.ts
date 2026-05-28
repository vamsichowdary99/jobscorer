import type { SupabaseClient } from '@supabase/supabase-js'
import type { ParsedResume } from '@/lib/types'

export interface GapAnalysis {
    missingFromResume: string[]   // sections absent from parsed resume
    alreadyAnswered: string[]     // sections user already filled or skipped
    toAsk: string[]               // missingFromResume minus alreadyAnswered
}

/**
 * Determines which gap form sections to show the user.
 * Always checks certifications, achievements, and leadership (freshers rarely have these in parsed resumes).
 * Checks projects and links from parsed resume data.
 */
export async function detectGaps(
    resumeId: string,
    userId: string,
    parsedResume: ParsedResume | null,
    supabase: SupabaseClient
): Promise<GapAnalysis> {
    // Determine which sections are missing from the parsed resume
    const missingFromResume: string[] = []

    // Always ask about certifications (not in ParsedResume schema)
    missingFromResume.push('certifications')

    // Always ask about achievements (not in ParsedResume schema)
    missingFromResume.push('achievements')

    // Check if user has projects
    if (!parsedResume?.projects?.length) {
        missingFromResume.push('projects')
    }

    // Check if user has links (linkedin/github in personal_info)
    const rawResume = parsedResume as any
    const hasLinkedIn = !!(rawResume?.personal_info?.linkedin)
    const hasGitHub = !!(rawResume?.personal_info?.github)
    if (!hasLinkedIn && !hasGitHub) {
        missingFromResume.push('links')
    }

    // Always ask about leadership for freshers
    missingFromResume.push('leadership')

    // Find which sections the user has already responded to
    const { data: priorResponses } = await supabase
        .from('gap_form_responses')
        .select('section_name, was_skipped')
        .eq('user_id', userId)
        .eq('resume_id', resumeId)

    const alreadyAnswered = (priorResponses ?? []).map((r: any) => r.section_name)

    const toAsk = missingFromResume.filter(section => !alreadyAnswered.includes(section))

    return { missingFromResume, alreadyAnswered, toAsk }
}
