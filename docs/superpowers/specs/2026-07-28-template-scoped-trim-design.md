# Template-Scoped Trim with AI — Design

**Date:** 2026-07-28
**Status:** Approved (user waived spec-file re-review; build directly)

## Problem

"Trim with AI" (see `docs/superpowers/specs/2026-07-24-trim-with-ai-design.md`) currently
shortens a resume's actual content (`editorState.experience[i].bullets`, etc.) and
saves that shortened content back onto the resume. But `editorState` is shared by
**every template** the resume can be rendered in (Classic, Rezi, Jade, ...) — page
count is a function of the template (fonts/spacing/layout differ), not just the
content.

This produces two related bugs (one already patched, one still open):

1. **Fixed this session**: switching to a *different resume* while a trim review was
   pending applied the wrong resume's trim to the wrong resume's data (stale
   `trimChanges` state, no longer possible after the reset-on-switch fix).
2. **This spec fixes**: even switching *templates on the same resume* is broken by
   design. Trimming while viewing an overflowing template (e.g. Rezi, 2 pages)
   permanently shortens the bullets for **every** template, including ones that
   already fit fine (e.g. Classic, 1 page, 5 bullets) — because there is only one
   copy of the content and trim mutates it directly.

## Design

**Core change: trim becomes a per-template rendering overlay, never a content mutation.**

- `editorState` (the actual resume content) is **never shortened by a trim again**.
  It stays the single full, untouched source of truth for every template,
  permanently. Classic keeps showing all 5 bullets no matter what happens on any
  other template.
- Trim results move from a single cached value to **one cached value per
  template**: `optimized_resumes.trim_cache` changes shape from
  `TrimCache | null` to `Partial<Record<TemplateId, TrimCache>> | null` — same
  JSONB column, keyed by template id.
- **Rendering applies the overlay live, not by mutation.** Wherever a template is
  rendered today (Live Preview, "What Recruiters See", Download PDF, the PDF used
  to measure Resume Budget) — if `trim_cache[currentTemplateId]` exists, its
  fingerprint still matches the current full `editorState`, **and `applied` is
  true**, that render computes `applyTrimChanges(editorState,
  trim_cache[currentTemplateId].changes)` on the fly, as a derived value.
  `editorState` itself is untouched; nothing is written back into it. A cached-but-
  not-yet-applied (or cancelled) generation is never layered into any render.
- **"Trim with AI" always targets the currently selected template.** Same button,
  same flow as today, but the API result is stored under `trim_cache[templateId]`
  instead of overwriting the single flat field.
- **Switching templates just changes which overlay (if any) is layered on for
  that render.** No data loss, no cross-contamination — there is no shared
  mutable copy left to leak between templates.
- **"Apply" in `TrimReviewPanel` no longer edits `editorState`.** The generation
  is already cached server-side as soon as it comes back from OpenAI (same as
  today); clicking "Apply" just flips that cache entry's `applied` flag to
  `true`, and the currently-viewed template immediately starts rendering with
  the overlay. "Cancel" leaves `applied: false` — the generation stays cached
  (so re-opening the review later, or re-clicking "Trim with AI" with unchanged
  content, is still a free cache hit) but never affects any render.

### Cost behavior (why this doesn't cost more)

Per-template caching preserves the existing "skip duplicate generation" cache
behavior end to end: revisiting a template you already trimmed (same session or a
future one) is a fingerprint hit — reuses the saved overlay for free, no repeat
OpenAI call. Only a template you haven't trimmed yet, or one whose underlying
content has since changed, triggers a new paid call. This is strictly no worse
than today's single-slot cache, just addressed by template id in addition to
content fingerprint.

### Data migration

Existing `trim_cache` rows are a single flat `TrimCache` object with no template
association, and we cannot reliably attribute them to whichever template happened
to be active when they were written. Given this is pre-launch data (per
`CLAUDE.md`'s "less defensive feature-flagging is fine" convention), the migration
does **not** attempt to preserve old cache entries — it just clears the column and
starts writing the new per-template shape going forward. Worst case: one user
re-pays for one trim generation on their next visit to a template they'd already
trimmed before this change shipped.

### What does NOT change

- The trim generation API (`/api/resume-edit/trim-to-fit`), the OpenAI prompt, the
  hallucination-guard validation (`parseTrimResponse`), and `TrimChanges`'s shape
  are all unchanged — this is purely about *where the result is stored* and *how
  it's applied at render time*.
- Resume Budget's page-count measurement is already template-aware (it renders
  through `loadPdfRenderer(templateId)`) — no change needed there beyond reading
  the effective (overlay-applied) state instead of raw `editorState` when a trim
  exists for the current template.
