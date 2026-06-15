'use client'

import React, { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { fetchResumes, fetchResumeById, getPrimaryResumeId, triggerResumeOptimization, triggerBuildPlan, fetchOptimizedResume, fetchOptimizedResumesByResume, RateLimitError } from '@/lib/api'
import { getScoreColor } from '@/lib/types'
import type { Job, UserJobMatch, OptimizedResumeData, ParsedResume, AtsFeedback, BeforeAfterRole, SkillsDelta, CareerActionPlan, BuildPlan, AcceptedRecommendation } from '@/lib/types'
import { mapToOpenResumeSchema } from '@/lib/resumeMapper'
import type { OpenResume } from '@/lib/resumeMapper'
import { createClient as createBrowserSupabase } from '@/lib/supabase/client'
import TemplatePickerModal, { type TemplateId } from '@/components/TemplatePickerModal'
import BuildPlanModal from '@/components/BuildPlanModal'
import { useAuth } from '@/components/providers/AuthProvider'

type FullMatch = UserJobMatch & { job: Job }
type Phase = 'idle' | 'loading' | 'done' | 'error'

// Cleans fragmented PDF-parsed names like "VA M S I BA N DA RU" → "Vamsibandaru"
function cleanDisplayName(raw: string | null | undefined): string | null {
    if (!raw) return null
    const trimmed = raw.trim()
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
type OptimizedListItem = {
    id: string
    job_id: string
    resume_id: string
    keyword_alignment_score: number
    updated_at: string
    optimized_data: OptimizedResumeData
    job: { id: string; title: string | null; company: string | null; location: string | null }
}

/* ─── Design Tokens ─── */
const T = {
    primary: '#135bec',
    primaryDark: '#0f4cc7',
    primaryGlow: 'rgba(19,91,236,0.12)',
    primaryShadow: '0 2px 12px rgba(19,91,236,0.25)',
    surface: '#ffffff',
    bg: '#f8fafc',
    bgAlt: '#f1f5f9',
    border: '#e2e8f0',
    borderLight: '#f1f5f9',
    text: '#0f172a',
    textSecondary: '#64748b',
    textMuted: '#94a3b8',
    success: '#10b981',
    successBg: '#ecfdf5',
    successBorder: '#a7f3d0',
    warning: '#f59e0b',
    warningBg: '#fffbeb',
    danger: '#ef4444',
    radius: 14,
    radiusSm: 8,
    shadow: '0 1px 3px rgba(0,0,0,0.06)',
    shadowMd: '0 4px 16px rgba(0,0,0,0.08)',
}

/* ─── Loading Messages ─── */
const LOADING_MSGS = [
    { text: 'Analyzing job requirements', icon: '🔍' },
    { text: 'Comparing your experience', icon: '📋' },
    { text: 'Identifying keyword gaps', icon: '🎯' },
    { text: 'Tailoring your experience', icon: '✍️' },
    { text: 'Optimizing for ATS systems', icon: '⚡' },
    { text: 'Polishing final resume', icon: '✨' },
]

/* ─── Keyframes (injected once) ─── */
function useInjectStyles() {
    useEffect(() => {
        if (document.getElementById('optimize-keyframes')) return
        const style = document.createElement('style')
        style.id = 'optimize-keyframes'
        style.textContent = `
            @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,500;0,9..40,700;0,9..40,800;1,9..40,400&family=JetBrains+Mono:wght@400;600&display=swap');
            @keyframes optCardIn { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
            @keyframes optPulse { 0%,100% { opacity:0.4 } 50% { opacity:1 } }
            @keyframes optSlideUp { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:translateY(0) } }
            @keyframes optShimmer { 0% { background-position:-200% 0 } 100% { background-position:200% 0 } }
            @keyframes optScoreCount { from { opacity:0; transform:scale(0.5) } to { opacity:1; transform:scale(1) } }
            @keyframes optProgressBar { from { width: 0% } to { width: 100% } }
            @keyframes optFloat { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-6px) } }
            @keyframes optGlow { 0%,100% { box-shadow: 0 0 20px rgba(19,91,236,0.15) } 50% { box-shadow: 0 0 40px rgba(19,91,236,0.3) } }
            @keyframes optFadeIn { from { opacity:0 } to { opacity:1 } }
            @keyframes optCheckmark { 0% { stroke-dashoffset:24 } 100% { stroke-dashoffset:0 } }
        `
        document.head.appendChild(style)
    }, [])
}

/* ─── Company Icon ─── */
const ICON_COLORS = ['#0f172a','#1e3a5f','#14532d','#3b0764','#0c4a6e','#1c1917','#431407','#042f2e','#1e1b4b','#162032']
function iconColor(name: string) {
    let h = 0; for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h)
    return ICON_COLORS[Math.abs(h) % ICON_COLORS.length]
}

function CompanyIcon({ company, size = 40 }: { company: string | null; size?: number }) {
    const name = company ?? '?'
    const bg = iconColor(name)
    return (
        <div style={{
            width: size, height: size, borderRadius: Math.round(size * 0.22),
            background: bg, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(255,255,255,0.92)', fontSize: size * 0.42, fontWeight: 700,
            letterSpacing: '-0.02em', boxShadow: `0 1px 4px ${bg}80`,
        }}>{name[0].toUpperCase()}</div>
    )
}

/**
 * Tier mapping for the keyword-match score. Locally defined (does NOT use the
 * shared `getScoreColor` from lib/types) because the rest of the app uses an
 * older 3-tier amber-at-60 mapping; on this page, brand blue carries the
 * 70–84 "Good" range so it reads as a positive signal, not a warning.
 */
function scoreTier(score: number): {
    label: 'Excellent' | 'Good' | 'Fair' | 'Needs Work'
    fg: string  // ring + number color
    bg: string  // pill background
    border: string
    track: string  // dimmer track tint
} {
    if (score >= 85) return { label: 'Excellent', fg: '#047857', bg: '#ecfdf5', border: '#a7f3d0', track: '#d1fae5' }
    if (score >= 70) return { label: 'Good',      fg: '#135bec', bg: '#eef4ff', border: '#bfdbfe', track: '#dbeafe' }
    if (score >= 50) return { label: 'Fair',      fg: '#b45309', bg: '#fffbeb', border: '#fde68a', track: '#fef3c7' }
    return                  { label: 'Needs Work', fg: '#b91c1c', bg: '#fef2f2', border: '#fecaca', track: '#fee2e2' }
}

/**
 * ScoreRing — compact gauge that only renders the ring + number. Eyebrow label
 * ("KEYWORD MATCH") and tier pill ("Good") live OUTSIDE the SVG in the parent
 * layout, so they stay legible at any size and the gauge stays clean.
 *
 * The previous version embedded both labels via `<text>` inside the SVG, which
 * collapsed into illegible 4px glyphs at size=64 (the actual header usage),
 * stacking on top of the score number.
 */
function ScoreRing({ score, size = 64 }: { score: number; size?: number }) {
    const tier = scoreTier(score)
    const stroke = Math.max(5, Math.round(size * 0.11))
    const r = (size - stroke) / 2 - 1
    const circ = 2 * Math.PI * r
    const offset = circ - (score / 100) * circ
    // Tabular numerals so "100" and "74" don't shift the visual center.
    const numberStyle: React.CSSProperties = {
        fontFamily: "'JetBrains Mono', monospace",
        fontWeight: 800,
        fontVariantNumeric: 'tabular-nums',
        fontSize: Math.round(size * 0.34),
        color: tier.fg,
        letterSpacing: '-0.04em',
        lineHeight: 1,
    }
    return (
        <div
            role="img"
            aria-label={`Keyword match score ${score} of 100 — ${tier.label}`}
            style={{
                position: 'relative', width: size, height: size, flexShrink: 0,
            }}
        >
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
                style={{ display: 'block', transform: 'rotate(-90deg)' }}>
                <circle
                    cx={size/2} cy={size/2} r={r}
                    fill="none" stroke={tier.track} strokeWidth={stroke}
                />
                <circle
                    cx={size/2} cy={size/2} r={r}
                    fill="none" stroke={tier.fg} strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={circ}
                    strokeDashoffset={offset}
                    style={{
                        transition: 'stroke-dashoffset 1.2s cubic-bezier(.34,1.56,.64,1)',
                    }}
                />
            </svg>
            <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: 'optScoreCount 0.6s ease both 0.3s',
            }}>
                <span style={numberStyle}>{score}</span>
            </div>
        </div>
    )
}

/**
 * ScoreBlock — composed header element: gauge + eyebrow + tier pill. The
 * gauge stays small and clean; meaning lives in the surrounding typography.
 */
function ScoreBlock({ score, size = 64 }: { score: number; size?: number }) {
    const tier = scoreTier(score)
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <ScoreRing score={score} size={size} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.625rem', fontWeight: 700,
                    letterSpacing: '0.14em', textTransform: 'uppercase',
                    color: T.textMuted, lineHeight: 1,
                }}>
                    Keyword Match
                </span>
                <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '3px 10px',
                    borderRadius: 99,
                    background: tier.bg, color: tier.fg,
                    border: `1px solid ${tier.border}`,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.6875rem', fontWeight: 700,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    width: 'fit-content',
                    lineHeight: 1,
                }}>
                    <span style={{
                        width: 5, height: 5, borderRadius: '50%',
                        background: tier.fg,
                        boxShadow: `0 0 0 2px ${tier.fg}25`,
                    }} />
                    {tier.label}
                </span>
            </div>
        </div>
    )
}

/* ─── Match Badge ─── */
function MatchBadge({ score }: { score: number }) {
    const [c, bg] = score >= 80 ? ['#15803d', '#dcfce7'] : score >= 60 ? ['#c2410c', '#ffedd5'] : ['#b91c1c', '#fee2e2']
    return (
        <span style={{
            fontSize: '0.6rem', fontWeight: 800, padding: '3px 8px',
            borderRadius: 6, color: c, background: bg, letterSpacing: '0.04em',
            whiteSpace: 'nowrap' as const,
        }}>
            {score}%
        </span>
    )
}

/* ─── Progress Stepper (loading state) ─── */
function ProgressStepper({ elapsed }: { elapsed: number }) {
    const stepDuration = 5000
    const currentStep = Math.min(Math.floor(elapsed / stepDuration), LOADING_MSGS.length - 1)
    const stepProgress = Math.min(((elapsed % stepDuration) / stepDuration) * 100, 100)
    const overallProgress = Math.min((elapsed / (LOADING_MSGS.length * stepDuration)) * 100, 95)

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 32, padding: '48px 32px',
            animation: 'optSlideUp 0.5s ease both',
        }}>
            {/* Animated icon */}
            <div style={{
                width: 88, height: 88, borderRadius: 24,
                background: `linear-gradient(135deg, ${T.primary}12, ${T.primary}08)`,
                border: `2px solid ${T.primary}20`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 40,
                animation: 'optFloat 2s ease-in-out infinite, optGlow 2s ease-in-out infinite',
            }}>
                {LOADING_MSGS[currentStep].icon}
            </div>

            {/* Current step text */}
            <div style={{ textAlign: 'center' }}>
                <h3 style={{
                    fontSize: '1.25rem', fontWeight: 700, color: T.text,
                    fontFamily: "'DM Sans', sans-serif",
                    marginBottom: 6,
                }}>
                    {LOADING_MSGS[currentStep].text}
                </h3>
                <p style={{
                    fontSize: '0.8125rem', color: T.textMuted,
                    fontFamily: "'DM Sans', sans-serif",
                }}>
                    Step {currentStep + 1} of {LOADING_MSGS.length}
                </p>
            </div>

            {/* Overall progress bar */}
            <div style={{ width: '100%', maxWidth: 320 }}>
                <div style={{
                    height: 6, borderRadius: 3,
                    background: T.bgAlt, overflow: 'hidden',
                }}>
                    <div style={{
                        height: '100%', borderRadius: 3,
                        background: `linear-gradient(90deg, ${T.primary}, #3b82f6)`,
                        width: `${overallProgress}%`,
                        transition: 'width 0.5s ease-out',
                    }} />
                </div>
                <p style={{
                    fontSize: '0.6875rem', color: T.textMuted, marginTop: 8,
                    textAlign: 'center', fontFamily: "'JetBrains Mono', monospace",
                }}>
                    {Math.round(overallProgress)}% complete
                </p>
            </div>

            {/* Step indicators */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {LOADING_MSGS.map((_, i) => (
                    <div key={i} style={{
                        width: i === currentStep ? 24 : 8,
                        height: 8, borderRadius: 4,
                        background: i < currentStep ? T.success : i === currentStep ? T.primary : T.border,
                        transition: 'all 0.3s ease',
                    }} />
                ))}
            </div>
        </div>
    )
}

