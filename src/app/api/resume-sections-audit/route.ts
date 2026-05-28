import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { resume_id } = await req.json()
    if (!resume_id) return NextResponse.json({ error: 'resume_id is required' }, { status: 400 })

    // Fetch structured_data for this resume
    const { data: resume, error: fetchErr } = await supabase
        .from('resumes')
        .select('structured_data')
        .eq('id', resume_id)
        .eq('user_id', user.id)
        .single()

    if (fetchErr || !resume) {
        return NextResponse.json({ error: 'Resume not found' }, { status: 404 })
    }

    let sd = (resume as any).structured_data as any
    // Handle double-stringified JSON from n8n
    if (typeof sd === 'string') { try { sd = JSON.parse(sd) } catch { sd = {} } }
    if (typeof sd === 'string') { try { sd = JSON.parse(sd) } catch { sd = {} } }

    const hasExperience = Array.isArray(sd?.work_experience) && sd.work_experience.length > 0
    const hasEducation = Array.isArray(sd?.education) && sd.education.length > 0
    const hasSkills = !!(sd?.technical_skills?.languages || sd?.technical_skills?.tools || sd?.technical_skills?.frameworks || sd?.skills?.languages)
    const hasProjects = Array.isArray(sd?.projects) && sd.projects.length > 0
    const hasCertifications = Array.isArray(sd?.certifications) && sd.certifications.length > 0
    const hasAchievements = Array.isArray(sd?.achievements) && sd.achievements.length > 0
    const hasSummary = !!(sd?.professional_summary || sd?.summary)
    const hasLinks = !!(sd?.personal_info?.linkedin || sd?.personal_info?.github || sd?.linkedin || sd?.github)

    const missingSections: string[] = []
    if (!hasCertifications) missingSections.push('certifications')
    if (!hasAchievements) missingSections.push('achievements')
    if (!hasProjects) missingSections.push('projects')
    if (!hasLinks) missingSections.push('links')

    const { error: upsertErr } = await (supabase as any)
        .from('resume_sections_audit')
        .upsert({
            user_id: user.id,
            resume_id,
            has_experience: hasExperience,
            has_education: hasEducation,
            has_skills: hasSkills,
            has_projects: hasProjects,
            has_certifications: hasCertifications,
            has_achievements: hasAchievements,
            has_summary: hasSummary,
            has_links: hasLinks,
            missing_sections: missingSections,
            audited_at: new Date().toISOString(),
        }, { onConflict: 'user_id,resume_id' })

    if (upsertErr) {
        console.error('resume_sections_audit upsert error:', upsertErr)
        return NextResponse.json({ error: upsertErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, missing_sections: missingSections })
}
