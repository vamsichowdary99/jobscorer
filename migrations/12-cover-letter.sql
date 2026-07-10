-- Plan 22 — Cover Letter Tab (replaces "What ATS Sees" in Resume Studio).
--
-- optimized_resumes already has an UPDATE RLS policy scoped to user_id
-- ("Users can update own optimized resumes", USING auth.uid()::text = user_id)
-- — the column rides that existing policy, no new RLS needed.

ALTER TABLE public.optimized_resumes ADD COLUMN IF NOT EXISTS cover_letter jsonb;
COMMENT ON COLUMN public.optimized_resumes.cover_letter IS
  'AI cover letter: {greeting, body_paragraphs[], closing, signature, generated_at, model}. NULL = not generated.';
