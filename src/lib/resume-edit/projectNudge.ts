// Project-Evidence Integration (plans/25 Phase 6) — surfaces a completed
// AI-coached project as a resume swap-in when it closes a gap THIS job
// actually has. Reuses the same keyword/evidence signals as the One-Page
// Optimizer (Phase 5, budgetOptimizer.ts) — no new scoring engine.
//
// Only ever proposes a change to the CURRENT editor state (a tailored
// resume's in-memory ResumeEditorState) — the caller is responsible for
// persisting via the existing manual-edit path, same as any other content
// edit. The master resume is never read or written here.

import type { ResumeEditorState, ProjectEntry, JobGap, MatchedSkillEvidence, ProjectEvidence } from '@/lib/types'
import type { AtsKeyword } from './coverage'

export interface ProjectSwapNudge {
    candidate: ProjectEvidence
    weakestExisting: { index: number; name: string } | null
    matchedGapSkills: string[]
    reason: string
}

function projectEntryText(p: ProjectEntry): string {
    return [p.name, p.tech, ...p.bullets].filter(Boolean).join(' ').toLowerCase()
}

function scoreAgainstJob(
    text: string,
    atsKeywords: AtsKeyword[],
    matchedSkills: Array<MatchedSkillEvidence | string> | null | undefined,
): number {
    let score = 0
    for (const kw of atsKeywords) {
        const terms = [kw.term, ...(kw.variants ?? [])].filter(Boolean)
        if (terms.some(t => text.includes(t.toLowerCase()))) score += kw.weight
    }
    const evidenceList = (matchedSkills ?? []).filter(
        (m): m is MatchedSkillEvidence => typeof m === 'object' && !!m?.evidence,
    )
    score += evidenceList.filter(m => text.includes(m.evidence.toLowerCase())).length * 5
    return score
}

/**
 * Finds a completed project worth swapping into a tailored resume's Projects
 * section. A candidate only qualifies if it addresses a skill this specific
 * job's gaps list actually names — never suggested just because it's new.
 */
export function findProjectSwapNudge(
    state: ResumeEditorState,
    confirmedProjects: ProjectEvidence[],
    jobGaps: JobGap[] | null | undefined,
    atsKeywords: AtsKeyword[],
    matchedSkills: Array<MatchedSkillEvidence | string> | null | undefined,
): ProjectSwapNudge | null {
    const existingNames = new Set(state.projects.map(p => p.name.trim().toLowerCase()).filter(Boolean))
    const gapSkills = new Set((jobGaps ?? []).map(g => g.skill.toLowerCase()))

    const candidates = confirmedProjects
        .filter(p => p.resume_bullet && !existingNames.has(p.project_name.trim().toLowerCase()))
        .map(p => ({
            project: p,
            matchedGapSkills: p.gaps_addressed.filter(s => gapSkills.has(s.toLowerCase())),
        }))
        .filter(c => c.matchedGapSkills.length > 0)
        .sort((a, b) =>
            (b.matchedGapSkills.length - a.matchedGapSkills.length)
            || ((b.project.score_impact ?? 0) - (a.project.score_impact ?? 0)),
        )

    const top = candidates[0]
    if (!top) return null

    let weakestExisting: { index: number; name: string } | null = null
    if (state.projects.length > 0) {
        const scored = state.projects.map((p, index) => ({
            index,
            name: p.name || `Project ${index + 1}`,
            score: scoreAgainstJob(projectEntryText(p), atsKeywords, matchedSkills),
        }))
        scored.sort((a, b) => a.score - b.score)
        weakestExisting = { index: scored[0].index, name: scored[0].name }
    }

    const skillsList = top.matchedGapSkills.join(', ')
    const reason = weakestExisting
        ? `Addresses ${skillsList} for this role — more relevant than "${weakestExisting.name}".`
        : `Addresses ${skillsList} for this role.`

    return { candidate: top.project, weakestExisting, matchedGapSkills: top.matchedGapSkills, reason }
}
