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

/**
 * Cached on optimized_resumes.trim_cache — one entry per template id (see
 * TrimCacheByTemplate below). `applied` distinguishes "this generation is
 * cached server-side" (true for every generation, regardless of whether the
 * user has reviewed it yet — cheap, avoids re-paying OpenAI for an unchanged
 * re-request) from "the user clicked Apply and this should actually be
 * rendered" (only true after that click). A Cancel in TrimReviewPanel leaves
 * applied false forever for that generation.
 */
export interface TrimCache {
    fingerprint: string
    changes: TrimChanges
    cachedAt: string
    applied: boolean
}

/**
 * trim_cache column shape. Was a single TrimCache | null before
 * template-scoped trim (plans/27) — trimming an overflowing template used to
 * shorten the shared resume content for every template. Now each template
 * gets its own independent cached result, so trimming one template can never
 * affect how a different template renders.
 */
export type TrimCacheByTemplate = Partial<Record<string, TrimCache>>

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

/**
 * The single rule for whether a template's cached trim should actually be
 * layered into its render: the entry must exist, the user must have clicked
 * Apply for it (not just generated-but-cancelled-or-unreviewed), and the
 * fingerprint must still match the resume's current content (otherwise the
 * resume changed since this trim was computed and it's stale).
 */
export function getActiveTrim(
    trimCacheByTemplate: TrimCacheByTemplate | null | undefined,
    templateId: string,
    fingerprint: string,
): TrimChanges | null {
    const entry = trimCacheByTemplate?.[templateId]
    if (!entry || !entry.applied || entry.fingerprint !== fingerprint) return null
    return entry.changes
}
