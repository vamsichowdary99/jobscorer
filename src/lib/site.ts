// Single source of truth for the public site origin. Set NEXT_PUBLIC_SITE_URL
// in production (e.g. https://resuscore.app) — the fallback is a placeholder.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
  'https://resuscore.app'
).replace(/\/$/, '');

export const SITE_NAME = 'JobScorer';
export const SITE_TAGLINE = 'AI-Powered Job Matching & Resume Optimization';
export const SITE_DESCRIPTION =
  'Upload your resume, discover jobs, and get AI-scored matches with optimization recommendations. Stop searching, start matching.';
