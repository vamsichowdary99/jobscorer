'use client'

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import { Reorder } from 'framer-motion'
import type { OptimizedResumeData, ParsedResume, BeforeAfterRole, SkillsDelta, CareerActionPlan, Resume, ResumeEditorState, ExperienceEntry, EducationEntry, ProjectEntry, LeadershipEntry, UserJobMatch, ProjectEvidence } from '@/lib/types'
import { fetchAllOptimizedResumes, fetchResumeById, fetchResumes, fetchUserJobMatch, fetchConfirmedProjects, triggerTrimToFit } from '@/lib/api'
import TemplatePickerModal, { type TemplateId } from '@/components/TemplatePickerModal'
import { TEMPLATES, TEMPLATE_IMAGES } from '@/templates/catalog'
import { useAuth } from '@/components/providers/AuthProvider'
import { usePreviewDecorations, decorationKey, PreviewDecorationsProvider } from '@/components/resume-editor/PreviewDecorations'
import { A } from '@/components/resume-editor/tokens'
import { AssistantPanel } from '@/components/resume-editor/AssistantPanel'
import { MobileAssistantSheet } from '@/components/resume-editor/MobileAssistantSheet'
import { useAssistant } from '@/components/resume-editor/useAssistant'
import { CoverLetterView, useCoverLetter } from '@/components/resume-editor/CoverLetterView'
import MobilePreviewScaler from '@/components/MobilePreviewScaler'
import { persistEditorState } from '@/lib/resume-edit/persist'
import { generateATSText } from '@/lib/resume-edit/atsText'
import { computeKeywordCoverage } from '@/lib/resume-edit/coverage'
import { LAYOUT_PRESETS, detectPresetKey } from '@/lib/resume-edit/layoutPresets'
import { measureBudget, type BudgetResult } from '@/lib/resume-edit/budget'
import { rankSectionsForTrim, type SectionTrimSuggestion } from '@/lib/resume-edit/budgetOptimizer'
import { findProjectSwapNudge, type ProjectSwapNudge } from '@/lib/resume-edit/projectNudge'
import { applyTrimChanges, isTrimEmpty, type TrimChanges } from '@/lib/resume-edit/trimToFit'
import TrimReviewPanel from '@/components/resume-editor/TrimReviewPanel'
import { M } from '@/lib/meridianTokens'

interface SavedResumeEntry {
    id: string
    resume_id: string
    job_id: string
    updated_at: string
    optimized_data: OptimizedResumeData
    keyword_alignment_score: number | null
    job: { id: string; title: string; company: string; location: string } | null
}

// ── Meridian Design Tokens ── moved to '@/lib/meridianTokens' (imported above)
// to avoid a circular import with components/resume-editor/tokens.ts. ──────

// Legacy alias kept so unchanged sub-components still compile
const T = {
    primary: M.accent,
    primaryDark: '#155bd4',
    primaryGlow: M.accentLight,
    primaryShadow: `0 2px 12px ${M.accent}40`,
    surface: M.white,
    bg: M.surface,
    bgAlt: M.surfaceAlt,
    border: M.border,
    borderLight: M.borderLight,
    text: M.text,
    textSecondary: M.textMid,
    textMuted: M.textMuted,
    // Mapped to light theme — sub-components that referenced these dark vars
    // now render on white surfaces with Meridian tokens.
    editorBg: M.white,
    editorSurface: M.white,
    editorBorder: M.border,
    editorText: M.text,
    editorTextMuted: M.textMuted,
    radius: '10px',
    radiusSm: '7px',
}

const EMPTY_STATE: ResumeEditorState = {
    profile: { name: '', headline: '', email: '', phone: '', location: '', linkedin: '', github: '', portfolio: '' },
    summary: '',
    education: [],
    experience: [],
    projects: [],
    skills: { languages: '', tools: '', frameworks: '', soft: '' },
    leadership: [],
    certifications: [],
    achievements: [],
}

// Education previews fall back to whichever of degree/school is present when
// the other is blank (e.g. `edu.degree || edu.school`) — this guards the
// second line so that fallback value isn't then rendered again as a duplicate.
const sameText = (a: string | null | undefined, b: string | null | undefined): boolean => {
    const normA = (a ?? '').trim().toLowerCase()
    const normB = (b ?? '').trim().toLowerCase()
    return normA !== '' && normA === normB
}

// ── Map OptimizedResumeData + ParsedResume → ResumeEditorState ──
function mapToEditorState(optimized: OptimizedResumeData, original: ParsedResume | null): ResumeEditorState {
    // Priority: optimized.personal_info (injected by n8n) → original structured_data.personal_info → original root fields
    const rawOrig = original as any
    const profile = {
        name: optimized.personal_info?.full_name || rawOrig?.personal_info?.full_name || original?.name || '',
        // Defaults to the first work-experience title (old behavior) but is a
        // standalone field from here on — editing it no longer touches that
        // experience entry's actual Job Title.
        headline: (optimized.optimized_experience ?? []).find(exp => exp.title?.trim())?.title?.trim() || '',
        email: optimized.personal_info?.email || rawOrig?.personal_info?.email || original?.email || '',
        phone: optimized.personal_info?.phone || rawOrig?.personal_info?.phone || original?.phone || '',
        location: optimized.personal_info?.location || rawOrig?.personal_info?.location || original?.location || '',
        linkedin: rawOrig?.personal_info?.linkedin || '',
        github: rawOrig?.personal_info?.github || '',
        portfolio: rawOrig?.personal_info?.portfolio || '',
    }

    // Build a lookup of original education by institution for field-of-study backfill
    const origEduByInstitution = new Map<string, any>(
        (rawOrig?.education ?? []).map((e: any) => [
            (e.institution ?? '').toLowerCase().substring(0, 8),
            e,
        ])
    )

    const education: EducationEntry[] = (optimized.education ?? []).map((edu, idx) => {
        const key = (edu.institution ?? '').toLowerCase().substring(0, 8)
        const origEdu = origEduByInstitution.get(key) ?? rawOrig?.education?.[idx]
        const field = origEdu?.field_of_study || origEdu?.field || ''
        return {
            school: edu.institution ?? '',
            degree: edu.degree ?? '',
            date: edu.date ?? '',
            gpa: (edu as any).gpa || origEdu?.gpa || '',
            coursework: field,
        }
    })

    const experience: ExperienceEntry[] = (optimized.optimized_experience ?? []).map(exp => ({
        company: exp.company ?? '',
        title: exp.title ?? '',
        startDate: exp.start_date ?? '',
        endDate: exp.end_date ?? '',
        location: exp.location ?? '',
        bullets: exp.bullet_points ?? [],
    }))

    // Match optimized projects to original by name for tech stack, fall back to optimized proj.tech
    const origProjectsByName = new Map<string, string>(
        (rawOrig?.projects ?? []).map((p: any) => [
            (p.name ?? '').toLowerCase(),
            Array.isArray(p.technologies) ? p.technologies.join(', ') : (p.tech ?? ''),
        ])
    )

    const projects: ProjectEntry[] = (optimized.projects ?? []).map(proj => ({
        name: proj.name ?? '',
        tech: origProjectsByName.get((proj.name ?? '').toLowerCase()) || ((proj as any).tech ?? ''),
        date: proj.date ?? '',
        bullets: proj.bullet_points ?? [],
    }))

    const tech = optimized.optimized_skills?.technical ?? []
    const tools = optimized.optimized_skills?.tools ?? []
    const soft = optimized.optimized_skills?.soft_skills ?? []

    // Deduplicate tools against tech — remove any tool that already appears in tech (case-insensitive)
    const techLower = new Set(tech.map((s: string) => s.toLowerCase()))
    const dedupedTools = tools.filter((t: string) => !techLower.has(t.toLowerCase()))

    return {
        profile,
        summary: optimized.optimized_summary ?? '',
        education,
        experience,
        projects,
        skills: {
            languages: tech.join(', '),
            tools: dedupedTools.join(', '),
            frameworks: '',
            soft: soft.join(', '),
        },
        leadership: [],
        certifications: (() => {
            const optimizedCerts = optimized.certifications ?? []
            if (optimizedCerts.length > 0) {
                return optimizedCerts.map((cert: any) =>
                    typeof cert === 'string' ? cert : [cert.name, cert.issuer, cert.date].filter(Boolean).join(' | ')
                )
            }
            // Fallback: extract from original parsed resume
            const origCerts: any[] = rawOrig?.certifications ?? []
            return origCerts.map((cert: any) =>
                typeof cert === 'string' ? cert : [cert.name, cert.issuer, cert.date].filter(Boolean).join(' | ')
            )
        })(),
        achievements: (() => {
            const optimizedAch: string[] = optimized.achievements ?? []
            if (optimizedAch.length > 0) return optimizedAch
            // Fallback: extract achievements nested in work_experience
            const fromExp: string[] = []
            for (const exp of (rawOrig?.work_experience ?? [])) {
                if (Array.isArray(exp.achievements)) fromExp.push(...exp.achievements)
            }
            return fromExp
        })(),
    }
}

// ── Section Icon (Meridian) ─────────────────────────────────
const SECTION_ICONS: Record<string, React.ReactNode> = {
    profile: <><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></>,
    summary: <><path d="M3 6h18M3 12h18M3 18h12"/></>,
    education: <><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v4c3 3 9 3 12 0v-4"/></>,
    experience: <><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></>,
    projects: <><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></>,
    skills: <><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></>,
    certifications: <><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></>,
    achievements: <><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></>,
    leadership: <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></>,
}

function SectionIcon({ k, filled }: { k: string; filled: boolean }) {
    const color = filled ? M.green : M.amber
    const bg = filled ? M.greenLight : M.amberLight
    return (
        <div style={{
            width: 26, height: 26, borderRadius: 7, flexShrink: 0,
            background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
                {SECTION_ICONS[k] || SECTION_ICONS.profile}
            </svg>
        </div>
    )
}

// One-line text summary (for the steps layout)
function sectionSummaryText(sectionKey: string, state: ResumeEditorState): string {
    if (sectionKey === 'profile') return state.profile.name || 'Add your name & contact info'
    if (sectionKey === 'summary') return state.summary ? state.summary.slice(0, 55) + (state.summary.length > 55 ? '…' : '') : 'Write a 2–3 sentence overview'
    if (sectionKey === 'education') return state.education[0]?.school || 'Add your degree & school'
    if (sectionKey === 'experience') return state.experience[0] ? `${state.experience[0].title} @ ${state.experience[0].company}` : 'Add work history'
    if (sectionKey === 'projects') return state.projects[0]?.name || 'Add personal or academic projects'
    if (sectionKey === 'skills') return state.skills.languages ? state.skills.languages.split(',').slice(0, 3).join(', ') + '…' : 'Add languages, tools & frameworks'
    if (sectionKey === 'certifications') return state.certifications[0] || 'Add certifications & credentials'
    if (sectionKey === 'achievements') return state.achievements[0] || 'Add awards & recognitions'
    if (sectionKey === 'leadership') return state.leadership[0]?.org || 'Add clubs, orgs & roles'
    return ''
}

// ── Section Modal Shell ─────────────────────────────────────
function SectionModal({
    title, subtitle, sectionKey, wide, footerNote, onClose, onSave, children,
}: {
    title: string; subtitle?: string; sectionKey: string; wide?: boolean; footerNote?: string
    onClose: () => void; onSave: () => void
    children: React.ReactNode
}) {
    const overlayRef = useRef<HTMLDivElement | null>(null)
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [onClose])

    return (
        <div
            ref={overlayRef}
            className="mob-edit-overlay"
            onClick={e => { if (e.target === overlayRef.current) onClose() }}
            style={{
                position: 'fixed', inset: 0, zIndex: 1000,
                background: 'rgba(15,30,64,0.45)', backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
            }}
        >
            <style>{`@keyframes m-modal-in { from { opacity:0; transform:scale(0.96) translateY(8px); } to { opacity:1; transform:scale(1) translateY(0); } }`}</style>
            <div className="mob-edit-modal" style={{
                background: M.white, borderRadius: 16,
                width: wide ? 640 : 520, maxWidth: '100%', maxHeight: '90vh',
                display: 'flex', flexDirection: 'column',
                boxShadow: '0 32px 64px rgba(15,30,64,0.25)',
                animation: 'm-modal-in 0.18s ease',
                overflow: 'hidden',
                fontFamily: M.fontBody,
            }}>
                {/* Header */}
                <div style={{
                    padding: '18px 22px 14px', borderBottom: `1px solid ${M.borderLight}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    flexShrink: 0,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 10, background: M.accentTint,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                        }}>
                            <SectionIcon k={sectionKey} filled />
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <div style={{
                                fontSize: '0.9375rem', fontWeight: 700, color: M.text,
                                fontFamily: M.fontHeading, letterSpacing: '-0.01em',
                            }}>{title}</div>
                            {subtitle && (
                                <div style={{ fontSize: '0.7rem', color: M.textFaint, fontFamily: M.fontBody, lineHeight: 1.4, marginTop: 1 }}>
                                    {subtitle}
                                </div>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: M.textFaint, padding: 6, borderRadius: 8, display: 'flex', flexShrink: 0,
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    </button>
                </div>

                {/* Scrollable body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px 10px' }}>
                    {children}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '12px 22px 18px', borderTop: `1px solid ${M.borderLight}`,
                    display: 'flex', alignItems: 'center', gap: 12,
                    justifyContent: footerNote ? 'space-between' : 'flex-end', flexShrink: 0,
                }}>
                    {footerNote && (
                        <span style={{ fontSize: '0.75rem', color: M.textFaint, fontFamily: M.fontBody }}>{footerNote}</span>
                    )}
                    <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                        <button
                            onClick={onClose}
                            style={{
                                padding: '8px 18px', borderRadius: 8,
                                border: `1px solid ${M.border}`, background: M.white,
                                color: M.textMid, fontSize: '0.875rem', fontWeight: 600,
                                cursor: 'pointer', fontFamily: M.fontBody,
                            }}
                        >Cancel</button>
                        <button
                            onClick={onSave}
                            style={{
                                padding: '8px 24px', borderRadius: 8, border: 'none',
                                background: M.accent, color: '#fff',
                                fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
                                fontFamily: M.fontBody,
                                boxShadow: `0 2px 10px ${M.accent}4d`,
                            }}
                        >Save changes</button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── Active Modal Dispatcher ────────────────────────────────
// Clones state on open; commits on Save.
function ActiveModal({
    sectionKey, state, update, onClose, isMobile, onSaved,
}: {
    sectionKey: string
    state: ResumeEditorState
    update: (s: ResumeEditorState) => void
    onClose: () => void
    isMobile?: boolean
    // Plan 21 Phase 1 persistence — fires after `update()` with the section's
    // before/after snapshot plus the full next state, so the caller can PATCH
    // without racing React's async setState.
    onSaved?: (section: string, before: unknown, after: unknown, nextState: ResumeEditorState) => void
}) {
    // Deep snapshot so Cancel discards changes
    const [local, setLocal] = useState<ResumeEditorState>(() => JSON.parse(JSON.stringify(state)))
    const beforeRef = useRef((state as unknown as Record<string, unknown>)[sectionKey])

    const configs: Record<string, { title: string; subtitle: string; wide?: boolean }> = {
        profile:        { title: 'Edit Profile',         subtitle: 'Personal & contact details' },
        summary:        { title: 'Edit Summary',          subtitle: 'Professional overview' },
        education:      { title: 'Edit Education',        subtitle: 'Degrees & coursework',         wide: true },
        experience:     { title: 'Edit Experience',       subtitle: 'Work history & bullet points', wide: true },
        projects:       { title: 'Edit Projects',         subtitle: 'Personal & academic projects', wide: true },
        skills:         { title: 'Edit Technical Skills', subtitle: 'Languages, tools & frameworks' },
        certifications: { title: 'Edit Certifications',   subtitle: 'Cloud, security, frameworks — signals you took initiative beyond the syllabus.' },
        achievements:   { title: 'Edit Achievements',     subtitle: 'Hackathons, scholarships, rankings — anything that sets you apart from peers.' },
        leadership:     { title: 'Edit Leadership',       subtitle: 'Clubs, orgs & roles',          wide: true },
    }
    const cfg = configs[sectionKey]
    if (!cfg) return null

    const handleSave = () => {
        // Drop blank entries (e.g. an auto-seeded card the user left empty) so PDF
        // templates that don't trim-filter certifications/achievements never render one.
        const cleaned: ResumeEditorState = {
            ...local,
            certifications: local.certifications.filter(c => c.trim()),
            achievements: local.achievements.filter(a => a.trim()),
        }
        update(cleaned)
        onSaved?.(sectionKey, beforeRef.current, (cleaned as unknown as Record<string, unknown>)[sectionKey], cleaned)
        onClose()
    }

    const footerNote =
        sectionKey === 'certifications' ? `${local.certifications.filter(c => c.trim()).length} of ${local.certifications.length} filled · Esc to close` :
        sectionKey === 'achievements'   ? `${local.achievements.filter(a => a.trim()).length} of ${local.achievements.length} filled · Esc to close` :
        undefined

    // Reuse existing inline section editors against local state
    const body: React.ReactNode = (() => {
        switch (sectionKey) {
            case 'profile':        return <ProfileSection state={local} update={setLocal} />
            case 'summary':        return (
                <Field
                    label="Professional Summary"
                    value={local.summary}
                    onChange={v => setLocal({ ...local, summary: v })}
                    multiline rows={6}
                    placeholder="Write a 2–3 sentence overview tailored to the role…"
                />
            )
            case 'education':      return <EducationSection state={local} update={setLocal} />
            case 'experience':     return <ExperienceSection state={local} update={setLocal} />
            case 'projects':       return <ProjectsSection state={local} update={setLocal} />
            case 'skills':         return <SkillsSection state={local} update={setLocal} />
            case 'certifications': return <CertificationsSection state={local} update={setLocal} isMobile={isMobile} />
            case 'achievements':   return <AchievementsSection state={local} update={setLocal} isMobile={isMobile} />
            case 'leadership':     return <LeadershipSection state={local} update={setLocal} isMobile={isMobile} />
            default: return null
        }
    })()

    return (
        <SectionModal
            title={cfg.title}
            subtitle={cfg.subtitle}
            sectionKey={sectionKey}
            wide={cfg.wide}
            footerNote={footerNote}
            onClose={onClose}
            onSave={handleSave}
        >
            {body}
        </SectionModal>
    )
}

// ── Section Definitions (used by all editor layouts) ─────────
const M_SECTION_DEFS: Array<{ key: string; label: string }> = [
    { key: 'profile',        label: 'Profile' },
    { key: 'summary',        label: 'Summary' },
    { key: 'education',      label: 'Education' },
    { key: 'experience',     label: 'Experience' },
    { key: 'projects',       label: 'Projects' },
    { key: 'skills',         label: 'Technical Skills' },
    { key: 'certifications', label: 'Certifications' },
    { key: 'achievements',   label: 'Achievements' },
    { key: 'leadership',     label: 'Leadership' },
]

// ── Layout: STEPS (vertical numbered timeline) ─────────────
function StepsLayout({ state, onOpen, isFilled }: {
    state: ResumeEditorState
    onOpen: (key: string) => void
    isFilled: (k: string) => boolean
}) {
    return (
        <div style={{ padding: '18px 20px 10px' }}>
            {M_SECTION_DEFS.map(({ key, label }, idx) => {
                const filled = isFilled(key)
                const isLast = idx === M_SECTION_DEFS.length - 1
                return (
                    <div key={key} style={{ display: 'flex', gap: 14 }}>
                        <div style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            flexShrink: 0, width: 36,
                        }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                                background: filled ? M.accent : M.white,
                                border: `2.5px solid ${filled ? M.accent : M.border}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '0.875rem', fontWeight: 700,
                                color: filled ? '#fff' : M.textFaint,
                                fontFamily: M.fontMono, zIndex: 1,
                                boxShadow: filled ? `0 2px 8px ${M.accent}33` : 'none',
                            }}>
                                {filled ? (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                                        <path d="M20 6L9 17l-5-5"/>
                                    </svg>
                                ) : (idx + 1)}
                            </div>
                            {!isLast && (
                                <div style={{
                                    width: 2.5, flex: 1, minHeight: 22,
                                    background: filled ? M.accentBorder : M.borderLight, margin: '3px 0',
                                }} />
                            )}
                        </div>
                        <div style={{ flex: 1, paddingBottom: isLast ? 0 : 12 }}>
                            <button
                                onClick={() => onOpen(key)}
                                style={{
                                    width: '100%', textAlign: 'left', padding: '14px 16px', borderRadius: 12,
                                    border: `1.5px solid ${filled ? M.accentBorder : M.borderLight}`,
                                    background: filled ? '#f8faff' : M.white,
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
                                    transition: 'all 0.15s', fontFamily: M.fontBody,
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.borderColor = M.accent
                                    e.currentTarget.style.background = M.accentTint
                                    e.currentTarget.style.boxShadow = `0 2px 12px ${M.accent}1f`
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.borderColor = filled ? M.accentBorder : M.borderLight
                                    e.currentTarget.style.background = filled ? '#f8faff' : M.white
                                    e.currentTarget.style.boxShadow = 'none'
                                }}
                            >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 5 }}>
                                        <span style={{
                                            fontSize: '1rem', fontWeight: 700, color: M.text,
                                            fontFamily: M.fontHeading, letterSpacing: '-0.01em',
                                        }}>
                                            {label}
                                        </span>
                                        <span style={{
                                            fontSize: '0.7rem', fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                                            background: filled ? M.greenLight : M.amberLight,
                                            color: filled ? M.green : M.amber, fontFamily: M.fontMono,
                                            letterSpacing: '0.04em',
                                        }}>{filled ? 'DONE' : 'MISSING'}</span>
                                    </div>
                                    <div style={{
                                        fontSize: '0.85rem', color: M.textMuted, fontFamily: M.fontBody,
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        maxWidth: '95%', lineHeight: 1.4,
                                    }}>
                                        {sectionSummaryText(key, state)}
                                    </div>
                                </div>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={M.accent} strokeWidth="2.5" style={{ flexShrink: 0 }}>
                                    <path d="M9 18l6-6-6-6"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

// ── Layout Manager (plans/25 Phase 2) — drag-to-reorder + hide/show ──
// Movable sections = M_SECTION_DEFS minus 'profile' (the header is always
// fixed at the top of every template, never reorderable).
const LAYOUT_SECTION_DEFS = M_SECTION_DEFS.filter(s => s.key !== 'profile')

// ── Resume Budget meter (plans/25 Phase 4) — honest fullness % measured
// from actual PDF pagination (src/lib/resume-edit/budget.ts), never a
// word-count guess. Crossing the page_target boundary flips to "Needs
// Optimization" instead of ever reporting a raw over-100% number.
function ResumeBudgetMeter({
    pageTarget, onPageTargetChange, budget, failed,
}: {
    pageTarget: number
    onPageTargetChange: (n: number) => void
    budget: BudgetResult | null
    failed?: boolean
}) {
    const overBudget = budget?.overBudget ?? false
    const fill = budget ? Math.min(100, budget.fullnessPercent) : 0
    const barColor = !budget ? M.border : overBudget ? M.red : fill >= 90 ? M.amber : M.green

    return (
        <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 10, border: `1px solid ${M.border}`, background: M.white }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: M.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: M.fontMono }}>
                    Resume Budget
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                    {[1, 2].map(n => (
                        <button
                            key={n}
                            onClick={() => onPageTargetChange(n)}
                            style={{
                                padding: '3px 10px', borderRadius: 20, fontSize: '0.6875rem', fontWeight: 600,
                                fontFamily: M.fontBody, cursor: 'pointer',
                                background: pageTarget === n ? M.accent : M.white,
                                color: pageTarget === n ? '#fff' : M.textMuted,
                                border: `1px solid ${pageTarget === n ? M.accent : M.border}`,
                            }}
                        >
                            {n} page{n > 1 ? 's' : ''}
                        </button>
                    ))}
                </div>
            </div>

            <div style={{ height: 8, borderRadius: 4, background: M.surface, overflow: 'hidden', marginBottom: 6 }}>
                <div style={{ height: '100%', width: `${fill}%`, background: barColor, transition: 'width 0.3s ease' }} />
            </div>

            <div style={{ fontSize: '0.75rem', color: M.textMuted, fontFamily: M.fontBody }}>
                {!budget
                    ? (failed ? "Couldn't measure page count on this device — try reloading, or check on desktop." : 'Measuring…')
                    : overBudget
                        ? `Needs Optimization — spans ${budget.pages} pages (target ${pageTarget})`
                        : `${budget.fullnessPercent}% full · Target ${pageTarget} page${pageTarget > 1 ? 's' : ''} · ${Math.max(0, 100 - budget.fullnessPercent)}% left`}
            </div>
        </div>
    )
}

// ── One-Page Optimizer (plans/25 Phase 5) — tailored resumes only. Suggests
// hiding the section that's contributing least to THIS job's match (ranked
// by src/lib/resume-edit/budgetOptimizer.ts from existing signals — no new
// scoring engine). Every action is a hide toggle, reversible via the eye
// icon in the drag list below; the master resume's structured_data is never
// read or written by this panel.
// ── Project-Evidence nudge (plans/25 Phase 6) — a completed AI-coached
// project that addresses a real gap for this job. Swapping updates the
// tailored resume's editorState directly (persisted through the existing
// manual-edit path) — never the master resume.
function ProjectSwapNudgeCard({
    nudge, onSwap,
}: {
    nudge: ProjectSwapNudge
    onSwap: () => void
}) {
    return (
        <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 10, border: `1px solid ${M.green}55`, background: '#f0fdf4' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: M.green, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: M.fontMono, marginBottom: 8 }}>
                Project Completed
            </div>
            <div style={{ fontSize: '0.8125rem', color: M.text, fontFamily: M.fontBody, marginBottom: 6, lineHeight: 1.4 }}>
                <strong>{nudge.candidate.project_name}</strong> completed
            </div>
            <div style={{ fontSize: '0.75rem', color: M.textMuted, fontFamily: M.fontBody, lineHeight: 1.4, marginBottom: 10 }}>
                {nudge.reason}
            </div>
            <button
                onClick={onSwap}
                style={{ background: M.green, color: '#fff', border: 'none', borderRadius: 7, padding: '5px 12px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', fontFamily: M.fontBody }}
            >
                {nudge.weakestExisting ? `Swap in for "${nudge.weakestExisting.name}"` : 'Add to Projects'}
            </button>
        </div>
    )
}

function OnePageOptimizerPanel({
    suggestions, onHide, onTrimWithAI, trimLoading,
}: {
    suggestions: SectionTrimSuggestion[]
    onHide: (key: string) => void
    onTrimWithAI: () => void
    trimLoading: boolean
}) {
    if (suggestions.length === 0) return null
    const top = suggestions[0]
    const labelFor = (key: string) => LAYOUT_SECTION_DEFS.find(s => s.key === key)?.label ?? key

    return (
        <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 10, border: `1px solid ${M.amber}55`, background: '#fffbeb' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: M.amber, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: M.fontMono, marginBottom: 8 }}>
                One-Page Optimizer
            </div>
            <div style={{ fontSize: '0.8125rem', color: M.text, fontFamily: M.fontBody, marginBottom: 6, lineHeight: 1.4 }}>
                Over budget for this job. Safest section to trim: <strong>{labelFor(top.key)}</strong>
            </div>
            <div style={{ fontSize: '0.75rem', color: M.textMuted, fontFamily: M.fontBody, lineHeight: 1.4, marginBottom: 10 }}>
                {top.reason}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                    onClick={() => onHide(top.key)}
                    style={{ background: M.amber, color: '#fff', border: 'none', borderRadius: 7, padding: '5px 12px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', fontFamily: M.fontBody }}
                >
                    Hide {labelFor(top.key)}
                </button>
                <button
                    onClick={onTrimWithAI}
                    disabled={trimLoading}
                    style={{ background: '#fff', color: M.amber, border: `1px solid ${M.amber}`, borderRadius: 7, padding: '5px 12px', fontSize: '0.75rem', fontWeight: 700, cursor: trimLoading ? 'default' : 'pointer', fontFamily: M.fontBody, opacity: trimLoading ? 0.6 : 1 }}
                >
                    {trimLoading ? 'Trimming…' : '✦ Trim with AI'}
                </button>
            </div>
            <div style={{ fontSize: '0.6875rem', color: M.textFaint, fontFamily: M.fontBody, marginTop: 8 }}>
                Reversible any time via the eye icon below. Your master resume is never changed.
            </div>
        </div>
    )
}

function LayoutManagerPanel({
    order, hidden, onChange, defaultOrder, saveStatus, unsupported,
    activePresetKey, onSelectPreset, recommendation, onApplyRecommendation, onDismissRecommendation,
    pageTarget, onPageTargetChange, budget, budgetFailed, optimizer, isMobile,
}: {
    order: string[]
    hidden: string[]
    onChange: (order: string[], hidden: string[]) => void
    defaultOrder: string[]
    saveStatus: 'idle' | 'saving' | 'saved'
    unsupported?: boolean
    activePresetKey: string | null
    onSelectPreset: (key: string) => void
    recommendation: { preset: string; label: string; reason: string } | null
    onApplyRecommendation: () => void
    onDismissRecommendation: () => void
    pageTarget: number
    onPageTargetChange: (n: number) => void
    budget: BudgetResult | null
    budgetFailed?: boolean
    optimizer?: React.ReactNode
    // Touch dragging fights vertical page scroll, so the mobile tab swaps the
    // drag handle for tap targets — same order/hidden state either way.
    isMobile?: boolean
}) {
    const labelFor = (key: string) => LAYOUT_SECTION_DEFS.find(s => s.key === key)?.label ?? key
    const toggleHidden = (key: string) => {
        const next = hidden.includes(key) ? hidden.filter(k => k !== key) : [...hidden, key]
        onChange(order, next)
    }
    const moveSection = (key: string, dir: -1 | 1) => {
        const i = order.indexOf(key)
        const j = i + dir
        if (i < 0 || j < 0 || j >= order.length) return
        const next = [...order]
        ;[next[i], next[j]] = [next[j], next[i]]
        onChange(next, hidden)
    }

    const budgetMeter = (
        <ResumeBudgetMeter pageTarget={pageTarget} onPageTargetChange={onPageTargetChange} budget={budget} failed={budgetFailed} />
    )

    if (unsupported) {
        return (
            <div style={{ padding: '16px 18px' }}>
                {budgetMeter}
                <div style={{ padding: '4px 0', fontSize: '0.8125rem', color: M.textMuted, fontFamily: M.fontBody, lineHeight: 1.6 }}>
                    Section reordering isn&apos;t available for two-column templates yet. Switch to a single-column template (e.g. Classic, Cobalt, Onyx) to reorder sections.
                </div>
            </div>
        )
    }

    return (
        <div style={{ padding: '16px 18px' }}>
            {budgetMeter}
            {optimizer}

            {recommendation && (
                <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '12px 14px', borderRadius: 10, marginBottom: 14,
                    background: M.accentTint, border: `1px solid ${M.accentBorder}`,
                }}>
                    <span style={{ fontSize: '1rem', lineHeight: 1, flexShrink: 0 }}>💡</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: M.text, fontFamily: M.fontBody, marginBottom: 2 }}>
                            {recommendation.label}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: M.textMuted, fontFamily: M.fontBody, lineHeight: 1.4, marginBottom: 8 }}>
                            {recommendation.reason}
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button
                                onClick={onApplyRecommendation}
                                style={{ background: M.accent, color: '#fff', border: 'none', borderRadius: 7, padding: '5px 12px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', fontFamily: M.fontBody }}
                            >
                                Apply
                            </button>
                            <button
                                onClick={onDismissRecommendation}
                                style={{ background: 'transparent', color: M.textMuted, border: 'none', padding: '5px 4px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: M.fontBody }}
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: M.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: M.fontMono, marginBottom: 8 }}>
                    Presets
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {Object.entries(LAYOUT_PRESETS).map(([key, preset]) => (
                        <button
                            key={key}
                            onClick={() => onSelectPreset(key)}
                            style={{
                                padding: '5px 11px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600,
                                fontFamily: M.fontBody, cursor: 'pointer',
                                background: activePresetKey === key ? M.accent : M.white,
                                color: activePresetKey === key ? '#fff' : M.textMuted,
                                border: `1px solid ${activePresetKey === key ? M.accent : M.border}`,
                            }}
                        >
                            {preset.label}
                        </button>
                    ))}
                </div>
            </div>

            <div style={{ marginBottom: 12, fontSize: '0.8125rem', color: M.textMuted, fontFamily: M.fontBody, lineHeight: 1.5 }}>
                {isMobile
                    ? 'Tap the arrows to reorder. Toggle the eye to hide a section from this resume.'
                    : 'Drag sections to reorder. Toggle the eye to hide a section from this resume.'}
            </div>

            {isMobile ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {order.map((key, i) => {
                        const isHidden = hidden.includes(key)
                        return (
                            <div key={key} style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '10px 8px 10px 12px', borderRadius: 10,
                                background: isHidden ? M.surface : M.white,
                                border: `1px solid ${M.border}`,
                                opacity: isHidden ? 0.55 : 1,
                            }}>
                                <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: 600, color: M.text, fontFamily: M.fontBody, minWidth: 0 }}>
                                    {labelFor(key)}
                                </span>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <button
                                        onClick={() => moveSection(key, -1)}
                                        disabled={i === 0}
                                        aria-label={`Move ${labelFor(key)} up`}
                                        style={{ background: 'transparent', border: 'none', cursor: i === 0 ? 'default' : 'pointer', padding: '3px 6px', display: 'flex', color: i === 0 ? M.borderLight : M.textMuted }}
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="18 15 12 9 6 15"/></svg>
                                    </button>
                                    <button
                                        onClick={() => moveSection(key, 1)}
                                        disabled={i === order.length - 1}
                                        aria-label={`Move ${labelFor(key)} down`}
                                        style={{ background: 'transparent', border: 'none', cursor: i === order.length - 1 ? 'default' : 'pointer', padding: '3px 6px', display: 'flex', color: i === order.length - 1 ? M.borderLight : M.textMuted }}
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
                                    </button>
                                </div>
                                <button
                                    onClick={() => toggleHidden(key)}
                                    title={isHidden ? 'Show section' : 'Hide section'}
                                    aria-label={isHidden ? `Show ${labelFor(key)}` : `Hide ${labelFor(key)}`}
                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', color: isHidden ? M.textFaint : M.accent }}
                                >
                                    {isHidden ? (
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <path d="M17.94 17.94A10.94 10.94 0 0112 20c-7 0-11-8-11-8a19.68 19.68 0 015.06-5.94M9.9 4.24A10.94 10.94 0 0112 4c7 0 11 8 11 8a19.6 19.6 0 01-2.16 3.19M14.12 14.12a3 3 0 11-4.24-4.24" />
                                            <path d="M1 1l22 22" />
                                        </svg>
                                    ) : (
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                            <circle cx="12" cy="12" r="3" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        )
                    })}
                </div>
            ) : (
            <Reorder.Group
                axis="y"
                values={order}
                onReorder={(next) => onChange(next, hidden)}
                style={{ display: 'flex', flexDirection: 'column', gap: 8, listStyle: 'none', padding: 0, margin: 0 }}
            >
                {order.map((key) => {
                    const isHidden = hidden.includes(key)
                    return (
                        <Reorder.Item key={key} value={key} style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '10px 12px', borderRadius: 10,
                            background: isHidden ? M.surface : M.white,
                            border: `1px solid ${M.border}`,
                            cursor: 'grab', opacity: isHidden ? 0.55 : 1,
                        }}
                        // The native `cursor: grab` icon is a thin, low-contrast glyph that's
                        // easy to miss entirely on Windows (especially at 125%/150% display
                        // scaling) — a hover highlight gives users a second, more reliable
                        // signal that the row is draggable, without depending on the OS cursor.
                        whileHover={{ borderColor: M.accent, boxShadow: `0 0 0 2px ${M.accent}26` }}
                        whileDrag={{ cursor: 'grabbing', boxShadow: '0 6px 16px rgba(15,23,42,.18)' }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={M.textMuted} strokeWidth="2.5" style={{ flexShrink: 0 }}>
                                <path d="M4 8h16M4 16h16" />
                            </svg>
                            <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: 600, color: M.text, fontFamily: M.fontBody }}>
                                {labelFor(key)}
                            </span>
                            <button
                                onClick={() => toggleHidden(key)}
                                title={isHidden ? 'Show section' : 'Hide section'}
                                aria-label={isHidden ? `Show ${labelFor(key)}` : `Hide ${labelFor(key)}`}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', color: isHidden ? M.textFaint : M.accent }}
                            >
                                {isHidden ? (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <path d="M17.94 17.94A10.94 10.94 0 0112 20c-7 0-11-8-11-8a19.68 19.68 0 015.06-5.94M9.9 4.24A10.94 10.94 0 0112 4c7 0 11 8 11 8a19.6 19.6 0 01-2.16 3.19M14.12 14.12a3 3 0 11-4.24-4.24" />
                                        <path d="M1 1l22 22" />
                                    </svg>
                                ) : (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                        <circle cx="12" cy="12" r="3" />
                                    </svg>
                                )}
                            </button>
                        </Reorder.Item>
                    )
                })}
            </Reorder.Group>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
                <button
                    onClick={() => onChange(defaultOrder, [])}
                    style={{ background: 'transparent', border: 'none', color: M.accent, fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', fontFamily: M.fontBody, padding: 0 }}
                >
                    Reset to default order
                </button>
                <span style={{ fontSize: '0.75rem', color: M.textFaint, fontFamily: M.fontMono }}>
                    {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : ''}
                </span>
            </div>
        </div>
    )
}

// ── Input helpers (Meridian) ────────────────────────────────
const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 7,
    background: M.white, border: `1px solid ${M.border}`,
    color: M.text, fontSize: '0.8125rem', outline: 'none',
    boxSizing: 'border-box', fontFamily: M.fontBody,
    transition: 'border-color 0.15s, box-shadow 0.15s',
}

const labelStyle: React.CSSProperties = {
    fontSize: '0.725rem', fontWeight: 500, color: M.textMuted,
    display: 'block', marginBottom: 4, marginTop: 10,
    fontFamily: M.fontBody, letterSpacing: 0,
}

// Bordered entry-card styling used by list-style sections (certifications, achievements)
// — matches the /dashboard/upload "Add certifications/achievements" popup fields.
const entryCardStyle: React.CSSProperties = {
    marginBottom: 12, padding: 12, background: M.white, borderRadius: 8,
    border: `1px solid ${M.border}`, position: 'relative',
}
const entryRemoveStyle: React.CSSProperties = {
    position: 'absolute', top: 8, right: 8, background: 'transparent',
    border: 'none', cursor: 'pointer', color: M.red, padding: 2,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
}
const addMoreStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
    borderRadius: 6, background: 'transparent', border: `1px dashed ${T.editorBorder}`,
    color: T.editorTextMuted, cursor: 'pointer', fontSize: '0.8125rem',
    width: '100%', justifyContent: 'center', fontFamily: 'inherit',
}

function Field({ label, value, onChange, placeholder, multiline = false, rows = 3 }: {
    label: string
    value: string
    onChange: (v: string) => void
    placeholder?: string
    multiline?: boolean
    rows?: number
}) {
    if (multiline) {
        return (
            <div>
                <span style={labelStyle}>{label}</span>
                <textarea
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    placeholder={placeholder}
                    rows={rows}
                    style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
                />
            </div>
        )
    }
    return (
        <div>
            <span style={labelStyle}>{label}</span>
            <input
                type="text"
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                style={inputStyle}
            />
        </div>
    )
}

// ── Classic Resume Preview (HTML) ────────────────────────────
function ClassicResumePreview({ state }: { state: ResumeEditorState }) {
    const decorations = usePreviewDecorations()
    const decoFor = (section: string, index?: number, bulletIndex?: number, skillsField?: string) => decorations.get(decorationKey(section, index, bulletIndex, skillsField))
    const decoStyle = (deco: ReturnType<typeof decoFor>): React.CSSProperties =>
        deco?.kind === 'flash' ? { animation: 'ra-flash-green 0.5s ease', borderRadius: 3 } : {}

    const { profile, summary, education, experience, projects, skills, leadership, certifications, achievements } = state

    const contactParts = [
        profile.phone,
        profile.email,
        profile.location,
        profile.linkedin,
        profile.github,
        profile.portfolio,
    ].filter(Boolean)

    const hasSkills = skills.languages || skills.tools || skills.frameworks || skills.soft

    const order = state.sectionOrder ?? ['summary', 'education', 'experience', 'projects', 'skills', 'certifications', 'achievements', 'leadership']
    const sections: Record<string, () => React.ReactNode> = {
        summary: () => {
            const deco = decoFor('summary')
            if (deco?.kind === 'ghost') {
                return (
                    <div style={{ marginBottom: '8pt', position: 'relative', background: A.greenGhostBg, borderLeft: '3px solid #16a34a', padding: '3pt 8pt', borderRadius: '0 4px 4px 0' }}>
                        <span style={{ position: 'absolute', top: 0, right: 4, background: '#16a34a', color: '#fff', fontSize: '0.4rem', fontWeight: 700, padding: '1px 5px', borderRadius: '0 0 3px 3px', letterSpacing: '0.07em', fontFamily: 'monospace' }}>SUGGESTED</span>
                        <span style={{ fontSize: '10pt', lineHeight: 1.45, color: '#0f6b3a' }}>{deco.text}</span>
                    </div>
                )
            }
            if (!summary) return null
            return (
                <div style={{ marginBottom: '8pt', fontSize: '10pt', lineHeight: 1.45, color: '#111', background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                    {summary}
                </div>
            )
        },

        education: () => education.length > 0 && (
            <section style={{ marginBottom: '8pt' }}>
                <ClassicSectionHeader title="Education" />
                {education.map((edu, i) => {
                    const eduTop = edu.school || 'University Name'
                    const showDegree = edu.degree && !sameText(edu.degree, eduTop)
                    return (
                    <div key={i} style={{ marginBottom: '6pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 700 }}>{eduTop}</span>
                            <span style={{ fontSize: '9.5pt', color: '#333' }}>{edu.date}</span>
                        </div>
                        {showDegree && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontStyle: 'italic' }}>{edu.degree}{edu.gpa ? ` — GPA: ${edu.gpa}` : ''}</span>
                            </div>
                        )}
                        {edu.coursework && (
                            <div style={{ fontSize: '9.5pt', marginTop: '2pt' }}>
                                <span style={{ fontWeight: 600 }}>Relevant Coursework: </span>
                                {edu.coursework}
                            </div>
                        )}
                    </div>
                    )
                })}
            </section>
        ),

        experience: () => experience.length > 0 && (
            <section style={{ marginBottom: '8pt' }}>
                <ClassicSectionHeader title="Experience" />
                {experience.map((exp, i) => (
                    <div key={i} style={{ marginBottom: '8pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 700 }}>{exp.company || 'Company Name'}</span>
                            <span style={{ fontSize: '9.5pt', color: '#333' }}>
                                {[exp.startDate, exp.endDate].filter(Boolean).join(' – ')}
                            </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontStyle: 'italic' }}>{exp.title}</span>
                            {exp.location && <span style={{ fontSize: '9.5pt', color: '#555' }}>{exp.location}</span>}
                        </div>
                        <ul style={{ margin: '3pt 0 0 0', paddingLeft: '16pt', listStyle: 'disc' }}>
                            {exp.bullets.map((b, j) => {
                                const deco = decoFor('experience', i, j)
                                if (!b.trim() && deco?.kind !== 'ghost') return null
                                if (deco?.kind === 'ghost') {
                                    return (
                                        <li key={j} style={{ marginBottom: '2pt', fontSize: '10pt', listStyle: 'none', marginLeft: '-16pt' }}>
                                            <div style={{ position: 'relative', background: A.greenGhostBg, borderLeft: '3px solid #16a34a', padding: '3pt 8pt', borderRadius: '0 4px 4px 0' }}>
                                                <span style={{ position: 'absolute', top: 0, right: 4, background: '#16a34a', color: '#fff', fontSize: '0.4rem', fontWeight: 700, padding: '1px 5px', borderRadius: '0 0 3px 3px', letterSpacing: '0.07em', fontFamily: 'monospace' }}>SUGGESTED</span>
                                                <span style={{ color: '#0f6b3a' }}>{deco.text}</span>
                                            </div>
                                        </li>
                                    )
                                }
                                return (
                                    <li key={j} style={{ marginBottom: '2pt', fontSize: '10pt', background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                                        <BoldRender text={b} />
                                    </li>
                                )
                            })}
                        </ul>
                    </div>
                ))}
            </section>
        ),

        projects: () => projects.length > 0 && (
            <section style={{ marginBottom: '8pt' }}>
                <ClassicSectionHeader title="Projects" />
                {projects.map((proj, i) => (
                    <div key={i} style={{ marginBottom: '6pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 700 }}>
                                {proj.name}{proj.tech ? <span style={{ fontWeight: 400 }}> | <span style={{ fontStyle: 'italic' }}>{proj.tech}</span></span> : ''}
                            </span>
                            <span style={{ fontSize: '9.5pt', color: '#333' }}>{proj.date}</span>
                        </div>
                        <ul style={{ margin: '3pt 0 0 0', paddingLeft: '16pt', listStyle: 'disc' }}>
                            {proj.bullets.map((b, j) => {
                                const deco = decoFor('projects', i, j)
                                if (!b.trim() && deco?.kind !== 'ghost') return null
                                if (deco?.kind === 'ghost') {
                                    return (
                                        <li key={j} style={{ marginBottom: '2pt', fontSize: '10pt', listStyle: 'none', marginLeft: '-16pt' }}>
                                            <div style={{ position: 'relative', background: A.greenGhostBg, borderLeft: '3px solid #16a34a', padding: '3pt 8pt', borderRadius: '0 4px 4px 0' }}>
                                                <span style={{ position: 'absolute', top: 0, right: 4, background: '#16a34a', color: '#fff', fontSize: '0.4rem', fontWeight: 700, padding: '1px 5px', borderRadius: '0 0 3px 3px', letterSpacing: '0.07em', fontFamily: 'monospace' }}>SUGGESTED</span>
                                                <span style={{ color: '#0f6b3a' }}>{deco.text}</span>
                                            </div>
                                        </li>
                                    )
                                }
                                return (
                                    <li key={j} style={{ marginBottom: '2pt', fontSize: '10pt', background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                                        <BoldRender text={b} />
                                    </li>
                                )
                            })}
                        </ul>
                    </div>
                ))}
            </section>
        ),

        skills: () => hasSkills && (
            <section style={{ marginBottom: '8pt' }}>
                <ClassicSectionHeader title="Technical Skills" />
                <div style={{ fontSize: '10pt' }}>
                    {([
                        ['languages', 'Languages'],
                        ['tools', 'Developer Tools'],
                        ['frameworks', 'Technologies/Frameworks'],
                        ['soft', 'Core Competencies'],
                    ] as const).map(([field, label]) => {
                        const deco = decoFor('skills', undefined, undefined, field)
                        if (deco?.kind === 'ghost') {
                            return (
                                <div key={field} style={{ marginBottom: '2pt', position: 'relative', background: A.greenGhostBg, borderLeft: '3px solid #16a34a', padding: '3pt 8pt', borderRadius: '0 4px 4px 0' }}>
                                    <span style={{ position: 'absolute', top: 0, right: 4, background: '#16a34a', color: '#fff', fontSize: '0.4rem', fontWeight: 700, padding: '1px 5px', borderRadius: '0 0 3px 3px', letterSpacing: '0.07em', fontFamily: 'monospace' }}>SUGGESTED</span>
                                    <span style={{ fontWeight: 700 }}>{label}: </span><span style={{ color: '#0f6b3a' }}>{deco.text}</span>
                                </div>
                            )
                        }
                        if (!skills[field]) return null
                        return (
                            <div key={field} style={{ marginBottom: '2pt', background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                                <span style={{ fontWeight: 700 }}>{label}: </span>{skills[field]}
                            </div>
                        )
                    })}
                </div>
            </section>
        ),

        certifications: () => certifications.length > 0 && (
            <section style={{ marginBottom: '8pt' }}>
                <ClassicSectionHeader title="Certifications" />
                <ul style={{ margin: '3pt 0 0 0', paddingLeft: '16pt', listStyle: 'disc' }}>
                    {certifications.map((cert, i) => (
                        <li key={i} style={{ marginBottom: '2pt', fontSize: '10pt' }}>{cert}</li>
                    ))}
                </ul>
            </section>
        ),

        achievements: () => achievements.length > 0 && (
            <section style={{ marginBottom: '8pt' }}>
                <ClassicSectionHeader title="Achievements" />
                <ul style={{ margin: '3pt 0 0 0', paddingLeft: '16pt', listStyle: 'disc' }}>
                    {achievements.map((ach, i) => (
                        <li key={i} style={{ marginBottom: '2pt', fontSize: '10pt' }}>{ach}</li>
                    ))}
                </ul>
            </section>
        ),

        leadership: () => leadership.length > 0 && (
            <section style={{ marginBottom: '8pt' }}>
                <ClassicSectionHeader title="Leadership" />
                {leadership.map((lead, i) => (
                    <div key={i} style={{ marginBottom: '6pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 700 }}>{lead.org}</span>
                            <span style={{ fontSize: '9.5pt', color: '#333' }}>{lead.date}</span>
                        </div>
                        {lead.role && <div style={{ fontStyle: 'italic' }}>{lead.role}</div>}
                        {lead.bullets.filter(b => b.trim()).length > 0 && (
                            <ul style={{ margin: '3pt 0 0 0', paddingLeft: '16pt', listStyle: 'disc' }}>
                                {lead.bullets.filter(b => b.trim()).map((b, j) => (
                                    <li key={j} style={{ marginBottom: '2pt', fontSize: '10pt' }}>{b}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                ))}
            </section>
        ),
    }

    return (
        <div style={{
            fontFamily: "'Georgia', 'Times New Roman', serif",
            fontSize: '10.5pt',
            lineHeight: 1.35,
            color: '#000',
            padding: '36pt 48pt',
            minHeight: '100%',
            background: '#fff',
        }}>
            <style>{`@keyframes ra-flash-green { 0% { background: #d1fae5; } 60% { background: #d1fae5; } 100% { background: transparent; } }`}</style>
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: '6pt' }}>
                <div style={{
                    fontFamily: "'Georgia', serif",
                    fontSize: '20pt',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    fontVariant: 'small-caps',
                    lineHeight: 1.2,
                    color: '#000',
                }}>
                    {profile.name || 'Your Name'}
                </div>
                {contactParts.length > 0 && (
                    <div style={{
                        fontSize: '9.5pt',
                        color: '#333',
                        marginTop: '4pt',
                        letterSpacing: '0.01em',
                    }}>
                        {contactParts.join(' \u2756 ')}
                    </div>
                )}
            </div>
            <hr style={{ border: 'none', borderTop: '1.5px solid #000', margin: '6pt 0' }} />

            {order.map((key) => (
                <React.Fragment key={key}>{sections[key]?.()}</React.Fragment>
            ))}
        </div>
    )
}

function ClassicSectionHeader({ title }: { title: string }) {
    return (
        <div style={{
            fontSize: '10.5pt',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            borderBottom: '1.2px solid #000',
            paddingBottom: '2pt',
            marginBottom: '5pt',
            color: '#000',
        }}>
            {title}
        </div>
    )
}

// ── Cobalt Resume Preview (HTML) ──────────────────────────
// Single-column, navy-blue accent (#06296b), all-black text. Mirrors
// CobaltPdfDocument.tsx (the carousel "aarav-sharma" design).
const COBALT_ACCENT = '#06296b'
const COBALT_INK = '#111111'

// Shared "AI suggestion pending" box for the live-preview ghost decoration —
// module-level (not defined inside a template component) so React doesn't
// treat it as a new component type on every render, which would reset its
// state. Reusable by any template preview that wires up decoFor/decoStyle.
function GhostBox({ text, inline }: { text: string; inline?: React.ReactNode }) {
    return (
        <div style={{ position: 'relative', background: A.greenGhostBg, borderLeft: '3px solid #16a34a', padding: '3pt 8pt', borderRadius: '0 4px 4px 0' }}>
            <span style={{ position: 'absolute', top: 0, right: 4, background: '#16a34a', color: '#fff', fontSize: '0.4rem', fontWeight: 700, padding: '1px 5px', borderRadius: '0 0 3px 3px', letterSpacing: '0.07em', fontFamily: 'monospace' }}>SUGGESTED</span>
            {inline}<span style={{ color: '#0f6b3a' }}>{text}</span>
        </div>
    )
}

function CobaltSectionHeader({ title }: { title: string }) {
    return (
        <div style={{
            fontSize: '10.5pt',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: COBALT_ACCENT,
            borderBottom: `1.2px solid ${COBALT_ACCENT}`,
            paddingBottom: '2pt',
            marginTop: '7pt',
            marginBottom: '4pt',
        }}>
            {title}
        </div>
    )
}

function CobaltResumePreview({ state }: { state: ResumeEditorState }) {
    const { profile, summary, education, experience, projects, skills, leadership, certifications, achievements } = state
    const decorations = usePreviewDecorations()
    const decoFor = (section: string, index?: number, bulletIndex?: number, skillsField?: string) => decorations.get(decorationKey(section, index, bulletIndex, skillsField))
    const decoStyle = (deco: ReturnType<typeof decoFor>): React.CSSProperties =>
        deco?.kind === 'flash' ? { animation: 'ra-flash-green 0.5s ease', borderRadius: 3 } : {}

    const contactParts = [
        profile.phone, profile.email, profile.location, profile.linkedin, profile.github, profile.portfolio,
    ].filter(Boolean)

    const roleSubtitle = profile.headline?.trim() || ''

    const skillRows = [
        { field: 'languages' as const, label: 'Languages', value: skills.languages },
        { field: 'frameworks' as const, label: 'Frameworks', value: skills.frameworks },
        { field: 'tools' as const, label: 'Tools & Cloud', value: skills.tools },
        { field: 'soft' as const, label: 'Core Competencies', value: skills.soft },
    ].filter(r => (r.value && r.value.trim()) || decoFor('skills', undefined, undefined, r.field)?.kind === 'ghost')

    const dateRange = (a?: string, b?: string) => [a, b].filter(Boolean).join(' – ')

    const order = state.sectionOrder ?? ['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'achievements', 'leadership']
    const sections: Record<string, () => React.ReactNode> = {
        summary: () => {
            const deco = decoFor('summary')
            if (deco?.kind === 'ghost') {
                return <section><CobaltSectionHeader title="Professional Summary" /><GhostBox text={deco.text} /></section>
            }
            if (!summary) return null
            return (
                <section>
                    <CobaltSectionHeader title="Professional Summary" />
                    <div style={{ fontSize: '10pt', lineHeight: 1.35, color: COBALT_INK, background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                        <BoldRender text={summary} />
                    </div>
                </section>
            )
        },

        skills: () => skillRows.length > 0 && (
            <section>
                <CobaltSectionHeader title="Skills" />
                {skillRows.map((row, i) => {
                    const deco = decoFor('skills', undefined, undefined, row.field)
                    if (deco?.kind === 'ghost') {
                        return <div key={i} style={{ marginBottom: '2.5pt' }}><GhostBox text={deco.text} inline={<span style={{ fontWeight: 700 }}>{row.label}: </span>} /></div>
                    }
                    return (
                        <div key={i} style={{ display: 'flex', marginBottom: '2.5pt', fontSize: '10pt', background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                            <span style={{ fontWeight: 700, width: '92pt', flexShrink: 0 }}>{row.label}:</span>
                            <span style={{ flex: 1 }}>{row.value}</span>
                        </div>
                    )
                })}
            </section>
        ),

        experience: () => experience.length > 0 && (
            <section>
                <CobaltSectionHeader title="Experience" />
                {experience.map((exp, i) => {
                    const companyLine = [exp.company, exp.location].filter(Boolean).join(', ')
                    return (
                        <div key={i} style={{ marginBottom: '7pt' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <span style={{ fontWeight: 700, fontSize: '10.5pt' }}>{exp.title || 'Role'}</span>
                                <span style={{ fontSize: '9.5pt', color: COBALT_INK }}>{dateRange(exp.startDate, exp.endDate)}</span>
                            </div>
                            {companyLine && <div style={{ fontStyle: 'italic', fontSize: '10pt' }}>{companyLine}</div>}
                            <ul style={{ margin: '2pt 0 0 0', paddingLeft: '16pt', listStyle: 'disc' }}>
                                {exp.bullets.map((b, j) => {
                                    const deco = decoFor('experience', i, j)
                                    if (!b.trim() && deco?.kind !== 'ghost') return null
                                    if (deco?.kind === 'ghost') {
                                        return <li key={j} style={{ marginBottom: '1.5pt', fontSize: '10pt', listStyle: 'none', marginLeft: '-16pt' }}><GhostBox text={deco.text} /></li>
                                    }
                                    return (
                                        <li key={j} style={{ marginBottom: '1.5pt', fontSize: '10pt', background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                                            <BoldRender text={b} />
                                        </li>
                                    )
                                })}
                            </ul>
                        </div>
                    )
                })}
            </section>
        ),

        projects: () => projects.length > 0 && (
            <section>
                <CobaltSectionHeader title="Projects" />
                {projects.map((proj, i) => (
                    <div key={i} style={{ marginBottom: '6pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 700, fontSize: '10.5pt' }}>
                                {proj.name}{proj.tech ? <span style={{ fontWeight: 400 }}> | <span style={{ fontStyle: 'italic' }}>{proj.tech}</span></span> : ''}
                            </span>
                            <span style={{ fontSize: '9.5pt', color: COBALT_INK }}>{proj.date}</span>
                        </div>
                        <ul style={{ margin: '2pt 0 0 0', paddingLeft: '16pt', listStyle: 'disc' }}>
                            {proj.bullets.map((b, j) => {
                                const deco = decoFor('projects', i, j)
                                if (!b.trim() && deco?.kind !== 'ghost') return null
                                if (deco?.kind === 'ghost') {
                                    return <li key={j} style={{ marginBottom: '1.5pt', fontSize: '10pt', listStyle: 'none', marginLeft: '-16pt' }}><GhostBox text={deco.text} /></li>
                                }
                                return (
                                    <li key={j} style={{ marginBottom: '1.5pt', fontSize: '10pt', background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                                        <BoldRender text={b} />
                                    </li>
                                )
                            })}
                        </ul>
                    </div>
                ))}
            </section>
        ),

        education: () => education.length > 0 && (
            <section>
                <CobaltSectionHeader title="Education" />
                {education.map((edu, i) => {
                    const eduTop = edu.degree || edu.school || 'Degree'
                    const showSchool = edu.school && !sameText(edu.school, eduTop)
                    return (
                    <div key={i} style={{ marginBottom: '5pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 700 }}>{eduTop}</span>
                            <span style={{ fontSize: '9.5pt', color: COBALT_INK }}>{edu.date}</span>
                        </div>
                        {(showSchool || edu.gpa) && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <span>{showSchool ? edu.school : ''}</span>
                                {edu.gpa && <span style={{ fontSize: '9.5pt', color: COBALT_INK }}>{edu.gpa}</span>}
                            </div>
                        )}
                        {edu.coursework && (
                            <div style={{ fontSize: '9.5pt', marginTop: '1.5pt' }}>
                                <span style={{ fontWeight: 700 }}>Relevant Coursework: </span>{edu.coursework}
                            </div>
                        )}
                    </div>
                    )
                })}
            </section>
        ),

        certifications: () => certifications.filter(c => c.trim()).length > 0 && (
            <section>
                <CobaltSectionHeader title="Certifications" />
                <ul style={{ margin: '2pt 0 0 0', paddingLeft: '16pt', listStyle: 'disc' }}>
                    {certifications.filter(c => c.trim()).map((cert, i) => (
                        <li key={i} style={{ marginBottom: '1.5pt', fontSize: '10pt' }}>{cert}</li>
                    ))}
                </ul>
            </section>
        ),

        achievements: () => achievements.filter(a => a.trim()).length > 0 && (
            <section>
                <CobaltSectionHeader title="Achievements" />
                <ul style={{ margin: '2pt 0 0 0', paddingLeft: '16pt', listStyle: 'disc' }}>
                    {achievements.filter(a => a.trim()).map((ach, i) => (
                        <li key={i} style={{ marginBottom: '1.5pt', fontSize: '10pt' }}>{ach}</li>
                    ))}
                </ul>
            </section>
        ),

        leadership: () => leadership.length > 0 && (
            <section>
                <CobaltSectionHeader title="Leadership" />
                {leadership.map((lead, i) => (
                    <div key={i} style={{ marginBottom: '5pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 700 }}>{lead.org}</span>
                            <span style={{ fontSize: '9.5pt', color: COBALT_INK }}>{lead.date}</span>
                        </div>
                        {lead.role && <div style={{ fontStyle: 'italic', fontSize: '10pt' }}>{lead.role}</div>}
                        {lead.bullets.filter(b => b.trim()).length > 0 && (
                            <ul style={{ margin: '2pt 0 0 0', paddingLeft: '16pt', listStyle: 'disc' }}>
                                {lead.bullets.filter(b => b.trim()).map((b, j) => (
                                    <li key={j} style={{ marginBottom: '1.5pt', fontSize: '10pt' }}>{b}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                ))}
            </section>
        ),
    }

    return (
        <div style={{
            fontFamily: "'Roboto', 'Helvetica Neue', Arial, sans-serif",
            fontSize: '10pt',
            lineHeight: 1.4,
            color: COBALT_INK,
            padding: '32pt 44pt',
            minHeight: '100%',
            background: '#fff',
        }}>
            <style>{`@keyframes ra-flash-green { 0% { background: #d1fae5; } 60% { background: #d1fae5; } 100% { background: transparent; } }`}</style>
            {/* Header (left-aligned) */}
            <div style={{ marginBottom: '4pt' }}>
                <div style={{ fontSize: '20pt', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', lineHeight: 1.05, color: COBALT_INK }}>
                    {profile.name || 'Your Name'}
                </div>
                {roleSubtitle && (
                    <div style={{ fontSize: '11pt', fontWeight: 700, color: COBALT_ACCENT, marginTop: '3pt' }}>
                        {roleSubtitle}
                    </div>
                )}
                {contactParts.length > 0 && (
                    <div style={{ fontSize: '9.5pt', color: COBALT_INK, marginTop: '5pt' }}>
                        {contactParts.join('  |  ')}
                    </div>
                )}
            </div>

            {order.map((key) => (
                <React.Fragment key={key}>{sections[key]?.()}</React.Fragment>
            ))}
        </div>
    )
}

// ── Onyx Resume Preview (HTML) ────────────────────────────
// Minimalist Open Sans, monochrome black, one navy divider rule under the
// header, rule-less wide-tracked section headers. Mirrors OnyxPdfDocument.tsx
// (the rohan-mehta carousel design).
const ONYX_INK = '#111111'
const ONYX_RULE = '#224a85'

function OnyxSectionHeader({ title }: { title: string }) {
    return (
        <div style={{
            fontSize: '10pt',
            fontWeight: 700,
            letterSpacing: '2px',
            textTransform: 'uppercase',
            color: ONYX_INK,
            marginTop: '11pt',
            marginBottom: '5pt',
        }}>
            {title}
        </div>
    )
}

function OnyxResumePreview({ state }: { state: ResumeEditorState }) {
    const { profile, summary, education, experience, projects, skills, leadership, certifications, achievements } = state
    const decorations = usePreviewDecorations()
    const decoFor = (section: string, index?: number, bulletIndex?: number, skillsField?: string) => decorations.get(decorationKey(section, index, bulletIndex, skillsField))
    const decoStyle = (deco: ReturnType<typeof decoFor>): React.CSSProperties =>
        deco?.kind === 'flash' ? { animation: 'ra-flash-green 0.5s ease', borderRadius: 3 } : {}

    const contactParts = [
        profile.phone, profile.email, profile.location, profile.linkedin, profile.github, profile.portfolio,
    ].filter(Boolean)

    const roleSubtitle = profile.headline?.trim() || ''

    const skillRows = [
        { field: 'languages' as const, label: 'Languages', value: skills.languages },
        { field: 'frameworks' as const, label: 'Frameworks', value: skills.frameworks },
        { field: 'tools' as const, label: 'Tools & Platforms', value: skills.tools },
        { field: 'soft' as const, label: 'Core Competencies', value: skills.soft },
    ].filter(r => (r.value && r.value.trim()) || decoFor('skills', undefined, undefined, r.field)?.kind === 'ghost')

    const dateRange = (a?: string, b?: string) => [a, b].filter(Boolean).join(' – ')

    const order = state.sectionOrder ?? ['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'achievements', 'leadership']
    const sections: Record<string, () => React.ReactNode> = {
        summary: () => {
            const deco = decoFor('summary')
            if (deco?.kind === 'ghost') {
                return <section><OnyxSectionHeader title="Summary" /><GhostBox text={deco.text} /></section>
            }
            if (!summary) return null
            return (
                <section>
                    <OnyxSectionHeader title="Summary" />
                    <div style={{ fontSize: '10pt', lineHeight: 1.4, color: ONYX_INK, background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}><BoldRender text={summary} /></div>
                </section>
            )
        },

        skills: () => skillRows.length > 0 && (
            <section>
                <OnyxSectionHeader title="Technical Skills" />
                {skillRows.map((row, i) => {
                    const deco = decoFor('skills', undefined, undefined, row.field)
                    if (deco?.kind === 'ghost') {
                        return <div key={i} style={{ marginBottom: '2.5pt' }}><GhostBox text={deco.text} inline={<span style={{ fontWeight: 700 }}>{row.label}: </span>} /></div>
                    }
                    return (
                        <div key={i} style={{ display: 'flex', marginBottom: '2.5pt', fontSize: '10pt', background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                            <span style={{ fontWeight: 700, width: '104pt', flexShrink: 0 }}>{row.label}:</span>
                            <span style={{ flex: 1 }}>{row.value}</span>
                        </div>
                    )
                })}
            </section>
        ),

        experience: () => experience.length > 0 && (
            <section>
                <OnyxSectionHeader title="Experience" />
                {experience.map((exp, i) => {
                    const companyLine = [exp.company, exp.location].filter(Boolean).join(', ')
                    return (
                        <div key={i} style={{ marginBottom: '7pt' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <span style={{ fontWeight: 700, fontSize: '10.5pt' }}>{exp.title || 'Role'}</span>
                                <span style={{ fontSize: '9.5pt', color: ONYX_INK }}>{dateRange(exp.startDate, exp.endDate)}</span>
                            </div>
                            {companyLine && <div style={{ fontStyle: 'italic', fontSize: '10pt' }}>{companyLine}</div>}
                            <ul style={{ margin: '2pt 0 0 0', paddingLeft: '16pt', listStyle: 'disc' }}>
                                {exp.bullets.map((b, j) => {
                                    const deco = decoFor('experience', i, j)
                                    if (!b.trim() && deco?.kind !== 'ghost') return null
                                    if (deco?.kind === 'ghost') {
                                        return <li key={j} style={{ marginBottom: '1.5pt', fontSize: '10pt', listStyle: 'none', marginLeft: '-16pt' }}><GhostBox text={deco.text} /></li>
                                    }
                                    return (
                                        <li key={j} style={{ marginBottom: '1.5pt', fontSize: '10pt', background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                                            <BoldRender text={b} />
                                        </li>
                                    )
                                })}
                            </ul>
                        </div>
                    )
                })}
            </section>
        ),

        projects: () => projects.length > 0 && (
            <section>
                <OnyxSectionHeader title="Projects" />
                {projects.map((proj, i) => (
                    <div key={i} style={{ marginBottom: '6pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 700, fontSize: '10.5pt' }}>{proj.name}</span>
                            {(proj.tech || proj.date) && (
                                <span style={{ fontSize: '9.5pt', color: ONYX_INK, fontStyle: proj.tech ? 'italic' : 'normal' }}>{proj.tech || proj.date}</span>
                            )}
                        </div>
                        <ul style={{ margin: '2pt 0 0 0', paddingLeft: '16pt', listStyle: 'disc' }}>
                            {proj.bullets.map((b, j) => {
                                const deco = decoFor('projects', i, j)
                                if (!b.trim() && deco?.kind !== 'ghost') return null
                                if (deco?.kind === 'ghost') {
                                    return <li key={j} style={{ marginBottom: '1.5pt', fontSize: '10pt', listStyle: 'none', marginLeft: '-16pt' }}><GhostBox text={deco.text} /></li>
                                }
                                return (
                                    <li key={j} style={{ marginBottom: '1.5pt', fontSize: '10pt', background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                                        <BoldRender text={b} />
                                    </li>
                                )
                            })}
                        </ul>
                    </div>
                ))}
            </section>
        ),

        education: () => education.length > 0 && (
            <section>
                <OnyxSectionHeader title="Education" />
                {education.map((edu, i) => {
                    const eduTop = edu.degree || edu.school || 'Degree'
                    const showSchool = edu.school && !sameText(edu.school, eduTop)
                    return (
                    <div key={i} style={{ marginBottom: '5pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 700 }}>{eduTop}</span>
                            <span style={{ fontSize: '9.5pt', color: ONYX_INK }}>{edu.date}</span>
                        </div>
                        {(showSchool || edu.gpa) && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <span style={{ fontStyle: 'italic' }}>{showSchool ? edu.school : ''}</span>
                                {edu.gpa && <span style={{ fontSize: '9.5pt', color: ONYX_INK }}>{edu.gpa}</span>}
                            </div>
                        )}
                        {edu.coursework && (
                            <div style={{ fontSize: '9.5pt', marginTop: '1.5pt' }}>
                                <span style={{ fontWeight: 700 }}>Relevant Coursework: </span>{edu.coursework}
                            </div>
                        )}
                    </div>
                    )
                })}
            </section>
        ),

        certifications: () => certifications.filter(c => c.trim()).length > 0 && (
            <section>
                <OnyxSectionHeader title="Certifications" />
                <ul style={{ margin: '2pt 0 0 0', paddingLeft: '16pt', listStyle: 'disc' }}>
                    {certifications.filter(c => c.trim()).map((cert, i) => (
                        <li key={i} style={{ marginBottom: '1.5pt', fontSize: '10pt' }}>{cert}</li>
                    ))}
                </ul>
            </section>
        ),

        achievements: () => achievements.filter(a => a.trim()).length > 0 && (
            <section>
                <OnyxSectionHeader title="Achievements" />
                <ul style={{ margin: '2pt 0 0 0', paddingLeft: '16pt', listStyle: 'disc' }}>
                    {achievements.filter(a => a.trim()).map((ach, i) => (
                        <li key={i} style={{ marginBottom: '1.5pt', fontSize: '10pt' }}>{ach}</li>
                    ))}
                </ul>
            </section>
        ),

        leadership: () => leadership.length > 0 && (
            <section>
                <OnyxSectionHeader title="Leadership" />
                {leadership.map((lead, i) => (
                    <div key={i} style={{ marginBottom: '5pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 700 }}>{lead.org}</span>
                            <span style={{ fontSize: '9.5pt', color: ONYX_INK }}>{lead.date}</span>
                        </div>
                        {lead.role && <div style={{ fontStyle: 'italic', fontSize: '10pt' }}>{lead.role}</div>}
                        {lead.bullets.filter(b => b.trim()).length > 0 && (
                            <ul style={{ margin: '2pt 0 0 0', paddingLeft: '16pt', listStyle: 'disc' }}>
                                {lead.bullets.filter(b => b.trim()).map((b, j) => (
                                    <li key={j} style={{ marginBottom: '1.5pt', fontSize: '10pt' }}>{b}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                ))}
            </section>
        ),
    }

    return (
        <div style={{
            fontFamily: "'Open Sans', 'Segoe UI', Arial, sans-serif",
            fontSize: '10pt',
            lineHeight: 1.4,
            color: ONYX_INK,
            padding: '36pt 46pt',
            minHeight: '100%',
            background: '#fff',
        }}>
            <style>{`@keyframes ra-flash-green { 0% { background: #d1fae5; } 60% { background: #d1fae5; } 100% { background: transparent; } }`}</style>
            {/* Header */}
            <div>
                <div style={{ fontSize: '23pt', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', lineHeight: 1.04, color: ONYX_INK }}>
                    {profile.name || 'Your Name'}
                </div>
                {roleSubtitle && (
                    <div style={{ fontSize: '11.5pt', color: ONYX_INK, marginTop: '3pt' }}>{roleSubtitle}</div>
                )}
                <div style={{ borderBottom: `1.2px solid ${ONYX_RULE}`, margin: '6pt 0' }} />
                {contactParts.length > 0 && (
                    <div style={{ fontSize: '9pt', color: ONYX_INK }}>{contactParts.join('  |  ')}</div>
                )}
            </div>

            {order.map((key) => (
                <React.Fragment key={key}>{sections[key]?.()}</React.Fragment>
            ))}
        </div>
    )
}

// ── Jade Resume Preview (HTML) ────────────────────────────
// Single-column Open Sans (converted from two-column 2026-07-19). Two inks:
// teal #026857 + black. Section headers are teal with a thin full-width
// underline rule. Skills keep the original grouped bold-label + bulleted
// "cloud" format rather than collapsing to a single-line list, same as
// JadePdfDocument.tsx.
const JADE_ACCENT = '#026857'
const JADE_INK = '#1a1a1a'

function JadeSectionHeader({ title }: { title: string }) {
    return (
        <div style={{
            fontSize: '10pt',
            fontWeight: 700,
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            color: JADE_ACCENT,
            paddingBottom: '2.5pt',
            marginTop: '10pt',
            marginBottom: '4pt',
            borderBottom: `1px solid ${JADE_ACCENT}`,
        }}>
            {title}
        </div>
    )
}

function JadeResumePreview({ state }: { state: ResumeEditorState }) {
    const { profile, summary, education, experience, projects, skills, leadership, certifications, achievements } = state
    const decorations = usePreviewDecorations()
    const decoFor = (section: string, index?: number, bulletIndex?: number, skillsField?: string) => decorations.get(decorationKey(section, index, bulletIndex, skillsField))
    const decoStyle = (deco: ReturnType<typeof decoFor>): React.CSSProperties =>
        deco?.kind === 'flash' ? { animation: 'ra-flash-green 0.5s ease', borderRadius: 3 } : {}

    const roleSubtitle = profile.headline?.trim() || ''
    const dateRange = (a?: string, b?: string) => [a, b].filter(Boolean).join(' – ')
    const splitItems = (csv: string) => (csv || '').split(/[,•\n]/).map(s => s.trim()).filter(Boolean)

    const contactParts = [
        profile.phone, profile.email, profile.location, profile.linkedin, profile.github, profile.portfolio,
    ].filter(Boolean)

    // Skills fields render as a bulleted "cloud" here (each comma-separated
    // item on its own line), but a proposed edit's ghost text is always the
    // whole field as one string — so a pending skills suggestion replaces the
    // group's normal bulleted rendering with the raw suggested string instead
    // of re-splitting it, same treatment every other template gives it.
    const skillGroups = [
        { field: 'languages' as const, label: 'Languages', value: skills.languages },
        { field: 'frameworks' as const, label: 'Libraries & Frameworks', value: skills.frameworks },
        { field: 'tools' as const, label: 'Tools', value: skills.tools },
        { field: 'soft' as const, label: 'Core Competencies', value: skills.soft },
    ].map(g => ({ ...g, items: splitItems(g.value) }))
        .filter(g => g.items.length > 0 || decoFor('skills', undefined, undefined, g.field)?.kind === 'ghost')

    const bullets = (items: string[], size = '9.7pt', mb = '1.5pt', lh = 1.25) => (
        <ul style={{ margin: '2pt 0 0 0', paddingLeft: '14pt', listStyle: 'disc' }}>
            {items.filter(b => b.trim()).map((b, j) => (
                <li key={j} style={{ marginBottom: mb, fontSize: size, lineHeight: lh }}><BoldRender text={b} /></li>
            ))}
        </ul>
    )

    const order = state.sectionOrder ?? ['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'achievements', 'leadership']
    const sections: Record<string, () => React.ReactNode> = {
        summary: () => {
            const deco = decoFor('summary')
            if (deco?.kind === 'ghost') {
                return <section><JadeSectionHeader title="Summary" /><GhostBox text={deco.text} /></section>
            }
            if (!summary) return null
            return (
                <section>
                    <JadeSectionHeader title="Summary" />
                    <div style={{ fontSize: '10pt', lineHeight: 1.4, color: JADE_INK, background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}><BoldRender text={summary} /></div>
                </section>
            )
        },

        skills: () => skillGroups.length > 0 && (
            <section>
                <JadeSectionHeader title="Skills" />
                {skillGroups.map((g, i) => {
                    const deco = decoFor('skills', undefined, undefined, g.field)
                    if (deco?.kind === 'ghost') {
                        return <div key={i} style={{ marginBottom: '2pt' }}><GhostBox text={deco.text} inline={<span style={{ fontWeight: 700 }}>{g.label}: </span>} /></div>
                    }
                    return (
                        <div key={i} style={{ fontSize: '9.7pt', lineHeight: 1.4, marginBottom: '2pt' }}>
                            <span style={{ fontWeight: 700 }}>{g.label}: </span>{g.items.join(', ')}
                        </div>
                    )
                })}
            </section>
        ),

        experience: () => experience.length > 0 && (
            <section>
                <JadeSectionHeader title="Experience" />
                {experience.map((exp, i) => {
                    const companyLine = [exp.company, exp.location].filter(Boolean).join(', ')
                    return (
                        <div key={i} style={{ marginBottom: '7pt' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <span style={{ fontWeight: 700, fontSize: '10.5pt' }}>{exp.title || 'Role'}</span>
                                <span style={{ fontSize: '9pt', color: JADE_INK, marginLeft: '8pt' }}>{dateRange(exp.startDate, exp.endDate)}</span>
                            </div>
                            {companyLine && <div style={{ fontSize: '9.5pt', marginTop: '0.5pt' }}>{companyLine}</div>}
                            <ul style={{ margin: '2pt 0 0 0', paddingLeft: '14pt', listStyle: 'disc' }}>
                                {exp.bullets.map((b, j) => {
                                    const deco = decoFor('experience', i, j)
                                    if (!b.trim() && deco?.kind !== 'ghost') return null
                                    if (deco?.kind === 'ghost') {
                                        return <li key={j} style={{ marginBottom: '1.5pt', fontSize: '9.7pt', listStyle: 'none', marginLeft: '-14pt' }}><GhostBox text={deco.text} /></li>
                                    }
                                    return (
                                        <li key={j} style={{ marginBottom: '1.5pt', fontSize: '9.7pt', lineHeight: 1.25, background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                                            <BoldRender text={b} />
                                        </li>
                                    )
                                })}
                            </ul>
                        </div>
                    )
                })}
            </section>
        ),

        projects: () => projects.length > 0 && (
            <section>
                <JadeSectionHeader title="Projects" />
                {projects.map((proj, i) => (
                    <div key={i} style={{ marginBottom: '6pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 700, fontSize: '10.5pt' }}>{proj.name}</span>
                            {(proj.tech || proj.date) && (
                                <span style={{ fontSize: '9pt', color: JADE_INK, marginLeft: '8pt', fontStyle: proj.tech ? 'italic' : 'normal' }}>{proj.tech || proj.date}</span>
                            )}
                        </div>
                        <ul style={{ margin: '2pt 0 0 0', paddingLeft: '14pt', listStyle: 'disc' }}>
                            {proj.bullets.map((b, j) => {
                                const deco = decoFor('projects', i, j)
                                if (!b.trim() && deco?.kind !== 'ghost') return null
                                if (deco?.kind === 'ghost') {
                                    return <li key={j} style={{ marginBottom: '1.5pt', fontSize: '9.7pt', listStyle: 'none', marginLeft: '-14pt' }}><GhostBox text={deco.text} /></li>
                                }
                                return (
                                    <li key={j} style={{ marginBottom: '1.5pt', fontSize: '9.7pt', lineHeight: 1.25, background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                                        <BoldRender text={b} />
                                    </li>
                                )
                            })}
                        </ul>
                    </div>
                ))}
            </section>
        ),

        education: () => education.length > 0 && (
            <section>
                <JadeSectionHeader title="Education" />
                {education.map((edu, i) => {
                    const eduTop = edu.degree || edu.school || 'Degree'
                    const showSchool = edu.school && !sameText(edu.school, eduTop)
                    return (
                    <div key={i} style={{ marginBottom: '5pt' }}>
                        <div style={{ fontWeight: 700, fontSize: '10pt', lineHeight: 1.2 }}>{eduTop}</div>
                        {showSchool && <div style={{ fontSize: '9.5pt', marginTop: '0.5pt' }}>{edu.school}</div>}
                        {(edu.date || edu.gpa) && (
                            <div style={{ fontSize: '9pt', marginTop: '0.5pt' }}>{[edu.date, edu.gpa].filter(Boolean).join('  |  ')}</div>
                        )}
                        {edu.coursework && (
                            <div style={{ fontSize: '8.7pt', marginTop: '1.5pt', lineHeight: 1.25 }}>
                                <span style={{ fontWeight: 700 }}>Relevant Coursework: </span>{edu.coursework}
                            </div>
                        )}
                    </div>
                    )
                })}
            </section>
        ),

        certifications: () => certifications.filter(c => c.trim()).length > 0 && (
            <section>
                <JadeSectionHeader title="Certifications" />
                {bullets(certifications, '9.3pt', '1pt', 1.22)}
            </section>
        ),

        achievements: () => achievements.filter(a => a.trim()).length > 0 && (
            <section>
                <JadeSectionHeader title="Achievements" />
                {bullets(achievements, '9.3pt', '1pt', 1.22)}
            </section>
        ),

        leadership: () => leadership.length > 0 && (
            <section>
                <JadeSectionHeader title="Leadership" />
                {leadership.map((lead, i) => (
                    <div key={i} style={{ marginBottom: '6pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 700 }}>{lead.org}</span>
                            <span style={{ fontSize: '9pt', color: JADE_INK, marginLeft: '8pt' }}>{lead.date}</span>
                        </div>
                        {lead.role && <div style={{ fontSize: '9.5pt', marginTop: '0.5pt' }}>{lead.role}</div>}
                        {lead.bullets.filter(b => b.trim()).length > 0 && bullets(lead.bullets)}
                    </div>
                ))}
            </section>
        ),
    }

    return (
        <div style={{
            fontFamily: "'Open Sans', 'Segoe UI', Arial, sans-serif",
            fontSize: '10pt',
            lineHeight: 1.4,
            color: JADE_INK,
            padding: '36pt 44pt',
            minHeight: '100%',
            background: '#fff',
        }}>
            <style>{`@keyframes ra-flash-green { 0% { background: #d1fae5; } 60% { background: #d1fae5; } 100% { background: transparent; } }`}</style>
            {/* Header (left-aligned, teal name) */}
            <div style={{ marginBottom: '2pt' }}>
                <div style={{ fontSize: '21pt', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: JADE_ACCENT, lineHeight: 1.04 }}>
                    {profile.name || 'Your Name'}
                </div>
                {roleSubtitle && (
                    <div style={{ fontSize: '10.5pt', fontWeight: 700, color: JADE_INK, marginTop: '3pt' }}>{roleSubtitle}</div>
                )}
                {contactParts.length > 0 && (
                    <div style={{ fontSize: '9pt', color: JADE_INK, marginTop: '5pt', letterSpacing: '0.1px' }}>
                        {contactParts.join('  |  ')}
                    </div>
                )}
            </div>

            {order.map(key => <React.Fragment key={key}>{sections[key]?.()}</React.Fragment>)}
        </div>
    )
}

// ── Executive Resume Preview (HTML) ───────────────────────
// Recreation of the "Executive" card in view-original-7.html — Caladea
// (Garamond-adjacent) serif, monochrome, diamond bullets. Contact line is a
// row of independent spans (space-between) framed by a thick top rule + thin
// bottom rule, rather than one joined separator-delimited string — mirrors
// ExecutivePdfDocument.tsx.
const EXEC_INK = '#111111'
const EXEC_MUTED = '#555555'

function ExecutiveSectionHeader({ title }: { title: string }) {
    return (
        <div style={{
            fontSize: '10pt',
            fontWeight: 700,
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
            color: EXEC_INK,
            paddingBottom: '2pt',
            marginTop: '10pt',
            marginBottom: '4pt',
            borderBottom: `1.25px solid ${EXEC_INK}`,
        }}>
            {title}
        </div>
    )
}

function ExecutiveResumePreview({ state }: { state: ResumeEditorState }) {
    const { profile, summary, education, experience, projects, skills, leadership, certifications, achievements } = state
    const decorations = usePreviewDecorations()
    const decoFor = (section: string, index?: number, bulletIndex?: number, skillsField?: string) => decorations.get(decorationKey(section, index, bulletIndex, skillsField))
    const decoStyle = (deco: ReturnType<typeof decoFor>): React.CSSProperties =>
        deco?.kind === 'flash' ? { animation: 'ra-flash-green 0.5s ease', borderRadius: 3 } : {}

    const contactParts = [
        profile.phone, profile.email, profile.location, profile.linkedin, profile.github, profile.portfolio,
    ].filter(Boolean)

    const dateRange = (a?: string, b?: string) => [a, b].filter(Boolean).join(' – ')

    const skillRows = [
        { field: 'languages' as const, label: 'Technical', value: skills.languages },
        { field: 'frameworks' as const, label: 'Frameworks', value: skills.frameworks },
        { field: 'tools' as const, label: 'Tools', value: skills.tools },
        { field: 'soft' as const, label: 'Core Competencies', value: skills.soft },
    ].filter(r => (r.value && r.value.trim()) || decoFor('skills', undefined, undefined, r.field)?.kind === 'ghost')

    // Diamond marker as a rotated square span, not a "◆" character — matches
    // ExecutivePdfDocument.tsx, which can't rely on the Unicode glyph being in
    // Caladea's font coverage.
    const diamond = <span style={{ display: 'inline-block', width: 5, height: 5, background: '#333', transform: 'rotate(45deg)', marginRight: 8, flexShrink: 0 }} />
    const bullets = (items: string[]) => (
        <div style={{ marginTop: '2pt' }}>
            {items.filter(b => b.trim()).map((b, j) => (
                <div key={j} style={{ display: 'flex', alignItems: 'baseline', marginBottom: '1.5pt', fontSize: '9.7pt', lineHeight: 1.3 }}>
                    {diamond}<span><BoldRender text={b} /></span>
                </div>
            ))}
        </div>
    )

    const order = state.sectionOrder ?? ['summary', 'experience', 'projects', 'skills', 'education', 'certifications', 'achievements', 'leadership']
    const sections: Record<string, () => React.ReactNode> = {
        summary: () => {
            const deco = decoFor('summary')
            if (deco?.kind === 'ghost') return <section><ExecutiveSectionHeader title="Professional Summary" /><GhostBox text={deco.text} /></section>
            if (!summary) return null
            return (
                <section>
                    <ExecutiveSectionHeader title="Professional Summary" />
                    <div style={{ fontSize: '9.8pt', lineHeight: 1.4, color: EXEC_INK, background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                        <BoldRender text={summary} />
                    </div>
                </section>
            )
        },

        experience: () => experience.length > 0 && (
            <section>
                <ExecutiveSectionHeader title="Professional Experience" />
                {experience.map((exp, i) => {
                    const companyLine = [exp.company, exp.location].filter(Boolean).join(' · ')
                    return (
                        <div key={i} style={{ marginBottom: '6pt' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <span style={{ fontWeight: 700, fontSize: '10.5pt' }}>{exp.title || 'Role'}</span>
                                <span style={{ fontSize: '9pt', color: EXEC_MUTED, fontStyle: 'italic' }}>{dateRange(exp.startDate, exp.endDate)}</span>
                            </div>
                            {companyLine && <div style={{ fontStyle: 'italic', fontSize: '9.5pt', color: EXEC_MUTED, marginBottom: '1pt' }}>{companyLine}</div>}
                            <div style={{ marginTop: '2pt' }}>
                                {exp.bullets.map((b, j) => {
                                    const deco = decoFor('experience', i, j)
                                    if (!b.trim() && deco?.kind !== 'ghost') return null
                                    if (deco?.kind === 'ghost') {
                                        return <div key={j} style={{ marginBottom: '1.5pt' }}><GhostBox text={deco.text} /></div>
                                    }
                                    return (
                                        <div key={j} style={{ display: 'flex', alignItems: 'baseline', marginBottom: '1.5pt', fontSize: '9.7pt', lineHeight: 1.3, background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                                            {diamond}<span><BoldRender text={b} /></span>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )
                })}
            </section>
        ),

        projects: () => projects.length > 0 && (
            <section>
                <ExecutiveSectionHeader title="Projects" />
                {projects.map((proj, i) => (
                    <div key={i} style={{ marginBottom: '5pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 700, fontSize: '10.5pt' }}>{proj.name}</span>
                            {(proj.tech || proj.date) && (
                                <span style={{ fontSize: '9pt', color: EXEC_MUTED, fontStyle: 'italic' }}>{proj.tech || proj.date}</span>
                            )}
                        </div>
                        <div style={{ marginTop: '2pt' }}>
                            {proj.bullets.map((b, j) => {
                                const deco = decoFor('projects', i, j)
                                if (!b.trim() && deco?.kind !== 'ghost') return null
                                if (deco?.kind === 'ghost') {
                                    return <div key={j} style={{ marginBottom: '1.5pt' }}><GhostBox text={deco.text} /></div>
                                }
                                return (
                                    <div key={j} style={{ display: 'flex', alignItems: 'baseline', marginBottom: '1.5pt', fontSize: '9.7pt', lineHeight: 1.3, background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                                        {diamond}<span><BoldRender text={b} /></span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                ))}
            </section>
        ),

        skills: () => skillRows.length > 0 && (
            <section>
                <ExecutiveSectionHeader title="Technical Skills" />
                {skillRows.map((row, i) => {
                    const deco = decoFor('skills', undefined, undefined, row.field)
                    if (deco?.kind === 'ghost') {
                        return <div key={i} style={{ marginBottom: '2pt' }}><GhostBox text={deco.text} inline={<span style={{ fontWeight: 700 }}>{row.label}: </span>} /></div>
                    }
                    return (
                        <div key={i} style={{ fontSize: '9.5pt', lineHeight: 1.4, marginBottom: '2pt' }}>
                            <span style={{ fontWeight: 700 }}>{row.label}: </span>{row.value}
                        </div>
                    )
                })}
            </section>
        ),

        education: () => education.length > 0 && (
            <section>
                <ExecutiveSectionHeader title="Education" />
                {education.map((edu, i) => {
                    const eduTop = edu.school || 'University'
                    const showDegree = edu.degree && !sameText(edu.degree, eduTop)
                    return (
                    <div key={i} style={{ marginBottom: '5pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 700 }}>{eduTop}</span>
                            <span style={{ fontSize: '9pt', color: EXEC_MUTED, fontStyle: 'italic' }}>{edu.date}</span>
                        </div>
                        {showDegree ? (
                            <div style={{ fontStyle: 'italic', fontSize: '9.5pt', color: EXEC_MUTED, marginTop: '0.5pt' }}>
                                {edu.degree}{edu.gpa ? `  ·  GPA: ${edu.gpa}` : ''}
                            </div>
                        ) : edu.gpa ? (
                            <div style={{ fontSize: '9.5pt', color: EXEC_MUTED, marginTop: '0.5pt' }}>GPA: {edu.gpa}</div>
                        ) : null}
                        {edu.coursework && (
                            <div style={{ fontSize: '9pt', marginTop: '1.5pt', lineHeight: 1.3 }}>
                                <span style={{ fontWeight: 700 }}>Relevant Coursework: </span>{edu.coursework}
                            </div>
                        )}
                    </div>
                    )
                })}
            </section>
        ),

        certifications: () => certifications.filter(c => c.trim()).length > 0 && (
            <section>
                <ExecutiveSectionHeader title="Certifications" />
                {bullets(certifications)}
            </section>
        ),

        achievements: () => achievements.filter(a => a.trim()).length > 0 && (
            <section>
                <ExecutiveSectionHeader title="Achievements" />
                {bullets(achievements)}
            </section>
        ),

        leadership: () => leadership.length > 0 && (
            <section>
                <ExecutiveSectionHeader title="Leadership" />
                {leadership.map((lead, i) => (
                    <div key={i} style={{ marginBottom: '5pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 700 }}>{lead.org}</span>
                            <span style={{ fontSize: '9pt', color: EXEC_MUTED, fontStyle: 'italic' }}>{lead.date}</span>
                        </div>
                        {lead.role && <div style={{ fontStyle: 'italic', fontSize: '9.5pt', color: EXEC_MUTED, marginTop: '0.5pt' }}>{lead.role}</div>}
                        {lead.bullets.filter(b => b.trim()).length > 0 && bullets(lead.bullets)}
                    </div>
                ))}
            </section>
        ),
    }

    return (
        <div style={{
            fontFamily: "'Caladea', Cambria, Georgia, serif",
            fontSize: '10pt',
            lineHeight: 1.4,
            color: EXEC_INK,
            padding: '38pt 48pt',
            minHeight: '100%',
            background: '#fff',
        }}>
            <style>{`@keyframes ra-flash-green { 0% { background: #d1fae5; } 60% { background: #d1fae5; } 100% { background: transparent; } }`}</style>
            <div style={{ fontWeight: 700, fontSize: '18pt', letterSpacing: '3px', textTransform: 'uppercase', lineHeight: 1.1 }}>
                {profile.name || 'Your Name'}
            </div>
            {contactParts.length > 0 && (
                <div style={{
                    display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: 10,
                    fontSize: '8.7pt', color: EXEC_MUTED,
                    borderTop: `1.5px solid ${EXEC_INK}`, borderBottom: '0.75px solid #ccc',
                    padding: '3pt 0', marginTop: '3pt',
                }}>
                    {contactParts.map((c, i) => <span key={i}>{c}</span>)}
                </div>
            )}

            {order.map(key => <React.Fragment key={key}>{sections[key]?.()}</React.Fragment>)}
        </div>
    )
}

// ── Amber Resume Preview (HTML) ───────────────────────────
// Editorial serif name + sans body, gold accent. Built 2026-07-19 from a
// karthik-iyer.png reference image. Only active template combining a serif
// display name with a sans body (Executive is all-serif; every other active
// template is all-sans) and the only one with a warm/gold accent color.
// Mirrors AmberPdfDocument.tsx.
const AMBER_INK = '#1a2942'
const AMBER_MUTED = '#4a5568'
const AMBER_GOLD = '#b8912f'

function AmberSectionHeader({ title }: { title: string }) {
    return (
        <div style={{ marginTop: '11pt', marginBottom: '5pt' }}>
            <div style={{
                fontSize: '10.5pt', fontWeight: 700, letterSpacing: '1.2px',
                textTransform: 'uppercase', color: AMBER_INK, marginBottom: '3pt',
            }}>
                {title}
            </div>
            <div style={{ borderBottom: `1px solid ${AMBER_GOLD}` }} />
        </div>
    )
}

function AmberResumePreview({ state }: { state: ResumeEditorState }) {
    const { profile, summary, education, experience, projects, skills, leadership, certifications, achievements } = state
    const decorations = usePreviewDecorations()
    const decoFor = (section: string, index?: number, bulletIndex?: number, skillsField?: string) => decorations.get(decorationKey(section, index, bulletIndex, skillsField))
    const decoStyle = (deco: ReturnType<typeof decoFor>): React.CSSProperties =>
        deco?.kind === 'flash' ? { animation: 'ra-flash-green 0.5s ease', borderRadius: 3 } : {}

    const contactParts = [
        profile.email, profile.phone, profile.location, profile.linkedin, profile.github, profile.portfolio,
    ].filter(Boolean)
    const roleSubtitle = profile.headline?.trim() || ''
    const dateRange = (a?: string, b?: string) => [a, b].filter(Boolean).join(' – ')

    const skillRows = [
        { field: 'languages' as const, label: 'Languages', value: skills.languages },
        { field: 'frameworks' as const, label: 'Frameworks', value: skills.frameworks },
        { field: 'tools' as const, label: 'Tools & Platforms', value: skills.tools },
        { field: 'soft' as const, label: 'Core Competencies', value: skills.soft },
    ].filter(r => (r.value && r.value.trim()) || decoFor('skills', undefined, undefined, r.field)?.kind === 'ghost')

    const bullets = (items: string[]) => (
        <div style={{ marginTop: '2pt' }}>
            {items.filter(b => b.trim()).map((b, j) => (
                <div key={j} style={{ display: 'flex', alignItems: 'baseline', marginBottom: '1.5pt', fontSize: '9.7pt', lineHeight: 1.32 }}>
                    <span style={{ width: 12, flexShrink: 0 }}>•</span><span><BoldRender text={b} /></span>
                </div>
            ))}
        </div>
    )

    const order = state.sectionOrder ?? ['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'achievements', 'leadership']
    const sections: Record<string, () => React.ReactNode> = {
        summary: () => {
            const deco = decoFor('summary')
            if (deco?.kind === 'ghost') return <section><AmberSectionHeader title="Summary" /><GhostBox text={deco.text} /></section>
            if (!summary) return null
            return (
                <section>
                    <AmberSectionHeader title="Summary" />
                    <div style={{ fontSize: '9.8pt', lineHeight: 1.42, color: AMBER_INK, background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                        <BoldRender text={summary} />
                    </div>
                </section>
            )
        },

        skills: () => skillRows.length > 0 && (
            <section>
                <AmberSectionHeader title="Core Skills" />
                {skillRows.map((row, i) => {
                    const deco = decoFor('skills', undefined, undefined, row.field)
                    if (deco?.kind === 'ghost') {
                        return <div key={i} style={{ marginBottom: '2.5pt' }}><GhostBox text={deco.text} inline={<span style={{ fontWeight: 700 }}>{row.label}:  </span>} /></div>
                    }
                    return (
                        <div key={i} style={{ fontSize: '9.5pt', lineHeight: 1.4, marginBottom: '2.5pt', color: AMBER_INK, background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                            <span style={{ fontWeight: 700 }}>{row.label}:  </span>{row.value}
                        </div>
                    )
                })}
            </section>
        ),

        experience: () => experience.length > 0 && (
            <section>
                <AmberSectionHeader title="Experience" />
                {experience.map((exp, i) => {
                    const companyLine = [exp.company, exp.location].filter(Boolean).join(', ')
                    return (
                        <div key={i} style={{ marginBottom: '7pt' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <span style={{ fontWeight: 700, fontSize: '10.3pt', color: AMBER_INK }}>{exp.title || 'Role'}</span>
                                <span style={{ fontSize: '9pt', color: AMBER_MUTED }}>{dateRange(exp.startDate, exp.endDate)}</span>
                            </div>
                            {companyLine && <div style={{ fontStyle: 'italic', fontSize: '9.5pt', color: AMBER_MUTED, marginTop: '0.5pt' }}>{companyLine}</div>}
                            <div style={{ marginTop: '2pt' }}>
                                {exp.bullets.map((b, j) => {
                                    const deco = decoFor('experience', i, j)
                                    if (!b.trim() && deco?.kind !== 'ghost') return null
                                    if (deco?.kind === 'ghost') {
                                        return <div key={j} style={{ marginBottom: '1.5pt' }}><GhostBox text={deco.text} /></div>
                                    }
                                    return (
                                        <div key={j} style={{ display: 'flex', alignItems: 'baseline', marginBottom: '1.5pt', fontSize: '9.7pt', lineHeight: 1.32, background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                                            <span style={{ width: 12, flexShrink: 0 }}>•</span><span><BoldRender text={b} /></span>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )
                })}
            </section>
        ),

        projects: () => projects.length > 0 && (
            <section>
                <AmberSectionHeader title="Projects" />
                {projects.map((proj, i) => (
                    <div key={i} style={{ marginBottom: '6pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 700, fontSize: '10.3pt', color: AMBER_INK }}>{proj.name}</span>
                            <span style={{ fontSize: '9pt', color: AMBER_MUTED }}>{proj.date}</span>
                        </div>
                        {proj.tech && (
                            <div style={{ fontSize: '9pt', marginTop: '1pt' }}>
                                <span style={{ fontWeight: 700 }}>Technologies: </span>{proj.tech}
                            </div>
                        )}
                        <div style={{ marginTop: '2pt' }}>
                            {proj.bullets.map((b, j) => {
                                const deco = decoFor('projects', i, j)
                                if (!b.trim() && deco?.kind !== 'ghost') return null
                                if (deco?.kind === 'ghost') {
                                    return <div key={j} style={{ marginBottom: '1.5pt' }}><GhostBox text={deco.text} /></div>
                                }
                                return (
                                    <div key={j} style={{ display: 'flex', alignItems: 'baseline', marginBottom: '1.5pt', fontSize: '9.7pt', lineHeight: 1.32, background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                                        <span style={{ width: 12, flexShrink: 0 }}>•</span><span><BoldRender text={b} /></span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                ))}
            </section>
        ),

        education: () => education.length > 0 && (
            <section>
                <AmberSectionHeader title="Education" />
                {education.map((edu, i) => {
                    const eduTop = edu.degree || edu.school || 'Degree'
                    const showSchool = edu.school && !sameText(edu.school, eduTop)
                    return (
                    <div key={i} style={{ marginBottom: '5pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 700, color: AMBER_INK }}>{eduTop}</span>
                            <span style={{ fontSize: '9pt', color: AMBER_MUTED }}>{edu.date}</span>
                        </div>
                        {(showSchool || edu.gpa) && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <span style={{ fontStyle: 'italic', fontSize: '9.5pt', color: AMBER_MUTED }}>{showSchool ? edu.school : ''}</span>
                                {edu.gpa && <span style={{ fontSize: '9pt', color: AMBER_MUTED }}>{`CGPA: ${edu.gpa}`}</span>}
                            </div>
                        )}
                        {edu.coursework && (
                            <div style={{ fontSize: '9pt', marginTop: '1.5pt', lineHeight: 1.3, color: AMBER_INK }}>
                                <span style={{ fontWeight: 700 }}>Relevant Coursework: </span>{edu.coursework}
                            </div>
                        )}
                    </div>
                    )
                })}
            </section>
        ),

        certifications: () => certifications.filter(c => c.trim()).length > 0 && (
            <section>
                <AmberSectionHeader title="Certifications" />
                {bullets(certifications)}
            </section>
        ),

        achievements: () => achievements.filter(a => a.trim()).length > 0 && (
            <section>
                <AmberSectionHeader title="Achievements" />
                {bullets(achievements)}
            </section>
        ),

        leadership: () => leadership.length > 0 && (
            <section>
                <AmberSectionHeader title="Leadership" />
                {leadership.map((lead, i) => (
                    <div key={i} style={{ marginBottom: '5pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 700, color: AMBER_INK }}>{lead.org}</span>
                            <span style={{ fontSize: '9pt', color: AMBER_MUTED }}>{lead.date}</span>
                        </div>
                        {lead.role && <div style={{ fontStyle: 'italic', fontSize: '9.5pt', color: AMBER_MUTED, marginTop: '0.5pt' }}>{lead.role}</div>}
                        {lead.bullets.filter(b => b.trim()).length > 0 && bullets(lead.bullets)}
                    </div>
                ))}
            </section>
        ),
    }

    return (
        <div style={{
            fontFamily: "'Open Sans', 'Segoe UI', Arial, sans-serif",
            fontSize: '10pt',
            lineHeight: 1.4,
            color: AMBER_INK,
            padding: '36pt 48pt',
            minHeight: '100%',
            background: '#fff',
        }}>
            <style>{`@keyframes ra-flash-green { 0% { background: #d1fae5; } 60% { background: #d1fae5; } 100% { background: transparent; } }`}</style>
            <div style={{ textAlign: 'center' }}>
                <div style={{
                    fontFamily: "'Playfair Display', Georgia, 'Times New Roman', serif",
                    fontWeight: 700, fontSize: '27pt', letterSpacing: '2.5px', color: AMBER_INK, lineHeight: 1.1,
                }}>
                    {(profile.name || 'Your Name').toUpperCase()}
                </div>
                {roleSubtitle && (
                    <div style={{ fontWeight: 700, fontSize: '10pt', letterSpacing: '1px', textTransform: 'uppercase', color: AMBER_INK, marginTop: '4pt' }}>
                        {roleSubtitle}
                    </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', marginTop: '6pt', marginBottom: '6pt' }}>
                    <div style={{ flex: 1, borderBottom: `1px solid ${AMBER_GOLD}` }} />
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: AMBER_GOLD, margin: '0 6pt', flexShrink: 0 }} />
                    <div style={{ flex: 1, borderBottom: `1px solid ${AMBER_GOLD}` }} />
                </div>
                {contactParts.length > 0 && (
                    <div style={{ fontSize: '8.7pt', color: AMBER_MUTED }}>
                        {contactParts.join('  |  ')}
                    </div>
                )}
            </div>

            {order.map(key => <React.Fragment key={key}>{sections[key]?.()}</React.Fragment>)}
        </div>
    )
}

// ── Athens Resume Preview (HTML) ──────────────────────────
// Red accent, gray header panel, outlined skill pills. Built 2026-07-19 from
// the "Resume.io Athens" card in .superpowers/brainstorm/2042-1774507943/
// view-competitor-10.html. Only active template with a red accent (Amber's
// gold is the other warm color; everything else is navy/teal/indigo/sky-blue
// or monochrome) and the only one with a filled gray header panel + colored
// bottom border rather than a rule/divider treatment. Mirrors
// AthensPdfDocument.tsx, incl. the source-mockup detail that the bold left
// column in Experience rows is the COMPANY name (not the job title, unlike
// every other active template) with title+location as the muted subtitle.
const ATHENS_RED = '#c0392b'
const ATHENS_INK = '#1a1a1a'
const ATHENS_MUTED = '#666666'
const ATHENS_BODY = '#444444'
const ATHENS_HR = '#dcdcdc'
const ATHENS_HEADER_BG = '#f7f7f7'

function AthensSectionHeader({ title }: { title: string }) {
    return (
        <div style={{ marginTop: '11pt', marginBottom: '4pt' }}>
            <div style={{
                fontSize: '10pt', fontWeight: 700, letterSpacing: '1.5px',
                textTransform: 'uppercase', color: ATHENS_RED, marginBottom: '3pt',
            }}>
                {title}
            </div>
            <div style={{ borderBottom: `1px solid ${ATHENS_HR}` }} />
        </div>
    )
}

function AthensResumePreview({ state }: { state: ResumeEditorState }) {
    const { profile, summary, education, experience, projects, skills, leadership, certifications, achievements } = state
    const decorations = usePreviewDecorations()
    const decoFor = (section: string, index?: number, bulletIndex?: number, skillsField?: string) => decorations.get(decorationKey(section, index, bulletIndex, skillsField))
    const decoStyle = (deco: ReturnType<typeof decoFor>): React.CSSProperties =>
        deco?.kind === 'flash' ? { animation: 'ra-flash-green 0.5s ease', borderRadius: 3 } : {}

    const contactParts = [
        profile.email, profile.phone, profile.location, profile.linkedin, profile.github, profile.portfolio,
    ].filter(Boolean)
    const roleSubtitle = profile.headline?.trim() || ''
    const dateRange = (a?: string, b?: string) => [a, b].filter(Boolean).join(' – ')
    const splitItems = (csv: string) => (csv || '').split(/,(?![^(]*\))|[•\n]/).map(s => s.trim()).filter(Boolean)

    const skillFields = [
        { field: 'languages' as const, csv: skills.languages },
        { field: 'frameworks' as const, csv: skills.frameworks },
        { field: 'tools' as const, csv: skills.tools },
        { field: 'soft' as const, csv: skills.soft },
    ]
    const hasAnySkills = skillFields.some(f => splitItems(f.csv).length > 0 || decoFor('skills', undefined, undefined, f.field)?.kind === 'ghost')

    const triangle = <span style={{ display: 'inline-block', width: 0, height: 0, borderTop: '3px solid transparent', borderBottom: '3px solid transparent', borderLeft: `5px solid ${ATHENS_RED}`, marginRight: 8, marginTop: 4, flexShrink: 0 }} />
    const bullets = (items: string[]) => (
        <div style={{ marginTop: '2pt' }}>
            {items.filter(b => b.trim()).map((b, j) => (
                <div key={j} style={{ display: 'flex', alignItems: 'baseline', marginBottom: '1.5pt', fontSize: '9.5pt', lineHeight: 1.32, color: ATHENS_BODY }}>
                    {triangle}<span><BoldRender text={b} /></span>
                </div>
            ))}
        </div>
    )

    const order = state.sectionOrder ?? ['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'achievements', 'leadership']
    const sections: Record<string, () => React.ReactNode> = {
        summary: () => {
            const deco = decoFor('summary')
            if (deco?.kind === 'ghost') return <section><AthensSectionHeader title="Summary" /><GhostBox text={deco.text} /></section>
            if (!summary) return null
            return (
                <section>
                    <AthensSectionHeader title="Summary" />
                    <div style={{ fontSize: '9.7pt', lineHeight: 1.45, color: ATHENS_BODY, background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                        <BoldRender text={summary} />
                    </div>
                </section>
            )
        },

        skills: () => hasAnySkills && (
            <section>
                <AthensSectionHeader title="Technical Skills" />
                <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: '2pt' }}>
                    {skillFields.map(f => {
                        const deco = decoFor('skills', undefined, undefined, f.field)
                        if (deco?.kind === 'ghost') {
                            return <div key={f.field} style={{ marginRight: '5pt', marginBottom: '5pt' }}><GhostBox text={deco.text} /></div>
                        }
                        return splitItems(f.csv).map((s, i) => (
                            <span key={`${f.field}-${i}`} style={{ border: `0.8px solid ${ATHENS_RED}`, borderRadius: 2, padding: '2pt 6pt', marginRight: '5pt', marginBottom: '5pt', fontSize: '8.5pt', color: ATHENS_RED, whiteSpace: 'nowrap' }}>{s}</span>
                        ))
                    })}
                </div>
            </section>
        ),

        experience: () => experience.length > 0 && (
            <section>
                <AthensSectionHeader title="Experience" />
                {experience.map((exp, i) => {
                    const companyLine = [exp.title, exp.location].filter(Boolean).join(' · ')
                    return (
                        <div key={i} style={{ marginBottom: '7pt' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <span style={{ fontWeight: 700, fontSize: '10.5pt', color: ATHENS_INK }}>{exp.company || 'Company'}</span>
                                <span style={{ fontWeight: 700, fontSize: '9pt', color: ATHENS_RED }}>{dateRange(exp.startDate, exp.endDate)}</span>
                            </div>
                            {companyLine && <div style={{ fontSize: '9pt', color: ATHENS_MUTED, marginTop: '0.5pt', marginBottom: '1pt' }}>{companyLine}</div>}
                            <div style={{ marginTop: '2pt' }}>
                                {exp.bullets.map((b, j) => {
                                    const deco = decoFor('experience', i, j)
                                    if (!b.trim() && deco?.kind !== 'ghost') return null
                                    if (deco?.kind === 'ghost') {
                                        return <div key={j} style={{ marginBottom: '1.5pt' }}><GhostBox text={deco.text} /></div>
                                    }
                                    return (
                                        <div key={j} style={{ display: 'flex', alignItems: 'baseline', marginBottom: '1.5pt', fontSize: '9.5pt', lineHeight: 1.32, color: ATHENS_BODY, background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                                            {triangle}<span><BoldRender text={b} /></span>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )
                })}
            </section>
        ),

        projects: () => projects.length > 0 && (
            <section>
                <AthensSectionHeader title="Projects" />
                {projects.map((proj, i) => (
                    <div key={i} style={{ marginBottom: '6pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 700, fontSize: '10.5pt', color: ATHENS_INK }}>{proj.name}</span>
                            <span style={{ fontWeight: 700, fontSize: '9pt', color: ATHENS_RED }}>{proj.date}</span>
                        </div>
                        {proj.tech && <div style={{ fontSize: '9pt', color: ATHENS_MUTED, marginTop: '1pt' }}>{proj.tech}</div>}
                        <div style={{ marginTop: '2pt' }}>
                            {proj.bullets.map((b, j) => {
                                const deco = decoFor('projects', i, j)
                                if (!b.trim() && deco?.kind !== 'ghost') return null
                                if (deco?.kind === 'ghost') {
                                    return <div key={j} style={{ marginBottom: '1.5pt' }}><GhostBox text={deco.text} /></div>
                                }
                                return (
                                    <div key={j} style={{ display: 'flex', alignItems: 'baseline', marginBottom: '1.5pt', fontSize: '9.5pt', lineHeight: 1.32, color: ATHENS_BODY, background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                                        {triangle}<span><BoldRender text={b} /></span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                ))}
            </section>
        ),

        education: () => education.length > 0 && (
            <section>
                <AthensSectionHeader title="Education" />
                {education.map((edu, i) => {
                    const eduTop = edu.school || 'University'
                    const showDegree = edu.degree && !sameText(edu.degree, eduTop)
                    return (
                    <div key={i} style={{ marginBottom: '5pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 700, color: ATHENS_INK }}>{eduTop}</span>
                            <span style={{ fontWeight: 700, fontSize: '9pt', color: ATHENS_RED }}>{edu.date}</span>
                        </div>
                        {showDegree ? (
                            <div style={{ fontSize: '9pt', color: ATHENS_MUTED, marginTop: '0.5pt' }}>
                                {edu.degree}{edu.gpa ? `  ·  GPA: ${edu.gpa}` : ''}
                            </div>
                        ) : edu.gpa ? (
                            <div style={{ fontSize: '9pt', color: ATHENS_MUTED, marginTop: '0.5pt' }}>GPA: {edu.gpa}</div>
                        ) : null}
                        {edu.coursework && (
                            <div style={{ fontSize: '9pt', marginTop: '1.5pt', lineHeight: 1.3, color: ATHENS_BODY }}>
                                <span style={{ fontWeight: 700 }}>Relevant Coursework: </span>{edu.coursework}
                            </div>
                        )}
                    </div>
                    )
                })}
            </section>
        ),

        certifications: () => certifications.filter(c => c.trim()).length > 0 && (
            <section>
                <AthensSectionHeader title="Certifications" />
                {certifications.filter(c => c.trim()).map((c, i) => (
                    <div key={i} style={{ fontSize: '9.5pt', color: ATHENS_INK, marginTop: '2pt' }}>{c}</div>
                ))}
            </section>
        ),

        achievements: () => achievements.filter(a => a.trim()).length > 0 && (
            <section>
                <AthensSectionHeader title="Achievements" />
                {bullets(achievements)}
            </section>
        ),

        leadership: () => leadership.length > 0 && (
            <section>
                <AthensSectionHeader title="Leadership" />
                {leadership.map((lead, i) => (
                    <div key={i} style={{ marginBottom: '5pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 700, color: ATHENS_INK }}>{lead.org}</span>
                            <span style={{ fontWeight: 700, fontSize: '9pt', color: ATHENS_RED }}>{lead.date}</span>
                        </div>
                        {lead.role && <div style={{ fontSize: '9pt', color: ATHENS_MUTED, marginTop: '0.5pt' }}>{lead.role}</div>}
                        {lead.bullets.filter(b => b.trim()).length > 0 && bullets(lead.bullets)}
                    </div>
                ))}
            </section>
        ),
    }

    return (
        <div style={{
            fontFamily: "Arial, Helvetica, 'Segoe UI', sans-serif",
            fontSize: '10pt',
            lineHeight: 1.4,
            color: ATHENS_INK,
            minHeight: '100%',
            background: '#fff',
        }}>
            <style>{`@keyframes ra-flash-green { 0% { background: #d1fae5; } 60% { background: #d1fae5; } 100% { background: transparent; } }`}</style>
            <div style={{ background: ATHENS_HEADER_BG, borderBottom: `3px solid ${ATHENS_RED}`, padding: '22pt 42pt 14pt' }}>
                <div style={{ fontWeight: 700, fontSize: '20pt', letterSpacing: '0.5px', color: ATHENS_INK }}>
                    {profile.name || 'Your Name'}
                </div>
                {roleSubtitle && (
                    <div style={{ fontWeight: 700, fontSize: '10pt', letterSpacing: '1px', textTransform: 'uppercase', color: ATHENS_RED, marginTop: '3pt' }}>
                        {roleSubtitle}
                    </div>
                )}
                {contactParts.length > 0 && (
                    <div style={{ fontSize: '9pt', color: ATHENS_MUTED, marginTop: '3pt' }}>
                        {contactParts.join('  ·  ')}
                    </div>
                )}
            </div>

            <div style={{ padding: '10pt 42pt 36pt' }}>
                {order.map(key => <React.Fragment key={key}>{sections[key]?.()}</React.Fragment>)}
            </div>
        </div>
    )
}

// ── Axis Resume Preview (HTML) ────────────────────────────
// Original design, built 2026-07-19 to fill a structural gap: every active
// template is flat rules/panels/pills. Axis is the only one with a vertical
// "career timeline" rail — a violet node per dated entry, connected by a thin
// line segment spanning that entry's height. Verified via research that this
// stays fully single-column/ATS-safe: the rail is pure decoration (borders +
// circles), not a layout mechanism — no reading-order ambiguity for any
// parser. Mirrors AxisPdfDocument.tsx. Font: Roboto (already registered).
const AXIS_INK = '#1c1c26'
const AXIS_MUTED = '#5b5b6b'
const AXIS_ACCENT = '#7c3aed'
const AXIS_RAIL = '#ddd2fb'

function AxisSectionHeader({ title }: { title: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', marginTop: '12pt', marginBottom: '5pt' }}>
            <div style={{ width: 6, height: 6, background: AXIS_ACCENT, marginRight: 6, flexShrink: 0 }} />
            <span style={{ fontWeight: 700, fontSize: '10.5pt', letterSpacing: '1px', textTransform: 'uppercase', color: AXIS_INK }}>{title}</span>
        </div>
    )
}

function AxisTimelineEntry({ last = false, children }: { last?: boolean; children: React.ReactNode }) {
    return (
        <div style={{ display: 'flex' }}>
            <div style={{ width: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ width: 6, height: 6, borderRadius: 3, background: AXIS_ACCENT, marginTop: 3, flexShrink: 0 }} />
                {!last && <div style={{ flex: 1, width: 1, background: AXIS_RAIL, marginTop: 2 }} />}
            </div>
            <div style={{ flex: 1, paddingLeft: 10, paddingBottom: 9, minWidth: 0 }}>{children}</div>
        </div>
    )
}

function AxisResumePreview({ state }: { state: ResumeEditorState }) {
    const { profile, summary, education, experience, projects, skills, leadership, certifications, achievements } = state
    const decorations = usePreviewDecorations()
    const decoFor = (section: string, index?: number, bulletIndex?: number, skillsField?: string) => decorations.get(decorationKey(section, index, bulletIndex, skillsField))
    const decoStyle = (deco: ReturnType<typeof decoFor>): React.CSSProperties =>
        deco?.kind === 'flash' ? { animation: 'ra-flash-green 0.5s ease', borderRadius: 3 } : {}

    const contactParts = [
        profile.email, profile.phone, profile.location, profile.linkedin, profile.github, profile.portfolio,
    ].filter(Boolean)
    const roleSubtitle = profile.headline?.trim() || ''
    const dateRange = (a?: string, b?: string) => [a, b].filter(Boolean).join(' – ')

    const skillRows = [
        { field: 'languages' as const, label: 'Languages', value: skills.languages },
        { field: 'frameworks' as const, label: 'Frameworks', value: skills.frameworks },
        { field: 'tools' as const, label: 'Tools & Platforms', value: skills.tools },
        { field: 'soft' as const, label: 'Core Competencies', value: skills.soft },
    ].filter(r => (r.value && r.value.trim()) || decoFor('skills', undefined, undefined, r.field)?.kind === 'ghost')

    const bullets = (items: string[], sectionKey: string, entryIdx: number) => (
        <div style={{ marginTop: '2pt' }}>
            {items.map((b, j) => {
                const deco = decoFor(sectionKey, entryIdx, j)
                if (!b.trim() && deco?.kind !== 'ghost') return null
                if (deco?.kind === 'ghost') {
                    return <div key={j} style={{ marginBottom: '1.5pt' }}><GhostBox text={deco.text} /></div>
                }
                return (
                    <div key={j} style={{ display: 'flex', marginBottom: '1.5pt', fontSize: '9.5pt', lineHeight: 1.32, background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                        <span style={{ width: 10, flexShrink: 0, color: AXIS_MUTED }}>•</span><span style={{ color: AXIS_INK }}><BoldRender text={b} /></span>
                    </div>
                )
            })}
        </div>
    )

    const order = state.sectionOrder ?? ['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'achievements', 'leadership']
    const sections: Record<string, () => React.ReactNode> = {
        summary: () => {
            const deco = decoFor('summary')
            if (deco?.kind === 'ghost') return <section><AxisSectionHeader title="Summary" /><GhostBox text={deco.text} /></section>
            if (!summary) return null
            return (
                <section>
                    <AxisSectionHeader title="Summary" />
                    <div style={{ fontSize: '9.7pt', lineHeight: 1.42, color: AXIS_INK, background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                        <BoldRender text={summary} />
                    </div>
                </section>
            )
        },

        skills: () => skillRows.length > 0 && (
            <section>
                <AxisSectionHeader title="Skills" />
                {skillRows.map((row, i) => {
                    const deco = decoFor('skills', undefined, undefined, row.field)
                    if (deco?.kind === 'ghost') {
                        return <div key={i} style={{ marginBottom: '2.5pt' }}><GhostBox text={deco.text} inline={<span style={{ fontWeight: 700 }}>{row.label}:  </span>} /></div>
                    }
                    return (
                        <div key={i} style={{ fontSize: '9.5pt', lineHeight: 1.4, marginBottom: '2.5pt', color: AXIS_INK, background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                            <span style={{ fontWeight: 700 }}>{row.label}:  </span>{row.value}
                        </div>
                    )
                })}
            </section>
        ),

        experience: () => experience.length > 0 && (
            <section>
                <AxisSectionHeader title="Experience" />
                {experience.map((exp, i) => {
                    const companyLine = [exp.company, exp.location].filter(Boolean).join(' · ')
                    return (
                        <AxisTimelineEntry key={i} last={i === experience.length - 1}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <span style={{ fontWeight: 700, fontSize: '10.3pt', color: AXIS_INK }}>{exp.title || 'Role'}</span>
                                <span style={{ fontSize: '8.7pt', fontWeight: 700, color: AXIS_ACCENT, marginLeft: 8 }}>{dateRange(exp.startDate, exp.endDate)}</span>
                            </div>
                            {companyLine && <div style={{ fontStyle: 'italic', fontSize: '9.3pt', color: AXIS_MUTED, marginTop: '0.5pt', marginBottom: '1pt' }}>{companyLine}</div>}
                            {bullets(exp.bullets, 'experience', i)}
                        </AxisTimelineEntry>
                    )
                })}
            </section>
        ),

        projects: () => projects.length > 0 && (
            <section>
                <AxisSectionHeader title="Projects" />
                {projects.map((proj, i) => (
                    <AxisTimelineEntry key={i} last={i === projects.length - 1}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 700, fontSize: '10.3pt', color: AXIS_INK }}>{proj.name}</span>
                            <span style={{ fontSize: '8.7pt', fontWeight: 700, color: AXIS_ACCENT, marginLeft: 8 }}>{proj.date}</span>
                        </div>
                        {proj.tech && <div style={{ fontStyle: 'italic', fontSize: '9.3pt', color: AXIS_MUTED, marginTop: '0.5pt' }}>{proj.tech}</div>}
                        {bullets(proj.bullets, 'projects', i)}
                    </AxisTimelineEntry>
                ))}
            </section>
        ),

        education: () => education.length > 0 && (
            <section>
                <AxisSectionHeader title="Education" />
                {education.map((edu, i) => {
                    const eduTop = edu.school || 'University'
                    const showDegree = edu.degree && !sameText(edu.degree, eduTop)
                    return (
                        <AxisTimelineEntry key={i} last={i === education.length - 1}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <span style={{ fontWeight: 700, color: AXIS_INK }}>{eduTop}</span>
                                <span style={{ fontSize: '8.7pt', fontWeight: 700, color: AXIS_ACCENT, marginLeft: 8 }}>{edu.date}</span>
                            </div>
                            {showDegree ? (
                                <div style={{ fontStyle: 'italic', fontSize: '9.3pt', color: AXIS_MUTED, marginTop: '0.5pt' }}>
                                    {edu.degree}{edu.gpa ? `  ·  GPA: ${edu.gpa}` : ''}
                                </div>
                            ) : edu.gpa ? (
                                <div style={{ fontSize: '9.3pt', color: AXIS_MUTED, marginTop: '0.5pt' }}>GPA: {edu.gpa}</div>
                            ) : null}
                            {edu.coursework && (
                                <div style={{ fontSize: '8.8pt', marginTop: '1.5pt', lineHeight: 1.3, color: AXIS_INK }}>
                                    <span style={{ fontWeight: 700 }}>Relevant Coursework: </span>{edu.coursework}
                                </div>
                            )}
                        </AxisTimelineEntry>
                    )
                })}
            </section>
        ),

        certifications: () => {
            const items = certifications.filter(c => c.trim())
            return items.length > 0 && (
                <section>
                    <AxisSectionHeader title="Certifications" />
                    {items.map((c, i) => (
                        <AxisTimelineEntry key={i} last={i === items.length - 1}>
                            <span style={{ fontSize: '9.5pt', color: AXIS_INK }}>{c}</span>
                        </AxisTimelineEntry>
                    ))}
                </section>
            )
        },

        achievements: () => {
            const items = achievements.filter(a => a.trim())
            return items.length > 0 && (
                <section>
                    <AxisSectionHeader title="Achievements" />
                    {items.map((a, i) => (
                        <AxisTimelineEntry key={i} last={i === items.length - 1}>
                            <span style={{ fontSize: '9.5pt', color: AXIS_INK }}>{a}</span>
                        </AxisTimelineEntry>
                    ))}
                </section>
            )
        },

        leadership: () => leadership.length > 0 && (
            <section>
                <AxisSectionHeader title="Leadership" />
                {leadership.map((lead, i) => (
                    <AxisTimelineEntry key={i} last={i === leadership.length - 1}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 700, color: AXIS_INK }}>{lead.org}</span>
                            <span style={{ fontSize: '8.7pt', fontWeight: 700, color: AXIS_ACCENT, marginLeft: 8 }}>{lead.date}</span>
                        </div>
                        {lead.role && <div style={{ fontStyle: 'italic', fontSize: '9.3pt', color: AXIS_MUTED, marginTop: '0.5pt' }}>{lead.role}</div>}
                        {bullets(lead.bullets, 'leadership', i)}
                    </AxisTimelineEntry>
                ))}
            </section>
        ),
    }

    return (
        <div style={{
            fontFamily: "'Roboto', Arial, sans-serif",
            fontSize: '10pt',
            lineHeight: 1.4,
            color: AXIS_INK,
            padding: '38pt 46pt',
            minHeight: '100%',
            background: '#fff',
        }}>
            <style>{`@keyframes ra-flash-green { 0% { background: #d1fae5; } 60% { background: #d1fae5; } 100% { background: transparent; } }`}</style>
            <div style={{ fontWeight: 700, fontSize: '22pt', color: AXIS_INK, lineHeight: 1.05 }}>
                {profile.name || 'Your Name'}
            </div>
            {roleSubtitle && (
                <div style={{ fontSize: '11pt', fontWeight: 700, color: AXIS_ACCENT, marginTop: '2pt' }}>
                    {roleSubtitle}
                </div>
            )}
            {contactParts.length > 0 && (
                <div style={{ fontSize: '9pt', color: AXIS_MUTED, marginTop: '5pt' }}>
                    {contactParts.join('  ·  ')}
                </div>
            )}
            <div style={{ borderBottom: `1.2px solid ${AXIS_ACCENT}`, marginTop: '7pt' }} />

            {order.map(key => <React.Fragment key={key}>{sections[key]?.()}</React.Fragment>)}
        </div>
    )
}

// ── Beacon Resume Preview (HTML) ──────────────────────────
// Solid navy banner header with reversed (white) name/contact text, promoted
// from the pending "Kickresume Gradient" catalog entry. Built 2026-07-19 —
// research-driven pick: the colored-banner-header archetype is the most
// common "modern professional" resume style across every major builder, and
// none of the other 13 active templates use reversed text on a solid color
// block. Mirrors BeaconPdfDocument.tsx. Font: Open Sans (already registered).
const BEACON_NAVY = '#0f3460'
const BEACON_INK = '#1a1a2e'
const BEACON_MUTED = '#5c5c6e'
const BEACON_BANNER_TEXT = '#f4f6fb'
const BEACON_BANNER_MUTED = '#c3cbe0'

function BeaconSectionHeader({ title }: { title: string }) {
    return (
        <div style={{ marginTop: '11pt', marginBottom: '5pt' }}>
            <div style={{ fontSize: '10.5pt', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: BEACON_NAVY, marginBottom: '3pt' }}>
                {title}
            </div>
            <div style={{ borderBottom: `1px solid ${BEACON_NAVY}` }} />
        </div>
    )
}

function BeaconResumePreview({ state }: { state: ResumeEditorState }) {
    const { profile, summary, education, experience, projects, skills, leadership, certifications, achievements } = state
    const decorations = usePreviewDecorations()
    const decoFor = (section: string, index?: number, bulletIndex?: number, skillsField?: string) => decorations.get(decorationKey(section, index, bulletIndex, skillsField))
    const decoStyle = (deco: ReturnType<typeof decoFor>): React.CSSProperties =>
        deco?.kind === 'flash' ? { animation: 'ra-flash-green 0.5s ease', borderRadius: 3 } : {}

    const contactParts = [profile.email, profile.phone, profile.location, profile.linkedin, profile.github, profile.portfolio].filter(Boolean)
    const roleSubtitle = profile.headline?.trim() || ''
    const dateRange = (a?: string, b?: string) => [a, b].filter(Boolean).join(' – ')

    const skillRows = [
        { field: 'languages' as const, label: 'Languages', value: skills.languages },
        { field: 'frameworks' as const, label: 'Frameworks', value: skills.frameworks },
        { field: 'tools' as const, label: 'Tools & Platforms', value: skills.tools },
        { field: 'soft' as const, label: 'Core Competencies', value: skills.soft },
    ].filter(r => (r.value && r.value.trim()) || decoFor('skills', undefined, undefined, r.field)?.kind === 'ghost')

    const bullets = (items: string[], sectionKey: string, entryIdx: number) => (
        <div style={{ marginTop: '2pt' }}>
            {items.map((b, j) => {
                const deco = decoFor(sectionKey, entryIdx, j)
                if (!b.trim() && deco?.kind !== 'ghost') return null
                if (deco?.kind === 'ghost') {
                    return <div key={j} style={{ marginBottom: '1.5pt' }}><GhostBox text={deco.text} /></div>
                }
                return (
                    <div key={j} style={{ display: 'flex', marginBottom: '1.5pt', fontSize: '9.5pt', lineHeight: 1.32, background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                        <span style={{ width: 10, flexShrink: 0, color: BEACON_MUTED }}>•</span><span style={{ color: BEACON_INK }}><BoldRender text={b} /></span>
                    </div>
                )
            })}
        </div>
    )

    const order = state.sectionOrder ?? ['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'achievements', 'leadership']
    const sections: Record<string, () => React.ReactNode> = {
        summary: () => {
            const deco = decoFor('summary')
            if (deco?.kind === 'ghost') return <section><BeaconSectionHeader title="Summary" /><GhostBox text={deco.text} /></section>
            if (!summary) return null
            return (
                <section>
                    <BeaconSectionHeader title="Summary" />
                    <div style={{ fontSize: '9.7pt', lineHeight: 1.42, color: BEACON_INK, background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                        <BoldRender text={summary} />
                    </div>
                </section>
            )
        },

        skills: () => skillRows.length > 0 && (
            <section>
                <BeaconSectionHeader title="Skills" />
                {skillRows.map((row, i) => {
                    const deco = decoFor('skills', undefined, undefined, row.field)
                    if (deco?.kind === 'ghost') {
                        return <div key={i} style={{ marginBottom: '2.5pt' }}><GhostBox text={deco.text} inline={<span style={{ fontWeight: 700 }}>{row.label}:  </span>} /></div>
                    }
                    return (
                        <div key={i} style={{ fontSize: '9.5pt', lineHeight: 1.4, marginBottom: '2.5pt', color: BEACON_INK, background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                            <span style={{ fontWeight: 700 }}>{row.label}:  </span>{row.value}
                        </div>
                    )
                })}
            </section>
        ),

        experience: () => experience.length > 0 && (
            <section>
                <BeaconSectionHeader title="Experience" />
                {experience.map((exp, i) => {
                    const companyLine = [exp.company, exp.location].filter(Boolean).join(' · ')
                    return (
                        <div key={i} style={{ marginBottom: '7pt' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <span style={{ fontWeight: 700, fontSize: '10.3pt', color: BEACON_INK }}>{exp.title || 'Role'}</span>
                                <span style={{ fontSize: '8.7pt', fontWeight: 700, color: BEACON_NAVY, marginLeft: 8 }}>{dateRange(exp.startDate, exp.endDate)}</span>
                            </div>
                            {companyLine && <div style={{ fontStyle: 'italic', fontSize: '9.3pt', color: BEACON_MUTED, marginTop: '0.5pt', marginBottom: '1pt' }}>{companyLine}</div>}
                            {bullets(exp.bullets, 'experience', i)}
                        </div>
                    )
                })}
            </section>
        ),

        projects: () => projects.length > 0 && (
            <section>
                <BeaconSectionHeader title="Projects" />
                {projects.map((proj, i) => (
                    <div key={i} style={{ marginBottom: '6pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 700, fontSize: '10.3pt', color: BEACON_INK }}>{proj.name}</span>
                            <span style={{ fontSize: '8.7pt', fontWeight: 700, color: BEACON_NAVY, marginLeft: 8 }}>{proj.date}</span>
                        </div>
                        {proj.tech && <div style={{ fontStyle: 'italic', fontSize: '9.3pt', color: BEACON_MUTED, marginTop: '0.5pt' }}>{proj.tech}</div>}
                        {bullets(proj.bullets, 'projects', i)}
                    </div>
                ))}
            </section>
        ),

        education: () => education.length > 0 && (
            <section>
                <BeaconSectionHeader title="Education" />
                {education.map((edu, i) => {
                    const eduTop = edu.school || 'University'
                    const showDegree = edu.degree && !sameText(edu.degree, eduTop)
                    return (
                        <div key={i} style={{ marginBottom: '5pt' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <span style={{ fontWeight: 700, color: BEACON_INK }}>{eduTop}</span>
                                <span style={{ fontSize: '8.7pt', fontWeight: 700, color: BEACON_NAVY, marginLeft: 8 }}>{edu.date}</span>
                            </div>
                            {showDegree ? (
                                <div style={{ fontStyle: 'italic', fontSize: '9.3pt', color: BEACON_MUTED, marginTop: '0.5pt' }}>
                                    {edu.degree}{edu.gpa ? `  ·  GPA: ${edu.gpa}` : ''}
                                </div>
                            ) : edu.gpa ? (
                                <div style={{ fontSize: '9.3pt', color: BEACON_MUTED, marginTop: '0.5pt' }}>GPA: {edu.gpa}</div>
                            ) : null}
                            {edu.coursework && (
                                <div style={{ fontSize: '8.8pt', marginTop: '1.5pt', lineHeight: 1.3, color: BEACON_INK }}>
                                    <span style={{ fontWeight: 700 }}>Relevant Coursework: </span>{edu.coursework}
                                </div>
                            )}
                        </div>
                    )
                })}
            </section>
        ),

        certifications: () => certifications.filter(c => c.trim()).length > 0 && (
            <section>
                <BeaconSectionHeader title="Certifications" />
                {bullets(certifications, 'certifications', 0)}
            </section>
        ),

        achievements: () => achievements.filter(a => a.trim()).length > 0 && (
            <section>
                <BeaconSectionHeader title="Achievements" />
                {bullets(achievements, 'achievements', 0)}
            </section>
        ),

        leadership: () => leadership.length > 0 && (
            <section>
                <BeaconSectionHeader title="Leadership" />
                {leadership.map((lead, i) => (
                    <div key={i} style={{ marginBottom: '5pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 700, color: BEACON_INK }}>{lead.org}</span>
                            <span style={{ fontSize: '8.7pt', fontWeight: 700, color: BEACON_NAVY, marginLeft: 8 }}>{lead.date}</span>
                        </div>
                        {lead.role && <div style={{ fontStyle: 'italic', fontSize: '9.3pt', color: BEACON_MUTED, marginTop: '0.5pt' }}>{lead.role}</div>}
                        {bullets(lead.bullets, 'leadership', i)}
                    </div>
                ))}
            </section>
        ),
    }

    return (
        <div style={{
            fontFamily: "'Open Sans', 'Segoe UI', Arial, sans-serif",
            fontSize: '10pt',
            lineHeight: 1.4,
            color: BEACON_INK,
            minHeight: '100%',
            background: '#fff',
        }}>
            <style>{`@keyframes ra-flash-green { 0% { background: #d1fae5; } 60% { background: #d1fae5; } 100% { background: transparent; } }`}</style>
            <div style={{ background: BEACON_NAVY, padding: '26pt 44pt 16pt' }}>
                <div style={{ fontWeight: 700, fontSize: '21pt', color: BEACON_BANNER_TEXT, lineHeight: 1.08 }}>
                    {profile.name || 'Your Name'}
                </div>
                {roleSubtitle && (
                    <div style={{ fontWeight: 700, fontSize: '10.5pt', letterSpacing: '0.8px', textTransform: 'uppercase', color: BEACON_BANNER_MUTED, marginTop: '3pt' }}>
                        {roleSubtitle}
                    </div>
                )}
                {contactParts.length > 0 && (
                    <div style={{ fontSize: '8.8pt', color: BEACON_BANNER_MUTED, marginTop: '6pt' }}>
                        {contactParts.join('  ·  ')}
                    </div>
                )}
            </div>

            <div style={{ padding: '10pt 44pt 36pt' }}>
                {order.map(key => <React.Fragment key={key}>{sections[key]?.()}</React.Fragment>)}
            </div>
        </div>
    )
}

// ── Lapis Resume Preview (HTML) ───────────────────────────
// Modern single-column indigo. Section headers = thin divider rule + vertical
// indigo bar + indigo uppercase label; skills as a wrapping cloud of outlined
// pills; indigo-italic company/tech line. Mirrors LapisPdfDocument.tsx
// (the ananya-reddy carousel design).
const LAPIS_ACCENT = '#1a1670'
const LAPIS_INK = '#1f2024'

function LapisSectionHeader({ title }: { title: string }) {
    return (
        <div style={{ marginTop: '10pt', marginBottom: '4pt' }}>
            <div style={{ borderTop: '1px solid #e4e4ee', marginBottom: '5pt' }} />
            <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ width: 3, height: 12, background: LAPIS_ACCENT, marginRight: 6, flexShrink: 0 }} />
                <span style={{ fontWeight: 700, fontSize: '11pt', letterSpacing: '0.5px', textTransform: 'uppercase', color: LAPIS_ACCENT }}>{title}</span>
            </div>
        </div>
    )
}

function LapisResumePreview({ state }: { state: ResumeEditorState }) {
    const { profile, summary, education, experience, projects, skills, leadership, certifications, achievements } = state
    const decorations = usePreviewDecorations()
    const decoFor = (section: string, index?: number, bulletIndex?: number, skillsField?: string) => decorations.get(decorationKey(section, index, bulletIndex, skillsField))
    const decoStyle = (deco: ReturnType<typeof decoFor>): React.CSSProperties =>
        deco?.kind === 'flash' ? { animation: 'ra-flash-green 0.5s ease', borderRadius: 3 } : {}

    const contactParts = [profile.email, profile.phone, profile.location, profile.linkedin, profile.github, profile.portfolio].filter(Boolean)
    const roleSubtitle = profile.headline?.trim() || ''
    const dateRange = (a?: string, b?: string) => [a, b].filter(Boolean).join(' – ')
    const splitItems = (csv: string) => (csv || '').split(/,(?![^(]*\))|[•\n]/).map(s => s.trim()).filter(Boolean)
    // Rendered as one merged pill cloud (no per-field grouping in this
    // template), so a pending skills edit can't slot into a specific spot in
    // the cloud — instead the whole edited field renders as one GhostBox
    // alongside the other fields' normal pills.
    const skillFields = [
        { field: 'languages' as const, csv: skills.languages },
        { field: 'frameworks' as const, csv: skills.frameworks },
        { field: 'tools' as const, csv: skills.tools },
        { field: 'soft' as const, csv: skills.soft },
    ]
    const hasAnySkills = skillFields.some(f => splitItems(f.csv).length > 0 || decoFor('skills', undefined, undefined, f.field)?.kind === 'ghost')

    const bullets = (items: string[]) => (
        <ul style={{ margin: '2pt 0 0 0', paddingLeft: '14pt', listStyle: 'disc' }}>
            {items.filter(b => b.trim()).map((b, j) => (
                <li key={j} style={{ marginBottom: '1.5pt', fontSize: '10pt', lineHeight: 1.3 }}><BoldRender text={b} /></li>
            ))}
        </ul>
    )
    const companyLine = (t: string) => <div style={{ fontStyle: 'italic', fontSize: '10pt', color: LAPIS_ACCENT, marginTop: '0.5pt' }}>{t}</div>

    const order = state.sectionOrder ?? ['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'achievements', 'leadership']
    const sections: Record<string, () => React.ReactNode> = {
        summary: () => {
            const deco = decoFor('summary')
            if (deco?.kind === 'ghost') {
                return <section><LapisSectionHeader title="Summary" /><GhostBox text={deco.text} /></section>
            }
            if (!summary) return null
            return (
                <section>
                    <LapisSectionHeader title="Summary" />
                    <div style={{ fontSize: '10pt', lineHeight: 1.4, color: LAPIS_INK, background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}><BoldRender text={summary} /></div>
                </section>
            )
        },

        skills: () => hasAnySkills && (
            <section>
                <LapisSectionHeader title="Skills" />
                <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: '3pt' }}>
                    {skillFields.map(f => {
                        const deco = decoFor('skills', undefined, undefined, f.field)
                        if (deco?.kind === 'ghost') {
                            return <div key={f.field} style={{ marginRight: '5pt', marginBottom: '5pt' }}><GhostBox text={deco.text} /></div>
                        }
                        return splitItems(f.csv).map((s, i) => (
                            <span key={`${f.field}-${i}`} style={{ border: '0.8px solid #cdcdde', borderRadius: 4, padding: '2pt 6pt', marginRight: '5pt', marginBottom: '5pt', fontSize: '9pt', color: LAPIS_INK, whiteSpace: 'nowrap' }}>{s}</span>
                        ))
                    })}
                </div>
            </section>
        ),

        experience: () => experience.length > 0 && (
            <section>
                <LapisSectionHeader title="Work Experience" />
                {experience.map((exp, i) => {
                    const cl = [exp.company, exp.location].filter(Boolean).join(', ')
                    return (
                        <div key={i} style={{ marginBottom: '6pt' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <span style={{ fontWeight: 700, fontSize: '10.5pt' }}>{exp.title || 'Role'}</span>
                                <span style={{ fontSize: '9.5pt', color: LAPIS_INK }}>{dateRange(exp.startDate, exp.endDate)}</span>
                            </div>
                            {cl && companyLine(cl)}
                            <ul style={{ margin: '2pt 0 0 0', paddingLeft: '14pt', listStyle: 'disc' }}>
                                {exp.bullets.map((b, j) => {
                                    const deco = decoFor('experience', i, j)
                                    if (!b.trim() && deco?.kind !== 'ghost') return null
                                    if (deco?.kind === 'ghost') {
                                        return <li key={j} style={{ marginBottom: '1.5pt', fontSize: '10pt', listStyle: 'none', marginLeft: '-14pt' }}><GhostBox text={deco.text} /></li>
                                    }
                                    return (
                                        <li key={j} style={{ marginBottom: '1.5pt', fontSize: '10pt', lineHeight: 1.3, background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                                            <BoldRender text={b} />
                                        </li>
                                    )
                                })}
                            </ul>
                        </div>
                    )
                })}
            </section>
        ),

        projects: () => projects.length > 0 && (
            <section>
                <LapisSectionHeader title="Projects" />
                {projects.map((proj, i) => (
                    <div key={i} style={{ marginBottom: '5pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 700, fontSize: '10.5pt' }}>{proj.name}</span>
                            {proj.date && <span style={{ fontSize: '9.5pt', color: LAPIS_INK }}>{proj.date}</span>}
                        </div>
                        {proj.tech && companyLine(proj.tech)}
                        <ul style={{ margin: '2pt 0 0 0', paddingLeft: '14pt', listStyle: 'disc' }}>
                            {proj.bullets.map((b, j) => {
                                const deco = decoFor('projects', i, j)
                                if (!b.trim() && deco?.kind !== 'ghost') return null
                                if (deco?.kind === 'ghost') {
                                    return <li key={j} style={{ marginBottom: '1.5pt', fontSize: '10pt', listStyle: 'none', marginLeft: '-14pt' }}><GhostBox text={deco.text} /></li>
                                }
                                return (
                                    <li key={j} style={{ marginBottom: '1.5pt', fontSize: '10pt', lineHeight: 1.3, background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                                        <BoldRender text={b} />
                                    </li>
                                )
                            })}
                        </ul>
                    </div>
                ))}
            </section>
        ),

        education: () => education.length > 0 && (
            <section>
                <LapisSectionHeader title="Education" />
                {education.map((edu, i) => {
                    const eduTop = edu.degree || edu.school || 'Degree'
                    const showSchool = edu.school && !sameText(edu.school, eduTop)
                    return (
                    <div key={i} style={{ marginBottom: '5pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 700 }}>{eduTop}</span>
                            <span style={{ fontSize: '9.5pt', color: LAPIS_INK }}>{edu.date}</span>
                        </div>
                        {(showSchool || edu.gpa) && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <span style={{ fontStyle: 'italic', color: LAPIS_ACCENT }}>{showSchool ? edu.school : ''}</span>
                                {edu.gpa && <span style={{ fontSize: '9.5pt', color: LAPIS_INK }}>{edu.gpa}</span>}
                            </div>
                        )}
                        {edu.coursework && (
                            <div style={{ fontSize: '9.5pt', marginTop: '1.5pt' }}>
                                <span style={{ fontWeight: 700 }}>Relevant Coursework: </span>{edu.coursework}
                            </div>
                        )}
                    </div>
                    )
                })}
            </section>
        ),

        certifications: () => certifications.filter(c => c.trim()).length > 0 && (
            <section><LapisSectionHeader title="Certifications" />{bullets(certifications)}</section>
        ),
        achievements: () => achievements.filter(a => a.trim()).length > 0 && (
            <section><LapisSectionHeader title="Achievements" />{bullets(achievements)}</section>
        ),
        leadership: () => leadership.length > 0 && (
            <section>
                <LapisSectionHeader title="Leadership" />
                {leadership.map((lead, i) => (
                    <div key={i} style={{ marginBottom: '5pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 700 }}>{lead.org}</span>
                            <span style={{ fontSize: '9.5pt', color: LAPIS_INK }}>{lead.date}</span>
                        </div>
                        {lead.role && companyLine(lead.role)}
                        {lead.bullets.filter(b => b.trim()).length > 0 && bullets(lead.bullets)}
                    </div>
                ))}
            </section>
        ),
    }

    return (
        <div style={{ fontFamily: "'Open Sans', 'Segoe UI', Arial, sans-serif", fontSize: '10pt', lineHeight: 1.4, color: LAPIS_INK, padding: '36pt 42pt', minHeight: '100%', background: '#fff' }}>
            <style>{`@keyframes ra-flash-green { 0% { background: #d1fae5; } 60% { background: #d1fae5; } 100% { background: transparent; } }`}</style>
            {/* Header */}
            <div>
                <div style={{ fontSize: '22pt', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: LAPIS_ACCENT, lineHeight: 1.05 }}>{profile.name || 'Your Name'}</div>
                {roleSubtitle && <div style={{ fontSize: '11.5pt', fontWeight: 700, color: LAPIS_ACCENT, marginTop: '2pt' }}>{roleSubtitle}</div>}
                {contactParts.length > 0 && <div style={{ fontSize: '9pt', color: LAPIS_INK, marginTop: '5pt' }}>{contactParts.join('   |   ')}</div>}
            </div>

            {order.map((key) => (
                <React.Fragment key={key}>{sections[key]?.()}</React.Fragment>
            ))}
        </div>
    )
}

// ── Rezi Resume Preview (HTML) ────────────────────────────
function ReziResumePreview({ state }: { state: ResumeEditorState }) {
    const { profile, summary, education, experience, projects, skills, certifications, achievements } = state
    const decorations = usePreviewDecorations()
    const decoFor = (section: string, index?: number, bulletIndex?: number, skillsField?: string) => decorations.get(decorationKey(section, index, bulletIndex, skillsField))
    const decoStyle = (deco: ReturnType<typeof decoFor>): React.CSSProperties =>
        deco?.kind === 'flash' ? { animation: 'ra-flash-green 0.5s ease', borderRadius: 3 } : {}
    const contactParts = [profile.phone, profile.email, profile.location, profile.linkedin, profile.github, profile.portfolio].filter(Boolean)
    const hasSkills = skills.languages || skills.tools || skills.frameworks || skills.soft
    const reziSkillFields = [
        ['languages', 'Languages'], ['tools', 'Tools'], ['frameworks', 'Frameworks'], ['soft', 'Core Competencies'],
    ] as const

    // Note: this preview has no Leadership block (pre-existing gap vs the PDF
    // renderer, unrelated to the layout-order refactor) — 'leadership' has no
    // entry in `sections`, so order.map safely skips it via `sections[key]?.()`.
    const order = state.sectionOrder ?? ['summary', 'education', 'experience', 'projects', 'skills', 'certifications', 'achievements', 'leadership']
    const sections: Record<string, () => React.ReactNode> = {
        summary: () => {
            const deco = decoFor('summary')
            if (deco?.kind === 'ghost') return <div style={{ marginBottom: '10pt' }}><GhostBox text={deco.text} /></div>
            if (!summary) return null
            return <div style={{ marginBottom: '10pt', fontSize: '10pt', lineHeight: 1.55, color: '#222', background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>{summary}</div>
        },

        education: () => education.length > 0 && (
            <section style={{ marginBottom: '10pt' }}>
                <div style={{ fontSize: '9.5pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', borderBottom: '0.5px solid #ccc', paddingBottom: '2pt', marginBottom: '6pt', color: '#222' }}>Education</div>
                {education.map((edu, i) => {
                    const showDegree = edu.degree && !sameText(edu.degree, edu.school)
                    return (
                    <div key={i} style={{ marginBottom: '5pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 700 }}>{edu.school}</span>
                            <span style={{ fontSize: '9pt', color: '#666', fontStyle: 'italic' }}>{edu.date}</span>
                        </div>
                        {showDegree && <div style={{ fontStyle: 'italic', fontSize: '9.5pt', color: '#555' }}>{edu.degree}</div>}
                    </div>
                    )
                })}
            </section>
        ),

        experience: () => experience.length > 0 && (
            <section style={{ marginBottom: '10pt' }}>
                <div style={{ fontSize: '9.5pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', borderBottom: '0.5px solid #ccc', paddingBottom: '2pt', marginBottom: '6pt', color: '#222' }}>Experience</div>
                {experience.map((exp, i) => (
                    <div key={i} style={{ marginBottom: '8pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 700 }}>{exp.company}</span>
                            <span style={{ fontSize: '9pt', color: '#666', fontStyle: 'italic' }}>{[exp.startDate, exp.endDate].filter(Boolean).join(' – ')}</span>
                        </div>
                        <div style={{ fontStyle: 'italic', fontSize: '9.5pt', color: '#555', marginBottom: '3pt' }}>{exp.title}{exp.location ? ` · ${exp.location}` : ''}</div>
                        {exp.bullets.map((b, j) => {
                            const deco = decoFor('experience', i, j)
                            if (!b.trim() && deco?.kind !== 'ghost') return null
                            if (deco?.kind === 'ghost') return <div key={j} style={{ marginBottom: '2pt' }}><GhostBox text={deco.text} /></div>
                            return (
                                <div key={j} style={{ display: 'flex', gap: '6pt', marginBottom: '2pt', fontSize: '10pt', background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                                    <span style={{ color: '#888', flexShrink: 0 }}>—</span>
                                    <BoldRender text={b} />
                                </div>
                            )
                        })}
                    </div>
                ))}
            </section>
        ),

        projects: () => projects.length > 0 && (
            <section style={{ marginBottom: '10pt' }}>
                <div style={{ fontSize: '9.5pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', borderBottom: '0.5px solid #ccc', paddingBottom: '2pt', marginBottom: '6pt', color: '#222' }}>Projects</div>
                {projects.map((proj, i) => (
                    <div key={i} style={{ marginBottom: '6pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 700 }}>{proj.name}</span>
                            <span style={{ fontSize: '9pt', color: '#666', fontStyle: 'italic' }}>{proj.date}</span>
                        </div>
                        {proj.bullets.map((b, j) => {
                            const deco = decoFor('projects', i, j)
                            if (!b.trim() && deco?.kind !== 'ghost') return null
                            if (deco?.kind === 'ghost') return <div key={j} style={{ marginBottom: '2pt' }}><GhostBox text={deco.text} /></div>
                            return (
                                <div key={j} style={{ display: 'flex', gap: '6pt', marginBottom: '2pt', fontSize: '10pt', background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                                    <span style={{ color: '#888', flexShrink: 0 }}>—</span>
                                    <BoldRender text={b} />
                                </div>
                            )
                        })}
                    </div>
                ))}
            </section>
        ),

        skills: () => (hasSkills || reziSkillFields.some(([f]) => decoFor('skills', undefined, undefined, f)?.kind === 'ghost')) && (
            <section style={{ marginBottom: '10pt' }}>
                <div style={{ fontSize: '9.5pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', borderBottom: '0.5px solid #ccc', paddingBottom: '2pt', marginBottom: '6pt', color: '#222' }}>Technical Skills</div>
                <div style={{ fontSize: '10pt', lineHeight: 1.8 }}>
                    {reziSkillFields.map(([field, label]) => {
                        const deco = decoFor('skills', undefined, undefined, field)
                        if (deco?.kind === 'ghost') {
                            return <GhostBox key={field} text={deco.text} inline={<span style={{ fontWeight: 700 }}>{label}: </span>} />
                        }
                        if (!skills[field]) return null
                        return <div key={field} style={{ background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}><span style={{ fontWeight: 700 }}>{label}: </span>{skills[field]}</div>
                    })}
                </div>
            </section>
        ),

        certifications: () => certifications.length > 0 && (
            <section style={{ marginBottom: '10pt' }}>
                <div style={{ fontSize: '9.5pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', borderBottom: '0.5px solid #ccc', paddingBottom: '2pt', marginBottom: '6pt', color: '#222' }}>Certifications</div>
                {certifications.map((cert, i) => (
                    <div key={i} style={{ display: 'flex', gap: '6pt', marginBottom: '2pt', fontSize: '10pt' }}>
                        <span style={{ color: '#888', flexShrink: 0 }}>—</span><span>{cert}</span>
                    </div>
                ))}
            </section>
        ),

        achievements: () => achievements.length > 0 && (
            <section style={{ marginBottom: '10pt' }}>
                <div style={{ fontSize: '9.5pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', borderBottom: '0.5px solid #ccc', paddingBottom: '2pt', marginBottom: '6pt', color: '#222' }}>Achievements</div>
                {achievements.map((ach, i) => (
                    <div key={i} style={{ display: 'flex', gap: '6pt', marginBottom: '2pt', fontSize: '10pt' }}>
                        <span style={{ color: '#888', flexShrink: 0 }}>—</span><span>{ach}</span>
                    </div>
                ))}
            </section>
        ),
    }

    return (
        <div style={{ fontFamily: "'Georgia', 'Times New Roman', serif", fontSize: '10.5pt', lineHeight: 1.5, color: '#1a1a1a', padding: '36pt 48pt', minHeight: '100%', background: '#fff' }}>
            <style>{`@keyframes ra-flash-green { 0% { background: #d1fae5; } 60% { background: #d1fae5; } 100% { background: transparent; } }`}</style>
            <div style={{ textAlign: 'center', fontSize: '18pt', fontWeight: 700, letterSpacing: '0.02em', marginBottom: '3pt' }}>
                {profile.name || 'Your Name'}
            </div>
            {contactParts.length > 0 && (
                <div style={{ textAlign: 'center', fontSize: '9pt', color: '#555', marginBottom: '6pt', letterSpacing: '0.02em' }}>
                    {contactParts.join(' · ')}
                </div>
            )}
            <hr style={{ border: 'none', borderTop: '0.75px solid #ccc', margin: '4pt 0 12pt' }} />
            {order.map((key) => (
                <React.Fragment key={key}>{sections[key]?.()}</React.Fragment>
            ))}
        </div>
    )
}

// ── London Resume Preview (HTML) ──────────────────────────
function LondonExtendingHeader({ title }: { title: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10pt 0 6pt' }}>
            <div style={{ flex: 1, borderTop: '0.75px solid #aaa' }} />
            <span style={{ fontSize: '10pt', fontStyle: 'italic', fontWeight: 600, color: '#444', whiteSpace: 'nowrap' }}>{title}</span>
            <div style={{ flex: 1, borderTop: '0.75px solid #aaa' }} />
        </div>
    )
}

function LondonResumePreview({ state }: { state: ResumeEditorState }) {
    const { profile, summary, education, experience, projects, skills, certifications, achievements } = state
    const decorations = usePreviewDecorations()
    const decoFor = (section: string, index?: number, bulletIndex?: number, skillsField?: string) => decorations.get(decorationKey(section, index, bulletIndex, skillsField))
    const decoStyle = (deco: ReturnType<typeof decoFor>): React.CSSProperties =>
        deco?.kind === 'flash' ? { animation: 'ra-flash-green 0.5s ease', borderRadius: 3 } : {}
    const contactParts = [profile.phone, profile.email, profile.location, profile.linkedin, profile.github, profile.portfolio].filter(Boolean)
    const hasSkills = skills.languages || skills.tools || skills.frameworks || skills.soft
    const londonSkillFields = [
        ['languages', 'Technical'], ['tools', 'Tools'], ['frameworks', 'Frameworks'], ['soft', 'Core Competencies'],
    ] as const

    // Note: no Leadership block in this preview (pre-existing gap vs the PDF
    // renderer) — 'leadership' has no `sections` entry, safely skipped.
    const order = state.sectionOrder ?? ['summary', 'education', 'experience', 'projects', 'skills', 'certifications', 'achievements', 'leadership']
    const sections: Record<string, () => React.ReactNode> = {
        summary: () => {
            const deco = decoFor('summary')
            if (deco?.kind === 'ghost') {
                return <><LondonExtendingHeader title="Profile" /><GhostBox text={deco.text} /></>
            }
            if (!summary) return null
            return (
                <>
                    <LondonExtendingHeader title="Profile" />
                    <div style={{ fontSize: '10pt', lineHeight: 1.55, color: '#333', background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>{summary}</div>
                </>
            )
        },

        education: () => education.length > 0 && (
            <section>
                <LondonExtendingHeader title="Education" />
                {education.map((edu, i) => {
                    const showDegree = edu.degree && !sameText(edu.degree, edu.school)
                    return (
                    <div key={i} style={{ marginBottom: '5pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 700 }}>{edu.school}</span>
                            <span style={{ fontSize: '9pt', color: '#777', fontStyle: 'italic' }}>{edu.date}</span>
                        </div>
                        {showDegree && <div style={{ fontStyle: 'italic', fontSize: '9.5pt', color: '#666' }}>{edu.degree}</div>}
                    </div>
                    )
                })}
            </section>
        ),

        experience: () => experience.length > 0 && (
            <section>
                <LondonExtendingHeader title="Experience" />
                {experience.map((exp, i) => (
                    <div key={i} style={{ marginBottom: '8pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 700 }}>{exp.company}</span>
                            <span style={{ fontSize: '9pt', color: '#777', fontStyle: 'italic' }}>{[exp.startDate, exp.endDate].filter(Boolean).join(' – ')}</span>
                        </div>
                        <div style={{ fontStyle: 'italic', fontSize: '9.5pt', color: '#666', marginBottom: '3pt' }}>{exp.title}{exp.location ? ` · ${exp.location}` : ''}</div>
                        {exp.bullets.map((b, j) => {
                            const deco = decoFor('experience', i, j)
                            if (!b.trim() && deco?.kind !== 'ghost') return null
                            if (deco?.kind === 'ghost') return <div key={j} style={{ marginBottom: '2pt' }}><GhostBox text={deco.text} /></div>
                            return (
                                <div key={j} style={{ display: 'flex', gap: '6pt', marginBottom: '2pt', fontSize: '10pt', background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                                    <span style={{ color: '#bbb', fontStyle: 'italic', flexShrink: 0 }}>·</span>
                                    <BoldRender text={b} />
                                </div>
                            )
                        })}
                    </div>
                ))}
            </section>
        ),

        projects: () => projects.length > 0 && (
            <section>
                <LondonExtendingHeader title="Projects" />
                {projects.map((proj, i) => (
                    <div key={i} style={{ marginBottom: '6pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 700 }}>{proj.name}</span>
                            <span style={{ fontSize: '9pt', color: '#777', fontStyle: 'italic' }}>{proj.date}</span>
                        </div>
                        {proj.bullets.map((b, j) => {
                            const deco = decoFor('projects', i, j)
                            if (!b.trim() && deco?.kind !== 'ghost') return null
                            if (deco?.kind === 'ghost') return <div key={j} style={{ marginBottom: '2pt' }}><GhostBox text={deco.text} /></div>
                            return (
                                <div key={j} style={{ display: 'flex', gap: '6pt', marginBottom: '2pt', fontSize: '10pt', background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                                    <span style={{ color: '#bbb', fontStyle: 'italic', flexShrink: 0 }}>·</span>
                                    <BoldRender text={b} />
                                </div>
                            )
                        })}
                    </div>
                ))}
            </section>
        ),

        skills: () => (hasSkills || londonSkillFields.some(([f]) => decoFor('skills', undefined, undefined, f)?.kind === 'ghost')) && (
            <section>
                <LondonExtendingHeader title="Skills" />
                <div style={{ fontSize: '10pt', lineHeight: 1.7, color: '#444' }}>
                    {londonSkillFields.map(([field, label]) => {
                        const deco = decoFor('skills', undefined, undefined, field)
                        if (deco?.kind === 'ghost') {
                            return <GhostBox key={field} text={deco.text} inline={<span style={{ fontWeight: 700 }}>{label}: </span>} />
                        }
                        if (!skills[field]) return null
                        return <div key={field} style={{ background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}><span style={{ fontWeight: 700 }}>{label}: </span>{skills[field]}</div>
                    })}
                </div>
            </section>
        ),

        certifications: () => certifications.length > 0 && (
            <section>
                <LondonExtendingHeader title="Certifications" />
                {certifications.map((cert, i) => (
                    <div key={i} style={{ display: 'flex', gap: '6pt', marginBottom: '2pt', fontSize: '10pt' }}>
                        <span style={{ color: '#bbb', fontStyle: 'italic', flexShrink: 0 }}>·</span><span>{cert}</span>
                    </div>
                ))}
            </section>
        ),

        achievements: () => achievements.length > 0 && (
            <section>
                <LondonExtendingHeader title="Achievements" />
                {achievements.map((ach, i) => (
                    <div key={i} style={{ display: 'flex', gap: '6pt', marginBottom: '2pt', fontSize: '10pt' }}>
                        <span style={{ color: '#bbb', fontStyle: 'italic', flexShrink: 0 }}>·</span><span>{ach}</span>
                    </div>
                ))}
            </section>
        ),
    }

    return (
        <div style={{ fontFamily: "'Georgia', 'Times New Roman', serif", fontSize: '10.5pt', lineHeight: 1.45, color: '#1a1a1a', padding: '36pt 48pt', minHeight: '100%', background: '#fff' }}>
            <style>{`@keyframes ra-flash-green { 0% { background: #d1fae5; } 60% { background: #d1fae5; } 100% { background: transparent; } }`}</style>
            <div style={{ textAlign: 'center', fontSize: '19pt', fontWeight: 700, fontStyle: 'italic', letterSpacing: '0.01em', marginBottom: '2pt' }}>
                {profile.name || 'Your Name'}
            </div>
            {contactParts.length > 0 && (
                <div style={{ textAlign: 'center', fontSize: '9pt', color: '#777', fontStyle: 'italic', marginBottom: '4pt' }}>
                    {contactParts.join(' · ')}
                </div>
            )}
            {order.map((key) => (
                <React.Fragment key={key}>{sections[key]?.()}</React.Fragment>
            ))}
        </div>
    )
}

// ── Harvard Resume Preview (HTML) ─────────────────────────
function HarvardSectionHead({ title }: { title: string }) {
    return (
        <div style={{ marginTop: '12pt', marginBottom: '5pt' }}>
            <span style={{ fontSize: '10.5pt', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, textDecoration: 'underline' }}>{title}</span>
        </div>
    )
}

function HarvardResumePreview({ state }: { state: ResumeEditorState }) {
    const { profile, summary, education, experience, projects, skills, leadership, certifications, achievements } = state
    const decorations = usePreviewDecorations()
    const decoFor = (section: string, index?: number, bulletIndex?: number, skillsField?: string) => decorations.get(decorationKey(section, index, bulletIndex, skillsField))
    const decoStyle = (deco: ReturnType<typeof decoFor>): React.CSSProperties =>
        deco?.kind === 'flash' ? { animation: 'ra-flash-green 0.5s ease', borderRadius: 3 } : {}
    const contactParts = [profile.phone, profile.email, profile.location, profile.linkedin, profile.github, profile.portfolio].filter(Boolean)
    const hasSkills = skills.languages || skills.tools || skills.frameworks || skills.soft
    const harvardSkillFields = [
        ['languages', 'Technical'], ['tools', 'Tools'], ['frameworks', 'Frameworks'], ['soft', 'Interests'],
    ] as const

    const order = state.sectionOrder ?? ['summary', 'education', 'experience', 'projects', 'leadership', 'skills', 'certifications', 'achievements']
    const sections: Record<string, () => React.ReactNode> = {
        summary: () => {
            const deco = decoFor('summary')
            if (deco?.kind === 'ghost') return <div style={{ marginTop: '8pt' }}><GhostBox text={deco.text} /></div>
            if (!summary) return null
            return <div style={{ marginTop: '8pt', fontSize: '10pt', lineHeight: 1.5, background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>{summary}</div>
        },

        education: () => education.length > 0 && (
            <section>
                <HarvardSectionHead title="Education" />
                {education.map((edu, i) => {
                    const eduTop = edu.school || 'University'
                    const showDegree = edu.degree && !sameText(edu.degree, eduTop)
                    return (
                    <div key={i} style={{ marginBottom: '6pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 700 }}>{eduTop}</span>
                            <span style={{ fontSize: '10pt', color: '#222', fontStyle: 'italic' }}>{edu.date}</span>
                        </div>
                        {showDegree && (
                            <div style={{ fontStyle: 'italic', fontSize: '10pt' }}>
                                {edu.degree}{edu.gpa ? `  —  GPA: ${edu.gpa}` : ''}
                            </div>
                        )}
                        {edu.coursework && (
                            <div style={{ fontSize: '9.5pt', marginTop: '1pt' }}>
                                <span style={{ fontWeight: 700 }}>Relevant Coursework: </span>{edu.coursework}
                            </div>
                        )}
                    </div>
                    )
                })}
            </section>
        ),

        experience: () => experience.length > 0 && (
            <section>
                <HarvardSectionHead title="Experience" />
                {experience.map((exp, i) => (
                    <div key={i} style={{ marginBottom: '8pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 700 }}>{exp.company || 'Company'}</span>
                            <span style={{ fontSize: '10pt', color: '#222' }}>{exp.location}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontStyle: 'italic', fontSize: '10pt' }}>{exp.title}</span>
                            <span style={{ fontSize: '10pt', color: '#222', fontStyle: 'italic' }}>
                                {[exp.startDate, exp.endDate].filter(Boolean).join(' – ')}
                            </span>
                        </div>
                        <ul style={{ margin: '3pt 0 0 0', paddingLeft: '16pt', listStyle: 'disc' }}>
                            {exp.bullets.map((b, j) => {
                                const deco = decoFor('experience', i, j)
                                if (!b.trim() && deco?.kind !== 'ghost') return null
                                if (deco?.kind === 'ghost') {
                                    return <li key={j} style={{ marginBottom: '2pt', fontSize: '10pt', listStyle: 'none', marginLeft: '-16pt' }}><GhostBox text={deco.text} /></li>
                                }
                                return (
                                    <li key={j} style={{ marginBottom: '2pt', fontSize: '10pt', lineHeight: 1.4, background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                                        <BoldRender text={b} />
                                    </li>
                                )
                            })}
                        </ul>
                    </div>
                ))}
            </section>
        ),

        projects: () => projects.length > 0 && (
            <section>
                <HarvardSectionHead title="Projects" />
                {projects.map((proj, i) => (
                    <div key={i} style={{ marginBottom: '6pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 700 }}>
                                {proj.name}{proj.tech ? <span style={{ fontWeight: 400, fontStyle: 'italic' }}>{'  —  '}{proj.tech}</span> : ''}
                            </span>
                            <span style={{ fontSize: '10pt', color: '#222', fontStyle: 'italic' }}>{proj.date}</span>
                        </div>
                        <ul style={{ margin: '3pt 0 0 0', paddingLeft: '16pt', listStyle: 'disc' }}>
                            {proj.bullets.map((b, j) => {
                                const deco = decoFor('projects', i, j)
                                if (!b.trim() && deco?.kind !== 'ghost') return null
                                if (deco?.kind === 'ghost') {
                                    return <li key={j} style={{ marginBottom: '2pt', fontSize: '10pt', listStyle: 'none', marginLeft: '-16pt' }}><GhostBox text={deco.text} /></li>
                                }
                                return (
                                    <li key={j} style={{ marginBottom: '2pt', fontSize: '10pt', lineHeight: 1.4, background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                                        <BoldRender text={b} />
                                    </li>
                                )
                            })}
                        </ul>
                    </div>
                ))}
            </section>
        ),

        leadership: () => leadership.length > 0 && (
            <section>
                <HarvardSectionHead title="Leadership & Activities" />
                {leadership.map((lead, i) => (
                    <div key={i} style={{ marginBottom: '6pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 700 }}>{lead.org}</span>
                            <span style={{ fontSize: '10pt', color: '#222', fontStyle: 'italic' }}>{lead.date}</span>
                        </div>
                        {lead.role && <div style={{ fontStyle: 'italic', fontSize: '10pt' }}>{lead.role}</div>}
                        {lead.bullets.filter(b => b.trim()).length > 0 && (
                            <ul style={{ margin: '3pt 0 0 0', paddingLeft: '16pt', listStyle: 'disc' }}>
                                {lead.bullets.filter(b => b.trim()).map((b, j) => (
                                    <li key={j} style={{ marginBottom: '2pt', fontSize: '10pt' }}>{b}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                ))}
            </section>
        ),

        skills: () => (hasSkills || harvardSkillFields.some(([f]) => decoFor('skills', undefined, undefined, f)?.kind === 'ghost')) && (
            <section>
                <HarvardSectionHead title="Skills & Interests" />
                <div style={{ fontSize: '10pt', lineHeight: 1.5 }}>
                    {harvardSkillFields.map(([field, label]) => {
                        const deco = decoFor('skills', undefined, undefined, field)
                        if (deco?.kind === 'ghost') {
                            return <GhostBox key={field} text={deco.text} inline={<span style={{ fontWeight: 700 }}>{label}: </span>} />
                        }
                        if (!skills[field]) return null
                        return <div key={field} style={{ background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}><span style={{ fontWeight: 700 }}>{label}: </span>{skills[field]}</div>
                    })}
                </div>
            </section>
        ),

        certifications: () => certifications.length > 0 && (
            <section>
                <HarvardSectionHead title="Certifications" />
                <ul style={{ margin: '3pt 0 0 0', paddingLeft: '16pt', listStyle: 'disc' }}>
                    {certifications.map((c, i) => (<li key={i} style={{ marginBottom: '2pt', fontSize: '10pt' }}>{c}</li>))}
                </ul>
            </section>
        ),

        achievements: () => achievements.length > 0 && (
            <section>
                <HarvardSectionHead title="Honors & Awards" />
                <ul style={{ margin: '3pt 0 0 0', paddingLeft: '16pt', listStyle: 'disc' }}>
                    {achievements.map((a, i) => (<li key={i} style={{ marginBottom: '2pt', fontSize: '10pt' }}>{a}</li>))}
                </ul>
            </section>
        ),
    }

    return (
        <div style={{ fontFamily: "'Georgia', 'Merriweather', 'Times New Roman', serif", fontSize: '10.5pt', lineHeight: 1.4, color: '#000', padding: '42pt 54pt', minHeight: '100%', background: '#fff' }}>
            <style>{`@keyframes ra-flash-green { 0% { background: #d1fae5; } 60% { background: #d1fae5; } 100% { background: transparent; } }`}</style>
            <div style={{ textAlign: 'center', fontSize: '18pt', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '3pt' }}>
                {profile.name || 'Your Name'}
            </div>
            {contactParts.length > 0 && (
                <div style={{ textAlign: 'center', fontSize: '9.5pt', color: '#222', fontStyle: 'italic', marginBottom: '4pt' }}>
                    {contactParts.join('  ·  ')}
                </div>
            )}
            <hr style={{ border: 'none', borderTop: '0.75px solid #000', margin: '6pt 0 2pt' }} />
            {order.map((key) => (
                <React.Fragment key={key}>{sections[key]?.()}</React.Fragment>
            ))}
        </div>
    )
}

// ── Open Resume Preview (HTML) ────────────────────────────
const OPENRESUME_ACCENT = '#38bdf8'
const OPENRESUME_TEXT = '#171717'

function OpenResumeSectionHead({ title }: { title: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', marginTop: '14pt', marginBottom: '6pt' }}>
            <div style={{ width: '26pt', height: '3.5pt', background: OPENRESUME_ACCENT, marginRight: '8pt' }} />
            <span style={{ fontSize: '11pt', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' as const, color: OPENRESUME_TEXT }}>{title}</span>
        </div>
    )
}

function OpenResumePreview({ state }: { state: ResumeEditorState }) {
    const { profile, summary, education, experience, projects, skills, leadership, certifications, achievements } = state
    const decorations = usePreviewDecorations()
    const decoFor = (section: string, index?: number, bulletIndex?: number, skillsField?: string) => decorations.get(decorationKey(section, index, bulletIndex, skillsField))
    const decoStyle = (deco: ReturnType<typeof decoFor>): React.CSSProperties =>
        deco?.kind === 'flash' ? { animation: 'ra-flash-green 0.5s ease', borderRadius: 3 } : {}
    const contactParts = [profile.email, profile.phone, profile.location, profile.linkedin, profile.github, profile.portfolio].filter(Boolean)
    const hasSkills = skills.languages || skills.tools || skills.frameworks || skills.soft
    const openResumeSkillFields = [
        ['languages', 'Languages'], ['frameworks', 'Frameworks'], ['tools', 'Tools'], ['soft', 'Other'],
    ] as const

    // 'summary' is intentionally excluded from `order` — it renders fixed
    // between the name and contact line, matching the PDF renderer.
    const order = state.sectionOrder ?? ['experience', 'education', 'projects', 'skills', 'leadership', 'certifications', 'achievements']
    const sections: Record<string, () => React.ReactNode> = {
        experience: () => experience.length > 0 && (
            <section>
                <OpenResumeSectionHead title="Work Experience" />
                {experience.map((exp, i) => (
                    <div key={i} style={{ marginBottom: '6pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 700 }}>{exp.company || 'Company'}</span>
                            <span style={{ fontSize: '10pt', color: '#404040' }}>{[exp.startDate, exp.endDate].filter(Boolean).join(' – ')}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1pt' }}>
                            <span style={{ fontSize: '10pt' }}>{exp.title}</span>
                            {exp.location && <span style={{ fontSize: '9.5pt', color: '#525252' }}>{exp.location}</span>}
                        </div>
                        <ul style={{ margin: '3pt 0 0 0', paddingLeft: '16pt', listStyle: 'disc' }}>
                            {exp.bullets.map((b, j) => {
                                const deco = decoFor('experience', i, j)
                                if (!b.trim() && deco?.kind !== 'ghost') return null
                                if (deco?.kind === 'ghost') {
                                    return <li key={j} style={{ marginBottom: '2pt', fontSize: '10pt', listStyle: 'none', marginLeft: '-16pt' }}><GhostBox text={deco.text} /></li>
                                }
                                return (
                                    <li key={j} style={{ marginBottom: '2pt', fontSize: '10pt', lineHeight: 1.4, background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                                        <BoldRender text={b} />
                                    </li>
                                )
                            })}
                        </ul>
                    </div>
                ))}
            </section>
        ),

        education: () => education.length > 0 && (
            <section>
                <OpenResumeSectionHead title="Education" />
                {education.map((edu, i) => {
                    const eduTop = edu.school || 'University'
                    const showDegree = edu.degree && !sameText(edu.degree, eduTop)
                    return (
                    <div key={i} style={{ marginBottom: '5pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 700 }}>{eduTop}</span>
                            <span style={{ fontSize: '10pt', color: '#404040' }}>{edu.date}</span>
                        </div>
                        {showDegree && (
                            <div style={{ fontSize: '10pt', marginTop: '1pt' }}>{edu.degree}{edu.gpa ? `  —  GPA: ${edu.gpa}` : ''}</div>
                        )}
                        {edu.coursework && (
                            <div style={{ fontSize: '9.5pt', color: '#404040', marginTop: '1pt' }}>
                                <span style={{ fontWeight: 700 }}>Coursework: </span>{edu.coursework}
                            </div>
                        )}
                    </div>
                    )
                })}
            </section>
        ),

        projects: () => projects.length > 0 && (
            <section>
                <OpenResumeSectionHead title="Projects" />
                {projects.map((proj, i) => (
                    <div key={i} style={{ marginBottom: '5pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 700 }}>
                                {proj.name}{proj.tech ? <span style={{ fontWeight: 400, color: '#525252' }}>{'  —  '}{proj.tech}</span> : ''}
                            </span>
                            <span style={{ fontSize: '10pt', color: '#404040' }}>{proj.date}</span>
                        </div>
                        <ul style={{ margin: '3pt 0 0 0', paddingLeft: '16pt', listStyle: 'disc' }}>
                            {proj.bullets.map((b, j) => {
                                const deco = decoFor('projects', i, j)
                                if (!b.trim() && deco?.kind !== 'ghost') return null
                                if (deco?.kind === 'ghost') {
                                    return <li key={j} style={{ marginBottom: '2pt', fontSize: '10pt', listStyle: 'none', marginLeft: '-16pt' }}><GhostBox text={deco.text} /></li>
                                }
                                return (
                                    <li key={j} style={{ marginBottom: '2pt', fontSize: '10pt', lineHeight: 1.4, background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>
                                        <BoldRender text={b} />
                                    </li>
                                )
                            })}
                        </ul>
                    </div>
                ))}
            </section>
        ),

        skills: () => (hasSkills || openResumeSkillFields.some(([f]) => decoFor('skills', undefined, undefined, f)?.kind === 'ghost')) && (
            <section>
                <OpenResumeSectionHead title="Skills" />
                <div style={{ fontSize: '10pt', lineHeight: 1.5 }}>
                    {openResumeSkillFields.map(([field, label]) => {
                        const deco = decoFor('skills', undefined, undefined, field)
                        if (deco?.kind === 'ghost') {
                            return <GhostBox key={field} text={deco.text} inline={<span style={{ fontWeight: 700 }}>{label}: </span>} />
                        }
                        if (!skills[field]) return null
                        return <div key={field} style={{ background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}><span style={{ fontWeight: 700 }}>{label}: </span>{skills[field]}</div>
                    })}
                </div>
            </section>
        ),

        leadership: () => leadership.length > 0 && (
            <section>
                <OpenResumeSectionHead title="Leadership" />
                {leadership.map((lead, i) => (
                    <div key={i} style={{ marginBottom: '5pt' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 700 }}>{lead.org}</span>
                            <span style={{ fontSize: '10pt', color: '#404040' }}>{lead.date}</span>
                        </div>
                        {lead.role && <div style={{ fontSize: '10pt' }}>{lead.role}</div>}
                        {lead.bullets.filter(b => b.trim()).length > 0 && (
                            <ul style={{ margin: '3pt 0 0 0', paddingLeft: '16pt', listStyle: 'disc' }}>
                                {lead.bullets.filter(b => b.trim()).map((b, j) => (
                                    <li key={j} style={{ marginBottom: '2pt', fontSize: '10pt' }}>{b}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                ))}
            </section>
        ),

        certifications: () => certifications.length > 0 && (
            <section>
                <OpenResumeSectionHead title="Certifications" />
                <ul style={{ margin: '3pt 0 0 0', paddingLeft: '16pt', listStyle: 'disc' }}>
                    {certifications.map((c, i) => (<li key={i} style={{ marginBottom: '2pt', fontSize: '10pt' }}>{c}</li>))}
                </ul>
            </section>
        ),

        achievements: () => achievements.length > 0 && (
            <section>
                <OpenResumeSectionHead title="Achievements" />
                <ul style={{ margin: '3pt 0 0 0', paddingLeft: '16pt', listStyle: 'disc' }}>
                    {achievements.map((a, i) => (<li key={i} style={{ marginBottom: '2pt', fontSize: '10pt' }}>{a}</li>))}
                </ul>
            </section>
        ),
    }

    return (
        <div style={{ fontFamily: "'Roboto', 'Helvetica Neue', Arial, sans-serif", fontSize: '10.5pt', lineHeight: 1.4, color: OPENRESUME_TEXT, background: '#fff', minHeight: '100%' }}>
            <style>{`@keyframes ra-flash-green { 0% { background: #d1fae5; } 60% { background: #d1fae5; } 100% { background: transparent; } }`}</style>
            <div style={{ width: '100%', height: '12pt', background: OPENRESUME_ACCENT }} />
            <div style={{ padding: '32pt 40pt' }}>
                <div style={{ fontSize: '22pt', fontWeight: 700, color: OPENRESUME_ACCENT, lineHeight: 1.15 }}>
                    {profile.name || 'Your Name'}
                </div>
                {(() => {
                    const deco = decoFor('summary')
                    if (deco?.kind === 'ghost') return <div style={{ marginTop: '4pt' }}><GhostBox text={deco.text} /></div>
                    if (!summary) return null
                    return <div style={{ marginTop: '4pt', fontSize: '10pt', lineHeight: 1.45, background: deco?.kind === 'amber' ? A.amberWash : undefined, ...decoStyle(deco) }}>{summary}</div>
                })()}
                {contactParts.length > 0 && (
                    <div style={{ fontSize: '9.5pt', color: '#404040', marginTop: '4pt' }}>
                        {contactParts.join('   ·   ')}
                    </div>
                )}
                {order.map((key) => (
                    <React.Fragment key={key}>{sections[key]?.()}</React.Fragment>
                ))}
            </div>
        </div>
    )
}

// Render **bold** markdown in preview text
function BoldRender({ text }: { text: string }) {
    const parts = text.split(/\*\*/)
    if (parts.length === 1) return <>{text}</>
    return (
        <>
            {parts.map((seg, i) =>
                seg ? (i % 2 === 1 ? <strong key={i}>{seg}</strong> : <span key={i}>{seg}</span>) : null
            )}
        </>
    )
}

// ── Bullet list editor ───────────────────────────────────────
function BulletEditor({ bullets, onChange }: { bullets: string[]; onChange: (b: string[]) => void }) {
    const text = bullets.join('\n')
    return (
        <div>
            <span style={labelStyle}>Bullet Points (one per line)</span>
            <textarea
                value={text}
                onChange={e => onChange(e.target.value.split('\n'))}
                rows={4}
                placeholder="• Led team of 5 engineers to deliver..."
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
            />
        </div>
    )
}

// ── Section: Profile ─────────────────────────────────────────
function ProfileSection({ state, update }: { state: ResumeEditorState; update: (s: ResumeEditorState) => void }) {
    const { profile } = state
    const set = (k: keyof typeof profile) => (v: string) =>
        update({ ...state, profile: { ...profile, [k]: v } })

    return (
        <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Field label="Full Name" value={profile.name} onChange={set('name')} placeholder="Jane Smith" />
                <div style={{ gridColumn: '1 / -1' }}>
                    <Field label="Professional Headline" value={profile.headline} onChange={set('headline')} placeholder="Aspiring SOC Analyst" />
                    <span style={{ display: 'block', fontSize: 11.5, color: '#7a8aa5', marginTop: 3 }}>
                        Shown under your name at the top of the resume — independent of your Experience section's job titles.
                    </span>
                </div>
                <Field label="Email" value={profile.email} onChange={set('email')} placeholder="jane@email.com" />
                <Field label="Phone" value={profile.phone} onChange={set('phone')} placeholder="+1 (555) 000-0000" />
                <Field label="Location" value={profile.location} onChange={set('location')} placeholder="New York, NY" />
                <Field label="LinkedIn" value={profile.linkedin} onChange={set('linkedin')} placeholder="linkedin.com/in/jane" />
                <Field label="GitHub" value={profile.github} onChange={set('github')} placeholder="github.com/jane" />
                <Field label="Portfolio / Website" value={profile.portfolio} onChange={set('portfolio')} placeholder="yoursite.dev" />
            </div>
        </div>
    )
}

// ── Section: Experience ──────────────────────────────────────
function ExperienceSection({ state, update }: { state: ResumeEditorState; update: (s: ResumeEditorState) => void }) {
    const entries = state.experience
    const setEntries = (e: ExperienceEntry[]) => update({ ...state, experience: e })

    const addEntry = () => setEntries([...entries, { company: '', title: '', startDate: '', endDate: '', location: '', bullets: [''] }])
    const removeEntry = (i: number) => setEntries(entries.filter((_, idx) => idx !== i))
    const updateEntry = (i: number, patch: Partial<ExperienceEntry>) => {
        const next = [...entries]
        next[i] = { ...next[i], ...patch }
        setEntries(next)
    }

    return (
        <div>
            {entries.map((exp, i) => (
                <div key={i} style={{ marginBottom: 12, padding: 12, background: T.editorBg, borderRadius: 6, border: `1px solid ${T.editorBorder}`, position: 'relative' }}>
                    <button onClick={() => removeEntry(i)} style={{ position: 'absolute', top: 8, right: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }} title="Remove">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <Field label="Company" value={exp.company} onChange={v => updateEntry(i, { company: v })} />
                        <Field label="Job Title" value={exp.title} onChange={v => updateEntry(i, { title: v })} />
                        <Field label="Start Date" value={exp.startDate} onChange={v => updateEntry(i, { startDate: v })} placeholder="Jan 2023" />
                        <Field label="End Date" value={exp.endDate} onChange={v => updateEntry(i, { endDate: v })} placeholder="Present" />
                    </div>
                    <Field label="Location" value={exp.location} onChange={v => updateEntry(i, { location: v })} placeholder="New York, NY" />
                    <BulletEditor bullets={exp.bullets} onChange={b => updateEntry(i, { bullets: b })} />
                </div>
            ))}
            <button onClick={addEntry} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 6, background: 'transparent', border: `1px dashed ${T.editorBorder}`, color: T.editorTextMuted, cursor: 'pointer', fontSize: '0.8125rem', width: '100%', justifyContent: 'center', marginTop: 4 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                Add Experience
            </button>
        </div>
    )
}

// ── Section: Education ───────────────────────────────────────
function EducationSection({ state, update }: { state: ResumeEditorState; update: (s: ResumeEditorState) => void }) {
    const entries = state.education
    const setEntries = (e: EducationEntry[]) => update({ ...state, education: e })

    const addEntry = () => setEntries([...entries, { school: '', degree: '', date: '', gpa: '', coursework: '' }])
    const removeEntry = (i: number) => setEntries(entries.filter((_, idx) => idx !== i))
    const updateEntry = (i: number, patch: Partial<EducationEntry>) => {
        const next = [...entries]
        next[i] = { ...next[i], ...patch }
        setEntries(next)
    }

    return (
        <div>
            {entries.map((edu, i) => (
                <div key={i} style={{ marginBottom: 12, padding: 12, background: T.editorBg, borderRadius: 6, border: `1px solid ${T.editorBorder}`, position: 'relative' }}>
                    <button onClick={() => removeEntry(i)} style={{ position: 'absolute', top: 8, right: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }} title="Remove">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                    <Field label="School / University" value={edu.school} onChange={v => updateEntry(i, { school: v })} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <Field label="Degree" value={edu.degree} onChange={v => updateEntry(i, { degree: v })} placeholder="B.S. Computer Science" />
                        <Field label="Graduation Date" value={edu.date} onChange={v => updateEntry(i, { date: v })} placeholder="May 2024" />
                        <Field label="GPA (optional)" value={edu.gpa} onChange={v => updateEntry(i, { gpa: v })} placeholder="3.8" />
                    </div>
                    <Field label="Relevant Coursework (comma-separated)" value={edu.coursework} onChange={v => updateEntry(i, { coursework: v })} placeholder="Data Structures, Algorithms, ML" />
                </div>
            ))}
            <button onClick={addEntry} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 6, background: 'transparent', border: `1px dashed ${T.editorBorder}`, color: T.editorTextMuted, cursor: 'pointer', fontSize: '0.8125rem', width: '100%', justifyContent: 'center', marginTop: 4 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                Add Education
            </button>
        </div>
    )
}

// ── Section: Projects ────────────────────────────────────────
function ProjectsSection({ state, update }: { state: ResumeEditorState; update: (s: ResumeEditorState) => void }) {
    const entries = state.projects
    const setEntries = (e: ProjectEntry[]) => update({ ...state, projects: e })

    const addEntry = () => setEntries([...entries, { name: '', tech: '', date: '', bullets: [''] }])
    const removeEntry = (i: number) => setEntries(entries.filter((_, idx) => idx !== i))
    const updateEntry = (i: number, patch: Partial<ProjectEntry>) => {
        const next = [...entries]
        next[i] = { ...next[i], ...patch }
        setEntries(next)
    }

    return (
        <div>
            {entries.map((proj, i) => (
                <div key={i} style={{ marginBottom: 12, padding: 12, background: T.editorBg, borderRadius: 6, border: `1px solid ${T.editorBorder}`, position: 'relative' }}>
                    <button onClick={() => removeEntry(i)} style={{ position: 'absolute', top: 8, right: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }} title="Remove">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <Field label="Project Name" value={proj.name} onChange={v => updateEntry(i, { name: v })} />
                        <Field label="Tech Stack" value={proj.tech} onChange={v => updateEntry(i, { tech: v })} placeholder="React, Node.js, PostgreSQL" />
                        <Field label="Date" value={proj.date} onChange={v => updateEntry(i, { date: v })} placeholder="Jan 2024" />
                    </div>
                    <BulletEditor bullets={proj.bullets} onChange={b => updateEntry(i, { bullets: b })} />
                </div>
            ))}
            <button onClick={addEntry} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 6, background: 'transparent', border: `1px dashed ${T.editorBorder}`, color: T.editorTextMuted, cursor: 'pointer', fontSize: '0.8125rem', width: '100%', justifyContent: 'center', marginTop: 4 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                Add Project
            </button>
        </div>
    )
}

// ── Section: Skills ──────────────────────────────────────────
function SkillsSection({ state, update }: { state: ResumeEditorState; update: (s: ResumeEditorState) => void }) {
    const { skills } = state
    const set = (k: keyof typeof skills) => (v: string) =>
        update({ ...state, skills: { ...skills, [k]: v } })

    return (
        <div>
            <Field label="Languages" value={skills.languages} onChange={set('languages')} placeholder="Python, Java, TypeScript, Go" />
            <Field label="Developer Tools" value={skills.tools} onChange={set('tools')} placeholder="Git, Docker, AWS, VS Code" />
            <Field label="Technologies / Frameworks" value={skills.frameworks} onChange={set('frameworks')} placeholder="React, Node.js, FastAPI, PostgreSQL" />
            <Field label="Core Competencies" value={skills.soft} onChange={set('soft')} placeholder="Team Leadership, Agile, Communication" />
        </div>
    )
}

// ── Section: Leadership ──────────────────────────────────────
function LeadershipSection({ state, update, isMobile }: { state: ResumeEditorState; update: (s: ResumeEditorState) => void; isMobile?: boolean }) {
    const entries = state.leadership
    const setEntries = (e: LeadershipEntry[]) => update({ ...state, leadership: e })

    const addEntry = () => setEntries([...entries, { org: '', role: '', date: '', bullets: [] }])
    const removeEntry = (i: number) => setEntries(entries.filter((_, idx) => idx !== i))
    const updateEntry = (i: number, patch: Partial<LeadershipEntry>) => {
        const next = [...entries]
        next[i] = { ...next[i], ...patch }
        setEntries(next)
    }

    if (isMobile) {
        const mInput: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid #e2e8f0', fontSize: '13.5px', color: '#0f172a', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }
        const mLabel: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 5 }
        return (
            <div>
                {entries.map((lead, i) => (
                    <div key={i} style={{ marginBottom: 20, paddingBottom: i < entries.length - 1 ? 20 : 0, borderBottom: i < entries.length - 1 ? '1px solid #f1f5f9' : 'none', position: 'relative' }}>
                        {entries.length > 1 && (
                            <button onClick={() => removeEntry(i)} style={{ position: 'absolute', top: 0, right: 0, background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                            </button>
                        )}
                        <div style={{ marginBottom: 12 }}>
                            <label style={mLabel}>Role / Title</label>
                            <input type="text" value={lead.role} onChange={e => updateEntry(i, { role: e.target.value })} placeholder="e.g. President, Tech Lead" style={mInput} />
                        </div>
                        <div style={{ marginBottom: 12 }}>
                            <label style={mLabel}>Organisation</label>
                            <input type="text" value={lead.org} onChange={e => updateEntry(i, { org: e.target.value })} placeholder="e.g. ACM Student Chapter" style={mInput} />
                        </div>
                        <div style={{ marginBottom: 12 }}>
                            <label style={mLabel}>Description</label>
                            <textarea value={lead.bullets.join('\n')} onChange={e => updateEntry(i, { bullets: e.target.value ? e.target.value.split('\n') : [] })} placeholder="Describe your role and key contributions..." style={{ ...mInput, resize: 'vertical', minHeight: 72 }} rows={3} />
                        </div>
                        <div>
                            <label style={mLabel}>Year / Date Range</label>
                            <input type="text" value={lead.date} onChange={e => updateEntry(i, { date: e.target.value })} placeholder="2023–2024" style={mInput} />
                        </div>
                    </div>
                ))}
                <button onClick={addEntry} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 16px', borderRadius: 99, border: '1.5px solid rgba(19,91,236,0.25)', background: '#eff6ff', color: '#2563eb', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: entries.length > 0 ? 4 : 0, fontFamily: 'inherit' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                    Add Another
                </button>
            </div>
        )
    }

    return (
        <div>
            {entries.map((lead, i) => (
                <div key={i} style={{ marginBottom: 12, padding: 12, background: T.editorBg, borderRadius: 6, border: `1px solid ${T.editorBorder}`, position: 'relative' }}>
                    <button onClick={() => removeEntry(i)} style={{ position: 'absolute', top: 8, right: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }} title="Remove">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <Field label="Organization" value={lead.org} onChange={v => updateEntry(i, { org: v })} />
                        <Field label="Date" value={lead.date} onChange={v => updateEntry(i, { date: v })} />
                    </div>
                    <Field label="Role / Title" value={lead.role} onChange={v => updateEntry(i, { role: v })} />
                    <BulletEditor bullets={lead.bullets} onChange={b => updateEntry(i, { bullets: b })} />
                </div>
            ))}
            <button onClick={addEntry} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 6, background: 'transparent', border: `1px dashed ${T.editorBorder}`, color: T.editorTextMuted, cursor: 'pointer', fontSize: '0.8125rem', width: '100%', justifyContent: 'center', marginTop: 4 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                Add Entry
            </button>
        </div>
    )
}

// ── Section: Certifications ──────────────────────────────────
// Structured Name / Issuer / Year fields in bordered entry cards —
// mirrors the "Add certifications" popup on /dashboard/upload.
function CertificationsSection({ state, update, isMobile }: { state: ResumeEditorState; update: (s: ResumeEditorState) => void; isMobile?: boolean }) {
    const certs = state.certifications
    const setCerts = (c: string[]) => update({ ...state, certifications: c })

    const add = () => setCerts([...certs, ''])
    const remove = (i: number) => setCerts(certs.filter((_, idx) => idx !== i))

    // Open the modal straight into an editable entry card instead of an empty state.
    useEffect(() => {
        if (certs.length === 0) add()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const parseCert = (s: string) => {
        const parts = s.split('|').map(p => p.trim())
        return { name: parts[0] || '', issuer: parts[1] || '', year: parts[2] || '' }
    }
    const fmtCert = (name: string, issuer: string, year: string): string => {
        const n = name.trim(), iss = issuer.trim(), y = year.trim()
        if (iss || y) return `${n} | ${iss} | ${y}`
        return n
    }
    const updateField = (i: number, field: 'name' | 'issuer' | 'year', val: string) => {
        const next = [...certs]
        const parsed = parseCert(next[i] || '')
        next[i] = fmtCert(
            field === 'name' ? val : parsed.name,
            field === 'issuer' ? val : parsed.issuer,
            field === 'year' ? val : parsed.year,
        )
        setCerts(next)
    }

    return (
        <div>
            {certs.map((cert, i) => {
                const { name, issuer, year } = parseCert(cert)
                return (
                    <div key={i} style={entryCardStyle}>
                        {certs.length > 1 && (
                            <button onClick={() => remove(i)} style={entryRemoveStyle} title="Remove">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                            </button>
                        )}
                        <label style={{ ...labelStyle, marginTop: 0 }}>Certification Name</label>
                        <input type="text" value={name} onChange={e => updateField(i, 'name', e.target.value)} placeholder="e.g. AWS Certified Cloud Practitioner" style={inputStyle} />
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: 8 }}>
                            <div>
                                <label style={labelStyle}>Issuer</label>
                                <input type="text" value={issuer} onChange={e => updateField(i, 'issuer', e.target.value)} placeholder="Amazon, Google, Microsoft…" style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>Year</label>
                                <input type="text" value={year} onChange={e => updateField(i, 'year', e.target.value)} placeholder="2024" style={inputStyle} />
                            </div>
                        </div>
                    </div>
                )
            })}
            <button onClick={add} style={addMoreStyle}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                Add Certification
            </button>
        </div>
    )
}

// ── Section: Achievements ────────────────────────────────────
// Structured Title / Context / Year fields in bordered entry cards —
// mirrors the "Add achievements & awards" popup on /dashboard/upload.
function AchievementsSection({ state, update }: { state: ResumeEditorState; update: (s: ResumeEditorState) => void; isMobile?: boolean }) {
    const achievements = state.achievements
    const setAch = (a: string[]) => update({ ...state, achievements: a })

    const add = () => setAch([...achievements, ''])
    const remove = (i: number) => setAch(achievements.filter((_, idx) => idx !== i))

    // Open the modal straight into an editable entry card instead of an empty state.
    useEffect(() => {
        if (achievements.length === 0) add()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const parseAch = (s: string) => {
        const yearMatch = s.match(/\((\d{4})\)\s*$/)
        const year = yearMatch ? yearMatch[1] : ''
        const withoutYear = year ? s.replace(/\s*\(\d{4}\)\s*$/, '') : s
        const dashIdx = withoutYear.indexOf(' — ')
        if (dashIdx > -1) return { title: withoutYear.slice(0, dashIdx).trim(), description: withoutYear.slice(dashIdx + 3).trim(), year }
        return { title: withoutYear.trim(), description: '', year }
    }
    const fmtAch = (title: string, description: string, year: string): string => {
        const t = title.trim(), d = description.trim(), y = year.trim()
        if (!t) return ''
        if (d && y) return `${t} — ${d} (${y})`
        if (d) return `${t} — ${d}`
        if (y) return `${t} (${y})`
        return t
    }
    const updateField = (i: number, field: 'title' | 'description' | 'year', val: string) => {
        const next = [...achievements]
        const parsed = parseAch(next[i] || '')
        next[i] = fmtAch(
            field === 'title' ? val : parsed.title,
            field === 'description' ? val : parsed.description,
            field === 'year' ? val : parsed.year,
        )
        setAch(next)
    }

    return (
        <div>
            {achievements.map((ach, i) => {
                const { title, description, year } = parseAch(ach)
                return (
                    <div key={i} style={entryCardStyle}>
                        {achievements.length > 1 && (
                            <button onClick={() => remove(i)} style={entryRemoveStyle} title="Remove">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                            </button>
                        )}
                        <label style={{ ...labelStyle, marginTop: 0 }}>Title</label>
                        <input type="text" value={title} onChange={e => updateField(i, 'title', e.target.value)} placeholder="e.g. Winner — Smart India Hackathon" style={inputStyle} />
                        <label style={labelStyle}>Context (scope, scale, impact)</label>
                        <textarea value={description} onChange={e => updateField(i, 'description', e.target.value)} placeholder='Quantify impact when possible — e.g. "Increased X by 40%"' style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }} rows={2} />
                        <label style={labelStyle}>Year</label>
                        <input type="text" value={year} onChange={e => updateField(i, 'year', e.target.value)} placeholder="2024" style={inputStyle} />
                    </div>
                )
            })}
            <button onClick={add} style={addMoreStyle}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                Add Achievement
            </button>
        </div>
    )
}

// ── Template label map ────────────────────────────────────────
const TEMPLATE_LABELS: Record<string, string> = {
    classic: 'Classic',
    rezi: 'Rezi',
    london: 'London',
    harvard: 'Harvard',
    'open-resume': 'Open Resume',
    cobalt: 'Cobalt',
    onyx: 'Onyx',
    jade: 'Jade',
    lapis: 'Lapis',
    executive: 'Executive',
    amber: 'Amber',
    athens: 'Athens',
    axis: 'Axis',
    beacon: 'Beacon',
}

async function loadPdfRenderer(templateId: string) {
    const [renderer, pdfDoc] = await Promise.all([
        import('@react-pdf/renderer'),
        templateId === 'lapis'
            ? import('@/components/ResumeRenderer/LapisPdfDocument')
            : templateId === 'executive'
            ? import('@/components/ResumeRenderer/ExecutivePdfDocument')
            : templateId === 'amber'
            ? import('@/components/ResumeRenderer/AmberPdfDocument')
            : templateId === 'athens'
            ? import('@/components/ResumeRenderer/AthensPdfDocument')
            : templateId === 'axis'
            ? import('@/components/ResumeRenderer/AxisPdfDocument')
            : templateId === 'beacon'
            ? import('@/components/ResumeRenderer/BeaconPdfDocument')
            : templateId === 'jade'
            ? import('@/components/ResumeRenderer/JadePdfDocument')
            : templateId === 'onyx'
            ? import('@/components/ResumeRenderer/OnyxPdfDocument')
            : templateId === 'cobalt'
            ? import('@/components/ResumeRenderer/CobaltPdfDocument')
            : templateId === 'rezi'
            ? import('@/components/ResumeRenderer/ReziPdfDocument')
            : templateId === 'london'
            ? import('@/components/ResumeRenderer/LondonPdfDocument')
            : templateId === 'harvard'
            ? import('@/components/ResumeRenderer/HarvardPdfDocument')
            : templateId === 'open-resume'
            ? import('@/components/ResumeRenderer/OpenResumePdfDocument')
            : import('@/components/ResumeRenderer/ClassicPdfDocument'),
    ])
    return { renderer, PdfComp: pdfDoc.default }
}

// ── Download PDF ─────────────────────────────────────────────
function DownloadPdf({ state, templateId, companyName, compact = false }: { state: ResumeEditorState; templateId: string; companyName?: string | null; compact?: boolean }) {
    const [loading, setLoading] = useState(false)

    async function handleDownload() {
        setLoading(true)
        try {
            const { renderer, PdfComp } = await loadPdfRenderer(templateId)
            const doc = React.createElement(PdfComp, { state })
            const blob = await renderer.pdf(doc as any).toBlob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            const safeName = (state.profile.name || 'Resume').replace(/[^\w\s-]/g, '').replace(/\s+/g, '_')
            const safeCompany = companyName ? companyName.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_') : ''
            a.download = safeCompany ? `${safeCompany}_-_${safeName}_Resume.pdf` : `${safeName}_Resume.pdf`
            a.click()
            URL.revokeObjectURL(url)
        } catch (err) {
            console.error('PDF error:', err)
        } finally {
            setLoading(false)
        }
    }

    return (
        <button
            onClick={handleDownload}
            disabled={loading}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: compact ? 5 : 7,
                padding: compact ? '8px 14px' : '9px 18px', borderRadius: T.radiusSm,
                background: loading ? '#334155' : `linear-gradient(135deg, ${T.primary}, ${T.primaryDark})`,
                color: 'white', fontWeight: compact ? 700 : 600, fontSize: compact ? '0.75rem' : '0.8125rem',
                border: 'none', cursor: loading ? 'wait' : 'pointer',
                boxShadow: loading ? 'none' : T.primaryShadow,
                transition: 'all 0.2s ease',
                fontFamily: "'DM Sans', 'Inter', sans-serif",
                whiteSpace: 'nowrap' as const,
                flexShrink: 0,
            }}
        >
            <svg width={compact ? 12 : 14} height={compact ? 12 : 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>
            </svg>
            {loading ? (compact ? '…' : 'Generating...') : 'Download PDF'}
        </button>
    )
}

// ── AI Optimization Report ───────────────────────────────────
function ResumeChangeLog({ entry, rawData, rawScore, rawJob }: {
    entry?: SavedResumeEntry | null
    rawData?: OptimizedResumeData | null
    rawScore?: number
    rawJob?: { title?: string; company?: string; location?: string } | null
}) {
    // Hooks must run before any early return (rules-of-hooks). These accordion
    // open-states don't depend on `data`, so hoisting them is behaviour-neutral.
    const [openExp, setOpenExp] = useState<number | null>(0)
    const [openProj, setOpenProj] = useState<number | null>(null)
    const [openBA, setOpenBA] = useState<number | null>(0)

    const data = entry?.optimized_data ?? rawData
    if (!data) return null
    const score = entry?.keyword_alignment_score ?? data.keyword_alignment_score ?? rawScore ?? 0
    const notes = data.optimization_notes ?? []
    const ats = data.ats_feedback
    const experience = data.optimized_experience ?? []
    const projects = data.projects ?? []
    const jobTitle = entry?.job?.title ?? rawJob?.title
    const jobCompany = entry?.job?.company ?? rawJob?.company
    const jobLocation = entry?.job?.location ?? rawJob?.location
    const updatedAt = entry?.updated_at
    const beforeAfter: BeforeAfterRole[] = (data as any).before_after_experience ?? []
    const skillsDelta: SkillsDelta | undefined = (data as any).skills_delta
    const actionPlan: CareerActionPlan | undefined = (data as any).career_action_plan

    const callbackRaw = (ats?.predicted_callback ?? '').toLowerCase()
    const isHigh = callbackRaw.startsWith('high')
    const isMed = callbackRaw.startsWith('med')
    const callbackColor = isHigh ? '#3fb950' : isMed ? '#d29922' : '#f85149'
    const callbackBg = isHigh ? 'rgba(63,185,80,0.08)' : isMed ? 'rgba(210,153,34,0.08)' : 'rgba(248,81,73,0.08)'
    const callbackBorder = isHigh ? 'rgba(63,185,80,0.3)' : isMed ? 'rgba(210,153,34,0.3)' : 'rgba(248,81,73,0.3)'
    const callbackLabel = isHigh ? 'HIGH' : isMed ? 'MEDIUM' : 'LOW'
    const scoreColor = score >= 80 ? '#3fb950' : score >= 60 ? '#d29922' : '#f85149'

    return (
        <div style={{
            marginTop: 32,
            fontFamily: "'DM Sans', sans-serif",
        }}>
            {/* ── Report header ── */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
            }}>
                <div style={{
                    flex: 1, height: 1,
                    background: 'linear-gradient(90deg, rgba(88,166,255,0.5), transparent)',
                }} />
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 14px',
                    background: '#0d1117',
                    border: '1px solid rgba(88,166,255,0.2)',
                    borderRadius: 20,
                }}>
                    <div style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: '#58a6ff',
                        boxShadow: '0 0 8px rgba(88,166,255,0.8)',
                        animation: 'reportPulse 2s ease-in-out infinite',
                    }} />
                    <span style={{
                        fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.1em',
                        color: '#58a6ff', textTransform: 'uppercase',
                        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                    }}>AI Optimization Report</span>
                </div>
                <div style={{
                    flex: 1, height: 1,
                    background: 'linear-gradient(90deg, transparent, rgba(88,166,255,0.5))',
                }} />
            </div>

            {/* ── Score + Job context ── */}
            <div style={{
                background: '#0d1117',
                border: '1px solid #21262d',
                borderRadius: 10,
                padding: '16px 20px',
                display: 'flex', alignItems: 'center', gap: 20,
                marginBottom: 12,
            }}>
                {/* Score ring */}
                <div style={{ flexShrink: 0, textAlign: 'center' }}>
                    <svg width={72} height={72} viewBox="0 0 72 72">
                        <circle cx={36} cy={36} r={28} fill="none" stroke="#21262d" strokeWidth="7"/>
                        <circle
                            cx={36} cy={36} r={28} fill="none"
                            stroke={scoreColor} strokeWidth="7" strokeLinecap="round"
                            strokeDasharray={`${2 * Math.PI * 28}`}
                            strokeDashoffset={`${2 * Math.PI * 28 * (1 - score / 100)}`}
                            style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', filter: `drop-shadow(0 0 6px ${scoreColor}66)` }}
                        />
                        <text x={36} y={32} textAnchor="middle" fill={scoreColor} fontSize="14" fontWeight="800" fontFamily="'DM Sans', sans-serif">{score}</text>
                        <text x={36} y={44} textAnchor="middle" fill="#4d5566" fontSize="7" fontWeight="600" fontFamily="monospace" letterSpacing="0.05em">KEYWORD</text>
                    </svg>
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#e6edf3', marginBottom: 2 }}>
                        {jobTitle ?? 'Optimized Resume'}
                    </div>
                    <div style={{ fontSize: '0.775rem', color: '#58a6ff', fontWeight: 600, marginBottom: 6 }}>
                        {jobCompany ?? ''}
                        {jobLocation ? <span style={{ color: '#4d5566', fontWeight: 400 }}> · {jobLocation}</span> : null}
                    </div>
                    <div style={{
                        fontSize: '0.7rem', color: '#8b949e',
                        display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                        <span style={{
                            padding: '2px 8px', borderRadius: 4, fontWeight: 700,
                            background: callbackBg, color: callbackColor,
                            border: `1px solid ${callbackBorder}`,
                            fontSize: '0.6rem', letterSpacing: '0.06em',
                            fontFamily: "'JetBrains Mono', monospace",
                        }}>{callbackLabel} CALLBACK</span>
                        <span>
                            {score >= 80 ? 'Excellent keyword alignment' : score >= 60 ? 'Good keyword alignment' : 'Moderate alignment'}
                        </span>
                    </div>
                </div>

                <div style={{
                    flexShrink: 0, fontSize: '0.6875rem', color: '#4d5566',
                    fontFamily: "'JetBrains Mono', monospace",
                    textAlign: 'right',
                }}>
                    {updatedAt ? new Date(updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                </div>
            </div>

            {/* ── What Changed ── */}
            {notes.length > 0 && (
                <div style={{
                    background: '#0d1117', border: '1px solid #21262d',
                    borderRadius: 10, overflow: 'hidden', marginBottom: 12,
                }}>
                    <div style={{
                        padding: '10px 16px', background: '#161b22',
                        borderBottom: '1px solid #21262d',
                        display: 'flex', alignItems: 'center', gap: 7,
                    }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#58a6ff" strokeWidth="2.5">
                            <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
                        </svg>
                        <span style={{
                            fontSize: '0.7rem', fontWeight: 700, color: '#e6edf3',
                            letterSpacing: '0.04em',
                        }}>What Changed</span>
                        <span style={{
                            marginLeft: 'auto', fontSize: '0.6rem', fontWeight: 700,
                            padding: '1px 7px', borderRadius: 3,
                            background: 'rgba(63,185,80,0.1)', color: '#3fb950',
                            border: '1px solid rgba(63,185,80,0.25)',
                            fontFamily: "'JetBrains Mono', monospace",
                        }}>{notes.length} changes</span>
                    </div>
                    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {notes.map((note, i) => (
                            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                <span style={{
                                    flexShrink: 0, marginTop: 2,
                                    fontSize: '0.6rem', fontWeight: 700,
                                    color: '#3fb950', fontFamily: "'JetBrains Mono', monospace",
                                    minWidth: 18,
                                }}>+{i + 1}</span>
                                <span style={{ fontSize: '0.775rem', color: '#8b949e', lineHeight: 1.55 }}>{note}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── ATS Intelligence ── */}
            {ats && (
                <div style={{
                    background: '#0d1117', border: '1px solid #21262d',
                    borderRadius: 10, overflow: 'hidden', marginBottom: 12,
                }}>
                    {/* Header */}
                    <div style={{
                        padding: '10px 16px', background: '#161b22',
                        borderBottom: '1px solid #21262d',
                        display: 'flex', alignItems: 'center', gap: 7,
                    }}>
                        <div style={{ display: 'flex', gap: 5 }}>
                            {[0,1,2].map(i => (
                                <div key={i} style={{
                                    width: 8, height: 8, borderRadius: '50%',
                                    background: i === 0 ? '#f85149' : i === 1 ? '#d29922' : '#3fb950',
                                }} />
                            ))}
                        </div>
                        <span style={{
                            fontSize: '0.7rem', fontWeight: 700, color: '#e6edf3',
                            letterSpacing: '0.04em', fontFamily: "'JetBrains Mono', monospace",
                        }}>ATS Intelligence</span>
                    </div>

                    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {/* Explanation */}
                        {ats.explanation && (
                            <p style={{ fontSize: '0.775rem', color: '#8b949e', lineHeight: 1.6, margin: 0 }}>
                                {ats.explanation}
                            </p>
                        )}

                        {/* Strongest bullet */}
                        {ats.strongest_bullet && (
                            <div style={{
                                borderLeft: '3px solid #3fb950',
                                paddingLeft: 12, paddingTop: 2, paddingBottom: 2,
                            }}>
                                <div style={{
                                    fontSize: '0.6rem', fontWeight: 700, color: '#3fb950',
                                    letterSpacing: '0.08em', textTransform: 'uppercase',
                                    fontFamily: "'JetBrains Mono', monospace", marginBottom: 4,
                                }}>Strongest Bullet</div>
                                <p style={{
                                    fontSize: '0.75rem', color: '#adbac7',
                                    lineHeight: 1.55, margin: 0, fontStyle: 'italic',
                                }}>&ldquo;{ats.strongest_bullet}&rdquo;</p>
                            </div>
                        )}

                        {/* Keyword gap */}
                        {ats.top_keyword_gap && (
                            <div style={{
                                background: 'rgba(210,153,34,0.06)',
                                border: '1px solid rgba(210,153,34,0.25)',
                                borderRadius: 7, padding: '8px 12px',
                                display: 'flex', gap: 9, alignItems: 'flex-start',
                            }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d29922" strokeWidth="2.5" style={{ flexShrink: 0, marginTop: 1 }}>
                                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                                    <path d="M12 9v4"/><circle cx="12" cy="17" r="1" fill="#d29922"/>
                                </svg>
                                <div>
                                    <div style={{
                                        fontSize: '0.6rem', fontWeight: 700, color: '#d29922',
                                        letterSpacing: '0.08em', textTransform: 'uppercase',
                                        fontFamily: "'JetBrains Mono', monospace", marginBottom: 3,
                                    }}>Top Keyword Gap</div>
                                    <p style={{ fontSize: '0.75rem', color: '#cdb87c', margin: 0, lineHeight: 1.5 }}>
                                        {ats.top_keyword_gap}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Experience Rewrites ── */}
            {experience.length > 0 && (
                <div style={{
                    background: '#0d1117', border: '1px solid #21262d',
                    borderRadius: 10, overflow: 'hidden', marginBottom: 12,
                }}>
                    <div style={{
                        padding: '10px 16px', background: '#161b22',
                        borderBottom: '1px solid #21262d',
                        display: 'flex', alignItems: 'center', gap: 7,
                    }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#58a6ff" strokeWidth="2.5">
                            <path d="M20 14.66V20a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2h5.34"/>
                            <polygon points="18 2 22 6 12 16 8 16 8 12 18 2"/>
                        </svg>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#e6edf3', letterSpacing: '0.04em' }}>
                            Rewritten Experience
                        </span>
                        <span style={{
                            marginLeft: 'auto', fontSize: '0.6rem', fontWeight: 700,
                            padding: '1px 7px', borderRadius: 3,
                            background: 'rgba(88,166,255,0.1)', color: '#58a6ff',
                            border: '1px solid rgba(88,166,255,0.25)',
                            fontFamily: "'JetBrains Mono', monospace",
                        }}>{experience.length} roles</span>
                    </div>

                    {experience.map((exp, i) => {
                        const isOpen = openExp === i
                        return (
                            <div key={i} style={{ borderBottom: i < experience.length - 1 ? '1px solid #21262d' : 'none' }}>
                                <button
                                    onClick={() => setOpenExp(isOpen ? null : i)}
                                    style={{
                                        width: '100%', padding: '11px 16px',
                                        background: isOpen ? 'rgba(88,166,255,0.04)' : 'transparent',
                                        border: 'none', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        transition: 'background 0.15s',
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{
                                            width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                                            background: isOpen ? '#58a6ff' : '#21262d',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '0.65rem', fontWeight: 800,
                                            color: isOpen ? '#0d1117' : '#4d5566',
                                            transition: 'all 0.15s',
                                        }}>
                                            {exp.company?.[0]?.toUpperCase() ?? '?'}
                                        </div>
                                        <div style={{ textAlign: 'left' }}>
                                            <div style={{ fontSize: '0.775rem', fontWeight: 700, color: '#e6edf3' }}>{exp.company}</div>
                                            <div style={{ fontSize: '0.675rem', color: '#4d5566' }}>{exp.title} · {[exp.start_date, exp.end_date].filter(Boolean).join(' – ')}</div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                        <span style={{
                                            fontSize: '0.575rem', fontWeight: 700, padding: '2px 6px', borderRadius: 3,
                                            background: 'rgba(63,185,80,0.1)', color: '#3fb950',
                                            border: '1px solid rgba(63,185,80,0.25)',
                                            fontFamily: "'JetBrains Mono', monospace",
                                        }}>{(exp.bullet_points ?? []).length} bullets</span>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4d5566" strokeWidth="2.5"
                                            style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                                            <path d="M6 9l6 6 6-6"/>
                                        </svg>
                                    </div>
                                </button>

                                {isOpen && (
                                    <div style={{ padding: '4px 16px 12px 52px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {(exp.bullet_points ?? []).map((bp, j) => (
                                            <div key={j} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                                <span style={{
                                                    flexShrink: 0, fontSize: '0.6rem', fontWeight: 700,
                                                    color: '#3fb950', fontFamily: "'JetBrains Mono', monospace",
                                                    marginTop: 3, minWidth: 14,
                                                }}>+</span>
                                                <span style={{ fontSize: '0.75rem', color: '#8b949e', lineHeight: 1.55 }}>{bp}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {/* ── Refined Projects ── */}
            {projects.length > 0 && (
                <div style={{
                    background: '#0d1117', border: '1px solid #21262d',
                    borderRadius: 10, overflow: 'hidden', marginBottom: 12,
                }}>
                    <div style={{
                        padding: '10px 16px', background: '#161b22',
                        borderBottom: '1px solid #21262d',
                        display: 'flex', alignItems: 'center', gap: 7,
                    }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#a371f7" strokeWidth="2.5">
                            <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>
                        </svg>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#e6edf3', letterSpacing: '0.04em' }}>
                            Refined Projects
                        </span>
                        <span style={{
                            marginLeft: 'auto', fontSize: '0.6rem', fontWeight: 700,
                            padding: '1px 7px', borderRadius: 3,
                            background: 'rgba(163,113,247,0.1)', color: '#a371f7',
                            border: '1px solid rgba(163,113,247,0.25)',
                            fontFamily: "'JetBrains Mono', monospace",
                        }}>{projects.length}</span>
                    </div>

                    <div style={{ padding: '0' }}>
                        {projects.map((proj, i) => {
                            const isOpen = openProj === i
                            return (
                                <div key={i} style={{ borderBottom: i < projects.length - 1 ? '1px solid #21262d' : 'none' }}>
                                    <button
                                        onClick={() => setOpenProj(isOpen ? null : i)}
                                        style={{
                                            width: '100%', padding: '10px 16px',
                                            background: isOpen ? 'rgba(163,113,247,0.04)' : 'transparent',
                                            border: 'none', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            transition: 'background 0.15s',
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                                            <div style={{
                                                width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                                                background: '#a371f7',
                                                boxShadow: isOpen ? '0 0 8px rgba(163,113,247,0.6)' : 'none',
                                                transition: 'box-shadow 0.2s',
                                            }} />
                                            <span style={{ fontSize: '0.775rem', fontWeight: 600, color: '#e6edf3', textAlign: 'left' }}>
                                                {proj.name}
                                            </span>
                                        </div>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4d5566" strokeWidth="2.5"
                                            style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
                                            <path d="M6 9l6 6 6-6"/>
                                        </svg>
                                    </button>

                                    {isOpen && (
                                        <div style={{ padding: '4px 16px 10px 30px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                                            {(proj.bullet_points ?? []).map((bp, j) => (
                                                <div key={j} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                                    <span style={{
                                                        flexShrink: 0, color: '#a371f7',
                                                        fontSize: '0.75rem', marginTop: 1,
                                                    }}>·</span>
                                                    <span style={{ fontSize: '0.75rem', color: '#8b949e', lineHeight: 1.55 }}>{bp}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* ── Before vs After ── */}
            {beforeAfter.length > 0 && (
                <div style={{
                    background: '#0d1117', border: '1px solid #21262d',
                    borderRadius: 10, overflow: 'hidden', marginBottom: 12,
                }}>
                    <div style={{
                        padding: '10px 16px', background: '#161b22',
                        borderBottom: '1px solid #21262d',
                        display: 'flex', alignItems: 'center', gap: 7,
                    }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#58a6ff" strokeWidth="2.5">
                            <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3m11 0h3a2 2 0 002-2v-3"/>
                        </svg>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#e6edf3', letterSpacing: '0.04em' }}>Before vs After</span>
                        <span style={{
                            marginLeft: 'auto', fontSize: '0.6rem', fontWeight: 700,
                            padding: '1px 7px', borderRadius: 3,
                            background: 'rgba(88,166,255,0.1)', color: '#58a6ff',
                            border: '1px solid rgba(88,166,255,0.25)',
                            fontFamily: "'JetBrains Mono', monospace",
                        }}>{beforeAfter.length} roles</span>
                    </div>

                    {beforeAfter.map((role, i) => {
                        const isOpen = openBA === i
                        return (
                            <div key={i} style={{ borderBottom: i < beforeAfter.length - 1 ? '1px solid #21262d' : 'none' }}>
                                <button
                                    onClick={() => setOpenBA(isOpen ? null : i)}
                                    style={{
                                        width: '100%', padding: '11px 16px',
                                        background: isOpen ? 'rgba(88,166,255,0.04)' : 'transparent',
                                        border: 'none', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        transition: 'background 0.15s',
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{
                                            width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                                            background: isOpen ? '#58a6ff' : '#21262d',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '0.65rem', fontWeight: 800,
                                            color: isOpen ? '#0d1117' : '#4d5566',
                                            transition: 'all 0.15s',
                                        }}>{role.company?.[0]?.toUpperCase() ?? '?'}</div>
                                        <div style={{ textAlign: 'left' }}>
                                            <div style={{ fontSize: '0.775rem', fontWeight: 700, color: '#e6edf3' }}>{role.company}</div>
                                            <div style={{ fontSize: '0.675rem', color: '#4d5566' }}>{role.title}</div>
                                        </div>
                                    </div>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4d5566" strokeWidth="2.5"
                                        style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
                                        <path d="M6 9l6 6 6-6"/>
                                    </svg>
                                </button>

                                {isOpen && (
                                    <div style={{ padding: '0 16px 12px' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
                                            <div style={{
                                                padding: '6px 10px', borderRadius: 6,
                                                background: 'rgba(248,81,73,0.06)', border: '1px solid rgba(248,81,73,0.2)',
                                                fontSize: '0.6rem', fontWeight: 700, color: '#f85149',
                                                letterSpacing: '0.06em', textTransform: 'uppercase' as const,
                                            }}>● Original</div>
                                            <div style={{
                                                padding: '6px 10px', borderRadius: 6,
                                                background: 'rgba(63,185,80,0.06)', border: '1px solid rgba(63,185,80,0.2)',
                                                fontSize: '0.6rem', fontWeight: 700, color: '#3fb950',
                                                letterSpacing: '0.06em', textTransform: 'uppercase' as const,
                                            }}>◆ Optimized</div>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                {(role.original_bullets || []).map((b, bi) => (
                                                    <div key={bi} style={{
                                                        borderLeft: '2px solid rgba(248,81,73,0.4)', paddingLeft: 8,
                                                        fontSize: '0.72rem', color: '#4d5566', lineHeight: 1.55,
                                                    }}>{b}</div>
                                                ))}
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                {(role.optimized_bullets || []).map((b, bi) => (
                                                    <div key={bi} style={{
                                                        borderLeft: '2px solid rgba(63,185,80,0.5)', paddingLeft: 8,
                                                        fontSize: '0.72rem', color: '#8b949e', lineHeight: 1.55,
                                                    }}>{b}</div>
                                                ))}
                                            </div>
                                        </div>
                                        {role.changes_summary && (
                                            <div style={{
                                                marginTop: 8, padding: '6px 10px', borderRadius: 6,
                                                background: 'rgba(88,166,255,0.04)', border: '1px solid rgba(88,166,255,0.12)',
                                                fontSize: '0.7rem', color: '#58a6ff', fontStyle: 'italic',
                                            }}>{role.changes_summary}</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {/* ── Skills Delta ── */}
            {skillsDelta && (skillsDelta.prioritized?.length > 0 || skillsDelta.deprioritized?.length > 0) && (
                <div style={{
                    background: '#0d1117', border: '1px solid #21262d',
                    borderRadius: 10, overflow: 'hidden', marginBottom: 12,
                }}>
                    <div style={{
                        padding: '10px 16px', background: '#161b22',
                        borderBottom: '1px solid #21262d',
                        display: 'flex', alignItems: 'center', gap: 7,
                    }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d29922" strokeWidth="2.5">
                            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
                        </svg>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#e6edf3', letterSpacing: '0.04em' }}>Skills Reordering</span>
                    </div>
                    <div style={{ padding: '12px 16px', display: 'flex', gap: 16 }}>
                        {skillsDelta.prioritized?.length > 0 && (
                            <div style={{ flex: 1 }}>
                                <div style={{
                                    fontSize: '0.6rem', fontWeight: 700, color: '#3fb950',
                                    letterSpacing: '0.06em', textTransform: 'uppercase' as const,
                                    fontFamily: "'JetBrains Mono', monospace", marginBottom: 8,
                                }}>Prioritized ↑</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {skillsDelta.prioritized.map((s, i) => (
                                        <span key={i} style={{
                                            fontSize: '0.725rem', padding: '3px 10px', borderRadius: 4,
                                            background: 'rgba(63,185,80,0.08)', color: '#3fb950',
                                            border: '1px solid rgba(63,185,80,0.2)', fontWeight: 600,
                                            display: 'inline-block',
                                        }}>{s}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {skillsDelta.deprioritized?.length > 0 && (
                            <div style={{ flex: 1 }}>
                                <div style={{
                                    fontSize: '0.6rem', fontWeight: 700, color: '#4d5566',
                                    letterSpacing: '0.06em', textTransform: 'uppercase' as const,
                                    fontFamily: "'JetBrains Mono', monospace", marginBottom: 8,
                                }}>Moved Down ↓</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {skillsDelta.deprioritized.map((s, i) => (
                                        <span key={i} style={{
                                            fontSize: '0.725rem', padding: '3px 10px', borderRadius: 4,
                                            background: '#161b22', color: '#4d5566',
                                            border: '1px solid #21262d', fontWeight: 600,
                                            display: 'inline-block',
                                        }}>{s}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    {skillsDelta.reasoning && (
                        <div style={{
                            borderTop: '1px solid #21262d', padding: '8px 16px',
                            fontSize: '0.7rem', color: '#4d5566', fontStyle: 'italic',
                        }}>{skillsDelta.reasoning}</div>
                    )}
                </div>
            )}

            {/* ── Career Action Plan ── */}
            {actionPlan && ((actionPlan.suggested_certifications?.length ?? 0) > 0 || (actionPlan.suggested_projects?.length ?? 0) > 0 || (actionPlan.quick_wins?.length ?? 0) > 0) && (
                <div style={{
                    background: '#0d1117', border: '1px solid #21262d',
                    borderRadius: 10, overflow: 'hidden', marginBottom: 12,
                }}>
                    <div style={{
                        padding: '10px 16px', background: '#161b22',
                        borderBottom: '1px solid #21262d',
                        display: 'flex', alignItems: 'center', gap: 7,
                    }}>
                        <span style={{ fontSize: '0.875rem' }}>✦</span>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#e6edf3', letterSpacing: '0.04em' }}>Career Action Plan</span>
                    </div>
                    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {/* Certs */}
                        {(actionPlan.suggested_certifications || []).length > 0 && (
                            <div>
                                <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#d29922', letterSpacing: '0.06em', textTransform: 'uppercase' as const, fontFamily: "'JetBrains Mono', monospace", marginBottom: 8 }}>🎓 Certifications</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {actionPlan.suggested_certifications.map((cert, i) => (
                                        <div key={i} style={{
                                            padding: '8px 10px', borderRadius: 7,
                                            background: 'rgba(210,153,34,0.05)', border: '1px solid rgba(210,153,34,0.2)',
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
                                                <span style={{ fontSize: '0.775rem', fontWeight: 700, color: '#d29922' }}>{cert.name}</span>
                                                {cert.effort && <span style={{ fontSize: '0.6rem', padding: '1px 6px', borderRadius: 3, background: 'rgba(210,153,34,0.1)', color: '#d29922', border: '1px solid rgba(210,153,34,0.2)', flexShrink: 0, fontFamily: "'JetBrains Mono', monospace" }}>{cert.effort}</span>}
                                            </div>
                                            <p style={{ fontSize: '0.725rem', color: '#8b949e', margin: 0, lineHeight: 1.5 }}>{cert.reason}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {/* Projects */}
                        {(actionPlan.suggested_projects || []).length > 0 && (
                            <div>
                                <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#58a6ff', letterSpacing: '0.06em', textTransform: 'uppercase' as const, fontFamily: "'JetBrains Mono', monospace", marginBottom: 8 }}>🔧 Projects</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {actionPlan.suggested_projects.map((proj, i) => (
                                        <div key={i} style={{
                                            padding: '8px 10px', borderRadius: 7,
                                            background: 'rgba(88,166,255,0.04)', border: '1px solid rgba(88,166,255,0.15)',
                                        }}>
                                            <div style={{ fontSize: '0.775rem', fontWeight: 700, color: '#58a6ff', marginBottom: 3 }}>{proj.name}</div>
                                            <p style={{ fontSize: '0.725rem', color: '#8b949e', margin: '0 0 6px', lineHeight: 1.5 }}>{proj.description}</p>
                                            {(proj.tech || []).length > 0 && (
                                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const, marginBottom: 4 }}>
                                                    {proj.tech.map((t, ti) => (
                                                        <span key={ti} style={{ fontSize: '0.575rem', padding: '1px 6px', borderRadius: 3, background: 'rgba(88,166,255,0.1)', color: '#58a6ff', border: '1px solid rgba(88,166,255,0.2)', fontFamily: "'JetBrains Mono', monospace" }}>{t}</span>
                                                    ))}
                                                </div>
                                            )}
                                            {proj.impact && <p style={{ fontSize: '0.7rem', color: '#3fb950', fontStyle: 'italic', margin: 0 }}>{proj.impact}</p>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {/* Quick wins */}
                        {(actionPlan.quick_wins || []).length > 0 && (
                            <div>
                                <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#3fb950', letterSpacing: '0.06em', textTransform: 'uppercase' as const, fontFamily: "'JetBrains Mono', monospace", marginBottom: 8 }}>⚡ Quick Wins</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {actionPlan.quick_wins.map((win, i) => (
                                        <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                                            <div style={{
                                                width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                                                background: '#3fb950', color: '#0d1117',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '0.575rem', fontWeight: 800, marginTop: 1,
                                                fontFamily: "'JetBrains Mono', monospace",
                                            }}>{i + 1}</div>
                                            <span style={{ fontSize: '0.75rem', color: '#8b949e', lineHeight: 1.55 }}>{win}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Keyframes */}
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=DM+Sans:wght@400;600;700;800&display=swap');
                @keyframes reportPulse { 0%,100% { opacity:0.5; transform:scale(1) } 50% { opacity:1; transform:scale(1.2) } }
            `}</style>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────
// ── Meridian Helper Components ───────────────────────────────
// ─────────────────────────────────────────────────────────────

// Sidebar resume card
function MeridianResumeCard({
    entry, selected, onClick,
}: {
    entry: SavedResumeEntry
    selected: boolean
    onClick: () => void
}) {
    const [hov, setHov] = useState(false)
    const company = entry.job?.company ?? 'Untitled'
    const title = entry.job?.title ?? 'Resume'
    const location = entry.job?.location ?? ''
    const rawScore = entry.keyword_alignment_score ?? 0
    const score = rawScore > 10 ? Math.round(rawScore) : Math.round(rawScore * 10)
    const scoreColor = score >= 80 ? M.green : score >= 60 ? M.amber : M.red
    const scoreBg = score >= 80 ? M.greenLight : score >= 60 ? M.amberLight : '#fee2e2'
    const initial = (company || '?')[0].toUpperCase()
    const date = new Date(entry.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

    return (
        <button
            onClick={onClick}
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '13px 16px 13px 14px',
                background: selected ? M.accentLight : hov ? M.accentTint : M.white,
                border: 'none',
                borderLeft: `4px solid ${selected ? M.accent : 'transparent'}`,
                borderBottom: `1px solid ${M.borderLight}`,
                cursor: 'pointer', transition: 'all 0.13s',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 9 }}>
                <div style={{
                    width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                    background: selected ? M.accent : M.accentMid,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.0625rem', fontWeight: 800, color: '#fff',
                    fontFamily: M.fontHeading,
                    boxShadow: selected ? `0 2px 10px ${M.accent}44` : 'none',
                    transition: 'all 0.15s',
                }}>{initial}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                        fontSize: '0.9375rem', fontWeight: 700, lineHeight: 1.3, marginBottom: 3,
                        color: selected ? M.accent : M.text,
                        fontFamily: M.fontHeading,
                        letterSpacing: '-0.01em',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{title}</div>
                    <div style={{
                        fontSize: '0.8125rem', fontFamily: M.fontBody,
                        color: selected ? M.accent + 'cc' : M.textMuted,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{company}{location ? ` · ${location}` : ''}</div>
                </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 52 }}>
                <span style={{
                    fontSize: '0.75rem', fontWeight: 700, color: scoreColor,
                    background: scoreBg, padding: '3px 10px', borderRadius: 12,
                    fontFamily: M.fontMono,
                }}>{score}% match</span>
                <span style={{ fontSize: '0.75rem', color: M.textFaint, fontFamily: M.fontMono }}>{date}</span>
            </div>
        </button>
    )
}

// Sidebar toggle — a floating circular button that sits right ON the seam
// between the sidebar and the editor column, near the top of the content
// area (like a split-pane collapse handle). Given a persistent border +
// shadow so it reads as a clickable control at rest, not just on hover.
function SidebarToggleButton({ collapsed, onClick }: { collapsed: boolean; onClick: () => void }) {
    const [hov, setHov] = useState(false)
    return (
        <button
            onClick={onClick}
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            title={collapsed ? 'Show resumes panel' : 'Hide resumes panel'}
            aria-label={collapsed ? 'Show resumes panel' : 'Hide resumes panel'}
            style={{
                position: 'absolute', top: 80, right: -18, zIndex: 20,
                width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                background: hov ? M.accentLight : M.white,
                border: `2px solid ${hov ? M.accentBorder : M.border}`,
                boxShadow: '0 2px 8px rgba(15,30,64,0.2)',
                color: hov ? M.accent : M.textMuted,
                cursor: 'pointer', transition: 'all 0.13s',
            }}
        >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                {collapsed ? <path d="M9 6l6 6-6 6" /> : <path d="M15 6l-6 6 6 6" />}
            </svg>
        </button>
    )
}

function MeridianSidebar({
    resumes, selectedId, onSelect, onOptimizeNew, sourceResume,
    uploadedResumes, sourceResumeId, onSourceChange, optimizedCounts,
    collapsed, onToggleCollapse,
}: {
    resumes: SavedResumeEntry[]
    selectedId: string | null
    onSelect: (id: string) => void
    onOptimizeNew: () => void
    sourceResume?: Resume | null
    uploadedResumes: Resume[]
    sourceResumeId: string | null
    onSourceChange: (id: string | null) => void
    optimizedCounts: Record<string, number>
    collapsed: boolean
    onToggleCollapse: () => void
}) {
    const [filter, setFilter] = useState('')
    const filtered = filter
        ? resumes.filter(r => {
            const txt = `${r.job?.company ?? ''} ${r.job?.title ?? ''}`.toLowerCase()
            return txt.includes(filter.toLowerCase())
          })
        : resumes

    if (collapsed) {
        return (
            <div style={{
                width: 60, flexShrink: 0, background: M.white,
                borderRight: `1px solid ${M.border}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%',
                padding: '14px 0', gap: 10, transition: 'width 0.18s ease',
                position: 'relative',
            }}>
                <SidebarToggleButton collapsed={collapsed} onClick={onToggleCollapse} />
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', width: '100%' }}>
                    {resumes.map(r => {
                        const sel = r.id === selectedId
                        const company = r.job?.company ?? 'Untitled'
                        const title = r.job?.title ?? 'Resume'
                        const initial = (company || '?')[0].toUpperCase()
                        return (
                            <button
                                key={r.id}
                                onClick={() => onSelect(r.id)}
                                title={`${title} · ${company}`}
                                style={{
                                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                                    background: sel ? M.accent : M.accentMid,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.9375rem', fontWeight: 800, color: '#fff',
                                    fontFamily: M.fontHeading, border: 'none', cursor: 'pointer',
                                    boxShadow: sel ? `0 0 0 2px ${M.white}, 0 0 0 4px ${M.accent}` : 'none',
                                    transition: 'all 0.15s',
                                }}
                            >{initial}</button>
                        )
                    })}
                </div>
                <button
                    onClick={onOptimizeNew}
                    title="Optimize New Job"
                    aria-label="Optimize New Job"
                    style={{
                        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: M.accentLight, border: `1.5px dashed ${M.accentBorder}`,
                        color: M.accent, cursor: 'pointer',
                    }}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M12 5v14M5 12h14"/>
                    </svg>
                </button>
            </div>
        )
    }

    return (
        <div style={{
            width: 340, flexShrink: 0, background: M.white,
            borderRight: `1px solid ${M.border}`,
            display: 'flex', flexDirection: 'column', height: '100%',
            transition: 'width 0.18s ease',
            position: 'relative',
        }}>
            <SidebarToggleButton collapsed={collapsed} onClick={onToggleCollapse} />
            {/* ── Source resume picker (prominent, top-left) ── */}
            <div style={{
                padding: '16px 16px 14px', flexShrink: 0,
                borderBottom: `1px solid ${M.borderLight}`,
                background: `linear-gradient(180deg, ${M.surface}, ${M.white})`,
            }}>
                <SourceResumeDropdown
                    resumes={uploadedResumes}
                    selectedId={sourceResumeId}
                    onSelect={onSourceChange}
                    optimizedCounts={optimizedCounts}
                />
            </div>

            {/* ── "My Resumes" section header ── */}
            <div style={{
                padding: '16px 18px 12px', borderBottom: `1px solid ${M.borderLight}`,
                display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
            }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={M.accent} strokeWidth="2.5">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <path d="M14 2v6h6"/><path d="M16 13H8M16 17H8M10 9H8"/>
                </svg>
                <span style={{
                    fontSize: '1rem', fontWeight: 700, color: M.text,
                    fontFamily: M.fontHeading, flex: 1, letterSpacing: '-0.01em',
                }}>
                    My Resumes
                </span>
                <div style={{
                    background: M.accentLight, color: M.accent,
                    fontSize: '0.75rem', fontWeight: 700,
                    padding: '3px 11px', borderRadius: 20,
                    border: `1px solid ${M.accentBorder}`,
                    fontFamily: M.fontMono,
                }}>{resumes.length}</div>
            </div>

            {/* Search */}
            <div style={{ padding: '10px 14px 6px', flexShrink: 0 }}>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px', borderRadius: 9,
                    background: M.surface, border: `1px solid ${M.border}`,
                }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={M.textFaint} strokeWidth="2.5">
                        <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                    </svg>
                    <input
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        placeholder="Filter resumes…"
                        style={{
                            flex: 1, border: 'none', background: 'transparent', outline: 'none',
                            fontSize: '0.875rem', color: M.text, fontFamily: M.fontBody,
                        }}
                    />
                </div>
            </div>

            {/* Label */}
            <div style={{ padding: '8px 16px 4px', flexShrink: 0 }}>
                <span style={{
                    fontSize: '0.6875rem', fontWeight: 700, color: M.textFaint,
                    textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: M.fontMono,
                }}>
                    {sourceResume
                        ? `${resumeDisplayName(sourceResume)} · ${filtered.length} optimization${filtered.length === 1 ? '' : 's'}`
                        : `Recent · ${filtered.length} resume${filtered.length === 1 ? '' : 's'}`}
                </span>
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {filtered.length === 0 ? (
                    sourceResume ? (
                        <div style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{
                                padding: '12px 14px', borderRadius: 10,
                                background: M.surfaceAlt, border: `1px solid ${M.accentBorder}`,
                            }}>
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
                                }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={M.accent} strokeWidth="2.5">
                                        <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
                                    </svg>
                                    <span style={{
                                        fontSize: '0.75rem', fontWeight: 700, color: M.text, fontFamily: M.fontBody,
                                    }}>Showing raw resume</span>
                                </div>
                                <div style={{
                                    fontSize: '0.7rem', color: M.textMuted,
                                    fontFamily: M.fontBody, lineHeight: 1.5,
                                }}>
                                    This resume hasn&apos;t been optimized for any job yet. The editor is showing the original parsed data.
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div style={{ padding: '24px 16px', textAlign: 'center', color: M.textFaint, fontSize: '0.75rem', fontFamily: M.fontBody }}>
                            {resumes.length === 0 ? 'No optimized resumes yet.' : 'No matches'}
                        </div>
                    )
                ) : (
                    filtered.map(r => (
                        <MeridianResumeCard
                            key={r.id}
                            entry={r}
                            selected={selectedId === r.id}
                            onClick={() => onSelect(r.id)}
                        />
                    ))
                )}
            </div>

            {/* Footer CTA */}
            <div style={{ padding: '12px 14px 16px', borderTop: `1px solid ${M.borderLight}`, background: M.white, flexShrink: 0 }}>
                <button
                    onClick={onOptimizeNew}
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        width: '100%', padding: '12px', borderRadius: 10,
                        background: M.accentLight, border: `1.5px solid ${M.accentBorder}`,
                        color: M.accent, fontSize: '0.9375rem', fontWeight: 700, cursor: 'pointer',
                        fontFamily: M.fontBody, transition: 'all 0.15s',
                    }}
                >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M12 5v14M5 12h14"/>
                    </svg>
                    Optimize New Job
                </button>
            </div>
        </div>
    )
}

// Completion ring (top of editor panel)
function CompletionRing({ completed, total }: { completed: number; total: number }) {
    const R = 26
    const C = 2 * Math.PI * R
    const pct = total > 0 ? completed / total : 0
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
            <svg width="68" height="68" style={{ flexShrink: 0 }}>
                <circle cx="34" cy="34" r={R} fill="none" stroke={M.borderLight} strokeWidth="5.5"/>
                <circle cx="34" cy="34" r={R} fill="none" stroke={M.accent} strokeWidth="5.5"
                    strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)}
                    style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', transition: 'stroke-dashoffset 0.9s ease' }}/>
                <text x="34" y="31" textAnchor="middle" fontSize="11" fontWeight="800" fill={M.text} fontFamily={M.fontBody}>{completed}/{total}</text>
                <text x="34" y="43" textAnchor="middle" fontSize="7" fill={M.textFaint} fontFamily={M.fontMono} letterSpacing="0.08em">DONE</text>
            </svg>
            <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: M.text, marginBottom: 3, fontFamily: M.fontBody }}>
                    {total - completed > 0
                        ? `${total - completed} section${total - completed > 1 ? 's' : ''} need attention`
                        : 'All sections complete!'}
                </div>
                <div style={{ fontSize: '0.75rem', color: M.textFaint, fontFamily: M.fontBody }}>
                    {completed} of {total} sections complete
                </div>
            </div>
        </div>
    )
}

// Section nav dots (for in-page scroll-to)
function SectionDots({ sectionKeys, filledArr }: { sectionKeys: string[]; filledArr: boolean[] }) {
    const scrollTo = (key: string) => {
        const el = document.getElementById(`section-${key}`)
        const container = document.getElementById('m-editor-scroll')
        if (el && container) container.scrollTop = el.offsetTop - 12
    }
    return (
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginBottom: 2 }}>
            {sectionKeys.map((key, i) => (
                <button
                    key={key}
                    onClick={() => scrollTo(key)}
                    title={key.charAt(0).toUpperCase() + key.slice(1)}
                    style={{
                        width: filledArr[i] ? 18 : 7, height: 7, borderRadius: 4,
                        background: filledArr[i] ? M.accent : M.amberBorder,
                        border: `1px solid ${filledArr[i] ? M.accent : M.amber}`,
                        cursor: 'pointer', padding: 0, transition: 'width 0.3s ease',
                    }}
                />
            ))}
        </div>
    )
}

const MERIDIAN_TEMPLATES: Array<{ id: string; label: string }> = [
    { id: 'classic', label: 'Classic' },
    { id: 'london', label: 'London' },
    { id: 'rezi', label: 'Rezi' },
]

// Segmented pill switcher — Meridian v2
function TemplateSwitcher({
    active, onChange, onMore,
}: {
    active: string
    onChange: (id: string) => void
    onMore: () => void
}) {
    const isOther = !MERIDIAN_TEMPLATES.some(t => t.id === active)
    return (
        <div style={{
            display: 'flex', gap: 3, alignItems: 'center',
            background: M.surfaceAlt, borderRadius: 9, padding: 3,
            border: `1px solid ${M.borderLight}`,
        }}>
            {MERIDIAN_TEMPLATES.map(({ id, label }) => {
                const isActive = active === id
                return (
                    <button
                        key={id}
                        onClick={() => onChange(id)}
                        style={{
                            padding: '5px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
                            fontSize: '0.78rem', fontWeight: 600,
                            fontFamily: M.fontBody,
                            background: isActive ? M.white : 'transparent',
                            color: isActive ? M.accent : M.textMuted,
                            boxShadow: isActive ? '0 1px 4px rgba(15,30,64,0.08)' : 'none',
                            transition: 'all 0.15s',
                        }}
                    >{label}</button>
                )
            })}
            <button
                onClick={onMore}
                title="More templates"
                style={{
                    padding: '5px 11px', borderRadius: 7, border: 'none', cursor: 'pointer',
                    fontSize: '0.78rem', fontWeight: 600,
                    fontFamily: M.fontBody,
                    background: isOther ? M.white : 'transparent',
                    color: isOther ? M.accent : M.textMuted,
                    boxShadow: isOther ? '0 1px 4px rgba(15,30,64,0.08)' : 'none',
                    transition: 'all 0.15s',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                }}
            >
                More
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M6 9l6 6 6-6"/>
                </svg>
            </button>
        </div>
    )
}

function MeridianPreviewPanel({
    state, templateId, onTemplateChange, onMoreTemplates, downloadButton,
    coverLetterController, entry, job, profileState,
}: {
    state: ResumeEditorState
    templateId: string
    onTemplateChange: (t: string) => void
    onMoreTemplates: () => void
    downloadButton: React.ReactNode
    coverLetterController: ReturnType<typeof useCoverLetter>
    entry: { resume_id: string; job_id: string } | null
    job: { title?: string | null; company?: string | null; location?: string | null } | null
    profileState: ResumeEditorState['profile']
}) {
    const [desktopPreviewTab, setDesktopPreviewTab] = useState<'recruiters' | 'cover-letter'>('recruiters')

    const renderPreview = () => {
        switch (templateId) {
            case 'cobalt': return <CobaltResumePreview state={state} />
            case 'onyx': return <OnyxResumePreview state={state} />
            case 'jade': return <JadeResumePreview state={state} />
            case 'lapis': return <LapisResumePreview state={state} />
            case 'executive': return <ExecutiveResumePreview state={state} />
            case 'amber': return <AmberResumePreview state={state} />
            case 'athens': return <AthensResumePreview state={state} />
            case 'axis': return <AxisResumePreview state={state} />
            case 'beacon': return <BeaconResumePreview state={state} />
            case 'rezi': return <ReziResumePreview state={state} />
            case 'london': return <LondonResumePreview state={state} />
            case 'harvard': return <HarvardResumePreview state={state} />
            case 'open-resume': return <OpenResumePreview state={state} />
            default: return <ClassicResumePreview state={state} />
        }
    }

    return (
        <div style={{
            flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
            background: M.surface, overflow: 'hidden',
        }}>
            {/* Preview header */}
            <div style={{
                flexShrink: 0, background: M.white, borderBottom: `1px solid ${M.border}`,
                padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                    <div style={{
                        width: 7, height: 7, borderRadius: '50%', background: M.green,
                        animation: 'm-pulse-green 2s ease-in-out infinite',
                    }} />
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: M.text, fontFamily: M.fontBody }}>
                        Live Preview
                    </span>
                    <span style={{ fontSize: '0.6875rem', color: M.textFaint, fontFamily: M.fontBody }}>
                        Auto-syncing
                    </span>
                </div>

                <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                    <TemplateSwitcher
                        active={templateId}
                        onChange={onTemplateChange}
                        onMore={onMoreTemplates}
                    />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '3px 9px', borderRadius: 20,
                        background: M.greenLight, border: `1px solid ${M.greenBorder}`,
                    }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={M.green} strokeWidth="2.5">
                            <path d="M20 6L9 17l-5-5"/>
                        </svg>
                        <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: M.green, fontFamily: M.fontBody }}>
                            ATS-Friendly
                        </span>
                    </div>
                    {downloadButton}
                </div>
            </div>

            {/* Recruiter / ATS tab bar */}
            <div style={{ flexShrink: 0, background: M.white, borderBottom: `1px solid ${M.border}`, padding: '8px 20px', display: 'flex', gap: 6 }}>
                <button onClick={() => setDesktopPreviewTab('recruiters')} style={{ flex: 1, padding: 7, borderRadius: 99, border: 'none', background: desktopPreviewTab === 'recruiters' ? '#0f172a' : 'transparent', color: desktopPreviewTab === 'recruiters' ? '#fff' : M.textMuted, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: M.fontBody }}>What Recruiters See</button>
                <button onClick={() => setDesktopPreviewTab('cover-letter')} style={{ flex: 1, padding: 7, borderRadius: 99, border: 'none', background: desktopPreviewTab === 'cover-letter' ? '#0f172a' : 'transparent', color: desktopPreviewTab === 'cover-letter' ? '#fff' : M.textMuted, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: M.fontBody }}>Cover Letter</button>
            </div>

            {/* Paper */}
            {desktopPreviewTab === 'recruiters' ? (
                <div style={{
                    flex: 1, overflowY: 'auto', padding: '28px 28px 48px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                }}>
                    <div style={{
                        width: '100%', maxWidth: 700, minHeight: 880, background: '#fffffe',
                        boxShadow: '0 4px 32px rgba(15,30,64,0.10), 0 1px 4px rgba(15,30,64,0.06), 0 12px 48px rgba(15,30,64,0.06)',
                        borderRadius: 2,
                    }}>
                        {renderPreview()}
                    </div>
                </div>
            ) : (
                <CoverLetterView controller={coverLetterController} entry={entry} job={job} profileState={profileState} />
            )}
        </div>
    )
}

// ── Source Resume Dropdown ───────────────────────────────────
// Cleans fragmented PDF-parsed names like "VA M S I BA N DA RU" → "Vamsibandaru"
function cleanFragmentedName(raw: string | null | undefined): string | null {
    if (!raw) return null
    const trimmed = raw.trim()
    if (!trimmed) return null
    const parts = trimmed.split(/\s+/)
    if (parts.length >= 5) {
        const avgLen = parts.reduce((s, p) => s + p.length, 0) / parts.length
        if (avgLen <= 3) {
            const joined = parts.join('')
            return joined.charAt(0).toUpperCase() + joined.slice(1).toLowerCase()
        }
    }
    return trimmed
}

// structured_data is stored as a JSON string (double-stringified) in some rows.
// Normalize to an object regardless of source shape.
function parseStructuredData(input: unknown): any {
    if (!input) return null
    if (typeof input === 'string') {
        try { return JSON.parse(input) } catch { return null }
    }
    return input
}

// Helper: best-effort display name for an uploaded resume.
// The n8n parser stores name in several possible spots, so try them all.
function resumeDisplayName(r: Resume): string {
    const sd = parseStructuredData(r.structured_data)
    const candidates: Array<string | null | undefined> = [
        sd?.personal_info?.full_name,
        sd?.personal_info?.name,
        sd?.name,
        sd?.full_name,
        sd?.contact_info?.full_name,
        sd?.contact_info?.name,
        sd?.basics?.name,
    ]
    for (const c of candidates) {
        const cleaned = cleanFragmentedName(c)
        if (cleaned) return cleaned
    }

    // Try filename (with or without extension)
    if (r.original_filename) {
        return r.original_filename.replace(/\.(pdf|docx?|txt)$/i, '')
    }

    // Try the storage URL — usually contains a uploaded filename or timestamp
    if (r.file_url) {
        try {
            const last = decodeURIComponent(r.file_url.split('/').pop() || '')
            const noExt = last.replace(/\.(pdf|docx?|txt)$/i, '')
            // If it's clearly a uuid-style filename, skip it
            if (noExt && !/^[a-f0-9_-]{30,}$/i.test(noExt)) return noExt
        } catch { /* ignore */ }
    }

    // Try email username as a last-resort label
    const email = sd?.personal_info?.email || sd?.email
    if (typeof email === 'string' && email.includes('@')) {
        return email.split('@')[0]
    }

    // Final fallback: dated label using created_at
    if (r.created_at) {
        const d = new Date(r.created_at)
        if (!isNaN(d.getTime())) {
            return `Resume · ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
        }
    }
    return `Resume · ${r.id.slice(0, 6)}`
}

function SourceResumeDropdown({
    resumes, selectedId, onSelect, optimizedCounts,
}: {
    resumes: Resume[]
    selectedId: string | null
    onSelect: (id: string | null) => void
    optimizedCounts: Record<string, number>
}) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        if (!open) return
        const onDoc = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', onDoc)
        return () => document.removeEventListener('mousedown', onDoc)
    }, [open])

    const selected = resumes.find(r => r.id === selectedId) ?? null
    const label = selected ? resumeDisplayName(selected) : 'All resumes'
    const subLabel = selected
        ? (() => {
            const cnt = optimizedCounts[selected.id] ?? 0
            return cnt === 0 ? 'No optimizations yet' : `${cnt} optimized variant${cnt === 1 ? '' : 's'}`
        })()
        : `Showing ${resumes.length} uploaded resume${resumes.length === 1 ? '' : 's'}`
    const initial = (label[0] || '?').toUpperCase()

    return (
        <div ref={ref} style={{ position: 'relative', width: '100%' }}>
            {/* Label */}
            <div style={{ padding: '0 2px 8px' }}>
                <span style={{
                    fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.12em',
                    textTransform: 'uppercase', color: M.textMuted, fontFamily: M.fontMono,
                }}>
                    Source Resume
                </span>
            </div>

            {/* Big trigger button */}
            <button
                onClick={() => setOpen(o => !o)}
                style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    width: '100%', padding: '12px 14px',
                    borderRadius: 11,
                    background: open ? M.accentLight : M.white,
                    border: `1.5px solid ${open ? M.accent : M.accentBorder}`,
                    cursor: 'pointer',
                    fontFamily: M.fontBody, textAlign: 'left',
                    transition: 'all 0.15s',
                    boxShadow: open ? `0 0 0 4px ${M.accent}1f` : `0 1px 4px ${M.border}`,
                }}
                title="Switch source resume"
            >
                {/* Avatar */}
                <div style={{
                    width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                    background: selected ? M.accent : `linear-gradient(135deg, ${M.accent}, ${M.accentMid})`,
                    color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.0625rem', fontWeight: 800, fontFamily: M.fontHeading,
                    boxShadow: `0 2px 8px ${M.accent}40`,
                }}>
                    {selected ? initial : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <rect x="3" y="3" width="7" height="7" rx="1"/>
                            <rect x="14" y="3" width="7" height="7" rx="1"/>
                            <rect x="3" y="14" width="7" height="7" rx="1"/>
                            <rect x="14" y="14" width="7" height="7" rx="1"/>
                        </svg>
                    )}
                </div>

                {/* Label + sub-label */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                        fontSize: '1rem', fontWeight: 700, color: M.text,
                        fontFamily: M.fontHeading, letterSpacing: '-0.01em',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{label}</div>
                    <div style={{
                        fontSize: '0.8125rem', color: M.textMuted, fontFamily: M.fontBody,
                        marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{subLabel}</div>
                </div>

                {/* Chevron */}
                <div style={{
                    flexShrink: 0, width: 28, height: 28, borderRadius: 7,
                    background: M.accentTint, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={M.accent} strokeWidth="2.5"
                        style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s' }}>
                        <path d="M6 9l6 6 6-6"/>
                    </svg>
                </div>
            </button>

            {open && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0,
                    background: M.white, border: `1px solid ${M.border}`,
                    borderRadius: 10, boxShadow: '0 12px 36px rgba(15,30,64,0.18)',
                    overflow: 'hidden', zIndex: 30,
                }}>
                    {/* Header */}
                    <div style={{
                        padding: '10px 14px', borderBottom: `1px solid ${M.borderLight}`,
                        background: M.surface,
                    }}>
                        <span style={{
                            fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.12em',
                            textTransform: 'uppercase', color: M.textMuted, fontFamily: M.fontMono,
                        }}>Source Resume</span>
                    </div>

                    {/* All resumes option */}
                    <button
                        onClick={() => { onSelect(null); setOpen(false) }}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                            padding: '11px 14px', textAlign: 'left',
                            background: selectedId === null ? M.accentLight : 'transparent',
                            border: 'none', cursor: 'pointer',
                            borderBottom: `1px solid ${M.borderLight}`,
                        }}
                    >
                        <div style={{
                            width: 32, height: 32, borderRadius: 7, flexShrink: 0,
                            background: selectedId === null ? M.accent : M.surfaceAlt,
                            color: selectedId === null ? '#fff' : M.accent,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <rect x="3" y="3" width="7" height="7" rx="1"/>
                                <rect x="14" y="3" width="7" height="7" rx="1"/>
                                <rect x="3" y="14" width="7" height="7" rx="1"/>
                                <rect x="14" y="14" width="7" height="7" rx="1"/>
                            </svg>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                                fontSize: '0.9375rem', fontWeight: 700,
                                color: selectedId === null ? M.accent : M.text,
                                fontFamily: M.fontHeading, letterSpacing: '-0.01em',
                            }}>All resumes</div>
                            <div style={{ fontSize: '0.8125rem', color: M.textMuted, fontFamily: M.fontBody, marginTop: 1 }}>
                                Show everything you&apos;ve optimized
                            </div>
                        </div>
                        {selectedId === null && (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={M.accent} strokeWidth="3" style={{ flexShrink: 0 }}>
                                <path d="M20 6L9 17l-5-5"/>
                            </svg>
                        )}
                    </button>

                    {/* Individual uploaded resumes */}
                    <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                        {resumes.length === 0 ? (
                            <div style={{
                                padding: '20px 16px', textAlign: 'center',
                                fontSize: '0.8125rem', color: M.textFaint, fontFamily: M.fontBody,
                            }}>
                                No uploaded resumes yet.
                            </div>
                        ) : (
                            resumes.map(r => {
                                const name = resumeDisplayName(r)
                                const isSel = selectedId === r.id
                                const count = optimizedCounts[r.id] ?? 0
                                const initial = (name[0] || '?').toUpperCase()
                                return (
                                    <button
                                        key={r.id}
                                        onClick={() => { onSelect(r.id); setOpen(false) }}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                                            padding: '11px 14px', textAlign: 'left',
                                            background: isSel ? M.accentLight : 'transparent',
                                            border: 'none', cursor: 'pointer',
                                            borderBottom: `1px solid ${M.borderLight}`,
                                            transition: 'background 0.12s',
                                        }}
                                    >
                                        <div style={{
                                            width: 32, height: 32, borderRadius: 7, flexShrink: 0,
                                            background: isSel ? M.accent : M.accentMid,
                                            color: '#fff', display: 'flex',
                                            alignItems: 'center', justifyContent: 'center',
                                            fontSize: '0.9375rem', fontWeight: 800, fontFamily: M.fontHeading,
                                        }}>{initial}</div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                fontSize: '0.9375rem', fontWeight: 700,
                                                color: isSel ? M.accent : M.text,
                                                fontFamily: M.fontHeading, letterSpacing: '-0.01em',
                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                            }}>{name}</div>
                                            <div style={{
                                                fontSize: '0.8125rem', color: M.textMuted,
                                                fontFamily: M.fontBody, marginTop: 1,
                                            }}>
                                                {count > 0
                                                    ? `${count} optimized variant${count === 1 ? '' : 's'}`
                                                    : 'Raw resume (no optimizations yet)'}
                                            </div>
                                        </div>
                                        {isSel && (
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={M.accent} strokeWidth="3" style={{ flexShrink: 0 }}>
                                                <path d="M20 6L9 17l-5-5"/>
                                            </svg>
                                        )}
                                    </button>
                                )
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

// ── Map a raw uploaded resume → editor state (no optimization) ──
function mapRawResumeToEditorState(parsed: ParsedResume | null): ResumeEditorState {
    if (!parsed) return EMPTY_STATE
    const raw = parsed as any
    const rawExperience = raw?.work_history ?? raw?.work_experience ?? []
    const firstExpWithTitle = rawExperience.find((w: any) => (w.title || w.position)?.trim())
    return {
        profile: {
            name: parsed.name || raw?.personal_info?.full_name || '',
            // Defaults to the first work-experience title (old behavior) but is a
            // standalone field from here on — editing it no longer touches that
            // experience entry's actual Job Title.
            headline: firstExpWithTitle?.title || firstExpWithTitle?.position || '',
            email: parsed.email || raw?.personal_info?.email || '',
            phone: parsed.phone || raw?.personal_info?.phone || '',
            location: parsed.location || raw?.personal_info?.location || '',
            linkedin: raw?.personal_info?.linkedin || '',
            github: raw?.personal_info?.github || '',
            portfolio: raw?.personal_info?.portfolio || '',
        },
        summary: parsed.professional_summary || '',
        education: (parsed.education ?? []).map((e: any) => ({
            school: e.institution || e.school || '',
            degree: e.degree || '',
            date: e.date || e.end_date || '',
            gpa: e.gpa || '',
            coursework: e.field_of_study || e.field || e.coursework || '',
        })),
        experience: rawExperience.map((w: any) => ({
            company: w.company || '',
            title: w.title || w.position || '',
            startDate: w.start_date || '',
            endDate: w.end_date || '',
            location: w.location || '',
            bullets: w.bullet_points || w.bullets || w.responsibilities || [],
        })),
        projects: (parsed.projects ?? []).map((p: any) => ({
            name: p.name || '',
            tech: Array.isArray(p.technologies) ? p.technologies.join(', ') : (p.tech || ''),
            date: p.date || '',
            bullets: p.bullet_points || p.bullets || p.description ? [p.description].filter(Boolean) : [],
        })),
        skills: {
            languages: (parsed.technical_skills ?? []).join(', '),
            tools: '',
            frameworks: '',
            soft: '',
        },
        leadership: [],
        certifications: (raw?.certifications ?? []).map((c: any) =>
            typeof c === 'string' ? c : [c.name, c.issuer, c.date].filter(Boolean).join(' | ')
        ),
        achievements: (() => {
            const fromExp: string[] = []
            for (const exp of (raw?.work_history ?? raw?.work_experience ?? [])) {
                if (Array.isArray(exp.achievements)) fromExp.push(...exp.achievements)
            }
            return fromExp
        })(),
    }
}

// ── Main Page ────────────────────────────────────────────────
export default function ResumesPage() {
    const { user } = useAuth()
    const router = useRouter()
    const [editorState, setEditorState] = useState<ResumeEditorState>(EMPTY_STATE)
    const [loaded, setLoaded] = useState(false)
    const [savedResumes, setSavedResumes] = useState<SavedResumeEntry[]>([])
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [selectedEntry, setSelectedEntry] = useState<SavedResumeEntry | null>(null)
    const [localOptimizedData, setLocalOptimizedData] = useState<OptimizedResumeData | null>(null)
    const [templateId, setTemplateId] = useState<string>('classic')
    const [showTemplatePicker, setShowTemplatePicker] = useState(false)
    // ── Source-resume filter (uploaded resume → which one drives the editor) ──
    const [uploadedResumes, setUploadedResumes] = useState<Resume[]>([])
    const [sourceResumeId, setSourceResumeId] = useState<string | null>(null)
    // ── Modal-based editor state ──
    const [openModalSection, setOpenModalSection] = useState<string | null>(null)
    // ── Studio tab (desktop) ──
    const [studioTab, setStudioTab] = useState<'sections' | 'assistant' | 'layout'>('sections')
    // ── Sidebar collapse (desktop) — frees width for the editor/assistant + preview ──
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

    // ── Layout Manager (plans/25 Phase 2 + 5) — section order/hidden, keyed on
    // the MASTER resume_id plus an optional job_id. job_id is null while
    // editing the master resume (Resume Sections tab, no job selected), and
    // set to the tailored entry's job when one is selected — giving that
    // job its own override row, never touching the master's (job_id null) row.
    const masterResumeId = selectedEntry?.resume_id ?? sourceResumeId
    const layoutJobId = selectedEntry?.job_id ?? null
    const [layout, setLayout] = useState<{ sectionOrder: string[]; hiddenSections: string[]; pageTarget: number } | null>(null)
    const [layoutSaveStatus, setLayoutSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
    const suppressNextLayoutSaveRef = useRef(false)

    const templateDefaultOrder = useMemo(() => {
        return TEMPLATES.find(t => t.id === templateId)?.sectionOrder
            ?? TEMPLATES.find(t => t.id === 'classic')!.sectionOrder!
    }, [templateId])

    useEffect(() => {
        if (!masterResumeId) { setLayout(null); return }
        let cancelled = false
        const qs = layoutJobId ? `resume_id=${masterResumeId}&job_id=${layoutJobId}` : `resume_id=${masterResumeId}`
        fetch(`/api/resume-layout?${qs}`)
            .then(r => r.json())
            .then((res) => {
                if (cancelled) return
                suppressNextLayoutSaveRef.current = true
                if (res.layout) {
                    setLayout({
                        sectionOrder: res.layout.section_order,
                        hiddenSections: res.layout.hidden_sections ?? [],
                        pageTarget: res.layout.page_target ?? 1,
                    })
                } else {
                    setLayout({ sectionOrder: templateDefaultOrder, hiddenSections: [], pageTarget: 1 })
                }
            })
            .catch(() => {
                if (cancelled) return
                suppressNextLayoutSaveRef.current = true
                setLayout({ sectionOrder: templateDefaultOrder, hiddenSections: [], pageTarget: 1 })
            })
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [masterResumeId, layoutJobId])

    const updateLayout = useCallback((sectionOrder: string[], hiddenSections: string[]) => {
        setLayout(prev => ({ sectionOrder, hiddenSections, pageTarget: prev?.pageTarget ?? 1 }))
    }, [])

    // Debounced autosave — skipped once right after a server-load sets `layout`,
    // so loading a resume doesn't immediately re-PUT what it just fetched.
    useEffect(() => {
        if (!layout || !masterResumeId) return
        if (suppressNextLayoutSaveRef.current) {
            suppressNextLayoutSaveRef.current = false
            return
        }
        setLayoutSaveStatus('saving')
        const t = setTimeout(() => {
            fetch('/api/resume-layout', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    resume_id: masterResumeId,
                    job_id: layoutJobId,
                    section_order: layout.sectionOrder,
                    hidden_sections: layout.hiddenSections,
                    page_target: layout.pageTarget,
                }),
            }).then(() => setLayoutSaveStatus('saved')).catch(() => setLayoutSaveStatus('idle'))
        }, 600)
        return () => clearTimeout(t)
    }, [layout, masterResumeId, layoutJobId])

    // Sections outside `sectionOrder` (hidden ones) are simply filtered out of
    // the array the renderers iterate — Phase 1's `order.map(...)` plumbing
    // already treats a missing key as "don't render", so no renderer changes
    // are needed to support hiding.
    const effectiveState = useMemo<ResumeEditorState>(() => {
        if (!layout) return editorState
        return {
            ...editorState,
            sectionOrder: layout.sectionOrder.filter(k => !layout.hiddenSections.includes(k)),
        }
    }, [editorState, layout])

    // ── Layout presets (plans/25 Phase 3) ──
    const activePresetKey = useMemo(() => layout ? detectPresetKey(layout.sectionOrder) : null, [layout])
    const selectPreset = useCallback((key: string) => {
        const preset = LAYOUT_PRESETS[key]
        if (preset) updateLayout(preset.order, layout?.hiddenSections ?? [])
    }, [layout, updateLayout])

    // ── AI-recommended layout (plans/25 Phase 3) — fetched once per resume,
    // never auto-applied; the banner only writes anything if the user clicks
    // Apply. Dismissing just clears it for this session (not persisted).
    const [recommendation, setRecommendation] = useState<{ preset: string; label: string; order: string[]; reason: string } | null>(null)
    useEffect(() => {
        setRecommendation(null)
        if (!masterResumeId) return
        let cancelled = false
        fetch('/api/resume-layout/recommend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resume_id: masterResumeId }),
        })
            .then(r => r.json())
            .then((res) => {
                if (cancelled || !res.recommended_preset) return
                setRecommendation({ preset: res.recommended_preset, label: res.label, order: res.order, reason: res.reason })
            })
            .catch(() => {})
        return () => { cancelled = true }
    }, [masterResumeId])
    const applyRecommendation = useCallback(() => {
        if (!recommendation) return
        updateLayout(recommendation.order, layout?.hiddenSections ?? [])
        setRecommendation(null)
    }, [recommendation, layout, updateLayout])
    // Don't show the banner if its suggestion is already the applied preset.
    const visibleRecommendation = recommendation && recommendation.preset !== activePresetKey ? recommendation : null

    // ── Resume Budget (plans/25 Phase 4) ──
    const updatePageTarget = useCallback((n: number) => {
        setLayout(prev => prev ? { ...prev, pageTarget: n } : prev)
    }, [])
    const [budget, setBudget] = useState<BudgetResult | null>(null)
    const [budgetFailed, setBudgetFailed] = useState(false)
    useEffect(() => {
        if (!layout) return
        setBudget(null)
        setBudgetFailed(false)
        let cancelled = false
        const t = setTimeout(async () => {
            // Tagged by stage so Sentry tells us WHICH step fails on a given
            // device/browser (react-pdf render vs. pdfjs-dist measurement)
            // instead of guessing blind — this was a bare `catch { setBudget(null) }`
            // that showed "Measuring…" forever with zero signal on failure.
            let stage = 'render-pdf'
            try {
                const { renderer, PdfComp } = await loadPdfRenderer(templateId)
                const doc = React.createElement(PdfComp, { state: effectiveState })
                const blob = await renderer.pdf(doc as any).toBlob()
                stage = 'measure-budget'
                const result = await measureBudget(blob, layout.pageTarget)
                if (!cancelled) setBudget(result)
            } catch (err) {
                console.error(`[ResumeBudget] page-count measurement failed at stage=${stage}:`, err)
                Sentry.captureException(err, { tags: { feature: 'resume-budget', stage } })
                if (!cancelled) { setBudget(null); setBudgetFailed(true) }
            }
        }, 900)
        return () => { cancelled = true; clearTimeout(t) }
    }, [effectiveState, templateId, layout])

    // useAssistant is a hook — must be called unconditionally, before the `!loaded`
    // early return below, so it stays alongside the other top-level state hooks.
    const assistant = useAssistant(
        editorState, setEditorState, selectedEntry?.job?.title ?? null,
        selectedEntry?.id ?? null, selectedEntry?.updated_at ?? null,
    )
    // Shared between the desktop panel and the mobile overlay so cache state
    // and the in-flight guard survive a tab switch — see CoverLetterView.tsx.
    const coverLetterController = useCoverLetter(selectedEntry?.resume_id ?? null, selectedEntry?.job_id ?? null)
    // Manual section-modal saves (ActiveModal onSaved) — Plan 21 Phase 1 persistence.
    // No-ops in raw-resume / localStorage-draft mode (selectedEntry is null there).
    // Coverage is computed here (not read from assistant.coverage) because that
    // state hasn't re-rendered yet at this point — update(local) just scheduled
    // it — so reading it now would stamp the PRE-edit value onto edit_history.
    const saveManualEdit = useCallback((section: string, before: unknown, after: unknown, nextState: ResumeEditorState) => {
        if (!selectedEntry?.id) return
        const id = selectedEntry.id
        const coverage = computeKeywordCoverage(assistant.atsKeywords, generateATSText(nextState))
        void persistEditorState(id, nextState, {
            section, operation: 'replace', before, after, source: 'manual', coverage,
        }, selectedEntry.updated_at).then(result => {
            if (result.ok || result.stale) {
                setSelectedEntry(prev => (prev && prev.id === id ? { ...prev, updated_at: result.updated_at } : prev))
            }
        })
    }, [selectedEntry, assistant.atsKeywords])

    // ── One-Page Optimizer (plans/25 Phase 5) — tailored resumes only. Fetches
    // the scored match for this (resume, job) pair once per selected entry, so
    // rankSectionsForTrim can weight sections by matched-skill evidence and
    // gap score_impact instead of just keyword coverage.
    const [jobMatch, setJobMatch] = useState<UserJobMatch | null>(null)
    useEffect(() => {
        setJobMatch(null)
        if (!selectedEntry || !user?.id) return
        let cancelled = false
        fetchUserJobMatch(user.id, selectedEntry.resume_id, selectedEntry.job_id)
            .then(m => { if (!cancelled) setJobMatch(m) })
            .catch(() => { if (!cancelled) setJobMatch(null) })
        return () => { cancelled = true }
    }, [selectedEntry, user?.id])

    const trimSuggestions = useMemo(() => {
        if (!selectedEntry || !layout) return []
        return rankSectionsForTrim(
            effectiveState, layout.sectionOrder, layout.hiddenSections,
            assistant.atsKeywords, jobMatch?.matched_skills, jobMatch?.gaps,
        )
    }, [selectedEntry, layout, effectiveState, assistant.atsKeywords, jobMatch])

    // ── Trim with AI (One-Page Optimizer) ──
    const [trimChanges, setTrimChanges] = useState<TrimChanges | null>(null)
    const [trimLoading, setTrimLoading] = useState(false)
    const [trimError, setTrimError] = useState<string | null>(null)

    const handleTrimWithAI = useCallback(async () => {
        if (!selectedEntry || !layout || !budget || trimLoading) return
        setTrimLoading(true)
        setTrimError(null)
        try {
            const result = await triggerTrimToFit({
                optimizedResumeId: selectedEntry.id,
                editorState,
                pageTarget: layout.pageTarget,
                currentPages: budget.pages,
            })
            if (!result.success) {
                setTrimError(result.error || 'Trim generation failed')
                return
            }
            if (result.empty || !result.changes || isTrimEmpty(result.changes)) {
                setTrimError('Nothing to trim — this resume is already tight.')
                return
            }
            setTrimChanges(result.changes)
        } catch (err) {
            setTrimError(err instanceof Error ? err.message : 'Trim generation failed')
        } finally {
            setTrimLoading(false)
        }
    }, [selectedEntry, layout, budget, editorState, trimLoading])

    const applyTrimWithAI = useCallback(() => {
        if (!trimChanges) return
        const before = editorState
        const nextState = applyTrimChanges(editorState, trimChanges)
        setEditorState(nextState)
        saveManualEdit('layout-trim', before, nextState, nextState)
        setTrimChanges(null)
    }, [trimChanges, editorState, saveManualEdit])

    // ── Project-Evidence Integration (plans/25 Phase 6) — completed AI
    // projects surfaced as a resume swap-in. Fetched once per user (a
    // "confirmed projects" list is shared across all resumes/jobs), then
    // ranked per-job in the memo below.
    const [confirmedProjects, setConfirmedProjects] = useState<ProjectEvidence[]>([])
    useEffect(() => {
        if (!user?.id) { setConfirmedProjects([]); return }
        let cancelled = false
        fetchConfirmedProjects(user.id).then(rows => { if (!cancelled) setConfirmedProjects(rows) }).catch(() => {})
        return () => { cancelled = true }
    }, [user?.id])

    const projectNudge = useMemo(() => {
        if (!selectedEntry) return null
        return findProjectSwapNudge(effectiveState, confirmedProjects, jobMatch?.gaps, assistant.atsKeywords, jobMatch?.matched_skills)
    }, [selectedEntry, effectiveState, confirmedProjects, jobMatch, assistant.atsKeywords])

    const applyProjectSwap = useCallback(() => {
        if (!projectNudge) return
        const before = editorState.projects
        const newEntry: ProjectEntry = {
            name: projectNudge.candidate.project_name,
            tech: projectNudge.candidate.tech_used.join(', '),
            date: 'Recently completed',
            bullets: [projectNudge.candidate.resume_bullet ?? ''],
        }
        const after = projectNudge.weakestExisting
            ? editorState.projects.map((p, i) => i === projectNudge.weakestExisting!.index ? newEntry : p)
            : [...editorState.projects, newEntry]
        const nextState = { ...editorState, projects: after }
        setEditorState(nextState)
        saveManualEdit('projects', before, after, nextState)
    }, [projectNudge, editorState, saveManualEdit])

    // ── Mobile state ──
    const [isMobile, setIsMobile] = useState(false)
    const [mobileTab, setMobileTab] = useState<'sections' | 'templates' | 'assistant' | 'layout'>('sections')
    const [showAllResumesSheet, setShowAllResumesSheet] = useState(false)
    const [showMobilePreview, setShowMobilePreview] = useState(false)
    const [previewTab, setPreviewTab] = useState<'recruiters' | 'cover-letter'>('recruiters')
    const [mobileSrcDropOpen, setMobileSrcDropOpen] = useState(false)
    const mobileSrcDropRef = useRef<HTMLDivElement>(null)
    const [previewingTemplate, setPreviewingTemplate] = useState<{ id: string; name: string; imageUrl: string } | null>(null)

    const loadOptimizedResume = useCallback(async (entry: SavedResumeEntry) => {
        setSelectedId(entry.id)
        setSelectedEntry(entry)
        const originalResume = await fetchResumeById(entry.resume_id)
        const originalParsed = (originalResume?.structured_data ?? null) as ParsedResume | null
        setEditorState(mapToEditorState(entry.optimized_data, originalParsed))
    }, [])

    // Load a raw uploaded resume directly (used when source has no optimizations).
    // The DB stores structured_data as a JSON string in some rows, so normalize first.
    const loadRawResume = useCallback((parsed: ParsedResume | null | unknown) => {
        setSelectedId(null)
        setSelectedEntry(null)
        const obj = parseStructuredData(parsed) as ParsedResume | null
        setEditorState(mapRawResumeToEditorState(obj))
    }, [])

    useEffect(() => {
        async function init() {
            const userId = user?.id ?? ''
            // Fetch both lists in parallel
            const [optimizedList, uploadedList] = await Promise.all([
                fetchAllOptimizedResumes(userId).catch(() => [] as SavedResumeEntry[]),
                userId ? fetchResumes(userId).catch(() => [] as Resume[]) : Promise.resolve([] as Resume[]),
            ])

            setUploadedResumes(uploadedList)

            if (optimizedList.length > 0) {
                setSavedResumes(optimizedList)
                await loadOptimizedResume(optimizedList[0])
            } else if (uploadedList.length > 0) {
                // No optimizations yet — show the most recent raw resume
                setSourceResumeId(uploadedList[0].id)
                loadRawResume(uploadedList[0].structured_data)
            } else {
                // Fall back to localStorage draft
                try {
                    const raw = localStorage.getItem('jobscorer-resume-draft')
                    if (raw) {
                        const { optimizedData, originalResume } = JSON.parse(raw) as { optimizedData: OptimizedResumeData; originalResume: ParsedResume | null }
                        setEditorState(mapToEditorState(optimizedData, originalResume))
                        setLocalOptimizedData(optimizedData)
                    }
                } catch { /* use empty state */ }
            }

            const savedTemplate = localStorage.getItem('jobscorer-template')
            if (savedTemplate && TEMPLATE_LABELS[savedTemplate]) setTemplateId(savedTemplate)
            setLoaded(true)
        }
        init()
    }, [user?.id, loadOptimizedResume, loadRawResume])

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 767px)')
        setIsMobile(mq.matches)
        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
        mq.addEventListener('change', handler)
        return () => mq.removeEventListener('change', handler)
    }, [])

    useEffect(() => {
        setSidebarCollapsed(localStorage.getItem('jobscorer-resumes-sidebar-collapsed') === '1')
    }, [])

    const toggleSidebarCollapsed = useCallback(() => {
        setSidebarCollapsed(prev => {
            const next = !prev
            localStorage.setItem('jobscorer-resumes-sidebar-collapsed', next ? '1' : '0')
            return next
        })
    }, [])

    useEffect(() => {
        if (!mobileSrcDropOpen) return
        function handle(e: MouseEvent) {
            if (mobileSrcDropRef.current && !mobileSrcDropRef.current.contains(e.target as Node)) {
                setMobileSrcDropOpen(false)
            }
        }
        document.addEventListener('mousedown', handle)
        return () => document.removeEventListener('mousedown', handle)
    }, [mobileSrcDropOpen])

    // Filtered list of optimized resumes (sidebar shows these)
    const visibleSavedResumes = useMemo(() => {
        if (!sourceResumeId) return savedResumes
        return savedResumes.filter(r => r.resume_id === sourceResumeId)
    }, [savedResumes, sourceResumeId])

    // Count of optimized resumes per source (for dropdown subtext)
    const optimizedCountsBySource = useMemo(() => {
        const m: Record<string, number> = {}
        for (const s of savedResumes) m[s.resume_id] = (m[s.resume_id] ?? 0) + 1
        return m
    }, [savedResumes])

    // Source dropdown change handler
    const handleSourceChange = useCallback(async (id: string | null) => {
        setSourceResumeId(id)
        if (id === null) {
            // "All resumes" — restore the first optimized resume if any
            if (savedResumes.length > 0) await loadOptimizedResume(savedResumes[0])
            return
        }
        // Filter the optimized list for this source
        const forSource = savedResumes.filter(r => r.resume_id === id)
        if (forSource.length > 0) {
            await loadOptimizedResume(forSource[0])
        } else {
            // No optimizations yet — load the raw uploaded resume directly
            const raw = uploadedResumes.find(r => r.id === id)
            loadRawResume(raw?.structured_data ?? null)
        }
    }, [savedResumes, uploadedResumes, loadOptimizedResume, loadRawResume])

    const handleTemplateSelect = useCallback((id: TemplateId) => {
        setTemplateId(id)
        localStorage.setItem('jobscorer-template', id)
        setShowTemplatePicker(false)
    }, [])

    const isFilled = useCallback((section: string): boolean => {
        switch (section) {
            case 'profile': return !!(editorState.profile.name || editorState.profile.email)
            case 'summary': return !!editorState.summary.trim()
            case 'education': return editorState.education.length > 0 && !!editorState.education[0].school
            case 'experience': return editorState.experience.length > 0 && !!editorState.experience[0].company
            case 'projects': return editorState.projects.length > 0 && !!editorState.projects[0].name
            case 'skills': return !!(editorState.skills.languages || editorState.skills.tools)
            case 'leadership': return editorState.leadership.length > 0
            case 'certifications': return editorState.certifications.length > 0 && !!editorState.certifications[0].trim()
            case 'achievements': return editorState.achievements.length > 0 && !!editorState.achievements[0].trim()
            default: return false
        }
    }, [editorState])

    // Completeness score for editorial progress tracker
    const completionSections = ['profile', 'summary', 'education', 'experience', 'projects', 'skills', 'certifications', 'achievements']
    const completionPct = Math.round(
        (completionSections.filter(s => isFilled(s)).length / completionSections.length) * 100
    )

    if (!loaded) {
        return (
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: 'calc(100vh - 64px)', background: M.surface,
                color: M.textMuted, fontFamily: M.fontBody,
            }}>
                <style>{`@keyframes m-spin { to { transform: rotate(360deg) } }`}</style>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                        width: 14, height: 14, borderRadius: '50%',
                        border: `2px solid ${M.border}`, borderTopColor: M.accent,
                        animation: 'm-spin 0.8s linear infinite',
                    }} />
                    <span style={{ fontSize: '0.875rem' }}>Loading Resume Studio…</span>
                </div>
            </div>
        )
    }

    const meridianJob = selectedEntry?.job ?? null
    const meridianRawScore = selectedEntry?.keyword_alignment_score ?? 0
    const meridianScore = meridianRawScore > 10 ? Math.round(meridianRawScore) : Math.round(meridianRawScore * 10)
    const meridianScoreColor = meridianScore >= 80 ? M.green : meridianScore >= 60 ? M.amber : M.red
    const meridianScoreBg = meridianScore >= 80 ? M.greenLight : meridianScore >= 60 ? M.amberLight : '#fee2e2'

    /* ─── MOBILE LAYOUT ─────────────────────────────────────── */
    if (isMobile) {
        const hasContent = savedResumes.length > 0 || uploadedResumes.length > 0

        // ── helpers ──
        function mAvatarColor(str: string): string {
            const palette = ['#1e293b', '#1a1a2e', '#4c1d95', '#5b21b6', '#0891b2', '#1e3a8a', '#be185d', '#065f46']
            let h = 0; for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h)
            return palette[Math.abs(h) % palette.length]
        }
        function mScoreColor(sc: number): string { return sc >= 80 ? '#15803d' : sc >= 65 ? M.accent : '#d97706' }
        function mInitial(str: string) { return (str || '?').replace(/[^a-zA-Z]/g, '')[0]?.toUpperCase() || '?' }

        // ── empty state (no content) ──
        if (!hasContent) {
            return (
                <div style={{ fontFamily: M.fontBody, background: M.surface, minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                        <div style={{ width: 64, height: 64, borderRadius: 18, background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', border: '2px dashed rgba(29,106,245,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={M.accent} strokeWidth="1.6" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        </div>
                        <div style={{ fontSize: 17, fontWeight: 700, color: M.text, marginBottom: 7, letterSpacing: '-0.02em' }}>Resume Studio</div>
                        <div style={{ fontSize: 13, color: M.textMuted, lineHeight: 1.65, maxWidth: 260, marginBottom: 22 }}>Optimise a resume for a job match to unlock Studio. AI builds your formatted resume ready to download as PDF.</div>
                        <button onClick={() => router.push('/dashboard/matches')} style={{ padding: '11px 24px', background: M.accent, color: '#fff', border: 'none', borderRadius: 9, fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', fontFamily: M.fontBody, boxShadow: '0 4px 14px -4px rgba(29,106,245,0.4)', display: 'flex', alignItems: 'center', gap: 7 }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l1.9 4.6L18.5 8l-4.6 1.9L12 14l-1.9-4.5L5.5 8l4.6-1.9z"/></svg>
                            Go to AI Matches
                        </button>
                    </div>
                </div>
            )
        }

        const MOBILE_TEMPLATES = Object.entries(TEMPLATE_LABELS)
        const srcLabel = sourceResumeId
            ? (uploadedResumes.find(r => r.id === sourceResumeId)?.original_filename ?? 'Selected resume')
            : 'All resumes'
        const srcSubLabel = sourceResumeId
            ? `${optimizedCountsBySource[sourceResumeId] ?? 0} optimized variant${(optimizedCountsBySource[sourceResumeId] ?? 0) !== 1 ? 's' : ''}`
            : `Showing ${uploadedResumes.length} uploaded resume${uploadedResumes.length !== 1 ? 's' : ''}`

        // Template color accent for mini preview
        const TMPL_ACCENT: Record<string, string> = {
            classic: '#0f1e40', london: '#1d6af5', rezi: '#1e1e3f',
            harvard: '#9b1c1c', 'open-resume': '#374151',
            cobalt: '#1d4ed8', onyx: '#18181b', jade: '#6d28d9', lapis: '#c2410c', executive: '#292524',
            amber: '#b8912f', athens: '#c0392b', axis: '#7c3aed', beacon: '#0f3460',
        }

        // Uses effectiveState (editorState + the Layout tab's live order/hidden
        // sections merged in), matching the desktop preview panel — otherwise
        // mobile previews/downloads silently ignore Layout tab changes.
        const renderPreviewForTemplate = (tid: string): React.ReactNode => {
            switch (tid) {
                case 'cobalt':       return <CobaltResumePreview state={effectiveState} />
                case 'onyx':         return <OnyxResumePreview state={effectiveState} />
                case 'jade':         return <JadeResumePreview state={effectiveState} />
                case 'lapis':        return <LapisResumePreview state={effectiveState} />
                case 'executive':    return <ExecutiveResumePreview state={effectiveState} />
                case 'amber':        return <AmberResumePreview state={effectiveState} />
                case 'athens':       return <AthensResumePreview state={effectiveState} />
                case 'axis':         return <AxisResumePreview state={effectiveState} />
                case 'beacon':       return <BeaconResumePreview state={effectiveState} />
                case 'rezi':         return <ReziResumePreview state={effectiveState} />
                case 'london':       return <LondonResumePreview state={effectiveState} />
                case 'harvard':      return <HarvardResumePreview state={effectiveState} />
                case 'open-resume':  return <OpenResumePreview state={effectiveState} />
                default:             return <ClassicResumePreview state={effectiveState} />
            }
        }

        return (
            <>
            <style>{`@keyframes m-spin{to{transform:rotate(360deg)}}`}</style>

            {mobileTab === 'assistant' ? (
                /* ── Full-screen Assistant mode: no persistent Studio bar/source
                   dropdown/resume strip/tab bar — just a slim nav + full-bleed
                   resume behind the sheet, matching the mobile handoff spec. */
                <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', background: '#fff', fontFamily: M.fontBody, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 14px 12px', borderBottom: `1px solid ${M.border}`, flexShrink: 0, background: '#fff' }}>
                        <button onClick={() => setMobileTab('sections')} aria-label="Back to Resume Studio" style={{ width: 34, height: 34, borderRadius: 9, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: M.text, flexShrink: 0, marginLeft: -6 }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                        </button>
                        <span style={{ flex: 1, fontSize: 21, fontWeight: 800, color: M.text, letterSpacing: '-0.02em' }}>Resume Studio</span>
                        <button onClick={() => { setShowMobilePreview(true); setPreviewTab('recruiters') }} aria-label="More options" style={{ width: 34, height: 34, borderRadius: 9, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: M.text, flexShrink: 0 }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
                        </button>
                    </div>
                    <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', overflowX: 'hidden', background: '#fff' }}>
                            <PreviewDecorationsProvider decorations={assistant.decorations}>
                                <MobilePreviewScaler>
                                    {renderPreviewForTemplate(templateId)}
                                </MobilePreviewScaler>
                            </PreviewDecorationsProvider>
                        </div>
                        <MobileAssistantSheet assistant={assistant} />
                    </div>
                </div>
            ) : (
            <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', background: M.surface, fontFamily: M.fontBody, overflow: 'hidden' }}>

                {/* ── Studio bar ── */}
                <div style={{ background: M.white, borderBottom: `1px solid ${M.border}`, padding: '10px 13px', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
                        <div style={{ width: 30, height: 30, borderRadius: 8, background: M.surfaceAlt, border: `1px solid ${M.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={M.accent} strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        </div>
                        <div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: M.text, letterSpacing: '-0.025em' }}>Resume Studio</div>
                            {meridianJob && (
                                <div style={{ fontSize: '11.5px', color: M.textMuted, display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>
                                    {meridianJob.title} at {meridianJob.company}
                                </div>
                            )}
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' as const }}>
                        {meridianScore > 0 && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 99, background: meridianScoreBg, border: `1px solid ${meridianScoreColor}33`, fontFamily: M.fontMono, fontSize: 11, fontWeight: 800, color: meridianScoreColor }}>{meridianScore}% match</span>
                        )}
                        <button onClick={() => { setShowMobilePreview(true); setPreviewTab('recruiters') }} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 9, background: M.white, border: `1.5px solid ${M.border}`, color: M.textMuted, fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: M.fontBody }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            Preview
                        </button>
                        <DownloadPdf state={effectiveState} templateId={templateId} companyName={meridianJob?.company ?? null} compact />
                    </div>
                </div>

                {/* ── Source Resume dropdown ── */}
                <div ref={mobileSrcDropRef} style={{ background: M.white, borderBottom: `1px solid ${M.border}`, padding: '9px 13px', flexShrink: 0, position: 'relative' }}>
                    <div style={{ fontFamily: M.fontMono, fontSize: '8.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: M.textFaint, marginBottom: 5 }}>Source Resume</div>
                    <div style={{ position: 'relative' }}>
                    <button type="button" onClick={() => uploadedResumes.length > 1 && setMobileSrcDropOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', background: M.surfaceAlt, border: `1.5px solid ${mobileSrcDropOpen ? M.accent : M.border}`, borderRadius: mobileSrcDropOpen ? '10px 10px 0 0' : 10, cursor: uploadedResumes.length > 1 ? 'pointer' : 'default', fontFamily: M.fontBody, transition: 'border-color .13s' }}>
                        <div style={{ width: 30, height: 30, borderRadius: 8, background: M.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                        </div>
                        <div style={{ flex: 1, textAlign: 'left' as const }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: M.text }}>{srcLabel}</div>
                            <div style={{ fontSize: 11, color: M.textMuted }}>{srcSubLabel}</div>
                        </div>
                        {uploadedResumes.length > 1 && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={M.textMuted} strokeWidth="2.2" strokeLinecap="round" style={{ transform: mobileSrcDropOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s', flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>
                        )}
                    </button>
                    {mobileSrcDropOpen && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, border: `1.5px solid ${M.accent}`, borderTop: 'none', borderRadius: '0 0 10px 10px', background: M.white, overflow: 'hidden', boxShadow: '0 8px 20px rgba(15,30,64,0.1)' }}>
                            <div onClick={() => { handleSourceChange(null); setMobileSrcDropOpen(false) }} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', cursor: 'pointer', borderBottom: `1px solid ${M.borderLight}`, background: !sourceResumeId ? M.surfaceAlt : M.white }}>
                                <div style={{ width: 30, height: 30, borderRadius: 8, background: M.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '12.5px', fontWeight: 700, color: !sourceResumeId ? M.accent : M.text }}>All resumes</div>
                                    <div style={{ fontSize: 11, color: M.textMuted }}>Show everything you've optimized</div>
                                </div>
                                {!sourceResumeId && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={M.accent} strokeWidth="2.8" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>}
                            </div>
                            {uploadedResumes.map(r => {
                                const isSel = sourceResumeId === r.id
                                const initial = mInitial(r.original_filename ?? '')
                                const bg = mAvatarColor(r.original_filename ?? r.id)
                                const cnt = optimizedCountsBySource[r.id] ?? 0
                                return (
                                    <div key={r.id} onClick={() => { handleSourceChange(r.id); setMobileSrcDropOpen(false) }} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', cursor: 'pointer', borderBottom: `1px solid ${M.borderLight}`, background: isSel ? M.surfaceAlt : M.white }}>
                                        <div style={{ width: 30, height: 30, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff', fontWeight: 700, fontSize: 13 }}>{initial}</div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '12.5px', fontWeight: 700, color: isSel ? M.accent : M.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{r.original_filename ?? `Resume ${r.id.slice(0, 6)}`}</div>
                                            <div style={{ fontSize: 11, color: M.textMuted }}>{cnt} optimized variant{cnt !== 1 ? 's' : ''}</div>
                                        </div>
                                        {isSel && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={M.accent} strokeWidth="2.8" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                    </div>{/* /btn-dropdown wrapper */}
                </div>

                {/* ── Resume strip ── */}
                <div style={{ background: M.white, borderBottom: `1px solid ${M.border}`, padding: '9px 0 9px 13px', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 13, marginBottom: 7 }}>
                        <span style={{ fontFamily: M.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: M.textFaint }}>Source Resume</span>
                        <span style={{ fontFamily: M.fontMono, fontSize: 9, fontWeight: 700, color: M.accent }}>{visibleSavedResumes.length} resume{visibleSavedResumes.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'stretch', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', gap: 7, overflowX: 'auto', flex: 1, minWidth: 0, paddingRight: 8, scrollbarWidth: 'none' as const }}>
                            {visibleSavedResumes.slice(0, 6).map(entry => {
                                const isSel = selectedId === entry.id
                                const sc = entry.keyword_alignment_score ?? 0
                                const scNorm = sc > 10 ? Math.round(sc) : Math.round(sc * 10)
                                const date = entry.updated_at ? new Date(entry.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''
                                const initial = mInitial(entry.job?.company ?? entry.job?.title ?? '')
                                const bg = mAvatarColor(entry.job?.company ?? '')
                                return (
                                    <div key={entry.id} onClick={() => loadOptimizedResume(entry)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', borderRadius: 10, border: `1.5px solid ${isSel ? M.accent : M.border}`, background: isSel ? M.surfaceAlt : M.white, cursor: 'pointer', flexShrink: 0, maxWidth: 160, transition: 'border-color .13s' }}>
                                        <div style={{ width: 28, height: 28, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff', fontWeight: 700, fontSize: 13 }}>{initial}</div>
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontSize: 11, fontWeight: 700, color: isSel ? M.accent : M.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{entry.job?.title ?? 'Unknown'}</div>
                                            <div style={{ fontSize: 10, color: M.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{entry.job?.company ?? ''}</div>
                                            <div style={{ display: 'flex', gap: 5, marginTop: 2 }}>
                                                <span style={{ fontFamily: M.fontMono, fontSize: '10.5px', fontWeight: 800, color: mScoreColor(scNorm) }}>{scNorm}%</span>
                                                {date && <span style={{ fontSize: 9, color: M.textFaint }}>{date}</span>}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                        <div onClick={() => setShowAllResumesSheet(true)} style={{ flexShrink: 0, alignSelf: 'stretch', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '9px 10px', borderLeft: `1px solid ${M.border}`, background: M.surfaceAlt, cursor: 'pointer', minWidth: 62, marginRight: 13 }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={M.accent} strokeWidth="2.2" strokeLinecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
                            <span style={{ fontSize: 10, fontWeight: 700, color: M.accent, textAlign: 'center' as const, lineHeight: 1.3 }}>See all<br />{visibleSavedResumes.length} →</span>
                        </div>
                    </div>
                </div>

                {/* ── Tab bar ── */}
                <div style={{ background: M.white, borderBottom: `1.5px solid ${M.border}`, padding: '0 13px', display: 'flex', gap: 0, flexShrink: 0 }}>
                    {([
                        { id: 'sections', label: 'Sections', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg> },
                        { id: 'layout', label: 'Layout', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> },
                        { id: 'assistant', label: 'Assistant', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2z"/></svg> },
                        { id: 'templates', label: 'Templates', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> },
                    ] as { id: 'sections' | 'assistant' | 'templates' | 'layout'; label: string; icon: React.ReactNode }[]).map(tab => (
                        <div key={tab.id} onClick={() => setMobileTab(tab.id)} style={{ padding: '10px 11px 8px', fontSize: '12.5px', fontWeight: mobileTab === tab.id ? 700 : 600, color: mobileTab === tab.id ? M.accent : M.textMuted, cursor: 'pointer', borderBottom: `2.5px solid ${mobileTab === tab.id ? M.accent : 'transparent'}`, marginBottom: '-1.5px', display: 'flex', alignItems: 'center', gap: 5, userSelect: 'none' as const }}>
                            {tab.icon}{tab.label}
                        </div>
                    ))}
                </div>

                {/* ── Tab content ── */}
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

                    {/* ─ Sections pane ─ */}
                    {mobileTab === 'sections' && (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <div style={{ padding: '13px 13px 0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                    <span style={{ fontSize: 14, fontWeight: 700, color: M.text }}>Resume Sections</span>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 99, background: '#e0f2ff', border: '1.5px solid #7dd3fc', fontFamily: M.fontMono, fontSize: 10, fontWeight: 700, color: '#0369a1' }}>
                                        {completionSections.filter(s => isFilled(s)).length}/{completionSections.length} complete
                                    </span>
                                </div>
                                <div style={{ height: 5, background: M.surfaceAlt, borderRadius: 99, overflow: 'hidden', marginBottom: 14 }}>
                                    <div style={{ height: '100%', borderRadius: 99, background: `linear-gradient(90deg, ${M.accent}, #60a5fa)`, width: `${completionPct}%`, transition: 'width 0.4s' }} />
                                </div>
                            </div>
                            <div style={{ padding: '0 13px 8px' }}>
                                {M_SECTION_DEFS.map(({ key, label }) => {
                                    const filled = isFilled(key)
                                    const summary = sectionSummaryText(key, editorState)
                                    return (
                                        <div key={key} onClick={() => setOpenModalSection(key)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px', background: filled ? M.white : '#fffbeb', border: `1px solid ${filled ? M.border : M.amberBorder}`, borderRadius: 11, marginBottom: 8, cursor: 'pointer', transition: 'border-color .13s' }}>
                                            <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: filled ? M.accent : M.amberLight, border: filled ? 'none' : `2px solid ${M.amberBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {filled
                                                    ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                                                    : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#92400e" strokeWidth="2.5" strokeLinecap="round"><path d="M12 9v4M12 17h.01"/></svg>}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1 }}>
                                                    <span style={{ fontSize: 13, fontWeight: 700, color: M.text }}>{label}</span>
                                                    <span style={{ padding: '2px 7px', borderRadius: 4, background: filled ? M.greenLight : M.amberLight, border: `1px solid ${filled ? M.greenBorder : M.amberBorder}`, fontFamily: M.fontMono, fontSize: '8.5px', fontWeight: 700, color: filled ? '#15803d' : '#92400e', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>{filled ? 'DONE' : 'MISSING'}</span>
                                                </div>
                                                <div style={{ fontSize: '11.5px', color: filled ? M.textMuted : M.amber, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{summary}</div>
                                            </div>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={M.textFaint} strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                                        </div>
                                    )
                                })}
                                {/* Tip for first missing section */}
                                {completionPct < 100 && (
                                    <div style={{ background: M.surfaceAlt, border: `1px solid ${M.border}`, borderRadius: 10, padding: '10px 12px', marginTop: 4, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={M.accent} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                                        <span style={{ fontSize: 12, color: M.textMid, lineHeight: 1.55 }}>Complete missing sections to boost your resume score and stand out to recruiters.</span>
                                    </div>
                                )}
                            </div>
                            {/* Sticky bottom CTA */}
                            <div style={{ position: 'sticky', bottom: 0, background: M.white, borderTop: `1px solid ${M.border}`, padding: '10px 13px 14px', boxShadow: '0 -4px 16px rgba(15,23,42,0.06)' }}>
                                <button onClick={() => router.push('/dashboard/matches')} style={{ width: '100%', padding: 11, background: M.accent, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: M.fontBody, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: '0 4px 14px -4px rgba(29,106,245,0.4)' }}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l1.9 4.6L18.5 8l-4.6 1.9L12 14l-1.9-4.5L5.5 8l4.6-1.9z"/></svg>
                                    + Optimise New Job
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ─ Layout pane ─ */}
                    {mobileTab === 'layout' && (
                        <div style={{ flex: 1 }}>
                            {layout ? (
                                <LayoutManagerPanel
                                    isMobile
                                    order={layout.sectionOrder}
                                    hidden={layout.hiddenSections}
                                    onChange={updateLayout}
                                    defaultOrder={templateDefaultOrder}
                                    saveStatus={layoutSaveStatus}
                                    activePresetKey={activePresetKey}
                                    onSelectPreset={selectPreset}
                                    recommendation={visibleRecommendation}
                                    onApplyRecommendation={applyRecommendation}
                                    onDismissRecommendation={() => setRecommendation(null)}
                                    pageTarget={layout.pageTarget}
                                    onPageTargetChange={updatePageTarget}
                                    budget={budget}
                                    budgetFailed={budgetFailed}
                                    optimizer={selectedEntry && (projectNudge || budget?.overBudget) ? (
                                        <>
                                            {projectNudge && (
                                                <ProjectSwapNudgeCard nudge={projectNudge} onSwap={applyProjectSwap} />
                                            )}
                                            {budget?.overBudget && (
                                                <OnePageOptimizerPanel
                                                    suggestions={trimSuggestions}
                                                    onHide={(key) => updateLayout(layout.sectionOrder, [...layout.hiddenSections, key])}
                                                    onTrimWithAI={handleTrimWithAI}
                                                    trimLoading={trimLoading}
                                                />
                                            )}
                                        </>
                                    ) : null}
                                />
                            ) : (
                                <div style={{ padding: '20px 18px', fontSize: '0.8125rem', color: M.textFaint, fontFamily: M.fontBody }}>
                                    Loading layout…
                                </div>
                            )}
                        </div>
                    )}

                    {/* ─ Templates pane ─ */}
                    {mobileTab === 'templates' && (
                        <div style={{ padding: '13px 13px 100px' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: M.text, marginBottom: 4 }}>Choose a Template</div>
                            <div style={{ fontSize: 12, color: M.textMuted, marginBottom: 13 }}>Tap to apply. Your resume updates instantly.</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                {MOBILE_TEMPLATES.map(([id, name]) => {
                                    const isActive = templateId === id
                                    const accent = TMPL_ACCENT[id] ?? '#0f1e40'
                                    return (
                                        <div key={id} onClick={() => {
                                            setPreviewTab('recruiters')
                                            setPreviewingTemplate({ id, name, imageUrl: TEMPLATE_IMAGES[id] ?? '' })
                                        }} style={{ border: `2px solid ${isActive ? M.accent : M.border}`, borderRadius: 11, overflow: 'hidden', cursor: 'pointer', background: M.white, transition: 'border-color .13s', boxShadow: isActive ? `0 0 0 3px rgba(29,106,245,0.1)` : 'none' }}>
                                            {/* Template thumbnail */}
                                            <div style={{ height: 160, background: '#f8fafc', overflow: 'hidden', position: 'relative' }}>
                                                {TEMPLATE_IMAGES[id] ? (
                                                    <img src={TEMPLATE_IMAGES[id]} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', display: 'block' }} />
                                                ) : (
                                                    /* Fallback hand-drawn preview for templates without a PNG */
                                                    <div style={{ padding: '8px 7px', fontSize: '5.5px', color: '#1a1a1a', lineHeight: 1.4 }}>
                                                        {id === 'cobalt' || id === 'onyx' || id === 'jade' || id === 'lapis' ? (
                                                            <div style={{ display: 'flex', height: 104 }}>
                                                                <div style={{ width: 28, background: accent, height: '100%', borderRadius: 2, marginRight: 4 }} />
                                                                <div style={{ flex: 1 }}>
                                                                    <div style={{ height: 5, background: '#1a1a1a', borderRadius: 1, marginBottom: 3, width: '70%' }} />
                                                                    <div style={{ height: 2, background: '#e2e8f0', borderRadius: 1, marginBottom: 2 }} />
                                                                    <div style={{ height: 2, background: '#e2e8f0', borderRadius: 1, marginBottom: 6, width: '85%' }} />
                                                                    {[1,2,3].map(i => <div key={i} style={{ height: 2, background: '#e2e8f0', borderRadius: 1, marginBottom: 2, width: `${90 - i * 8}%` }} />)}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                {(id === 'london' || id === 'cobalt') && <div style={{ height: 3, background: accent, borderRadius: 1, marginBottom: 4 }} />}
                                                                <div style={{ fontSize: 8, fontWeight: 700, color: id === 'london' || id === 'rezi' ? accent : '#0f1e40', marginBottom: 2 }}>
                                                                    {editorState.profile.name || 'Your Name'}
                                                                </div>
                                                                <div style={{ height: 2, background: '#e2e8f0', borderRadius: 1, marginBottom: 2 }} />
                                                                <div style={{ height: 2, background: '#e2e8f0', borderRadius: 1, marginBottom: 5, width: '60%' }} />
                                                                <div style={{ height: 2, width: 40, borderRadius: 1, background: accent, margin: '4px 0 2px' }} />
                                                                {[1,2,3].map(i => <div key={i} style={{ height: 2, background: '#e2e8f0', borderRadius: 1, marginBottom: 2, width: `${90 - i * 8}%` }} />)}
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                                {isActive && (
                                                    <div style={{ position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: '50%', background: M.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(29,106,245,0.5)' }}>
                                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <span style={{ fontSize: 12, fontWeight: 700, color: M.text }}>{name}</span>
                                                <span style={{ fontSize: 10, fontWeight: 600, color: M.green, display: 'flex', alignItems: 'center', gap: 3 }}>
                                                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                                                    ATS
                                                </span>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
            )}

            {/* ── Template preview bottom sheet (mobile) ── */}
            {previewingTemplate && isMobile && (
                <>
                    <div className="mob-tmpl-preview-overlay" onClick={() => setPreviewingTemplate(null)} />
                    <div className="mob-tmpl-preview-sheet">
                        <div style={{ width: 36, height: 4, borderRadius: 99, background: '#e2e8f0', margin: '12px auto 0', flexShrink: 0 }} />
                        <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexShrink: 0 }}>
                            <div>
                                <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>{previewingTemplate.name}</div>
                                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Tap &apos;Use this template&apos; to apply</div>
                            </div>
                            <button onClick={() => setPreviewingTemplate(null)} style={{ width: 28, height: 28, borderRadius: 8, background: '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', flexShrink: 0 }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                            </button>
                        </div>
                        <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '8px 16px', display: 'flex', gap: 6, flexShrink: 0 }}>
                            <button onClick={() => setPreviewTab('recruiters')} style={{ flex: 1, padding: 7, borderRadius: 99, border: 'none', background: previewTab === 'recruiters' ? '#0f172a' : 'transparent', color: previewTab === 'recruiters' ? '#fff' : '#64748b', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: M.fontBody }}>What Recruiters See</button>
                            <button onClick={() => setPreviewTab('cover-letter')} style={{ flex: 1, padding: 7, borderRadius: 99, border: 'none', background: previewTab === 'cover-letter' ? '#0f172a' : 'transparent', color: previewTab === 'cover-letter' ? '#fff' : '#64748b', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: M.fontBody }}>Cover Letter</button>
                        </div>
                        {previewTab === 'recruiters' ? (
                            <div className="mob-tmpl-preview-scroll">
                                <div style={{ background: '#fff' }}>
                                    <MobilePreviewScaler>
                                        {renderPreviewForTemplate(previewingTemplate.id)}
                                    </MobilePreviewScaler>
                                </div>
                            </div>
                        ) : (
                            <div className="mob-tmpl-preview-scroll">
                                <CoverLetterView controller={coverLetterController} entry={selectedEntry} job={meridianJob} profileState={editorState.profile} compact />
                            </div>
                        )}
                        <div className="mob-tmpl-preview-footer">
                            <button onClick={() => setPreviewingTemplate(null)} style={{ flex: 1, padding: 11, border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#fff', fontSize: 13, fontWeight: 600, color: '#64748b', cursor: 'pointer', fontFamily: M.fontBody }}>
                                Cancel
                            </button>
                            <button
                                onClick={() => { handleTemplateSelect(previewingTemplate.id as any); setPreviewingTemplate(null) }}
                                style={{ flex: 2, padding: 11, background: '#135bec', color: '#fff', borderRadius: 10, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: M.fontBody, boxShadow: '0 3px 10px rgba(19,91,236,0.3)' }}
                            >
                                Use this template →
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* ── Section editor modal ── */}
            {openModalSection && (
                <ActiveModal key={openModalSection} sectionKey={openModalSection} state={editorState} update={setEditorState} onClose={() => setOpenModalSection(null)} isMobile={isMobile} onSaved={saveManualEdit} />
            )}

            {/* ── Template picker modal ── */}
            {showTemplatePicker && (
                <TemplatePickerModal onSelect={handleTemplateSelect} onClose={() => setShowTemplatePicker(false)} />
            )}

            {/* ── Mobile preview overlay ── */}
            {showMobilePreview && (
                <>
                    <div onClick={() => setShowMobilePreview(false)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(15,23,42,0.78)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '14px 10px' }}>
                        <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 366, height: '88dvh', maxHeight: 720, background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 28px 70px rgba(0,0,0,0.55)', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ background: '#fff', padding: '12px 14px 11px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
                                <div>
                                    <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>Resume Preview</div>
                                    <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: 1 }}>{TEMPLATE_LABELS[templateId] ?? 'Classic'} template</div>
                                </div>
                                <button onClick={() => setShowMobilePreview(false)} style={{ width: 28, height: 28, borderRadius: 99, background: '#f1f5f9', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                                </button>
                            </div>
                            {/* Recruiter / ATS tabs */}
                            <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '8px 14px', display: 'flex', gap: 6, flexShrink: 0 }}>
                                <button onClick={() => setPreviewTab('recruiters')} style={{ flex: 1, padding: 7, borderRadius: 99, border: 'none', background: previewTab === 'recruiters' ? '#0f172a' : 'transparent', color: previewTab === 'recruiters' ? '#fff' : '#64748b', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: M.fontBody }}>What Recruiters See</button>
                                <button onClick={() => setPreviewTab('cover-letter')} style={{ flex: 1, padding: 7, borderRadius: 99, border: 'none', background: previewTab === 'cover-letter' ? '#0f172a' : 'transparent', color: previewTab === 'cover-letter' ? '#fff' : '#64748b', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: M.fontBody }}>Cover Letter</button>
                            </div>
                            {previewTab === 'recruiters' ? (
                                <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', background: '#f1f5f9', padding: '8px 6px 16px' }}>
                                    <div style={{ background: '#fff', borderRadius: 6, boxShadow: '0 2px 12px rgba(15,23,42,0.08)', overflow: 'hidden' }}>
                                        <MobilePreviewScaler>
                                            {renderPreviewForTemplate(templateId)}
                                        </MobilePreviewScaler>
                                    </div>
                                </div>
                            ) : (
                                <CoverLetterView controller={coverLetterController} entry={selectedEntry} job={meridianJob} profileState={editorState.profile} compact />
                            )}
                            <div style={{ padding: '10px 14px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8, flexShrink: 0 }}>
                                <button onClick={() => { setShowMobilePreview(false); setShowTemplatePicker(true) }} style={{ flex: 1, padding: 10, border: `1.5px solid ${M.border}`, borderRadius: 9, background: '#fff', fontSize: '12.5px', fontWeight: 600, color: M.textMuted, cursor: 'pointer', fontFamily: M.fontBody }}>Change Template</button>
                                <DownloadPdf state={effectiveState} templateId={templateId} companyName={meridianJob?.company ?? null} compact />
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* ── See all resumes sheet ── */}
            {showAllResumesSheet && (
                <>
                    <div onClick={() => setShowAllResumesSheet(false)} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(3px)' }} />
                    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderRadius: '22px 22px 0 0', boxShadow: '0 -20px 60px rgba(0,0,0,0.2)', zIndex: 55, display: 'flex', flexDirection: 'column', maxHeight: '78vh' }}>
                        <div style={{ width: 36, height: 4, borderRadius: 99, background: M.border, margin: '12px auto 0', flexShrink: 0 }} />
                        <div style={{ padding: '12px 16px 10px', borderBottom: `1px solid ${M.border}`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                            <span style={{ fontSize: 15, fontWeight: 700, color: M.text, flex: 1 }}>All Resumes</span>
                            <span style={{ fontFamily: M.fontMono, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: M.surfaceAlt, color: M.textMuted }}>{visibleSavedResumes.length}</span>
                            <button onClick={() => setShowAllResumesSheet(false)} style={{ width: 27, height: 27, borderRadius: 8, background: M.surfaceAlt, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: M.textMuted }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                            </button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px 32px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {visibleSavedResumes.map(entry => {
                                const isSel = selectedId === entry.id
                                const sc = entry.keyword_alignment_score ?? 0
                                const scNorm = sc > 10 ? Math.round(sc) : Math.round(sc * 10)
                                const date = entry.updated_at ? new Date(entry.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
                                const initial = mInitial(entry.job?.company ?? entry.job?.title ?? '')
                                const bg = mAvatarColor(entry.job?.company ?? '')
                                return (
                                    <div key={entry.id} onClick={() => { loadOptimizedResume(entry); setShowAllResumesSheet(false) }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 11px', borderRadius: 10, border: `1.5px solid ${isSel ? M.accent : M.border}`, background: isSel ? M.surfaceAlt : '#fff', cursor: 'pointer' }}>
                                        <div style={{ width: 36, height: 36, borderRadius: 9, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{initial}</div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: isSel ? M.accent : M.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{entry.job?.title ?? 'Unknown Role'}</div>
                                            <div style={{ fontSize: 11, color: M.textMuted }}>{entry.job?.company ?? ''}{date ? ` · ${date}` : ''}</div>
                                        </div>
                                        <span style={{ fontFamily: M.fontMono, fontSize: 13, fontWeight: 800, color: mScoreColor(scNorm), flexShrink: 0 }}>{scNorm}%</span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </>
            )}
            </>
        )
    }

    return (
        <>
        <style>{`
            @keyframes m-spin { to { transform: rotate(360deg) } }
            @keyframes m-pulse-green { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.75)} }
            @keyframes m-chip-in { from{opacity:0;transform:scale(0.85)} to{opacity:1;transform:scale(1)} }
            #m-editor-scroll input:focus, #m-editor-scroll textarea:focus {
                border-color: ${M.accentMid} !important;
                box-shadow: 0 0 0 3px ${M.accent}25 !important;
                outline: none;
            }
            #m-editor-scroll ::-webkit-scrollbar { width: 5px; height: 5px; }
            #m-editor-scroll ::-webkit-scrollbar-thumb { background: ${M.accentBorder}; border-radius: 3px; }
        `}</style>
        <div style={{
            display: 'flex', flexDirection: 'column',
            height: 'calc(100vh - 64px)',
            background: M.surface,
            fontFamily: M.fontBody,
            overflow: 'hidden',
        }}>
            {/* ── Meridian Top Bar ── */}
            <div style={{
                height: 50, background: M.white, borderBottom: `1px solid ${M.border}`,
                display: 'flex', alignItems: 'center', padding: '0 22px', gap: 14, flexShrink: 0,
            }}>
                {/* Studio title (brand sits in the global nav above) */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={M.accent} strokeWidth="2">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <path d="M14 2v6h6"/><path d="M16 13H8M16 17H8M10 9H8"/>
                </svg>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: M.text, fontFamily: M.fontBody }}>
                    Resume Studio
                </span>
                {meridianJob && (
                    <span style={{
                        fontSize: '0.8rem', color: M.textMuted, fontFamily: M.fontBody,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        maxWidth: 360,
                    }}>
                        · {meridianJob.title} at {meridianJob.company}
                    </span>
                )}

                <div style={{ flex: 1 }} />

                {/* Autosave indicator */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{
                        width: 6, height: 6, borderRadius: '50%', background: M.green,
                        animation: 'm-pulse-green 3s ease-in-out infinite',
                    }} />
                    <span style={{ fontSize: '0.6875rem', color: M.textFaint, fontFamily: M.fontMono }}>Saved</span>
                </div>

                {selectedEntry && meridianScore > 0 && (
                    <>
                        <div style={{ width: 1, height: 18, background: M.border }} />
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '4px 12px', borderRadius: 20,
                            background: meridianScoreBg, border: `1px solid ${meridianScoreColor}33`,
                        }}>
                            <div style={{ width: 5, height: 5, borderRadius: '50%', background: meridianScoreColor }} />
                            <span style={{
                                fontSize: '0.7rem', fontWeight: 700,
                                color: meridianScoreColor, fontFamily: M.fontMono,
                            }}>{meridianScore}% match</span>
                        </div>
                    </>
                )}

                <div style={{ width: 1, height: 18, background: M.border }} />
                <DownloadPdf state={effectiveState} templateId={templateId} companyName={meridianJob?.company ?? null} />
            </div>

            {/* ── Studio body ── */}
            <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

                {/* Sidebar — show whenever the user has any resumes (uploaded or optimized) */}
                {(savedResumes.length > 0 || uploadedResumes.length > 0) && (
                    <MeridianSidebar
                        resumes={visibleSavedResumes}
                        selectedId={selectedId}
                        sourceResume={
                            sourceResumeId
                                ? uploadedResumes.find(r => r.id === sourceResumeId) ?? null
                                : null
                        }
                        onSelect={(id) => {
                            const entry = savedResumes.find(r => r.id === id)
                            if (entry) loadOptimizedResume(entry)
                        }}
                        onOptimizeNew={() => router.push('/dashboard/matches')}
                        uploadedResumes={uploadedResumes}
                        sourceResumeId={sourceResumeId}
                        onSourceChange={handleSourceChange}
                        optimizedCounts={optimizedCountsBySource}
                        collapsed={sidebarCollapsed}
                        onToggleCollapse={toggleSidebarCollapsed}
                    />
                )}

                {/* Editor column */}
                <div style={{
                    width: 500, flexShrink: 0, display: 'flex', flexDirection: 'column',
                    background: M.surface, borderRight: `1px solid ${M.border}`,
                    height: '100%', overflow: 'hidden',
                }}>
                    {/* Tab switcher */}
                    <div style={{ display: 'flex', borderBottom: `1px solid ${M.border}`, background: M.white, flexShrink: 0 }}>
                        {([{ id: 'sections' as const, label: 'Resume Sections' }, { id: 'layout' as const, label: '⇅ Layout' }, { id: 'assistant' as const, label: '✦ Assistant' }]).map(t => (
                            <button key={t.id} onClick={() => setStudioTab(t.id)} style={{
                                flex: 1, padding: '13px 8px', border: 'none', background: 'transparent', cursor: 'pointer',
                                fontSize: '0.875rem', fontWeight: studioTab === t.id ? 700 : 500,
                                color: studioTab === t.id ? M.accent : M.textMuted, fontFamily: M.fontBody,
                                borderBottom: studioTab === t.id ? `2.5px solid ${M.accent}` : '2.5px solid transparent',
                                marginBottom: -1, transition: 'all 0.15s',
                            }}>
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {studioTab === 'sections' && (
                        <>
                            {/* Editor header — progress indicator */}
                            <div style={{
                                flexShrink: 0, padding: '16px 22px 14px',
                                background: M.white, borderBottom: `1px solid ${M.borderLight}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            }}>
                                <span style={{
                                    fontSize: '1.0625rem', fontWeight: 700, color: M.text, fontFamily: M.fontHeading,
                                    letterSpacing: '-0.01em',
                                }}>
                                    Resume Sections
                                </span>
                                <span style={{
                                    fontSize: '0.8125rem', fontWeight: 700, color: M.accent,
                                    background: M.accentLight, padding: '5px 13px', borderRadius: 20,
                                    border: `1px solid ${M.accentBorder}`, fontFamily: M.fontMono,
                                }}>
                                    {completionSections.filter(s => isFilled(s)).length}/{completionSections.length} complete
                                </span>
                            </div>

                            {/* Scrollable editor body — Steps layout */}
                            <div id="m-editor-scroll" style={{ flex: 1, overflowY: 'auto' }}>
                                <StepsLayout
                                    state={editorState}
                                    isFilled={isFilled}
                                    onOpen={setOpenModalSection}
                                />
                            </div>

                            {/* Sticky footer */}
                            <div style={{
                                flexShrink: 0, background: M.white,
                                borderTop: `1px solid ${M.borderLight}`,
                                padding: '8px 16px',
                                display: 'flex', alignItems: 'center', gap: 12,
                            }}>
                                <div style={{
                                    flex: 1, height: 3, borderRadius: 2,
                                    background: M.borderLight, overflow: 'hidden',
                                }}>
                                    <div style={{
                                        height: '100%', width: `${completionPct}%`,
                                        background: M.accent, borderRadius: 2, transition: 'width 0.4s',
                                    }} />
                                </div>
                                <span style={{
                                    fontSize: '0.6875rem', color: M.textFaint,
                                    flexShrink: 0, fontFamily: M.fontMono,
                                }}>
                                    {completionPct === 100 ? 'All sections complete' : `${completionPct}% complete`}
                                </span>
                            </div>
                        </>
                    )}

                    {studioTab === 'layout' && (
                        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                            {layout ? (
                                <LayoutManagerPanel
                                    order={layout.sectionOrder}
                                    hidden={layout.hiddenSections}
                                    onChange={updateLayout}
                                    defaultOrder={templateDefaultOrder}
                                    saveStatus={layoutSaveStatus}
                                    activePresetKey={activePresetKey}
                                    onSelectPreset={selectPreset}
                                    recommendation={visibleRecommendation}
                                    onApplyRecommendation={applyRecommendation}
                                    onDismissRecommendation={() => setRecommendation(null)}
                                    pageTarget={layout.pageTarget}
                                    onPageTargetChange={updatePageTarget}
                                    budget={budget}
                                    budgetFailed={budgetFailed}
                                    optimizer={selectedEntry && (projectNudge || budget?.overBudget) ? (
                                        <>
                                            {projectNudge && (
                                                <ProjectSwapNudgeCard nudge={projectNudge} onSwap={applyProjectSwap} />
                                            )}
                                            {budget?.overBudget && (
                                                <OnePageOptimizerPanel
                                                    suggestions={trimSuggestions}
                                                    onHide={(key) => updateLayout(layout.sectionOrder, [...layout.hiddenSections, key])}
                                                    onTrimWithAI={handleTrimWithAI}
                                                    trimLoading={trimLoading}
                                                />
                                            )}
                                        </>
                                    ) : null}
                                />
                            ) : (
                                <div style={{ padding: '20px 18px', fontSize: '0.8125rem', color: M.textFaint, fontFamily: M.fontBody }}>
                                    Loading layout…
                                </div>
                            )}
                        </div>
                    )}

                    {studioTab === 'assistant' && (
                        <AssistantPanel controller={assistant} />
                    )}
                </div>

                {/* Preview column */}
                <PreviewDecorationsProvider decorations={assistant.decorations}>
                    <MeridianPreviewPanel
                        state={effectiveState}
                        templateId={templateId}
                        onTemplateChange={(t) => {
                            setTemplateId(t)
                            localStorage.setItem('jobscorer-template', t)
                        }}
                        onMoreTemplates={() => setShowTemplatePicker(true)}
                        downloadButton={null}
                        coverLetterController={coverLetterController}
                        entry={selectedEntry}
                        job={meridianJob}
                        profileState={editorState.profile}
                    />
                </PreviewDecorationsProvider>
            </div>
        </div>

        {/* ── Section editor modal (Meridian v2) ── */}
        {openModalSection && (
            <ActiveModal
                key={openModalSection}
                sectionKey={openModalSection}
                state={editorState}
                update={setEditorState}
                onClose={() => setOpenModalSection(null)}
                onSaved={saveManualEdit}
            />
        )}

        {showTemplatePicker && (
            <TemplatePickerModal
                onSelect={handleTemplateSelect}
                onClose={() => setShowTemplatePicker(false)}
            />
        )}

        {trimChanges && (
            <TrimReviewPanel
                changes={trimChanges}
                onApply={applyTrimWithAI}
                onCancel={() => setTrimChanges(null)}
            />
        )}
        {trimError && (
            <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#0F172A', color: '#fff', padding: '10px 18px', borderRadius: 9999, fontSize: 13, zIndex: 500 }}
                 onClick={() => setTrimError(null)}
            >
                {trimError}
            </div>
        )}
        </>
    )
}
