import { createServerSupabase } from '@/lib/chat/supabase-server'
import type { ResumeEditorState } from '@/lib/types'
import type { Proposal, ProposalTarget, ProposalBadge } from '@/components/resume-editor/types'
import { applyProposal, readProposalTarget } from '@/lib/resume-edit/apply'
import { computeKeywordCoverage, type AtsKeyword } from './coverage'
import { generateATSText } from './atsText'
import { validateProposedText, buildRejectionPayload, type MetricSource } from './validator'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSupabase() { return createServerSupabase() as any }

export interface EditorToolContext {
    optimizedResumeId: string | null
    editorState: ResumeEditorState
    userMessages: string[]
    // For propose_edit's real coverage-delta estimate (architecture doc §5 L1
    // applied to the diff-card "est. +N"). Empty until /api/resume-edit/keywords
    // has run for this artifact — est degrades honestly to 0, never a fake number.
    atsKeywords: AtsKeyword[]
}

// Cloned contract from src/lib/chat/tools.ts: service-role client, every query
// manually scoped with .eq('user_id', ...), errors returned as JSON strings.
export async function executeEditorTool(
    toolName: string,
    args: Record<string, unknown>,
    userId: string,
    ctx: EditorToolContext,
): Promise<string> {
    switch (toolName) {
        case 'propose_edit':
            return proposeEdit(args, userId, ctx)
        case 'get_job_context':
            return getJobContext(userId, ctx.optimizedResumeId)
        case 'get_match_details':
            return getMatchDetails(userId, ctx.optimizedResumeId)
        case 'get_ats_keywords':
            return getAtsKeywords(userId, ctx.optimizedResumeId)
        case 'get_user_evidence':
            return getUserEvidence(userId, typeof args.skill === 'string' ? args.skill : undefined)
        default:
            return JSON.stringify({ error: `Unknown tool: ${toolName}` })
    }
}

async function resolveOptimizedRow(userId: string, optimizedResumeId: string | null) {
    if (!optimizedResumeId) return null
    const { data } = await getSupabase()
        .from('optimized_resumes')
        .select('id, resume_id, job_id, ats_keywords')
        .eq('id', optimizedResumeId)
        .eq('user_id', userId)
        .maybeSingle()
    return data
}

async function getJobContext(userId: string, optimizedResumeId: string | null): Promise<string> {
    const row = await resolveOptimizedRow(userId, optimizedResumeId)
    if (!row?.job_id) return JSON.stringify({ error: 'No job is associated with this resume.' })

    const { data: job, error } = await getSupabase()
        .from('jobs')
        .select('title, company, location, description, required_skills')
        .eq('id', row.job_id)
        .maybeSingle()
    if (error) return JSON.stringify({ error: error.message })
    if (!job) return JSON.stringify({ error: 'Job not found.' })
    return JSON.stringify(job)
}

async function getMatchDetails(userId: string, optimizedResumeId: string | null): Promise<string> {
    const row = await resolveOptimizedRow(userId, optimizedResumeId)
    if (!row?.job_id || !row?.resume_id) return JSON.stringify({ error: 'No match found for this resume/job pair.' })

    const { data: match, error } = await getSupabase()
        .from('user_job_matches')
        .select('relevance_score, matched_skills, missing_skills, gaps, ai_reasoning')
        .eq('user_id', userId)
        .eq('job_id', row.job_id)
        .eq('resume_id', row.resume_id)
        .maybeSingle()
    if (error) return JSON.stringify({ error: error.message })
    if (!match) return JSON.stringify({ error: 'No AI match score found for this resume/job pair yet.' })
    return JSON.stringify(match)
}

async function getAtsKeywords(userId: string, optimizedResumeId: string | null): Promise<string> {
    const row = await resolveOptimizedRow(userId, optimizedResumeId)
    if (!row?.ats_keywords) {
        return JSON.stringify({ keywords: [], note: 'No ATS keywords have been extracted for this resume yet.' })
    }
    return JSON.stringify(row.ats_keywords)
}

