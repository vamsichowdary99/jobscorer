//
// Trim with AI (One-Page Optimizer) — pure logic. See
// docs/superpowers/specs/2026-07-24-trim-with-ai-design.md for the full
// design. This module has no network/React dependency so it's unit-testable
// in isolation: building the prompt, validating+parsing the model's raw JSON
// reply, and splicing accepted changes back into ResumeEditorState.

import type { ResumeEditorState } from '../types.ts'
import { validateProposedText, type MetricSource } from './validator.ts'

export interface TrimExperienceChange {
    index: number
    company: string
    before: string[]
    after: string[]
}

export interface TrimProjectChange {
    index: number
    name: string
    before: string[]
    after: string[]
    demoted: boolean
}

export interface TrimChanges {
    summary?: { before: string; after: string }
    experience: TrimExperienceChange[]
    projects: TrimProjectChange[]
    certifications?: { before: string[]; after: string[] }
}

export function isTrimEmpty(changes: TrimChanges): boolean {
    return !changes.summary && !changes.certifications && changes.experience.length === 0 && changes.projects.length === 0
}

// Kept as the ENTIRE system message — never mixed with the mutable resume
// state or job context — so it's a byte-identical prefix on every single
// call to this endpoint, across every user/resume/job. This is the ONLY
// content in this feature that's guaranteed invariant call-to-call; OpenAI's
// automatic prompt-cache only reuses a prefix match starting at position 0,
// so this text MUST come first (as the system message) to ever get cached —
// it previously lived at the END of the user prompt (after the resume JSON),
// where it could never benefit from caching no matter how many times the
// endpoint was called. Same pattern already established in the chat route's
// SYSTEM_PROMPT (src/app/api/resume-edit/chat/route.ts).
export const TRIM_SYSTEM_PROMPT = `You condense resumes to fit a page target for a job application tool ("Trim with AI" in the Resume Studio One-Page Optimizer). Never add or remove whole experience/project entries — only tighten content within them. Always return valid JSON matching the requested shape exactly.

Rules:
1. Experience entries with 5+ bullets: condense to 2-3 bullets by merging/tightening, not just shortening each line. Entries with 4 or fewer bullets: leave alone unless a specific bullet is clearly redundant.
2. If there are 4+ projects: judge which are most relevant to the given job using its description, keep ~2 with full bullets (2 each is typical), and demote the rest to name-only by returning an empty bullets array for them. Never remove a project entirely — only its bullets.
3. If there are 4+ certifications: trim the list down to the most relevant ones for the given job.
4. Only touch the summary if it's clearly redundant with tightened experience bullets.
5. NEVER invent a number, percentage, dollar amount, or duration that isn't already in the resume you're given. If you can't verify a metric, rewrite the line qualitatively without one.
6. Only include a field in your JSON output if you're actually changing it. Do not repeat unchanged entries.

Return JSON exactly in this shape (all fields optional, omit anything unchanged):
{
  "summary": "new summary text",
  "experience": [{ "index": 0, "bullets": ["new bullet 1", "new bullet 2"] }],
  "projects": [{ "index": 2, "bullets": [] }],
  "certifications": ["Cert A", "Cert B"]
}`

/** The user-message prompt sent to gpt-4.1-mini — only the mutable, per-call content. Kept as a pure string builder so it's testable without a network call. */
export function buildTrimPrompt(
    state: ResumeEditorState,
    jobTitle: string,
    jobDescription: string,
    currentPages: number,
    pageTarget: number,
): string {
    return `This tailored resume is ${currentPages} page(s), target is ${pageTarget} page(s). Condense it to fit.

Target job: ${jobTitle}
Job description excerpt:
${jobDescription.slice(0, 2000)}

Resume (JSON):
${JSON.stringify(state)}`
}

interface RawTrimExperience { index?: unknown; bullets?: unknown }
interface RawTrimProject { index?: unknown; bullets?: unknown }
interface RawTrimResponse {
    summary?: unknown
    experience?: unknown
    projects?: unknown
    certifications?: unknown
}

