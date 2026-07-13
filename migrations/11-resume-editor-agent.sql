-- Phase 1 of plans/21-resume-assistant-real-backend.md — persistence for the
-- Resume Studio Assistant (manual edits + AI-applied edits + undo).
--
-- optimized_resumes already has an UPDATE RLS policy scoped to user_id
-- ("Users can update own optimized resumes", USING auth.uid()::text = user_id)
-- — verified via pg_policies before writing this migration, no new policy needed.

ALTER TABLE public.optimized_resumes
  ADD COLUMN IF NOT EXISTS edit_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ats_keywords JSONB,   -- {keywords:[{term,weight,variants[]}], extracted_at}  (used Phase 3)
  ADD COLUMN IF NOT EXISTS live_score   JSONB,   -- {score, matched_skills, missing_skills, reasoning, scored_at}  (Phase 3)
  ADD COLUMN IF NOT EXISTS suggestions  JSONB;   -- cached AI audit {items[], generated_at, edits_since}  (Phase 3)