/* ─── Optimization Notes Card ─── */
function OptimizationNotes({ notes }: { notes: string[] }) {
    return (
        <div style={{
            background: T.surface, borderRadius: T.radius,
            border: `1px solid ${T.border}`,
            padding: '20px 24px', marginTop: 16,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.primary} strokeWidth="2.5">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>
                </svg>
                <span style={{ fontSize: '0.875rem', fontWeight: 700, color: T.text, fontFamily: "'DM Sans', sans-serif" }}>
                    What Changed
                </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {notes.map((note, i) => (
                    <div key={i} style={{
                        display: 'flex', gap: 10, alignItems: 'flex-start',
                        animation: `optSlideUp 0.3s ease both ${i * 0.08}s`,
                    }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
                            <circle cx="12" cy="12" r="10" fill={T.successBg} stroke={T.success} strokeWidth="1.5"/>
                            <path d="M8 12l3 3 5-5" stroke={T.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                                style={{ strokeDasharray: 24, animation: `optCheckmark 0.4s ease both ${0.5 + i * 0.1}s` }}
                            />
                        </svg>
                        <span style={{
                            fontSize: '0.8125rem', color: T.textSecondary, lineHeight: 1.5,
                            fontFamily: "'DM Sans', sans-serif",
                        }}>{note}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}

/* ─── Empty State ─── */
function EmptyState() {
    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', minHeight: 500,
            padding: 48, textAlign: 'center',
        }}>
            <div style={{
                width: 96, height: 96, borderRadius: 28,
                background: `linear-gradient(135deg, ${T.primary}10, ${T.primary}05)`,
                border: `2px dashed ${T.primary}25`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 24,
            }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={`${T.primary}60`} strokeWidth="1.5">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15l3-3 3 3"/>
                </svg>
            </div>
            <h3 style={{
                fontSize: '1.125rem', fontWeight: 700, color: T.text,
                fontFamily: "'DM Sans', sans-serif", marginBottom: 8,
            }}>
                Select a Generated Resume
            </h3>
            <p style={{
                fontSize: '0.8125rem', color: T.textMuted, maxWidth: 360, lineHeight: 1.6,
                fontFamily: "'DM Sans', sans-serif",
            }}>
                Pick a generated resume from the left panel to view its ATS analysis, before &amp; after bullet changes, and download the PDF.
            </p>
        </div>
    )
}

/* ─── Render **bold** markdown inline ─── */
function RichText({ text }: { text: string }) {
    const parts = text.split(/\*\*/)
    return (
        <>
            {parts.map((part, i) =>
                i % 2 === 1 ? <strong key={i}>{part}</strong> : <React.Fragment key={i}>{part}</React.Fragment>
            )}
        </>
    )
}

/* ─── HTML Resume Preview (ResumeLM-style, replaces PDF iframe) ─── */
function ResumeHTMLPreview({ resumeData, originalResume }: { resumeData: OptimizedResumeData; originalResume: ParsedResume | null }) {
    const { optimized_summary, optimized_skills, optimized_experience, projects, education, certifications, achievements } = resumeData
    // Priority: resumeData.personal_info (injected by n8n) → original structured_data.personal_info → original root fields
    const rawOrig = originalResume as any
    const name = resumeData.personal_info?.full_name || rawOrig?.personal_info?.full_name || originalResume?.name || ''
    const email = resumeData.personal_info?.email || rawOrig?.personal_info?.email || originalResume?.email || ''
    const phone = resumeData.personal_info?.phone || rawOrig?.personal_info?.phone || originalResume?.phone || ''
    const location = resumeData.personal_info?.location || rawOrig?.personal_info?.location || originalResume?.location || ''
    const technical = optimized_skills?.technical || []
    const tools = optimized_skills?.tools || []
    const softSkills = optimized_skills?.soft_skills || []

    const sectionLabel: React.CSSProperties = {
        fontWeight: 700, fontSize: '0.6875rem', letterSpacing: '0.1em',
        color: T.primary, textTransform: 'uppercase', marginBottom: 8,
        paddingBottom: 4, borderBottom: `1.5px solid ${T.primary}30`,
    }
    const divider = <div style={{ height: 1, background: T.borderLight, margin: '14px 0' }} />

    return (
        <div style={{
            background: 'white', fontFamily: "'DM Sans', Helvetica, sans-serif",
            fontSize: '0.8rem', lineHeight: 1.55, color: '#1a1a1a',
            padding: '32px 36px', minHeight: '100%',
        }}>
            {/* Name + Contact */}
            <div style={{ textAlign: 'center', marginBottom: 18 }}>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: T.primary, letterSpacing: '-0.03em' }}>
                    {name || 'Your Name'}
                </div>
                {(email || phone || location) && (
                    <div style={{ marginTop: 6, display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap', fontSize: '0.75rem', color: '#555' }}>
                        {email && <span>{email}</span>}
                        {phone && <span>{phone}</span>}
                        {location && <span>{location}</span>}
                    </div>
                )}
            </div>

            <div style={{ height: 2, background: T.primary, borderRadius: 2, marginBottom: 16 }} />

            {/* Summary */}
            {optimized_summary && (
                <>
                    <div style={sectionLabel}>Summary</div>
                    <p style={{ color: '#444', lineHeight: 1.65, margin: '0 0 4px' }}>
                        <RichText text={optimized_summary} />
                    </p>
                    {divider}
                </>
            )}

            {/* Skills */}
            {(technical.length > 0 || tools.length > 0 || softSkills.length > 0) && (
                <>
                    <div style={sectionLabel}>Skills</div>
                    {technical.length > 0 && (
                        <div style={{ marginBottom: 3 }}>
                            <strong style={{ color: '#222' }}>Technical: </strong>
                            <span style={{ color: '#444' }}>{technical.join(', ')}</span>
                        </div>
                    )}
                    {tools.length > 0 && (
                        <div style={{ marginBottom: 3 }}>
                            <strong style={{ color: '#222' }}>Tools: </strong>
                            <span style={{ color: '#444' }}>{tools.join(', ')}</span>
                        </div>
                    )}
                    {softSkills.length > 0 && (
                        <div>
                            <strong style={{ color: '#222' }}>Core Competencies: </strong>
                            <span style={{ color: '#444' }}>{softSkills.join(', ')}</span>
                        </div>
                    )}
                    {divider}
                </>
            )}

            {/* Experience */}
            {optimized_experience && optimized_experience.length > 0 && (
                <>
                    <div style={sectionLabel}>Experience</div>
                    {optimized_experience.map((exp, i) => (
                        <div key={i} style={{ marginBottom: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <div style={{ fontWeight: 700, color: '#111' }}>{exp.company}</div>
                                    <div style={{ color: '#555', fontSize: '0.775rem' }}>{exp.title}</div>
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#888', whiteSpace: 'nowrap', marginLeft: 12, marginTop: 2 }}>
                                    {[exp.start_date, exp.end_date].filter(Boolean).join(' – ')}
                                </div>
                            </div>
                            {(exp.bullet_points || []).length > 0 && (
                                <ul style={{ margin: '5px 0 0 14px', padding: 0 }}>
                                    {exp.bullet_points.map((bp, j) => (
                                        <li key={j} style={{ color: '#444', marginBottom: 2 }}><RichText text={bp} /></li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    ))}
                    {divider}
                </>
            )}

            {/* Projects */}
            {projects && projects.length > 0 && (
                <>
                    <div style={sectionLabel}>Projects</div>
                    {projects.map((proj, i) => (
                        <div key={i} style={{ marginBottom: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontWeight: 700, color: '#111' }}>{proj.name}</div>
                                {proj.date && <div style={{ fontSize: '0.7rem', color: '#888' }}>{proj.date}</div>}
                            </div>
                            {(proj.bullet_points || []).length > 0 && (
                                <ul style={{ margin: '4px 0 0 14px', padding: 0 }}>
                                    {proj.bullet_points.map((bp, j) => (
                                        <li key={j} style={{ color: '#444', marginBottom: 2 }}><RichText text={bp} /></li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    ))}
                    {divider}
                </>
            )}

            {/* Education */}
            {education && education.length > 0 && (
                <>
                    <div style={sectionLabel}>Education</div>
                    {education.map((edu, i) => (
                        <div key={i} style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <div style={{ fontWeight: 700, color: '#111' }}>{edu.institution}</div>
                                <div style={{ color: '#555', fontSize: '0.775rem' }}>{edu.degree}</div>
                            </div>
                            {edu.date && <div style={{ fontSize: '0.7rem', color: '#888', marginTop: 2 }}>{edu.date}</div>}
                        </div>
                    ))}
                    {divider}
                </>
            )}

            {/* Certifications */}
            {certifications && certifications.length > 0 && (
                <>
                    <div style={sectionLabel}>Certifications</div>
                    <ul style={{ margin: '0 0 4px 14px', padding: 0 }}>
                        {certifications.map((cert: any, i) => (
                            <li key={i} style={{ color: '#444', marginBottom: 3 }}>
                                {typeof cert === 'string' ? cert : cert?.name || cert?.title || JSON.stringify(cert)}
                            </li>
                        ))}
                    </ul>
                    {divider}
                </>
            )}

            {/* Achievements */}
            {achievements && achievements.length > 0 && (
                <>
                    <div style={sectionLabel}>Achievements</div>
                    <ul style={{ margin: '0 0 4px 14px', padding: 0 }}>
                        {achievements.map((ach, i) => (
                            <li key={i} style={{ color: '#444', marginBottom: 3 }}>{ach}</li>
                        ))}
                    </ul>
                </>
            )}
        </div>
    )
}

/* ─── ATS Intelligence Card ───
 * Forensic readout panel — refined analytical aesthetic. White-dominant,
 * hairline-driven, mono coordinates carry the "instrument" feel. The keyword
 * data is parsed from the explanation into structured zones (hits + gaps +
 * notes) and rendered as a proper readout table, not crammed inline pills.
 */

/** Pulls structured keyword data out of the free-form explanation text. */
type AtsKeyword = { name: string; count: number }
type ScanData = { hits: AtsKeyword[]; gaps: AtsKeyword[]; notes: string[] }

function parseScanSummary(text: string): ScanData {
    if (!text) return { hits: [], gaps: [], notes: [] }

    // Pull every "Keyword (Nx)" occurrence with surrounding context — context tells
    // us whether it lives in a "hits" sentence or a "gap/missing" sentence.
    const sentences = text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean)

    const hits: AtsKeyword[] = []
    const gaps: AtsKeyword[] = []
    const notes: string[] = []
    const kwRe = /([A-Za-z][\w/\-+ .]*?)\s\((\d+)x\)/g

    for (const sentence of sentences) {
        const matches = [...sentence.matchAll(kwRe)]
        if (matches.length === 0) {
            // Leftover prose ("No em-dashes detected" etc.) — keep as a note.
            const cleaned = sentence.replace(/^\W+/, '').trim()
            if (cleaned.length > 0) notes.push(cleaned)
            continue
        }
        // Use sentence framing to decide bucket.
        const lower = sentence.toLowerCase()
        const isGapFrame = /\b(gap|missing|notable gap|absent|not present|no hits)\b/.test(lower)
        for (const m of matches) {
            const name = m[1].trim().replace(/^and\s+/i, '')
            const count = parseInt(m[2], 10)
            const bucket = (count === 0 || isGapFrame) ? gaps : hits
            // Dedupe by name.
            if (!bucket.some(k => k.name.toLowerCase() === name.toLowerCase())) {
                bucket.push({ name, count })
            }
        }
    }
    return { hits, gaps, notes }
}

function AtsIntelligenceCard({ feedback }: { feedback: AtsFeedback }) {
    const callbackLevel = (feedback.predicted_callback || '').toLowerCase()
    const isHigh = callbackLevel.startsWith('high')
    const isMed = callbackLevel.startsWith('med')
    const verdict = {
        label: isHigh ? 'HIGH' : isMed ? 'MEDIUM' : 'LOW',
        color: isHigh ? '#047857' : isMed ? '#b45309' : '#b91c1c',
    }
    const verdictBody = feedback.predicted_callback
        ? feedback.predicted_callback.replace(/^(high|medium|low)\s*[—–-]\s*/i, '')
        : ''

    const scan = parseScanSummary(feedback.explanation || '')
    const totalKeywords = scan.hits.length + scan.gaps.length
    const hitRatio = totalKeywords === 0 ? 0 : scan.hits.length / totalKeywords
    const rowCount = Math.max(scan.hits.length, scan.gaps.length)

    /** Eyebrow label — uppercase mono, hairline rule beneath. Pure typography. */
    const Eyebrow = ({ children, right, color = '#94a3b8' }: {
        children: React.ReactNode; right?: React.ReactNode; color?: string
    }) => (
        <div style={{
            display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
            gap: 12,
            borderBottom: `1px solid ${T.borderLight}`,
            paddingBottom: 8,
            marginBottom: 14,
        }}>
            <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.625rem', fontWeight: 700,
                letterSpacing: '0.18em', textTransform: 'uppercase',
                color, lineHeight: 1,
            }}>
                {children}
            </span>
            {right && (
                <span style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.625rem', fontWeight: 600,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: T.textMuted, lineHeight: 1,
                }}>{right}</span>
            )}
        </div>
    )

    return (
        <div style={{
            position: 'relative',
            borderRadius: 14,
            border: `1px solid ${T.border}`,
            background: T.surface,
            boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px -16px rgba(15,23,42,0.08)',
            animation: 'optSlideUp 0.4s ease both 0.2s',
            padding: '22px 24px 24px',
        }}>
            {/* ── Masthead ── */}
            <div style={{ marginBottom: 22 }}>
                <div style={{
                    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                    gap: 16, marginBottom: 4,
                }}>
                    <h2 style={{
                        margin: 0,
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        fontSize: '1.0625rem', fontWeight: 800,
                        letterSpacing: '-0.02em',
                        color: '#0f172a',
                        lineHeight: 1.2,
                    }}>
                        ATS Intelligence
                    </h2>
                    <span style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '0.625rem', fontWeight: 600,
                        letterSpacing: '0.18em', textTransform: 'uppercase',
                        color: T.textMuted,
                    }}>
                        Vol. 01
                    </span>
                </div>
                <p style={{
                    margin: 0,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontSize: '0.8125rem',
                    color: T.textSecondary,
                    lineHeight: 1.5,
                }}>
                    Keyword density, phrasing, and callback signal — read at a glance.
                </p>
            </div>

            {/* ── Coverage line ── */}
            {totalKeywords > 0 && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    paddingBottom: 22,
                    borderBottom: `2px solid #0f172a`,
                    marginBottom: 22,
                }}>
                    <span style={{
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        fontSize: '0.8125rem',
                        color: '#475569',
                        letterSpacing: '-0.005em',
                    }}>
                        <span style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontWeight: 800,
                            color: '#135bec',
                            fontVariantNumeric: 'tabular-nums',
                            fontSize: '0.9375rem',
                            letterSpacing: '-0.02em',
                            marginRight: 6,
                        }}>
                            {scan.hits.length}
                        </span>
                        of
                        <span style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontWeight: 600,
                            color: '#475569',
                            fontVariantNumeric: 'tabular-nums',
                            fontSize: '0.9375rem',
                            margin: '0 6px',
                        }}>
                            {totalKeywords}
                        </span>
                        keywords matched
                    </span>
                    <div aria-hidden style={{ flex: 1, height: 1, background: T.borderLight }} />
                    <span style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontVariantNumeric: 'tabular-nums',
                        fontSize: '0.8125rem', fontWeight: 800,
                        color: '#135bec',
                        letterSpacing: '-0.01em',
                    }}>
                        {Math.round(hitRatio * 100)}%
                    </span>
                </div>
            )}

            {/* ── Two-column keyword table ── */}
            {(scan.hits.length > 0 || scan.gaps.length > 0) && (
                <div style={{ marginBottom: 28 }}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        columnGap: 28,
                    }}>
                        <Eyebrow color="#135bec" right={`${scan.hits.length} found`}>
                            Hits
                        </Eyebrow>
                        <Eyebrow color="#94a3b8" right={`${scan.gaps.length} absent`}>
                            Missing
                        </Eyebrow>
                    </div>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        columnGap: 28,
                    }}>
                        {/* Hits column */}
                        <div>
                            {scan.hits.length === 0 ? (
                                <div style={{
                                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                                    fontSize: '0.8125rem',
                                    color: T.textMuted, fontStyle: 'italic',
                                    paddingTop: 2,
                                }}>
                                    No keyword hits.
                                </div>
                            ) : (
                                scan.hits.map(kw => (
                                    <div key={kw.name} style={{
                                        display: 'grid',
                                        gridTemplateColumns: '32px 1fr',
                                        columnGap: 12,
                                        alignItems: 'baseline',
                                        padding: '7px 0',
                                        borderBottom: `1px dotted ${T.borderLight}`,
                                    }}>
                                        <span style={{
                                            fontFamily: "'JetBrains Mono', monospace",
                                            fontVariantNumeric: 'tabular-nums',
                                            fontSize: '0.875rem', fontWeight: 800,
                                            color: '#135bec',
                                            textAlign: 'right',
                                            letterSpacing: '-0.02em',
                                        }}>
                                            {kw.count}
                                            <span style={{ color: '#94a3b8', fontWeight: 500, marginLeft: 1 }}>×</span>
                                        </span>
                                        <span style={{
                                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                                            fontSize: '0.8125rem',
                                            color: '#0f172a',
                                            letterSpacing: '-0.005em',
                                            lineHeight: 1.35,
                                        }}>
                                            {kw.name}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                        {/* Missing column */}
                        <div>
                            {scan.gaps.length === 0 ? (
                                <div style={{
                                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                                    fontSize: '0.8125rem',
                                    color: T.textMuted, fontStyle: 'italic',
                                    paddingTop: 2,
                                }}>
                                    Nothing missing.
                                </div>
                            ) : (
                                scan.gaps.map(kw => (
                                    <div key={kw.name} style={{
                                        display: 'grid',
                                        gridTemplateColumns: '32px 1fr',
                                        columnGap: 12,
                                        alignItems: 'baseline',
                                        padding: '7px 0',
                                        borderBottom: `1px dotted ${T.borderLight}`,
                                    }}>
                                        <span aria-label="missing" style={{
                                            fontFamily: "'JetBrains Mono', monospace",
                                            fontSize: '0.875rem', fontWeight: 700,
                                            color: '#b45309',  // amber-700, signals "absent" without screaming
                                            textAlign: 'right',
                                            letterSpacing: '-0.02em',
                                        }}>
                                            —
                                        </span>
                                        <span style={{
                                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                                            fontSize: '0.8125rem', fontWeight: 500,
                                            color: '#1e293b',  // slate-800 — properly legible
                                            letterSpacing: '-0.005em',
                                            lineHeight: 1.35,
                                        }}>
                                            {kw.name}
                                        </span>
                                    </div>
                                ))
                            )}
                            {/* Spacer rows to align column heights when one side is shorter */}
                            {Array.from({ length: Math.max(0, scan.hits.length - scan.gaps.length) }).map((_, i) => (
                                <div key={`spacer-${i}`} aria-hidden style={{ padding: '7px 0', borderBottom: `1px dotted transparent` }}>&nbsp;</div>
                            ))}
                        </div>
                    </div>
                    {scan.notes.length > 0 && (
                        <p style={{
                            margin: '16px 0 0',
                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                            fontSize: '0.78125rem',
                            color: T.textSecondary,
                            lineHeight: 1.55,
                            letterSpacing: '-0.005em',
                        }}>
                            <span style={{
                                fontFamily: "'JetBrains Mono', monospace",
                                fontSize: '0.625rem', fontWeight: 700,
                                letterSpacing: '0.18em', textTransform: 'uppercase',
                                color: '#94a3b8',
                                marginRight: 8,
                            }}>
                                Note ·
                            </span>
                            {scan.notes.join(' ')}
                        </p>
                    )}
                </div>
            )}

            {/* ── Strongest line + Top gap — side by side with vertical hairline ── */}
            {(feedback.strongest_bullet || feedback.top_keyword_gap) && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: feedback.strongest_bullet && feedback.top_keyword_gap ? '1fr 1px 1fr' : '1fr',
                    marginBottom: 24,
                }}>
                    {feedback.strongest_bullet && (
                        <div style={{ paddingRight: feedback.top_keyword_gap ? 20 : 0 }}>
                            <Eyebrow color="#047857">Strongest Bullet</Eyebrow>
                            <p style={{
                                margin: 0,
                                fontFamily: "'Plus Jakarta Sans', sans-serif",
                                fontSize: '0.875rem',
                                color: '#0f172a',
                                lineHeight: 1.6,
                                letterSpacing: '-0.005em',
                                fontStyle: 'italic',
                                fontWeight: 500,
                            }}>
                                {feedback.strongest_bullet}
                            </p>
                        </div>
                    )}
                    {feedback.strongest_bullet && feedback.top_keyword_gap && (
                        <div aria-hidden style={{ background: T.borderLight }} />
                    )}
                    {feedback.top_keyword_gap && (
                        <div style={{ paddingLeft: feedback.strongest_bullet ? 20 : 0 }}>
                            <Eyebrow color="#b45309" right="Action required">
                                Top Gap
                            </Eyebrow>
                            <p style={{
                                margin: 0,
                                fontFamily: "'Plus Jakarta Sans', sans-serif",
                                fontSize: '0.84375rem',
                                color: '#334155',
                                lineHeight: 1.65,
                                letterSpacing: '-0.005em',
                            }}>
                                {feedback.top_keyword_gap}
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* ── Verdict — horizontal card with mono label on left, prose on right ── */}
            {feedback.predicted_callback && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr',
                    border: `1px solid ${T.border}`,
                    borderRadius: 8,
                    overflow: 'hidden',
                    background: T.bg,
                }}>
                    <div style={{
                        padding: '14px 18px',
                        borderRight: `1px solid ${T.border}`,
                        background: T.bg,
                    }}>
                        <div style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: '0.5625rem', fontWeight: 700,
                            letterSpacing: '0.18em', textTransform: 'uppercase',
                            color: T.textMuted,
                            marginBottom: 6,
                        }}>
                            Verdict
                        </div>
                        <div style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: '1.625rem', fontWeight: 800,
                            color: verdict.color,
                            letterSpacing: '-0.03em',
                            lineHeight: 1,
                        }}>
                            {verdict.label}
                        </div>
                    </div>
                    <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center' }}>
                        <p style={{
                            margin: 0,
                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                            fontSize: '0.8125rem',
                            color: '#334155',
                            lineHeight: 1.6,
                            letterSpacing: '-0.005em',
                        }}>
                            {verdictBody || feedback.predicted_callback}
                        </p>
                    </div>
                </div>
            )}

            {/* Suppress unused warning when col heights match */}
            {rowCount === 0 && <span style={{ display: 'none' }}>{rowCount}</span>}
        </div>
    )
}