/**
 * The entity-hallucination guard (architecture doc §1/§4): "Add Kubernetes" ->
 * agent must call this before adding an unverified skill/technology. Queries
 * project_evidence (polished proof-of-work) and completed project_roadmaps —
 * the user's REAL, verified JobScorer work — never resume text (that's what's
 * being edited, not evidence for it).
 */
async function getUserEvidence(userId: string, skill?: string): Promise<string> {
    const { data: evidence } = await getSupabase()
        .from('project_evidence')
        .select('project_name, tech_used, skills_demonstrated, resume_bullet, description, github_url, completed_at')
        .eq('user_id', userId)

    const { data: roadmaps } = await getSupabase()
        .from('project_roadmaps')
        .select('project_name, skills_covered, tech_stack, completed_at')
        .eq('user_id', userId)
        .eq('status', 'completed')

    let evidenceRows: Record<string, unknown>[] = evidence ?? []
    let roadmapRows: Record<string, unknown>[] = roadmaps ?? []

    if (skill) {
        const s = skill.toLowerCase()
        const hits = (arr: unknown) => Array.isArray(arr) && arr.some(v => typeof v === 'string' && v.toLowerCase().includes(s))
        evidenceRows = evidenceRows.filter(e => hits(e.tech_used) || hits(e.skills_demonstrated) || String(e.project_name ?? '').toLowerCase().includes(s))
        roadmapRows = roadmapRows.filter(r => hits(r.skills_covered) || hits(r.tech_stack) || String(r.project_name ?? '').toLowerCase().includes(s))
    }

    if (evidenceRows.length === 0 && roadmapRows.length === 0) {
        return JSON.stringify({
            evidence: [],
            completed_projects: [],
            note: skill
                ? `No verified evidence found for "${skill}". Do NOT add it to the resume as if it were demonstrated — offer to add it as a plain skill claim only if the user insists, or suggest starting a project/roadmap to build real evidence.`
                : 'No completed project evidence yet.',
        })
    }
    return JSON.stringify({ evidence: evidenceRows, completed_projects: roadmapRows })
}

/** Flattened evidence text for the validator's project_evidence source check — see proposeEdit. */
async function fetchEvidenceTexts(userId: string): Promise<string[]> {
    const { data } = await getSupabase()
        .from('project_evidence')
        .select('resume_bullet, description, architecture_summary')
        .eq('user_id', userId)
    if (!Array.isArray(data)) return []
    return data.flatMap((row: Record<string, unknown>) =>
        [row.resume_bullet, row.description, row.architecture_summary].filter((v): v is string => typeof v === 'string' && v.length > 0))
}

const VALID_SECTIONS = ['summary', 'skills', 'experience', 'projects'] as const
const VALID_SKILLS_FIELDS = ['languages', 'tools', 'frameworks', 'soft'] as const

function buildSectionLabel(state: ResumeEditorState, target: ProposalTarget): string {
    if (target.section === 'summary') return 'Summary'
    if (target.section === 'skills') return 'Technical Skills'
    if (target.section === 'experience') {
        const entry = state.experience[target.index ?? 0]
        return `Experience → ${entry?.company || 'Experience'} · Bullet ${(target.bulletIndex ?? 0) + 1}`
    }
    if (target.section === 'projects') {
        const entry = state.projects[target.index ?? 0]
        return `Projects → ${entry?.name || 'Project'} · Bullet ${(target.bulletIndex ?? 0) + 1}`
    }
    return ''
}

// Priority: an unverified skill claim overrides everything else — the user
// needs to see that warning regardless of what else is going on with the
// edit. Otherwise a user-typed number is the most concrete signal; evidence
// beats a bare "it's already on the resume" citation since it names actual proof.
function deriveSourceBadge(metricSources: MetricSource[], unverifiedSkill: boolean): ProposalBadge {
    if (unverifiedSkill) return 'unverified'
    if (metricSources.length === 0) return 'ai'
    if (metricSources.some(s => s.source === 'user_message')) return 'message'
    if (metricSources.some(s => s.source === 'project_evidence')) return 'evidence'
    return 'project'
}

