# JobScorer — Production-Readiness Audit & Launch Roadmap

> **Mode:** Audit + plan only. No code was changed, no packages installed, no commits made.
> **Domain:** jobscorer.in (Hostinger). **Orchestration:** n8n running on **local Docker (127.0.0.1:5678)** — cloud credits exhausted.
> **Date:** 2026-07-21. Evidence gathered from repo + **live Supabase project** (MCP advisors, table/migration listing).

---

## Context

JobScorer is a Next.js 16 / React 19 AI career platform (resume analysis, ATS scoring, job matching, gap detection, project coach, portfolio/resume generation) deployed on Vercel, backed by Supabase (Postgres + Auth + Storage + pgvector), Upstash Redis (rate-limit + dedupe), Razorpay (billing), OpenAI, and an **n8n orchestration layer that currently runs on the founder's local machine**. The codebase is unusually mature for pre-launch: 57 API routes, 68 DB migrations, 33 tables all under RLS, dedicated security-hardening migrations, Sentry wired, CSP headers present, per-user rate limiting, and webhook signature verification.

The single largest launch blocker is architectural, not code quality: **the entire AI pipeline depends on a laptop.** Everything else is hardening and integration polish. This report scores the system, details every gap found against the live database, and gives a phased, low-risk roadmap to a public launch on jobscorer.in.

---

## 1. Repository Audit

**Stack:** Next.js 16.2 (App Router, webpack build — Turbopack deliberately disabled for Vercel middleware tracing), React 19.2, TS 5, Tailwind 4, Supabase SSR, Upstash, Razorpay, OpenAI 6, Trigger.dev 4.4 (scoring fallback), Sentry 10, @react-pdf/renderer, pdfjs.

**What's genuinely good (do not rebuild):**
- **n8n is never called from the browser.** Every workflow is invoked through a same-origin Next.js API route that injects secrets server-side (`src/app/api/*/route.ts`). `NEXT_PUBLIC_N8N_*` webhook vars exist but the server `N8N_*_WEBHOOK_URL` vars are the real path. Good pattern; see §3 for the public-var cleanup.
- **Auth middleware** (`middleware.ts` + `src/lib/supabase/middleware.ts`) refreshes the Supabase session on every non-static request, with explicit, well-commented bypasses for webhooks (Razorpay HMAC), admin/RAG header-auth routes, and SEO assets.
- **Admin/internal auth** (`src/lib/adminAuth.ts`) uses `crypto.timingSafeEqual` with length guards — constant-time, correct.
- **Billing webhook** (`src/app/api/billing/webhook/route.ts`) reads the raw body, verifies Razorpay HMAC-SHA256 in constant time, and has a Redis `SET NX` idempotency guard. Textbook.
- **Rate limiting** (`src/lib/rate-limit.ts`) — per-user Upstash sliding windows, 13 named limiters tuned per-cost, degrades *open* if Redis is down (availability over strictness — reasonable, note it).
- **Client API layer** (`src/lib/api.ts`) has hardened error handling: `safeJson`, `cleanError`, 402/429 handling, abort timeouts on long n8n calls, never dumps raw error blobs to users.

**Weaknesses / risks:**
- **Build safety nets are load-bearing.** `next.config.ts` sets `eslint.ignoreDuringBuilds` **and** `typescript.ignoreBuildErrors` = true. This means type/lint regressions ship to production silently. Acceptable as a temporary unblock, dangerous as a permanent state.
- **No CI/CD.** No `.github/workflows`, no pre-deploy typecheck/test gate. Only 2 unit test files (`applicationStatus.test.ts`, `ingestStatus.test.ts`) and Playwright is installed but no e2e specs found.
- **README is the default create-next-app boilerplate** — no runbook, no env documentation, no n8n setup notes. Onboarding/recovery risk.
- **No `.env.example`** — the 30+ required env vars are only discoverable by grepping `process.env`. (Enumerated for you in §3.)
- **Debug routes shipped:** `/api/debug`, `/api/debug/redis` are reachable. `debug/redis` is even middleware-bypassed. Left-behind `console.log` diagnostics in `src/lib/api.ts` (`fetchBuildPlanProjectSummaries`, `fetchProjectRoadmaps`) marked "TEMP — remove".
- **`.env` and `.env.trigger.prod` exist on disk** (gitignored, good) but contain live-looking secrets. Confirm none were ever committed historically (§10).

---

## 2. Database Audit (live data via Supabase MCP)

**Scale:** 33 public tables, **68 migrations** (well-sequenced, phase-named — this is a professionally managed schema). pgvector 0.8.0 installed. Notable row counts: jobs 2,826 / job_embeddings 2,649 / pool_jobs 1,436 / user_job_matches 674 / usage_events 270 / resumes 77 / subscriptions 3 / profiles 5.

