export interface Database {
    public: {
        Tables: {
            jobs: {
                Row: Job
                Insert: Omit<Job, 'id' | 'created_at'>
                Update: Partial<Omit<Job, 'id'>>
            }
            resumes: {
                Row: Resume
                Insert: Omit<Resume, 'id' | 'created_at'>
                Update: Partial<Omit<Resume, 'id'>>
            }
            resume_skills: {
                Row: ResumeSkill
                Insert: Omit<ResumeSkill, 'id'>
                Update: Partial<Omit<ResumeSkill, 'id'>>
            }
            user_job_matches: {
                Row: UserJobMatch
                Insert: Omit<UserJobMatch, 'id' | 'created_at'>
                Update: Partial<Omit<UserJobMatch, 'id'>>
            }
            job_ingestion_logs: {
                Row: JobIngestionLog
                Insert: Omit<JobIngestionLog, 'id' | 'created_at'>
                Update: Partial<Omit<JobIngestionLog, 'id'>>
            }
            optimized_resumes: {
                Row: OptimizedResume
                Insert: Omit<OptimizedResume, 'id' | 'created_at' | 'updated_at'>
                Update: Partial<Omit<OptimizedResume, 'id'>>
            }
            resume_build_recommendations: {
                Row: ResumeBuildRecommendation
                Insert: Omit<ResumeBuildRecommendation, 'id' | 'created_at' | 'updated_at'>
                Update: Partial<Omit<ResumeBuildRecommendation, 'id'>>
            }
            company_research: {
                Row: CompanyResearch
                Insert: Omit<CompanyResearch, 'id' | 'created_at'>
                Update: Partial<Omit<CompanyResearch, 'id'>>
            }
            learning_paths: {
                Row: LearningPath
                Insert: Omit<LearningPath, 'id' | 'created_at'>
                Update: Partial<Omit<LearningPath, 'id'>>
            }
            user_profile_data: {
                Row: UserProfileData
                Insert: Omit<UserProfileData, 'id'>
                Update: Partial<Omit<UserProfileData, 'id'>>
            }
            resume_sections_audit: {
                Row: ResumeSectionsAudit
                Insert: Omit<ResumeSectionsAudit, 'id' | 'audited_at'>
                Update: Partial<Omit<ResumeSectionsAudit, 'id'>>
            }
            gap_form_responses: {
                Row: GapFormResponse
                Insert: Omit<GapFormResponse, 'id' | 'submitted_at'>
                Update: Partial<Omit<GapFormResponse, 'id'>>
            }
            job_embeddings: {
                Row: JobEmbedding
                Insert: Omit<JobEmbedding, 'id' | 'created_at'>
                Update: Partial<Omit<JobEmbedding, 'id'>>
            }
            resume_embeddings: {
                Row: ResumeEmbedding
                Insert: Omit<ResumeEmbedding, 'id' | 'created_at'>
                Update: Partial<Omit<ResumeEmbedding, 'id'>>
            }
        }
    }
}

// pgvector embeddings — populated by Phase 5 pipeline, queried by match_jobs RPC.
// `embedding` is a vector(1536); the Postgres pgvector type serialises to a
// stringified JSON array (e.g. "[0.123,-0.456,...]") through PostgREST. Most
// callers won't read it directly — they go through the match_jobs function.
export interface JobEmbedding {
    id: string
    job_id: string
    embedding: string
    content: string
    created_at: string
}

export interface ResumeEmbedding {
    id: string
    resume_id: string
    embedding: string
    content: string
    created_at: string
}

// Return shape of the match_jobs(query_embedding, match_count, similarity_threshold, filter_experience_level) RPC.
export interface MatchJobsResult {
    job_id: string
    similarity: number
    content: string
}

export interface LearningResource {
    step: number
    title: string
    type: 'course' | 'youtube' | 'lab' | 'article'
    platform: string
    provider?: string
    url: string
    duration: string
    duration_weeks?: number
    free: boolean
    cost_inr?: number
    india_specific?: boolean
    fresher_friendly?: boolean
    channel?: string
    difficulty?: 'beginner' | 'intermediate' | 'advanced'
    summary?: string
}

