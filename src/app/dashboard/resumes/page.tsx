'use client'

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { OptimizedResumeData, ParsedResume, BeforeAfterRole, SkillsDelta, CareerActionPlan, Resume } from '@/lib/types'
import { fetchAllOptimizedResumes, fetchResumeById, fetchResumes } from '@/lib/api'
import TemplatePickerModal, { type TemplateId } from '@/components/TemplatePickerModal'
import { useAuth } from '@/components/providers/AuthProvider'

interface SavedResumeEntry {
    id: string
    resume_id: string
    job_id: string
    updated_at: string
    optimized_data: OptimizedResumeData
    keyword_alignment_score: number | null
    job: { id: string; title: string; company: string; location: string } | null
}

// ── Meridian Design Tokens ──────────────────────────────────
const M = {
    accent: '#1d6af5',
    accentMid: '#4b8df8',
    accentLight: 'rgba(29,106,245,0.10)',
    accentBorder: 'rgba(29,106,245,0.28)',
    accentTint: 'rgba(29,106,245,0.05)',
    white: '#ffffff',
    surface: '#f5f9ff',
    surfaceAlt: '#edf4ff',
    border: '#cfe2ff',
    borderLight: '#e8f1ff',
    text: '#0f1e40',
    textMid: '#1e3a6e',
    textMuted: '#4a6fa5',
    textFaint: '#8dafd8',
    green: '#16a34a',
    greenLight: '#dcfce7',
    greenBorder: '#a7f3d0',
    amber: '#d97706',
    amberLight: '#fef3c7',
    amberBorder: '#fde68a',
    red: '#dc2626',
    fontHeading: "'Lora', Georgia, serif",
    fontBody: "'DM Sans', 'Inter', sans-serif",
    fontMono: "'JetBrains Mono', monospace",
}

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

// ── Types ────────────────────────────────────────────────────

interface ExperienceEntry {
    company: string
    title: string
    startDate: string
    endDate: string
    location: string
    bullets: string[]
}

interface EducationEntry {
    school: string
    degree: string
    date: string
    gpa: string
    coursework: string
}

interface ProjectEntry {
    name: string
    tech: string
    date: string
    bullets: string[]
}

interface LeadershipEntry {
    org: string
    role: string
    date: string
    bullets: string[]
}

interface ResumeEditorState {
    profile: {
        name: string
        email: string
        phone: string
        location: string
        linkedin: string
        github: string
        portfolio: string
    }
    summary: string
    education: EducationEntry[]
    experience: ExperienceEntry[]
    projects: ProjectEntry[]
    skills: {
        languages: string
        tools: string
        frameworks: string
        soft: string
    }
    leadership: LeadershipEntry[]
    certifications: string[]
    achievements: string[]
}

const EMPTY_STATE: ResumeEditorState = {
    profile: { name: '', email: '', phone: '', location: '', linkedin: '', github: '', portfolio: '' },
    summary: '',
    education: [],
    experience: [],
    projects: [],
    skills: { languages: '', tools: '', frameworks: '', soft: '' },
    leadership: [],
    certifications: [],
    achievements: [],
}

// ── Map OptimizedResumeData + ParsedResume → ResumeEditorState ──
function mapToEditorState(optimized: OptimizedResumeData, original: ParsedResume | null): ResumeEditorState {
    // Priority: optimized.personal_info (injected by n8n) → original structured_data.personal_info → original root fields
    const rawOrig = original as any
    const profile = {
        name: optimized.personal_info?.full_name || rawOrig?.personal_info?.full_name || original?.name || '',
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
    title, subtitle, sectionKey, wide, onClose, onSave, children,
}: {
    title: string; subtitle?: string; sectionKey: string; wide?: boolean
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
            onClick={e => { if (e.target === overlayRef.current) onClose() }}
            style={{
                position: 'fixed', inset: 0, zIndex: 1000,
                background: 'rgba(15,30,64,0.45)', backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
            }}
        >
            <style>{`@keyframes m-modal-in { from { opacity:0; transform:scale(0.96) translateY(8px); } to { opacity:1; transform:scale(1) translateY(0); } }`}</style>
            <div style={{
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 10, background: M.accentTint,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                        }}>
                            <SectionIcon k={sectionKey} filled />
                        </div>
                        <div>
                            <div style={{
                                fontSize: '0.9375rem', fontWeight: 700, color: M.text,
                                fontFamily: M.fontHeading, letterSpacing: '-0.01em',
                            }}>{title}</div>
                            {subtitle && (
                                <div style={{ fontSize: '0.7rem', color: M.textFaint, fontFamily: M.fontBody }}>
                                    {subtitle}
                                </div>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: M.textFaint, padding: 6, borderRadius: 8, display: 'flex',
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
                    display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0,
                }}>
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
    )
}

