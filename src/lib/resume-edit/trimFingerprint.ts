//
// Server-only. Kept separate from trimToFit.ts (which resumes/page.tsx
// imports client-side for applyTrimChanges/isTrimEmpty/getActiveTrim) because
// this file needs node:crypto — a real (non-type) client-side import of a
// module with a top-level node:crypto import breaks the production webpack
// build regardless of which export is actually used (webpack must build the
// whole module before tree-shaking can run). Only
// src/app/api/resume-edit/trim-to-fit/route.ts (server-only) should ever
// import computeTrimFingerprint from here. TrimCache/TrimCacheByTemplate/
// getActiveTrim live in trimToFit.ts and are re-exported below for existing
// server-side callers of this file.

import { createHash } from 'node:crypto'
import type { ResumeEditorState } from '../types.ts'

export type { TrimCache, TrimCacheByTemplate } from './trimToFit.ts'
export { getActiveTrim } from './trimToFit.ts'

/**
 * Content-addresses a trim request so an identical repeat (same resume
 * content, same page counts) can skip the OpenAI call entirely and return
 * the prior result for free — no quota charge, no cost. Not a security
 * hash, just cheap content-addressing; self-invalidating (any real edit
 * changes the resume JSON, which changes the fingerprint, so there's no
 * separate cache-busting logic to maintain).
 */
export function computeTrimFingerprint(state: ResumeEditorState, currentPages: number, pageTarget: number): string {
    const raw = `${JSON.stringify(state)}|${currentPages}|${pageTarget}`
    return createHash('sha256').update(raw).digest('hex')
}
