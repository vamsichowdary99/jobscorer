// One-Page Optimizer (plans/25 Phase 5) — ranks the movable sections of a
// TAILORED resume by how little they'd cost to hide, using only signals that
// already exist elsewhere in the app (no new scoring engine, no LLM call):
//   - ats_keywords: {term, weight, variants[]} cached on optimized_resumes
//   - matched_skills[].evidence: which resume item a matched skill came from
//   - gaps[].adjacent_from + score_impact: partial credit a gap is already
//     getting from some resume section
//
// Only ever called against a tailored (job_id-scoped) resume — the master
// resume's structured_data is never read or written here.

import type { ResumeEditorState, JobGap, MatchedSkillEvidence } from '@/lib/types'
import type { AtsKeyword } from './coverage'

export interface SectionTrimSuggestion {
    key: string
    score: number
    reason: string
}

const TRIMMABLE_KEYS = ['education', 'experience', 'projects', 'skills', 'certifications', 'achievements', 'leadership']

// A pure keyword-count score treats every section as an equally-weighted bag
// of terms, which is wrong: Experience and Projects are structurally the
// highest-value content on a resume even when their raw keyword count is no
// higher than the Skills list restating the same terms. This bonus is added
// to the ranking score (not shown to the user, and not part of the honest
// per-section keyword/evidence reason text below) so Education/Certifications/
// Achievements/Leadership are exhausted as trim candidates well before
// Experience or Projects ever would be, without hard-excluding either.
const SECTION_PRIORITY: Record<string, number> = {
    experience: 100,
    projects: 60,
    skills: 20,
    certifications: 5,
    achievements: 5,
    leadership: 5,
    education: 0,
}

/** Plain text for a single movable section — mirrors atsText.ts's per-section shape. */
function sectionText(state: ResumeEditorState, key: string): string {
    switch (key) {
        case 'education':
            return state.education.map(e => [e.school, e.degree, e.coursework].filter(Boolean).join(' ')).join(' ')
        case 'experience':
            return state.experience.map(e => [e.company, e.title, ...e.bullets].filter(Boolean).join(' ')).join(' ')
        case 'projects':
            return state.projects.map(p => [p.name, p.tech, ...p.bullets].filter(Boolean).join(' ')).join(' ')
        case 'skills':
            return [state.skills.languages, state.skills.tools, state.skills.frameworks, state.skills.soft].filter(Boolean).join(' ')
        case 'certifications':
            return state.certifications.join(' ')
        case 'achievements':
            return state.achievements.join(' ')
        case 'leadership':
            return state.leadership.map(l => [l.org, l.role, ...l.bullets].filter(Boolean).join(' ')).join(' ')
        default:
            return ''
    }
}

function isEmpty(state: ResumeEditorState, key: string): boolean {
    switch (key) {
        case 'education': return state.education.length === 0
        case 'experience': return state.experience.length === 0
        case 'projects': return state.projects.length === 0
        case 'skills': return !state.skills.languages && !state.skills.tools && !state.skills.frameworks && !state.skills.soft
        case 'certifications': return state.certifications.length === 0
        case 'achievements': return state.achievements.length === 0
        case 'leadership': return state.leadership.length === 0
        default: return true
    }
}

/**
 * Ranks visible, non-empty movable sections from safest-to-hide (lowest
 * score) to most-costly. `order`/`hidden` scope the ranking to sections the
 * user can actually still trim (already-hidden ones are skipped).
 */
export function rankSectionsForTrim(
    state: ResumeEditorState,
    order: string[],
    hidden: string[],
    atsKeywords: AtsKeyword[],
    matchedSkills: Array<MatchedSkillEvidence | string> | null | undefined,
    gaps: JobGap[] | null | undefined,
): SectionTrimSuggestion[] {
    const candidates = order.filter(k => TRIMMABLE_KEYS.includes(k) && !hidden.includes(k) && !isEmpty(state, k))

    const evidenceList = (matchedSkills ?? []).filter((m): m is MatchedSkillEvidence => typeof m === 'object' && !!m?.evidence)
    const adjacentGaps = (gaps ?? []).filter(g => g.has_adjacent_evidence && g.adjacent_from)

    return candidates
        .map((key) => {
            const text = sectionText(state, key).toLowerCase()
            if (!text) return { key, score: SECTION_PRIORITY[key] ?? 0, reason: 'Empty of any job-relevant content — safest to trim first.' }

            let keywordPoints = 0
            for (const kw of atsKeywords) {
                const terms = [kw.term, ...(kw.variants ?? [])].filter(Boolean)
                if (terms.some(t => text.includes(t.toLowerCase()))) keywordPoints += kw.weight
            }

            const evidenceHits = evidenceList.filter(m => text.includes(m.evidence.toLowerCase())).length

            let gapCredit = 0
            for (const gap of adjacentGaps) {
                if (gap.adjacent_from && text.includes(gap.adjacent_from.toLowerCase())) {
                    gapCredit += gap.score_impact ?? 3
                }
            }

            const score = keywordPoints + evidenceHits * 5 + gapCredit + (SECTION_PRIORITY[key] ?? 0)

            const parts: string[] = []
            if (keywordPoints > 0) parts.push(`${keywordPoints} keyword point${keywordPoints === 1 ? '' : 's'}`)
            if (evidenceHits > 0) parts.push(`${evidenceHits} matched-skill${evidenceHits === 1 ? '' : 's'}`)
            if (gapCredit > 0) parts.push(`partial credit on ${gapCredit} gap point${gapCredit === 1 ? '' : 's'}`)
            const reason = parts.length === 0
                ? 'No matching keywords or evidence found here for this job — safest to trim first.'
                : `Contributes ${parts.join(' + ')} toward this match — trimming costs the least here of your visible sections.`

            return { key, score, reason }
        })
        .sort((a, b) => a.score - b.score)
}