**RLS posture — strong.** 32 of 33 tables have RLS enabled. Dedicated hardening migrations already ran: `phase4d_function_search_path_and_anon_revoke`, `revoke_securitydefiner_fn_execute`, `revoke_public_execute_on_sensitive_rpcs`, `wrap_auth_calls_in_rls_policies_initplan` (initplan optimization), `revoke_stray_anon_select_grants`, `harden_report_job_status_use_auth_uid`.

**Live advisor findings (ranked):**

| Sev | Finding | Reality | Action |
|-----|---------|---------|--------|
| **ERROR** | `queue_processor_lock` has RLS **disabled** | Internal single-flight lock, written by service role. Low data risk, but anon/authenticated can read/write via anon key. | `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` with **no policy** (service role bypasses). Phase 1. |
| WARN | `jobs` readable by `anon` (dual policy `public_read_jobs` + `Authenticated users can read jobs`) | **Confirmed intentional** by user — public `/browse` page stays public (SEO + top-of-funnel). Only issue is the redundant duplicate policy causing a "multiple permissive policies" perf lint. | **Keep public.** Drop the redundant `Authenticated users can read jobs` policy so a single `public_read_jobs` policy remains (removes the perf lint without changing behavior). Phase 7. |
| WARN | `function_search_path_mutable` on `try_acquire_queue_lock`, `renew_queue_lock`, `release_queue_lock` | Search-path injection surface on 3 queue fns. | `ALTER FUNCTION ... SET search_path = ''`. Phase 1, one migration. |
| WARN | `vector` extension in `public` schema | Cosmetic/best-practice. | Low priority; move to `extensions` schema during a maintenance window (risky to move live — defer). |
| WARN | Auth: **leaked-password protection disabled** (HaveIBeenPwned) | Free win. | Enable in Supabase Auth dashboard. Phase 1. |
| WARN | ~11 tables allow `anon SELECT` (subscriptions, usage_events, usage_counters, project_*, assistant_interactions, user_achievements, resume_layouts, milestone_progress) | RLS row policies still gate rows, so leakage is limited — but `subscriptions`/`usage_*` being anon-discoverable is unnecessary attack surface. | Revoke `anon SELECT` grants on non-public tables. Phase 7. |
| INFO | `job_embeddings`, `resume_embeddings` — RLS enabled, **no policies** | Correct-by-accident: default-deny, accessed only by service role. | Leave as-is (or add explicit owner policy on resume_embeddings for clarity). |
| INFO | ~10 **unindexed foreign keys** (project_roadmaps.{resume_id,job_id,build_plan_rec_id}, assistant_interactions.{roadmap_id,milestone_id}, milestone_progress, project_evidence, resume_layouts, user_achievements, resume_skills) | The July "project_roadmap_coach_schema" + resume_layouts tables shipped without covering indexes; the earlier `add_covering_indexes_for_unindexed_fks` migration predates them. | Add covering indexes. Cheap. Phase 7. |
| INFO | ~15 **unused indexes** (pool_jobs×3, applications×5, company_research_analysis×3, jobs×2, usage_counters, job_embeddings ivfflat) | Mostly low-volume-driven (planner picks seq scan on small tables) — **not** dead. The unused `job_embeddings_embedding_idx` is worth checking (RAG should use it). | **[POST] — defer entirely.** Not a launch concern at a small user base (user's call). Re-run advisors once real traffic exists; they'll tell you what's truly unused. Only the vector-index check is worth a quick look (is RAG actually hitting it?). |

**Schema hygiene:**
- Orphan typo table `jobss` was already dropped (`phase4b_drop_orphan_jobss`). Good.
- `resume_skills` (0 rows), `user_profile_data` (0 rows), `role_synonyms` (0), `location_aliases` (0), `gap_form_responses` (0), `user_achievements` (0) — unused-but-scaffolded tables. Harmless; document intent or drop post-launch.
- No table partitioning on `usage_events`/`job_queue` — fine at current scale; revisit if usage_events grows past ~1M rows.

**Storage:** one bucket, `resumes`, with per-user access policies (`resumes_bucket_user_access_policies` migration). Resume signed URLs via `/api/resume-signed-url`. Verify the bucket is **private** (not public) and that policies scope to `auth.uid()` folder prefix (§10).

---

## 3. Environment Audit (grouped by service)

All env vars are consumed server-side except the `NEXT_PUBLIC_*` set. Enumerated from `.env` + every `process.env.*` reference.

**Supabase:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (used in **33 files**), `SUPABASE_ACCESS_TOKEN` (CLI/MCP only — should NOT be in Vercel runtime).
**OpenAI:** `OPENAI_API_KEY`, `OPENAI_EMBEDDING_MODEL`.
**Upstash Redis:** `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
**Razorpay:** `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. ⚠️ Plan IDs in `src/lib/billing-plans.ts` are **TEST mode** — must regenerate for live.
**n8n (LOCAL):** `N8N_{RESUME,JOB_INGESTION,SCORING,COMPANY_RESEARCH,OPTIMIZE,LEARNING_PATH,BUILD_PLAN,ROADMAP,PROJECT_EVIDENCE,COVER_LETTER}_WEBHOOK_URL`, `N8N_QUEUE_WAKE_URL`, `N8N_QUEUE_MODE`, `N8N_INTERNAL_TOKEN`, plus **duplicate** `NEXT_PUBLIC_N8N_*` (5 of them). All currently point at `127.0.0.1:5678`.
**Trigger.dev:** `TRIGGER_SECRET_KEY`, `TRIGGER_DEV_SCORING` (feature flag), plus OTEL tuning in `.env.trigger.prod`.
**Admin/internal:** `ADMIN_API_TOKEN` (falls back to service-role key — see §10 H1).
**Sentry:** `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` (referenced in `next.config.ts` / sentry configs).
**Site/misc:** `NEXT_PUBLIC_SITE_URL`, `VERCEL_URL`, `NEXT_PUBLIC_ASSISTANT_MODE`, `NODE_ENV`.

**Issues:**
1. **`NEXT_PUBLIC_N8N_*` are dead-or-dangerous.** If any client code still reads them, the localhost URL leaks into the browser bundle (and won't work for real users anyway). Confirm they're unused and delete; keep only server `N8N_*_WEBHOOK_URL`.
2. **No `.env.example`** — create one (names only, no values) as the canonical contract.
3. **`SUPABASE_ACCESS_TOKEN`** is a management-API token; ensure it is NOT set in Vercel production runtime (only needed locally for MCP/CLI).
4. **Missing (to be added by roadmap):** `RESEND_API_KEY`, `NEXT_PUBLIC_POSTHOG_KEY`/`_HOST`, `N8N_*` pointing at a **hosted** n8n, live Razorpay keys+plan IDs.

---

## 4. Infrastructure Audit

Current: Vercel (Next.js) → same-origin API routes → {Supabase, Upstash, OpenAI, Razorpay, **n8n@localhost**, Trigger.dev}. Domain jobscorer.in parked at Hostinger, not yet pointed at Vercel.

**Single points of failure (ranked):**
1. **🔴 n8n on a laptop = the whole product on a laptop.** Resume parse, scoring, optimize, company research, learning path, build plan, roadmap, project evidence, cover letter — *all* proxy to `127.0.0.1:5678`. If the machine sleeps, reboots, loses internet, or the founder travels, **the core product is down** for every user. This is the #1 launch blocker. Trigger.dev exists only as a scoring fallback (`TRIGGER_DEV_SCORING` flag), not for the other 9 workflows.
2. **Redis degrade-open** — if Upstash is down, rate limiting silently disables (documented tradeoff). At launch scale this exposes cost-amplification/abuse risk on paid OpenAI calls. Acceptable short-term; add alerting.
3. **Single Supabase project** — no read replica/PITR verification. Confirm PITR/backups are enabled on the plan.
4. **No queue durability guarantee** — `job_queue` + `queue_processor_lock` drive scoring; the processor is woken by `N8N_QUEUE_WAKE_URL` (also localhost). Zombie/staleness guards exist (`queue_processor_zombie_guard`, `QUEUE_STALE_AFTER_MS`), which is good defensive design, but the executor is still the laptop.

**Production-readiness verdict:** **Not yet**, solely because of #1. Everything else is launch-ready or minor. **The n8n hosting decision is the gating decision for launch** — see the clarifying question at the end.

---

## 5. External-Service Integration Plan (do NOT implement yet)

For each: purpose · config · env · code touch · risk · rollback · test.

### Cloudflare (proxy/CDN/DNS + WAF)
- **Purpose:** DNS host, edge caching for static/SEO, WAF + bot mitigation + rate limiting in front of Vercel, DDoS protection, analytics.
- **Config:** Add site to Cloudflare, set NS at registrar (see §6). DNS **proxied (orange cloud)** for root+www CNAME→Vercel. SSL/TLS mode **Full (strict)**. Create a WAF rule to challenge non-browser hits on `/api/*` except the webhook path. Cache rule: bypass cache for `/api/*` and authenticated routes.
- **Env:** none in-app. Optionally `NEXT_PUBLIC_SITE_URL=https://jobscorer.in`.
- **Code:** verify `middleware.ts`/CSP still allow Cloudflare; ensure real client IP read from `CF-Connecting-IP` if you ever IP-rate-limit (currently per-user, so fine).
- **Risk:** proxying can break Razorpay webhook or SSE/streaming if a rule is too aggressive. **Rollback:** flip orange→grey (DNS-only) — instant, no redeploy. **Test:** curl webhook through CF with a valid signature; verify Realtime/streaming chat still works.

### Resend (transactional email) — see §7.
### Sentry — see §8. Already partially wired.
### PostHog — see §9.

### Google Search Console
- **Purpose:** index coverage, sitemap submission, search analytics.
- **Config:** verify domain via DNS TXT (do it while on Cloudflare — one record). Submit `/sitemap.xml` (route already bypassed in middleware).
- **Env/Code/DB:** none. **Risk:** none. **Rollback:** remove property. **Test:** URL inspection on `/`.

### Google Analytics (GA4) — **SKIP (confirmed with user).**
- Not on the roadmap. PostHog (product analytics) + Cloudflare Web Analytics (traffic) fully cover this stage. GA4 would only duplicate tracking, add a second consent surface, and add a script to CSP. Revisit **only** if a specific marketing/ads-attribution requirement appears later.

### Future monitoring
- **Uptime:** BetterStack/UptimeRobot pinging `/` and a new lightweight `/api/health` (add one that checks Supabase + Redis + n8n reachability).
- **Cost:** OpenAI usage dashboards + a budget alert; you already log `usage_events` with `cached_tokens`/`latency_ms` — surface it.

---

## 6. Domain Plan — Hostinger → Cloudflare → Vercel

**Target:** `jobscorer.in` (root) + `www` → Vercel, DNS+WAF on Cloudflare, zero downtime.

1. **Pre-flight:** In Vercel, add `jobscorer.in` and `www.jobscorer.in` to the project; note the required A record (`76.76.21.21`) and/or CNAME (`cname.vercel-dns.com`). Do NOT change nameservers yet.
2. **Cloudflare onboarding:** Add site; Cloudflare imports existing Hostinger records. **Verify the import** (MX/email if any, TXT).
3. **Records in Cloudflare:**
   - `A @ 76.76.21.21` **proxied**, or root CNAME flattening → `cname.vercel-dns.com`.
   - `CNAME www → cname.vercel-dns.com` **proxied**.
   - Keep any Hostinger email MX records if email is used there.
4. **Registrar switch (Hostinger):** point nameservers to the two Cloudflare NS. Propagation ≤ 24h; because both Hostinger's old records and Cloudflare mirror the same Vercel target, **there is no downtime window**.
5. **SSL:** Cloudflare **Full (strict)**; Vercel auto-provisions its cert; enable HSTS (already sent by `next.config.ts` — good, keep `preload` only once you're confident).
6. **Redirects/www:** pick canonical (recommend apex `jobscorer.in`); redirect `www → apex` (Cloudflare Redirect Rule or Vercel). Ensure `NEXT_PUBLIC_SITE_URL`, Supabase Auth **Site URL + redirect allow-list**, and Razorpay callback all use the canonical host.
7. **Auth callback:** update Supabase Auth `Site URL` and `Additional Redirect URLs` to `https://jobscorer.in/auth/callback` **before** cutover or logins break.
8. **Caching:** bypass `/api/*` + authenticated pages; cache `_next/static`, images, fonts.
9. **Zero-downtime validation:** cut over off-peak; watch Sentry + `/api/health`; rollback = nameservers back to Hostinger OR CF grey-cloud.

---

## 7. Email Plan — Resend

Currently **no email system exists** (no Resend/nodemailer/sendgrid in code). Supabase Auth sends its own auth emails via its default SMTP today.

**Architecture:**
- **Domain auth:** add `jobscorer.in` to Resend; publish SPF + DKIM + DMARC (3 DNS records on Cloudflare). Use a subdomain sender like `noreply@mail.jobscorer.in` to isolate deliverability.
- **Two lanes:**
  1. **Auth emails (verification, password reset, magic link):** configure **Supabase Auth → custom SMTP = Resend**. No app code; keeps auth flows atomic. Customize templates in Supabase.
  2. **Product emails (welcome, resume ready, resume generated, company-research complete, project reminder, weekly insights):** triggered from server/n8n. Since n8n already orchestrates the long jobs, **fire the "ready" emails from the n8n workflow's final node** (it already knows when work completes) OR from the API route after a successful trigger. Add a thin `src/lib/email.ts` wrapping the Resend SDK.
- **Templates:** React Email components (or Resend's) checked into `src/emails/`. Start with 3 (welcome, resume-ready, weekly-insights); expand.
- **Queue/retry/failure:** Resend has built-in retries + webhooks for bounces/complaints. For product emails, prefer sending from n8n (already has retry/backoff) or add to `job_queue`. Rate-limit weekly-insights via a `pg_cron` job (extension available) writing to a send queue. Respect `profiles.notification_prefs` + `email_frequency` (already in schema — reuse `fetchUserSettings`).
- **Env:** `RESEND_API_KEY`. **DB:** optional `email_events` table for audit; otherwise rely on Resend dashboard. **Risk:** deliverability if DNS wrong → verify with mail-tester before launch. **Rollback:** revert Supabase SMTP to default; feature-flag product emails. **Test:** send to seed inbox; confirm SPF/DKIM pass.

---

## 8. Sentry Plan (already ~70% done)

**Present:** `@sentry/nextjs` installed; `src/sentry.server.config.ts`, `src/sentry.edge.config.ts`; conditional `withSentryConfig` in `next.config.ts` (only wraps when `SENTRY_AUTH_TOKEN` present — clever, avoids the middleware tracing bug); CSP already allows Sentry ingest hosts.

**Gaps to close:**
- **No client config** — add `sentry.client.config.ts` (or `instrumentation-client.ts`) for browser errors + session replay.
- **No `instrumentation.ts`** wiring `register()` for Next 16 (verify the current mechanism matches Next 16 conventions).
- **Source maps:** ensure `SENTRY_AUTH_TOKEN`/`ORG`/`PROJECT` are set in Vercel so `widenClientFileUpload` uploads maps (config already requests it). Confirm `disableLogger`.
- **Release + commit tracking:** set `release` from `VERCEL_GIT_COMMIT_SHA`; enables regression attribution.
- **User context:** attach `Sentry.setUser({ id })` from the Supabase session (id only — **no email/PII**, you have a privacy page).
- **Performance/tracing:** set a modest `tracesSampleRate` (e.g. 0.1) — the n8n proxy calls are exactly where you want spans.
- **Privacy:** scrub request bodies (resumes/PII) via `beforeSend`; mask replay text.

**Env:** `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`. **Rollback:** unset `SENTRY_AUTH_TOKEN` → build skips Sentry wrap, runtime still safe. **Test:** throw a test error in a route + a client boundary; confirm both land with correct release + no PII.

---

## 9. PostHog Plan (product analytics)

None present today. Recommend PostHog Cloud, `@posthog/react`/`posthog-js`, EU region (India users → data-residency friendlier; also keeps you clear of confusion with Supabase EU choice).

**Instrument high-signal events only** (map to your funnel; avoid vanity):
- `signup_completed`, `resume_uploaded`, `resume_parsed` (+`parsing_confidence`), `jobs_searched`, `scoring_started`/`scoring_completed` (+`jobs_scored`,`from_cache`), `match_viewed`, `gap_detected`, `company_research_completed`, `resume_optimized` (+`keyword_alignment_score`), `resume_downloaded`, `cover_letter_generated`, `project_roadmap_started`/`project_completed`, `project_coach_used` (teach/stuck/review), `checkout_started`, `subscription_activated` (+plan/cycle), `upgrade_prompt_shown` (402 path), `rate_limited` (429 path).
- **Funnels to build:** upload→parse→score→optimize→download; and score→gap→roadmap→complete→resume-include.
- **Cost/quality tie-in:** you already persist `usage_events` (cost, cached_tokens, latency). Consider forwarding a subset to PostHog so product + cost sit in one place.

**Config:** capture `distinct_id = supabase user id`; **disable autocapture of input values** (resume text is sensitive); respect the existing cookie-consent page — gate PostHog init on consent. **Env:** `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`. Add host to CSP `connect-src`. **Rollback:** feature-flag init. **Test:** verify events in PostHog live view; verify no PII in payloads.

---

## 10. Security Review

**Strong today:** RLS on 32/33 tables + dedicated hardening migrations; constant-time admin/webhook auth; Razorpay HMAC + idempotency; per-user rate limits on every paid path; CSP (report-only) + HSTS + X-Frame-Options DENY + nosniff + Referrer-Policy + Permissions-Policy; n8n never browser-exposed; resume bucket per-user policies.

**Findings to fix before launch:**
- **H1 — Service-role key doubles as admin bearer.** `adminAuth.ts` falls back to `SUPABASE_SERVICE_ROLE_KEY` when `ADMIN_API_TOKEN` is unset. That means the most powerful DB key is also an API password. **Set `ADMIN_API_TOKEN` to a distinct high-entropy value** in Vercel + n8n, and (later) remove the fallback.
- **H2 — CSP is Report-Only + `unsafe-inline`/`unsafe-eval` in `script-src`.** Not enforcing means clickjacking/XSS mitigations are advisory. Plan: watch report-only violations, then **enforce**; work toward nonces to drop `unsafe-inline`. (`unsafe-eval` may be required by a dep — verify.)
- **H3 — `queue_processor_lock` RLS disabled** (§2). Enable RLS.
- **H4 — Debug routes in prod** (`/api/debug`, `/api/debug/redis`). Gate behind `ADMIN_API_TOKEN` or remove for production.
- **H5 — Confirm no secrets in git history.** `.env*` is gitignored now, but run a history scan (git log/`gh secret scanning` / trufflehog) since the repo predates the ignore.
- **H6 — Resume storage:** confirm `resumes` bucket is **private** and signed URLs are short-TTL; confirm policies pin the `auth.uid()` path prefix.
- **H7 — Prompt-injection / AI safety:** resumes and job descriptions are user/third-party text fed to OpenAI (scoring, optimize, coach, chat with tool-calling in `src/lib/chat/tools.ts` + `resume-edit/tools.ts`). Verify tool-call handlers **authorize on the server** (never trust an LLM-supplied `user_id`/`resume_id` — always scope by session `auth.uid()`), cap tokens, and treat model output as untrusted before persisting.
- **H8 — Leaked-password protection off** (§2). Enable.
- **H9 — n8n localhost = the internal token `N8N_INTERNAL_TOKEN` guards RAG routes**, good — but once n8n is hosted, ensure its inbound webhooks are also authenticated (they're currently reachable because the tunnel is local). Add a shared secret / signature check on the n8n side before exposing it publicly.

---

## 11. Production-Readiness Scores

| Area | Score | Rationale |
|------|:---:|-----------|
| **Architecture** | 7/10 | Clean proxy pattern, good separation — but core depends on localhost n8n. |
| **Frontend** | 8/10 | Next 16/React 19, thoughtful UX error handling, design system. Type/lint gates disabled. |
| **Backend** | 8/10 | 57 well-structured routes, strong error/abort handling, idempotent webhooks. |
| **Database** | 9/10 | 68 disciplined migrations, RLS everywhere, hardening already done. Minor index/lock gaps. |
| **Security** | 7.5/10 | Excellent fundamentals; H1/H3/H4/CSP-enforce/leaked-pw are the gaps. |
| **Performance** | 7/10 | Rate limits, caching, pgvector, prompt-cache telemetry. Some unindexed FKs; localhost latency. |
| **Scalability** | 5/10 | Supabase/Vercel/Upstash scale fine; **n8n-on-laptop does not.** Single point of failure. |
| **Deployment** | 6/10 | Vercel works, but no CI gate, no `.env.example`, build error-suppression, boilerplate README. |
| **Monitoring** | 5/10 | Sentry partial, usage_events telemetry exists; no client Sentry, no uptime, no analytics. |
| **Observability** | 5/10 | Good structured logging + telemetry columns; no dashboards/alerting/release tracking yet. |
| **Overall** | **6.5/10** | A well-built app one infrastructure decision away from launchable. Hosting n8n + closing H1–H4 moves this to ~8. |

---

## 12. Implementation Roadmap (phased, do NOT implement yet)

> **Prioritization philosophy (per user):** optimize for **reaching a stable beta fast**, not for maximizing every infra/security score before users exist. Once real people use JobScorer, actual usage patterns decide what deserves attention next. Every item below is tagged **[BETA]** (do before real users touch it) or **[POST]** (safe to defer until you have traffic). Don't let [POST] work block the beta.

Each phase: objective · files/config · env · test · rollback · complexity · risk · deps.

### Phase 1 — Critical hardening (before anything else)
> **Beta-gating vs deferrable (per user's split):**
> - **[BETA] Must fix before beta:** H1 admin-token separation · H4 debug routes · H3 queue-lock RLS · H8 leaked-password protection.
> - **[POST] Can wait:** H2 CSP tightening/enforce · duplicate RLS policy cleanup on `jobs` · revoking stray anon SELECT grants · unused-index cleanup. These are real but not launch blockers at a small user base.

- **Objectives ([BETA] subset):** close H1, H3, H4, H8; remove TEMP logs; add `/api/health`; add `.env.example`. (CSP enforce + grant cleanup move to Phase 7 as [POST].)
- **Files/config:** `src/lib/adminAuth.ts` (require `ADMIN_API_TOKEN`), new migration (enable RLS on `queue_processor_lock`, `SET search_path` on 3 queue fns), gate/remove `src/app/api/debug/*`, strip TEMP `console.log` in `src/lib/api.ts`, new `src/app/api/health/route.ts`, Supabase dashboard toggles (leaked-pw).
- **Env:** `ADMIN_API_TOKEN` (Vercel + n8n).
- **Test:** admin routes reject old key; debug routes 401/404; health returns component status; advisors re-run clean on the 2 fixed items.
- **Rollback:** revert migration; re-add fallback. **Complexity:** Low. **Risk:** Low. **Deps:** none.

### Phase 2 — Get n8n off the laptop onto FREE hosting (setup/testing, not launch) ⭐
**Decision (user):** This is for **testing/setup only** — not launching. Goal: a **free** always-reachable n8n so the pipeline no longer depends on the laptop being awake. Ranked free options:

| Option | Free? | Best for | Caveat |
|--------|-------|----------|--------|
| **Oracle Cloud Always Free (ARM Ampere VM)** ⭐ recommend | Genuinely free forever (up to 4 ARM cores / 24 GB RAM) | Always-on n8n via the same Docker image you run locally — closest analog to your setup | Card required for identity; ARM image (n8n supports arm64); ~30 min VM setup |
| **Google Cloud `e2-micro` Always Free VM** | Free forever (1 micro VM, US regions) | Always-on Docker n8n, small footprint | 1 GB RAM is tight for n8n + heavy workflows; card required |
| **Render free Web Service (Docker)** | Free tier | Fastest zero-VM setup — deploy the `n8nio/n8n` image, get an HTTPS URL immediately | **Spins down after ~15 min idle** → cold-start delay on first webhook (fine for testing, not launch); free Postgres expires 90 days |
| **Koyeb free web service** | Free (1 service) | Similar to Render, global | Idle spindown similar |
| n8n Cloud | 14-day trial only | Quickest but not permanently free | Not free after trial |

- **Recommendation for now:** **Render Docker deploy** if you want it working in 15 minutes and don't mind cold starts; **Oracle Always Free VM** if you want it always-on and free permanently (best "set it up properly once" choice). Either uses your **existing exported workflows** — no rewrite.
- **Config:** deploy n8n → set n8n env (`WEBHOOK_URL`, encryption key, OpenAI/Supabase creds) → import your workflow JSON → copy each production webhook URL.
- **App env (Vercel + local `.env`):** repoint all `N8N_*_WEBHOOK_URL` + `N8N_QUEUE_WAKE_URL` from `127.0.0.1:5678` to the hosted HTTPS URL; **delete the unused `NEXT_PUBLIC_N8N_*`** duplicates; keep `N8N_INTERNAL_TOKEN` and add it as a required inbound header on the hosted webhooks (H9) since they're now publicly reachable.
- **Test:** trigger each pipeline once end-to-end (upload→parse, score, optimize, research, learning-path, build-plan, roadmap, evidence, cover-letter).
- **Rollback:** keep the laptop instance runnable; env swap back is instant. **Complexity:** Med. **Risk:** Low (testing only). **Deps:** Phase 1.
- **⚠️ Launch-durability note (user flagged):** free tiers that **sleep on inactivity or cap RAM** (Render free, Koyeb free, GCP e2-micro's 1 GB) are fine for **setup/testing only**. Your workflows are **AI-heavy** (OpenAI calls, Firecrawl research that runs minutes) — a cold-started or memory-starved instance will time out real users. For the actual public launch, move to something that **stays warm with adequate RAM**: Oracle Always Free ARM (24 GB — the one free option that fits), a small paid VM (~$5-10/mo Hetzner/Railway), paid n8n Cloud, or migrate the workflows into the already-integrated **Trigger.dev**. Decide this at beta, not at first-setup.

### Phase 3 — Domain (jobscorer.in live) — §6
- Vercel domain add → Cloudflare onboard → NS switch → SSL Full(strict) → www redirect → **update Supabase Auth Site URL + Razorpay callbacks + `NEXT_PUBLIC_SITE_URL`**.
- **Test:** login/callback on the real domain; webhook still verifies. **Rollback:** NS back to Hostinger / CF grey-cloud. **Complexity:** Med. **Risk:** Med (auth callback). **Deps:** Phase 2 (don't cut over onto a laptop backend).

### Phase 4 — Cloudflare hardening — §5
- WAF rules, cache rules, bot mitigation, `/api/*` bypass, GSC + DMARC TXT records staged here too.
- **Test:** webhook + streaming through proxy. **Rollback:** grey-cloud. **Complexity:** Med. **Risk:** Med. **Deps:** Phase 3.

### Phase 5 — Resend email — §7
- Supabase custom SMTP; `src/lib/email.ts`; `src/emails/*`; wire "ready" emails from n8n final nodes; weekly digest via `pg_cron`.
- **Env:** `RESEND_API_KEY`. **Test:** mail-tester SPF/DKIM pass; auth + one product email. **Rollback:** revert SMTP; flag off. **Complexity:** Med. **Risk:** Low-Med (deliverability). **Deps:** Phase 3 (DNS).

### Phase 6 — Sentry completion — §8
- Add client config + instrumentation, source maps, release + user-id context, `beforeSend` PII scrub.
- **Env:** `SENTRY_*`. **Test:** client+server test errors with release, no PII. **Rollback:** unset auth token. **Complexity:** Low-Med. **Risk:** Low. **Deps:** none (can parallel 3-5).

### Phase 7 — PostHog + production hardening — §9, §10
- PostHog init (consent-gated) + the event set; enforce CSP; revoke stray anon SELECT grants; add covering indexes for the ~10 unindexed FKs; add CI (`typecheck + lint + test` gate) and start re-enabling `ignoreBuildErrors` incrementally; uptime monitor + OpenAI budget alert; rewrite README as a runbook.
- **Env:** `NEXT_PUBLIC_POSTHOG_KEY/_HOST`. **Test:** events land, CSP enforced without breakage, advisors clean, CI blocks a bad PR. **Rollback:** flag off PostHog; CSP back to report-only. **Complexity:** Med. **Risk:** Med (CSP enforce). **Deps:** Phases 1-6.

---

## Dependencies & sequencing summary
Phase 1 → Phase 2 (**gate**) → Phase 3 → 4 → 5; Phase 6 can run in parallel from the start; Phase 7 last. **Nothing launches to real users on jobscorer.in until Phase 2 removes the laptop dependency.**

## Verification (how to prove each phase)
- **DB fixes:** re-run Supabase advisors (security + performance) via MCP — expect the ERROR + 3 search_path WARNs gone.
- **Pipelines:** end-to-end run of all 10 n8n workflows post-migration against a staging user.
- **Domain/auth:** complete a real signup + magic-link + Razorpay test checkout on `https://jobscorer.in`.
- **Webhooks through Cloudflare:** replay a signed Razorpay event; expect 200 + idempotent second delivery.
- **Monitoring:** deliberate client + server error → visible in Sentry with release; key funnel events visible in PostHog; `/api/health` green; uptime alert fires on a forced outage.

---

## 13. Pre-Launch / Beta Checklist (single source of truth)

A flat go/no-go list so nothing is overlooked. Tag each ✅ when verified. Aim: everything under **Product** + **Business** + the **[BETA]** infra items green before inviting real users; the rest can trail.

**Product — every core flow tested end-to-end on the hosted (non-laptop) backend:**
- [ ] Sign up / log in / magic link / password reset
- [ ] Resume upload → parse (incl. a scanned-PDF failure path shows the friendly error)
- [ ] ATS scoring (RAG + full modes; cache hit + fresh)
- [ ] Job matching + search (public `/browse` + authenticated matches)
- [ ] Gap detection → learning path generation
- [ ] Resume optimization + one-page optimizer + download (PDF renders)
- [ ] Company research (long-running path redirects to research page correctly)
- [ ] Build plan → project roadmap → project coach (teach/stuck/review) → project evidence
- [ ] Cover letter generation
- [ ] Payments: Razorpay checkout with **LIVE** keys + regenerated **LIVE** plan IDs; webhook activates plan; cancel works; quota/402 upgrade prompt fires

**Infrastructure:**
- [ ] jobscorer.in resolves; HTTPS valid; www→apex redirect; Supabase Auth Site URL + Razorpay callback updated to canonical host
- [ ] Cloudflare proxied; WAF + `/api/*` cache-bypass; webhook verified through the proxy
- [ ] n8n on a warm, adequately-resourced host (not the laptop, not an idle-spindown free tier — see Phase 2 note)
- [ ] Sentry capturing client + server errors with release tags, PII scrubbed
- [ ] Resend sending (auth + product emails; SPF/DKIM/DMARC pass mail-tester)
- [ ] PostHog events flowing (consent-gated); Cloudflare Analytics on

**Business / legal:**
- [ ] Privacy Policy, Terms, Cookie Policy live (pages exist at `/legal/*` — review content for accuracy, esp. AI + data handling)
- [ ] **Refund/cancellation policy** published (required for Razorpay/Indian payments)
- [ ] Public contact email (support@jobscorer.in) + it actually receives mail
- [ ] Pricing page reflects LIVE plans/amounts

**Operations:**
- [ ] Supabase PITR/daily backups confirmed enabled AND a test restore verified
- [ ] Sentry alert routing (email/Slack) configured
- [ ] OpenAI spend budget alert set (you already log `usage_events` cost/tokens — surface a threshold)
- [ ] `/api/health` green + external uptime monitor pinging it
- [ ] Minimal incident runbook (who/what to do if n8n, Supabase, or OpenAI is down) — replaces the boilerplate README

## Decisions confirmed with user
- **n8n hosting (Phase 2):** testing/setup only, not launching yet → use a **free** host. Recommended: **Render Docker deploy** (fastest) or **Oracle Cloud Always Free VM** (always-on, free forever). Durable/paid hosting is a post-testing concern.
- **Public job browsing:** **stays public** — `/browse` + anon `jobs` read is intended; plan only removes the redundant duplicate RLS policy.
