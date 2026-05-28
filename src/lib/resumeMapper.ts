import type { OptimizedResumeData, ParsedResume } from './types'

// ── OpenResume interfaces (matches PdfDocument.tsx schema) ───

export interface OpenResumeProfile {
  name: string
  email: string
  phone: string
  url: string
  summary: string
  location: string
}

export interface OpenResumeWorkExperience {
  company: string
  jobTitle: string
  date: string
  descriptions: string[]
}

export interface OpenResumeEducation {
  school: string
  degree: string
  date: string
  gpa: string
  descriptions: string[]
}

export interface OpenResumeProject {
  project: string
  date: string
  descriptions: string[]
}

export interface OpenResumeSkills {
  featuredSkills: { skill: string; rating: number }[]
  descriptions: string[]
}

export interface OpenResume {
  profile: OpenResumeProfile
  workExperiences: OpenResumeWorkExperience[]
  educations: OpenResumeEducation[]
  projects: OpenResumeProject[]
  skills: OpenResumeSkills
}

// ── Helpers ─────────────────────────────────────────────────

/**
 * Normalises a date-range pair into "Start – End".
 * Handles "present", "current", empty/undefined gracefully.
 */
function formatDateRange(start?: string, end?: string): string {
  const normalise = (d?: string): string => {
    if (!d || !d.trim()) return ''
    const lower = d.trim().toLowerCase()
    if (lower === 'present' || lower === 'current') return 'Present'
    return d.trim()
  }

  const s = normalise(start)
  const e = normalise(end)

  if (s && e) return `${s} \u2013 ${e}`
  if (s) return s
  if (e) return e
  return ''
}

// ── Main mapper ─────────────────────────────────────────────

/**
 * Maps OptimizedResumeData (from the AI optimiser) + the original
 * ParsedResume into the OpenResume schema consumed by PdfDocument.tsx.
 */
export function mapToOpenResumeSchema(
  optimized: OptimizedResumeData,
  original: ParsedResume | null
): OpenResume {
  // ── Profile ──────────────────────────────────────────────
  // Priority: optimized.personal_info (injected by n8n) → original structured_data.personal_info → original root fields
  const rawOrig = original as any
  const profile: OpenResumeProfile = {
    name: optimized.personal_info?.full_name || rawOrig?.personal_info?.full_name || original?.name || '',
    email: optimized.personal_info?.email || rawOrig?.personal_info?.email || original?.email || '',
    phone: optimized.personal_info?.phone || rawOrig?.personal_info?.phone || original?.phone || '',
    url: '',
    summary: optimized.optimized_summary ?? '',
    location: optimized.personal_info?.location || rawOrig?.personal_info?.location || original?.location || '',
  }

  // ── Work Experiences ─────────────────────────────────────
  const workExperiences: OpenResumeWorkExperience[] = (
    optimized.optimized_experience ?? []
  ).map((exp) => ({
    company: exp.company ?? '',
    jobTitle: exp.title ?? '',
    date: formatDateRange(exp.start_date, exp.end_date),
    descriptions: exp.bullet_points ?? [],
  }))

  // ── Educations ───────────────────────────────────────────
  const educations: OpenResumeEducation[] = (
    optimized.education ?? []
  ).map((edu) => ({
    school: edu.institution ?? '',
    degree: edu.degree ?? '',
    date: edu.date ?? '',
    gpa: '',
    descriptions: [],
  }))

  // ── Projects ─────────────────────────────────────────────
  const projects: OpenResumeProject[] = (
    optimized.projects ?? []
  ).map((proj) => ({
    project: proj.name ?? '',
    date: proj.date ?? '',
    descriptions: proj.bullet_points ?? [],
  }))

  // ── Skills ───────────────────────────────────────────────
  const technical = optimized.optimized_skills?.technical ?? []
  const tools = optimized.optimized_skills?.tools ?? []
  const softSkills = optimized.optimized_skills?.soft_skills ?? []

  // First 6 from technical + tools, rating 4
  const featuredSkills = [...technical, ...tools]
    .slice(0, 6)
    .map((skill) => ({ skill, rating: 4 }))

  const descriptions: string[] = []
  if (technical.length > 0) {
    descriptions.push(`Technical: ${technical.join(', ')}`)
  }
  if (tools.length > 0) {
    descriptions.push(`Tools: ${tools.join(', ')}`)
  }
  if (softSkills.length > 0) {
    descriptions.push(`Core Competencies: ${softSkills.join(', ')}`)
  }

  const skills: OpenResumeSkills = { featuredSkills, descriptions }

  return { profile, workExperiences, educations, projects, skills }
}