function validateBullet(text: string, state: ResumeEditorState, userMessages: string[], evidenceTexts: string[]): boolean {
    // Trim with AI has no live conversation, but threads userMessages/evidenceTexts
    // through anyway (rather than ignoring the params) so this stays consistent
    // with validateProposedText's real contract — callers today pass [] for both
    // since this route has neither, but the plumbing is honest, not a stub.
    const result = validateProposedText(text, { editorState: state, userMessages, evidenceTexts }, [] as MetricSource[])
    return result.ok
}

/**
 * Validates and normalizes the model's raw JSON reply against live state.
 * Any changed bullet/summary/cert-list that fails the hallucination guard is
 * dropped (the whole surrounding change for that entry is dropped, not just
 * the failing line, since a partially-condensed bullet list would be
 * confusing to show) — the caller falls back to the original, untouched text.
 */
export function parseTrimResponse(
    raw: unknown,
    state: ResumeEditorState,
    userMessages: string[],
    evidenceTexts: string[],
): TrimChanges {
    const r = (raw ?? {}) as RawTrimResponse
    const changes: TrimChanges = { experience: [], projects: [] }
    const ok = (text: string) => validateBullet(text, state, userMessages, evidenceTexts)

    if (Array.isArray(r.experience)) {
        for (const item of r.experience as RawTrimExperience[]) {
            if (typeof item?.index !== 'number' || !Array.isArray(item.bullets)) continue
            const entry = state.experience[item.index]
            if (!entry) continue
            const bullets = item.bullets.filter((b): b is string => typeof b === 'string' && b.trim() !== '')
            if (bullets.length === 0) continue // experience entries are never demoted to name-only, only projects are
            if (!bullets.every(ok)) continue
            if (JSON.stringify(bullets) === JSON.stringify(entry.bullets)) continue
            changes.experience.push({ index: item.index, company: entry.company, before: entry.bullets, after: bullets })
        }
    }

    if (Array.isArray(r.projects)) {
        for (const item of r.projects as RawTrimProject[]) {
            if (typeof item?.index !== 'number' || !Array.isArray(item.bullets)) continue
            const entry = state.projects[item.index]
            if (!entry) continue
            const bullets = item.bullets.filter((b): b is string => typeof b === 'string' && b.trim() !== '')
            if (bullets.length > 0 && !bullets.every(ok)) continue
            if (JSON.stringify(bullets) === JSON.stringify(entry.bullets)) continue
            changes.projects.push({ index: item.index, name: entry.name, before: entry.bullets, after: bullets, demoted: bullets.length === 0 })
        }
    }

    if (Array.isArray(r.certifications)) {
        // Design intent is thinning the list, not rewriting entries — every
        // returned cert must already be verbatim on the resume, or the whole
        // change is dropped (same "drop the whole thing, not just the bad
        // line" convention as experience/project bullets above). This closes
        // the one AI-authored path that otherwise bypassed validateProposedText
        // entirely — a model could otherwise return a fabricated cert string
        // with an invented number.
        const list = r.certifications.filter((c): c is string => typeof c === 'string')
        const allExisting = list.every(c => state.certifications.includes(c))
        if (allExisting && JSON.stringify(list) !== JSON.stringify(state.certifications)) {
            changes.certifications = { before: state.certifications, after: list }
        }
    }

    if (typeof r.summary === 'string' && r.summary.trim() !== '' && r.summary !== state.summary) {
        if (ok(r.summary)) {
            changes.summary = { before: state.summary, after: r.summary }
        }
    }

    return changes
}

/** Splices accepted changes into a NEW ResumeEditorState. Never mutates `state` — same convention as apply.ts. */
export function applyTrimChanges(state: ResumeEditorState, changes: TrimChanges): ResumeEditorState {
    let next = state

    if (changes.experience.length > 0) {
        const byIndex = new Map(changes.experience.map(c => [c.index, c.after]))
        next = { ...next, experience: next.experience.map((entry, i) => byIndex.has(i) ? { ...entry, bullets: byIndex.get(i)! } : entry) }
    }
    if (changes.projects.length > 0) {
        const byIndex = new Map(changes.projects.map(c => [c.index, c.after]))
        next = { ...next, projects: next.projects.map((entry, i) => byIndex.has(i) ? { ...entry, bullets: byIndex.get(i)! } : entry) }
    }
    if (changes.certifications) {
        next = { ...next, certifications: changes.certifications.after }
    }
    if (changes.summary) {
        next = { ...next, summary: changes.summary.after }
    }

    return next
}
