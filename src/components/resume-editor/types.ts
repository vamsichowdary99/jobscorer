// resuscore/src/components/resume-editor/types.ts
import type { ResumeEditorState } from '@/lib/types'

export type ProposalBadge = 'message' | 'project' | 'ai'

export interface ProposalTarget {
    section: 'summary' | 'experience' | 'projects' | 'skills'
    index?: number          // experience[index] / projects[index]
    bulletIndex?: number    // experience[index].bullets[bulletIndex] / projects[index].bullets[bulletIndex]
    skillsField?: 'languages' | 'tools' | 'frameworks' | 'soft'
}

export interface Proposal {
    id: string
    target: ProposalTarget
    sectionLabel: string   // e.g. "Experience → TechNexus Solutions · Bullet 1"
    badge: ProposalBadge
    before: string
    after: string
    why: string
    est: number             // coverage delta, shown as "est. +N"
    auditId: string | null
}

export interface AuditItem {
    id: string
    text: string
    score: number
    done: boolean
}

export interface AssistantButton {
    label: string
    sendText: string
}

export type AssistantEvent =
    | { type: 'text_delta'; delta: string }
    | { type: 'proposal_pending' }
    | { type: 'proposal'; proposal: Proposal }
    | { type: 'buttons'; buttons: AssistantButton[] }
    | { type: 'done' }

export interface AssistantAdapter {
    send(text: string, state: ResumeEditorState): AsyncGenerator<AssistantEvent>
}

// ── Live-preview decorations ────────────────────────────────
export type DecorationKind =
    | { kind: 'ghost'; text: string }
    | { kind: 'amber' }
    | { kind: 'flash' }

// Keyed by `${section}:${index ?? ''}:${bulletIndex ?? ''}`, e.g. "summary::",
// "experience:0:1", "projects:0:0". See PreviewDecorations.tsx#decorationKey.
export type DecorationsMap = Map<string, DecorationKind>