export interface LearningPath {
    id: string
    user_id: string
    job_id: string | null
    skill_name: string
    importance: 'high' | 'medium' | 'low' | null
    why_it_matters: string | null
    time_estimate: string | null
    prerequisites?: string | null
    key_takeaways?: string[] | null
    resources: LearningResource[]
    created_at: string
    // Block B additions
    severity?: 'hard_blocker' | 'nice_to_have' | null
    priority_rank?: number | null
    provider?: string | null
    cost_inr?: number | null
    duration_weeks?: number | null
    india_specific?: boolean | null
    fresher_friendly?: boolean | null
    milestone_check?: string | null
    next_step_action?: string | null
    rationale?: string | null
}

// Block B: structured gap analysis from AI Job Scorer
export interface JobGap {
    skill: string
    severity: 'hard_blocker' | 'nice_to_have'
    has_adjacent_evidence: boolean
    adjacent_from: string | null
    mitigation_hint: string
    score_impact?: number  // 0–15: score points this gap costs; absent on pre-v2 rows
}

// Matched skill with resume evidence (v2 scoring schema — absent on pre-v2 rows)
export interface MatchedSkillEvidence {
    skill: string
    evidence: string  // e.g. "Multi-Tier AWS Deployment Project"
}

export interface MatchConfidence {
    level: 'high' | 'medium' | 'low'
    reason: string
}

export interface FastestPathStep {
    action: string
    time: string
}

export interface FastestPath {
    steps: FastestPathStep[]
    weeks_total: number
    projected_score_range: string
}

export interface ApplicationOutlook {
    interview_chance: 'high' | 'medium' | 'low'
    competition_level: 'high' | 'medium' | 'low'
}

export interface UserProfileData {
    id: string
    user_id: string
    certifications: string[]
    achievements: string[]
    projects: { name: string; description: string; tech: string[]; link?: string }[]
    links: { github?: string; portfolio?: string; linkedin?: string; other?: string }
    updated_at: string
}

export interface ResumeSectionsAudit {
    id: string
    user_id: string
    resume_id: string
    has_experience: boolean
    has_education: boolean
    has_skills: boolean
    has_projects: boolean
    has_certifications: boolean
    has_achievements: boolean
    has_summary: boolean
    has_links: boolean
    missing_sections: string[]
    audited_at: string
}

export interface GapFormResponse {
    id: string
    user_id: string
    resume_id: string
    section_name: string
    was_skipped: boolean
    data: unknown
    submitted_at: string
}

export interface Job {
    id: string
    created_at: string
    source: string
    source_id: string
    title: string
    company: string | null
    location: string | null
    description: string | null
    salary: string | null
    posted_date: string | null
    schedule_type: string | null
    source_url: string | null
    experience_level: string | null
    required_skills: string[] | null
    legitimacy_tier?: 'verified' | 'proceed_with_caution' | 'suspicious' | 'unknown' | null
    legitimacy_signals?: {
        posting_age_days?: number | null
        jd_specificity_score?: number
        matched_tech_keywords?: string[]
        red_phrase_matches?: string[]
        has_walk_in_phrase?: boolean
        salary_disclosed?: boolean
        has_company_name?: boolean
        apply_destination_type?: string
        jd_length_chars?: number
        spam_title?: boolean
        _composite_score?: number
    } | null
    // Job-level application status (open/closed/expired/unknown). NOTE: distinct
    // from the kanban tracker's `ApplicationStatus` in api.ts — this is whether
    // the listing itself still accepts applications.
    application_status?: import('./jobs/applicationStatus').JobApplicationStatus | null
}

export interface ResumeAiAnalysis {
    market_readiness_score: number
    headline: string
    biggest_asset: string
    top_action: string
    strengths: string[]
    gaps: string[]
    full_assessment: string
    // Playbook fields — older resumes parsed before the prompt update won't have them.
    recommended_roles?: Array<{ role: string; fit: 'strong' | 'okay' | 'stretch'; why: string }>
    target_companies?: { start_here?: string; stretch_for?: string; skip_for_now?: string }
    cut_or_condense?: string[]
    recommended_certifications?: Array<{ name: string; priority: 'high' | 'medium' | 'low'; reason: string }>
}

export interface Resume {
    id: string
    created_at: string
    user_id: string
    original_filename: string | null
    file_url: string | null
    status: string | null
    raw_text: string | null
    structured_data: ParsedResume | null
    parsing_confidence: number | null
    ai_analysis: ResumeAiAnalysis | null
    is_primary?: boolean | null
}