- Section hide/reorder (`layout.hiddenSections`/`sectionOrder`) stays resume-wide,
  not template-scoped — out of scope, not what was reported as broken.

## Data Model

```ts
// src/lib/resume-edit/trimFingerprint.ts
export interface TrimCache {
    fingerprint: string
    changes: TrimChanges
    cachedAt: string
    // Whether the user actually clicked "Apply" for this generation, vs. it
    // just being cached server-side (every generation is cached immediately,
    // regardless of accept/cancel, so a re-click of "Trim with AI" with
    // unchanged content is always a free cache hit — but only an applied
    // cache should ever be layered into rendering). Defaults to false on a
    // fresh generation; flips to true only when the user clicks Apply in
    // TrimReviewPanel; a Cancel leaves it false, so the generation stays
    // cached (cheap to re-review later) but never affects any render.
    applied: boolean
}

// New: optimized_resumes.trim_cache is now keyed by template id.
export type TrimCacheByTemplate = Partial<Record<string, TrimCache>>
```

Migration: no schema change needed (`trim_cache` is already `jsonb`) — just clear
existing values (`UPDATE optimized_resumes SET trim_cache = NULL`) so old
single-shape rows aren't misread as the new per-template shape.

## API Changes

`POST /api/resume-edit/trim-to-fit` request body gains a required `templateId:
string` field. The route:
- Reads `trim_cache` as `TrimCacheByTemplate`, checks
  `trim_cache?.[templateId]?.fingerprint` against the computed fingerprint (same
  fingerprint logic as today — content + page counts, unchanged).
- On a fingerprint hit, returns the cached entry as-is (including whatever
  `applied` currently holds) — free, no OpenAI call, same as today.
- On a fresh generation, writes back `{ ...existingTrimCacheByTemplate,
  [templateId]: { ...newCache, applied: false } }` (merge, not overwrite — so
  trimming Template B doesn't clobber an existing cached trim for Template A).

New tiny endpoint (or an extra field on an existing PATCH-style route, whichever
fits the codebase's existing conventions better at implementation time):
`POST /api/resume-edit/trim-to-fit/apply` — body `{ optimizedResumeId,
templateId, applied: boolean }`, auth + ownership check, flips
`trim_cache[templateId].applied` in place. No OpenAI call, no fingerprint
recompute — purely a persisted UI decision.

## Frontend Changes (`src/app/dashboard/resumes/page.tsx`)

- `trimChanges` state becomes derived from `trim_cache[templateId]` for the
  *currently selected template*, not a bare pending-review value that gets
  spliced into `editorState`.
- A new derived value, `effectiveStateForTemplate` (or extending the existing
  `effectiveState` memo), applies the current template's cached trim (if any and
  if its fingerprint still matches) on top of `editorState` — this is what gets
  passed to the PDF renderer, the Live Preview, and the Resume Budget measurement
  effect, instead of raw `editorState`.
- `handleTrimWithAI` passes `templateId` in the request; `applyTrimWithAI` becomes
  "persist this template's overlay" (already done server-side on generation,
  actually — since the route saves on generation already per the existing
  pattern, "Apply" in the panel may simply mean "start rendering with it now,"
  i.e. closing the review panel and re-triggering the effective-state memo).
- Switching `selectedEntry` (already fixed) or switching `templateId` both simply
  change which cached overlay (if any) applies — no explicit reset code is needed
  for the cross-template case, because there is no mutation left to clean up.

## Testing

- `trimToFit.test.ts`: unchanged (parsing/validation logic is untouched).
- New unit coverage: a helper that applies a template-keyed cache lookup
  (fingerprint match/miss, missing entry for a template) returns the right
  before/after state without ever mutating the input `editorState`.
- Manual/live verification (post-build, since the user is testing after the
  fact): trim an overflowing template, confirm a different (already-fitting)
  template still shows full original bullets; confirm revisiting the trimmed
  template later doesn't re-charge (cache hit); confirm Download PDF for the
  trimmed template includes the trimmed bullets, and Download PDF for an
  untrimmed template includes the full ones.
