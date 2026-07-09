import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUserLimit } from '@/lib/rate-limit'
import { editorStateToOptimizedData, normalizeOptimizedData } from '@/lib/resume-edit/mapping'
import type { ResumeEditorState, ResumeEditHistoryEntry } from '@/lib/types'

const EDIT_HISTORY_CAP = 50
const EDIT_SOURCES = new Set(['ai', 'manual', 'undo'])

type EditEntryInput = Omit<ResumeEditHistoryEntry, 'at'>

/**
 * PATCH /api/optimized-resumes/[id]
 * Persists Resume Studio edits (manual section saves, AI-applied proposals,
 * undo) — Plan 21 Phase 1. Full-document write of `optimized_data` plus an
 * appended, capped `edit_history` entry. Optimistic-lock lite via
 * `expected_updated_at` (covers two open tabs).
 */
export async function PATCH(
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rl = await requireUserLimit(user.id, 'resume')
    if (rl) return rl

    const { id } = await ctx.params
    if (!id) {
        return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    let body: { editor_state?: ResumeEditorState; edit_entry?: EditEntryInput; expected_updated_at?: string }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { editor_state, edit_entry, expected_updated_at } = body
    if (!editor_state || typeof editor_state !== 'object') {
        return NextResponse.json({ error: 'editor_state is required' }, { status: 400 })
    }
    if (edit_entry && (typeof edit_entry.section !== 'string' || !EDIT_SOURCES.has(edit_entry.source))) {
        return NextResponse.json({ error: 'edit_entry.section and edit_entry.source (ai|manual|undo) are required' }, { status: 400 })
    }

    // Cast to any: the hand-written Database type collapses this table's query
    // builder to `never` otherwise (same workaround as resume/update-structured/route.ts).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any
    const { data: row, error: fetchErr } = await sb
        .from('optimized_resumes')
        .select('id, optimized_data, edit_history, updated_at')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle()

    if (fetchErr) {
        return NextResponse.json({ error: fetchErr.message }, { status: 500 })
    }
    if (!row) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (expected_updated_at && expected_updated_at !== row.updated_at) {
        return NextResponse.json({ stale: true, updated_at: row.updated_at }, { status: 409 })
    }

    let optimized_data
    try {
        const existing = normalizeOptimizedData(row.optimized_data)
        optimized_data = editorStateToOptimizedData(editor_state, existing)
    } catch {
        return NextResponse.json({ error: 'Malformed editor_state' }, { status: 400 })
    }

    const history: ResumeEditHistoryEntry[] = Array.isArray(row.edit_history) ? row.edit_history : []
    const edit_history = edit_entry
        ? [...history, { ...edit_entry, at: new Date().toISOString() }].slice(-EDIT_HISTORY_CAP)
        : history

    const updated_at = new Date().toISOString()
    const { error: updateErr } = await sb
        .from('optimized_resumes')
        .update({ optimized_data, edit_history, updated_at })
        .eq('id', id)
        .eq('user_id', user.id)

    if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({ updated_at })
}
