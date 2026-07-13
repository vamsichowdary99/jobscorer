// resuscore/src/lib/resume-edit/persist.ts
'use client'
import type { ResumeEditorState, ResumeEditHistoryEntry } from '@/lib/types'

export type EditEntryInput = Omit<ResumeEditHistoryEntry, 'at'>

export type PersistResult =
    | { ok: true; updated_at: string }
    | { ok: false; stale: true; updated_at: string }
    | { ok: false; stale: false }

/** Fire this after every explicit user action (AI apply, undo, manual save) — one PATCH per action, no debounce. */
export async function persistEditorState(
    optimizedResumeId: string,
    editorState: ResumeEditorState,
    editEntry: EditEntryInput,
    expectedUpdatedAt: string | null,
): Promise<PersistResult> {
    try {
        const res = await fetch(`/api/optimized-resumes/${optimizedResumeId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ editor_state: editorState, edit_entry: editEntry, expected_updated_at: expectedUpdatedAt }),
        })
        if (res.status === 409) {
            const data = await res.json().catch(() => ({}))
            return { ok: false, stale: true, updated_at: data.updated_at }
        }
        if (!res.ok) return { ok: false, stale: false }
        const data = await res.json()
        return { ok: true, updated_at: data.updated_at }
    } catch (err) {
        console.error('[resume-edit] persist failed:', err)
        return { ok: false, stale: false }
    }
}