// ── Active Modal Dispatcher ────────────────────────────────
// Clones state on open; commits on Save.
function ActiveModal({
    sectionKey, state, update, onClose,
}: {
    sectionKey: string
    state: ResumeEditorState
    update: (s: ResumeEditorState) => void
    onClose: () => void
}) {
    // Deep snapshot so Cancel discards changes
    const [local, setLocal] = useState<ResumeEditorState>(() => JSON.parse(JSON.stringify(state)))

    const configs: Record<string, { title: string; subtitle: string; wide?: boolean }> = {
        profile:        { title: 'Edit Profile',         subtitle: 'Personal & contact details' },
        summary:        { title: 'Edit Summary',          subtitle: 'Professional overview' },
        education:      { title: 'Edit Education',        subtitle: 'Degrees & coursework',         wide: true },
        experience:     { title: 'Edit Experience',       subtitle: 'Work history & bullet points', wide: true },
        projects:       { title: 'Edit Projects',         subtitle: 'Personal & academic projects', wide: true },
        skills:         { title: 'Edit Technical Skills', subtitle: 'Languages, tools & frameworks' },
        certifications: { title: 'Edit Certifications',   subtitle: 'Certificates & credentials' },
        achievements:   { title: 'Edit Achievements',     subtitle: 'Awards & recognitions' },
        leadership:     { title: 'Edit Leadership',       subtitle: 'Clubs, orgs & roles',          wide: true },
    }
    const cfg = configs[sectionKey]
    if (!cfg) return null

    const handleSave = () => { update(local); onClose() }

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
            case 'certifications': return <CertificationsSection state={local} update={setLocal} />
            case 'achievements':   return <AchievementsSection state={local} update={setLocal} />
            case 'leadership':     return <LeadershipSection state={local} update={setLocal} />
            default: return null
        }
    })()

    return (
        <SectionModal
            title={cfg.title}
            subtitle={cfg.subtitle}
            sectionKey={sectionKey}
            wide={cfg.wide}
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

            {/* Summary */}
            {summary && (
                <div style={{ marginBottom: '8pt', fontSize: '10pt', lineHeight: 1.45, color: '#111' }}>
                    {summary}
                </div>
            )}

            {/* Education */}
            {education.length > 0 && (
                <section style={{ marginBottom: '8pt' }}>
                    <ClassicSectionHeader title="Education" />
                    {education.map((edu, i) => (
                        <div key={i} style={{ marginBottom: '6pt' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <span style={{ fontWeight: 700 }}>{edu.school || 'University Name'}</span>
                                <span style={{ fontSize: '9.5pt', color: '#333' }}>{edu.date}</span>
                            </div>
                            {edu.degree && (
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
                    ))}
                </section>
            )}

            {/* Experience */}
            {experience.length > 0 && (
                <section style={{ marginBottom: '8pt' }}>
                    <ClassicSectionHeader title="Experience" />
                    {experience.map((exp, i) => (
                        <div key={i} style={{ marginBottom: '8pt' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <span style={{ fontWeight: 700 }}>{exp.company || 'Company Name'}</span>
                                <span style={{ fontSize: '9.5pt', color: '#333' }}>
                                    {[exp.startDate, exp.endDate].filter(Boolean).join(' \u2013 ')}
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontStyle: 'italic' }}>{exp.title}</span>
                                {exp.location && <span style={{ fontSize: '9.5pt', color: '#555' }}>{exp.location}</span>}
                            </div>
                            {exp.bullets.filter(b => b.trim()).length > 0 && (
                                <ul style={{ margin: '3pt 0 0 0', paddingLeft: '16pt', listStyle: 'disc' }}>
                                    {exp.bullets.filter(b => b.trim()).map((b, j) => (
                                        <li key={j} style={{ marginBottom: '2pt', fontSize: '10pt' }}>
                                            <BoldRender text={b} />
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    ))}
                </section>
            )}

            {/* Projects */}
            {projects.length > 0 && (
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
                            {proj.bullets.filter(b => b.trim()).length > 0 && (
                                <ul style={{ margin: '3pt 0 0 0', paddingLeft: '16pt', listStyle: 'disc' }}>
                                    {proj.bullets.filter(b => b.trim()).map((b, j) => (
                                        <li key={j} style={{ marginBottom: '2pt', fontSize: '10pt' }}>
                                            <BoldRender text={b} />
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    ))}
                </section>
            )}

            {/* Technical Skills */}
            {hasSkills && (
                <section style={{ marginBottom: '8pt' }}>
                    <ClassicSectionHeader title="Technical Skills" />
                    <div style={{ fontSize: '10pt' }}>
                        {skills.languages && (
                            <div style={{ marginBottom: '2pt' }}>
                                <span style={{ fontWeight: 700 }}>Languages: </span>{skills.languages}
                            </div>
                        )}
                        {skills.tools && (
                            <div style={{ marginBottom: '2pt' }}>
                                <span style={{ fontWeight: 700 }}>Developer Tools: </span>{skills.tools}
                            </div>
                        )}
                        {skills.frameworks && (
                            <div style={{ marginBottom: '2pt' }}>
                                <span style={{ fontWeight: 700 }}>Technologies/Frameworks: </span>{skills.frameworks}
                            </div>
                        )}
                        {skills.soft && (
                            <div style={{ marginBottom: '2pt' }}>
                                <span style={{ fontWeight: 700 }}>Core Competencies: </span>{skills.soft}
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* Certifications */}
            {certifications.length > 0 && (
                <section style={{ marginBottom: '8pt' }}>
                    <ClassicSectionHeader title="Certifications" />
                    <ul style={{ margin: '3pt 0 0 0', paddingLeft: '16pt', listStyle: 'disc' }}>
                        {certifications.map((cert, i) => (
                            <li key={i} style={{ marginBottom: '2pt', fontSize: '10pt' }}>{cert}</li>
                        ))}
                    </ul>
                </section>
            )}

            {/* Achievements */}
            {achievements.length > 0 && (
                <section style={{ marginBottom: '8pt' }}>
                    <ClassicSectionHeader title="Achievements" />
                    <ul style={{ margin: '3pt 0 0 0', paddingLeft: '16pt', listStyle: 'disc' }}>
                        {achievements.map((ach, i) => (
                            <li key={i} style={{ marginBottom: '2pt', fontSize: '10pt' }}>{ach}</li>
                        ))}
                    </ul>
                </section>
            )}

            {/* Leadership */}
            {leadership.length > 0 && (
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
            )}
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

// ── Rezi Resume Preview (HTML) ────────────────────────────
function ReziResumePreview({ state }: { state: ResumeEditorState }) {
    const { profile, summary, education, experience, projects, skills, certifications, achievements } = state
    const contactParts = [profile.phone, profile.email, profile.location, profile.linkedin, profile.github, profile.portfolio].filter(Boolean)
    const hasSkills = skills.languages || skills.tools || skills.frameworks || skills.soft

    return (
        <div style={{ fontFamily: "'Georgia', 'Times New Roman', serif", fontSize: '10.5pt', lineHeight: 1.5, color: '#1a1a1a', padding: '36pt 48pt', minHeight: '100%', background: '#fff' }}>
            <div style={{ textAlign: 'center', fontSize: '18pt', fontWeight: 700, letterSpacing: '0.02em', marginBottom: '3pt' }}>
                {profile.name || 'Your Name'}
            </div>
            {contactParts.length > 0 && (
                <div style={{ textAlign: 'center', fontSize: '9pt', color: '#555', marginBottom: '6pt', letterSpacing: '0.02em' }}>
                    {contactParts.join(' · ')}
                </div>
            )}
            <hr style={{ border: 'none', borderTop: '0.75px solid #ccc', margin: '4pt 0 12pt' }} />
            {summary && (
                <div style={{ marginBottom: '10pt', fontSize: '10pt', lineHeight: 1.55, color: '#222' }}>{summary}</div>
            )}
            {education.length > 0 && (
                <section style={{ marginBottom: '10pt' }}>
                    <div style={{ fontSize: '9.5pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', borderBottom: '0.5px solid #ccc', paddingBottom: '2pt', marginBottom: '6pt', color: '#222' }}>Education</div>
                    {education.map((edu, i) => (
                        <div key={i} style={{ marginBottom: '5pt' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: 700 }}>{edu.school}</span>
                                <span style={{ fontSize: '9pt', color: '#666', fontStyle: 'italic' }}>{edu.date}</span>
                            </div>
                            {edu.degree && <div style={{ fontStyle: 'italic', fontSize: '9.5pt', color: '#555' }}>{edu.degree}</div>}
                        </div>
                    ))}
                </section>
            )}
            {experience.length > 0 && (
                <section style={{ marginBottom: '10pt' }}>
                    <div style={{ fontSize: '9.5pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', borderBottom: '0.5px solid #ccc', paddingBottom: '2pt', marginBottom: '6pt', color: '#222' }}>Experience</div>
                    {experience.map((exp, i) => (
                        <div key={i} style={{ marginBottom: '8pt' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: 700 }}>{exp.company}</span>
                                <span style={{ fontSize: '9pt', color: '#666', fontStyle: 'italic' }}>{[exp.startDate, exp.endDate].filter(Boolean).join(' – ')}</span>
                            </div>
                            <div style={{ fontStyle: 'italic', fontSize: '9.5pt', color: '#555', marginBottom: '3pt' }}>{exp.title}{exp.location ? ` · ${exp.location}` : ''}</div>
                            {exp.bullets.filter(b => b.trim()).map((b, j) => (
                                <div key={j} style={{ display: 'flex', gap: '6pt', marginBottom: '2pt', fontSize: '10pt' }}>
                                    <span style={{ color: '#888', flexShrink: 0 }}>—</span>
                                    <BoldRender text={b} />
                                </div>
                            ))}
                        </div>
                    ))}
                </section>
            )}
            {projects.length > 0 && (
                <section style={{ marginBottom: '10pt' }}>
                    <div style={{ fontSize: '9.5pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', borderBottom: '0.5px solid #ccc', paddingBottom: '2pt', marginBottom: '6pt', color: '#222' }}>Projects</div>
                    {projects.map((proj, i) => (
                        <div key={i} style={{ marginBottom: '6pt' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: 700 }}>{proj.name}</span>
                                <span style={{ fontSize: '9pt', color: '#666', fontStyle: 'italic' }}>{proj.date}</span>
                            </div>
                            {proj.bullets.filter(b => b.trim()).map((b, j) => (
                                <div key={j} style={{ display: 'flex', gap: '6pt', marginBottom: '2pt', fontSize: '10pt' }}>
                                    <span style={{ color: '#888', flexShrink: 0 }}>—</span>
                                    <BoldRender text={b} />
                                </div>
                            ))}
                        </div>
                    ))}
                </section>
            )}
            {hasSkills && (
                <section style={{ marginBottom: '10pt' }}>
                    <div style={{ fontSize: '9.5pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', borderBottom: '0.5px solid #ccc', paddingBottom: '2pt', marginBottom: '6pt', color: '#222' }}>Technical Skills</div>
                    <div style={{ fontSize: '10pt', lineHeight: 1.8 }}>
                        {skills.languages && <div><span style={{ fontWeight: 700 }}>Languages: </span>{skills.languages}</div>}
                        {skills.tools && <div><span style={{ fontWeight: 700 }}>Tools: </span>{skills.tools}</div>}
                        {skills.frameworks && <div><span style={{ fontWeight: 700 }}>Frameworks: </span>{skills.frameworks}</div>}
                        {skills.soft && <div><span style={{ fontWeight: 700 }}>Core Competencies: </span>{skills.soft}</div>}
                    </div>
                </section>
            )}
            {certifications.length > 0 && (
                <section style={{ marginBottom: '10pt' }}>
                    <div style={{ fontSize: '9.5pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', borderBottom: '0.5px solid #ccc', paddingBottom: '2pt', marginBottom: '6pt', color: '#222' }}>Certifications</div>
                    {certifications.map((cert, i) => (
                        <div key={i} style={{ display: 'flex', gap: '6pt', marginBottom: '2pt', fontSize: '10pt' }}>
                            <span style={{ color: '#888', flexShrink: 0 }}>—</span><span>{cert}</span>
                        </div>
                    ))}
                </section>
            )}
            {achievements.length > 0 && (
                <section style={{ marginBottom: '10pt' }}>
                    <div style={{ fontSize: '9.5pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', borderBottom: '0.5px solid #ccc', paddingBottom: '2pt', marginBottom: '6pt', color: '#222' }}>Achievements</div>
                    {achievements.map((ach, i) => (
                        <div key={i} style={{ display: 'flex', gap: '6pt', marginBottom: '2pt', fontSize: '10pt' }}>
                            <span style={{ color: '#888', flexShrink: 0 }}>—</span><span>{ach}</span>
                        </div>
                    ))}
                </section>
            )}
        </div>
    )
}

// ── Rezi Standard Resume Preview (HTML) ──────────────────
function ReziStandardResumePreview({ state }: { state: ResumeEditorState }) {
    const { profile, summary, education, experience, projects, skills, certifications, achievements } = state
    const contactParts = [profile.phone, profile.email, profile.location, profile.linkedin, profile.github, profile.portfolio].filter(Boolean)
    const hasSkills = skills.languages || skills.tools || skills.frameworks || skills.soft

    const SectionHeader = ({ title }: { title: string }) => (
        <div style={{ fontSize: '9pt', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', borderBottom: '0.5px solid #e2e8f0', paddingBottom: '2pt', marginBottom: '6pt', color: '#374151' }}>{title}</div>
    )

    return (
        <div style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif", fontSize: '10.5pt', lineHeight: 1.4, color: '#111', padding: '36pt 48pt', minHeight: '100%', background: '#fff' }}>
            <div style={{ textAlign: 'center', fontWeight: 300, fontSize: '17pt', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '3pt' }}>
                {profile.name || 'Your Name'}
            </div>
            {contactParts.length > 0 && (
                <div style={{ textAlign: 'center', fontSize: '9pt', color: '#666', marginBottom: '5pt', letterSpacing: '0.03em' }}>
                    {contactParts.join(' · ')}
                </div>
            )}
            <hr style={{ border: 'none', borderTop: '0.5px solid #bbb', margin: '4pt 0 10pt' }} />
            {summary && (
                <div style={{ marginBottom: '10pt', fontSize: '10pt', lineHeight: 1.5, color: '#333' }}>{summary}</div>
            )}
            {education.length > 0 && (
                <section style={{ marginBottom: '10pt' }}>
                    <SectionHeader title="Education" />
                    {education.map((edu, i) => (
                        <div key={i} style={{ marginBottom: '5pt' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: 600 }}>{edu.school}</span>
                                <span style={{ fontSize: '9pt', color: '#888' }}>{edu.date}</span>
                            </div>
                            {edu.degree && <div style={{ fontSize: '9.5pt', color: '#555' }}>{edu.degree}</div>}
                        </div>
                    ))}
                </section>
            )}
            {experience.length > 0 && (
                <section style={{ marginBottom: '10pt' }}>
                    <SectionHeader title="Experience" />
                    {experience.map((exp, i) => (
                        <div key={i} style={{ marginBottom: '8pt' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: 600 }}>{exp.company}</span>
                                <span style={{ fontSize: '9pt', color: '#888' }}>{[exp.startDate, exp.endDate].filter(Boolean).join(' – ')}</span>
                            </div>
                            <div style={{ fontSize: '9.5pt', color: '#666', marginBottom: '3pt' }}>{exp.title}{exp.location ? ` · ${exp.location}` : ''}</div>
                            {exp.bullets.filter(b => b.trim()).map((b, j) => (
                                <div key={j} style={{ display: 'flex', gap: '6pt', marginBottom: '2pt', fontSize: '10pt' }}>
                                    <span style={{ color: '#bbb', flexShrink: 0 }}>–</span>
                                    <BoldRender text={b} />
                                </div>
                            ))}
                        </div>
                    ))}
                </section>
            )}
            {projects.length > 0 && (
                <section style={{ marginBottom: '10pt' }}>
                    <SectionHeader title="Projects" />
                    {projects.map((proj, i) => (
                        <div key={i} style={{ marginBottom: '6pt' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: 600 }}>{proj.name}</span>
                                <span style={{ fontSize: '9pt', color: '#888' }}>{proj.date}</span>
                            </div>
                            {proj.bullets.filter(b => b.trim()).map((b, j) => (
                                <div key={j} style={{ display: 'flex', gap: '6pt', marginBottom: '2pt', fontSize: '10pt' }}>
                                    <span style={{ color: '#bbb', flexShrink: 0 }}>–</span>
                                    <BoldRender text={b} />
                                </div>
                            ))}
                        </div>
                    ))}
                </section>
            )}
            {hasSkills && (
                <section style={{ marginBottom: '10pt' }}>
                    <SectionHeader title="Technical Skills" />
                    <div style={{ fontSize: '10pt', lineHeight: 1.7, color: '#333' }}>
                        {skills.languages && <div><span style={{ fontWeight: 600 }}>Technical: </span>{skills.languages}</div>}
                        {skills.tools && <div><span style={{ fontWeight: 600 }}>Tools: </span>{skills.tools}</div>}
                        {skills.frameworks && <div><span style={{ fontWeight: 600 }}>Frameworks: </span>{skills.frameworks}</div>}
                        {skills.soft && <div><span style={{ fontWeight: 600 }}>Core Competencies: </span>{skills.soft}</div>}
                    </div>
                </section>
            )}
            {certifications.length > 0 && (
                <section style={{ marginBottom: '10pt' }}>
                    <SectionHeader title="Certifications" />
                    {certifications.map((cert, i) => (
                        <div key={i} style={{ display: 'flex', gap: '6pt', marginBottom: '2pt', fontSize: '10pt' }}>
                            <span style={{ color: '#bbb', flexShrink: 0 }}>–</span><span>{cert}</span>
                        </div>
                    ))}
                </section>
            )}
            {achievements.length > 0 && (
                <section style={{ marginBottom: '10pt' }}>
                    <SectionHeader title="Achievements" />
                    {achievements.map((ach, i) => (
                        <div key={i} style={{ display: 'flex', gap: '6pt', marginBottom: '2pt', fontSize: '10pt' }}>
                            <span style={{ color: '#bbb', flexShrink: 0 }}>–</span><span>{ach}</span>
                        </div>
                    ))}
                </section>
            )}
        </div>
    )
}

// ── London Resume Preview (HTML) ──────────────────────────
function LondonResumePreview({ state }: { state: ResumeEditorState }) {
    const { profile, summary, education, experience, projects, skills, certifications, achievements } = state
    const contactParts = [profile.phone, profile.email, profile.location, profile.linkedin, profile.github, profile.portfolio].filter(Boolean)
    const hasSkills = skills.languages || skills.tools || skills.frameworks || skills.soft

    const ExtendingHeader = ({ title }: { title: string }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10pt 0 6pt' }}>
            <div style={{ flex: 1, borderTop: '0.75px solid #aaa' }} />
            <span style={{ fontSize: '10pt', fontStyle: 'italic', fontWeight: 600, color: '#444', whiteSpace: 'nowrap' }}>{title}</span>
            <div style={{ flex: 1, borderTop: '0.75px solid #aaa' }} />
        </div>
    )

    return (
        <div style={{ fontFamily: "'Georgia', 'Times New Roman', serif", fontSize: '10.5pt', lineHeight: 1.45, color: '#1a1a1a', padding: '36pt 48pt', minHeight: '100%', background: '#fff' }}>
            <div style={{ textAlign: 'center', fontSize: '19pt', fontWeight: 700, fontStyle: 'italic', letterSpacing: '0.01em', marginBottom: '2pt' }}>
                {profile.name || 'Your Name'}
            </div>
            {contactParts.length > 0 && (
                <div style={{ textAlign: 'center', fontSize: '9pt', color: '#777', fontStyle: 'italic', marginBottom: '4pt' }}>
                    {contactParts.join(' · ')}
                </div>
            )}
            {summary && (
                <>
                    <ExtendingHeader title="Profile" />
                    <div style={{ fontSize: '10pt', lineHeight: 1.55, color: '#333' }}>{summary}</div>
                </>
            )}
            {education.length > 0 && (
                <section>
                    <ExtendingHeader title="Education" />
                    {education.map((edu, i) => (
                        <div key={i} style={{ marginBottom: '5pt' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: 700 }}>{edu.school}</span>
                                <span style={{ fontSize: '9pt', color: '#777', fontStyle: 'italic' }}>{edu.date}</span>
                            </div>
                            {edu.degree && <div style={{ fontStyle: 'italic', fontSize: '9.5pt', color: '#666' }}>{edu.degree}</div>}
                        </div>
                    ))}
                </section>
            )}
            {experience.length > 0 && (
                <section>
                    <ExtendingHeader title="Experience" />
                    {experience.map((exp, i) => (
                        <div key={i} style={{ marginBottom: '8pt' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: 700 }}>{exp.company}</span>
                                <span style={{ fontSize: '9pt', color: '#777', fontStyle: 'italic' }}>{[exp.startDate, exp.endDate].filter(Boolean).join(' – ')}</span>
                            </div>
                            <div style={{ fontStyle: 'italic', fontSize: '9.5pt', color: '#666', marginBottom: '3pt' }}>{exp.title}{exp.location ? ` · ${exp.location}` : ''}</div>
                            {exp.bullets.filter(b => b.trim()).map((b, j) => (
                                <div key={j} style={{ display: 'flex', gap: '6pt', marginBottom: '2pt', fontSize: '10pt' }}>
                                    <span style={{ color: '#bbb', fontStyle: 'italic', flexShrink: 0 }}>·</span>
                                    <BoldRender text={b} />
                                </div>
                            ))}
                        </div>
                    ))}
                </section>
            )}
            {projects.length > 0 && (
                <section>
                    <ExtendingHeader title="Projects" />
                    {projects.map((proj, i) => (
                        <div key={i} style={{ marginBottom: '6pt' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: 700 }}>{proj.name}</span>
                                <span style={{ fontSize: '9pt', color: '#777', fontStyle: 'italic' }}>{proj.date}</span>
                            </div>
                            {proj.bullets.filter(b => b.trim()).map((b, j) => (
                                <div key={j} style={{ display: 'flex', gap: '6pt', marginBottom: '2pt', fontSize: '10pt' }}>
                                    <span style={{ color: '#bbb', fontStyle: 'italic', flexShrink: 0 }}>·</span>
                                    <BoldRender text={b} />
                                </div>
                            ))}
                        </div>
                    ))}
                </section>
            )}
            {hasSkills && (
                <section>
                    <ExtendingHeader title="Skills" />
                    <div style={{ fontSize: '10pt', lineHeight: 1.7, color: '#444' }}>
                        {skills.languages && <div><span style={{ fontWeight: 700 }}>Technical: </span>{skills.languages}</div>}
                        {skills.tools && <div><span style={{ fontWeight: 700 }}>Tools: </span>{skills.tools}</div>}
                        {skills.frameworks && <div><span style={{ fontWeight: 700 }}>Frameworks: </span>{skills.frameworks}</div>}
                        {skills.soft && <div><span style={{ fontWeight: 700 }}>Core Competencies: </span>{skills.soft}</div>}
                    </div>
                </section>
            )}
            {certifications.length > 0 && (
                <section>
                    <ExtendingHeader title="Certifications" />
                    {certifications.map((cert, i) => (
                        <div key={i} style={{ display: 'flex', gap: '6pt', marginBottom: '2pt', fontSize: '10pt' }}>
                            <span style={{ color: '#bbb', fontStyle: 'italic', flexShrink: 0 }}>·</span><span>{cert}</span>
                        </div>
                    ))}
                </section>
            )}
            {achievements.length > 0 && (
                <section>
                    <ExtendingHeader title="Achievements" />
                    {achievements.map((ach, i) => (
                        <div key={i} style={{ display: 'flex', gap: '6pt', marginBottom: '2pt', fontSize: '10pt' }}>
                            <span style={{ color: '#bbb', fontStyle: 'italic', flexShrink: 0 }}>·</span><span>{ach}</span>
                        </div>
                    ))}
                </section>
            )}
        </div>
    )
}

// ── Stitch Resume Preview (HTML) ──────────────────────────
function StitchResumePreview({ state }: { state: ResumeEditorState }) {
    const { profile, summary, education, experience, projects, skills, certifications, achievements, leadership } = state
    const contactParts = [profile.phone, profile.email, profile.location, profile.linkedin, profile.github, profile.portfolio].filter(Boolean)
    const hasSkills = skills.languages || skills.tools || skills.frameworks || skills.soft
    const NAVY = '#1e3a5f'

    const SectionHead = ({ title }: { title: string }) => (
        <div style={{ marginTop: '12pt', marginBottom: '5pt' }}>
            <div style={{ fontSize: '8.5pt', fontWeight: 700, letterSpacing: '1.5pt', textTransform: 'uppercase' as const, color: NAVY, paddingBottom: '2pt', borderBottom: `0.75px solid ${NAVY}` }}>
                {title}
            </div>
        </div>
    )

    return (
        <div style={{ fontFamily: "'Georgia', 'Times New Roman', serif", fontSize: '10pt', lineHeight: 1.5, color: '#222', padding: '36pt 48pt', minHeight: '100%', background: '#fff' }}>
            <div style={{ textAlign: 'center', fontSize: '20pt', fontWeight: 400, color: NAVY, letterSpacing: '0.5pt', marginBottom: '4pt' }}>
                {profile.name || 'Your Name'}
            </div>
            {contactParts.length > 0 && (
                <div style={{ textAlign: 'center', fontSize: '8.5pt', color: '#555', marginBottom: '4pt' }}>
                    {contactParts.join('  |  ')}
                </div>
            )}
            <div style={{ borderTop: `1px solid ${NAVY}`, marginBottom: '2pt' }} />
            {summary && (
                <div style={{ fontSize: '9.5pt', lineHeight: 1.55, color: '#333', fontStyle: 'italic', marginTop: '8pt' }}>{summary}</div>
            )}
            {education.length > 0 && (
                <section>
                    <SectionHead title="Education" />
                    {education.map((edu, i) => (
                        <div key={i} style={{ marginBottom: '6pt' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: 700 }}>{edu.school}</span>
                                <span style={{ fontSize: '8.5pt', color: '#666' }}>{edu.date}</span>
                            </div>
                            {edu.degree && <div style={{ fontStyle: 'italic', fontSize: '9.5pt', color: '#555' }}>{edu.degree}{edu.gpa ? `  —  GPA: ${edu.gpa}` : ''}</div>}
                            {edu.coursework && <div style={{ fontSize: '9pt', color: '#444' }}><strong>Relevant Coursework: </strong>{edu.coursework}</div>}
                        </div>
                    ))}
                </section>
            )}
            {experience.length > 0 && (
                <section>
                    <SectionHead title="Experience" />
                    {experience.map((exp, i) => (
                        <div key={i} style={{ marginBottom: '8pt' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: 700 }}>{exp.company}</span>
                                <span style={{ fontSize: '8.5pt', color: '#666' }}>{[exp.startDate, exp.endDate].filter(Boolean).join(' – ')}</span>
                            </div>
                            <div style={{ fontStyle: 'italic', fontSize: '9.5pt', color: '#555', marginBottom: '3pt' }}>{exp.title}{exp.location ? ` · ${exp.location}` : ''}</div>
                            {exp.bullets.filter(b => b.trim()).map((b, j) => (
                                <div key={j} style={{ display: 'flex', gap: '4pt', marginBottom: '2pt', fontSize: '9.5pt' }}>
                                    <span style={{ color: NAVY, flexShrink: 0, fontWeight: 700 }}>—</span>
                                    <BoldRender text={b} />
                                </div>
                            ))}
                        </div>
                    ))}
                </section>
            )}
            {projects.length > 0 && (
                <section>
                    <SectionHead title="Projects" />
                    {projects.map((proj, i) => (
                        <div key={i} style={{ marginBottom: '6pt' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: 700 }}>{proj.name}{proj.tech ? <span style={{ fontWeight: 400, fontStyle: 'italic', color: '#666' }}>{'  |  '}{proj.tech}</span> : ''}</span>
                                <span style={{ fontSize: '8.5pt', color: '#666' }}>{proj.date}</span>
                            </div>
                            {proj.bullets.filter(b => b.trim()).map((b, j) => (
                                <div key={j} style={{ display: 'flex', gap: '4pt', marginBottom: '2pt', fontSize: '9.5pt' }}>
                                    <span style={{ color: NAVY, flexShrink: 0, fontWeight: 700 }}>—</span>
                                    <BoldRender text={b} />
                                </div>
                            ))}
                        </div>
                    ))}
                </section>
            )}
            {hasSkills && (
                <section>
                    <SectionHead title="Skills" />
                    <div style={{ fontSize: '9.5pt', lineHeight: 1.6, color: '#333' }}>
                        {skills.languages && <div><span style={{ fontWeight: 700, color: NAVY }}>Technical: </span>{skills.languages}</div>}
                        {skills.tools && <div><span style={{ fontWeight: 700, color: NAVY }}>Tools: </span>{skills.tools}</div>}
                        {skills.frameworks && <div><span style={{ fontWeight: 700, color: NAVY }}>Frameworks: </span>{skills.frameworks}</div>}
                        {skills.soft && <div><span style={{ fontWeight: 700, color: NAVY }}>Core Competencies: </span>{skills.soft}</div>}
                    </div>
                </section>
            )}
            {certifications.length > 0 && (
                <section>
                    <SectionHead title="Certifications" />
                    {certifications.map((cert, i) => (
                        <div key={i} style={{ display: 'flex', gap: '4pt', marginBottom: '2pt', fontSize: '9.5pt' }}>
                            <span style={{ color: NAVY, flexShrink: 0, fontWeight: 700 }}>—</span><span>{cert}</span>
                        </div>
                    ))}
                </section>
            )}
            {achievements.length > 0 && (
                <section>
                    <SectionHead title="Achievements" />
                    {achievements.map((ach, i) => (
                        <div key={i} style={{ display: 'flex', gap: '4pt', marginBottom: '2pt', fontSize: '9.5pt' }}>
                            <span style={{ color: NAVY, flexShrink: 0, fontWeight: 700 }}>—</span><span>{ach}</span>
                        </div>
                    ))}
                </section>
            )}
            {leadership.length > 0 && (
                <section>
                    <SectionHead title="Leadership" />
                    {leadership.map((lead, i) => (
                        <div key={i} style={{ marginBottom: '6pt' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: 700 }}>{lead.org}</span>
                                <span style={{ fontSize: '8.5pt', color: '#666' }}>{lead.date}</span>
                            </div>
                            {lead.role && <div style={{ fontStyle: 'italic', fontSize: '9.5pt', color: '#555' }}>{lead.role}</div>}
                            {lead.bullets.filter(b => b.trim()).map((b, j) => (
                                <div key={j} style={{ display: 'flex', gap: '4pt', marginBottom: '2pt', fontSize: '9.5pt' }}>
                                    <span style={{ color: NAVY, flexShrink: 0, fontWeight: 700 }}>—</span>
                                    <BoldRender text={b} />
                                </div>
                            ))}
                        </div>
                    ))}
                </section>
            )}
        </div>
    )
}

// ── Harvard Resume Preview (HTML) ─────────────────────────
function HarvardResumePreview({ state }: { state: ResumeEditorState }) {
    const { profile, summary, education, experience, projects, skills, leadership, certifications, achievements } = state
    const contactParts = [profile.phone, profile.email, profile.location, profile.linkedin, profile.github, profile.portfolio].filter(Boolean)
    const hasSkills = skills.languages || skills.tools || skills.frameworks || skills.soft

    const SectionHead = ({ title }: { title: string }) => (
        <div style={{ marginTop: '12pt', marginBottom: '5pt' }}>
            <span style={{ fontSize: '10.5pt', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, textDecoration: 'underline' }}>{title}</span>
        </div>
    )

    return (
        <div style={{ fontFamily: "'Georgia', 'Merriweather', 'Times New Roman', serif", fontSize: '10.5pt', lineHeight: 1.4, color: '#000', padding: '42pt 54pt', minHeight: '100%', background: '#fff' }}>
            <div style={{ textAlign: 'center', fontSize: '18pt', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '3pt' }}>
                {profile.name || 'Your Name'}
            </div>
            {contactParts.length > 0 && (
                <div style={{ textAlign: 'center', fontSize: '9.5pt', color: '#222', fontStyle: 'italic', marginBottom: '4pt' }}>
                    {contactParts.join('  ·  ')}
                </div>
            )}
            <hr style={{ border: 'none', borderTop: '0.75px solid #000', margin: '6pt 0 2pt' }} />
            {summary && (
                <div style={{ marginTop: '8pt', fontSize: '10pt', lineHeight: 1.5 }}>{summary}</div>
            )}
            {education.length > 0 && (
                <section>
                    <SectionHead title="Education" />
                    {education.map((edu, i) => (
                        <div key={i} style={{ marginBottom: '6pt' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <span style={{ fontWeight: 700 }}>{edu.school || 'University'}</span>
                                <span style={{ fontSize: '10pt', color: '#222', fontStyle: 'italic' }}>{edu.date}</span>
                            </div>
                            {edu.degree && (
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
                    ))}
                </section>
            )}
            {experience.length > 0 && (
                <section>
                    <SectionHead title="Experience" />
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
                            {exp.bullets.filter(b => b.trim()).length > 0 && (
                                <ul style={{ margin: '3pt 0 0 0', paddingLeft: '16pt', listStyle: 'disc' }}>
                                    {exp.bullets.filter(b => b.trim()).map((b, j) => (
                                        <li key={j} style={{ marginBottom: '2pt', fontSize: '10pt', lineHeight: 1.4 }}>
                                            <BoldRender text={b} />
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    ))}
                </section>
            )}
            {projects.length > 0 && (
                <section>
                    <SectionHead title="Projects" />
                    {projects.map((proj, i) => (
                        <div key={i} style={{ marginBottom: '6pt' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <span style={{ fontWeight: 700 }}>
                                    {proj.name}{proj.tech ? <span style={{ fontWeight: 400, fontStyle: 'italic' }}>{'  —  '}{proj.tech}</span> : ''}
                                </span>
                                <span style={{ fontSize: '10pt', color: '#222', fontStyle: 'italic' }}>{proj.date}</span>
                            </div>
                            {proj.bullets.filter(b => b.trim()).length > 0 && (
                                <ul style={{ margin: '3pt 0 0 0', paddingLeft: '16pt', listStyle: 'disc' }}>
                                    {proj.bullets.filter(b => b.trim()).map((b, j) => (
                                        <li key={j} style={{ marginBottom: '2pt', fontSize: '10pt', lineHeight: 1.4 }}>
                                            <BoldRender text={b} />
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    ))}
                </section>
            )}
            {leadership.length > 0 && (
                <section>
                    <SectionHead title="Leadership & Activities" />
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
            )}
            {hasSkills && (
                <section>
                    <SectionHead title="Skills & Interests" />
                    <div style={{ fontSize: '10pt', lineHeight: 1.5 }}>
                        {skills.languages && <div><span style={{ fontWeight: 700 }}>Technical: </span>{skills.languages}</div>}
                        {skills.tools && <div><span style={{ fontWeight: 700 }}>Tools: </span>{skills.tools}</div>}
                        {skills.frameworks && <div><span style={{ fontWeight: 700 }}>Frameworks: </span>{skills.frameworks}</div>}
                        {skills.soft && <div><span style={{ fontWeight: 700 }}>Interests: </span>{skills.soft}</div>}
                    </div>
                </section>
            )}
            {certifications.length > 0 && (
                <section>
                    <SectionHead title="Certifications" />
                    <ul style={{ margin: '3pt 0 0 0', paddingLeft: '16pt', listStyle: 'disc' }}>
                        {certifications.map((c, i) => (<li key={i} style={{ marginBottom: '2pt', fontSize: '10pt' }}>{c}</li>))}
                    </ul>
                </section>
            )}
            {achievements.length > 0 && (
                <section>
                    <SectionHead title="Honors & Awards" />
                    <ul style={{ margin: '3pt 0 0 0', paddingLeft: '16pt', listStyle: 'disc' }}>
                        {achievements.map((a, i) => (<li key={i} style={{ marginBottom: '2pt', fontSize: '10pt' }}>{a}</li>))}
                    </ul>
                </section>
            )}
        </div>
    )
}

// ── sb2nov Resume Preview (HTML) ──────────────────────────
function Sb2novResumePreview({ state }: { state: ResumeEditorState }) {
    const { profile, summary, education, experience, projects, skills, leadership, certifications, achievements } = state
    const contactParts = [profile.phone, profile.email, profile.linkedin, profile.github, profile.location, profile.portfolio].filter(Boolean)
    const hasSkills = skills.languages || skills.tools || skills.frameworks || skills.soft

    const SectionHead = ({ title }: { title: string }) => (
        <div style={{ marginTop: '10pt', marginBottom: '3pt' }}>
            <div style={{ fontSize: '11pt', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, borderBottom: '0.6px solid #000', paddingBottom: '1pt' }}>{title}</div>
        </div>
    )

    return (
        <div style={{ fontFamily: "'Lora', 'Georgia', serif", fontSize: '10.5pt', lineHeight: 1.4, color: '#000', padding: '36pt 48pt', minHeight: '100%', background: '#fff' }}>
            <div style={{ textAlign: 'center', fontSize: '22pt', fontWeight: 700, letterSpacing: '0.04em', lineHeight: 1.15 }}>
                {profile.name || 'Your Name'}
            </div>
            {contactParts.length > 0 && (
                <div style={{ textAlign: 'center', fontSize: '9.5pt', color: '#222', marginTop: '4pt' }}>
                    {contactParts.join('  |  ')}
                </div>
            )}
            {summary && (
                <div style={{ marginTop: '6pt', fontSize: '10pt', lineHeight: 1.45 }}>{summary}</div>
            )}
            {education.length > 0 && (
                <section>
                    <SectionHead title="Education" />
                    {education.map((edu, i) => (
                        <div key={i} style={{ marginBottom: '5pt' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: 700 }}>{edu.school || 'University'}</span>
                                <span style={{ fontSize: '10pt', color: '#222' }}>{edu.date}</span>
                            </div>
                            {edu.degree && <div style={{ fontStyle: 'italic', fontSize: '10pt' }}>{edu.degree}{edu.gpa ? `  —  GPA: ${edu.gpa}` : ''}</div>}
                            {edu.coursework && <div style={{ fontSize: '9.5pt', marginTop: '1pt' }}><span style={{ fontWeight: 700 }}>Coursework: </span>{edu.coursework}</div>}
                        </div>
                    ))}
                </section>
            )}
            {experience.length > 0 && (
                <section>
                    <SectionHead title="Experience" />
                    {experience.map((exp, i) => (
                        <div key={i} style={{ marginBottom: '7pt' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: 700 }}>{exp.company || 'Company'}</span>
                                <span style={{ fontSize: '10pt', color: '#222' }}>{[exp.startDate, exp.endDate].filter(Boolean).join(' – ')}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontStyle: 'italic', fontSize: '10pt' }}>{exp.title}</span>
                                {exp.location && <span style={{ fontStyle: 'italic', fontSize: '10pt', color: '#333' }}>{exp.location}</span>}
                            </div>
                            {exp.bullets.filter(b => b.trim()).length > 0 && (
                                <ul style={{ margin: '3pt 0 0 0', paddingLeft: '18pt', listStyle: 'none' }}>
                                    {exp.bullets.filter(b => b.trim()).map((b, j) => (
                                        <li key={j} style={{ marginBottom: '1.5pt', fontSize: '10pt', lineHeight: 1.4, position: 'relative' as const }}>
                                            <span style={{ position: 'absolute' as const, left: '-12pt' }}>◦</span>
                                            <BoldRender text={b} />
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    ))}
                </section>
            )}
            {projects.length > 0 && (
                <section>
                    <SectionHead title="Projects" />
                    {projects.map((proj, i) => (
                        <div key={i} style={{ marginBottom: '5pt' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: 700 }}>
                                    {proj.name}{proj.tech ? <span style={{ fontWeight: 400, fontStyle: 'italic' }}>{' | '}{proj.tech}</span> : ''}
                                </span>
                                <span style={{ fontSize: '10pt', color: '#222' }}>{proj.date}</span>
                            </div>
                            {proj.bullets.filter(b => b.trim()).length > 0 && (
                                <ul style={{ margin: '3pt 0 0 0', paddingLeft: '18pt', listStyle: 'none' }}>
                                    {proj.bullets.filter(b => b.trim()).map((b, j) => (
                                        <li key={j} style={{ marginBottom: '1.5pt', fontSize: '10pt', lineHeight: 1.4, position: 'relative' as const }}>
                                            <span style={{ position: 'absolute' as const, left: '-12pt' }}>◦</span>
                                            <BoldRender text={b} />
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    ))}
                </section>
            )}
            {hasSkills && (
                <section>
                    <SectionHead title="Technical Skills" />
                    <div style={{ fontSize: '10pt', lineHeight: 1.5 }}>
                        {skills.languages && <div><span style={{ fontWeight: 700 }}>Languages: </span>{skills.languages}</div>}
                        {skills.frameworks && <div><span style={{ fontWeight: 700 }}>Frameworks: </span>{skills.frameworks}</div>}
                        {skills.tools && <div><span style={{ fontWeight: 700 }}>Tools: </span>{skills.tools}</div>}
                        {skills.soft && <div><span style={{ fontWeight: 700 }}>Other: </span>{skills.soft}</div>}
                    </div>
                </section>
            )}
            {leadership.length > 0 && (
                <section>
                    <SectionHead title="Leadership" />
                    {leadership.map((lead, i) => (
                        <div key={i} style={{ marginBottom: '5pt' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: 700 }}>{lead.org}</span>
                                <span style={{ fontSize: '10pt', color: '#222' }}>{lead.date}</span>
                            </div>
                            {lead.role && <div style={{ fontStyle: 'italic', fontSize: '10pt' }}>{lead.role}</div>}
                            {lead.bullets.filter(b => b.trim()).length > 0 && (
                                <ul style={{ margin: '3pt 0 0 0', paddingLeft: '18pt', listStyle: 'none' }}>
                                    {lead.bullets.filter(b => b.trim()).map((b, j) => (
                                        <li key={j} style={{ marginBottom: '1.5pt', fontSize: '10pt', position: 'relative' as const }}>
                                            <span style={{ position: 'absolute' as const, left: '-12pt' }}>◦</span>{b}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    ))}
                </section>
            )}
            {certifications.length > 0 && (
                <section>
                    <SectionHead title="Certifications" />
                    <ul style={{ margin: '3pt 0 0 0', paddingLeft: '18pt', listStyle: 'none' }}>
                        {certifications.map((c, i) => (
                            <li key={i} style={{ marginBottom: '1.5pt', fontSize: '10pt', position: 'relative' as const }}>
                                <span style={{ position: 'absolute' as const, left: '-12pt' }}>◦</span>{c}
                            </li>
                        ))}
                    </ul>
                </section>
            )}
            {achievements.length > 0 && (
                <section>
                    <SectionHead title="Honors & Awards" />
                    <ul style={{ margin: '3pt 0 0 0', paddingLeft: '18pt', listStyle: 'none' }}>
                        {achievements.map((a, i) => (
                            <li key={i} style={{ marginBottom: '1.5pt', fontSize: '10pt', position: 'relative' as const }}>
                                <span style={{ position: 'absolute' as const, left: '-12pt' }}>◦</span>{a}
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    )
}

// ── Open Resume Preview (HTML) ────────────────────────────
function OpenResumePreview({ state }: { state: ResumeEditorState }) {
    const { profile, summary, education, experience, projects, skills, leadership, certifications, achievements } = state
    const contactParts = [profile.email, profile.phone, profile.location, profile.linkedin, profile.github, profile.portfolio].filter(Boolean)
    const hasSkills = skills.languages || skills.tools || skills.frameworks || skills.soft
    const ACCENT = '#38bdf8'
    const TEXT = '#171717'

    const SectionHead = ({ title }: { title: string }) => (
        <div style={{ display: 'flex', alignItems: 'center', marginTop: '14pt', marginBottom: '6pt' }}>
            <div style={{ width: '26pt', height: '3.5pt', background: ACCENT, marginRight: '8pt' }} />
            <span style={{ fontSize: '11pt', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' as const, color: TEXT }}>{title}</span>
        </div>
    )

    return (
        <div style={{ fontFamily: "'Roboto', 'Helvetica Neue', Arial, sans-serif", fontSize: '10.5pt', lineHeight: 1.4, color: TEXT, background: '#fff', minHeight: '100%' }}>
            <div style={{ width: '100%', height: '12pt', background: ACCENT }} />
            <div style={{ padding: '32pt 40pt' }}>
                <div style={{ fontSize: '22pt', fontWeight: 700, color: ACCENT, lineHeight: 1.15 }}>
                    {profile.name || 'Your Name'}
                </div>
                {summary && (
                    <div style={{ marginTop: '4pt', fontSize: '10pt', lineHeight: 1.45 }}>{summary}</div>
                )}
                {contactParts.length > 0 && (
                    <div style={{ fontSize: '9.5pt', color: '#404040', marginTop: '4pt' }}>
                        {contactParts.join('   ·   ')}
                    </div>
                )}
                {experience.length > 0 && (
                    <section>
                        <SectionHead title="Work Experience" />
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
                                {exp.bullets.filter(b => b.trim()).length > 0 && (
                                    <ul style={{ margin: '3pt 0 0 0', paddingLeft: '16pt', listStyle: 'disc' }}>
                                        {exp.bullets.filter(b => b.trim()).map((b, j) => (
                                            <li key={j} style={{ marginBottom: '2pt', fontSize: '10pt', lineHeight: 1.4 }}>
                                                <BoldRender text={b} />
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        ))}
                    </section>
                )}
                {education.length > 0 && (
                    <section>
                        <SectionHead title="Education" />
                        {education.map((edu, i) => (
                            <div key={i} style={{ marginBottom: '5pt' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                    <span style={{ fontWeight: 700 }}>{edu.school || 'University'}</span>
                                    <span style={{ fontSize: '10pt', color: '#404040' }}>{edu.date}</span>
                                </div>
                                {edu.degree && (
                                    <div style={{ fontSize: '10pt', marginTop: '1pt' }}>{edu.degree}{edu.gpa ? `  —  GPA: ${edu.gpa}` : ''}</div>
                                )}
                                {edu.coursework && (
                                    <div style={{ fontSize: '9.5pt', color: '#404040', marginTop: '1pt' }}>
                                        <span style={{ fontWeight: 700 }}>Coursework: </span>{edu.coursework}
                                    </div>
                                )}
                            </div>
                        ))}
                    </section>
                )}
                {projects.length > 0 && (
                    <section>
                        <SectionHead title="Projects" />
                        {projects.map((proj, i) => (
                            <div key={i} style={{ marginBottom: '5pt' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                    <span style={{ fontWeight: 700 }}>
                                        {proj.name}{proj.tech ? <span style={{ fontWeight: 400, color: '#525252' }}>{'  —  '}{proj.tech}</span> : ''}
                                    </span>
                                    <span style={{ fontSize: '10pt', color: '#404040' }}>{proj.date}</span>
                                </div>
                                {proj.bullets.filter(b => b.trim()).length > 0 && (
                                    <ul style={{ margin: '3pt 0 0 0', paddingLeft: '16pt', listStyle: 'disc' }}>
                                        {proj.bullets.filter(b => b.trim()).map((b, j) => (
                                            <li key={j} style={{ marginBottom: '2pt', fontSize: '10pt', lineHeight: 1.4 }}>
                                                <BoldRender text={b} />
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        ))}
                    </section>
                )}
                {hasSkills && (
                    <section>
                        <SectionHead title="Skills" />
                        <div style={{ fontSize: '10pt', lineHeight: 1.5 }}>
                            {skills.languages && <div><span style={{ fontWeight: 700 }}>Languages: </span>{skills.languages}</div>}
                            {skills.frameworks && <div><span style={{ fontWeight: 700 }}>Frameworks: </span>{skills.frameworks}</div>}
                            {skills.tools && <div><span style={{ fontWeight: 700 }}>Tools: </span>{skills.tools}</div>}
                            {skills.soft && <div><span style={{ fontWeight: 700 }}>Other: </span>{skills.soft}</div>}
                        </div>
                    </section>
                )}
                {leadership.length > 0 && (
                    <section>
                        <SectionHead title="Leadership" />
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
                )}
                {certifications.length > 0 && (
                    <section>
                        <SectionHead title="Certifications" />
                        <ul style={{ margin: '3pt 0 0 0', paddingLeft: '16pt', listStyle: 'disc' }}>
                            {certifications.map((c, i) => (<li key={i} style={{ marginBottom: '2pt', fontSize: '10pt' }}>{c}</li>))}
                        </ul>
                    </section>
                )}
                {achievements.length > 0 && (
                    <section>
                        <SectionHead title="Achievements" />
                        <ul style={{ margin: '3pt 0 0 0', paddingLeft: '16pt', listStyle: 'disc' }}>
                            {achievements.map((a, i) => (<li key={i} style={{ marginBottom: '2pt', fontSize: '10pt' }}>{a}</li>))}
                        </ul>
                    </section>
                )}
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
function LeadershipSection({ state, update }: { state: ResumeEditorState; update: (s: ResumeEditorState) => void }) {
    const entries = state.leadership
    const setEntries = (e: LeadershipEntry[]) => update({ ...state, leadership: e })

    const addEntry = () => setEntries([...entries, { org: '', role: '', date: '', bullets: [] }])
    const removeEntry = (i: number) => setEntries(entries.filter((_, idx) => idx !== i))
    const updateEntry = (i: number, patch: Partial<LeadershipEntry>) => {
        const next = [...entries]
        next[i] = { ...next[i], ...patch }
        setEntries(next)
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
function CertificationsSection({ state, update }: { state: ResumeEditorState; update: (s: ResumeEditorState) => void }) {
    const certs = state.certifications
    const setCerts = (c: string[]) => update({ ...state, certifications: c })

    const add = () => setCerts([...certs, ''])
    const remove = (i: number) => setCerts(certs.filter((_, idx) => idx !== i))
    const change = (i: number, v: string) => {
        const next = [...certs]
        next[i] = v
        setCerts(next)
    }

    return (
        <div>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
                padding: '6px 10px', borderRadius: 6,
                background: 'rgba(19,91,236,0.08)',
                border: '1px solid rgba(19,91,236,0.15)',
            }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7aa3f5" strokeWidth="2">
                    <circle cx="12" cy="8" r="7"/><path d="M8.21 13.89L7 23l5-3 5 3-1.21-9.12"/>
                </svg>
                <span style={{ fontSize: '0.6875rem', color: '#7aa3f5', fontFamily: "var(--font-mono, monospace)" }}>
                    Format: Name | Issuer | Date
                </span>
            </div>
            {certs.map((cert, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
                    <div style={{
                        width: 5, height: 5, borderRadius: '50%',
                        background: T.primary, flexShrink: 0,
                    }} />
                    <input
                        type="text"
                        value={cert}
                        onChange={e => change(i, e.target.value)}
                        placeholder="AWS Solutions Architect | Amazon | 2024"
                        style={{ ...inputStyle, flex: 1 }}
                    />
                    <button onClick={() => remove(i)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px', flexShrink: 0 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                </div>
            ))}
            <button onClick={add} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 6, background: 'transparent', border: `1px dashed ${T.editorBorder}`, color: T.editorTextMuted, cursor: 'pointer', fontSize: '0.8125rem', width: '100%', justifyContent: 'center', marginTop: 4 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                Add Certification
            </button>
        </div>
    )
}

// ── Section: Achievements ────────────────────────────────────
function AchievementsSection({ state, update }: { state: ResumeEditorState; update: (s: ResumeEditorState) => void }) {
    const achievements = state.achievements
    const setAch = (a: string[]) => update({ ...state, achievements: a })

    const add = () => setAch([...achievements, ''])
    const remove = (i: number) => setAch(achievements.filter((_, idx) => idx !== i))
    const change = (i: number, v: string) => {
        const next = [...achievements]
        next[i] = v
        setAch(next)
    }

    return (
        <div>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
                padding: '6px 10px', borderRadius: 6,
                background: 'rgba(100,16,213,0.08)',
                border: '1px solid rgba(100,16,213,0.18)',
            }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
                <span style={{ fontSize: '0.6875rem', color: '#a78bfa', fontFamily: "var(--font-mono, monospace)" }}>
                    Quantify impact when possible — e.g. "Increased X by 40%"
                </span>
            </div>
            {achievements.map((ach, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
                    <div style={{
                        width: 5, height: 5, borderRadius: '50%',
                        background: '#a78bfa', flexShrink: 0,
                    }} />
                    <input
                        type="text"
                        value={ach}
                        onChange={e => change(i, e.target.value)}
                        placeholder="Led team of 5 to deliver feature 2 weeks ahead of schedule"
                        style={{ ...inputStyle, flex: 1 }}
                    />
                    <button onClick={() => remove(i)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px', flexShrink: 0 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                </div>
            ))}
            <button onClick={add} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 6, background: 'transparent', border: `1px dashed ${T.editorBorder}`, color: T.editorTextMuted, cursor: 'pointer', fontSize: '0.8125rem', width: '100%', justifyContent: 'center', marginTop: 4 }}>
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
    'rezi-standard': 'Rezi Standard',
    london: 'London',
    stitch: 'Stitch',
    harvard: 'Harvard',
    sb2nov: 'sb2nov',
    'open-resume': 'Open Resume',
}

async function loadPdfRenderer(templateId: string) {
    const [renderer, pdfDoc] = await Promise.all([
        import('@react-pdf/renderer'),
        templateId === 'rezi'
            ? import('@/components/ResumeRenderer/ReziPdfDocument')
            : templateId === 'rezi-standard'
            ? import('@/components/ResumeRenderer/ReziStandardPdfDocument')
            : templateId === 'london'
            ? import('@/components/ResumeRenderer/LondonPdfDocument')
            : templateId === 'stitch'
            ? import('@/components/ResumeRenderer/StitchPdfDocument')
            : templateId === 'harvard'
            ? import('@/components/ResumeRenderer/HarvardPdfDocument')
            : templateId === 'sb2nov'
            ? import('@/components/ResumeRenderer/Sb2novPdfDocument')
            : templateId === 'open-resume'
            ? import('@/components/ResumeRenderer/OpenResumePdfDocument')
            : import('@/components/ResumeRenderer/ClassicPdfDocument'),
    ])
    return { renderer, PdfComp: pdfDoc.default }
}

// ── Download PDF ─────────────────────────────────────────────
function DownloadPdf({ state, templateId }: { state: ResumeEditorState; templateId: string }) {
    const [loading, setLoading] = useState(false)
    const templateLabel = TEMPLATE_LABELS[templateId] ?? 'Classic'

    async function handleDownload() {
        setLoading(true)
        try {
            const { renderer, PdfComp } = await loadPdfRenderer(templateId)
            const doc = React.createElement(PdfComp, { state })
            const blob = await renderer.pdf(doc as any).toBlob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${(state.profile.name || 'Resume').replace(/\s+/g, '_')}_${templateLabel}_Resume.pdf`
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
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '9px 18px', borderRadius: T.radiusSm,
                background: loading ? '#334155' : `linear-gradient(135deg, ${T.primary}, ${T.primaryDark})`,
                color: 'white', fontWeight: 600, fontSize: '0.8125rem',
                border: 'none', cursor: loading ? 'wait' : 'pointer',
                boxShadow: loading ? 'none' : T.primaryShadow,
                transition: 'all 0.2s ease',
                fontFamily: "'DM Sans', 'Inter', sans-serif",
            }}
        >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>
            </svg>
            {loading ? 'Generating...' : `Download PDF (${templateLabel})`}
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
    const [openExp, setOpenExp] = useState<number | null>(0)
    const [openProj, setOpenProj] = useState<number | null>(null)
    const [openBA, setOpenBA] = useState<number | null>(0)

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

function MeridianSidebar({
    resumes, selectedId, onSelect, onOptimizeNew, sourceResume,
    uploadedResumes, sourceResumeId, onSourceChange, optimizedCounts,
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
}) {
    const [filter, setFilter] = useState('')
    const filtered = filter
        ? resumes.filter(r => {
            const txt = `${r.job?.company ?? ''} ${r.job?.title ?? ''}`.toLowerCase()
            return txt.includes(filter.toLowerCase())
          })
        : resumes

    return (
        <div style={{
            width: 340, flexShrink: 0, background: M.white,
            borderRight: `1px solid ${M.border}`,
            display: 'flex', flexDirection: 'column', height: '100%',
        }}>
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
    { id: 'rezi-standard', label: 'Rezi Std' },
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
}: {
    state: ResumeEditorState
    templateId: string
    onTemplateChange: (t: string) => void
    onMoreTemplates: () => void
    downloadButton: React.ReactNode
}) {
    const renderPreview = () => {
        switch (templateId) {
            case 'rezi': return <ReziResumePreview state={state} />
            case 'rezi-standard': return <ReziStandardResumePreview state={state} />
            case 'london': return <LondonResumePreview state={state} />
            case 'stitch': return <StitchResumePreview state={state} />
            case 'harvard': return <HarvardResumePreview state={state} />
            case 'sb2nov': return <Sb2novResumePreview state={state} />
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

            {/* Paper */}
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
    return {
        profile: {
            name: parsed.name || raw?.personal_info?.full_name || '',
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
        experience: (raw?.work_history ?? raw?.work_experience ?? []).map((w: any) => ({
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
                    const raw = localStorage.getItem('resuscore-resume-draft')
                    if (raw) {
                        const { optimizedData, originalResume } = JSON.parse(raw) as { optimizedData: OptimizedResumeData; originalResume: ParsedResume | null }
                        setEditorState(mapToEditorState(optimizedData, originalResume))
                        setLocalOptimizedData(optimizedData)
                    }
                } catch { /* use empty state */ }
            }

            const savedTemplate = localStorage.getItem('resuscore-template')
            if (savedTemplate && TEMPLATE_LABELS[savedTemplate]) setTemplateId(savedTemplate)
            setLoaded(true)
        }
        init()
    }, [user?.id, loadOptimizedResume, loadRawResume])

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
        localStorage.setItem('resuscore-template', id)
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
                {/* Brand */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                        width: 26, height: 26, borderRadius: 7, background: M.accent,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.8125rem', fontWeight: 800, color: '#fff', fontFamily: M.fontHeading,
                    }}>R</div>
                    <span style={{
                        fontSize: '0.9375rem', fontWeight: 700, color: M.text,
                        fontFamily: M.fontHeading, letterSpacing: '-0.015em',
                    }}>ResuScore</span>
                </div>
                <div style={{ width: 1, height: 18, background: M.border }} />

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
                <DownloadPdf state={editorState} templateId={templateId} />
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
                    />
                )}

                {/* Editor column */}
                <div style={{
                    width: 500, flexShrink: 0, display: 'flex', flexDirection: 'column',
                    background: M.surface, borderRight: `1px solid ${M.border}`,
                    height: '100%', overflow: 'hidden',
                }}>
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
                </div>

                {/* Preview column */}
                <MeridianPreviewPanel
                    state={editorState}
                    templateId={templateId}
                    onTemplateChange={(t) => {
                        setTemplateId(t)
                        localStorage.setItem('resuscore-template', t)
                    }}
                    onMoreTemplates={() => setShowTemplatePicker(true)}
                    downloadButton={null}
                />
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
            />
        )}

        {showTemplatePicker && (
            <TemplatePickerModal
                onSelect={handleTemplateSelect}
                onClose={() => setShowTemplatePicker(false)}
            />
        )}
        </>
    )
}
