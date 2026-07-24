//
// Server-only. Kept separate from trimToFit.ts (which resumes/page.tsx
// imports client-side for applyTrimChanges/isTrimEmpty) specifically because
// this file needs node:crypto — bundling it into trimToFit.ts broke the
// production webpack build, since a real (non-type) client-side import of
// that module pulled node:crypto into the browser bundle. Only
// src/app/api/resume-edit/trim-to-fit/route.ts (server-only) should ever
// import from here.

import { createHash } from 'node:crypto'
import type { ResumeEditorState } from '../types.ts'
import type { TrimChanges } from './trimToFit.ts'

/** Cached on optimized_resumes.trim_cache — the last trim result, addressed by fingerprint. */
export interface TrimCache {
    fingerprint: string
    changes: TrimChanges
    cachedAt: string
}

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
