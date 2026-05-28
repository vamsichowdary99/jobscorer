export function slug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    || 'na';
}

export const KEY = {
  jobs: (role: string, location: string, level: string) =>
    `jobs:${slug(role)}:${slug(location)}:${slug(level)}`,
  score: (resumeId: string, jobId: string) =>
    `score:${resumeId}:${jobId}`,
  scorePrefix: (resumeId: string) =>
    `score:${resumeId}:`,
  company: (companyName: string) =>
    `company:${slug(companyName)}`,
  companyAi: (companyName: string, resumeId: string, jobId: string) =>
    `companyAi:${slug(companyName)}:${resumeId}:${jobId || 'no-job'}`,
  stats: (userId: string) =>
    `stats:${userId}`,
} as const;

export const TTL = {
  JOBS: 60 * 60 * 6,        // 6 hours
  SCORE: 60 * 60 * 24,      // 24 hours
  COMPANY: 60 * 60 * 24 * 7, // 7 days (candidate-agnostic company facts)
  COMPANY_AI: 60 * 60 * 24, // 24 hours (candidate-tailored AI analysis)
  STATS: 60 * 15,           // 15 minutes
} as const;