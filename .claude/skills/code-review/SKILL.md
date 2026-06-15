---
name: code-review
description: Use when reviewing a diff, PR, or recently-changed files in JobScorer. Project-aware reviewer for Next.js 16 + React 19 + Supabase + n8n proxy architecture. Complements (does not replace) superpowers:requesting-code-review.
allowed-tools: Read, Grep, Glob, Bash
---

# Code Review — JobScorer

Targeted review for this codebase's specific conventions. Use alongside (not instead of) standard reviewer tools.

---

## How to run a review

### 1. Gather context
```bash
git diff --staged              # staged changes
git diff                       # unstaged changes
git diff origin/main...HEAD    # full branch delta
git log --oneline -10          # recent history for style/convention
```

If no diff is provided, ask which scope: staged / branch / a specific path.

### 2. Apply the project filter (this skill's value-add)
Sweep the JobScorer-specific checks below BEFORE running generic review checks. These catch the failures most likely in this codebase.

### 3. Apply standard checks
Type safety, error handling, dead code, tests, naming. Skip stylistic nits unless they violate a convention documented in [CLAUDE.md](../../../../CLAUDE.md) or visible in surrounding code.

### 4. Filter by confidence
Only report issues you're **>80% confident** about. Marginal calls and personal preferences get filtered out — they flood the review and train the author to ignore future feedback.

### 5. Deliver findings
Organize by severity. End with a verdict table.

---

## JobScorer-specific checks (run FIRST)

### Architecture rule: API routes are thin n8n proxies
Per CLAUDE.md: *"Never put AI calls, job fetching, or scoring logic directly in Next.js API routes."*

In any diff touching [src/app/api/](../../../src/app/api/), flag:

- **CRITICAL** — `import OpenAI` or `import Anthropic` in an API route other than `/api/chat/route.ts` (chat is the documented exception)
- **CRITICAL** — direct calls to Apify, JSearch, SerpAPI, or Firecrawl (these belong in n8n workflows)
- **HIGH** — business logic in the API route (scoring math, looping over jobs, matching computation, PDF generation)
- **HIGH** — hardcoded webhook URLs instead of `N8N_*_WEBHOOK` env vars
- **MEDIUM** — proxy routes that don't forward errors with proper status codes

The correct shape for a proxy route is roughly:

```ts
export async function POST(req: Request) {
  const body = await req.json()
  const res = await fetch(process.env.N8N_SCORING_WEBHOOK!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    return NextResponse.json({ error: 'Scoring failed' }, { status: res.status })
  }
  return NextResponse.json(await res.json())
}
```

### Supabase / RLS
- **CRITICAL** — new table created without RLS enabled
- **CRITICAL** — `SUPABASE_SERVICE_ROLE_KEY` imported anywhere that ships to the client bundle (anything under `'use client'` or `src/components/` that doesn't have `server-only`)
- **HIGH** — service-role client used in an API route without a comment explaining why RLS bypass is needed
- **HIGH** — `.rpc()` call without input validation upstream
- **MEDIUM** — `select('*')` on tables with sensitive columns (`resumes.structured_data`, `optimized_resumes.optimized_data`) when only a few fields are needed

### Phase 12 (Redis + RAG + Queue) guards
- **CRITICAL** — new `/api/rag/*` route without `X-Internal-Token` check against `N8N_INTERNAL_TOKEN`
- **HIGH** — token comparison using `===` instead of timing-safe compare
- **MEDIUM** — `/api/score` defaults to anything other than `mode:'all'` (per CLAUDE.md, `mode:'rag'` only flips after user validates top-3 overlap)

### Known-issue propagation
- **HIGH** — new code introduces the `JSON.parse(JSON.parse(...))` double-stringify workaround. The fix belongs in n8n, not the frontend.
- **MEDIUM** — new orphan tables created (we're still trying to drop `jobss`)

### Webhook hygiene
- **HIGH** — outbound `fetch()` to an n8n webhook without a timeout (n8n workflows can hang for minutes)
- **MEDIUM** — n8n response not validated with a schema before being trusted
- **MEDIUM** — webhook URL hardcoded instead of from env

---

## Standard checks (run after project filter)

### Security
Defer to [security-review](../security-review/SKILL.md) skill — invoke it directly for any diff touching auth/secrets/data. Skim the basics:
- secrets in env vars only
- Zod validation at API boundaries
- no PII in logs

### React 19 / Next.js 16 App Router
- Server components by default; `'use client'` only when needed (event handlers, hooks, browser APIs)
- `useEffect` for syncing with external systems, not data fetching (use server components + `fetch()` for that)
- No `getServerSideProps` / `getStaticProps` (Pages Router, not used here)
- `params` and `searchParams` are now Promises in Next 16 — must `await` them
- Suspense boundaries around streaming data
- No `key` collisions in lists; never use array index as key for reordering lists

### TypeScript
- `any` requires a comment justifying it; prefer `unknown` + narrowing
- No `as any` casts (red flag — fix the underlying type)
- Exported functions have explicit return types when the inference is non-trivial
- Discriminated unions for state machines, not boolean flags

### Error handling
- `try/catch` around all `await` calls to external services (Supabase, n8n, OpenAI)
- Errors logged server-side with context, returned generically to client
- No swallowed errors (`catch (e) {}` with nothing inside)

### Testing
- This codebase has minimal tests today. Don't flag absence of tests unless the change is in a critical path (auth, scoring, payment).
- If tests exist for the modified file, they must still pass.

### Dead code & complexity
- Removed code: deleted, not commented out
- No `// TODO` without an issue link
- Functions > 50 lines: ask whether they should split
- Components > 300 lines: usually a code smell, flag

### Performance
- No `.map().filter().reduce()` chains on large arrays without justification
- N+1 Supabase queries — use joins or `.in()` instead
- Heavy components wrapped in `dynamic(() => import(...))` with `ssr: false` where appropriate
- Images use `next/image`, not raw `<img>`

---

## Severity definitions

| Level | Meaning | Action |
|---|---|---|
| **CRITICAL** | Security issue, data loss risk, or violates a documented architecture rule | Block merge |
| **HIGH** | Bug, real performance issue, or significant maintainability hit | Fix before merge |
| **MEDIUM** | Should fix; could ship and follow up | Author decides |
| **LOW** | Suggestion, style preference, optional cleanup | Author decides |

---

## Output format

```markdown
# Code Review

## Critical (N)
**[file:line] — short title**
Issue: <one sentence>
Evidence: ```<code excerpt>```
Suggested fix: <one sentence or code snippet>

## High (N)
...

## Medium (N)
...

## Low (N)
...

## Summary

| Severity | Count |
|---|---|
| Critical | N |
| High | N |
| Medium | N |
| Low | N |

**Verdict:** APPROVE / WARNING / BLOCK

<one-paragraph rationale>
```

Verdict rules:
- **BLOCK** if any Critical issue
- **WARNING** if any High issue
- **APPROVE** otherwise (Medium/Low don't block)

---

## What this skill does NOT do

- It doesn't replace `superpowers:requesting-code-review` (broader process skill)
- It doesn't replace `/ultrareview` (multi-agent cloud review)
- It doesn't replace `/review` or `/security-review` built-ins
- It doesn't run automated tests or lint — call those separately

This skill's value: the JobScorer-specific filter at the top. If you only had one minute, that section catches the failures most likely in this codebase.