/* ─── Section Eyebrow — small mono uppercase label with horizontal hairline rule ─── */
function SectionEyebrow({ color = '#94a3b8', right, children }: {
    color?: string; right?: React.ReactNode; children: React.ReactNode
}) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14,
        }}>
            <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.5625rem', fontWeight: 700,
                letterSpacing: '0.18em', textTransform: 'uppercase',
                color, lineHeight: 1, flexShrink: 0,
            }}>
                {children}
            </span>
            <div aria-hidden style={{ flex: 1, height: 1, background: T.borderLight }} />
            {right && (
                <span style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.5625rem', fontWeight: 600,
                    letterSpacing: '0.14em', textTransform: 'uppercase',
                    color: T.textMuted, lineHeight: 1, flexShrink: 0,
                }}>
                    {right}
                </span>
            )}
        </div>
    )
}

/* ─── Experience Rewrites Card ─── */
function ExperienceRewritesCard({ experience }: { experience: OptimizedResumeData['optimized_experience'] }) {
    const [expanded, setExpanded] = useState<number | null>(0)
    if (!experience || experience.length === 0) return null

    return (
        <div style={{
            borderRadius: 10, border: `1px solid ${T.border}`, overflow: 'hidden',
            animation: 'optSlideUp 0.35s ease both 0.15s',
        }}>
            {/* Header */}
            <div style={{
                padding: '8px 12px', background: T.bgAlt,
                borderBottom: `1px solid ${T.borderLight}`,
                fontSize: '0.7rem', fontWeight: 700, color: T.text,
                display: 'flex', alignItems: 'center', gap: 6,
            }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.primary} strokeWidth="2.5">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Rewritten Experience
            </div>

            {/* Experience entries */}
            <div style={{ background: T.surface }}>
                {experience.map((exp, i) => {
                    const isOpen = expanded === i
                    return (
                        <div key={i} style={{ borderBottom: i < experience.length - 1 ? `1px solid ${T.borderLight}` : 'none' }}>
                            {/* Accordion toggle */}
                            <button
                                onClick={() => setExpanded(isOpen ? null : i)}
                                style={{
                                    width: '100%', padding: '9px 12px',
                                    background: isOpen ? `${T.primary}06` : 'transparent',
                                    border: 'none', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    transition: 'background 0.15s ease',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                    <div style={{
                                        width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                                        background: isOpen ? T.primary : T.bgAlt,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '0.55rem', fontWeight: 800,
                                        color: isOpen ? 'white' : T.textMuted,
                                        transition: 'all 0.15s ease',
                                    }}>
                                        {exp.company?.[0]?.toUpperCase() ?? '?'}
                                    </div>
                                    <div style={{ textAlign: 'left', minWidth: 0 }}>
                                        <div style={{
                                            fontSize: '0.7rem', fontWeight: 700, color: T.text,
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>{exp.company}</div>
                                        <div style={{
                                            fontSize: '0.6rem', color: T.textMuted,
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>{exp.title}</div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                    <span style={{
                                        fontSize: '0.575rem', fontWeight: 700, padding: '2px 6px',
                                        borderRadius: 4, background: T.successBg, color: T.success,
                                        border: `1px solid ${T.successBorder}`,
                                    }}>
                                        {(exp.bullet_points || []).length} bullets
                                    </span>
                                    <svg
                                        width="11" height="11" viewBox="0 0 24 24" fill="none"
                                        stroke={T.textMuted} strokeWidth="2.5"
                                        style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
                                    >
                                        <path d="M6 9l6 6 6-6"/>
                                    </svg>
                                </div>
                            </button>

                            {/* Bullet list */}
                            {isOpen && (
                                <div style={{ padding: '4px 12px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                                    {(exp.bullet_points || []).map((bp, j) => (
                                        <div key={j} style={{
                                            display: 'flex', gap: 7, alignItems: 'flex-start',
                                            animation: `optSlideUp 0.2s ease both ${j * 0.05}s`,
                                        }}>
                                            <div style={{
                                                width: 14, height: 14, borderRadius: 4, flexShrink: 0, marginTop: 2,
                                                background: `${T.primary}12`,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke={T.primary} strokeWidth="3">
                                                    <path d="M5 12l5 5L20 7"/>
                                                </svg>
                                            </div>
                                            <span style={{
                                                fontSize: '0.725rem', color: T.textSecondary,
                                                lineHeight: 1.55, flex: 1,
                                            }}>{bp}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

/* ─── Projects Card ─── */
function ProjectsCard({ projects }: { projects: OptimizedResumeData['projects'] }) {
    if (!projects || projects.length === 0) return null

    return (
        <div style={{
            borderRadius: 10, border: `1px solid ${T.border}`, overflow: 'hidden',
            animation: 'optSlideUp 0.35s ease both 0.25s',
        }}>
            {/* Header */}
            <div style={{
                padding: '8px 12px', background: T.bgAlt,
                borderBottom: `1px solid ${T.borderLight}`,
                fontSize: '0.7rem', fontWeight: 700, color: T.text,
                display: 'flex', alignItems: 'center', gap: 6,
            }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.primary} strokeWidth="2.5">
                    <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>
                </svg>
                Refined Projects
                <span style={{
                    marginLeft: 'auto', fontSize: '0.575rem', fontWeight: 700,
                    padding: '2px 6px', borderRadius: 4,
                    background: `${T.primary}12`, color: T.primary,
                    border: `1px solid ${T.primary}20`,
                }}>{projects.length}</span>
            </div>

            {/* Project list */}
            <div style={{ background: T.surface, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {projects.map((proj, i) => (
                    <div key={i} style={{
                        paddingLeft: 10,
                        borderLeft: `2.5px solid ${T.primary}40`,
                        animation: `optSlideUp 0.25s ease both ${i * 0.07}s`,
                    }}>
                        <div style={{
                            fontSize: '0.7rem', fontWeight: 700, color: T.text, marginBottom: 4,
                            display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                            {proj.name}
                        </div>
                        {(proj.bullet_points || []).map((bp, j) => (
                            <div key={j} style={{
                                display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: j < (proj.bullet_points?.length ?? 0) - 1 ? 4 : 0,
                            }}>
                                <span style={{ color: T.primary, fontSize: '0.7rem', lineHeight: 1.55, flexShrink: 0 }}>·</span>
                                <span style={{ fontSize: '0.7rem', color: T.textSecondary, lineHeight: 1.55 }}>{bp}</span>
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    )
}

/* ─── AI Chat Panel (ResumeLM-style) ─── */
function AIChatPanel({ optimizedData, job, score, cached }: {
    optimizedData: OptimizedResumeData
    job: { title: string | null; company: string | null }
    score: number
    cached: boolean
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: T.surface }}>
            {/* Chat header */}
            <div style={{
                padding: '12px 16px', borderBottom: `1px solid ${T.borderLight}`,
                display: 'flex', alignItems: 'center', gap: 10,
            }}>
                <div style={{
                    width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                    background: `linear-gradient(135deg, ${T.primary}, #7c3aed)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                    </svg>
                </div>
                <div>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: T.text }}>AI Resume Assistant</div>
                    <div style={{ fontSize: '0.6rem', color: T.success, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: T.success }} />
                        Optimization complete
                    </div>
                </div>
            </div>

            {/* Messages scroll area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* User bubble */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{
                        maxWidth: '88%', padding: '9px 13px',
                        borderRadius: '14px 14px 4px 14px',
                        background: T.primary, color: 'white',
                        fontSize: '0.8rem', lineHeight: 1.5,
                    }}>
                        Optimize my resume for <strong>{job.title}</strong> at {job.company}
                    </div>
                </div>

                {/* AI avatar + messages */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <div style={{
                        width: 26, height: 26, borderRadius: 8, flexShrink: 0, marginTop: 2,
                        background: `linear-gradient(135deg, ${T.primary}, #7c3aed)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                        </svg>
                    </div>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {/* Intro */}
                        <div style={{
                            padding: '9px 12px', borderRadius: '14px 14px 14px 4px',
                            background: T.bgAlt, border: `1px solid ${T.borderLight}`,
                            fontSize: '0.8rem', color: T.textSecondary, lineHeight: 1.6,
                        }}>
                            I've tailored your resume for the <strong style={{ color: T.text }}>{job.title}</strong> role at <strong style={{ color: T.text }}>{job.company}</strong>. Here's what I changed:
                        </div>

                        {/* What changed */}
                        {(optimizedData.optimization_notes || []).length > 0 && (
                            <div style={{ borderRadius: 10, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
                                <div style={{
                                    padding: '8px 12px', background: T.bgAlt,
                                    borderBottom: `1px solid ${T.borderLight}`,
                                    fontSize: '0.7rem', fontWeight: 700, color: T.text,
                                    display: 'flex', alignItems: 'center', gap: 6,
                                }}>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.primary} strokeWidth="2.5">
                                        <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
                                    </svg>
                                    What Changed
                                </div>
                                <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                                    {optimizedData.optimization_notes.map((note, i) => (
                                        <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                                                <circle cx="12" cy="12" r="10" fill={T.successBg} stroke={T.success} strokeWidth="1.5"/>
                                                <path d="M8 12l3 3 5-5" stroke={T.success} strokeWidth="2" strokeLinecap="round"/>
                                            </svg>
                                            <span style={{ fontSize: '0.775rem', color: T.textSecondary, lineHeight: 1.5 }}>{note}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ATS Intelligence */}
                        {optimizedData.ats_feedback && (
                            <AtsIntelligenceCard feedback={optimizedData.ats_feedback} />
                        )}

                        {/* Score */}
                        <div style={{
                            padding: '9px 12px', borderRadius: '14px 14px 14px 4px',
                            background: T.bgAlt, border: `1px solid ${T.borderLight}`,
                            display: 'flex', alignItems: 'center', gap: 10,
                        }}>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: getScoreColor(score) }}>{score}%</div>
                            <div>
                                <div style={{ fontSize: '0.725rem', fontWeight: 700, color: T.text }}>Keyword Alignment</div>
                                <div style={{ fontSize: '0.6625rem', color: T.textMuted }}>
                                    {score >= 80 ? 'Excellent match ✨' : score >= 60 ? 'Good match 👍' : 'Moderate match'}
                                </div>
                            </div>
                        </div>

                        {/* Top skills applied */}
                        {(optimizedData.optimized_skills?.technical?.length ?? 0) > 0 && (
                            <div style={{
                                padding: '9px 12px', borderRadius: '14px 14px 14px 4px',
                                background: T.bgAlt, border: `1px solid ${T.borderLight}`,
                            }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: T.text, marginBottom: 7 }}>Top Skills Applied</div>
                                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                    {optimizedData.optimized_skills.technical.slice(0, 8).map((s, i) => (
                                        <span key={i} style={{
                                            fontSize: '0.6625rem', padding: '3px 9px', borderRadius: 20,
                                            background: `${T.primary}12`, color: T.primary,
                                            border: `1px solid ${T.primary}25`, fontWeight: 600,
                                        }}>{s}</span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Optimized summary */}
                        {optimizedData.optimized_summary && (
                            <div style={{
                                padding: '9px 12px', borderRadius: '14px 14px 14px 4px',
                                background: `${T.primary}06`, border: `1px solid ${T.primary}15`,
                            }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: T.primary, marginBottom: 5 }}>Optimized Summary</div>
                                <p style={{ fontSize: '0.775rem', color: T.textSecondary, lineHeight: 1.6, margin: 0, fontStyle: 'italic' }}>
                                    &ldquo;{optimizedData.optimized_summary}&rdquo;
                                </p>
                            </div>
                        )}

                        {/* Experience rewrites */}
                        {(optimizedData.optimized_experience?.length ?? 0) > 0 && (
                            <ExperienceRewritesCard experience={optimizedData.optimized_experience} />
                        )}

                        {/* Refined projects */}
                        {(optimizedData.projects?.length ?? 0) > 0 && (
                            <ProjectsCard projects={optimizedData.projects} />
                        )}

                        {cached && (
                            <div style={{ fontSize: '0.6625rem', color: T.textMuted, textAlign: 'center', paddingTop: 2 }}>
                                💾 Loaded from cache
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

/* ─── Review Tabs (3-tab panel replacing AIChatPanel) ─── */
type ReviewTab = 'overview' | 'before-after' | 'action-plan'

function ReviewTabs({ optimizedData, job, cached }: {
    optimizedData: OptimizedResumeData
    job: { title: string | null; company: string | null }
    cached: boolean
}) {
    const [activeTab, setActiveTab] = useState<ReviewTab>('overview')

    const tabs: { id: ReviewTab; label: string; icon: string }[] = [
        { id: 'overview', label: 'Overview', icon: '◎' },
        { id: 'before-after', label: 'Before vs After', icon: '⇄' },
        { id: 'action-plan', label: 'Action Plan', icon: '✦' },
    ]

    const beforeAfter: BeforeAfterRole[] = (optimizedData as any).before_after_experience || []
    const skillsDelta: SkillsDelta | undefined = (optimizedData as any).skills_delta
    const actionPlan: CareerActionPlan | undefined = (optimizedData as any).career_action_plan

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Tab strip */}
            <div style={{
                display: 'flex', gap: 4, padding: '12px 16px 0',
                borderBottom: `1px solid ${T.borderLight}`,
                background: T.surface, flexShrink: 0,
            }}>
                {tabs.map(tab => {
                    const isActive = activeTab === tab.id
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '8px 14px',
                                fontSize: '0.8rem', fontWeight: isActive ? 700 : 500,
                                fontFamily: "'DM Sans', sans-serif",
                                color: isActive ? T.primary : T.textMuted,
                                background: 'none', border: 'none', cursor: 'pointer',
                                borderBottom: isActive ? `2px solid ${T.primary}` : '2px solid transparent',
                                marginBottom: -1,
                                transition: 'all 0.15s ease',
                                whiteSpace: 'nowrap' as const,
                            }}
                        >
                            <span style={{ fontSize: '0.875rem' }}>{tab.icon}</span>
                            {tab.label}
                        </button>
                    )
                })}
                {cached && (
                    <span style={{
                        marginLeft: 'auto', alignSelf: 'center',
                        fontSize: '0.6rem', fontWeight: 700,
                        padding: '2px 8px', borderRadius: 4,
                        background: T.successBg, color: T.success,
                        border: `1px solid ${T.successBorder}`,
                    }}>Cached</span>
                )}
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, overflowY: 'auto' }}>

                {/* ── OVERVIEW TAB ── */}
                {activeTab === 'overview' && (
                    <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 28, animation: 'optSlideUp 0.3s ease both' }}>
                        {/* Intro paragraph — plain prose, no bubble */}
                        <p style={{
                            margin: 0,
                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                            fontSize: '0.875rem',
                            color: '#334155',
                            lineHeight: 1.6,
                            letterSpacing: '-0.005em',
                        }}>
                            I&apos;ve tailored your resume for{' '}
                            <strong style={{ color: T.text, fontWeight: 700 }}>{job.title}</strong> at{' '}
                            <strong style={{ color: T.primary, fontWeight: 700 }}>{job.company}</strong>.
                        </p>

                        {/* WHAT CHANGED — animated check list, hairline dividers */}
                        {(optimizedData.optimization_notes || []).length > 0 && (
                            <div>
                                <SectionEyebrow color={T.primary}>What Changed</SectionEyebrow>
                                <div>
                                    {optimizedData.optimization_notes.map((note, i) => (
                                        <div key={i} style={{
                                            display: 'flex', gap: 12, alignItems: 'flex-start',
                                            padding: '9px 0',
                                            borderBottom: i < optimizedData.optimization_notes.length - 1 ? `1px solid ${T.borderLight}` : 'none',
                                            animation: `optSlideUp 0.3s ease both ${i * 0.06}s`,
                                        }}>
                                            <div style={{ flexShrink: 0, marginTop: 2 }}>
                                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                                                    <circle cx="12" cy="12" r="10" fill={T.successBg} stroke={T.success} strokeWidth="1.5"/>
                                                    <path d="M8 12l3 3 5-5" stroke={T.success} strokeWidth="2"
                                                        strokeLinecap="round" strokeLinejoin="round"
                                                        style={{ strokeDasharray: 24, strokeDashoffset: 24, animation: `optCheckmark 0.35s ease both ${0.4 + i * 0.07}s` }} />
                                                </svg>
                                            </div>
                                            <span style={{
                                                fontFamily: "'Plus Jakarta Sans', sans-serif",
                                                fontSize: '0.8125rem',
                                                color: '#334155',
                                                lineHeight: 1.58,
                                                letterSpacing: '-0.005em',
                                            }}>
                                                {note}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* SKILLS REORDERED — 2-column with vertical hairline + reasoning */}
                        {skillsDelta && ((skillsDelta.prioritized || []).length > 0 || (skillsDelta.deprioritized || []).length > 0) && (
                            <div>
                                <SectionEyebrow color="#b45309">Skills Reordered</SectionEyebrow>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr', marginBottom: 14 }}>
                                    {/* Prioritized */}
                                    <div style={{ paddingRight: 20 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                                            <span style={{
                                                fontFamily: "'JetBrains Mono', monospace",
                                                fontSize: '0.5rem', fontWeight: 700,
                                                letterSpacing: '0.18em', textTransform: 'uppercase',
                                                color: T.success,
                                            }}>
                                                Prioritized
                                            </span>
                                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                                <path d="M5 8V2M2 5l3-3 3 3" stroke={T.success} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </div>
                                        {(skillsDelta.prioritized || []).map((s, i) => (
                                            <div key={i} style={{
                                                display: 'flex', alignItems: 'center', gap: 10,
                                                padding: '7px 0',
                                                borderBottom: i < (skillsDelta.prioritized || []).length - 1 ? `1px solid ${T.borderLight}` : 'none',
                                            }}>
                                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.success, flexShrink: 0 }} />
                                                <span style={{
                                                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                                                    fontSize: '0.8125rem', fontWeight: 600,
                                                    color: T.text, letterSpacing: '-0.005em',
                                                }}>
                                                    {s}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                    {/* Vertical hairline divider */}
                                    <div aria-hidden style={{ background: T.borderLight }} />
                                    {/* Moved Down */}
                                    <div style={{ paddingLeft: 20 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                                            <span style={{
                                                fontFamily: "'JetBrains Mono', monospace",
                                                fontSize: '0.5rem', fontWeight: 700,
                                                letterSpacing: '0.18em', textTransform: 'uppercase',
                                                color: T.textMuted,
                                            }}>
                                                Moved Down
                                            </span>
                                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                                <path d="M5 2v6M8 5L5 8 2 5" stroke={T.textMuted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </div>
                                        {(skillsDelta.deprioritized || []).map((s, i) => (
                                            <div key={i} style={{
                                                display: 'flex', alignItems: 'center', gap: 10,
                                                padding: '7px 0',
                                                borderBottom: i < (skillsDelta.deprioritized || []).length - 1 ? `1px solid ${T.borderLight}` : 'none',
                                            }}>
                                                {/* Amber dot signals "still a skill, just less relevant" — clearer than dead gray */}
                                                <span style={{
                                                    width: 6, height: 6, borderRadius: '50%',
                                                    background: '#f59e0b', flexShrink: 0,
                                                    boxShadow: '0 0 0 2px #fef3c7',
                                                }} />
                                                <span style={{
                                                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                                                    fontSize: '0.8125rem', fontWeight: 500,
                                                    color: '#1e293b',  // slate-800 — proper contrast on white
                                                    letterSpacing: '-0.005em',
                                                }}>
                                                    {s}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                {skillsDelta.reasoning && (
                                    <div style={{
                                        display: 'flex', alignItems: 'flex-start', gap: 10,
                                        padding: '12px 14px',
                                        background: '#f8fafc',
                                        border: `1px solid ${T.borderLight}`,
                                        borderLeft: `3px solid ${T.primary}`,
                                        borderRadius: 8,
                                    }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }} aria-hidden>
                                            <circle cx="12" cy="12" r="10" />
                                            <line x1="12" y1="16" x2="12" y2="12" />
                                            <line x1="12" y1="8" x2="12.01" y2="8" />
                                        </svg>
                                        <p style={{
                                            margin: 0,
                                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                                            fontSize: '0.8125rem',
                                            color: '#334155',  // slate-700 — readable, not faded
                                            lineHeight: 1.6,
                                            fontWeight: 500,
                                            letterSpacing: '-0.005em',
                                        }}>
                                            {skillsDelta.reasoning}
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ATS INTELLIGENCE */}
                        {optimizedData.ats_feedback && (
                            <div>
                                <SectionEyebrow>ATS Intelligence</SectionEyebrow>
                                <AtsIntelligenceCard feedback={optimizedData.ats_feedback} />
                            </div>
                        )}
                    </div>
                )}

                {/* ── BEFORE vs AFTER TAB ── */}
                {activeTab === 'before-after' && (
                    <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 24, animation: 'optSlideUp 0.3s ease both' }}>
                        {beforeAfter.length === 0 ? (
                            <div style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                justifyContent: 'center', padding: '60px 24px', textAlign: 'center',
                            }}>
                                <div style={{
                                    width: 64, height: 64, borderRadius: 20, marginBottom: 16,
                                    background: `${T.primary}10`, border: `2px dashed ${T.primary}30`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={`${T.primary}80`} strokeWidth="1.5">
                                        <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3m11 0h3a2 2 0 002-2v-3"/>
                                    </svg>
                                </div>
                                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: T.text, marginBottom: 6 }}>Before vs After Available After Regeneration</h4>
                                <p style={{ fontSize: '0.8rem', color: T.textMuted, maxWidth: 320, lineHeight: 1.5 }}>
                                    This data is only available for freshly generated resumes. Click Regenerate to produce a new version with full diff view.
                                </p>
                            </div>
                        ) : (
                            <>
                                {/* Column legend — Original (red) | Optimized (green) with hairline rule */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr' }}>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        paddingBottom: 10, paddingRight: 20,
                                        borderBottom: `1px solid ${T.border}`,
                                    }}>
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fca5a5', flexShrink: 0 }} />
                                        <span style={{
                                            fontFamily: "'JetBrains Mono', monospace",
                                            fontSize: '0.5rem', fontWeight: 700,
                                            letterSpacing: '0.2em', textTransform: 'uppercase',
                                            color: '#dc2626',
                                        }}>
                                            Original
                                        </span>
                                    </div>
                                    <div aria-hidden style={{ background: T.borderLight }} />
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        paddingBottom: 10, paddingLeft: 20,
                                        borderBottom: `1px solid ${T.border}`,
                                    }}>
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: T.success, flexShrink: 0 }} />
                                        <span style={{
                                            fontFamily: "'JetBrains Mono', monospace",
                                            fontSize: '0.5rem', fontWeight: 700,
                                            letterSpacing: '0.2em', textTransform: 'uppercase',
                                            color: T.success,
                                        }}>
                                            Optimized
                                        </span>
                                    </div>
                                </div>

                                {/* Role cards */}
                                {beforeAfter.map((role, ri) => (
                                    <div key={ri} style={{
                                        border: `1px solid ${T.border}`,
                                        borderRadius: 10, overflow: 'hidden',
                                        animation: `optSlideUp 0.3s ease both ${ri * 0.08}s`,
                                    }}>
                                        {/* Role header */}
                                        <div style={{
                                            padding: '10px 16px',
                                            borderBottom: `1px solid ${T.borderLight}`,
                                            background: T.bg,
                                            display: 'flex', alignItems: 'center', gap: 10,
                                        }}>
                                            <CompanyIcon company={role.company ?? null} size={30} />
                                            <div>
                                                <div style={{
                                                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                                                    fontSize: '0.875rem', fontWeight: 700,
                                                    color: T.text, lineHeight: 1.2,
                                                    letterSpacing: '-0.01em',
                                                }}>
                                                    {role.company}
                                                </div>
                                                <div style={{
                                                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                                                    fontSize: '0.75rem',
                                                    color: T.textSecondary,
                                                }}>
                                                    {role.title}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Bullet diff — side by side */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr' }}>
                                            {/* Original */}
                                            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                {(role.original_bullets || []).map((b, bi) => (
                                                    <div key={bi} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                                        <div style={{
                                                            width: 3, flexShrink: 0,
                                                            alignSelf: 'stretch', borderRadius: 2,
                                                            background: '#fca5a5', marginTop: 2,
                                                        }} />
                                                        <span style={{
                                                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                                                            fontSize: '0.78125rem',
                                                            color: T.textSecondary,
                                                            lineHeight: 1.58,
                                                            letterSpacing: '-0.005em',
                                                        }}>
                                                            {b}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                            <div aria-hidden style={{ background: T.borderLight }} />
                                            {/* Optimized */}
                                            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                {(role.optimized_bullets || []).map((b, bi) => (
                                                    <div key={bi} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                                        <div style={{
                                                            width: 3, flexShrink: 0,
                                                            alignSelf: 'stretch', borderRadius: 2,
                                                            background: T.success, marginTop: 2,
                                                        }} />
                                                        <span style={{
                                                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                                                            fontSize: '0.78125rem',
                                                            color: T.text,
                                                            lineHeight: 1.58,
                                                            letterSpacing: '-0.005em',
                                                        }}>
                                                            {b}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Changes summary */}
                                        {role.changes_summary && (
                                            <div style={{
                                                padding: '10px 16px',
                                                borderTop: `1px solid ${T.borderLight}`,
                                                background: T.bg,
                                            }}>
                                                <p style={{
                                                    margin: 0,
                                                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                                                    fontSize: '0.74rem',
                                                    color: T.primary,
                                                    lineHeight: 1.55,
                                                    fontStyle: 'italic',
                                                    letterSpacing: '-0.005em',
                                                }}>
                                                    {role.changes_summary}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                )}

                {/* ── ACTION PLAN TAB ── */}
                {activeTab === 'action-plan' && (
                    <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 28, animation: 'optSlideUp 0.3s ease both' }}>
                        {!actionPlan ? (
                            <div style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                justifyContent: 'center', padding: '60px 24px', textAlign: 'center',
                            }}>
                                <div style={{
                                    width: 64, height: 64, borderRadius: 20, marginBottom: 16,
                                    background: '#fffbeb', border: '2px dashed #fde68a',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 28,
                                }}>✦</div>
                                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: T.text, marginBottom: 6 }}>Action Plan Available After Regeneration</h4>
                                <p style={{ fontSize: '0.8rem', color: T.textMuted, maxWidth: 320, lineHeight: 1.5 }}>
                                    Regenerate your resume to get personalized certifications, project ideas, and quick wins based on the job requirements.
                                </p>
                            </div>
                        ) : (
                            <>
                                {/* Suggested Certifications */}
                                {(actionPlan.suggested_certifications || []).length > 0 && (
                                    <div>
                                        <SectionEyebrow color="#b45309">Suggested Certifications</SectionEyebrow>
                                        <div>
                                            {actionPlan.suggested_certifications.map((cert, i) => (
                                                <div key={i} style={{
                                                    display: 'flex', justifyContent: 'space-between',
                                                    alignItems: 'flex-start', gap: 16,
                                                    padding: '12px 0',
                                                    borderBottom: i < actionPlan.suggested_certifications.length - 1 ? `1px solid ${T.borderLight}` : 'none',
                                                    animation: `optSlideUp 0.3s ease both ${i * 0.07}s`,
                                                }}>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{
                                                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                                                            fontSize: '0.875rem', fontWeight: 700,
                                                            color: T.text, marginBottom: 4,
                                                            lineHeight: 1.3, letterSpacing: '-0.01em',
                                                        }}>
                                                            {cert.name}
                                                        </div>
                                                        <p style={{
                                                            margin: 0,
                                                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                                                            fontSize: '0.78125rem',
                                                            color: '#475569',
                                                            lineHeight: 1.58,
                                                            letterSpacing: '-0.005em',
                                                        }}>
                                                            {cert.reason}
                                                        </p>
                                                    </div>
                                                    {cert.effort && (
                                                        <span style={{
                                                            fontFamily: "'JetBrains Mono', monospace",
                                                            fontSize: '0.5625rem', fontWeight: 700,
                                                            letterSpacing: '0.08em',
                                                            padding: '3px 10px', borderRadius: 5,
                                                            background: '#fffbeb',
                                                            color: '#b45309',
                                                            border: '1px solid #fde68a',
                                                            flexShrink: 0,
                                                            whiteSpace: 'nowrap',
                                                        }}>
                                                            {cert.effort}
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Suggested Projects */}
                                {(actionPlan.suggested_projects || []).length > 0 && (
                                    <div>
                                        <SectionEyebrow color={T.primary}>Suggested Projects</SectionEyebrow>
                                        <div>
                                            {actionPlan.suggested_projects.map((proj, i) => (
                                                <div key={i} style={{
                                                    padding: '14px 0',
                                                    borderBottom: i < actionPlan.suggested_projects.length - 1 ? `1px solid ${T.borderLight}` : 'none',
                                                    animation: `optSlideUp 0.3s ease both ${i * 0.07}s`,
                                                }}>
                                                    <div style={{
                                                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                                                        fontSize: '0.875rem', fontWeight: 700,
                                                        color: T.primary, marginBottom: 5,
                                                        lineHeight: 1.3, letterSpacing: '-0.01em',
                                                    }}>
                                                        {proj.name}
                                                    </div>
                                                    <p style={{
                                                        margin: '0 0 8px',
                                                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                                                        fontSize: '0.78125rem',
                                                        color: '#334155',
                                                        lineHeight: 1.6,
                                                        letterSpacing: '-0.005em',
                                                    }}>
                                                        {proj.description}
                                                    </p>
                                                    {(proj.tech || []).length > 0 && (
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                                                            {proj.tech.map((t, ti) => (
                                                                <span key={ti} style={{
                                                                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                                                                    fontSize: '0.6875rem', fontWeight: 600,
                                                                    padding: '2px 9px', borderRadius: 5,
                                                                    background: '#eef4ff',
                                                                    color: T.primary,
                                                                    border: '1px solid #bfdbfe',
                                                                }}>
                                                                    {t}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {proj.impact && (
                                                        <p style={{
                                                            margin: 0,
                                                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                                                            fontSize: '0.74rem',
                                                            color: T.textSecondary,
                                                            lineHeight: 1.5,
                                                            fontStyle: 'italic',
                                                            letterSpacing: '-0.005em',
                                                        }}>
                                                            {proj.impact}
                                                        </p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Quick Wins */}
                                {(actionPlan.quick_wins || []).length > 0 && (
                                    <div>
                                        <SectionEyebrow color={T.success}>Quick Wins — Apply Today</SectionEyebrow>
                                        <div>
                                            {actionPlan.quick_wins.map((win, i) => (
                                                <div key={i} style={{
                                                    display: 'flex', gap: 12, alignItems: 'flex-start',
                                                    padding: '10px 0',
                                                    borderBottom: i < actionPlan.quick_wins.length - 1 ? `1px solid ${T.borderLight}` : 'none',
                                                    animation: `optSlideUp 0.3s ease both ${i * 0.07}s`,
                                                }}>
                                                    <div style={{
                                                        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                                                        background: T.success, color: 'white',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontFamily: "'JetBrains Mono', monospace",
                                                        fontSize: '0.5625rem', fontWeight: 800,
                                                        marginTop: 1,
                                                    }}>
                                                        {i + 1}
                                                    </div>
                                                    <span style={{
                                                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                                                        fontSize: '0.8125rem',
                                                        color: '#334155',
                                                        lineHeight: 1.6,
                                                        letterSpacing: '-0.005em',
                                                    }}>
                                                        {win}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

/* ─── PDF Preview Component (dynamic import) ─── */
function PdfPreviewEmbed({ resumeData, originalResume }: { resumeData: OptimizedResumeData; originalResume: ParsedResume | null }) {
    const [pdfUrl, setPdfUrl] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [pdfError, setPdfError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        async function loadPdf() {
            setLoading(true)
            setPdfError(null)
            try {
                const [renderer, pdfDoc] = await Promise.all([
                    import('@react-pdf/renderer'),
                    import('@/components/ResumeRenderer/PdfDocument'),
                ])
                if (cancelled) return

                const PdfComp = pdfDoc.default
                const openResume = mapToOpenResumeSchema(resumeData, originalResume)
                const doc = React.createElement(PdfComp, { resume: openResume })
                const blob = await renderer.pdf(doc as any).toBlob()
                if (cancelled) return

                const url = URL.createObjectURL(blob)
                setPdfUrl(url)
                setLoading(false)
            } catch (err: any) {
                console.error('PDF render error:', err)
                if (!cancelled) {
                    setPdfError(err?.message || 'Failed to render PDF')
                    setLoading(false)
                }
            }
        }
        loadPdf()
        return () => { cancelled = true }
    }, [resumeData, originalResume])

    if (loading) {
        return (
            <div style={{
                width: '100%', aspectRatio: '8.5/11',
                background: T.bgAlt, borderRadius: T.radius,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: `1px solid ${T.border}`,
            }}>
                <div style={{
                    width: 180, height: 14, borderRadius: 7,
                    background: `linear-gradient(90deg, ${T.border}, ${T.bgAlt}, ${T.border})`,
                    backgroundSize: '200% 100%',
                    animation: 'optShimmer 1.5s ease-in-out infinite',
                }} />
            </div>
        )
    }

    if (!pdfUrl) {
        return (
            <div style={{
                width: '100%', aspectRatio: '8.5/11',
                background: T.bgAlt, borderRadius: T.radius,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                border: `1px solid ${T.border}`, color: T.textMuted, fontSize: '0.875rem', gap: 8,
            }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/>
                </svg>
                <span>{pdfError ? `Preview error: ${pdfError}` : 'PDF preview unavailable'}</span>
            </div>
        )
    }

    return (
        <iframe
            src={pdfUrl}
            style={{
                width: '100%', aspectRatio: '8.5/11',
                border: `1px solid ${T.border}`,
                borderRadius: T.radius,
                background: 'white',
                boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
            }}
            title="Optimized Resume Preview"
        />
    )
}

/* ─── Download Button ─── */
function DownloadBtn({ resumeData, originalResume, name }: { resumeData: OptimizedResumeData; originalResume: ParsedResume | null; name: string }) {
    const [downloading, setDownloading] = useState(false)

    async function handleDownload() {
        setDownloading(true)
        try {
            const [renderer, pdfDoc] = await Promise.all([
                import('@react-pdf/renderer'),
                import('@/components/ResumeRenderer/PdfDocument'),
            ])
            const PdfComp = pdfDoc.default
            const openResume = mapToOpenResumeSchema(resumeData, originalResume)
            const doc = React.createElement(PdfComp, { resume: openResume })
            const blob = await renderer.pdf(doc as any).toBlob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${name.replace(/\s+/g, '_')}_Optimized_Resume.pdf`
            a.click()
            URL.revokeObjectURL(url)
        } catch (err) {
            console.error('Download error:', err)
        } finally {
            setDownloading(false)
        }
    }

    return (
        <button
            onClick={handleDownload}
            disabled={downloading}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '12px 28px', borderRadius: T.radiusSm,
                background: downloading ? T.textMuted : T.primary,
                color: 'white', fontWeight: 700, fontSize: '0.875rem',
                fontFamily: "'DM Sans', sans-serif",
                border: 'none', cursor: downloading ? 'wait' : 'pointer',
                boxShadow: downloading ? 'none' : T.primaryShadow,
                transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => { if (!downloading) { e.currentTarget.style.background = T.primaryDark; e.currentTarget.style.transform = 'translateY(-1px)' } }}
            onMouseLeave={e => { if (!downloading) { e.currentTarget.style.background = T.primary; e.currentTarget.style.transform = 'translateY(0)' } }}
        >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>
            </svg>
            {downloading ? 'Preparing PDF...' : 'Download Resume'}
        </button>
    )
}

/* ─── Main Page ─── */
function OptimizePageInner() {
    useInjectStyles()
    const { user } = useAuth()
    const router = useRouter()
    const searchParams = useSearchParams()
    const autoJobId = searchParams.get('jobId')

    const [resumes, setResumes] = useState<{ id: string; file_name: string | null; created_at: string }[]>([])
    const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null)
    const [optimizedList, setOptimizedList] = useState<OptimizedListItem[]>([])
    const [loadingOptimized, setLoadingOptimized] = useState(false)
    const [selected, setSelected] = useState<{ id: string; job: { id: string; title: string | null; company: string | null; location: string | null } } | null>(null)
    const [phase, setPhase] = useState<Phase>('idle')
    const [error, setError] = useState<string | null>(null)
    const [optimizedData, setOptimizedData] = useState<OptimizedResumeData | null>(null)
    const [cached, setCached] = useState(false)
    const [resumeId, setResumeId] = useState<string | null>(null)
    const [originalResume, setOriginalResume] = useState<ParsedResume | null>(null)
    const [elapsed, setElapsed] = useState(0)
    const timerRef = useRef<NodeJS.Timeout | null>(null)
    const [showTemplatePicker, setShowTemplatePicker] = useState(false)
    const [pendingGapData, setPendingGapData] = useState<Record<string, unknown> | null>(null)
    // Build Plan modal (recommendations shown before resume creation)
    const [showBuildPlan, setShowBuildPlan] = useState(false)
    const [buildPlan, setBuildPlan] = useState<BuildPlan | null>(null)
    const [buildPlanLoading, setBuildPlanLoading] = useState(false)
    const [buildPlanError, setBuildPlanError] = useState<string | null>(null)
    const autoTriggeredRef = useRef(false)

    // Load all user resumes on mount, default to primary resume
    useEffect(() => {
        async function load() {
            if (!user?.id) return
            try {
                const allResumes = await fetchResumes(user.id)
                setResumes(allResumes.map(r => {
                    // structured_data may come back as a double-stringified string
                    let sd = r.structured_data as any
                    if (typeof sd === 'string') {
                        try { sd = JSON.parse(sd) } catch { sd = null }
                        if (typeof sd === 'string') {
                            try { sd = JSON.parse(sd) } catch { sd = null }
                        }
                    }
                    const rawName = r.original_filename
                        || sd?.personal_info?.full_name
                        || sd?.name
                        || sd?.basics?.name
                        || null
                    const displayName = cleanDisplayName(rawName)
                    return { id: r.id, file_name: displayName, created_at: r.created_at ?? '' }
                }))
                const primaryId = getPrimaryResumeId() ?? allResumes[0]?.id ?? null
                if (primaryId) {
                    setSelectedResumeId(primaryId)
                    setResumeId(primaryId)
                    const r = await fetchResumeById(primaryId)
                    if (r?.structured_data) setOriginalResume(r.structured_data)
                }
            } catch (err) {
                console.error('Load error:', err)
            }
        }
        load()
    }, [user?.id])

    // Load optimized resumes for the selected resume
    useEffect(() => {
        if (!user?.id || !selectedResumeId) return
        setLoadingOptimized(true)
        fetchOptimizedResumesByResume(user.id, selectedResumeId)
            .then(rows => setOptimizedList(rows as OptimizedListItem[]))
            .catch(() => setOptimizedList([]))
            .finally(() => setLoadingOptimized(false))
    }, [user?.id, selectedResumeId])

    // Timer for loading animation
    useEffect(() => {
        if (phase === 'loading') {
            setElapsed(0)
            timerRef.current = setInterval(() => setElapsed(e => e + 100), 100)
        } else {
            if (timerRef.current) clearInterval(timerRef.current)
        }
        return () => { if (timerRef.current) clearInterval(timerRef.current) }
    }, [phase])

    // Auto-select from ?jobId URL param — check optimized list first, then allow generation
    useEffect(() => {
        if (!autoJobId || selected) return
        const item = optimizedList.find(it => it.job_id === autoJobId)
        if (item) handleSelectJob(item)
    }, [autoJobId, optimizedList, selected])

    // Auto-trigger generation if ?jobId is in URL but no optimized version exists yet
    useEffect(() => {
        if (!autoJobId || !selectedResumeId || autoTriggeredRef.current) return
        if (loadingOptimized) return
        const already = optimizedList.find(it => it.job_id === autoJobId)
        if (already) return // handleSelectJob will pick it up via the other effect
        if (phase !== 'idle' || optimizedData) return
        // No cached version — we need a job object to generate. Fetch it.
        autoTriggeredRef.current = true
        import('@/lib/api').then(({ fetchJobById }) => {
            fetchJobById(autoJobId).then(job => {
                if (!job) return
                setSelected({ id: autoJobId, job: { id: job.id, title: job.title ?? null, company: job.company ?? null, location: job.location ?? null } })
            })
        })
    }, [autoJobId, selectedResumeId, loadingOptimized, optimizedList, phase, optimizedData])

    // Open template picker — user picks template then navigates to resumes
    const handleGenerateResume = useCallback(() => {
        if (!optimizedData) return
        setShowTemplatePicker(true)
    }, [optimizedData])

    const handleTemplateSelect = useCallback((templateId: TemplateId) => {
        if (!optimizedData) return
        localStorage.setItem('jobscorer-resume-draft', JSON.stringify({ optimizedData, originalResume }))
        localStorage.setItem('jobscorer-template', templateId)
        setShowTemplatePicker(false)
        router.push('/dashboard/resumes')
    }, [optimizedData, originalResume, router])

    // Switch resume — reload list and clear current selection
    const handleResumeSwitch = useCallback(async (rid: string) => {
        setSelectedResumeId(rid)
        setResumeId(rid)
        setSelected(null)
        setOptimizedData(null)
        setPhase('idle')
        setError(null)
        try {
            const r = await fetchResumeById(rid)
            if (r?.structured_data) setOriginalResume(r.structured_data)
        } catch { /* ignore */ }
    }, [])

    // Select an already-generated optimized resume from the list
    const handleSelectJob = useCallback((item: OptimizedListItem) => {
        setSelected({ id: item.id, job: item.job })
        setOptimizedData(item.optimized_data as OptimizedResumeData)
        setCached(true)
        setPhase('done')
        setError(null)
        setPendingGapData(null)
    }, [])

    const refreshOptimizedList = useCallback(() => {
        if (!user?.id || !selectedResumeId) return
        fetchOptimizedResumesByResume(user.id, selectedResumeId)
            .then(rows => setOptimizedList(rows as OptimizedListItem[]))
            .catch(() => {})
    }, [user?.id, selectedResumeId])

    // Shared optimizer runner — invoked by the Build Plan modal (Confirm / Skip all).
    // Accepted items are folded into the resume; passing any forces a cache-bypassing re-run.
    const runOptimizer = useCallback(async (accepted: AcceptedRecommendation[]) => {
        if (!selected || !resumeId) return
        setShowBuildPlan(false)
        setPhase('loading')
        setError(null)
        setCached(false)
        try {
            const result = await triggerResumeOptimization({
                user_id: user?.id ?? '',
                resume_id: resumeId,
                job_id: selected.job.id,
                gap_data: pendingGapData as Record<string, any> | null,
                accepted_recommendations: accepted.length > 0 ? accepted : undefined,
                force_refresh: accepted.length > 0,
            })
            if (result.success && result.optimized_data) {
                setOptimizedData(result.optimized_data as OptimizedResumeData)
                setCached(!!result.cached)
                setPhase('done')
                refreshOptimizedList()
            } else {
                throw new Error('No optimization data returned')
            }
        } catch (err: any) {
            if (err instanceof RateLimitError) {
                setError(`Slow down — try again in ${err.retryAfterSec}s.`)
            } else {
                setError(err.message || 'Optimization failed')
            }
            setPhase('error')
        }
    }, [selected, resumeId, pendingGapData, user?.id, refreshOptimizedList])

    // Open the Build Plan modal: run gap detection first (unless already done),
    // then trigger Workflow 1 and show recommendations BEFORE resume creation.
    const openBuildPlan = useCallback(async () => {
        if (!selected || !resumeId) return

        // Gap form removed — users add missing certifications/achievements from the
        // Resumes section instead. Go straight to the Build Plan recommendations.

        // Show the modal in loading state and trigger Workflow 1.
        setShowBuildPlan(true)
        setBuildPlan(null)
        setBuildPlanError(null)
        setBuildPlanLoading(true)
        try {
            // Best-effort match enrichment — the workflow also reads these from Supabase.
            let gaps: import('@/lib/types').JobGap[] | null = null
            let matched: string[] | undefined
            let missing: string[] | undefined
            if (user?.id) {
                const supabase = createBrowserSupabase()
                const { data } = await supabase
                    .from('user_job_matches')
                    .select('matched_skills, missing_skills, gaps')
                    .eq('user_id', user.id)
                    .eq('job_id', selected.job.id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle()
                const row = data as { matched_skills: string[] | null; missing_skills: string[] | null; gaps: import('@/lib/types').JobGap[] | null } | null
                gaps = row?.gaps ?? null
                matched = row?.matched_skills ?? undefined
                missing = row?.missing_skills ?? undefined
            }
            const result = await triggerBuildPlan({
                resume_id: resumeId,
                job_id: selected.job.id,
                gaps,
                matched_skills: matched,
                missing_skills: missing,
                job_title: selected.job.title ?? undefined,
                company_name: selected.job.company ?? undefined,
            })
            if (result.success) {
                setBuildPlan(result.build_plan ?? { certifications: [], projects: [], learning_links: [], generated_at: '' })
            } else {
                setBuildPlanError('Could not generate recommendations.')
            }
        } catch (err: any) {
            if (err instanceof RateLimitError) {
                setBuildPlanError(`Slow down — try again in ${err.retryAfterSec}s.`)
            } else {
                setBuildPlanError(err?.message || 'Could not generate recommendations.')
            }
        } finally {
            setBuildPlanLoading(false)
        }
    }, [selected, resumeId, pendingGapData, user?.id])

    // Generate optimization
    const handleGenerate = useCallback(async (forceRefresh = false) => {
        if (!selected || !resumeId) return

        // Gap form removed — proceed straight to optimization.
        setPhase('loading')
        setError(null)
        setCached(false)
        try {
            const result = await triggerResumeOptimization({
                user_id: user?.id ?? '',
                resume_id: resumeId,
                job_id: selected.job.id,
                force_refresh: forceRefresh,
                gap_data: pendingGapData as Record<string, any> | null,
            })
            if (result.success && result.optimized_data) {
                setOptimizedData(result.optimized_data as OptimizedResumeData)
                setCached(!!result.cached)
                setPhase('done')
                refreshOptimizedList()
            } else {
                throw new Error('No optimization data returned')
            }
        } catch (err: any) {
            if (err instanceof RateLimitError) {
                setError(`Slow down — try again in ${err.retryAfterSec}s.`)
            } else {
                setError(err.message || 'Optimization failed')
            }
            setPhase('error')
        }
    }, [selected, resumeId, pendingGapData, user?.id, refreshOptimizedList])

    return (
        <div style={{ fontFamily: "'DM Sans', sans-serif", padding: '24px 28px' }}>
            {/* Template Picker Modal */}
            {showTemplatePicker && (
                <TemplatePickerModal
                    onSelect={handleTemplateSelect}
                    onClose={() => setShowTemplatePicker(false)}
                />
            )}


            {/* Build Plan Modal — recommendations shown before resume creation */}
            {showBuildPlan && selected && (
                <BuildPlanModal
                    buildPlan={buildPlan}
                    loading={buildPlanLoading}
                    error={buildPlanError}
                    jobId={selected.job.id}
                    onConfirm={runOptimizer}
                    onSkipAll={() => runOptimizer([])}
                    onClose={() => setShowBuildPlan(false)}
                />
            )}
            {/* Header */}
            <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <div style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: `linear-gradient(135deg, ${T.primary}, #3b82f6)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 2px 8px rgba(19,91,236,0.3)',
                    }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
                        </svg>
                    </div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: T.text, letterSpacing: '-0.03em' }}>
                        Resume Optimizer
                    </h1>
                </div>
                <p style={{ fontSize: '0.875rem', color: T.textSecondary, marginLeft: 42 }}>
                    Generate a tailored, ATS-optimized resume for any matched job
                </p>
            </div>

            {/* Two-Panel Layout */}
            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

                {/* ── LEFT PANEL: Generated Resumes ── */}
                <div style={{
                    width: 340, flexShrink: 0,
                    background: T.surface, borderRadius: T.radius,
                    border: `1px solid ${T.border}`,
                    boxShadow: T.shadow,
                    overflow: 'hidden',
                }}>
                    {/* Resume selector */}
                    {resumes.length > 1 && (
                        <div style={{ padding: '12px 14px', borderBottom: `1px solid ${T.borderLight}` }}>
                            <label style={{ fontSize: '0.6875rem', fontWeight: 700, color: T.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase' as const, display: 'block', marginBottom: 6 }}>
                                Resume
                            </label>
                            <select
                                value={selectedResumeId ?? ''}
                                onChange={e => handleResumeSwitch(e.target.value)}
                                style={{
                                    width: '100%', padding: '8px 10px', borderRadius: T.radiusSm,
                                    border: `1.5px solid ${T.border}`, background: T.bg,
                                    fontSize: '0.8125rem', color: T.text, fontFamily: "'DM Sans', sans-serif",
                                    cursor: 'pointer', outline: 'none',
                                }}
                            >
                                {resumes.map(r => (
                                    <option key={r.id} value={r.id}>
                                        {r.file_name ?? `Resume ${r.id.slice(0, 6)}`}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Panel header */}
                    <div style={{
                        padding: '14px 18px',
                        borderBottom: `1px solid ${T.borderLight}`,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                        <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: T.text }}>
                            Generated Resumes
                        </span>
                        <span style={{
                            fontSize: '0.6875rem', fontWeight: 600,
                            padding: '2px 10px', borderRadius: 20,
                            background: T.bgAlt, color: T.textMuted,
                        }}>
                            {optimizedList.length}
                        </span>
                    </div>

                    {/* Optimized resume list */}
                    <div style={{ maxHeight: 'calc(100vh - 320px)', overflowY: 'auto', padding: '8px 0' }}>
                        {loadingOptimized ? (
                            Array.from({ length: 3 }).map((_, i) => (
                                <div key={i} style={{ margin: '0 12px 8px', padding: '16px', borderRadius: 12, border: `1px solid ${T.borderLight}` }}>
                                    <div style={{ width: '60%', height: 12, borderRadius: 6, background: `linear-gradient(90deg, ${T.border}, ${T.bgAlt}, ${T.border})`, backgroundSize: '200% 100%', animation: 'optShimmer 1.5s ease-in-out infinite', marginBottom: 8 }} />
                                    <div style={{ width: '40%', height: 10, borderRadius: 5, background: `linear-gradient(90deg, ${T.border}, ${T.bgAlt}, ${T.border})`, backgroundSize: '200% 100%', animation: 'optShimmer 1.5s ease-in-out infinite 0.2s' }} />
                                </div>
                            ))
                        ) : optimizedList.length === 0 ? (
                            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                                <div style={{ fontSize: '2rem', marginBottom: 12 }}>📄</div>
                                <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: T.text, marginBottom: 6 }}>No generated resumes yet</p>
                                <p style={{ fontSize: '0.75rem', color: T.textMuted, lineHeight: 1.5, marginBottom: 16 }}>
                                    Click &quot;Optimize&quot; on a job in AI Matches or Company Intel to generate your first tailored resume.
                                </p>
                                <button
                                    onClick={() => router.push('/dashboard/matches')}
                                    style={{
                                        padding: '8px 16px', borderRadius: T.radiusSm,
                                        background: T.primaryGlow, border: `1.5px solid ${T.primary}30`,
                                        color: T.primary, fontWeight: 700, fontSize: '0.75rem',
                                        cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                                    }}
                                >
                                    Browse AI Matches →
                                </button>
                            </div>
                        ) : (
                            optimizedList.map((item, idx) => {
                                const job = item.job
                                const score = item.keyword_alignment_score ?? 0
                                const isSel = selected?.id === item.id
                                const date = item.updated_at ? new Date(item.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''
                                return (
                                    <div
                                        key={item.id}
                                        onClick={() => handleSelectJob(item)}
                                        style={{
                                            margin: '0 10px 6px', padding: '14px 16px',
                                            borderRadius: 12,
                                            border: `1.5px solid ${isSel ? T.primary : T.border}`,
                                            background: isSel ? T.primaryGlow : T.surface,
                                            cursor: 'pointer', transition: 'all 0.15s ease',
                                            boxShadow: isSel ? `0 0 0 3px ${T.primary}15` : 'none',
                                            animation: `optCardIn 0.35s ease both ${idx * 0.04}s`,
                                        }}
                                        onMouseEnter={e => { if (!isSel) { e.currentTarget.style.borderColor = `${T.primary}60`; e.currentTarget.style.background = T.bgAlt } }}
                                        onMouseLeave={e => { if (!isSel) { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.surface } }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                            <CompanyIcon company={job?.company ?? null} size={36} />
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                                                <MatchBadge score={score} />
                                                {date && <span style={{ fontSize: '0.6rem', color: T.textMuted }}>{date}</span>}
                                            </div>
                                        </div>
                                        <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: T.text, lineHeight: 1.3, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                                            {job?.title ?? 'Unknown Role'}
                                        </h3>
                                        <p style={{ fontSize: '0.75rem', color: T.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                                            {job?.company ?? 'Unknown'}{job?.location ? ` · ${job.location}` : ''}
                                        </p>
                                    </div>
                                )
                            })
                        )}
                    </div>

                </div>

                {/* ── RIGHT PANEL: Result ── */}
                <div style={{
                    flex: 1, minWidth: 0,
                    background: T.surface, borderRadius: T.radius,
                    border: `1px solid ${T.border}`,
                    boxShadow: T.shadow,
                    minHeight: 600, height: 'calc(100vh - 160px)',
                    overflow: 'hidden', display: 'flex', flexDirection: 'column',
                }}>
                    {/* ── IDLE STATE ── */}
                    {phase === 'idle' && !selected && <EmptyState />}

                    {/* ── IDLE with selection (no cache) ── */}
                    {phase === 'idle' && selected && (
                        <div style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            justifyContent: 'center', height: '100%', minHeight: 500,
                            padding: 48, textAlign: 'center',
                        }}>
                            <CompanyIcon company={selected.job.company} size={64} />
                            <h3 style={{
                                fontSize: '1.125rem', fontWeight: 700, color: T.text, marginTop: 20, marginBottom: 6,
                            }}>
                                {selected.job.title}
                            </h3>
                            <p style={{ fontSize: '0.875rem', color: T.primary, fontWeight: 600, marginBottom: 4 }}>
                                {selected.job.company}
                            </p>
                            <p style={{ fontSize: '0.8125rem', color: T.textMuted, marginBottom: 32 }}>
                                {selected.job.location}
                            </p>
                            <button
                                onClick={() => openBuildPlan()}
                                disabled={!resumeId}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 10,
                                    padding: '14px 32px', borderRadius: T.radiusSm,
                                    background: `linear-gradient(135deg, ${T.primary}, #3b82f6)`,
                                    color: 'white', fontWeight: 700, fontSize: '0.9375rem',
                                    fontFamily: "'DM Sans', sans-serif",
                                    border: 'none', cursor: resumeId ? 'pointer' : 'not-allowed',
                                    boxShadow: '0 4px 20px rgba(19,91,236,0.35)',
                                    transition: 'all 0.2s ease',
                                    opacity: resumeId ? 1 : 0.6,
                                    animation: 'optSlideUp 0.4s ease both 0.1s',
                                }}
                                onMouseEnter={e => { if (resumeId) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(19,91,236,0.45)' } }}
                                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(19,91,236,0.35)' }}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
                                </svg>
                                Generate Optimized Resume
                            </button>
                            {!resumeId && (
                                <p style={{ fontSize: '0.75rem', color: T.danger, marginTop: 10 }}>
                                    Upload a resume first
                                </p>
                            )}
                        </div>
                    )}

                    {/* ── LOADING STATE ── */}
                    {phase === 'loading' && <ProgressStepper elapsed={elapsed} />}

                    {/* ── ERROR STATE ── */}
                    {phase === 'error' && (
                        <div style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            justifyContent: 'center', height: '100%', minHeight: 400,
                            padding: 48, textAlign: 'center',
                        }}>
                            <div style={{
                                width: 64, height: 64, borderRadius: 20,
                                background: '#fef2f2', border: '2px solid #fecaca',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                marginBottom: 20,
                            }}>
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={T.danger} strokeWidth="2">
                                    <circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/>
                                </svg>
                            </div>
                            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: T.text, marginBottom: 8 }}>
                                Optimization Failed
                            </h3>
                            <p style={{
                                fontSize: '0.8125rem', color: T.textMuted, maxWidth: 400, lineHeight: 1.5,
                                marginBottom: 20,
                            }}>
                                {error || 'Something went wrong. Please try again.'}
                            </p>
                            <button
                                onClick={() => openBuildPlan()}
                                style={{
                                    padding: '10px 24px', borderRadius: T.radiusSm,
                                    background: T.primary, color: 'white',
                                    fontWeight: 700, fontSize: '0.875rem', border: 'none',
                                    cursor: 'pointer', boxShadow: T.primaryShadow,
                                    fontFamily: "'DM Sans', sans-serif",
                                }}
                            >
                                Try Again
                            </button>
                        </div>
                    )}

                    {/* ── DONE STATE ── */}
                    {phase === 'done' && optimizedData && (
                        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', animation: 'optSlideUp 0.4s ease both' }}>
                            {/* Top bar */}
                            <div style={{
                                padding: '14px 20px',
                                borderBottom: `1px solid ${T.borderLight}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                background: T.surface, flexShrink: 0,
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                                    <ScoreBlock score={optimizedData.keyword_alignment_score} size={64} />
                                    <div aria-hidden style={{
                                        width: 1, height: 38, background: T.borderLight,
                                    }} />
                                    <div>
                                        <h3 style={{
                                            fontSize: '1rem', fontWeight: 800, color: T.text,
                                            marginBottom: 3, letterSpacing: '-0.015em',
                                            fontFamily: "'Plus Jakarta Sans', 'DM Sans', sans-serif",
                                        }}>
                                            Resume Optimized
                                        </h3>
                                        <span style={{
                                            fontSize: '0.78125rem', color: T.textSecondary,
                                            fontFamily: "'Plus Jakarta Sans', 'DM Sans', sans-serif",
                                        }}>
                                            {selected?.job.title} <span style={{ color: T.textMuted, margin: '0 4px' }}>·</span> {selected?.job.company}
                                        </span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <button
                                        onClick={() => openBuildPlan()}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 7,
                                            padding: '10px 18px', borderRadius: T.radiusSm,
                                            border: `1.5px solid ${T.border}`,
                                            background: T.surface, color: T.textSecondary,
                                            fontWeight: 600, fontSize: '0.8125rem',
                                            fontFamily: "'DM Sans', sans-serif",
                                            cursor: 'pointer', transition: 'all 0.15s ease',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.borderColor = T.primary; e.currentTarget.style.color = T.primary; e.currentTarget.style.background = T.primaryGlow }}
                                        onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textSecondary; e.currentTarget.style.background = T.surface }}
                                    >
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
                                        </svg>
                                        Refine with Build Plan
                                    </button>
                                    <button
                                        onClick={() => handleGenerate(true)}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 7,
                                            padding: '10px 18px', borderRadius: T.radiusSm,
                                            border: `1.5px solid ${T.border}`,
                                            background: T.surface, color: T.textSecondary,
                                            fontWeight: 600, fontSize: '0.8125rem',
                                            fontFamily: "'DM Sans', sans-serif",
                                            cursor: 'pointer', transition: 'all 0.15s ease',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.borderColor = T.primary; e.currentTarget.style.color = T.primary; e.currentTarget.style.background = T.primaryGlow }}
                                        onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textSecondary; e.currentTarget.style.background = T.surface }}
                                    >
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                                        </svg>
                                        Regenerate
                                    </button>
                                    <button
                                        onClick={handleGenerateResume}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 8,
                                            padding: '11px 22px', borderRadius: T.radiusSm,
                                            background: `linear-gradient(135deg, ${T.primary}, ${T.primaryDark})`,
                                            color: 'white', fontWeight: 700, fontSize: '0.875rem',
                                            fontFamily: "'DM Sans', sans-serif",
                                            border: 'none', cursor: 'pointer',
                                            boxShadow: T.primaryShadow,
                                            transition: 'all 0.2s ease',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(19,91,236,0.4)' }}
                                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = T.primaryShadow }}
                                    >
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
                                        </svg>
                                        Build My Resume
                                    </button>
                                </div>
                            </div>

                            {/* 3-Tab Review Panel */}
                            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                <ReviewTabs
                                    optimizedData={optimizedData}
                                    job={{ title: selected?.job.title ?? null, company: selected?.job.company ?? null }}
                                    cached={cached}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default function OptimizePage() {
    return (
        <Suspense fallback={<div style={{ padding: 40 }}>Loading...</div>}>
            <OptimizePageInner />
        </Suspense>
    )
}

