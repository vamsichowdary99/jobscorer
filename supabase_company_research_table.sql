-- Create company_research table for caching Firecrawl company research globally
CREATE TABLE IF NOT EXISTS company_research (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name text NOT NULL,
  domain text,
  overview text,
  industry text,
  mission text,
  size_stage text,
  headquarters text,
  tech_stack jsonb DEFAULT '{}',
  culture jsonb DEFAULT '{}',
  hiring_signals jsonb DEFAULT '{}',
  resume_optimization_insights jsonb DEFAULT '{}',
  source_url text,
  raw_research text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for fast cache lookups by domain
CREATE INDEX IF NOT EXISTS idx_company_research_domain ON company_research (domain);

-- Index for company name lookups
CREATE INDEX IF NOT EXISTS idx_company_research_name ON company_research (lower(company_name));

-- Enable Row Level Security (allow all for now since this is globally cached data)
ALTER TABLE company_research ENABLE ROW LEVEL SECURITY;

-- Policy: allow read access for all authenticated users
CREATE POLICY "Allow read access for all users" ON company_research
  FOR SELECT USING (true);

-- Policy: allow insert for all authenticated users
CREATE POLICY "Allow insert for all users" ON company_research
  FOR INSERT WITH CHECK (true);

-- Policy: allow update for all users
CREATE POLICY "Allow update for all users" ON company_research
  FOR UPDATE USING (true);
