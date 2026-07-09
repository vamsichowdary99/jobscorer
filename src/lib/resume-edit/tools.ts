import { createServerSupabase } from '@/lib/chat/supabase-server'
import type { ResumeEditorState } from '@/lib/types'
import type { Proposal, ProposalTarget, ProposalBadge } from '@/components/resume-editor/types'
import { readProposalTarget } from '@/lib/resume-edit/apply'
import { validateProposedText, buildRejectionPayload, type MetricSource } from './validator'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSupabase() { return createServerSupabase() as any }

export interface EditorToolContext {
    optimizedResumeId: string | null
    editorState: ResumeEditorState
    userMessages: string[]
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
            return proposeEdit(args, ctx)
        case 'get_job_context':
            return getJobContext(userId, ctx.optimizedResumeId)
        case 'get_match_details':
            return getMatchDetails(userId, ctx.optimizedResumeId)
        case 'get_ats_keywords':
            return getAtsKeywords(userId, ctx.optimizedResumeId)
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

/** No project_evidence source yet (Phase 3) — this is the 3-badge subset PillBadge already renders. */
function deriveSourceBadge(metricSources: MetricSource[]): ProposalBadge {
    if (metricSources.length === 0) return 'ai'
    if (metricSources.some(s => s.source === 'user_message')) return 'message'
    return 'project'
}

/**
 * The one write tool — proposes, never applies (architecture doc §1). Shape
 * validation is hand-rolled (not zod — this repo doesn't declare zod as a
 * direct dependency; see Phase 2 report) but returns the same
 * `{error:'invalid_shape'}` contract the doc specifies.
 */
function proposeEdit(args: Record<string, unknown>, ctx: EditorToolContext): string {
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

    const metricSources: MetricSource[] = Array.isArray(args.metric_sources)
        ? (args.metric_sources as MetricSource[]).filter(s =>
            s && typeof s.value === 'string' && typeof s.quote === 'string' && (s.source === 'original_resume' || s.source === 'user_message'))
        : []

    const validation = validateProposedText(newValue, { editorState: ctx.editorState, userMessages: ctx.userMessages }, metricSources)
    if (!validation.ok) {
        return JSON.stringify(buildRejectionPayload(validation.unverified))
    }

    const proposal: Proposal = {
        id: crypto.randomUUID(),
        target,
        sectionLabel: buildSectionLabel(ctx.editorState, target),
        badge: deriveSourceBadge(metricSources),
        before: readProposalTarget(ctx.editorState, target),
        after: newValue,
        why: typeof args.rationale === 'string' ? args.rationale : '',
        // Real coverage delta arrives in Phase 3 (computeKeywordCoverage) — flat
        // placeholder for now, same "fake numbers" state the mock UI shipped with.
        est: 2,
        auditId: null,
    }

    return JSON.stringify({ type: 'edit_proposal', proposal })
}
