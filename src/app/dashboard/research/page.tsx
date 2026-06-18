'use client'

import { Suspense, useEffect, useState, useRef, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import type { CompanyResearch, AiAnalysis, QuickIntel, Resume } from '@/lib/types'
import { useAuth } from '@/components/providers/AuthProvider'
import { createClient } from '@/lib/supabase/client'
import { addPending, removePending } from '@/lib/pendingResearch'
import {
    fetchResumes,
    fetchResearchHistory,
    fetchResearchCountsByResume,
    getPrimaryResumeId,
} from '@/lib/api'

/* ── Types ── */
interface JobMatch {
    id: string
    job_id: string
    relevance_score: number
    recommendation: string | null
    /** Carried through from research history so we can register pending
     *  research entries with the right resume tag. */
    resume_id?: string | null
    job: {
        title: string
        company: string
        location: string | null
        experience_level: string | null
    } | null
}

// Map a research-history row into the sidebar's JobMatch shape. Shared by the
// initial load and the post-completion refresh so they can't drift apart.
function historyRowToJobMatch(r: {
    analysis_id: string; job_id: string | null; match_score: number | null
    resume_id: string | null; job_title: string | null; company_name: string; job_location: string | null
}): JobMatch {
    return {
        id: r.analysis_id,
        job_id: r.job_id ?? r.analysis_id,
        relevance_score: r.match_score ?? 0,
        recommendation: null,
        resume_id: r.resume_id ?? null,
        job: {
            title: r.job_title ?? 'Job',
            company: r.company_name,
            location: r.job_location,
            experience_level: null,
        },
    }
}

/* ── Animated score counter ── */
function AnimatedScore({ value }: { value: number }) {
    const [display, setDisplay] = useState(0)
    useEffect(() => {
        let frame: number
        const start = performance.now()
        const duration = 1200
        function tick(now: number) {
            const p = Math.min((now - start) / duration, 1)
            const eased = 1 - Math.pow(1 - p, 3)
            setDisplay(Math.round(eased * value))
            if (p < 1) frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(frame)
    }, [value])
    return <span>{display}</span>
}

/* ── Score ring badge ── */
function ScoreRing({ score, size = 44 }: { score: number; size?: number }) {
    const r = (size - 6) / 2
    const circ = 2 * Math.PI * r
    const offset = circ * (1 - score / 100)
    const color = score >= 70 ? '#059669' : score >= 50 ? '#d97706' : '#dc2626'
    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="transparent" stroke="#e8edf2" strokeWidth="3" />
            <circle cx={size / 2} cy={size / 2} r={r} fill="transparent"
                stroke={color} strokeWidth="3" strokeLinecap="round"
                strokeDasharray={circ} strokeDashoffset={offset}
                style={{ transition: 'stroke-dashoffset 0.8s ease' }}
            />
        </svg>
    )
}

/* ═══════════════════════════════════════════════════════
   RESUME-SCOPED RESEARCH HISTORY
   The sidebar shows researches done with the SELECTED resume,
   not job matches in general. Mirrors the matches-page selector.
═══════════════════════════════════════════════════════ */

function resumeDisplayName(r: Resume): string {
    const sd: any = r.structured_data
    let parsed: any = sd
    if (typeof sd === 'string') {
        try {
            const once = JSON.parse(sd)
            parsed = typeof once === 'string' ? JSON.parse(once) : once
        } catch { parsed = null }
    }
    if (parsed && typeof parsed === 'object') {
        if (typeof parsed.name === 'string' && parsed.name.trim()) return parsed.name.trim()
        const pi = parsed.personal_info
        if (pi && typeof pi.full_name === 'string' && pi.full_name.trim()) return pi.full_name.trim()
    }
    if (r.original_filename) return r.original_filename.replace(/\.(pdf|docx?|txt)$/i, '')
    return `Resume · ${r.id.slice(0, 6)}`
}

function resumeRoleLabel(r: Resume): string {
    const sd: any = r.structured_data
    let parsed: any = sd
    if (typeof sd === 'string') {
        try {
            const once = JSON.parse(sd)
            parsed = typeof once === 'string' ? JSON.parse(once) : once
        } catch { parsed = null }
    }
    if (!parsed || typeof parsed !== 'object') return 'Resume'
    const workArr = Array.isArray(parsed.work_history)
        ? parsed.work_history
        : Array.isArray(parsed.work_experience) ? parsed.work_experience : []
    if (workArr.length > 0 && typeof workArr[0]?.title === 'string') return workArr[0].title
    const skills = parsed.skills?.technical || parsed.technical_skills
    if (Array.isArray(skills) && skills.length > 0) return `${skills[0]} candidate`
    return 'Recent graduate'
}

function DocIcon({ size = 18, color = '#374151' }: { size?: number; color?: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
            <path d="M14 3v6h6" />
            <line x1="8" y1="13" x2="14" y2="13" />
            <line x1="8" y1="17" x2="14" y2="17" />
        </svg>
    )
}

function StarBadge({ size = 11 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" strokeWidth="1.5" strokeLinejoin="round" aria-label="Primary resume">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
    )
}

function ResumeSelector({
    resumes,
    selectedResumeId,
    onSelect,
    researchCountByResume,
    primaryResumeId,
    loading,
}: {
    resumes: Resume[]
    selectedResumeId: string | null
    onSelect: (id: string) => void
    researchCountByResume: Record<string, number>
    primaryResumeId: string | null
    loading: boolean
}) {
    const [open, setOpen] = useState(false)
    const wrapperRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        const handler = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
        }
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
        document.addEventListener('mousedown', handler)
        document.addEventListener('keydown', esc)
        return () => {
            document.removeEventListener('mousedown', handler)
            document.removeEventListener('keydown', esc)
        }
    }, [open])

    const selected = resumes.find(r => r.id === selectedResumeId) ?? null
    const totalResearches = Object.values(researchCountByResume).reduce((a, b) => a + b, 0)

    if (loading) {
        return (
            <div style={{
                padding: '12px 14px', background: '#f3f4f6', borderRadius: 10,
                marginBottom: 14, fontSize: '0.75rem', color: '#9ca3af', fontWeight: 500,
            }}>Loading resumes…</div>
        )
    }
    if (resumes.length === 0) {
        return (
            <Link href="/dashboard/upload" style={{
                display: 'block', padding: '12px 14px', background: '#f9fafb',
                border: '1px dashed #d1d5db', borderRadius: 10, marginBottom: 14,
                fontSize: '0.78rem', color: '#6b7280', textDecoration: 'none', fontWeight: 500,
                textAlign: 'center',
            }}>Upload a resume to start researching →</Link>
        )
    }

    return (
        <div ref={wrapperRef} style={{ position: 'relative', marginBottom: 14 }}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-haspopup="listbox"
                aria-expanded={open}
                style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 11,
                    padding: '11px 12px 11px 14px', background: 'white',
                    border: open ? '1.5px solid #135bec' : '1.5px solid #e5e7eb',
                    borderRadius: 11, cursor: 'pointer', textAlign: 'left',
                    fontFamily: "'Manrope', sans-serif",
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                    boxShadow: open
                        ? '0 0 0 3px rgba(19,91,236,0.12), 0 1px 3px rgba(0,0,0,0.04)'
                        : '0 1px 3px rgba(0,0,0,0.04)',
                    position: 'relative', overflow: 'hidden',
                }}
                onMouseEnter={e => { if (!open) e.currentTarget.style.borderColor = '#c7d8f8' }}
                onMouseLeave={e => { if (!open) e.currentTarget.style.borderColor = '#e5e7eb' }}
            >
                <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: '#135bec' }} />
                <div style={{
                    flexShrink: 0, width: 34, height: 34, borderRadius: 9,
                    background: 'linear-gradient(135deg, #eef4ff 0%, #dbe7ff 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <DocIcon size={17} color="#135bec" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                        fontSize: '0.6125rem', fontWeight: 700, color: '#9ca3af',
                        letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2,
                    }}>Researches for</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                            fontSize: '0.875rem', fontWeight: 700, color: '#111827',
                            letterSpacing: '-0.01em',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            maxWidth: 180,
                        }}>{selected ? resumeDisplayName(selected) : 'Select a resume'}</span>
                        {selected && primaryResumeId === selected.id && <StarBadge />}
                    </div>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280"
                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s ease' }}>
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>

            {open && (
                <div role="listbox" style={{
                    position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
                    background: 'white', border: '1px solid #e5e7eb', borderRadius: 11,
                    boxShadow: '0 10px 30px rgba(15,23,42,0.10), 0 4px 10px rgba(15,23,42,0.06)',
                    padding: 6, zIndex: 50, animation: 'rsDropIn 0.18s ease-out',
                    maxHeight: 320, overflowY: 'auto',
                }}>
                    {resumes.map(r => {
                        const isSelected = r.id === selectedResumeId
                        const isPrimary = r.id === primaryResumeId
                        const count = researchCountByResume[r.id] ?? 0
                        return (
                            <button key={r.id} type="button" role="option" aria-selected={isSelected}
                                onClick={() => { onSelect(r.id); setOpen(false) }}
                                style={{
                                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '10px 10px',
                                    background: isSelected ? '#eef4ff' : 'transparent',
                                    border: 'none', borderRadius: 8, cursor: 'pointer',
                                    textAlign: 'left', fontFamily: "'Manrope', sans-serif",
                                    transition: 'background 0.12s', position: 'relative',
                                }}
                                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#f9fafb' }}
                                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                            >
                                <div style={{
                                    flexShrink: 0, width: 28, height: 28, borderRadius: 7,
                                    background: isSelected ? '#dbe7ff' : '#f3f4f6',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <DocIcon size={14} color={isSelected ? '#135bec' : '#6b7280'} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                        <span style={{
                                            fontSize: '0.83rem', fontWeight: isSelected ? 700 : 600,
                                            color: isSelected ? '#0f172a' : '#1f2937',
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                            letterSpacing: '-0.005em',
                                        }}>{resumeDisplayName(r)}</span>
                                        {isPrimary && <StarBadge />}
                                    </div>
                                    <div style={{
                                        fontSize: '0.71rem', color: '#9ca3af', marginTop: 1,
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    }}>{resumeRoleLabel(r)}</div>
                                </div>
                                <span style={{
                                    flexShrink: 0, fontSize: '0.68rem', fontWeight: 700,
                                    padding: '3px 8px', borderRadius: 999,
                                    background: count > 0 ? (isSelected ? '#135bec' : '#f3f4f6') : 'transparent',
                                    color: count > 0 ? (isSelected ? 'white' : '#6b7280') : '#d1d5db',
                                    minWidth: 22, textAlign: 'center', letterSpacing: '0.02em',
                                }}>{count}</span>
                            </button>
                        )
                    })}
                    {totalResearches === 0 && (
                        <div style={{
                            padding: '12px 10px', fontSize: '0.72rem', color: '#9ca3af',
                            textAlign: 'center', fontStyle: 'italic',
                        }}>
                            No researches yet. Run Company Research from <Link href="/dashboard/matches" style={{ color: '#135bec', textDecoration: 'none', fontWeight: 600 }}>Matches</Link>.
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

/* ── Left panel: Jobs list ── */
function JobsPanel({
    matches,
    loading,
    selectedJobId,
    onSelect,
    resumeSelector,
}: {
    matches: JobMatch[]
    loading: boolean
    selectedJobId: string | null
    onSelect: (match: JobMatch) => void
    resumeSelector?: React.ReactNode
}) {
    return (
        <aside className="ci-jobs-panel" style={{
            width: 380,
            flexShrink: 0,
            borderRight: '1px solid #e8edf2',
            background: '#fafbfc',
            overflowY: 'auto',
            height: 'calc(100vh - 64px)',
            position: 'sticky',
            top: 64,
            display: 'flex',
            flexDirection: 'column',
        }}>
            {/* Header */}
            <div style={{
                padding: '20px 24px 16px',
                borderBottom: '1px solid #e8edf2',
                background: '#fff',
                position: 'sticky',
                top: 0,
                zIndex: 1,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                        width: 34, height: 34, borderRadius: 10,
                        background: 'linear-gradient(135deg, #135bec, #6410d5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                    }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                            <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
                        </svg>
                    </div>
                    <div>
                        <p style={{
                            fontFamily: "'Outfit', sans-serif",
                            fontSize: '0.925rem', fontWeight: 700, color: '#101c2e',
                            margin: 0, lineHeight: 1.2,
                        }}>Research History</p>
                        <p style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: '0.6rem', fontWeight: 600, color: '#8896a8',
                            textTransform: 'uppercase', letterSpacing: '0.09em',
                            margin: 0,
                        }}>{matches.length} {matches.length === 1 ? 'research' : 'researches'}</p>
                    </div>
                </div>
                {resumeSelector && <div style={{ marginTop: 14 }}>{resumeSelector}</div>}
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px' }}>
                {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} style={{
                            margin: '0 0 8px',
                            height: 88,
                            borderRadius: 12,
                            background: 'linear-gradient(90deg, #f0f2f5 25%, #e8ebee 50%, #f0f2f5 75%)',
                            backgroundSize: '400% 100%',
                            animation: 'ci-shimmer 1.4s ease infinite',
                        }} />
                    ))
                ) : matches.length === 0 ? (
                    <div style={{
                        padding: '32px 16px',
                        textAlign: 'center',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                    }}>
                        <div style={{
                            width: 40, height: 40, borderRadius: 12,
                            background: 'rgba(219,225,255,0.40)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#135bec" strokeWidth="2">
                                <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/>
                            </svg>
                        </div>
                        <div>
                            <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#101c2e', margin: '0 0 4px' }}>No researches yet</p>
                            <p style={{ fontSize: '0.725rem', color: '#8896a8', margin: 0 }}>
                                Run Company Research on a job from the{' '}
                                <Link href="/dashboard/matches" style={{ color: '#135bec', fontWeight: 600, textDecoration: 'none' }}>Matches page</Link>
                            </p>
                        </div>
                    </div>
                ) : (
                    matches.map((match) => {
                        const isSelected = match.job_id === selectedJobId
                        const score = match.relevance_score
                        const scoreColor = score >= 70 ? '#059669' : score >= 50 ? '#d97706' : '#dc2626'

                        return (
                            <button
                                key={match.id}
                                onClick={() => onSelect(match)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 14,
                                    width: '100%',
                                    padding: '14px 14px',
                                    borderRadius: 12,
                                    border: isSelected
                                        ? '1.5px solid rgba(19,91,236,0.30)'
                                        : '1.5px solid transparent',
                                    background: isSelected
                                        ? 'linear-gradient(135deg, rgba(19,91,236,0.07), rgba(100,16,213,0.04))'
                                        : 'transparent',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    marginBottom: 4,
                                    transition: 'all 0.15s ease',
                                    position: 'relative',
                                    overflow: 'hidden',
                                }}
                                onMouseEnter={e => {
                                    if (!isSelected) {
                                        const el = e.currentTarget as HTMLButtonElement
                                        el.style.background = 'rgba(19,91,236,0.04)'
                                        el.style.borderColor = 'rgba(19,91,236,0.14)'
                                    }
                                }}
                                onMouseLeave={e => {
                                    if (!isSelected) {
                                        const el = e.currentTarget as HTMLButtonElement
                                        el.style.background = 'transparent'
                                        el.style.borderColor = 'transparent'
                                    }
                                }}
                            >
                                {/* Active indicator */}
                                {isSelected && (
                                    <div style={{
                                        position: 'absolute', left: 0, top: 4, bottom: 4,
                                        width: 3, borderRadius: '0 2px 2px 0',
                                        background: 'linear-gradient(180deg, #135bec, #6410d5)',
                                    }} />
                                )}

                                {/* Score ring */}
                                <div style={{ position: 'relative', flexShrink: 0 }}>
                                    <ScoreRing score={score} size={52} />
                                    <span style={{
                                        position: 'absolute', inset: 0,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontFamily: "'JetBrains Mono', monospace",
                                        fontSize: '0.7rem', fontWeight: 700, color: scoreColor,
                                    }}>{score}</span>
                                </div>

                                {/* Job info */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{
                                        fontFamily: "'Outfit', sans-serif",
                                        fontSize: '0.9rem', fontWeight: 700,
                                        color: isSelected ? '#0045bd' : '#101c2e',
                                        margin: '0 0 3px',
                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                        lineHeight: 1.3,
                                    }}>{match.job?.company || 'Unknown Company'}</p>
                                    <p style={{
                                        fontSize: '0.825rem', fontWeight: 500,
                                        color: '#64748b',
                                        margin: '0 0 4px',
                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                    }}>{match.job?.title || 'Job'}</p>
                                    {match.job?.location && (
                                        <p style={{
                                            display: 'flex', alignItems: 'center', gap: 4,
                                            fontSize: '0.725rem', color: '#94a3b8', margin: 0,
                                        }}>
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1118 0z"/><circle cx="12" cy="10" r="3"/>
                                            </svg>
                                            {match.job.location}
                                        </p>
                                    )}
                                </div>
                            </button>
                        )
                    })
                )}
            </div>
        </aside>
    )
}

/* ── Main page wrapper ── */
export default function CompanyIntelPageWrapper() {
    return (
        <Suspense fallback={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 64px)' }}>
                <div style={{ width: 28, height: 28, border: '3px solid #dbe1ff', borderTopColor: '#135bec', borderRadius: '50%', animation: 'ci-spin 0.8s linear infinite' }} />
                <style>{`@keyframes ci-spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        }>
            <CompanyIntelPage />
        </Suspense>
    )
}

/* ═══════════════════════════════════════════════════════════════
   V3 "Kroll Report" components — full-white redesign
   Spec from claude.ai/design bundle: white cards + #135bec accent,
   Plus Jakarta Sans + JetBrains Mono. Pixel-faithful to intel-v3.jsx
   with our colour palette and our ai_analysis data shape.
   ═══════════════════════════════════════════════════════════════ */

const V3_K_MONO = "'JetBrains Mono', monospace"
const V3_K_SANS = "'Plus Jakarta Sans', sans-serif"
const V3_CARD_STYLE: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 12,
    padding: '16px 20px',
    boxShadow: '0 1px 3px rgba(15,23,42,.05), 0 4px 20px rgba(15,23,42,.04)',
}

function V3Label({ children, color = '#135bec', size = 12 }: { children: React.ReactNode; color?: string; size?: number }) {
    return (
        <div style={{
            fontFamily: V3_K_MONO, fontSize: size, fontWeight: 700,
            letterSpacing: '0.15em', textTransform: 'uppercase', color,
            display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>{children}</div>
    )
}

interface TechStack {
    languages?: string[]
    frameworks?: string[]
    tools?: string[]
    cloud?: string[]
    databases?: string[]
}

function V3TechStack({
    techStack, roleTools, jdRequirements, niceToHaves, matchingSkills, workStyle, hiringPace,
}: {
    techStack: TechStack
    roleTools: string[]
    jdRequirements: string[]
    niceToHaves: string[]
    matchingSkills: string[]
    workStyle: string | null
    hiringPace: string | null
}) {
    const categories = [
        { cat: 'LANGUAGES', items: techStack.languages || [] },
        { cat: 'FRAMEWORKS', items: techStack.frameworks || [] },
        { cat: 'TOOLS', items: techStack.tools || [] },
        { cat: 'CLOUD', items: techStack.cloud || [] },
        { cat: 'DATABASES', items: techStack.databases || [] },
    ].filter(c => c.items.length > 0)

    const allTools = categories.flatMap(c => c.items)
    const matchSet = matchingSkills.map(s => s.toLowerCase())
    const hasSkill = (item: string) => {
        const lower = item.toLowerCase()
        return matchSet.some(s => s.includes(lower) || lower.includes(s))
    }
    const matchCount = allTools.filter(t => hasSkill(t)).length

    const catMeta: Record<string, { color: string; bg: string }> = {
        LANGUAGES:  { color: '#135bec', bg: '#eff6ff' },
        FRAMEWORKS: { color: '#7c3aed', bg: '#f5f3ff' },
        TOOLS:      { color: '#c2410c', bg: '#fff7ed' },
        CLOUD:      { color: '#0f766e', bg: '#f0fdfa' },
        DATABASES:  { color: '#0369a1', bg: '#f0f9ff' },
    }

    if (categories.length === 0 && roleTools.length === 0 && jdRequirements.length === 0) return null

    const showFooter = workStyle || hiringPace

    return (
        <div style={{ ...V3_CARD_STYLE, padding: 0, overflow: 'hidden', marginBottom: 10 }} className="ci-fade">
            {/* Header band */}
            <div style={{
                padding: '13px 20px',
                borderBottom: '1px solid #f1f5f9',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
            }}>
                <V3Label color="#135bec" size={13}>What They Use &amp; Expect</V3Label>
                {allTools.length > 0 && (
                    <span style={{
                        fontFamily: V3_K_MONO, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
                        textTransform: 'uppercase', color: '#16a34a',
                        background: '#f0fdf4', border: '1px solid #bbf7d0',
                        padding: '3px 10px', borderRadius: 99,
                    }}>{matchCount} / {allTools.length} tools matched</span>
                )}
            </div>

            <div style={{ padding: '14px 20px 16px' }}>
                {/* Role-specific tools strip — surfaces ai_analysis.role_tools above the company-wide landscape */}
                {roleTools.length > 0 && (
                    <div style={{
                        marginBottom: 14, padding: '10px 12px',
                        background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 9,
                    }}>
                        <V3Label color="#135bec" size={11}>Tools Used In This Role</V3Label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
                            {roleTools.map((t, i) => (
                                <span key={i} style={{
                                    padding: '4px 11px', borderRadius: 99,
                                    background: '#fff', color: '#135bec',
                                    border: '1px solid #135bec',
                                    fontFamily: V3_K_MONO, fontSize: 13, fontWeight: 600,
                                }}>{t}</span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Tech landscape */}
                {categories.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
                        {categories.map((row) => {
                            const meta = catMeta[row.cat] || { color: '#64748b', bg: '#f8fafc' }
                            const catMatched = row.items.filter(t => hasSkill(t)).length
                            return (
                                <div key={row.cat} style={{
                                    display: 'grid', gridTemplateColumns: '70px 1fr 38px',
                                    gap: 10, alignItems: 'center',
                                    padding: '8px 0',
                                    borderBottom: '1px solid #f8fafc',
                                }}>
                                    <span style={{
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                        padding: '4px 0', borderRadius: 6,
                                        background: meta.bg, color: meta.color,
                                        fontFamily: V3_K_MONO, fontSize: 11, fontWeight: 700,
                                        letterSpacing: '0.1em', textTransform: 'uppercase',
                                        textAlign: 'center',
                                    }}>{row.cat}</span>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                        {row.items.map(item => {
                                            const matched = hasSkill(item)
                                            return (
                                                <span key={item} style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: 5,
                                                    padding: '4px 10px', borderRadius: 6,
                                                    background: matched ? '#f0fdf4' : '#f8fafc',
                                                    border: `1px solid ${matched ? '#86efac' : '#e2e8f0'}`,
                                                    color: matched ? '#166534' : '#475569',
                                                    fontFamily: V3_K_MONO, fontSize: 13,
                                                    fontWeight: matched ? 700 : 500,
                                                }}>
                                                    {matched ? (
                                                        <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                                                            <path d="M1.5 4.5L3.5 6.5L7.5 2" stroke="#16a34a" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                                                        </svg>
                                                    ) : (
                                                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#cbd5e1', flexShrink: 0, display: 'inline-block' }} />
                                                    )}
                                                    {item}
                                                </span>
                                            )
                                        })}
                                    </div>
                                    <span style={{
                                        fontFamily: V3_K_MONO, fontSize: 11,
                                        color: catMatched === row.items.length ? '#16a34a' : '#94a3b8',
                                        letterSpacing: '0.04em', textAlign: 'right', fontWeight: 600,
                                    }}>{catMatched}/{row.items.length}</span>
                                </div>
                            )
                        })}
                    </div>
                )}

                {/* Must Have + Good To Have */}
                {(jdRequirements.length > 0 || niceToHaves.length > 0) && (
                    <div className="ci-req-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        {jdRequirements.length > 0 && (
                            <div style={{
                                padding: '12px 14px', borderRadius: 9,
                                border: '1px solid #fecaca', background: '#fffafa',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#dc2626', flexShrink: 0, display: 'inline-block' }} />
                                    <V3Label color="#dc2626" size={11}>Must Have</V3Label>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                                    {jdRequirements.map((req, i) => (
                                        <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                                            <span style={{
                                                fontFamily: V3_K_MONO, fontSize: 11, fontWeight: 700,
                                                color: '#ef4444', background: '#fee2e2',
                                                padding: '2px 6px', borderRadius: 4,
                                                flexShrink: 0, marginTop: 2, letterSpacing: '0.06em',
                                            }}>0{i + 1}</span>
                                            <span style={{ fontSize: 14, color: '#374151', lineHeight: 1.55 }}>{req}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {niceToHaves.length > 0 && (
                            <div style={{
                                padding: '12px 14px', borderRadius: 9,
                                border: '1px solid #fde68a', background: '#fffdf5',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#d97706', flexShrink: 0, display: 'inline-block' }} />
                                    <V3Label color="#d97706" size={11}>Good To Have</V3Label>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {niceToHaves.map((item, i) => (
                                        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                            <span style={{
                                                color: '#fbbf24', fontWeight: 800, flexShrink: 0,
                                                fontSize: 17, lineHeight: 1.2, fontFamily: V3_K_MONO,
                                            }}>+</span>
                                            <span style={{ fontSize: 14, color: '#374151', lineHeight: 1.55 }}>{item}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Footer stats */}
            {showFooter && (
                <div style={{ borderTop: '1px solid #f1f5f9', display: 'grid', gridTemplateColumns: workStyle && hiringPace ? '1fr 1fr' : '1fr' }}>
                    {workStyle && (
                        <div style={{ padding: '11px 20px' }}>
                            <div style={{
                                fontFamily: V3_K_MONO, fontSize: 11, fontWeight: 700,
                                letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 4,
                            }}>How They Work</div>
                            <div style={{ fontFamily: V3_K_SANS, fontSize: 16, fontWeight: 700, color: '#0f172a', textTransform: 'capitalize' }}>{workStyle}</div>
                        </div>
                    )}
                    {hiringPace && (
                        <div style={{
                            padding: '11px 20px',
                            borderLeft: workStyle ? '1px solid #f1f5f9' : 'none',
                        }}>
                            <div style={{
                                fontFamily: V3_K_MONO, fontSize: 11, fontWeight: 700,
                                letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 4,
                            }}>Hiring Pace</div>
                            <div style={{ fontFamily: V3_K_SANS, fontSize: 16, fontWeight: 700, color: '#0f172a', textTransform: 'capitalize' }}>{hiringPace}</div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

interface QuickIntelData {
    verdict?: string
    fit_reason?: string
    top_3_actions?: string[]
    watch_out_for?: string
}

function V3AIVerdict({ quickIntel, matchingSkills, skillGaps }: {
    quickIntel: QuickIntelData
    matchingSkills: string[]
    skillGaps: string[]
}) {
    const verdictDisplay = quickIntel.verdict
        ? quickIntel.verdict.charAt(0).toUpperCase() + quickIntel.verdict.slice(1)
        : ''

    return (
        <div style={{ ...V3_CARD_STYLE, borderLeft: '4px solid #135bec', marginBottom: 10 }} className="ci-fade">
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{
                    width: 28, height: 28, borderRadius: 8,
                    background: '#eff6ff', color: '#135bec',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                }}>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
                    </svg>
                </span>
                <span style={{
                    fontFamily: V3_K_SANS, fontSize: 17, fontWeight: 700,
                    color: '#0f172a', letterSpacing: '-0.01em',
                }}>AI Analysis</span>
            </div>

            {verdictDisplay && (
                <h2 style={{
                    fontFamily: V3_K_SANS, fontSize: 18, fontWeight: 700, color: '#0f172a',
                    lineHeight: 1.35, margin: '0 0 8px', textWrap: 'balance',
                }}>{verdictDisplay}</h2>
            )}
            {quickIntel.fit_reason && (
                <p style={{ fontSize: 15, color: '#4b5563', lineHeight: 1.65, margin: '0 0 14px' }}>
                    {quickIntel.fit_reason}
                </p>
            )}

            {(matchingSkills.length > 0 || skillGaps.length > 0) && (
                <div className="ci-skills-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                    {matchingSkills.length > 0 && (
                        <div>
                            <V3Label color="#16a34a" size={11}>Skills You Have</V3Label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
                                {matchingSkills.map(s => (
                                    <span key={s} style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 5,
                                        padding: '5px 11px', borderRadius: 99,
                                        background: '#dcfce7', color: '#16a34a', border: '1px solid #bbf7d0',
                                        fontFamily: V3_K_MONO, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
                                    }}>
                                        <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                        {s}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                    {skillGaps.length > 0 && (
                        <div>
                            <V3Label color="#dc2626" size={11}>Skills You&apos;re Missing</V3Label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
                                {skillGaps.map(s => (
                                    <span key={s} style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 5,
                                        padding: '5px 11px', borderRadius: 99,
                                        background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca',
                                        fontFamily: V3_K_MONO, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
                                    }}>× {s}</span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {(quickIntel.top_3_actions || []).length > 0 && (
                <div style={{ paddingTop: 12, borderTop: '1px solid #f1f5f9', marginBottom: 12 }}>
                    <V3Label color="#135bec" size={12}>Do These 3 Things First</V3Label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 8 }}>
                        {(quickIntel.top_3_actions || []).map((action, i) => (
                            <div key={i} style={{
                                display: 'flex', gap: 14,
                                padding: '9px 12px', background: '#f8fafc',
                                borderLeft: '2px solid #135bec', borderRadius: '0 8px 8px 0',
                            }}>
                                <span style={{
                                    fontFamily: V3_K_MONO, fontSize: 14, fontWeight: 700,
                                    color: '#135bec', flexShrink: 0, minWidth: 14,
                                }}>{i + 1}</span>
                                <span style={{ fontSize: 15, color: '#374151', lineHeight: 1.65 }}>{action}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {quickIntel.watch_out_for && (
                <div style={{
                    padding: '10px 14px', background: '#fffbeb',
                    borderLeft: '3px solid #d97706', borderRadius: '0 8px 8px 0',
                }}>
                    <V3Label color="#d97706" size={11}>One Thing To Watch Out For</V3Label>
                    <p style={{ fontSize: 14, color: '#92400e', lineHeight: 1.6, margin: '6px 0 0' }}>
                        {quickIntel.watch_out_for}
                    </p>
                </div>
            )}
        </div>
    )
}

interface WhyWorthJoiningData {
    fit_verdict?: string
    fresher_verdict?: string
    what_you_will_learn?: string
    culture_reality?: string
    honest_tradeoff?: string
}

function V3WorthJoining({ wwj }: { wwj: WhyWorthJoiningData }) {
    const fv = wwj.fit_verdict || wwj.fresher_verdict || ''
    const parts = fv.split('—')
    const badgeText = (parts[0] || '').trim().toUpperCase() || 'VERDICT'
    const headline = (parts[1] || fv).trim()
    const isGood = badgeText.includes('GOOD') || badgeText.includes('STRONG')
    const isRisky = badgeText.includes('RISKY') || badgeText.includes('WEAK')

    const badgeBg = isGood ? '#dcfce7' : isRisky ? '#fee2e2' : '#fef3c7'
    const badgeColor = isGood ? '#16a34a' : isRisky ? '#dc2626' : '#d97706'

    const cols = [
        {
            label: "What You'll Learn",
            accentColor: '#135bec',
            bgColor: '#eff6ff',
            text: wwj.what_you_will_learn,
            icon: (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
                </svg>
            ),
        },
        {
            label: 'Culture & Day-to-Day',
            accentColor: '#7c3aed',
            bgColor: '#f5f3ff',
            text: wwj.culture_reality,
            icon: (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
            ),
        },
        {
            label: 'Honest Trade-Off',
            accentColor: '#d97706',
            bgColor: '#fffbeb',
            text: wwj.honest_tradeoff,
            icon: (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                </svg>
            ),
        },
    ].filter(c => c.text)

    return (
        <div style={{ ...V3_CARD_STYLE, borderTop: '2px solid #135bec', borderRadius: '0 0 12px 12px', marginBottom: 10 }} className="ci-fade">
            {/* Verdict + headline */}
            <div style={{ marginBottom: 12 }}>
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    padding: '4px 12px', borderRadius: 99, marginBottom: 8,
                    background: badgeBg, color: badgeColor,
                    fontFamily: V3_K_MONO, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em',
                }}>
                    {isGood ? (
                        <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    ) : '!'}
                    {badgeText}
                </div>
                {headline && (
                    <h2 style={{
                        fontFamily: V3_K_SANS, fontSize: 18, fontWeight: 700, color: '#0f172a',
                        lineHeight: 1.35, maxWidth: '72ch', textWrap: 'balance', margin: 0,
                    }}>{headline}</h2>
                )}
            </div>

            {/* 3-col grid */}
            {cols.length > 0 && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: cols.length === 1 ? '1fr' : cols.length === 2 ? '1fr 1fr' : '1fr 1fr 1fr',
                    gap: 8,
                }}>
                    {cols.map(col => (
                        <div key={col.label} style={{
                            background: '#fff', border: '1px solid #e2e8f0',
                            borderTop: `3px solid ${col.accentColor}`,
                            borderRadius: '0 0 10px 10px', padding: '12px 14px',
                        }}>
                            <div style={{
                                width: 26, height: 26, borderRadius: 6,
                                background: col.bgColor, color: col.accentColor,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                marginBottom: 7,
                            }}>{col.icon}</div>
                            <V3Label color={col.accentColor} size={11}>{col.label}</V3Label>
                            <p style={{
                                fontFamily: V3_K_SANS, fontSize: 14, color: '#4b5563',
                                lineHeight: 1.65, margin: '7px 0 0',
                            }}>{col.text}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

function V3ATS({ keywords }: { keywords: string[] }) {
    const [copied, setCopied] = useState(false)
    const [hov, setHov] = useState(false)
    const onCopy = () => {
        navigator.clipboard?.writeText(keywords.join(', '))
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
    }
    const palettes = [
        { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
        { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
        { bg: '#faf5ff', color: '#7c3aed', border: '#e9d5ff' },
        { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
        { bg: '#f0fdfa', color: '#0f766e', border: '#99f6e4' },
    ]
    return (
        <div style={{ ...V3_CARD_STYLE, marginBottom: 10 }} className="ci-fade">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <V3Label color="#0f172a" size={14}>ATS Keywords</V3Label>
                    <span style={{
                        padding: '3px 10px', borderRadius: 99,
                        background: '#eff6ff', color: '#135bec',
                        fontFamily: V3_K_MONO, fontSize: 12, fontWeight: 700,
                    }}>{keywords.length} terms</span>
                </div>
                <button onClick={onCopy}
                    onMouseEnter={() => setHov(true)}
                    onMouseLeave={() => setHov(false)}
                    type="button"
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '7px 14px', borderRadius: 8,
                        background: copied ? '#f0fdf4' : (hov ? '#eff6ff' : '#fff'),
                        color: copied ? '#16a34a' : '#135bec',
                        fontFamily: V3_K_SANS, fontSize: 14, fontWeight: 600,
                        border: `1.5px solid ${copied ? '#86efac' : '#135bec'}`,
                        cursor: 'pointer', transition: 'all 0.15s',
                    }}>
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    {copied ? 'Copied!' : 'Copy All'}
                </button>
            </div>
            <p style={{ fontSize: 13, color: '#94a3b8', fontStyle: 'italic', margin: '0 0 10px', lineHeight: 1.5 }}>
                Drop these verbatim into your Skills, Summary, and Experience sections to pass ATS filters.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {keywords.map((k, i) => {
                    const p = palettes[i % palettes.length]
                    return (
                        <span key={k} style={{
                            padding: '6px 13px', borderRadius: 99,
                            background: p.bg, border: `1px solid ${p.border}`,
                            color: p.color, fontFamily: V3_K_MONO, fontSize: 13, fontWeight: 600,
                        }}>{k}</span>
                    )
                })}
            </div>
        </div>
    )
}

function CompanyIntelPage() {
    const { user } = useAuth()
    const searchParams = useSearchParams()
    const router = useRouter()
    const jobId = searchParams.get('jobId')
    // Deep-link hint from the matches page Optimize button. Lets us default
    // the resume selector to the resume the match was scored against, so the
    // freshly-generated analysis row appears without the user having to switch.
    const requestedResumeId = searchParams.get('resumeId')
    // Set by matches page when company-research fetch was aborted after 60s.
    // The n8n workflow keeps running in the background; this flag tells the
    // page to show a "researching..." banner and auto-refresh until the row
    // lands in company_research / company_research_analysis.
    const isPending = searchParams.get('pending') === '1'
    // Company name passed through the URL by the matches/optimize page so we
    // can poll immediately without waiting for fetchResearchHistory to return
    // (which won't surface this brand-new job until the analysis row lands).
    // Bug fix May 2026 — see commit notes in matches/page.tsx handleOptimize.
    const requestedCompany = searchParams.get('company')

    const [matches, setMatches] = useState<JobMatch[]>([])
    const [matchesLoading, setMatchesLoading] = useState(true)
    const [selectedJobId, setSelectedJobId] = useState<string | null>(jobId)
    const [research, setResearch] = useState<(CompanyResearch & { ai_analysis?: AiAnalysis }) | null>(null)
    const [researchLoading, setResearchLoading] = useState(false)
    const [quickIntel, setQuickIntel] = useState<QuickIntel | null>(null)
    const [mounted, setMounted] = useState(false)

    /* ── Resume selector state ── */
    const [resumes, setResumes] = useState<Resume[]>([])
    const [resumesLoading, setResumesLoading] = useState(true)
    const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null)
    const [primaryResumeId, setPrimaryResumeId] = useState<string | null>(null)
    const [researchCounts, setResearchCounts] = useState<Record<string, number>>({})
    // Tracks job ids we've already refreshed the sidebar for after a research
    // landed, so the refresh fires at most once per job (no refetch loop).
    const refreshedHistoryFor = useRef<Set<string>>(new Set())

    /* ── Load resumes + counts + pick default resume ── */
    useEffect(() => {
        setMounted(true)
        if (!user?.id) return
        let cancelled = false
        ;(async () => {
            const [list, counts] = await Promise.all([
                fetchResumes(user.id),
                fetchResearchCountsByResume(user.id),
            ])
            if (cancelled) return
            setResumes(list)
            setResearchCounts(counts)
            setResumesLoading(false)
            const primary = getPrimaryResumeId()
            setPrimaryResumeId(primary)
            // Default order: URL hint (from matches Optimize) → primary → first resume with researches → first resume.
            const owned = new Set(list.map(r => r.id))
            const initial =
                (requestedResumeId && owned.has(requestedResumeId))
                    ? requestedResumeId
                    : (primary && owned.has(primary))
                        ? primary
                        : (list.find(r => (counts[r.id] ?? 0) > 0)?.id ?? list[0]?.id ?? null)
            setSelectedResumeId(initial)
        })()
        return () => { cancelled = true }
    }, [user?.id])

    /* ── Fetch researches whenever the selected resume changes ── */
    useEffect(() => {
        if (!user?.id) return
        if (!selectedResumeId) {
            setMatches([])
            setMatchesLoading(false)
            return
        }
        setMatchesLoading(true)
        let cancelled = false
        fetchResearchHistory(user.id, selectedResumeId).then(rows => {
            if (cancelled) return
            // Map ResearchHistoryItem → JobMatch shape so the existing sidebar
            // render code stays untouched. Company name surfaces in the
            // "company" slot; the AI match score (when present) drives the score ring.
            setMatches(rows.map(historyRowToJobMatch))
            setMatchesLoading(false)
        })
        return () => { cancelled = true }
    }, [user?.id, selectedResumeId])

    /* ── Auto-select first match if no jobId in URL ── */
    useEffect(() => {
        if (!jobId && matches.length > 0 && !selectedJobId) {
            setSelectedJobId(matches[0].job_id)
        }
    }, [matches, jobId, selectedJobId])

    /* ── Load company research when selection changes ── */
    const loadResearch = useCallback(async (jobMatchId: string, companyName: string) => {
        setResearchLoading(true)
        setResearch(null)
        setQuickIntel(null)

        const supabase = createClient()

        // 1. Check session storage first
        const cached = sessionStorage.getItem(`company_research_${jobMatchId}`)
        if (cached) {
            try {
                const parsed = JSON.parse(cached)
                setResearch(parsed)
                if (parsed?.ai_analysis?.quick_intel) setQuickIntel(parsed.ai_analysis.quick_intel)
                setResearchLoading(false)
                return
            } catch { /* ignore */ }
        }

        // 2. Fetch from company_research by company name (case-insensitive)
        const { data: companyData } = await supabase
            .from('company_research')
            .select('*')
            .ilike('company_name', companyName)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        if (companyData) {
            setResearch(companyData as CompanyResearch)

            // 3. Load AI analysis for this user + company
            if (user?.id) {
                const { data: analysis } = await supabase
                    .from('company_research_analysis' as any)
                    .select('ai_analysis')
                    .eq('user_id', user.id)
                    .eq('company_name', companyName)
                    .order('updated_at', { ascending: false })
                    .limit(1)
                    .maybeSingle()

                const analysisData = analysis as any
                if (analysisData?.ai_analysis) {
                    setResearch(prev => prev ? { ...prev, ai_analysis: analysisData.ai_analysis } : prev)
                    if (analysisData.ai_analysis.quick_intel) setQuickIntel(analysisData.ai_analysis.quick_intel)
                }
            }

            // Warm Redis from the freshly-loaded DB rows. Fire-and-forget —
            // the user doesn't wait. Closes the gap where the main route's
            // cache writes never executed because n8n exceeded its 120s
            // maxDuration (see warm-cache route comment for full story).
            void fetch('/api/company-research/warm-cache', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    companyName,
                    resumeId: (matches.find(m => m.job_id === jobMatchId)?.resume_id) || null,
                    jobId: jobMatchId,
                }),
            }).catch(() => { /* warming is best-effort, never block */ })
        }

        setResearchLoading(false)
    }, [user?.id, matches])

    /* ── Pending: auto-refetch with an adaptive cadence while we wait for the
       n8n workflow to finish writing the row.
         - 0–60 s   → poll every 15 s  (cheap, catches quick wins)
         - 60–180 s → every 20 s
         - 180–480 s → every 30 s
         - 480–720 s → every 60 s
       Gives up after 12 minutes. The earlier 30s × 10-attempt scheme capped at
       5 min, which clipped real Firecrawl runs that take 5–7 min — see exec
       1887 which finished at 5m 33s, just after polling gave up.
       Also registers the pending entry in the global toaster store so the user
       gets a cross-page notification even if they navigate away. ── */
    useEffect(() => {
        if (!isPending) return
        if (research) return  // row landed — nothing to wait for
        if (!selectedJobId) return

        // Prefer the company name from the URL (set by the matches page when it
        // navigated here) over fetchResearchHistory — that history table only
        // includes researches that have ALREADY completed, so for a brand-new
        // in-flight research it's empty by definition. Falling back to URL fixes
        // the "spinning forever" bug where the poll never started.
        const matchFromHistory = matches.find(m => m.job_id === selectedJobId)
        const companyName = matchFromHistory?.job?.company || requestedCompany
        if (!companyName) return
        const resumeIdForRegister = matchFromHistory?.resume_id ?? selectedResumeId ?? null

        // Register globally so the cross-page toaster catches completion too.
        if (user?.id) {
            addPending({
                jobId: selectedJobId,
                userId: user.id,
                companyName,
                resumeId: resumeIdForRegister,
            })
        }

        const startedAt = Date.now()
        let cancelled = false

        const nextDelayMs = (ageMs: number): number | null => {
            if (ageMs >= 12 * 60 * 1000) return null   // 12-minute cap
            if (ageMs < 60_000) return 15_000
            if (ageMs < 180_000) return 20_000
            if (ageMs < 480_000) return 30_000
            return 60_000
        }

        const tick = () => {
            if (cancelled) return
            loadResearch(selectedJobId, companyName)
            const ageMs = Date.now() - startedAt
            const delay = nextDelayMs(ageMs)
            if (delay === null) return
            window.setTimeout(tick, delay)
        }

        const initial = window.setTimeout(tick, nextDelayMs(0)!)
        return () => { cancelled = true; window.clearTimeout(initial) }
    }, [isPending, research, selectedJobId, matches, loadResearch, user?.id, requestedCompany, selectedResumeId])

    /* ── Once the research row lands on this page, clear it from the global
       pending list so the cross-page toaster doesn't double-notify a user
       who's already viewing it. ── */
    useEffect(() => {
        if (!research) return
        if (!selectedJobId) return
        if (!user?.id) return
        removePending(selectedJobId, user.id)
    }, [research, selectedJobId, user?.id])

    /* ── When a research completes for a company not yet in the sidebar history
       list, refresh that list once so the newly-researched company appears
       without a manual page reload. The history list is otherwise only fetched
       on resume change, so freshly-completed researches looked like they were
       "not recording" even though the DB row exists. Guarded by a ref so it
       fires at most once per job id (avoids any refetch loop). ── */
    useEffect(() => {
        if (!research || !user?.id || !selectedResumeId || !selectedJobId) return
        if (matches.some(m => m.job_id === selectedJobId)) return
        if (refreshedHistoryFor.current.has(selectedJobId)) return
        refreshedHistoryFor.current.add(selectedJobId)
        let cancelled = false
        fetchResearchHistory(user.id, selectedResumeId).then(rows => {
            if (cancelled) return
            setMatches(rows.map(historyRowToJobMatch))
        })
        return () => { cancelled = true }
    }, [research, selectedJobId, user?.id, selectedResumeId, matches])

    /* ── Always honor sessionStorage cache the moment a jobId is known.
       Otherwise a freshly-completed Optimize click (which wrote the cache
       and navigated here) appears blank whenever the resume has no prior
       DB analysis row — because the main trigger below is gated on
       `matches.length > 0`, and `matches` is built from the analysis
       table. ── */
    useEffect(() => {
        if (!selectedJobId) return
        const cached = sessionStorage.getItem(`company_research_${selectedJobId}`)
        if (!cached) return
        try {
            const parsed = JSON.parse(cached)
            setResearch(parsed)
            if (parsed?.ai_analysis?.quick_intel) setQuickIntel(parsed.ai_analysis.quick_intel)
            setResearchLoading(false)
        } catch { /* fall through to DB path */ }
    }, [selectedJobId])

    /* ── Trigger load when selectedJobId changes ── */
    useEffect(() => {
        if (!selectedJobId || matches.length === 0) return
        const match = matches.find(m => m.job_id === selectedJobId)
        if (!match?.job?.company) return
        loadResearch(selectedJobId, match.job.company)
    }, [selectedJobId, matches, loadResearch])

    function handleSelectJob(match: JobMatch) {
        setSelectedJobId(match.job_id)
        router.replace(`/dashboard/research?jobId=${match.job_id}`, { scroll: false })
    }

    function handleGenerateResume() {
        router.push(selectedJobId ? `/dashboard/optimize?jobId=${selectedJobId}` : '/dashboard/optimize')
    }

    /* ── Derived ── */
    const ai = (research?.ai_analysis ?? {}) as any
    const theory = ai.company_theory ?? {}
    const whyWorthJoining = ai.why_worth_joining ?? null
    const skillsMatch = ai.skills_match ?? {}
    // ATS keywords now live at ai_analysis.ats_keywords (canonical). Fall back
    // to legacy ai_analysis.tailored_resume.ats_keywords for stale cached rows.
    const atsKeywords: string[] = Array.isArray(ai.ats_keywords)
        ? ai.ats_keywords
        : (Array.isArray(ai.tailored_resume?.ats_keywords) ? ai.tailored_resume.ats_keywords : [])
    const techStack = research?.tech_stack || {}
    const culture = research?.culture || {}
    const hiring = research?.hiring_signals || {}

    // New role-specific fields from the updated GPT-4.1-mini prompt. Fall back
    // to the company-wide signals for old cached rows that pre-date the change.
    const roleTools: string[] = Array.isArray(ai.role_tools) ? ai.role_tools : []
    const jdRequirements: string[] = Array.isArray(ai.jd_requirements) && ai.jd_requirements.length > 0
        ? ai.jd_requirements
        : (hiring.key_requirements || [])
    const niceToHaves: string[] = Array.isArray(ai.nice_to_haves) && ai.nice_to_haves.length > 0
        ? ai.nice_to_haves
        : (hiring.nice_to_haves || hiring.focus_areas || [])

    // The model returns "not specified" when no signal exists for work_style.
    // Showing that string verbatim looks like a UI bug — hide the badge instead.
    const workStyleClean = typeof culture.work_style === 'string' ? culture.work_style.trim() : ''
    const showWorkStyle = workStyleClean.length > 0 && !/^not\s+specified$/i.test(workStyleClean)
    const matchScore = skillsMatch.match_score ?? 0

    function splitToPoints(text: string | null | undefined): string[] {
        if (!text) return []
        return text.split(/\.\s+/).filter((s: string) => s.trim().length > 10).slice(0, 4).map((s: string) => s.replace(/\.$/, '').trim())
    }
    const companySnapshot: string[] = Array.isArray(ai.company_snapshot) && ai.company_snapshot.length > 0
        ? ai.company_snapshot
        : splitToPoints(theory.company_brief || research?.overview)

    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800&family=JetBrains+Mono:wght@400;500;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Syne:wght@600;700;800&family=DM+Sans:ital,wght@0,400;0,500;0,600;1,400&family=Playfair+Display:wght@700;800&display=swap');

                .ci-shell {
                    display: flex;
                    height: calc(100vh - 64px);
                    overflow: hidden;
                    opacity: 0;
                    transition: opacity 0.3s;
                    font-family: 'Plus Jakarta Sans', sans-serif;
                }
                .ci-shell.ready { opacity: 1; }

                .ci-right {
                    flex: 1;
                    overflow-y: auto;
                    background-color: #f7f9fb;
                    background-image:
                        radial-gradient(at 0% 0%,   rgba(19,91,236,0.05)  0px, transparent 50%),
                        radial-gradient(at 100% 0%,  rgba(100,16,213,0.05) 0px, transparent 50%),
                        radial-gradient(at 100% 100%,rgba(19,91,236,0.05)  0px, transparent 50%),
                        radial-gradient(at 0% 100%,  rgba(100,16,213,0.05) 0px, transparent 50%);
                }

                .ci-content { padding: 28px 32px 60px; }

                .ci-bento { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 18px; }
                .ci-span2 { grid-column: span 2; }
                .ci-span3 { grid-column: span 3; }

                .ci-glass {
                    background: rgba(255,255,255,0.75);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border: 1px solid rgba(255,255,255,0.35);
                    border-radius: 12px;
                    padding: 22px;
                    transition: box-shadow 0.2s, transform 0.2s;
                }
                .ci-glass:hover { box-shadow: 0 8px 28px rgba(19,91,236,0.08); transform: translateY(-1px); }

                .ci-skill-match {
                    display: inline-flex; align-items: center; gap: 6px;
                    padding: 6px 12px; border-radius: 9px;
                    background: rgba(240,253,244,0.70); border: 1px solid rgba(187,247,208,0.70);
                    font-family: 'JetBrains Mono', monospace; font-size: 0.72rem; font-weight: 700;
                    color: #166534; transition: background 0.15s;
                }
                .ci-skill-gap {
                    display: inline-flex; align-items: center; gap: 6px;
                    padding: 6px 12px; border-radius: 9px;
                    background: rgba(254,242,242,0.70); border: 1px solid rgba(254,202,202,0.70);
                    font-family: 'JetBrains Mono', monospace; font-size: 0.72rem; font-weight: 700;
                    color: #991b1b;
                }
                .ci-skill-emphasis {
                    display: inline-flex; align-items: center; gap: 6px;
                    padding: 6px 12px; border-radius: 9px;
                    background: rgba(255,251,235,0.70); border: 1px solid rgba(253,230,138,0.80);
                    font-family: 'JetBrains Mono', monospace; font-size: 0.72rem; font-weight: 700;
                    color: #92400e;
                }
                .ci-tech {
                    display: inline-flex; align-items: center;
                    font-size: 0.68rem; font-weight: 600; padding: 4px 11px; border-radius: 100px;
                    transition: transform 0.1s;
                }
                .ci-tech:hover { transform: scale(1.04); }
                .ci-tip {
                    background: rgba(255,255,255,0.75);
                    border: 1px solid rgba(255,255,255,0.35); border-radius: 11px; padding: 16px 18px;
                    position: relative; overflow: hidden;
                    transition: box-shadow 0.2s, transform 0.2s;
                }
                .ci-tip:hover { box-shadow: 0 5px 18px rgba(0,0,0,0.05); transform: translateY(-1px); }
                .ci-ilist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 9px; }
                .ci-iitem { display: flex; align-items: flex-start; gap: 9px; font-size: 0.8rem; color: #434655; line-height: 1.65; }
                .ci-inum {
                    min-width: 20px; height: 20px; border-radius: 6px;
                    display: flex; align-items: center; justify-content: center;
                    font-family: 'JetBrains Mono', monospace; font-size: 0.55rem; font-weight: 800;
                    flex-shrink: 0; margin-top: 2px;
                }
                .ci-fade { opacity: 0; transform: translateY(10px); animation: ciFade 0.4s ease forwards; }
                @keyframes ciFade { to { opacity: 1; transform: translateY(0); } }
                @keyframes ci-spin { to { transform: rotate(360deg); } }
                @keyframes ci-shimmer {
                    0% { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                }
                @media (max-width: 1100px) {
                    .ci-bento { grid-template-columns: 1fr 1fr; }
                    .ci-span3 { grid-column: span 2; }
                }
                @media (max-width: 768px) {
                    .ci-shell { flex-direction: column; height: auto; overflow: visible; }
                    .ci-right { overflow: visible; }
                    .ci-bento { grid-template-columns: 1fr; }
                    .ci-span2, .ci-span3 { grid-column: span 1; }
                    .ci-jobs-panel { width: 100% !important; height: auto !important; max-height: 45vh !important; position: static !important; top: auto !important; border-right: none !important; border-bottom: 1px solid #e8edf2 !important; }
                    .ci-req-grid { grid-template-columns: 1fr !important; }
                    .ci-skills-grid { grid-template-columns: 1fr !important; gap: 8px !important; }
                }
                @keyframes rsDropIn {
                    from { opacity: 0; transform: translateY(-4px) scale(0.99); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }

                /* ── Worth Joining Card ── */
                .wwj-card {
                    background: #ffffff;
                    border-radius: 16px;
                    overflow: hidden;
                    margin-bottom: 18px;
                    border: 1px solid #e8edf2;
                    box-shadow: 0 2px 16px rgba(15,23,42,0.06), 0 1px 3px rgba(15,23,42,0.04);
                    animation: ciFade 0.4s ease forwards;
                    animation-delay: 0.12s;
                    opacity: 0;
                    position: relative;
                }
                .wwj-header {
                    padding: 13px 24px;
                    display: flex;
                    align-items: center;
                    gap: 9px;
                    border-bottom: 1px solid #f1f5f9;
                    background: #fafbfc;
                }
                .wwj-header-label {
                    font-family: 'Syne', sans-serif;
                    font-size: 0.58rem;
                    font-weight: 700;
                    letter-spacing: 0.16em;
                    text-transform: uppercase;
                    color: #64748b;
                }
                .wwj-verdict-box {
                    padding: 26px 28px 22px;
                    border-bottom: 1px solid #f1f5f9;
                    position: relative;
                }
                .wwj-verdict-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 7px;
                    padding: 5px 14px 5px 10px;
                    border-radius: 100px;
                    font-family: 'Syne', sans-serif;
                    font-size: 0.58rem;
                    font-weight: 700;
                    letter-spacing: 0.12em;
                    text-transform: uppercase;
                    margin-bottom: 14px;
                }
                .wwj-verdict-text {
                    font-family: 'Playfair Display', Georgia, serif;
                    font-size: 1.25rem;
                    font-weight: 700;
                    line-height: 1.5;
                    color: #0f172a;
                    letter-spacing: -0.01em;
                }
                .wwj-cols {
                    display: grid;
                    grid-template-columns: 1fr 1fr 1fr;
                    gap: 0;
                    align-items: start;
                }
                .wwj-col {
                    padding: 22px 24px 26px;
                    border-right: 1px solid #f1f5f9;
                }
                .wwj-col:last-child { border-right: none; }
                .wwj-col-label {
                    font-family: 'Syne', sans-serif;
                    font-size: 0.52rem;
                    font-weight: 700;
                    letter-spacing: 0.14em;
                    text-transform: uppercase;
                    margin-bottom: 11px;
                    display: flex;
                    align-items: center;
                    gap: 7px;
                }
                .wwj-col-icon {
                    width: 24px;
                    height: 24px;
                    border-radius: 7px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }
                .wwj-col-text {
                    font-family: 'DM Sans', sans-serif;
                    font-size: 0.815rem;
                    color: #475569;
                    line-height: 1.75;
                    margin: 0;
                }
                @media (max-width: 900px) {
                    .wwj-cols { grid-template-columns: 1fr; }
                    .wwj-col { border-right: none; border-bottom: 1px solid #f1f5f9; }
                    .wwj-col:last-child { border-bottom: none; }
                }

                /* ── ATS Keywords card ── */
                .ats-card {
                    background: #ffffff;
                    border-radius: 16px;
                    overflow: hidden;
                    margin-bottom: 18px;
                    border: 1px solid #e8edf2;
                    box-shadow: 0 2px 16px rgba(15,23,42,0.05);
                    animation: ciFade 0.4s ease forwards;
                    animation-delay: 0.22s;
                    opacity: 0;
                }
                .ats-header {
                    padding: 13px 22px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    border-bottom: 1px solid #f1f5f9;
                    background: #fafbfc;
                }
                .ats-dot { width: 7px; height: 7px; border-radius: 50%; }
                .ats-chip {
                    font-family: 'JetBrains Mono', monospace;
                    font-size: 0.68rem;
                    font-weight: 500;
                    padding: 5px 11px;
                    border-radius: 6px;
                    background: #f1f5f9;
                    color: #334155;
                    border: 1px solid #e2e8f0;
                    transition: background 0.15s, border-color 0.15s, color 0.15s;
                    cursor: default;
                }
                .ats-chip:hover {
                    background: #eff6ff;
                    border-color: #bfdbfe;
                    color: #1d4ed8;
                }
            `}</style>

            <div className={`ci-shell${mounted ? ' ready' : ''}`}>
                {/* ═══ LEFT: Jobs Panel ═══ */}
                <JobsPanel
                    matches={matches}
                    loading={matchesLoading}
                    selectedJobId={selectedJobId}
                    onSelect={handleSelectJob}
                    resumeSelector={
                        <ResumeSelector
                            resumes={resumes}
                            selectedResumeId={selectedResumeId}
                            onSelect={setSelectedResumeId}
                            researchCountByResume={researchCounts}
                            primaryResumeId={primaryResumeId}
                            loading={resumesLoading}
                        />
                    }
                />

                {/* ═══ RIGHT: Company Intel ═══ */}
                <div className="ci-right">
                    <div className="ci-content">

                        {/* Loading */}
                        {researchLoading && (
                            <div style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                justifyContent: 'center', height: 'calc(100vh - 200px)', gap: 16,
                            }}>
                                <div style={{ width: 40, height: 40, border: '3px solid #dbe1ff', borderTopColor: '#135bec', borderRadius: '50%', animation: 'ci-spin 0.8s linear infinite' }} />
                                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                                    Loading intel…
                                </span>
                            </div>
                        )}

                        {/* Pending — research is still running in the background */}
                        {!researchLoading && !research && isPending && (
                            <div style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                justifyContent: 'center', height: 'calc(100vh - 200px)', gap: 18, textAlign: 'center',
                            }}>
                                <div style={{ width: 40, height: 40, border: '3px solid #dbe1ff', borderTopColor: '#135bec', borderRadius: '50%', animation: 'ci-spin 0.8s linear infinite' }} />
                                <div>
                                    <p style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: '1rem', color: '#101c2e', margin: '0 0 6px' }}>
                                        Research in progress
                                    </p>
                                    <p style={{ fontSize: '0.825rem', color: '#737687', margin: '0 0 16px', maxWidth: 380 }}>
                                        AI is reading the company&apos;s website. This usually takes 2&ndash;4 minutes. The page will refresh automatically when results arrive.
                                    </p>
                                    <button
                                        onClick={() => window.location.reload()}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 8,
                                            padding: '10px 20px', borderRadius: 10,
                                            background: 'linear-gradient(135deg, #135bec, #0045bd)',
                                            color: '#fff', fontWeight: 700, fontSize: '0.825rem',
                                            fontFamily: "'Outfit', sans-serif", border: 'none', cursor: 'pointer',
                                        }}
                                    >
                                        Refresh now
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Empty — no job selected */}
                        {!researchLoading && !research && !isPending && matches.length > 0 && (
                            <div style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                justifyContent: 'center', height: 'calc(100vh - 200px)', gap: 18, textAlign: 'center',
                            }}>
                                <div style={{
                                    width: 64, height: 64, borderRadius: 18,
                                    background: 'rgba(219,225,255,0.40)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#135bec" strokeWidth="1.5">
                                        <path d="M3 21h18M3 7v14M21 7v14M9 3h6v4H9z"/>
                                    </svg>
                                </div>
                                <div>
                                    <p style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: '1rem', color: '#101c2e', margin: '0 0 6px' }}>
                                        No Research Found
                                    </p>
                                    <p style={{ fontSize: '0.825rem', color: '#737687', margin: '0 0 16px', maxWidth: 320 }}>
                                        This company hasn&apos;t been researched yet. Go to Matches and click Research on a job to generate intel.
                                    </p>
                                    <Link href="/dashboard/matches" style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 8,
                                        padding: '10px 20px', borderRadius: 10,
                                        background: 'linear-gradient(135deg, #135bec, #0045bd)',
                                        color: '#fff', fontWeight: 700, fontSize: '0.825rem',
                                        fontFamily: "'Outfit', sans-serif",
                                        textDecoration: 'none',
                                    }}>
                                        View Matches
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                                    </Link>
                                </div>
                            </div>
                        )}

                        {/* Empty — no matches at all */}
                        {!matchesLoading && matches.length === 0 && !isPending && (
                            <div style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                justifyContent: 'center', height: 'calc(100vh - 200px)', gap: 18, textAlign: 'center',
                            }}>
                                <p style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: '1rem', color: '#101c2e', margin: 0 }}>
                                    No Job Matches Yet
                                </p>
                                <p style={{ fontSize: '0.825rem', color: '#737687', margin: 0 }}>
                                    Search for jobs and run AI scoring first.
                                </p>
                                <Link href="/dashboard/search" style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 8,
                                    padding: '10px 20px', borderRadius: 10,
                                    background: 'linear-gradient(135deg, #135bec, #0045bd)',
                                    color: '#fff', fontWeight: 700, fontSize: '0.825rem',
                                    fontFamily: "'Outfit', sans-serif", textDecoration: 'none',
                                }}>
                                    Search Jobs
                                </Link>
                            </div>
                        )}

                        {/* ═══ RESEARCH CONTENT — placeholder, replaced below ═══ */}
                        {research && !researchLoading && (
                            <>
                                {/* ═══ SECTION 1: HERO — V3 Kroll Report ═══ */}
                                <div className="ci-fade" style={{ ...V3_CARD_STYLE, marginBottom: 10 }}>
                                    <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>
                                        {/* Left ~70% */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <h1 style={{
                                                fontFamily: "'Plus Jakarta Sans', sans-serif",
                                                fontSize: 30, fontWeight: 700, color: '#0f172a',
                                                letterSpacing: '-0.03em', lineHeight: 1.1, margin: '0 0 4px',
                                            }}>{research.company_name}</h1>
                                            {research.industry && (
                                                <p style={{ fontSize: 15, color: '#64748b', lineHeight: 1.4, margin: '0 0 10px' }}>
                                                    {research.industry}
                                                </p>
                                            )}
                                            {(research.headquarters || research.size_stage) && (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                                                    {research.headquarters && (
                                                        <span style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: 6,
                                                            padding: '5px 12px', borderRadius: 99,
                                                            background: '#eff6ff', color: '#135bec',
                                                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                                                            fontSize: 14, fontWeight: 600,
                                                        }}>
                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                                                            {research.headquarters}
                                                        </span>
                                                    )}
                                                    {research.size_stage && (
                                                        <span style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: 6,
                                                            padding: '5px 12px', borderRadius: 99,
                                                            background: '#eff6ff', color: '#135bec',
                                                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                                                            fontSize: 14, fontWeight: 600, textTransform: 'capitalize',
                                                        }}>{research.size_stage}</span>
                                                    )}
                                                </div>
                                            )}
                                            {companySnapshot.length > 0 && (
                                                <ul style={{ listStyle: 'none', margin: '0 0 12px', padding: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
                                                    {companySnapshot.map((fact: string, i: number) => (
                                                        <li key={i} style={{ display: 'flex', gap: 10, fontSize: 16, color: '#374151', lineHeight: 1.55 }}>
                                                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#135bec', flexShrink: 0, marginTop: 9 }} />
                                                            {fact}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                            {(research.mission || quickIntel?.fit_reason) && (
                                                <blockquote style={{
                                                    margin: 0, padding: '9px 14px',
                                                    background: '#eff6ff', borderLeft: '3px solid #135bec',
                                                    borderRadius: '0 8px 8px 0',
                                                    fontSize: 15, color: '#64748b', fontStyle: 'italic', lineHeight: 1.65,
                                                }}>
                                                    {research.mission || quickIntel?.fit_reason}
                                                </blockquote>
                                            )}
                                        </div>

                                        {/* Score ring hidden — Company Research's match_score uses a different scale than AI Scoring's relevance_score and was confusing users with two different numbers for the same job. Authoritative score now lives on /dashboard/matches. Set HIDE_COMPANY_SCORE_RING=false to re-enable. */}
                                        {false && skillsMatch.match_score != null && (
                                            <div style={{
                                                flexShrink: 0, width: 150,
                                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                                gap: 10, paddingTop: 4,
                                            }}>
                                                <div style={{ position: 'relative', width: 100, height: 100 }}>
                                                    <svg viewBox="0 0 100 100" width="100" height="100" style={{ transform: 'rotate(-90deg)', display: 'block' }}>
                                                        <circle cx="50" cy="50" r="39" fill="none" stroke="#e2e8f0" strokeWidth="7" />
                                                        <circle cx="50" cy="50" r="39" fill="none"
                                                            stroke={matchScore >= 70 ? '#16a34a' : matchScore >= 50 ? '#d97706' : '#dc2626'}
                                                            strokeWidth="7" strokeLinecap="round"
                                                            strokeDasharray={2 * Math.PI * 39}
                                                            strokeDashoffset={(2 * Math.PI * 39) * (1 - matchScore / 100)}
                                                            style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(.2,.8,.2,1)' }}
                                                        />
                                                    </svg>
                                                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 26, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' }}>
                                                            <AnimatedScore value={matchScore} />
                                                        </span>
                                                    </div>
                                                </div>
                                                <div style={{
                                                    fontFamily: "'JetBrains Mono', monospace",
                                                    fontSize: 11, fontWeight: 700,
                                                    letterSpacing: '0.2em', textTransform: 'uppercase', color: '#94a3b8',
                                                }}>MATCH</div>
                                                <div style={{
                                                    padding: '5px 18px', borderRadius: 99,
                                                    background: matchScore >= 70 ? '#dcfce7' : matchScore >= 50 ? '#fef3c7' : '#fee2e2',
                                                    color: matchScore >= 70 ? '#16a34a' : matchScore >= 50 ? '#d97706' : '#dc2626',
                                                    fontFamily: "'JetBrains Mono', monospace",
                                                    fontSize: 12, fontWeight: 700, letterSpacing: '0.12em',
                                                    textTransform: 'uppercase', whiteSpace: 'nowrap',
                                                }}>{matchScore >= 70 ? 'Good Fit' : matchScore >= 50 ? 'Okay Fit' : 'Weak Fit'}</div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Button row */}
                                    <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
                                        <button onClick={handleGenerateResume} type="button" style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 7,
                                            padding: '10px 20px', borderRadius: 10,
                                            fontFamily: V3_K_SANS, fontSize: 15, fontWeight: 600, cursor: 'pointer',
                                            transition: 'all 0.15s', border: 'none',
                                            background: '#135bec', color: '#fff',
                                            boxShadow: '0 4px 14px rgba(19,91,236,0.28)',
                                        }}>
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.8 4.6L18 9.4l-4.2 1.8L12 16l-1.8-4.8L6 9.4l4.2-1.8z"/></svg>
                                            Generate Resume
                                        </button>
                                        <Link href="/dashboard/matches" style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 7,
                                            padding: '10px 20px', borderRadius: 10,
                                            fontFamily: V3_K_SANS, fontSize: 15, fontWeight: 600,
                                            transition: 'all 0.15s',
                                            background: '#fff', color: '#135bec',
                                            border: '1.5px solid #135bec',
                                            textDecoration: 'none', whiteSpace: 'nowrap',
                                        }}>
                                            All Matches
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                                        </Link>
                                    </div>
                                </div>

                                {/* ═══ SECTION 2: TECH STACK — V3 Kroll Report ═══ */}
                                <V3TechStack
                                    techStack={techStack}
                                    roleTools={roleTools}
                                    jdRequirements={jdRequirements}
                                    niceToHaves={niceToHaves}
                                    matchingSkills={(skillsMatch.matching_skills ?? []) as string[]}
                                    workStyle={showWorkStyle ? workStyleClean : null}
                                    hiringPace={(hiring.urgency || hiring.recruitment_volume || null) as string | null}
                                />
                                {/* ═══ END SECTION 2 ═══ */}

                                {/* ═══ SECTION 3: AI VERDICT — V3 Kroll Report ═══ */}
                                {quickIntel && (
                                    <V3AIVerdict
                                        quickIntel={quickIntel}
                                        matchingSkills={(skillsMatch.matching_skills ?? []) as string[]}
                                        skillGaps={(skillsMatch.skill_gaps ?? []) as string[]}
                                    />
                                )}

                                {/* ═══ SECTION 4: WHY WORTH JOINING — V3 Kroll Report ═══ */}
                                {whyWorthJoining && (
                                    <V3WorthJoining wwj={whyWorthJoining} />
                                )}

                                {/* ═══ SECTION 5: ATS KEYWORDS — V3 Kroll Report ═══ */}
                                {atsKeywords.length > 0 && (
                                    <V3ATS keywords={atsKeywords} />
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </>
    )
}
