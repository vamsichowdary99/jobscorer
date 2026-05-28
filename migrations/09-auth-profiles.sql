-- ══════════════════════════════════════════════════════
-- Migration 09: Auth Profiles + RLS + Data Migration
-- Run in Supabase SQL Editor (uses service role, bypasses RLS)
-- ══════════════════════════════════════════════════════

-- ─── STEP 1: Create profiles table ────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- ─── STEP 2: Auto-create profile on signup ────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NEW.raw_user_meta_data ->> 'picture', '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ════════════════════════════════════════════════════════
-- STOP HERE. Sign up with your real account first.
-- Then run steps 3 and 4 below.
-- Find your UUID: SELECT id, email FROM auth.users;
-- ════════════════════════════════════════════════════════

-- ─── STEP 3: Migrate existing data ────────────────────
-- Replace 'YOUR-REAL-UUID' with your actual UUID from auth.users

-- UPDATE public.resumes SET user_id = 'YOUR-REAL-UUID' WHERE user_id = 'antigravity-user';
-- UPDATE public.user_job_matches SET user_id = 'YOUR-REAL-UUID' WHERE user_id = 'antigravity-user';
-- UPDATE public.optimized_resumes SET user_id = 'YOUR-REAL-UUID' WHERE user_id = 'antigravity-user';
-- UPDATE public.learning_paths SET user_id = 'YOUR-REAL-UUID' WHERE user_id = 'antigravity-user';
-- UPDATE public.job_ingestion_logs SET user_id = 'YOUR-REAL-UUID' WHERE user_id = 'antigravity-user';

-- ─── STEP 4: Lock down RLS (run AFTER data migration) ──

-- resumes
DROP POLICY IF EXISTS "Public resumes" ON public.resumes;
DROP POLICY IF EXISTS "Allow all" ON public.resumes;
CREATE POLICY "Users can select own resumes"
  ON public.resumes FOR SELECT USING (auth.uid()::text = user_id);
CREATE POLICY "Users can insert own resumes"
  ON public.resumes FOR INSERT WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "Users can update own resumes"
  ON public.resumes FOR UPDATE USING (auth.uid()::text = user_id);
CREATE POLICY "Users can delete own resumes"
  ON public.resumes FOR DELETE USING (auth.uid()::text = user_id);

-- user_job_matches
DROP POLICY IF EXISTS "Public user_job_matches" ON public.user_job_matches;
DROP POLICY IF EXISTS "Allow all" ON public.user_job_matches;
CREATE POLICY "Users can select own matches"
  ON public.user_job_matches FOR SELECT USING (auth.uid()::text = user_id);
CREATE POLICY "Users can insert own matches"
  ON public.user_job_matches FOR INSERT WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "Users can update own matches"
  ON public.user_job_matches FOR UPDATE USING (auth.uid()::text = user_id);

-- optimized_resumes
DROP POLICY IF EXISTS "Public optimized_resumes" ON public.optimized_resumes;
DROP POLICY IF EXISTS "Allow all" ON public.optimized_resumes;
CREATE POLICY "Users can select own optimized resumes"
  ON public.optimized_resumes FOR SELECT USING (auth.uid()::text = user_id);
CREATE POLICY "Users can insert own optimized resumes"
  ON public.optimized_resumes FOR INSERT WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "Users can update own optimized resumes"
  ON public.optimized_resumes FOR UPDATE USING (auth.uid()::text = user_id);

-- learning_paths
DROP POLICY IF EXISTS "Public learning_paths" ON public.learning_paths;
DROP POLICY IF EXISTS "Allow all" ON public.learning_paths;
CREATE POLICY "Users can select own learning paths"
  ON public.learning_paths FOR SELECT USING (auth.uid()::text = user_id);
CREATE POLICY "Users can insert own learning paths"
  ON public.learning_paths FOR INSERT WITH CHECK (auth.uid()::text = user_id);

-- jobs (shared — authenticated read only)
DROP POLICY IF EXISTS "Allow all" ON public.jobs;
DROP POLICY IF EXISTS "Public jobs" ON public.jobs;
CREATE POLICY "Authenticated users can read jobs"
  ON public.jobs FOR SELECT USING (auth.role() = 'authenticated');

-- company_research (shared — authenticated read only)
DROP POLICY IF EXISTS "Allow all" ON public.company_research;
DROP POLICY IF EXISTS "Public company_research" ON public.company_research;
CREATE POLICY "Authenticated users can read company research"
  ON public.company_research FOR SELECT USING (auth.role() = 'authenticated');