const VALID_METRIC_SOURCES = new Set(['original_resume', 'user_message', 'project_evidence'])

/**
 * The one write tool — proposes, never applies (architecture doc §1). Shape
 * validation is hand-rolled (not zod — this repo doesn't declare zod as a
 * direct dependency; see Phase 2 report) but returns the same
 * `{error:'invalid_shape'}` contract the doc specifies.
 */
async function proposeEdit(args: Record<string, unknown>, userId: string, ctx: EditorToolContext): Promise<string> {
    const section = args.section as string
    if (!VALID_SECTIONS.includes(section as typeof VALID_SECTIONS[number])) {
        return JSON.stringify({ error: 'invalid_shape', message: `section must be one of ${VALID_SECTIONS.join('|')}` })
    }

    const newValue = args.new_value
    if (typeof newValue !== 'string' || newValue.trim() === '') {
        return JSON.stringify({ error: 'invalid_shape', message: 'new_value is required and must be a non-empty string' })
    }

    let target: ProposalTarget
    if (section === 'summary') {
        target = { section: 'summary' }
    } else if (section === 'skills') {
        const field = args.skills_field
        if (!VALID_SKILLS_FIELDS.includes(field as typeof VALID_SKILLS_FIELDS[number])) {
            return JSON.stringify({ error: 'invalid_shape', message: 'skills_field is required for section "skills" and must be one of languages|tools|frameworks|soft' })
        }
        target = { section: 'skills', skillsField: field as ProposalTarget['skillsField'] }
    } else {
        const index = args.index
        const bulletIndex = args.bullet_index
        if (typeof index !== 'number' || typeof bulletIndex !== 'number') {
            return JSON.stringify({ error: 'invalid_shape', message: `index and bullet_index are required (numbers) for section "${section}"` })
        }
        const entries = section === 'experience' ? ctx.editorState.experience : ctx.editorState.projects
        const entry = entries[index]
        if (!entry || entry.bullets[bulletIndex] === undefined) {
            return JSON.stringify({ error: 'invalid_shape', message: `No ${section} entry/bullet at index ${index}/${bulletIndex}` })
        }
        target = { section: section as 'experience' | 'projects', index, bulletIndex }
    }

    const unverifiedSkill = args.unverified_skill === true

    const metricSources: MetricSource[] = Array.isArray(args.metric_sources)
        ? (args.metric_sources as MetricSource[]).filter(s =>
            s && typeof s.value === 'string' && typeof s.quote === 'string' && VALID_METRIC_SOURCES.has(s.source))
        : []

    // Only fetch evidence when a proposal actually claims it — most edits never
    // cite project_evidence, so this stays a no-op DB call for the common case.
    const evidenceTexts = metricSources.some(s => s.source === 'project_evidence')
        ? await fetchEvidenceTexts(userId)
        : []

    const validation = validateProposedText(newValue, { editorState: ctx.editorState, userMessages: ctx.userMessages, evidenceTexts }, metricSources)
    if (!validation.ok) {
        return JSON.stringify(buildRejectionPayload(validation.unverified))
    }

    const before = readProposalTarget(ctx.editorState, target)
    // Real coverage-delta estimate (architecture doc §5 L1 applied to the diff
    // card): simulate the edit against the SAME keywords/text scoring used for
    // the live ScoreTicker, so "est. +N" is an honest number, not a guess.
    const simulated = applyProposal(ctx.editorState, { target } as Proposal, newValue)
    const beforeCoverage = computeKeywordCoverage(ctx.atsKeywords, generateATSText(ctx.editorState))
    const afterCoverage = computeKeywordCoverage(ctx.atsKeywords, generateATSText(simulated))

    const proposal: Proposal = {
        id: crypto.randomUUID(),
        target,
        sectionLabel: buildSectionLabel(ctx.editorState, target),
        badge: deriveSourceBadge(metricSources, unverifiedSkill),
        before,
        after: newValue,
        why: typeof args.rationale === 'string' ? args.rationale : '',
        est: afterCoverage - beforeCoverage,
        auditId: null,
    }

    return JSON.stringify({ type: 'edit_proposal', proposal })
}
