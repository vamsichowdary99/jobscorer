# Trim with AI — Design Spec

**Date:** 2026-07-24
**Status:** Approved by user, pending implementation plan
**Location:** Resume Studio (`resuscore/src/app/dashboard/resumes/page.tsx`), Layout tab, One-Page Optimizer panel

## Problem

The One-Page Optimizer (Layout tab) currently has exactly one move when a tailored resume is over its page target: hide a whole section (`OnePageOptimizerPanel`, ranked by `rankSectionsForTrim` in `src/lib/resume-edit/budgetOptimizer.ts`). This is blunt — a section with one genuinely valuable line gets deleted wholesale along with everything else in it, and the user loses content instead of tightening it.

The user wants a second option: let the AI condense the resume's *content* (fewer/shorter experience bullets, demote weaker projects to name-only, thin an overloaded certifications list) instead of hiding entire sections, so the resume shrinks to one page while keeping the substance.

## Key existing infrastructure (do not rebuild these)

- **Real page measurement** — `measureBudget()` (`src/lib/resume-edit/budget.ts`) renders the actual PDF client-side and reads true page count + last-page fill % via `pdfjs-dist`. No word-count guessing. Already wired into `resumes/page.tsx` via a 900ms-debounced `useEffect` keyed on `effectiveState` (~line 6452-6468 as of this spec).
- **Section-hide ranking** — `rankSectionsForTrim()` (`src/lib/resume-edit/budgetOptimizer.ts`) scores which whole sections are safest to hide using ATS keyword weight, matched-skill evidence, and gap credit. This stays as-is; Trim with AI is an *alternative*, not a replacement.
- **Resume Studio state model** — `ResumeEditorState` (`src/lib/types.ts:889`): `summary: string`, `experience: ExperienceEntry[]` (each with `bullets: string[]`), `projects: ProjectEntry[]` (each with `bullets: string[]`), `certifications: string[]`.
- **Manual-edit persistence path** — `saveManualEdit(section, before, after, nextState)` in `resumes/page.tsx` (~line 6484), which calls `persistEditorState` and updates `selectedEntry.updated_at`. Trim with AI writes through this exact path — it is NOT a new persistence mechanism.
- **Number-hallucination guard** — `validateProposedText()` (`src/lib/resume-edit/validator.ts`) checks that every %/$/number in a proposed string traces to the original resume, user messages, or verified project evidence. Reused per-string here.

## Explicitly ruled out

- **Extending `propose_edit` / `apply.ts`** to support whole-bullet-array replacement. Rejected: `apply.ts` currently only replaces the text of one bullet at a fixed array index (`entry.bullets.map((b, j) => j === bulletIdx ? value : b)`); it cannot resize the array. Threading "replace this entry's whole bullet list" through the conversational tool-calling agent (`editorTools`, `SYSTEM_PROMPT` in `src/app/api/resume-edit/chat/route.ts`) would touch the tool definitions, the diff-card UI, and the system prompt for a feature that isn't actually a conversation. A dedicated one-shot endpoint is simpler and cheaper (one call, not a multi-turn tool loop).
- **Deterministic ranking deciding which projects/certs to demote.** User explicitly chose to let the AI make that judgment call using job context, rather than reusing `rankSectionsForTrim`'s keyword-weight formula at the item level.
- **Per-section accept/reject.** User chose one all-or-nothing Accept for the whole batch — simplest, no partial-acceptance bookkeeping, no re-measure-mid-review complexity.

## Design

### 1. Trigger & placement

Inside `OnePageOptimizerPanel` (both call sites — mobile ~line 7046, desktop ~line 7469 as of this spec), add a second button next to the existing `Hide {section}` button: **"Trim with AI"**. Both remain visible together when `budget.overBudget` is true — hiding a section is instant and free; AI trim is a paid action for when the user wants to keep the content.

### 2. New endpoint: `POST /api/resume-edit/trim-to-fit`

Mirrors the existing `/api/resume-edit/audit` route's shape (one non-streaming `gpt-4.1-mini` call, JSON mode, no tool-calling loop).

