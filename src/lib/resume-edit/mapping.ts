// resuscore/src/lib/resume-edit/mapping.ts
import type { ResumeEditorState, OptimizedResumeData } from '@/lib/types'

/**
 * optimized_data can arrive from Supabase double-stringified (n8n quirk — see
 * CLAUDE.md Known Issues #1 and the same defensive parse in
 * src/trigger/scoreJobs.ts and src/app/api/resume/update-structured/route.ts).
 * Unwrap however many layers of JSON.stringify were applied so callers
 * always get a real object.
 */
export function normalizeOptimizedData(raw: unknown): OptimizedResumeData {
    let data: unknown = raw
    while (typeof data === 'string') {
        try { data = JSON.parse(data) } catch { break }
    }
    return (data && typeof data === 'object' ? data : {}) as OptimizedResumeData
}

function splitList(value: string): string[] {
    return value.split(',').map(s => s.trim()).filter(Boolean)
}

/**
 * Inverse of mapToEditorState (src/app/dashboard/resumes/page.tsx). Only
 * writes fields mapToEditorState actually reads back out of optimized_data —
 * gpa and projects[].tech are read via an `(x as any)` fallback there, so
 * they're included as ad hoc keys beyond the declared Optimized* types.
 * skills.frameworks, education[].coursework, and profile.linkedin/github/
 * portfolio are sourced by mapToEditorState exclusively from the original
 * uploaded resume, never from optimized_data — writing them here would be a
 * dead write invisible after refresh, so they're intentionally left out.
 *
 * Spreads over `existing` so unmodeled fields (ats_feedback, optimization_notes,
 * keyword_alignment_score, before_after_experience, skills_delta,
 * career_action_plan, …) survive the round trip untouched.
 */
export function editorStateToOptimizedData(
    state: ResumeEditorState,
    existing: OptimizedResumeData,
): OptimizedResumeData {
    const personal_info = {
        ...existing.personal_info,
        full_name: state.profile.name,
        email: state.profile.email,
        phone: state.profile.phone,
        location: state.profile.location,
    }

    const education = state.education.map((e, i) => ({
        ...(existing.education?.[i] ?? {}),
        institution: e.school,
        degree: e.degree,
        date: e.date,
        gpa: e.gpa, // ad hoc — read back via `(edu as any).gpa`
    }))

    const optimized_experience = state.experience.map(e => ({
        company: e.company,
        title: e.title,
        start_date: e.startDate,
        end_date: e.endDate,
        location: e.location,
        bullet_points: e.bullets,
    }))

    const projects = state.projects.map((p, i) => ({
        ...(existing.projects?.[i] ?? {}),
        name: p.name,
        date: p.date,
        bullet_points: p.bullets,
        tech: p.tech, // ad hoc — read back via `(proj as any).tech`
    }))

    const optimized_skills = {
        ...existing.optimized_skills,
        technical: splitList(state.skills.languages),
        tools: splitList(state.skills.tools),
        soft_skills: splitList(state.skills.soft),
    }

    return {
        ...existing,
        personal_info,
        optimized_summary: state.summary,
        optimized_skills,
        optimized_experience,
        projects,
        education,
        certifications: state.certifications,
        achievements: state.achievements,
    }
}