export interface ParsedResume {
    name: string
    email: string
    phone: string
    location?: string
    professional_summary: string
    technical_skills: string[]
    work_history: WorkExperience[]
    education: Education[]
    projects?: Project[]
}

export interface WorkExperience {
    title: string
    company: string
    start_date: string
    end_date: string
    location: string
    responsibilities: string[]
}

export interface Education {
    degree: string
    institution: string
    graduation_date: string
}

export interface Project {
    name: string
    description: string
    technologies: string[]
}

export interface ResumeSkill {
    id: string
    resume_id: string | null
    skill: string
    category: string | null
}

export interface UserJobMatch {
    id: string
    created_at: string
    user_id: string
    resume_id: string | null
    job_id: string | null
    relevance_score: number | null
    recommendation: string | null
    // v2 scoring: each item may be {skill, evidence}; pre-v2 rows contain plain strings
    matched_skills: Array<MatchedSkillEvidence | string> | null
    missing_skills: string[] | null
    ai_reasoning: string | null
    gaps?: JobGap[] | null
    // v2 scoring fields — absent on pre-v2 rows
    confidence?: MatchConfidence | null
    fastest_path?: FastestPath | null
    rejection_reason?: string | null
    application_outlook?: ApplicationOutlook | null
    optimized_score?: number | null
    profile_strengths?: string[] | null
}

export interface JobIngestionLog {
    id: string
    created_at: string
    user_id: string | null
    role: string | null
    location: string | null
    experience_level: string | null
    status: string | null
    total_jobs_fetched: number | null
    new_jobs_added: number | null
    duplicates_skipped: number | null
    errors: Record<string, unknown> | null
    completed_at: string | null
}

export interface QuickIntel {
    verdict: string
    fit_reason: string
    top_3_actions: string[]
    watch_out_for: string
}

export interface TailoredResume {
    professional_summary?: string
    skills_section?: {
        primary: string[]
        secondary: string[]
    }
    experience_bullets?: Array<{ role: string; tailored_bullets: string[] }>
    project_highlights?: Array<{ project_name: string; tailored_description: string }>
    ats_keywords?: string[]
    cover_letter_hook?: string
}

export interface AiAnalysis {
    quick_intel?: QuickIntel
    company_theory?: {
        company_brief?: string
        industry_context?: string
        culture_deep_dive?: string
        tech_story?: string
        why_worth_joining?: string
    }
    skills_match?: {
        matching_skills?: string[]
        skill_gaps?: string[]
        match_score?: number
        emphasis_areas?: string[]
    }
    resume_tips?: Array<{
        tip: string
        reason: string
        priority: 'high' | 'medium' | 'low'
    }>
    interview_insights?: {
        likely_topics?: string[]
        cultural_fit_signals?: string[]
        talking_points?: string[]
        questions_to_ask?: string[]
    }
    tailored_resume?: TailoredResume
}

export interface CompanyResearch {
    id: string
    company_name: string
    domain: string
    overview: string | null
    industry: string | null
    mission: string | null
    size_stage: string | null
    headquarters: string | null
    tech_stack: {
        languages?: string[]
        frameworks?: string[]
        platforms?: string[]
        tools?: string[]
        cloud?: string[]
        databases?: string[]
    } | null
    culture: {
        work_style?: string
        growth_stage?: string
        team_culture?: string
        values?: string[]
        // Legacy fields, retained for backward compat with older cached rows:
        core_values?: string[]
        culture_keywords?: string[]
    } | null
    hiring_signals: {
        urgency?: string
        team?: string
        key_requirements?: string[]
        nice_to_haves?: string[]
        // Legacy fields, retained for backward compat:
        current_active_roles?: string[]
        focus_areas?: string[]
        recruitment_volume?: string
    } | null
    resume_optimization_insights: {
        key_skills_company_values?: string[]
        cultural_alignment_keywords?: string[]
        unique_company_aspects?: string[]
    } | null
    role_specific_insights?: {
        domain?: string
        key_findings?: string[]
        must_know_for_role?: string[]
        nice_to_have?: string[]
    } | null
    created_at: string
    ai_analysis?: AiAnalysis
}

export type ScoreLevel = 'excellent' | 'good' | 'fair' | 'low'

