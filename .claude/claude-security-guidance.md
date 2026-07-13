# JobScorer / resuscore security rules

- `SUPABASE_SERVICE_ROLE_KEY` and `RAZORPAY_KEY_SECRET` are server-only. Never import them into a
  client component, never send them to the browser, never log them.
- `/api/billing/webhook` (verified via `RAZORPAY_WEBHOOK_SECRET`) is the ONLY source of truth for
  flipping a user's plan. `/api/billing/subscribe` and `/api/billing/verify` must never write
  subscription status themselves — client-reported payment success is not trustworthy.
- Any Supabase table write or RPC that determines "whose row is this" must derive the user from
  `auth.uid()` server-side (see `report_job_status` RPC pattern), never from a client-supplied
  user_id/job_id pair. Trusting a client-supplied identifier here is an IDOR.
- `/api/rag/*` routes are guarded by `N8N_INTERNAL_TOKEN` (checked via `X-Internal-Token` header).
  Any new route touching `job_embeddings` / `resume_embeddings` must keep this check — those tables
  have RLS enabled with no policies, so they're safe only because nothing client-side reads/writes
  them directly.
- `/api/admin/*` routes are service-role-token-gated maintenance endpoints. Don't relax that gate to
  make local testing easier.
- `queue_processor_lock` currently has RLS disabled (known issue, flagged by Supabase advisor). Any
  change touching this table should either fix that (RLS + service-role-only policy, added in the
  same migration so the Queue Processor can still acquire the lock) or explicitly not make the
  exposure worse.
- Never put an LLM call (scoring, parsing, optimization) directly in a Next.js API route — per
  CLAUDE.md architecture principle, that always belongs in n8n or Trigger.dev. A route calling
  OpenAI/Anthropic directly outside those two paths is itself a red flag, not just a style issue.
