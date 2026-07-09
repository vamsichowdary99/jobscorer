// resuscore/src/lib/resume-edit/apply.ts
//
// Reads/writes a ResumeEditorState at a Proposal's target. Shared between the
// client (Accept/Undo in useAssistant.ts) and the server (propose_edit's
// `before` computation in tools.ts) — moved here from
// components/resume-editor/applyProposal.ts so both sides use the identical
// addressing logic instead of two copies that could drift.
import type { ResumeEditorState } from '@/lib/types'
import type { Proposal } from '@/components/resume-editor/types'

/** Reads the current text at a proposal's target from live editor state. */
export function readProposalTarget(state: ResumeEditorState, target: Proposal['target']): string {
    if (target.section === 'summary') return state.summary
    if (target.section === 'skills') {
        const field = target.skillsField ?? 'tools'
        return state.skills[field]
    }
    if (target.section === 'experience') {
        const entry = state.experience[target.index ?? 0]
        if (!entry) return ''
        return target.bulletIndex !== undefined ? (entry.bullets[target.bulletIndex] ?? '') : ''
    }
    if (target.section === 'projects') {
        const entry = state.projects[target.index ?? 0]
        if (!entry) return ''
        return target.bulletIndex !== undefined ? (entry.bullets[target.bulletIndex] ?? '') : ''
    }
    return ''
}

/**
 * Returns a NEW ResumeEditorState with `text` written at proposal.target.
 * Never mutates `state`. `text` defaults to proposal.after (Edit flow passes
 * the user's edited text instead).
 */
export function applyProposal(state: ResumeEditorState, proposal: Proposal, text?: string): ResumeEditorState {
    const value = text ?? proposal.after
    const { target } = proposal

    if (target.section === 'summary') {
        return { ...state, summary: value }
    }

    if (target.section === 'skills') {
        const field = target.skillsField ?? 'tools'
        return { ...state, skills: { ...state.skills, [field]: value } }
    }

    if (target.section === 'experience') {
        const idx = target.index ?? 0
        const bulletIdx = target.bulletIndex ?? 0
        const experience = state.experience.map((entry, i) => {
            if (i !== idx) return entry
            const bullets = entry.bullets.map((b, j) => (j === bulletIdx ? value : b))
            return { ...entry, bullets }
        })
        return { ...state, experience }
    }

    if (target.section === 'projects') {
        const idx = target.index ?? 0
        const bulletIdx = target.bulletIndex ?? 0
        const projects = state.projects.map((entry, i) => {
            if (i !== idx) return entry
            const bullets = entry.bullets.map((b, j) => (j === bulletIdx ? value : b))
            return { ...entry, bullets }
        })
        return { ...state, projects }
    }

    return state
}
