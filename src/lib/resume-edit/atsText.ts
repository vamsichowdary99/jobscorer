// resuscore/src/lib/resume-edit/atsText.ts
//
// Plain-text ATS rendering of a ResumeEditorState — moved here from
// dashboard/resumes/page.tsx (sole previous owner) so it can be shared with
// the coverage calculation (client) and the rescore route (server).
import type { ResumeEditorState } from '@/lib/types'

export function generateATSText(state: ResumeEditorState): string {
    const lines: string[] = []
    if (state.profile.name) lines.push(state.profile.name.toUpperCase())
    const contact = [state.profile.email, state.profile.phone, state.profile.location, state.profile.linkedin, state.profile.github].filter(Boolean)
    if (contact.length) lines.push(contact.join(' | '))
    lines.push('')
    if (state.summary) { lines.push('SUMMARY'); lines.push(state.summary); lines.push('') }
    if (state.experience.length) {
        lines.push('EXPERIENCE')
        for (const exp of state.experience) {
            lines.push(`${exp.title} | ${exp.company}`)
            if (exp.startDate || exp.endDate) lines.push(`${exp.startDate || ''} – ${exp.endDate || 'Present'}`)
            for (const b of exp.bullets) lines.push(`- ${b}`)
            lines.push('')
        }
    }
    if (state.education.length) {
        lines.push('EDUCATION')
        for (const edu of state.education) {
            lines.push(`${edu.degree} | ${edu.school}`)
            if (edu.date) lines.push(edu.date)
            if (edu.gpa) lines.push(`GPA: ${edu.gpa}`)
        }
        lines.push('')
    }
    const allSkills = [state.skills.languages, state.skills.tools, state.skills.frameworks, state.skills.soft].filter(Boolean).join(', ')
    if (allSkills) { lines.push('SKILLS'); lines.push(allSkills); lines.push('') }
    if (state.projects.length) {
        lines.push('PROJECTS')
        for (const proj of state.projects) {
            lines.push(proj.name)
            if (proj.tech) lines.push(`Tech: ${proj.tech}`)
            for (const b of proj.bullets) lines.push(`- ${b}`)
            lines.push('')
        }
    }
    if (state.certifications.length) { lines.push('CERTIFICATIONS'); lines.push(...state.certifications); lines.push('') }
    if (state.achievements.length) { lines.push('ACHIEVEMENTS'); lines.push(...state.achievements); lines.push('') }
    return lines.join('\n')
}