export function getScoreLevel(score: number): ScoreLevel {
    if (score >= 80) return 'excellent'
    if (score >= 60) return 'good'
    if (score >= 40) return 'fair'
    return 'low'
}

export function getScoreColor(score: number): string {
    if (score >= 80) return '#10b981'
    if (score >= 60) return '#f59e0b'
    return '#ef4444'
}

// ── Optimized Resume ──────────────────────────────────────────

export interface OptimizedSkills {
    technical: string[]
    tools: string[]
    soft_skills: string[]
}

export interface OptimizedExperience {
    company: string
    title: string
    start_date: string
    end_date: string
    location: string
    bullet_points: string[]
}

export interface OptimizedProject {
    name: string
    date: string
    bullet_points: string[]
}

export interface OptimizedEducation {
    degree: string
    institution: string
    date: string
}

export interface OptimizedPersonalInfo {
    full_name: string
    email: string
    phone: string
    location: string
}

export interface AtsFeedback {
    explanation: string
    strongest_bullet: string
    top_keyword_gap: string
    predicted_callback: string
}

export interface BeforeAfterRole {
    company: string
    title: string
    original_bullets: string[]
    optimized_bullets: string[]
    changes_summary: string
}

export interface SkillsDelta {
    prioritized: string[]
    deprioritized: string[]
    reasoning: string
}

export interface CareerActionPlan {
    suggested_certifications: { name: string; reason: string; effort: string }[]
    suggested_projects: { name: string; description: string; tech: string[]; impact: string }[]
    quick_wins: string[]
}

export interface OptimizedResumeData {
    personal_info?: OptimizedPersonalInfo
    optimized_summary: string
    optimized_skills: OptimizedSkills
    optimized_experience: OptimizedExperience[]
    projects: OptimizedProject[]
    education: OptimizedEducation[]
    certifications?: string[]
    achievements?: string[]
    keyword_alignment_score: number
    optimization_notes: string[]
    ats_feedback?: AtsFeedback
    before_after_experience?: BeforeAfterRole[]
    skills_delta?: SkillsDelta
    career_action_plan?: CareerActionPlan
}

export interface OptimizedResume {
    id: string
    created_at: string
    updated_at: string
    user_id: string
    resume_id: string
    job_id: string
    optimized_data: OptimizedResumeData
    keyword_alignment_score: number | null
    optimization_notes: string[] | null
}

// ── Build Plan (recommendation popup before resume creation) ──────────────
// Generated fresh by the "Build Plan Generator" n8n workflow (does NOT reuse
// career_action_plan). Each item carries a gap-derived impact_pct and the gap
// skills it addresses, so the UI can show an honest "+X% interview chances".

// A real public GitHub repo surfaced as build inspiration for a project idea.
export interface BuildRecoExampleRepo {
    name: string
    full_name: string
    html_url: string
    stars: number
    description: string | null
}

export interface BuildRecoCertification {
    id: string
    name: string
    provider: string
    reason: string
    effort: string
    addresses_gaps: string[]
    severity_addressed: 'hard_blocker' | 'nice_to_have'
    impact_pct: number
    learning_skill?: string // drives the "Learn it" deep-link
}

export interface BuildRecoProject {
    id: string
    name: string
    description: string
    tech: string[]
    addresses_gaps: string[]
    severity_addressed: 'hard_blocker' | 'nice_to_have'
    impact_pct: number
    example_repos: BuildRecoExampleRepo[]
    learning_skill?: string
}

export interface BuildRecoLearningLink {
    id: string
    skill: string
    why: string
    severity: 'hard_blocker' | 'nice_to_have'
    impact_pct: number
}

export interface BuildPlan {
    certifications: BuildRecoCertification[]
    projects: BuildRecoProject[]
    learning_links: BuildRecoLearningLink[]
    generated_at: string
}

// An item the user accepted in the modal, passed inline into the optimizer.
// framing_hint enforces honest "in progress / planned" wording on the resume.
export interface AcceptedRecommendation {
    type: 'certification' | 'project'
    name: string
    tech?: string[]
    framing_hint: string
}

// Row in resume_build_recommendations (caches a generated BuildPlan).
export interface ResumeBuildRecommendation {
    id: string
    user_id: string
    resume_id: string
    job_id: string
    recommendations: BuildPlan
    gap_snapshot: JobGap[] | null
    created_at: string
    updated_at: string
}
