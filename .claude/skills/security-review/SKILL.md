---
name: security-review
description: Use when adding API routes, handling user input, modifying Supabase tables/RLS, integrating third-party APIs, or before merging anything that touches auth, secrets, or user data. Project-aware: tuned to JobScorer's Next.js + Supabase + n8n proxy architecture.
allowed-tools: Read, Grep, Glob, Bash
---

# Security Review — JobScorer

Apply this checklist any time code touches: auth, secrets, user input, file uploads, API endpoints, Supabase schema, RLS policies, n8n webhook proxies, or third-party APIs (OpenAI, Apify, JSearch, SerpAPI, Firecrawl).

Confidence rule: only flag issues you're >80% sure about. Skip stylistic preferences unless they violate a documented convention.

---

## JobScorer-specific risks (check these FIRST)

These are the known weak spots in this codebase per [CLAUDE.md](../../../../CLAUDE.md). Always sweep for them on any PR that touches affected areas.

### 1. RLS gaps — known and tracked
RLS is **disabled** on:
- `jobss` (orphan typo table — drop it, don't add policies)
- `job_ingestion_logs` (needs: service role write, authenticated user read)
- `resume_skills` (unused — drop it)

Block any PR that:
- Adds a new table without enabling RLS
- Disables RLS on an existing table
- Uses `SUPABASE_SERVICE_ROLE_KEY` in client-bundle code (only allowed in route handlers + server components)

Verify with [list_tables](https://supabase.com/docs/reference) MCP or:
```sql
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
```

### 2. AI/business logic in Next.js API routes
Architecture rule (CLAUDE.md): **API routes are thin proxies to n8n webhooks**. AI calls, job fetching, scoring belong in n8n.

Flag any of these in [src/app/api/](../../../src/app/api/):
- `import OpenAI from 'openai'` outside of `/api/chat/route.ts` (chat is the documented exception)
- Direct `fetch('https://api.apify.com/...')` or JSearch/SerpAPI/Firecrawl calls
- Scoring math, matching logic, or PDF generation
- Anything that loops over jobs/resumes to compute results

If you see business logic in an API route, the fix is: move it to an n8n workflow, expose a webhook, make the route a proxy.

### 3. Internal token guard on `/api/rag/*`
Per the Phase 12 Redis+RAG rollout, all `/api/rag/*` routes must reject requests missing `X-Internal-Token: $N8N_INTERNAL_TOKEN`. Flag any RAG route that:
- Doesn't check the header
- Uses `===` against `process.env.N8N_INTERNAL_TOKEN` without timing-safe compare
- Returns 200 on token mismatch

### 4. Double-stringify JSON workaround
n8n returns JSON.stringify'd twice; frontend works around it (CLAUDE.md known issue #1). Flag any NEW code that introduces the same workaround instead of fixing the n8n source — the workaround should be retired, not propagated.

---

## Standard checklist

### A. Secrets management
- [ ] No hardcoded keys/tokens/passwords
- [ ] All secrets read from `process.env.*`
- [ ] `.env.local` is in `.gitignore` (verify)
- [ ] Production secrets in Vercel env, not committed
- [ ] No secrets in logs, error messages, or client bundles

```ts
// FAIL
const key = "sk-proj-xxxxx"

// PASS
const key = process.env.OPENAI_API_KEY
if (!key) throw new Error('OPENAI_API_KEY not configured')
```

### B. Input validation (Zod at API boundaries)
Every API route handler that accepts a body or query params should validate with Zod before doing anything else.

```ts
import { z } from 'zod'
import { NextResponse } from 'next/server'

const Body = z.object({
  resumeId: z.string().uuid(),
  jobIds: z.array(z.string().uuid()).max(50),
})

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  // proceed with parsed.data
}
```

Check:
- [ ] Body/query/params validated with schema (Zod, valibot, or equivalent)
- [ ] File uploads: size ≤ 5MB, type allowlist (PDF only for resumes)
- [ ] Whitelist validation, not blacklist
- [ ] Error responses don't echo raw user input

### C. SQL / Supabase queries
- [ ] All queries use Supabase client builder OR parameterized `.rpc()` calls
- [ ] No string-concatenated SQL anywhere
- [ ] Service-role client used only when RLS bypass is genuinely required (and commented why)

```ts
// PASS — parameterized
const { data } = await supabase
  .from('user_job_matches')
  .select('*')
  .eq('user_id', userId)
  .order('relevance_score', { ascending: false })
```

### D. Auth & authorization
- [ ] Protected routes verify session via `createServerClient()` / middleware
- [ ] JWTs in httpOnly cookies (Supabase Auth handles this by default — don't reach into `localStorage`)
- [ ] Role/ownership checks before sensitive mutations (e.g., user can only optimize their own resume)
- [ ] Service-role key never imported into client components

```sql
-- Example RLS policy for resumes
ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own resumes"
  ON resumes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own resumes"
  ON resumes FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

### E. XSS
- [ ] User-provided HTML sanitized with `isomorphic-dompurify` before `dangerouslySetInnerHTML`
- [ ] Resume content rendered through React (auto-escaped) — never injected as HTML
- [ ] CSP header set in `next.config.ts` for production

### F. Rate limiting (Upstash Redis)
JobScorer has Upstash Redis configured (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`). Use `@upstash/ratelimit` for any expensive endpoint.

```ts
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '60 s'),
  analytics: true,
  prefix: 'ratelimit:score',
})

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for') ?? 'anonymous'
  const { success } = await ratelimit.limit(ip)
  if (!success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
  // ...
}
```

Stricter limits on expensive routes:
- `/api/score` → 5/min per user (n8n + LLM costs)
- `/api/optimize-resume` → 3/min per user (Sonnet calls)
- `/api/company-research` → 5/min per user (Firecrawl)
- `/api/chat` → 30/min per user
- `/api/ingest-jobs` → 2/min per user (Apify spend)

Check:
- [ ] Every public API route has rate limiting OR a comment justifying why not
- [ ] Limits keyed by user ID when authenticated, IP when anonymous
- [ ] `X-Internal-Token`-guarded routes can skip rate limit (n8n internal calls)

### G. Sensitive data exposure
- [ ] No PII in `console.log` (email + userId is OK; resume body, phone, gov IDs are NOT)
- [ ] Error responses generic to users; full stack only in server logs
- [ ] No `error.stack` returned to client
- [ ] Supabase storage URLs that contain user IDs are not logged

### H. File uploads (resumes)
```ts
const MAX_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = ['application/pdf']

if (file.size > MAX_SIZE) throw new Error('Max 5MB')
if (!ALLOWED_TYPES.includes(file.type)) throw new Error('PDF only')
if (!file.name.toLowerCase().endsWith('.pdf')) throw new Error('PDF only')
```

- [ ] Size cap enforced server-side (client cap is a UX hint, not security)
- [ ] MIME type AND extension checked
- [ ] Uploaded files stored in Supabase storage with user-scoped paths
- [ ] No filename trust — server-generates UUID for storage key

### I. Third-party APIs (n8n, OpenAI, Apify, JSearch, SerpAPI, Firecrawl)
- [ ] API keys only on server side, never in `NEXT_PUBLIC_*`
- [ ] Outbound webhook URLs use `N8N_*_WEBHOOK` env vars, never hardcoded
- [ ] Timeouts set on all outbound `fetch()` calls (n8n workflows can hang)
- [ ] Response shape validated before trusting (zod schema on the n8n response too)

### J. Dependencies
- [ ] `npm audit` clean (or known-acceptable findings documented)
- [ ] `package-lock.json` committed
- [ ] No new deps without considering smaller alternatives

---

## Pre-deployment checklist (full pass)

Before merging anything that touches auth/data/APIs:

- [ ] **Secrets:** no hardcoded values, all in env
- [ ] **Input validation:** Zod schemas at every API boundary
- [ ] **SQL:** parameterized via Supabase client
- [ ] **Auth:** session check on protected routes
- [ ] **RLS:** enabled on every new table; existing gaps not made worse
- [ ] **Service role:** used only server-side, with comment justifying each usage
- [ ] **Rate limiting:** Upstash limiter on expensive routes
- [ ] **Internal token:** `/api/rag/*` rejects requests without `X-Internal-Token`
- [ ] **CORS:** API routes don't blanket-allow origins
- [ ] **Logging:** no PII or secrets
- [ ] **Error handling:** generic client errors, detailed server logs
- [ ] **Dependencies:** lockfile committed, no critical vulns

---

## Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Supabase Auth + RLS docs](https://supabase.com/docs/guides/auth/row-level-security)
- [Upstash Ratelimit](https://github.com/upstash/ratelimit)
- [Next.js Security headers](https://nextjs.org/docs/app/api-reference/config/next-config-js/headers)
