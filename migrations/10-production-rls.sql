-- ══════════════════════════════════════════════════════
-- Migration 10: Production RLS gap closure (Phase 4b)
-- Run in Supabase SQL Editor, OR apply via Supabase MCP once re-authenticated.
-- Closes the RLS gaps noted in CLAUDE.md: job_ingestion_logs + resume_skills
-- had RLS disabled; jobss is an orphan typo-duplicate table.
-- ══════════════════════════════════════════════════════

-- ─── STEP 0: VERIFY before the destructive drops below ───
-- Run these first and confirm the counts are 0 (or data you don't need):
--   select count(*) as jobss_rows        from public.jobss;
--   select count(*) as resume_skills_rows from public.resume_skills;

-- ─── STEP 1 (SAFE): RLS on job_ingestion_logs ─────────────
-- Writes happen via the service role (n8n / server routes), which bypasses
-- RLS, so only a read policy for authenticated users is needed.
ALTER TABLE public.job_ingestion_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read ingestion logs" ON public.job_ingestion_logs;
CREATE POLICY "Authenticated can read ingestion logs"
  ON public.job_ingestion_logs FOR SELECT
  USING (auth.role() = 'authenticated');

-- ─── STEP 2 (SAFE): RLS on resume_skills ──────────────────
-- Table is currently unused but RLS was disabled (anon read/write possible).
-- Enabling RLS makes it default-deny; the owner-via-resume policy lets a user
-- read rows tied to their own resume if any code path ever uses it. Service
-- role (server) bypasses RLS for writes.
ALTER TABLE public.resume_skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner can read resume skills" ON public.resume_skills;
CREATE POLICY "Owner can read resume skills"
  ON public.resume_skills FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.resumes r
      WHERE r.id = resume_skills.resume_id
        AND r.user_id = auth.uid()::text
    )
  );

-- ─── STEP 3 (DESTRUCTIVE — uncomment only after STEP 0 verification) ───
-- jobss is a typo-duplicate of `jobs` with no application references.
-- DROP TABLE IF EXISTS public.jobss;

-- Optionally drop resume_skills entirely instead of keeping it (it is unused).
-- Only do this if STEP 0 showed 0 rows and you are sure nothing reads it.
-- DROP TABLE IF EXISTS public.resume_skills;

-- ─── STEP 4: VERIFY after applying ────────────────────────
-- Expect RLS enabled (rowsecurity = true) on both tables:
--   select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename in ('job_ingestion_logs','resume_skills');
-- Then run the Supabase security advisors and confirm no "RLS disabled" findings
-- remain on user-data tables.