**Request body:**
```ts
{
  optimizedResumeId: string
  editorState: ResumeEditorState
  pageTarget: number
  currentPages: number       // from the caller's live `budget` state
  jobTitle: string
  jobDescription: string
}
```

**Auth/limits:** same as the rest of the resume-edit family — `requireUserLimit(userId, 'resume-edit')` and `checkQuota(userId, 'resume_edit')`. No new limiter/quota bucket.

**Model prompt behavior** (system prompt for this route, distinct from the chat route's `SYSTEM_PROMPT`):
- Given the resume, job context, and how many pages over target it is, decide which experience entries have too many bullets (rule of thumb stated in the prompt: 5-6+ bullets → condense to 2-3) and rewrite that entry's bullets array shorter — merging/tightening, not just truncating.
- If there are 4+ projects, decide (using job relevance, not a fixed rule) which ~2 stay with full bullets and which get demoted to name-only (`bullets: []` — the existing template renderers already handle empty bullet arrays since that's how a normal project can look mid-edit, so no PDF template changes needed for this).
- If there are 4+ certifications, thin the list down.
- Same hard rule as the chat assistant: never invent a number/%/duration not already present in the original resume state. Every changed bullet is validated server-side via `validateProposedText`; any bullet that fails falls back silently to its original text (fail-safe: a rejected line is never worse than what the user already had).

**Response body:**
```ts
{
  success: true
  changes: {
    summary?: { before: string; after: string }
    experience?: { index: number; company: string; before: string[]; after: string[] }[]
    projects?: { index: number; name: string; before: string[]; after: string[]; demoted: boolean }[]
    certifications?: { before: string[]; after: string[] }
  }
}
```
Only sections that actually changed are present. If nothing needed trimming, `changes` is `{}` and the frontend shows "Nothing to trim."

### 3. Review UI

A single review panel/modal (not the chat) rendered on trim-to-fit success, showing:
- Per changed experience entry: bullet count before → after, struck-through removed lines.
- Per changed project: "kept in full" vs. "name only" badge.
- Changed certifications list: before/after.
- Changed summary, if any: before/after paragraph.

Footer: **Apply trim** / **Cancel** — one decision for the whole batch (confirmed with user).

### 4. Applying it

On Apply: build the next `ResumeEditorState` by splicing in `changes.experience[].after`, `changes.projects[].after`, `changes.certifications.after`, `changes.summary.after` at their respective indices/fields, then:
```ts
setEditorState(nextState)
saveManualEdit('layout-trim', editorState /* before */, nextState /* fictional single before/after pair, or one saveManualEdit call per changed section — implementation detail for the plan */, nextState)
```
Exact shape of the `saveManualEdit` call(s) — one combined edit_history entry vs. one per section — is left to the implementation plan; either is consistent with existing persistence, this spec only requires it go through `saveManualEdit`/`persistEditorState`, not a new write path.

### 5. Re-measuring (already free)

`resumes/page.tsx`'s existing debounced `useEffect` (~line 6452) re-runs `measureBudget` whenever `effectiveState` changes. Applying the trim changes `editorState` → `effectiveState` changes → that effect fires automatically. No new re-measure code needed. If still over budget, `OnePageOptimizerPanel` simply reappears with "Trim with AI" available again — the user can run it again manually. No hard cap on repeat passes; manual re-click is enough friction.

## Error handling

- Endpoint failure (n8n/OpenAI error, timeout) → toast/inline error in the review trigger, same pattern as `onFindImprovements`'s error handling in `useAssistant.ts`.
- Empty/no-op result (`changes: {}`) → "Nothing to trim" message, no review panel shown.
- Individual bullet failing the metrics validator → silently falls back to original text for that one bullet only; does not fail the whole batch.

## Out of scope for this spec

- Automatic multi-pass looping (calling trim-to-fit repeatedly until budget fits without user interaction) — explicitly rejected earlier in favor of manual re-trigger.
- Adding/removing whole experience or project *entries* — only bullet content within existing entries changes.
- Applying trim to the master (non-tailored) resume — this lives under the same "tailored resume only" scoping as the rest of the One-Page Optimizer (`ProjectSwapNudgeCard`/`OnePageOptimizerPanel` are already gated on `selectedEntry` being a job-tailored optimized resume).
