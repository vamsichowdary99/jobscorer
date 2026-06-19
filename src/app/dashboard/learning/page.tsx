'use client'

import { Suspense, useEffect, useMemo, useState, useCallback, useRef, type SVGProps, type ReactElement } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { fetchLearningPaths, triggerLearningPathGeneration, fetchLearningPathSummaries, getPrimaryResumeId, type LearningPathSummary } from '@/lib/api'
import type { LearningPath, LearningResource, Job } from '@/lib/types'
import { useAuth } from '@/components/providers/AuthProvider'

/* ─── Design tokens (Split layout) ─────────────────────────────── */
const T = {
    blue: '#2563EB',
    blue600: '#1D4ED8',
    blue700: '#1E40AF',
    blueLight: '#DBEAFE',
    blue50: '#EFF6FF',
    ink: '#0F172A',
    ink2: '#1E293B',
    body: '#334155',
    muted: '#64748B',
    muted2: '#94A3B8',
    line: '#E5E7EB',
    line2: '#EEF2F7',
    bg: '#FFFFFF',
    bgAlt: '#FAFBFD',
    green: '#059669',
    greenBg: '#DCFCE7',
    greenText: '#15803D',
    redBg: '#FEE2E2',
    redText: '#B91C1C',
    amberBg: '#FEF3C7',
    amberText: '#B45309',
    sand: '#F1F5F9',
    sandText: '#334155',
}

const PRIORITY = {
    high: { label: 'Critical', color: '#B91C1C', bg: '#FEE2E2', dot: '#DC2626' },
    medium: { label: 'Standard', color: '#B45309', bg: '#FEF3C7', dot: '#F59E0B' },
    low: { label: 'Optional', color: '#15803D', bg: '#DCFCE7', dot: '#059669' },
} as const

type ResourceType = 'youtube' | 'article' | 'course' | 'lab'

const TYPE_META: Record<ResourceType, { label: string; cta: string; tint: string; tintBg: string; Icon: (p: SVGProps<SVGSVGElement>) => ReactElement }> = {
    youtube: { label: 'Video', cta: 'Watch', tint: '#DC2626', tintBg: '#FEF2F2', Icon: (p) => <Icon.Play {...p} /> },
    article: { label: 'Article', cta: 'Read', tint: '#0891B2', tintBg: '#ECFEFF', Icon: (p) => <Icon.Article {...p} /> },
    course: { label: 'Course', cta: 'Start', tint: '#7C3AED', tintBg: '#F5F3FF', Icon: (p) => <Icon.Course {...p} /> },
    lab: { label: 'Lab', cta: 'Open', tint: '#059669', tintBg: '#ECFDF5', Icon: (p) => <Icon.FileText {...p} /> },
}

const DIFF: Record<string, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' }

const LOADING_STEPS = [
    'Scanning missing skills…',
    'Querying knowledge base…',
    'Mapping learning resources…',
    'Running AI analysis…',
    'Generating your roadmap…',
]

/* ─── Icons ──────────────────────────────────────────────────── */
const Icon = {
    Briefcase: (p: SVGProps<SVGSVGElement>) => <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>,
    Building: (p: SVGProps<SVGSVGElement>) => <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="4" y="3" width="16" height="18" rx="2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /><line x1="9" y1="13" x2="9.01" y2="13" /><line x1="15" y1="13" x2="15.01" y2="13" /><line x1="9" y1="17" x2="15" y2="17" /></svg>,
    Clock: (p: SVGProps<SVGSVGElement>) => <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
    Check: (p: SVGProps<SVGSVGElement>) => <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="20 6 9 17 4 12" /></svg>,
    External: (p: SVGProps<SVGSVGElement>) => <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>,
    Lightbulb: (p: SVGProps<SVGSVGElement>) => <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.7.6 1 1.5 1 2.3v1h6v-1c0-.8.3-1.7 1-2.3A7 7 0 0 0 12 2z" /></svg>,
    Play: (p: SVGProps<SVGSVGElement>) => <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor" {...p}><polygon points="5 3 19 12 5 21 5 3" /></svg>,
    Article: (p: SVGProps<SVGSVGElement>) => <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="14 3 14 8 19 8" /></svg>,
    Course: (p: SVGProps<SVGSVGElement>) => <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></svg>,
    FileText: (p: SVGProps<SVGSVGElement>) => <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>,
    Refresh: (p: SVGProps<SVGSVGElement>) => <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>,
    Sparkles: (p: SVGProps<SVGSVGElement>) => <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" /><path d="M19 14l.95 2.3L22.3 17l-2.35.7L19 20l-.95-2.3L15.7 17l2.35-.7z" /></svg>,
    ArrowLeft: (p: SVGProps<SVGSVGElement>) => <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" {...p}><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>,
    ArrowRight: (p: SVGProps<SVGSVGElement>) => <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" {...p}><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>,
    MapPin: (p: SVGProps<SVGSVGElement>) => <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>,
    ChevronRight: (p: SVGProps<SVGSVGElement>) => <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="9 18 15 12 9 6" /></svg>,
}

/* ─── Helpers ────────────────────────────────────────────────── */
function parseWeeks(est: string | null | undefined): number {
    if (!est) return 0
    const m = est.match(/(\d+)(?:\s*[-–]\s*(\d+))?/)
    if (!m) return 0
    return Math.round((parseInt(m[1]) + (m[2] ? parseInt(m[2]) : parseInt(m[1]))) / 2)
}

function parseHours(est: string | null | undefined): number {
    const weeks = parseWeeks(est)
    return weeks > 0 ? weeks * 14 : 0
}

/* ─── Progress hook (localStorage per job) ───────────────────── */
function useProgress(jobId: string | null) {
    const key = jobId ? `lp_progress_${jobId}` : null
    const [progress, setProgress] = useState<Map<string, Set<number>>>(() => {
        if (!key || typeof window === 'undefined') return new Map()
        try {
            const raw = localStorage.getItem(key)
            if (!raw) return new Map()
            const parsed: Record<string, number[]> = JSON.parse(raw)
            return new Map(Object.entries(parsed).map(([s, i]) => [s, new Set(i)]))
        } catch { return new Map() }
    })

    const toggle = useCallback((skill: string, idx: number) => {
        setProgress(prev => {
            const next = new Map(prev)
            const set = new Set(next.get(skill) ?? [])
            set.has(idx) ? set.delete(idx) : set.add(idx)
            next.set(skill, set)
            if (key) {
                try {
                    const obj: Record<string, number[]> = {}
                    next.forEach((s, k) => { obj[k] = [...s] })
                    localStorage.setItem(key, JSON.stringify(obj))
                } catch { /* ignore */ }
            }
            return next
        })
    }, [key])

    return { progress, toggle }
}

/* ─── Inject styles (font + animations + hovers) ─────────────── */
function useStyles() {
    useEffect(() => {
        if (document.getElementById('lp-split-styles')) return
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = 'https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap'
        document.head.appendChild(link)

        const el = document.createElement('style')
        el.id = 'lp-split-styles'
        el.textContent = `
            @keyframes lp-spin   { to { transform: rotate(360deg); } }
            @keyframes lp-fadein { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
            @keyframes lp-panel  { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
            @keyframes lp-bar    { from { width:0; } }
            @keyframes lp-scan   { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
            @keyframes lp-blink  { 0%,100% { opacity:1; } 50% { opacity:0; } }

            .lp-panel-anim { animation: lp-panel 0.28s ease both; }
            .lp-card    { animation: lp-fadein 0.45s ease both; transition: transform .15s ease, box-shadow .15s ease; }
            .lp-card:hover { transform: translateY(-2px); box-shadow: 0 12px 28px -12px rgba(15,23,42,.12); }
            .lp-fill    { animation: lp-bar 0.7s ease both; }
            .lp-cursor  { animation: lp-blink 1s step-end infinite; }

            .lp-skill { transition: background .15s, border-color .15s, box-shadow .15s; }
            .lp-skill:hover { background: ${T.bgAlt}; }
            .lp-skill:hover .lp-skill-chev { opacity: 1; }
            .lp-skill.is-active { background: ${T.blue50}; border-color: #C7DBFE; box-shadow: 0 4px 12px -6px rgba(37,99,235,.18); }
            .lp-skill.is-active .lp-skill-chev { color: ${T.blue}; opacity: 1; transform: translateX(2px); }
            .lp-skill.is-active .lp-skill-no { color: ${T.blue}; }
            .lp-skill-chev { transition: opacity .15s, transform .15s, color .15s; }

            .lp-back:hover { color: ${T.ink}; }
            .lp-cta:hover { background: ${T.blue600}; transform: translateY(-1px); }
            .lp-out:hover { background: ${T.bgAlt}; border-color: #CBD5E1; }

            .lp-rail-list::-webkit-scrollbar { width: 6px; }
            .lp-rail-list::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 3px; }
        `
        document.head.appendChild(el)
    }, [])
}

/* ─── Resource Card ──────────────────────────────────────────── */
function ResourceCard({ r, idx, isDone, onToggle }: {
    r: LearningResource; idx: number; isDone: boolean; onToggle: () => void
}) {
    const meta = TYPE_META[(r.type as ResourceType)] ?? TYPE_META.article
    const TypeIcon = meta.Icon

    return (
        <article className="lp-card" style={{
            background: '#fff',
            border: `1px solid ${T.line2}`,
            borderRadius: 14,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            opacity: isDone ? 0.7 : 1,
        }}>
            {/* Themed thumbnail */}
            <div style={{
                position: 'relative',
                aspectRatio: '16 / 8',
                background: `linear-gradient(135deg, ${meta.tintBg} 0%, ${meta.tint}22 100%)`,
                display: 'grid',
                placeItems: 'center',
                borderBottom: `1px solid ${T.line2}`,
            }}>
                <div style={{
                    position: 'absolute', top: 14, left: 16,
                    fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.16em',
                    textTransform: 'uppercase', color: meta.tint,
                }}>
                    Step {String(idx + 1).padStart(2, '0')}
                </div>
                <div style={{
                    position: 'absolute', top: 12, right: 12,
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '4px 9px', background: '#fff',
                    borderRadius: 99, fontSize: '0.6875rem', fontWeight: 700,
                    color: meta.tint, letterSpacing: '0.04em', textTransform: 'uppercase',
                    boxShadow: '0 2px 6px -2px rgba(15,23,42,.12)',
                }}>
                    <TypeIcon width={11} height={11} />{meta.label}
                </div>
                <div style={{
                    width: 72, height: 72, borderRadius: 18,
                    background: '#fff', color: meta.tint,
                    display: 'grid', placeItems: 'center',
                    boxShadow: '0 8px 20px -8px rgba(15,23,42,.18)',
                }}>
                    <TypeIcon width={32} height={32} />
                </div>
            </div>

            {/* Body */}
            <div style={{ padding: '18px 20px 20px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                <div style={{
                    fontSize: '0.6875rem', color: T.muted,
                    marginBottom: 8, display: 'inline-flex', alignItems: 'center', gap: 8,
                }}>
                    <span style={{ fontWeight: 700, color: T.ink2 }}>{r.platform}</span>
                    {r.channel && <><span>·</span><span>{r.channel}</span></>}
                </div>
                <h3 style={{
                    fontSize: '1.0625rem', fontWeight: 700,
                    color: T.ink, letterSpacing: '-0.015em',
                    lineHeight: 1.3, marginBottom: 10,
                    textDecoration: isDone ? 'line-through' : 'none',
                }}>{r.title}</h3>
                {r.summary && (
                    <p style={{
                        fontSize: '0.8125rem', color: '#475569',
                        lineHeight: 1.55, marginBottom: 14, flex: 1,
                        textWrap: 'pretty' as 'pretty',
                    }}>{r.summary}</p>
                )}

                <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                    <span style={{
                        fontSize: '0.6875rem', color: '#334155',
                        background: T.sand,
                        padding: '3px 8px', borderRadius: 6, fontWeight: 600,
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                    }}>
                        <Icon.Clock width={10} height={10} />{r.duration}
                    </span>
                    {r.difficulty && (
                        <span style={{
                            fontSize: '0.6875rem', color: '#334155',
                            background: T.sand,
                            padding: '3px 8px', borderRadius: 6, fontWeight: 600,
                        }}>{DIFF[r.difficulty] ?? r.difficulty}</span>
                    )}
                    {r.free && (
                        <span style={{
                            fontSize: '0.6875rem', color: T.greenText,
                            background: T.greenBg,
                            padding: '3px 8px', borderRadius: 6, fontWeight: 700,
                        }}>Free</span>
                    )}
                </div>

                <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    paddingTop: 14, borderTop: `1px solid ${T.line2}`,
                }}>
                    <button onClick={onToggle} aria-label={isDone ? 'Mark incomplete' : 'Mark complete'} style={{
                        width: 22, height: 22, borderRadius: 6,
                        background: isDone ? T.green : '#fff',
                        border: `1.5px solid ${isDone ? T.green : T.line}`,
                        display: 'grid', placeItems: 'center',
                        color: '#fff', cursor: 'pointer', padding: 0, flexShrink: 0,
                    }}>
                        {isDone && <Icon.Check width={11} height={11} />}
                    </button>
                    <span style={{ fontSize: '0.75rem', color: T.muted, fontWeight: 500 }}>
                        {isDone ? 'Completed' : 'Mark complete'}
                    </span>
                    <a
                        href={r.url} target="_blank" rel="noopener noreferrer"
                        className="lp-cta"
                        style={{
                            marginLeft: 'auto',
                            fontSize: '0.8125rem', fontWeight: 700,
                            color: '#fff', background: T.blue,
                            padding: '7px 12px', borderRadius: 8,
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            textDecoration: 'none',
                            transition: 'background .18s, transform .18s',
                        }}
                    >
                        {meta.cta}
                        <Icon.External width={10} height={10} />
                    </a>
                </div>
            </div>
        </article>
    )
}

/* ─── Left rail item ─────────────────────────────────────────── */
function SkillRailItem({ path, idx, isActive, doneCount, onClick }: {
    path: LearningPath; idx: number; isActive: boolean; doneCount: number; onClick: () => void
}) {
    const total = Array.isArray(path.resources) ? path.resources.length : 0
    const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0
    const pri = (path.importance ?? 'medium') as keyof typeof PRIORITY
    const p = PRIORITY[pri]

    return (
        <li>
            <button
                onClick={onClick}
                className={'lp-skill ' + (isActive ? 'is-active' : '')}
                style={{
                    width: '100%',
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto',
                    gap: 12,
                    alignItems: 'flex-start',
                    padding: '14px 14px',
                    borderRadius: 10,
                    textAlign: 'left',
                    border: '1px solid transparent',
                    background: 'transparent',
                    cursor: 'pointer',
                    marginBottom: 4,
                    fontFamily: 'inherit',
                }}
            >
                <div className="lp-skill-no" style={{
                    fontSize: '0.6875rem', fontWeight: 800,
                    color: T.muted2,
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: '0.06em',
                    paddingTop: 3,
                }}>{String(idx + 1).padStart(2, '0')}</div>

                <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                        <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            fontSize: '0.625rem', fontWeight: 700,
                            color: p.color, background: p.bg,
                            padding: '2px 7px', borderRadius: 99,
                            letterSpacing: '0.06em', textTransform: 'uppercase',
                        }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: p.dot, display: 'inline-block' }} />
                            {p.label}
                        </span>
                        {path.time_estimate && (
                            <span style={{ fontSize: '0.6875rem', color: T.muted, fontWeight: 600 }}>
                                {path.time_estimate}
                            </span>
                        )}
                    </div>
                    <div style={{
                        fontSize: '0.875rem', fontWeight: 700,
                        color: T.ink, letterSpacing: '-0.005em',
                        lineHeight: 1.35, marginBottom: 8,
                    }}>{path.skill_name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                            flex: 1, height: 4, background: T.line2,
                            borderRadius: 99, overflow: 'hidden',
                        }}>
                            <div className="lp-fill" style={{
                                width: `${pct}%`, height: '100%',
                                background: pct === 100 ? T.green : T.blue,
                                borderRadius: 99,
                                transition: 'width .4s',
                            }} />
                        </div>
                        <span style={{
                            fontSize: '0.6875rem', color: T.muted,
                            fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                        }}>{doneCount}/{total}</span>
                    </div>
                </div>

                <Icon.ChevronRight className="lp-skill-chev" style={{
                    color: T.muted2, alignSelf: 'center', flexShrink: 0,
                    opacity: 0,
                }} />
            </button>
        </li>
    )
}

/* ─── Right detail panel ─────────────────────────────────────── */
function SkillDetail({ path, job, completedSet, onToggle }: {
    path: LearningPath; job: Job | null; completedSet: Set<number>; onToggle: (i: number) => void
}) {
    const pri = (path.importance ?? 'medium') as keyof typeof PRIORITY
    const p = PRIORITY[pri]
    const resources = (Array.isArray(path.resources) ? path.resources : []) as LearningResource[]
    const total = resources.length
    const done = completedSet.size
    const pct = total > 0 ? Math.round((done / total) * 100) : 0
    const complete = total > 0 && done === total

    const hours = parseHours(path.time_estimate)

    return (
        <main key={path.id} className="lp-panel-anim" style={{
            padding: '36px 44px 64px',
            maxWidth: 1080,
            minWidth: 0,
        }}>
            {/* Head */}
            <header style={{
                display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
                gap: 24, flexWrap: 'wrap',
                paddingBottom: 24, borderBottom: `1px solid ${T.line2}`, marginBottom: 32,
            }}>
                <div style={{ flex: '1 1 480px', minWidth: 0 }}>
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        fontSize: '0.6875rem', fontWeight: 700,
                        color: p.color, background: p.bg,
                        padding: '4px 10px', borderRadius: 99,
                        letterSpacing: '0.14em', textTransform: 'uppercase',
                        marginBottom: 12,
                    }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: p.dot, display: 'inline-block' }} />
                        {p.label} skill{path.time_estimate ? ` · ${path.time_estimate}` : ''}
                    </div>
                    <h1 style={{
                        fontSize: '2.125rem', fontWeight: 800,
                        letterSpacing: '-0.03em', lineHeight: 1.1,
                        marginBottom: 10, color: T.ink,
                    }}>{path.skill_name}</h1>
                    {job && (
                        <div style={{
                            fontSize: '0.875rem', color: T.muted,
                            display: 'inline-flex', alignItems: 'center', gap: 10,
                            flexWrap: 'wrap',
                        }}>
                            {job.title && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                    <Icon.Briefcase />{job.title}
                                </span>
                            )}
                            {job.company && (<>
                                <span>·</span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                    <Icon.Building />{job.company}
                                </span>
                            </>)}
                        </div>
                    )}
                </div>

                {total > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{
                                fontSize: '0.6875rem', color: T.muted,
                                textTransform: 'uppercase', letterSpacing: '0.12em',
                                fontWeight: 700, marginBottom: 4,
                            }}>Progress</div>
                            <div style={{
                                fontSize: '1.5rem', fontWeight: 800,
                                color: T.ink, letterSpacing: '-0.02em', lineHeight: 1,
                            }}>
                                {done}
                                <span style={{ color: T.muted2, fontWeight: 600, fontSize: '0.875rem' }}> / {total}</span>
                            </div>
                        </div>
                        <div style={{
                            width: 120, height: 6, background: T.line2,
                            borderRadius: 99, overflow: 'hidden',
                        }}>
                            <div className="lp-fill" style={{
                                width: `${pct}%`, height: '100%',
                                background: complete ? T.green : T.blue,
                                transition: 'width .4s',
                            }} />
                        </div>
                    </div>
                )}
            </header>

            {/* Why now */}
            {path.why_it_matters && (
                <section style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 180px) 1fr',
                    gap: 32,
                    marginBottom: 36,
                    paddingBottom: 28,
                    borderBottom: `1px solid ${T.line2}`,
                }}>
                    <div>
                        <div style={{
                            fontSize: '0.6875rem', fontWeight: 700,
                            color: T.muted, letterSpacing: '0.14em',
                            textTransform: 'uppercase', marginBottom: 8,
                        }}>Why now</div>
                        <div style={{ fontSize: '0.75rem', color: T.muted, lineHeight: 1.5 }}>
                            {job?.title ? `For ${job.title}` : 'Role context'}
                            {job?.company ? ` at ${job.company}` : ''}
                        </div>
                        {path.prerequisites && path.prerequisites.toLowerCase() !== 'none' && (
                            <div style={{ fontSize: '0.75rem', color: T.muted, lineHeight: 1.5, marginTop: 8 }}>
                                <span style={{ fontWeight: 600, color: T.body }}>Pre-req: </span>
                                {path.prerequisites}
                            </div>
                        )}
                    </div>
                    <p style={{
                        fontSize: '1.0625rem', color: T.ink2,
                        lineHeight: 1.6, margin: 0,
                        textWrap: 'pretty' as 'pretty',
                    }}>{path.why_it_matters}</p>
                </section>
            )}

            {/* Block B insight strip — severity, milestone, next step, INR cost */}
            {(path.severity || path.milestone_check || path.next_step_action || path.cost_inr != null) && (
                <section style={{
                    background: path.severity === 'hard_blocker' ? '#FEF2F2' : T.bgAlt,
                    border: `1px solid ${path.severity === 'hard_blocker' ? '#FECACA' : T.line2}`,
                    borderLeft: `3px solid ${path.severity === 'hard_blocker' ? T.redText : T.blue}`,
                    borderRadius: 10,
                    padding: '18px 22px',
                    marginBottom: 28,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 18,
                }}>
                    {path.severity && (
                        <div>
                            <div style={{ fontSize: '0.625rem', fontWeight: 800, color: T.muted, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>Severity</div>
                            <span style={{
                                display: 'inline-block', padding: '3px 10px', borderRadius: 6,
                                fontSize: '0.6875rem', fontWeight: 800, letterSpacing: '0.04em',
                                background: path.severity === 'hard_blocker' ? T.redBg : T.amberBg,
                                color: path.severity === 'hard_blocker' ? T.redText : T.amberText,
                            }}>
                                {path.severity === 'hard_blocker' ? 'HARD BLOCKER' : 'NICE TO HAVE'}
                            </span>
                            {path.rationale && (
                                <div style={{ fontSize: '0.75rem', color: T.muted, lineHeight: 1.5, marginTop: 6 }}>{path.rationale}</div>
                            )}
                        </div>
                    )}
                    {path.next_step_action && (
                        <div>
                            <div style={{ fontSize: '0.625rem', fontWeight: 800, color: T.blue, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>▸ Today's next step</div>
                            <div style={{ fontSize: '0.875rem', color: T.ink2, lineHeight: 1.5 }}>{path.next_step_action}</div>
                        </div>
                    )}
                    {path.milestone_check && (
                        <div>
                            <div style={{ fontSize: '0.625rem', fontWeight: 800, color: T.greenText, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>◎ Done when</div>
                            <div style={{ fontSize: '0.875rem', color: T.ink2, lineHeight: 1.5 }}>{path.milestone_check}</div>
                        </div>
                    )}
                    {(path.provider || path.cost_inr != null || path.duration_weeks || path.india_specific) && (
                        <div>
                            <div style={{ fontSize: '0.625rem', fontWeight: 800, color: T.muted, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>Top resource</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                                {path.provider && (
                                    <span style={{ fontSize: '0.75rem', padding: '3px 8px', borderRadius: 4, background: T.sand, color: T.sandText, fontWeight: 700 }}>{path.provider}</span>
                                )}
                                {path.cost_inr != null && (
                                    <span style={{ fontSize: '0.75rem', padding: '3px 8px', borderRadius: 4, background: path.cost_inr === 0 ? T.greenBg : T.amberBg, color: path.cost_inr === 0 ? T.greenText : T.amberText, fontWeight: 700 }}>
                                        {path.cost_inr === 0 ? 'FREE' : `₹${path.cost_inr}`}
                                    </span>
                                )}
                                {path.duration_weeks != null && (
                                    <span style={{ fontSize: '0.75rem', padding: '3px 8px', borderRadius: 4, background: T.blue50, color: T.blue700, fontWeight: 700 }}>{path.duration_weeks}w</span>
                                )}
                                {path.india_specific && (
                                    <span style={{ fontSize: '0.75rem', padding: '3px 8px', borderRadius: 4, background: '#FFF1E6', color: '#9A3412', fontWeight: 700 }}>🇮🇳 India</span>
                                )}
                            </div>
                        </div>
                    )}
                </section>
            )}

            {/* Resources header */}
            {total > 0 && (
                <div style={{
                    marginBottom: 14, display: 'flex',
                    alignItems: 'baseline', justifyContent: 'space-between',
                    flexWrap: 'wrap', gap: 10,
                }}>
                    <h2 style={{
                        fontSize: '1.25rem', fontWeight: 800,
                        color: T.ink, letterSpacing: '-0.02em',
                    }}>Curated resources · {total}</h2>
                    <div style={{ fontSize: '0.8125rem', color: T.muted }}>
                        Sequence them in order
                        {hours > 0 ? ` · ~${hours}h` : ''}
                        {resources.every(r => r.free) ? ' · all free' : ''}
                    </div>
                </div>
            )}

            {/* Card grid */}
            {total > 0 && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                    gap: 18, marginBottom: 36,
                }}>
                    {resources.map((r, i) => (
                        <ResourceCard
                            key={i}
                            r={r}
                            idx={i}
                            isDone={completedSet.has(i)}
                            onToggle={() => onToggle(i)}
                        />
                    ))}
                </div>
            )}

            {/* Outcomes */}
            {Array.isArray(path.key_takeaways) && path.key_takeaways.length > 0 && (
                <section style={{
                    background: '#fff',
                    border: `1px solid ${T.line2}`,
                    borderRadius: 12,
                    padding: '22px 26px',
                }}>
                    <div style={{
                        fontSize: '0.6875rem', fontWeight: 700,
                        color: T.muted, letterSpacing: '0.14em',
                        textTransform: 'uppercase', marginBottom: 14,
                        display: 'inline-flex', alignItems: 'center', gap: 7,
                    }}>
                        <Icon.Lightbulb width={12} height={12} /> What you&apos;ll be able to do
                    </div>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                        gap: 18,
                    }}>
                        {path.key_takeaways.map((k, i) => (
                            <div key={i} style={{ display: 'flex', gap: 10 }}>
                                <span style={{
                                    flexShrink: 0, fontSize: '1.5rem', fontWeight: 800,
                                    color: T.blue, lineHeight: 1,
                                    fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.04em',
                                }}>
                                    {String(i + 1).padStart(2, '0')}
                                </span>
                                <span style={{
                                    fontSize: '0.8125rem', color: T.body,
                                    lineHeight: 1.5, paddingTop: 4,
                                }}>{k}</span>
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </main>
    )
}

/* ─── Loading State ──────────────────────────────────────────── */
function GeneratingState() {
    const [step, setStep] = useState(0)
    useEffect(() => {
        const t = setInterval(() => setStep(s => (s + 1) % LOADING_STEPS.length), 2400)
        return () => clearInterval(t)
    }, [])

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '72px 24px', gap: 22,
            background: '#fff', border: `1px solid ${T.line2}`,
            borderRadius: 14,
        }}>
            <div style={{
                width: 60, height: 60, borderRadius: '50%',
                border: `2px solid ${T.line2}`,
                borderTopColor: T.blue,
                animation: 'lp-spin 0.9s linear infinite',
            }} />
            <div key={step} style={{
                fontSize: '1rem', color: T.ink, fontWeight: 600,
                animation: 'lp-fadein 0.3s ease',
                display: 'flex', alignItems: 'center', gap: 8,
                letterSpacing: '-0.01em',
            }}>
                {LOADING_STEPS[step]}
                <span className="lp-cursor" style={{ color: T.blue }}>_</span>
            </div>
            <p style={{ fontSize: '0.8125rem', color: T.muted, margin: 0 }}>
                Generating your personalized roadmap · 15–30 sec
            </p>
            <div style={{
                width: 280, height: 3, background: T.line2,
                borderRadius: 99, overflow: 'hidden', position: 'relative',
            }}>
                <div style={{
                    height: '100%', width: '40%',
                    background: `linear-gradient(90deg, transparent, ${T.blue}, transparent)`,
                    animation: 'lp-scan 1.6s ease-in-out infinite',
                }} />
            </div>
        </div>
    )
}

/* ─── Empty State ────────────────────────────────────────────── */
function EmptyState({ onGenerate, count }: { onGenerate: () => void; count: number }) {
    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '72px 28px', gap: 18,
            background: '#fff',
            border: `1px dashed ${T.line}`,
            borderRadius: 14,
            textAlign: 'center',
        }}>
            <div style={{
                width: 56, height: 56, borderRadius: 16,
                background: T.blue50, color: T.blue,
                display: 'grid', placeItems: 'center',
                border: `1px solid ${T.blueLight}`,
            }}>
                <Icon.Sparkles width={26} height={26} />
            </div>
            <h3 style={{
                fontSize: '1.375rem', fontWeight: 800,
                color: T.ink, letterSpacing: '-0.02em',
                margin: '4px 0 0',
            }}>No learning paths generated yet</h3>
            <p style={{
                fontSize: '0.9375rem', color: T.muted,
                maxWidth: 460, lineHeight: 1.55, margin: 0,
            }}>
                {count > 0
                    ? `${count} missing skill${count !== 1 ? 's' : ''} detected on this match. Generate sequenced, vetted reading lists to close each gap.`
                    : 'Generate a personalized roadmap of curated resources for your skill gaps on this role.'}
            </p>
            <button
                onClick={onGenerate}
                className="lp-cta"
                style={{
                    marginTop: 6,
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '12px 24px', borderRadius: 10,
                    background: T.blue, color: '#fff',
                    border: 'none', cursor: 'pointer',
                    fontSize: '0.9375rem', fontWeight: 700,
                    letterSpacing: '-0.005em',
                    boxShadow: '0 8px 20px -8px rgba(37,99,235,.45)',
                    transition: 'background .18s, transform .18s',
                }}
            >
                <Icon.Sparkles width={14} height={14} /> Generate roadmap
            </button>
        </div>
    )
}

/* ─── History Index (no jobId) ───────────────────────────────── */
function relativeTime(iso: string): string {
    const then = new Date(iso).getTime()
    if (Number.isNaN(then)) return ''
    const diffMs = Date.now() - then
    const m = Math.floor(diffMs / 60_000)
    if (m < 1) return 'Just now'
    if (m < 60) return `${m} min${m !== 1 ? 's' : ''} ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h} hour${h !== 1 ? 's' : ''} ago`
    const d = Math.floor(h / 24)
    if (d < 7) return `${d} day${d !== 1 ? 's' : ''} ago`
    if (d < 30) return `${Math.floor(d / 7)} week${Math.floor(d / 7) !== 1 ? 's' : ''} ago`
    return new Date(iso).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
}


/* ─── Learning Library (no jobId) ────────────────────────────── */
/* Faithful port of design tarball: project/learning-path/LearningLibrary.html
   — Card grid, Plus Jakarta Sans display + Inter body, hash-coloured avatars,
   staggered fade-in, filter pills, progress derived from localStorage. */

const AVATAR_PALETTES: ReadonlyArray<readonly [string, string]> = [
    ['#1E40AF', '#1E3A8A'], ['#0E7490', '#155E75'], ['#059669', '#047857'],
    ['#7C3AED', '#5B21B6'], ['#B91C1C', '#991B1B'], ['#1D4ED8', '#1E3A8A'],
    ['#0369A1', '#075985'], ['#92400E', '#78350F'], ['#065F46', '#064E3B'],
]
function paletteFor(name: string): readonly [string, string] {
    let h = 0
    for (const ch of name || '') h = (ch.charCodeAt(0) + ((h << 5) - h)) | 0
    return AVATAR_PALETTES[Math.abs(h) % AVATAR_PALETTES.length]
}
function initialsOf(name: string): string {
    const words = (name || '?').replace(/[^\w\s]/g, ' ').trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) return '?'
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
    return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

/** Read localStorage progress for every learning path and derive a 0–100% per jobId.
 *  Heuristic: skills_with_any_progress / skill_count. Approximate but cheap. */
function useLibraryProgress(summaries: LearningPathSummary[]): Record<string, number> {
    const [map, setMap] = useState<Record<string, number>>({})
    useEffect(() => {
        if (typeof window === 'undefined') return
        const next: Record<string, number> = {}
        for (const s of summaries) {
            try {
                const raw = localStorage.getItem(`lp_progress_${s.job_id}`)
                if (!raw) { next[s.job_id] = 0; continue }
                const parsed = JSON.parse(raw) as Record<string, number[]>
                const touched = Object.values(parsed).filter(arr => Array.isArray(arr) && arr.length > 0).length
                next[s.job_id] = s.skill_count > 0 ? Math.min(100, Math.round((touched / s.skill_count) * 100)) : 0
            } catch { next[s.job_id] = 0 }
        }
        setMap(next)
    }, [summaries])
    return map
}

type LibFilter = 'all' | 'inprogress' | 'complete' | 'new'

function LearningHistoryIndex({ summaries }: { summaries: LearningPathSummary[] }) {
    const [filter, setFilter] = useState<LibFilter>('all')
    const [visible, setVisible] = useState(false)
    const progressMap = useLibraryProgress(summaries)
    const total = summaries.length

    useEffect(() => {
        const t = setTimeout(() => setVisible(true), 60)
        return () => clearTimeout(t)
    }, [])

    const filtered = useMemo(() => {
        if (filter === 'all') return summaries
        return summaries.filter(s => {
            const p = progressMap[s.job_id] ?? 0
            if (filter === 'inprogress') return p > 0 && p < 100
            if (filter === 'complete') return p === 100
            return p === 0 // 'new'
        })
    }, [filter, summaries, progressMap])

    return (
        <div className="lib-page">
            <LibraryStyles />
            <div className="lib-shell">

                {/* ── Header ── */}
                <header className="lib-header">
                    <div className="lib-eyebrow">
                        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 3l1.8 4.6L18 9.4l-4.2 1.8L12 16l-1.8-4.8L6 9.4l4.2-1.8z" />
                            <path d="M19 14l.9 2.3L22 17l-2.1.7L19 20l-.9-2.3L16 17l2.1-.7z" />
                        </svg>
                        Learning Library
                    </div>
                    <h1 className="lib-h1">Your learning paths</h1>
                    <p className="lib-sub">
                        {total === 0
                            ? 'No learning paths yet. Generate one from AI Matches.'
                            : (<>You&rsquo;ve generated <b>{total} learning path{total !== 1 ? 's' : ''}</b>. Pick one to resume.</>)
                        }
                    </p>
                </header>

                {/* ── Controls ── */}
                {total > 0 && (
                    <div className="lib-controls">
                        <div className="lib-filter-group" role="tablist">
                            {([
                                { k: 'all', l: 'All' },
                                { k: 'inprogress', l: 'In progress' },
                                { k: 'complete', l: 'Complete' },
                                { k: 'new', l: 'Not started' },
                            ] as { k: LibFilter; l: string }[]).map(f => (
                                <button
                                    key={f.k}
                                    role="tab"
                                    aria-selected={filter === f.k}
                                    className={'lib-filter' + (filter === f.k ? ' active' : '')}
                                    onClick={() => setFilter(f.k)}
                                >{f.l}</button>
                            ))}
                        </div>
                        <button className="lib-sort" type="button">
                            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="15" y2="12" /><line x1="3" y1="18" x2="9" y2="18" />
                            </svg>
                            Most recent
                        </button>
                        <span className="lib-count">{filtered.length} path{filtered.length !== 1 ? 's' : ''}</span>
                    </div>
                )}

                {/* ── Grid ── */}
                <div className="lib-grid">
                    {total === 0 && <LibraryEmptyState />}
                    {total > 0 && filtered.length === 0 && (
                        <div className="lib-empty">
                            <div className="lib-empty-icon">
                                <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 3l1.8 4.6L18 9.4l-4.2 1.8L12 16l-1.8-4.8L6 9.4l4.2-1.8z" />
                                    <path d="M19 14l.9 2.3L22 17l-2.1.7L19 20l-.9-2.3L16 17l2.1-.7z" />
                                </svg>
                            </div>
                            <div className="lib-empty-h">Nothing here yet</div>
                            <p className="lib-empty-sub">No paths match this filter. Try a different view or generate a new path from AI Matches.</p>
                            <button className="lib-empty-cta" type="button" onClick={() => setFilter('all')}>Show all paths</button>
                        </div>
                    )}
                    {total > 0 && filtered.map((s, idx) => (
                        <PathCard
                            key={s.job_id}
                            s={s}
                            idx={idx}
                            visible={visible}
                            progress={progressMap[s.job_id] ?? 0}
                        />
                    ))}
                </div>
            </div>
        </div>
    )
}

function LibraryEmptyState() {
    return (
        <div className="lib-empty">
            <div className="lib-empty-icon">
                <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3l1.8 4.6L18 9.4l-4.2 1.8L12 16l-1.8-4.8L6 9.4l4.2-1.8z" />
                    <path d="M19 14l.9 2.3L22 17l-2.1.7L19 20l-.9-2.3L16 17l2.1-.7z" />
                </svg>
            </div>
            <div className="lib-empty-h">No learning paths yet</div>
            <p className="lib-empty-sub">Score a job in AI Matches and click &ldquo;Generate Learning Path&rdquo; to create your first personalised roadmap.</p>
            <Link className="lib-empty-cta" href="/dashboard/matches">
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3l1.8 4.6L18 9.4l-4.2 1.8L12 16l-1.8-4.8L6 9.4l4.2-1.8z" />
                    <path d="M19 14l.9 2.3L22 17l-2.1.7L19 20l-.9-2.3L16 17l2.1-.7z" />
                </svg>
                Go to AI Matches
            </Link>
        </div>
    )
}

function PathCard({ s, idx, visible, progress }: { s: LearningPathSummary; idx: number; visible: boolean; progress: number }) {
    const company = s.job?.company ?? 'Unknown company'
    const city = (s.job?.location?.split(',')[0] || '').trim()
    const title = s.job?.title ?? 'Untitled role'
    const [a, b] = paletteFor(company)
    const total = s.skill_count
    const skillsShown = s.top_skills.slice(0, 3)
    const extra = Math.max(0, total - skillsShown.length)
    const done = progress === 100
    const started = progress > 0
    const cta = done ? 'Review' : started ? 'Continue' : 'Open'

    return (
        <Link
            href={`/dashboard/learning?jobId=${s.job_id}`}
            className={'lib-card' + (visible ? ' visible' : '')}
            style={{ transitionDelay: visible ? `${idx * 60}ms` : '0ms' }}
        >
            {/* Top */}
            <div className="lib-card-top">
                <div className="lib-avatar" style={{ background: `linear-gradient(135deg,${a},${b})` }}>
                    {initialsOf(company)}
                </div>
                <div className="lib-co-meta">
                    <div className="lib-co-name">{company}</div>
                    {city && (
                        <div className="lib-co-city">
                            <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                            </svg>
                            {city}
                        </div>
                    )}
                </div>
                {done && (
                    <div className="lib-done-badge">✓ Complete</div>
                )}
            </div>

            {/* Body */}
            <div className="lib-card-body">
                <div className="lib-job-title">{title}</div>

                {/* Progress */}
                <div className="lib-prog-row">
                    <div className="lib-prog-bar">
                        <div
                            className="lib-prog-fill"
                            style={{ width: progress + '%', background: done ? T.green : T.blue }}
                        />
                    </div>
                    <span
                        className="lib-prog-label"
                        style={{ color: done ? T.green : started ? T.blue : T.muted }}
                    >
                        {done ? 'Done' : started ? progress + '%' : 'Not started'}
                    </span>
                </div>

                {/* Pills */}
                <div className="lib-pills">
                    <span className="lib-pill lib-pill-blue">{total} skill{total !== 1 ? 's' : ''}</span>
                    {s.critical_count > 0 && (
                        <span className="lib-pill lib-pill-red">
                            <span className="lib-pill-dot" style={{ background: '#DC2626' }} />
                            {s.critical_count} critical
                        </span>
                    )}
                    {s.standard_count > 0 && (
                        <span className="lib-pill lib-pill-amber">
                            <span className="lib-pill-dot" style={{ background: '#D97706' }} />
                            {s.standard_count} standard
                        </span>
                    )}
                    {s.optional_count > 0 && (
                        <span className="lib-pill lib-pill-green">
                            <span className="lib-pill-dot" style={{ background: '#059669' }} />
                            {s.optional_count} optional
                        </span>
                    )}
                </div>

                {/* Skills strip */}
                {skillsShown.length > 0 && (
                    <div className="lib-skills">
                        <b>Skills</b>
                        {skillsShown.map((k, i) => (
                            <span key={k}>{k}{i < skillsShown.length - 1 || extra > 0 ? ' · ' : ''}</span>
                        ))}
                        {extra > 0 && <span style={{ color: T.muted }}>+{extra} more</span>}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="lib-card-foot">
                <div className="lib-time">
                    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                    </svg>
                    {relativeTime(s.latest_created_at)}
                </div>
                <div className="lib-card-cta">
                    {cta}
                    <span className="lib-card-cta-arrow">
                        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                        </svg>
                    </span>
                </div>
            </div>
        </Link>
    )
}

function LibraryStyles() {
    return (
        <style>{`
            .lib-page {
                min-height: calc(100vh - 64px);
                background: ${T.bgAlt};
                color: ${T.ink};
                font-family: 'Inter', system-ui, sans-serif;
                -webkit-font-smoothing: antialiased;
                line-height: 1.55;
            }
            .lib-shell { max-width: 1280px; margin: 0 auto; padding: 44px 40px 80px; }

            /* Header */
            .lib-header { margin-bottom: 40px; }
            .lib-eyebrow {
                display: inline-flex; align-items: center; gap: 7px;
                font-size: .6875rem; font-weight: 700;
                letter-spacing: .2em; text-transform: uppercase;
                color: ${T.blue}; background: ${T.blue50};
                border: 1px solid ${T.blueLight};
                padding: 5px 12px; border-radius: 99px;
                margin-bottom: 18px;
            }
            .lib-h1 {
                font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
                font-size: 2.625rem; font-weight: 800;
                letter-spacing: -.04em; line-height: 1.06;
                color: ${T.ink}; margin: 0 0 12px;
            }
            .lib-sub {
                font-size: 1.0625rem; color: ${T.muted};
                line-height: 1.55; max-width: 600px; margin: 0;
            }
            .lib-sub b { color: ${T.ink2}; font-weight: 600; }

            /* Controls */
            .lib-controls {
                display: flex; align-items: center; gap: 12px;
                margin-bottom: 28px; flex-wrap: wrap;
            }
            .lib-filter-group {
                display: flex; gap: 4px;
                background: #F1F5F9;
                border: 1px solid ${T.line};
                border-radius: 9px; padding: 3px;
            }
            .lib-filter {
                font-family: inherit;
                font-size: .8125rem; font-weight: 600;
                color: ${T.muted}; padding: 6px 14px;
                border-radius: 7px; transition: all .15s;
                cursor: pointer; background: transparent; border: 1px solid transparent;
            }
            .lib-filter.active {
                background: #fff; color: ${T.ink};
                box-shadow: 0 1px 2px rgba(15,23,42,.05);
                border-color: ${T.line};
            }
            .lib-sort {
                display: inline-flex; align-items: center; gap: 6px;
                font-family: inherit;
                font-size: .8125rem; font-weight: 600;
                color: ${T.muted};
                padding: 8px 14px; border: 1px solid ${T.line};
                border-radius: 9px; background: #fff;
                cursor: pointer; transition: border-color .15s;
            }
            .lib-sort:hover { border-color: #CBD5E1; }
            .lib-count {
                margin-left: auto;
                font-size: .8125rem; color: ${T.muted}; font-weight: 500;
            }

            /* Grid */
            .lib-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
                gap: 18px;
            }

            /* Card */
            .lib-card {
                background: #fff;
                border: 1px solid ${T.line};
                border-radius: 14px;
                overflow: hidden;
                display: flex; flex-direction: column;
                cursor: pointer; color: ${T.ink};
                text-decoration: none;
                opacity: 0; transform: translateY(10px);
                transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
            }
            .lib-card.visible {
                opacity: 1; transform: translateY(0);
                transition: transform .32s ease, box-shadow .18s ease, border-color .18s ease, opacity .32s ease;
            }
            .lib-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 20px 40px -12px rgba(15,23,42,.12), 0 8px 16px -8px rgba(15,23,42,.06);
                border-color: #BFDBFE;
            }
            .lib-card:hover .lib-card-cta-arrow { transform: translateX(2px); }

            /* Card top */
            .lib-card-top {
                padding: 20px 22px 16px;
                display: flex; align-items: flex-start; gap: 14px;
                border-bottom: 1px solid ${T.line2};
            }
            .lib-avatar {
                width: 44px; height: 44px;
                border-radius: 10px;
                display: grid; place-items: center;
                font-weight: 800; font-size: 1rem;
                letter-spacing: -.02em; color: #fff;
                flex-shrink: 0;
                box-shadow: 0 4px 10px -3px rgba(0,0,0,.22);
            }
            .lib-co-meta { min-width: 0; flex: 1; }
            .lib-co-name {
                font-size: .8125rem; font-weight: 700;
                color: ${T.ink2}; letter-spacing: -.005em;
                margin-bottom: 2px;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }
            .lib-co-city {
                font-size: .6875rem; color: ${T.muted};
                display: inline-flex; align-items: center; gap: 4px;
            }
            .lib-done-badge {
                margin-left: auto;
                font-size: .6rem; font-weight: 700;
                color: ${T.green}; background: #DCFCE7;
                border: 1px solid #A7F3D0; border-radius: 99px;
                padding: 3px 8px;
                letter-spacing: .08em; text-transform: uppercase;
                white-space: nowrap; flex-shrink: 0;
            }

            /* Card body */
            .lib-card-body { padding: 16px 22px 14px; flex: 1; }
            .lib-job-title {
                font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
                font-size: 1.125rem; font-weight: 700;
                color: ${T.ink}; letter-spacing: -.02em; line-height: 1.3;
                margin-bottom: 14px;
                display: -webkit-box; -webkit-line-clamp: 2;
                -webkit-box-orient: vertical; overflow: hidden;
            }

            /* Progress */
            .lib-prog-row {
                display: flex; align-items: center; gap: 10px;
                margin-bottom: 14px;
            }
            .lib-prog-bar {
                flex: 1; height: 4px;
                background: ${T.line2};
                border-radius: 99px; overflow: hidden;
            }
            .lib-prog-fill {
                height: 100%; border-radius: 99px;
                background: ${T.blue};
                transition: width .4s;
            }
            .lib-prog-label {
                font-size: .6875rem; color: ${T.muted};
                font-weight: 600; white-space: nowrap;
            }

            /* Pills */
            .lib-pills {
                display: flex; gap: 6px;
                flex-wrap: wrap; margin-bottom: 14px;
            }
            .lib-pill {
                display: inline-flex; align-items: center; gap: 5px;
                font-size: .6875rem; font-weight: 700;
                padding: 3px 9px; border-radius: 99px;
                letter-spacing: .02em;
            }
            .lib-pill-blue  { background: ${T.blue50}; color: ${T.blue700}; border: 1px solid ${T.blueLight}; }
            .lib-pill-red   { background: #FEF2F2; color: #DC2626; border: 1px solid #FECACA; }
            .lib-pill-amber { background: #FFFBEB; color: #D97706; border: 1px solid #FDE68A; }
            .lib-pill-green { background: #ECFDF5; color: #059669; border: 1px solid #A7F3D0; }
            .lib-pill-dot {
                width: 5px; height: 5px;
                border-radius: 50%; display: inline-block;
            }

            /* Skills strip */
            .lib-skills {
                font-size: .6875rem; color: ${T.muted};
                font-weight: 500; line-height: 1.5;
            }
            .lib-skills b {
                font-weight: 700; color: ${T.body};
                text-transform: uppercase;
                letter-spacing: .08em;
                font-size: .5625rem; margin-right: 6px;
            }
            .lib-skills span { color: ${T.body}; }

            /* Card footer */
            .lib-card-foot {
                padding: 12px 22px;
                border-top: 1px solid ${T.line2};
                display: flex; align-items: center; justify-content: space-between;
                gap: 10px; background: #F8FAFD;
            }
            .lib-time {
                font-size: .75rem; color: ${T.muted}; font-weight: 500;
                display: inline-flex; align-items: center; gap: 5px;
            }
            .lib-card-cta {
                font-size: .8125rem; font-weight: 700;
                color: ${T.blue};
                display: inline-flex; align-items: center; gap: 5px;
            }
            .lib-card-cta-arrow { transition: transform .18s ease; display: inline-flex; }

            /* Empty state */
            .lib-empty {
                display: flex; flex-direction: column;
                align-items: center; justify-content: center;
                text-align: center;
                padding: 80px 40px;
                background: #fff;
                border: 1px solid ${T.line};
                border-radius: 14px;
                grid-column: 1 / -1;
            }
            .lib-empty-icon {
                width: 64px; height: 64px;
                border-radius: 16px;
                background: ${T.blue50}; color: ${T.blue};
                display: grid; place-items: center;
                margin: 0 auto 20px;
                border: 1px solid ${T.blueLight};
            }
            .lib-empty-h {
                font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
                font-size: 1.375rem; font-weight: 700;
                color: ${T.ink}; letter-spacing: -.02em;
                margin-bottom: 8px;
            }
            .lib-empty-sub {
                font-size: .9375rem; color: ${T.muted};
                max-width: 360px; line-height: 1.6;
                margin: 0 0 24px;
            }
            .lib-empty-cta {
                display: inline-flex; align-items: center; gap: 8px;
                background: ${T.blue}; color: #fff;
                font-size: .875rem; font-weight: 700;
                padding: 11px 22px; border-radius: 10px;
                box-shadow: 0 8px 24px -8px rgba(37,99,235,.30);
                text-decoration: none;
                transition: transform .15s ease, box-shadow .15s ease, background .15s ease;
                border: none; cursor: pointer; font-family: inherit;
            }
            .lib-empty-cta:hover { transform: translateY(-1px); background: ${T.blue600}; }

            /* Responsive */
            @media (max-width: 720px) {
                .lib-shell { padding: 32px 20px 64px; }
                .lib-h1 { font-size: 2rem; }
                .lib-count { margin-left: 0; width: 100%; }
            }
        `}</style>
    )
}

/* ─── Page wrapper ───────────────────────────────────────────── */
export default function LearningPageWrapper() {
    return (
        <Suspense fallback={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
                <div style={{ width: 28, height: 28, border: `2px solid ${T.line2}`, borderTopColor: T.blue, borderRadius: '50%', animation: 'lp-spin 0.8s linear infinite' }} />
            </div>
        }>
            <LearningPage />
        </Suspense>
    )
}

/* Find the path matching the ?skill= the user clicked in the Build Plan ("Learn it").
   Fuzzy because build-plan skill names are short ("CI/CD") while path skill_names are
   the full gap phrase ("GIT and CI/CD tools"). Returns null on no match (so the caller
   can generate that skill on demand). */
function findPathForSkill(list: LearningPath[], skill: string | null): LearningPath | null {
    if (!list.length || !skill) return null
    const want = skill.trim().toLowerCase()
    const exact = list.find(p => (p.skill_name || '').toLowerCase() === want)
    if (exact) return exact
    const sub = list.find(p => {
        const sn = (p.skill_name || '').toLowerCase()
        return sn.includes(want) || want.includes(sn)
    })
    if (sub) return sub
    const tokens = want.split(/[^a-z0-9]+/).filter(t => t.length > 2)
    const tok = list.find(p => {
        const sn = (p.skill_name || '').toLowerCase()
        return tokens.some(t => sn.includes(t))
    })
    return tok ?? null
}

/* ─── Main Page ──────────────────────────────────────────────── */
function LearningPage() {
    useStyles()
    const { user } = useAuth()
    const searchParams = useSearchParams()
    const router = useRouter()
    const jobId = searchParams.get('jobId')
    const skillParam = searchParams.get('skill')  // skill the user clicked "Learn it" on (Build Plan)

    const [job, setJob] = useState<Job | null>(null)
    const [paths, setPaths] = useState<LearningPath[]>([])
    const [missingSkills, setMissingSkills] = useState<string[]>([])
    const [gaps, setGaps] = useState<import('@/lib/types').JobGap[] | null>(null)
    const [phase, setPhase] = useState<'loading' | 'idle' | 'history' | 'generating' | 'done' | 'error'>('loading')
    const [error, setError] = useState<string | null>(null)
    const [activeId, setActiveId] = useState<string | null>(null)
    const [summaries, setSummaries] = useState<LearningPathSummary[]>([])
    // Guards on-demand generation so it fires at most once per (job, skill) — prevents a
    // duplicate paid generation when the load effect runs twice (auth hydration / re-render).
    const genTriggeredRef = useRef<string | null>(null)

    const { progress, toggle } = useProgress(jobId)

    // ── Mobile state ──
    const [isMobile, setIsMobile] = useState(false)
    const [showAllSkillsSheet, setShowAllSkillsSheet] = useState(false)
    useEffect(() => {
        const mq = window.matchMedia('(max-width: 767px)')
        setIsMobile(mq.matches)
        const h = (e: MediaQueryListEvent) => setIsMobile(e.matches)
        mq.addEventListener('change', h)
        return () => mq.removeEventListener('change', h)
    }, [])

    // Always-on summaries fetch — feeds the "Library · N" pill on detail pages.
    useEffect(() => {
        if (!user?.id) return
        let cancelled = false
        fetchLearningPathSummaries(user.id).then(list => {
            if (!cancelled) setSummaries(list)
        }).catch(() => { /* non-fatal */ })
        return () => { cancelled = true }
    }, [user?.id])

    const loadData = useCallback(async () => {
        if (!jobId) {
            // No job in URL → show the user's history of generated learning paths
            if (!user?.id) { setPhase('history'); return }
            const list = await fetchLearningPathSummaries(user.id)
            setSummaries(list)
            setPhase('history')
            return
        }

        // Wait for auth to hydrate — running loadData with an empty user_id causes 406s
        // and a spurious empty-user generation. The effect re-runs once the user loads.
        if (!user?.id) { setPhase('loading'); return }

        const { data: jobData } = await supabase
            .from('jobs').select('*').eq('id', jobId).single()
        const jobObj = jobData ? (jobData as unknown as Job) : null
        if (jobObj) setJob(jobObj)

        const existing = await fetchLearningPaths(user?.id ?? '', jobId)

        const { data: matchData } = await supabase
            .from('user_job_matches')
            .select('missing_skills, gaps')
            .eq('user_id', user?.id ?? '')
            .eq('job_id', jobId)
            .order('relevance_score', { ascending: false })
            .limit(1)
            .single() as { data: { missing_skills?: unknown[]; gaps?: unknown[] } | null; error: unknown }

        const mMissing = (matchData?.missing_skills && Array.isArray(matchData.missing_skills))
            ? matchData.missing_skills as string[] : []
        const mGaps = (matchData?.gaps && Array.isArray(matchData.gaps) && matchData.gaps.length > 0)
            ? matchData.gaps as import('@/lib/types').JobGap[] : null
        setMissingSkills(mMissing)
        if (mGaps) setGaps(mGaps)

        // Generate a learning path for ONE clicked skill on demand (used by "Learn it").
        const generateForSkill = async (skill: string) => {
            setPhase('generating')
            try {
                let company_research = null
                if (jobObj?.company) {
                    const { data: cr } = await supabase
                        .from('company_research')
                        .select('overview, tech_stack, culture, industry')
                        .ilike('company_name', `%${jobObj.company}%`)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .single()
                    if (cr) company_research = cr
                }
                // Prefer the real scoring gap (keeps severity/adjacency) when the clicked skill maps to one.
                const w = skill.toLowerCase()
                const matchedGap = (mGaps || []).find(g => {
                    const gs = String(g?.skill || '').toLowerCase()
                    return gs === w || gs.includes(w) || w.includes(gs)
                })
                await triggerLearningPathGeneration({
                    userId: user?.id ?? '',
                    jobId,
                    resumeId: getPrimaryResumeId() ?? undefined,
                    missingSkills: [skill],
                    gaps: matchedGap ? [matchedGap] : undefined,
                    jobTitle: jobObj?.title ?? 'Software Engineer',
                    companyName: jobObj?.company ?? 'the company',
                    company_research,
                })
                const fresh = await fetchLearningPaths(user?.id ?? '', jobId)
                setPaths(fresh)
                const m = findPathForSkill(fresh, skill)
                setActiveId((m ?? fresh[0])?.id ?? null)
                setPhase(fresh.length > 0 ? 'done' : 'idle')
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Generation failed')
                setPhase('error')
            }
        }

        // "Learn it" deep-link: open the clicked skill's path — and if it doesn't exist
        // yet, generate just that one skill on demand instead of showing the wrong card.
        if (skillParam) {
            const matched = findPathForSkill(existing, skillParam)
            if (matched) {
                setPaths(existing)
                setActiveId(matched.id)
                setPhase('done')
                return
            }
            setPaths(existing)
            const genKey = `${jobId}::${skillParam}`
            if (genTriggeredRef.current !== genKey) {
                genTriggeredRef.current = genKey
                await generateForSkill(skillParam)
            } else {
                setPhase('generating')
            }
            return
        }

        setPaths(existing)
        if (existing.length > 0) setActiveId(existing[0].id)
        setPhase(existing.length > 0 ? 'done' : 'idle')
    }, [jobId, user?.id, skillParam])

    useEffect(() => { loadData() }, [loadData])

    const handleGenerate = async () => {
        if (!jobId) return
        setPhase('generating')
        try {
            let company_research = null
            if (job?.company) {
                const { data: cr } = await supabase
                    .from('company_research')
                    .select('overview, tech_stack, culture, industry')
                    .ilike('company_name', `%${job.company}%`)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single()
                if (cr) company_research = cr
            }
            await triggerLearningPathGeneration({
                userId: user?.id ?? '',
                jobId,
                resumeId: getPrimaryResumeId() ?? undefined,
                missingSkills: missingSkills.length > 0 ? missingSkills : ['General IT Skills'],
                gaps: gaps && gaps.length > 0 ? gaps : undefined,
                jobTitle: job?.title ?? 'Software Engineer',
                companyName: job?.company ?? 'the company',
                company_research,
            })
            const fresh = await fetchLearningPaths(user?.id ?? '', jobId)
            setPaths(fresh)
            if (fresh.length > 0) setActiveId((findPathForSkill(fresh, skillParam) ?? fresh[0]).id)
            setPhase('done')
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Generation failed')
            setPhase('error')
        }
    }

    const orderedPaths = useMemo(() => {
        const rank: Record<string, number> = { high: 0, medium: 1, low: 2 }
        return [...paths].sort((a, b) => {
            // Block B: use priority_rank when present, fall back to importance
            if (a.priority_rank != null && b.priority_rank != null) {
                return a.priority_rank - b.priority_rank
            }
            return (rank[a.importance ?? 'medium'] ?? 1) - (rank[b.importance ?? 'medium'] ?? 1)
        })
    }, [paths])

    const activePath = orderedPaths.find(p => p.id === activeId) ?? orderedPaths[0] ?? null

    /* ─── MOBILE LAYOUT ─────────────────────────────────────────────────────── */
    if (isMobile) {
        const RTYPE_COLOR: Record<string, string> = { youtube: '#DC2626', article: '#0891B2', course: '#7C3AED', lab: '#059669' }
        const RTYPE_BG: Record<string, string>    = { youtube: '#FEF2F2', article: '#ECFEFF', course: '#F5F3FF', lab: '#ECFDF5' }
        const RTYPE_LABEL: Record<string, string> = { youtube: 'VIDEO',   article: 'ARTICLE', course: 'COURSE', lab: 'LAB' }
        const RTYPE_CTA: Record<string, string>   = { youtube: 'Watch',   article: 'Read',    course: 'Start',  lab: 'Open' }

        // ── Spinner ──
        if (phase === 'loading') {
            return (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 64px)', background: T.bgAlt }}>
                    <div style={{ width: 28, height: 28, border: `2px solid ${T.line2}`, borderTopColor: T.blue, borderRadius: '50%', animation: 'lp-spin 0.8s linear infinite' }} />
                </div>
            )
        }

        // ── Empty ──
        const isEmptyState = (phase === 'history' && summaries.length === 0) || phase === 'idle'
        if (isEmptyState) {
            return (
                <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: T.bgAlt, minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                        <div style={{ width: 64, height: 64, borderRadius: 18, background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', border: '2px dashed rgba(37,99,235,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={T.blue} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v4c3 3 9 3 12 0v-4"/></svg>
                        </div>
                        <div style={{ fontSize: 17, fontWeight: 700, color: T.ink, marginBottom: 7, letterSpacing: '-0.02em' }}>No Learning Paths Yet</div>
                        <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.65, maxWidth: 260, marginBottom: 22 }}>
                            Go to AI Matches, pick a job you like, and tap <strong style={{ color: T.ink }}>Generate Learning Path</strong>. AI finds your skill gaps and builds a step-by-step roadmap.
                        </div>
                        <button onClick={() => router.push('/dashboard/matches')} style={{ padding: '11px 22px', background: T.blue, color: '#fff', border: 'none', borderRadius: 9, fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 14px -4px rgba(37,99,235,0.4)', display: 'flex', alignItems: 'center', gap: 7 }}>
                            <Icon.Sparkles width={13} height={13} />
                            Go to AI Matches
                        </button>
                    </div>
                </div>
            )
        }

        // ── Generating ──
        if (phase === 'generating') {
            return (
                <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: T.bgAlt, minHeight: 'calc(100vh - 64px)' }}>
                    <div style={{ padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                        <div style={{ width: 72, height: 72, borderRadius: '50%', background: T.blue50, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={T.blue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v4c3 3 9 3 12 0v-4"/></svg>
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: T.ink, marginBottom: 4 }}>Generating Learning Path…</div>
                        {job && <div style={{ fontSize: '12.5px', color: T.muted, marginBottom: 16 }}>{job.title} · {job.company}</div>}
                        <div style={{ width: '100%', maxWidth: 280, height: 5, background: T.sand, borderRadius: 99, overflow: 'hidden', marginBottom: 8 }}>
                            <div style={{ height: '100%', borderRadius: 99, background: `linear-gradient(90deg,${T.blue},#60a5fa)`, animation: 'lp-bar 3s ease-in-out infinite' }} />
                        </div>
                        <div style={{ fontSize: 11, color: T.muted2, marginBottom: 20 }}>Mapping learning resources…</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, width: '100%', textAlign: 'left' }}>
                            {LOADING_STEPS.map((step, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                                    <div style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, background: i < 2 ? T.greenBg : i === 2 ? T.blue50 : T.sand, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {i < 2 && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>}
                                        {i === 2 && <Icon.Refresh width={10} height={10} style={{ color: T.blue, animation: 'lp-spin 0.8s linear infinite' }} />}
                                    </div>
                                    <span style={{ fontSize: 12, color: i < 3 ? '#374151' : T.muted2, fontWeight: i === 2 ? 600 : 400 }}>{step}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )
        }

        // ── Error ──
        if (phase === 'error') {
            return (
                <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: T.bgAlt, minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px' }}>
                    <div style={{ width: '100%', maxWidth: 360, padding: '16px 20px', borderRadius: 12, background: T.redBg, border: '1px solid #FCA5A5' }}>
                        <div style={{ fontSize: '0.875rem', color: T.redText, fontWeight: 600, marginBottom: 10 }}>{error}</div>
                        <button onClick={handleGenerate} style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${T.redText}`, background: '#fff', color: T.redText, cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600, fontFamily: 'inherit' }}>Retry</button>
                    </div>
                </div>
            )
        }

        // ── History (library list) ──
        if (phase === 'history') {
            return (
                <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: T.bgAlt, minHeight: 'calc(100vh - 64px)', paddingBottom: 80 }}>
                    <div style={{ background: '#fff', borderBottom: `1px solid ${T.line}`, padding: '12px 14px' }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: T.ink, letterSpacing: '-0.025em' }}>Learning Paths</div>
                        <div style={{ fontSize: 12, color: T.muted }}>{summaries.length} path{summaries.length !== 1 ? 's' : ''}</div>
                    </div>
                    <div style={{ padding: '12px 13px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {summaries.map(s => (
                            <div key={s.job_id} onClick={() => router.push(`/dashboard/learning?jobId=${s.job_id}`)} style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 11, padding: '12px 13px', cursor: 'pointer' }}>
                                <div style={{ fontSize: '12.5px', color: T.muted, marginBottom: 2 }}>{s.job?.company ?? 'Unknown company'}</div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, marginBottom: 6 }}>{s.job?.title ?? 'Untitled role'}</div>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                                    <span style={{ padding: '2px 8px', borderRadius: 99, background: T.blue50, color: T.blue, fontFamily: 'var(--font-mono,monospace)', fontSize: 10, fontWeight: 700 }}>{s.skill_count} skill{s.skill_count !== 1 ? 's' : ''}</span>
                                    {s.critical_count > 0 && <span style={{ padding: '2px 8px', borderRadius: 99, background: T.redBg, color: T.redText, fontSize: 10, fontWeight: 700 }}>{s.critical_count} critical</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )
        }

        // ── Active / Done ──
        if (phase !== 'done' || !activePath) return null

        const mPri = (activePath.importance ?? 'medium') as keyof typeof PRIORITY
        const mP  = PRIORITY[mPri]
        const mResources = (Array.isArray(activePath.resources) ? activePath.resources : []) as LearningResource[]
        const mTotal = mResources.length
        const mDone  = progress.get(activePath.skill_name)?.size ?? 0
        const mPct   = mTotal > 0 ? Math.round((mDone / mTotal) * 100) : 0
        const mCirc  = 87.96
        const mOffset = mCirc * (1 - mPct / 100)
        const mHours  = parseHours(activePath.time_estimate)
        const mAllFree = mResources.length > 0 && mResources.every(r => r.free)
        const mSevLabel = activePath.severity === 'hard_blocker' ? 'HARD BLOCKER' : activePath.severity === 'nice_to_have' ? 'NICE TO HAVE' : null
        const mLibCount = summaries.length > 0 ? summaries.length : orderedPaths.length

        return (
            <>
            <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', background: T.bgAlt, fontFamily: "'Inter', system-ui, sans-serif", overflow: 'hidden' }}>

                {/* ── Gaps bar ── */}
                <div style={{ background: '#fff', borderBottom: `1px solid ${T.line}`, padding: '9px 13px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <button onClick={() => router.back()} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: T.muted, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, flexShrink: 0 }}>
                        <Icon.ArrowLeft />Back
                    </button>
                    <div style={{ width: 1, height: 16, background: T.line, flexShrink: 0 }} />
                    <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                        Your skill gaps{job?.company ? <> · <span style={{ color: T.blue }}>{job.company}</span></> : ''}
                    </div>
                    {mLibCount > 0 && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 99, background: T.blue50, border: `1px solid rgba(37,99,235,0.2)`, fontFamily: 'var(--font-mono,monospace)', fontSize: 9, fontWeight: 700, color: T.blue, whiteSpace: 'nowrap' as const, flexShrink: 0 }}>
                            LIBRARY · {mLibCount}
                        </span>
                    )}
                    <button onClick={handleGenerate} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, border: `1px solid ${T.line}`, background: '#fff', fontSize: 11, fontWeight: 600, color: T.muted, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                        <Icon.Refresh width={11} height={11} />Regen
                    </button>
                </div>

                {/* ── Skill strip ── */}
                <div style={{ background: '#fff', borderBottom: `1px solid ${T.line}`, display: 'flex', alignItems: 'stretch', flexShrink: 0 }}>
                    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '8px 13px', flex: 1, minWidth: 0, scrollbarWidth: 'none' as const }}>
                        {orderedPaths.map((p, idx) => {
                            const isSel = p.id === activePath.id
                            const dotColor = PRIORITY[(p.importance ?? 'medium') as keyof typeof PRIORITY].dot
                            const pRes = Array.isArray(p.resources) ? p.resources.length : 0
                            const pDone = progress.get(p.skill_name)?.size ?? 0
                            return (
                                <div key={p.id} onClick={() => setActiveId(p.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: 9, border: `1.5px solid ${isSel ? T.blue : T.line}`, background: isSel ? T.blue50 : '#fff', cursor: 'pointer', flexShrink: 0, transition: 'border-color .13s,background .13s' }}>
                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                                    <span style={{ fontFamily: 'var(--font-mono,monospace)', fontSize: 9, fontWeight: 700, color: T.muted2, flexShrink: 0 }}>{String(idx + 1).padStart(2, '0')}</span>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: '11.5px', fontWeight: 700, color: isSel ? T.blue : T.ink, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>{p.skill_name}</div>
                                        <div style={{ fontSize: 10, color: T.muted, fontFamily: 'var(--font-mono,monospace)' }}>{pDone}/{pRes}</div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                    <div onClick={() => setShowAllSkillsSheet(true)} style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, padding: '8px 10px', borderLeft: `1px solid ${T.line}`, background: T.blue50, cursor: 'pointer', minWidth: 58 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.blue} strokeWidth="2.2" strokeLinecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
                        <span style={{ fontSize: '9.5px', fontWeight: 700, color: T.blue, textAlign: 'center', lineHeight: 1.3 }}>All {orderedPaths.length}</span>
                    </div>
                </div>

                {/* ── Scrollable detail ── */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    <div style={{ padding: '14px 13px 100px' }}>

                        {/* Priority badge */}
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 99, background: mP.bg, border: `1px solid ${mP.dot}66`, fontFamily: 'var(--font-mono,monospace)', fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: mP.color, marginBottom: 9 }}>
                            <svg width="8" height="8" viewBox="0 0 24 24" fill={mP.dot}><circle cx="12" cy="12" r="10"/></svg>
                            {mP.label} SKILL{activePath.time_estimate ? ` · ${activePath.time_estimate}` : ''}
                        </div>

                        {/* Title */}
                        <div style={{ fontSize: 21, fontWeight: 800, color: T.ink, letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: 6 }}>{activePath.skill_name}</div>

                        {/* Meta */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.muted, marginBottom: 13, flexWrap: 'wrap' as const }}>
                            <Icon.Briefcase />
                            {job?.title && <span>{job.title}</span>}
                            {job?.company && <>
                                <span>·</span>
                                <Icon.Building />
                                <span style={{ color: T.blue, fontWeight: 600 }}>{job.company}</span>
                            </>}
                        </div>

                        {/* Progress block */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', background: '#fff', border: `1px solid ${T.line}`, borderRadius: 10, marginBottom: 13, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                            <div style={{ position: 'relative', width: 38, height: 38, flexShrink: 0 }}>
                                <svg width="38" height="38" viewBox="0 0 38 38">
                                    <circle cx="19" cy="19" r="14" fill="none" stroke="#e2e8f0" strokeWidth="3.5"/>
                                    <circle cx="19" cy="19" r="14" fill="none" stroke={T.blue} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={String(mCirc)} strokeDashoffset={String(mOffset)} transform="rotate(-90 19 19)"/>
                                </svg>
                                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono,monospace)', fontSize: 11, fontWeight: 800, color: T.blue }}>{mPct}</div>
                            </div>
                            <div>
                                <div style={{ fontFamily: 'var(--font-mono,monospace)', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: T.muted2, marginBottom: 2 }}>Progress</div>
                                <div style={{ fontSize: 16, fontWeight: 800, color: T.ink, letterSpacing: '-0.02em' }}>{mDone} <span style={{ fontSize: 12, color: T.muted, fontWeight: 500 }}>/ {mTotal} resources</span></div>
                            </div>
                            <div style={{ marginLeft: 'auto', textAlign: 'right' as const }}>
                                <div style={{ fontFamily: 'var(--font-mono,monospace)', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: T.muted2, marginBottom: 2 }}>Est. Time</div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{mHours > 0 ? `~${mHours}h` : (activePath.time_estimate ?? 'TBD')}</div>
                                <div style={{ fontSize: '10.5px', color: T.muted }}>{mAllFree ? 'all free' : 'mixed cost'}</div>
                            </div>
                        </div>

                        {/* Why This Skill Matters Now */}
                        {(activePath.why_it_matters || activePath.prerequisites) && (
                            <div style={{ marginBottom: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <Icon.Lightbulb width={13} height={13} style={{ color: T.blue }} />
                                    </div>
                                    <span style={{ fontSize: '13.5px', fontWeight: 800, color: T.ink, letterSpacing: '-0.01em' }}>Why This Skill Matters Now</span>
                                </div>
                                {(job || activePath.prerequisites) && (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 10 }}>
                                        {job && (
                                            <div style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 9, padding: '9px 11px' }}>
                                                <div style={{ fontFamily: 'var(--font-mono,monospace)', fontSize: '8.5px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: T.muted2, marginBottom: 4 }}>For This Role</div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '11.5px', fontWeight: 600, color: T.ink }}>
                                                    <Icon.Briefcase style={{ color: T.blue }} />{job.title}
                                                </div>
                                                {job.company && <div style={{ fontSize: '10.5px', color: T.blue, fontWeight: 600, marginTop: 1 }}>{job.company}</div>}
                                            </div>
                                        )}
                                        {activePath.prerequisites && (
                                            <div style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 9, padding: '9px 11px' }}>
                                                <div style={{ fontFamily: 'var(--font-mono,monospace)', fontSize: '8.5px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: T.muted2, marginBottom: 4 }}>Pre-Req</div>
                                                <div style={{ fontSize: '11.5px', color: '#374151', lineHeight: 1.5 }}>{activePath.prerequisites}</div>
                                            </div>
                                        )}
                                    </div>
                                )}
                                {activePath.why_it_matters && (
                                    <div style={{ background: '#fff', border: `1px solid ${T.line}`, borderLeft: `3px solid ${T.blue}`, borderRadius: '0 10px 10px 0', padding: '12px 13px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                                        <div style={{ fontFamily: 'var(--font-mono,monospace)', fontSize: '8.5px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: T.blue, marginBottom: 6 }}>AI Analysis</div>
                                        <p style={{ fontSize: '12.5px', color: '#334155', lineHeight: 1.7, margin: 0 }}>{activePath.why_it_matters}</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Info card */}
                        {(mSevLabel || activePath.next_step_action || activePath.milestone_check) && (
                            <div style={{ border: '1px solid #fecaca', borderLeft: '3px solid #dc2626', borderRadius: '0 10px 10px 0', background: '#fff8f8', padding: '12px 13px', marginBottom: 14 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <div>
                                        <div style={{ fontFamily: 'var(--font-mono,monospace)', fontSize: '8.5px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: T.muted2, marginBottom: 5 }}>Severity</div>
                                        {mSevLabel && <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: 99, background: T.redBg, border: '1px solid #fca5a5', fontFamily: 'var(--font-mono,monospace)', fontSize: '9.5px', fontWeight: 800, color: T.redText, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>{mSevLabel}</span>}
                                        {activePath.rationale && <div style={{ fontSize: '11.5px', color: '#374151', lineHeight: 1.55, marginTop: 6 }}>{activePath.rationale}</div>}
                                    </div>
                                    <div>
                                        <div style={{ fontFamily: 'var(--font-mono,monospace)', fontSize: '8.5px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: T.muted2, marginBottom: 5 }}>Today&apos;s Next Step</div>
                                        <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.55 }}>{activePath.next_step_action ?? 'Complete the first resource below.'}</div>
                                    </div>
                                </div>
                                {activePath.milestone_check && (
                                    <>
                                        <div style={{ height: 1, background: '#fecaca', margin: '10px 0' }} />
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                            <div>
                                                <div style={{ fontFamily: 'var(--font-mono,monospace)', fontSize: '8.5px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: T.muted2, marginBottom: 5 }}>Done When</div>
                                                <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.55 }}>{activePath.milestone_check}</div>
                                            </div>
                                            {mResources[0] && (
                                                <div>
                                                    <div style={{ fontFamily: 'var(--font-mono,monospace)', fontSize: '8.5px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: T.muted2, marginBottom: 5 }}>Top Resource</div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 5, marginTop: 5 }}>
                                                        <span style={{ padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600, background: RTYPE_BG[mResources[0].type] ?? T.sand, color: RTYPE_COLOR[mResources[0].type] ?? T.muted }}>{RTYPE_LABEL[mResources[0].type] ?? mResources[0].type.toUpperCase()}</span>
                                                        {mResources[0].free && <span style={{ padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600, background: T.greenBg, color: T.greenText }}>FREE</span>}
                                                        {activePath.time_estimate && <span style={{ padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600, background: T.sand, color: T.muted, fontFamily: 'var(--font-mono,monospace)' }}>{activePath.time_estimate.replace(' weeks', 'w').replace(' week', 'w')}</span>}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Curated resources */}
                        {mResources.length > 0 && (
                            <>
                                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <span style={{ fontSize: 15, fontWeight: 700, color: T.ink, letterSpacing: '-0.015em' }}>Curated resources · {mTotal}</span>
                                    <span style={{ fontSize: 11, color: T.muted }}>{mHours > 0 ? `~${mHours}h` : ''}{mAllFree ? ' · all free' : ''}</span>
                                </div>
                                <div style={{ fontSize: 12, color: T.muted, marginBottom: 12, fontStyle: 'italic' }}>Sequence them in order for best results</div>
                                {mResources.map((r, idx) => {
                                    const isDone = progress.get(activePath.skill_name)?.has(idx) ?? false
                                    const rColor = RTYPE_COLOR[r.type] ?? '#64748b'
                                    const rBg    = RTYPE_BG[r.type]    ?? T.sand
                                    const rLabel = RTYPE_LABEL[r.type] ?? r.type.toUpperCase()
                                    const rCta   = RTYPE_CTA[r.type]   ?? 'Open'
                                    return (
                                        <div key={idx} style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 11, overflow: 'hidden', marginBottom: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', opacity: isDone ? 0.75 : 1 }}>
                                            {/* Thumbnail */}
                                            <div style={{ height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', background: rBg, position: 'relative', cursor: 'pointer' }} onClick={() => window.open(r.url, '_blank', 'noopener')}>
                                                <div style={{ position: 'absolute', top: 8, left: 10, fontFamily: 'var(--font-mono,monospace)', fontSize: '8.5px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.85)', background: 'rgba(0,0,0,0.28)', padding: '3px 8px', borderRadius: 4 }}>STEP {String(idx + 1).padStart(2, '0')}</div>
                                                <div style={{ position: 'absolute', top: 8, right: 10, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 99, background: 'rgba(255,255,255,0.92)', fontSize: '10.5px', fontWeight: 700, color: rColor }}>
                                                    {r.type === 'youtube' && <svg width="10" height="10" viewBox="0 0 24 24" fill={rColor}><polygon points="5 3 19 12 5 21 5 3"/></svg>}
                                                    {rLabel}
                                                </div>
                                                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.2)' }}>
                                                    {r.type === 'youtube'
                                                        ? <svg width="18" height="18" viewBox="0 0 24 24" fill={rColor}><polygon points="5 3 19 12 5 21 5 3"/></svg>
                                                        : <Icon.FileText width={18} height={18} style={{ color: rColor }} />
                                                    }
                                                </div>
                                            </div>
                                            {/* Body */}
                                            <div style={{ padding: '11px 13px 12px' }}>
                                                <div style={{ fontSize: 11, color: T.muted, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
                                                    <span style={{ fontWeight: 700, color: T.ink2 }}>{r.platform}</span>
                                                    {r.channel && <><span>·</span><span>{r.channel}</span></>}
                                                </div>
                                                <div style={{ fontSize: '13.5px', fontWeight: 700, color: T.ink, lineHeight: 1.4, marginBottom: 5, letterSpacing: '-0.01em', textDecoration: isDone ? 'line-through' : 'none' }}>{r.title}</div>
                                                {r.summary && <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.6, marginBottom: 9 }}>{r.summary}</div>}
                                                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 5, marginBottom: 10 }}>
                                                    <span style={{ fontSize: '0.6875rem', color: '#334155', background: T.sand, padding: '3px 8px', borderRadius: 6, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                        <Icon.Clock width={10} height={10} />{r.duration}
                                                    </span>
                                                    {r.difficulty && <span style={{ fontSize: '0.6875rem', color: '#334155', background: T.sand, padding: '3px 8px', borderRadius: 6, fontWeight: 600 }}>{DIFF[r.difficulty] ?? r.difficulty}</span>}
                                                    {r.free && <span style={{ fontSize: '0.6875rem', color: T.greenText, background: T.greenBg, padding: '3px 8px', borderRadius: 6, fontWeight: 700 }}>Free</span>}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 10, borderTop: `1px solid ${T.line2}` }}>
                                                    <button onClick={() => toggle(activePath.skill_name, idx)} style={{ width: 22, height: 22, borderRadius: 6, background: isDone ? T.green : '#fff', border: `1.5px solid ${isDone ? T.green : T.line}`, display: 'grid', placeItems: 'center', color: '#fff', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
                                                        {isDone && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                                                    </button>
                                                    <span style={{ fontSize: '0.75rem', color: T.muted, fontWeight: 500 }}>{isDone ? 'Completed ✓' : 'Mark complete'}</span>
                                                    <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 'auto', fontSize: '0.8125rem', fontWeight: 700, color: '#fff', background: T.blue, padding: '7px 13px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 5, textDecoration: 'none', boxShadow: '0 3px 8px -3px rgba(37,99,235,0.4)' }}>
                                                        {rCta}<Icon.External width={10} height={10} />
                                                    </a>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </>
                        )}

                        {/* What You'll Be Able To Do */}
                        {activePath.key_takeaways && activePath.key_takeaways.length > 0 && (
                            <div style={{ marginTop: 6, background: '#fff', border: `1px solid ${T.line}`, borderRadius: 11, padding: 13, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 11 }}>
                                    <Icon.Lightbulb width={12} height={12} style={{ color: T.blue }} />
                                    <span style={{ fontFamily: 'var(--font-mono,monospace)', fontSize: 9, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase' as const, color: T.blue }}>What You&apos;ll Be Able To Do</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                                    {activePath.key_takeaways.map((kw, i) => (
                                        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                            <span style={{ fontFamily: 'var(--font-mono,monospace)', fontSize: 15, fontWeight: 800, color: T.blue, flexShrink: 0, lineHeight: 1 }}>{String(i + 1).padStart(2, '0')}</span>
                                            <span style={{ fontSize: '12.5px', color: '#334155', lineHeight: 1.6 }}>{kw}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                    </div>
                </div>
            </div>

            {/* ── All Skills sheet ── */}
            {showAllSkillsSheet && (
                <>
                    <div onClick={() => setShowAllSkillsSheet(false)} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(3px)' }} />
                    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderRadius: '22px 22px 0 0', boxShadow: '0 -20px 60px rgba(0,0,0,0.25)', zIndex: 55, display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}>
                        <div style={{ width: 36, height: 4, borderRadius: 99, background: T.line, margin: '12px auto 0', flexShrink: 0 }} />
                        <div style={{ padding: '12px 16px 10px', borderBottom: `1px solid ${T.line}`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                            <span style={{ fontSize: 15, fontWeight: 700, color: T.ink, flex: 1 }}>All Skill Gaps</span>
                            <span style={{ fontFamily: 'var(--font-mono,monospace)', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: T.sand, color: T.muted }}>{orderedPaths.length}</span>
                            <button onClick={() => setShowAllSkillsSheet(false)} style={{ width: 27, height: 27, borderRadius: 8, background: T.sand, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                            </button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px 24px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                            {orderedPaths.map((p, idx) => {
                                const isOn = p.id === activePath.id
                                const sp = PRIORITY[(p.importance ?? 'medium') as keyof typeof PRIORITY]
                                const pRes = Array.isArray(p.resources) ? p.resources.length : 0
                                const pDone = progress.get(p.skill_name)?.size ?? 0
                                return (
                                    <div key={p.id} onClick={() => { setActiveId(p.id); setShowAllSkillsSheet(false) }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 10, border: `1.5px solid ${isOn ? T.blue : T.line}`, background: isOn ? T.blue50 : '#fff', cursor: 'pointer' }}>
                                        <span style={{ fontFamily: 'var(--font-mono,monospace)', fontSize: '9.5px', fontWeight: 700, color: T.muted2, flexShrink: 0, minWidth: 18 }}>{String(idx + 1).padStart(2, '0')}</span>
                                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: sp.dot, flexShrink: 0 }} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: isOn ? T.blue : T.ink }}>{p.skill_name}</div>
                                            <div style={{ fontSize: 11, color: T.muted }}>{sp.label} · {p.time_estimate ?? ''}</div>
                                        </div>
                                        <span style={{ fontFamily: 'var(--font-mono,monospace)', fontSize: '10.5px', fontWeight: 700, color: T.muted, flexShrink: 0 }}>{pDone}/{pRes}</span>
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

    /* ─── Non-split (centered) view for loading / empty / generating / error ─── */
    const renderCenteredState = (content: ReactElement) => (
        <div style={{
            background: T.bgAlt,
            minHeight: 'calc(100vh - 64px)',
            padding: '40px 32px 56px',
            color: T.ink,
            fontFamily: "'Inter', system-ui, sans-serif",
            WebkitFontSmoothing: 'antialiased',
            lineHeight: 1.55,
        }}>
            <div style={{ maxWidth: 1040, margin: '0 auto' }}>
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 8, marginBottom: 14,
                }}>
                    <button
                        onClick={() => router.back()}
                        className="lp-back"
                        style={{
                            fontSize: '0.75rem', color: T.muted, fontWeight: 600,
                            letterSpacing: '0.02em',
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            background: 'none', border: 'none', padding: 0,
                            cursor: 'pointer', transition: 'color .15s',
                        }}
                    >
                        <Icon.ArrowLeft /> Back to matches
                    </button>
                    {summaries.length > 0 && (
                        <Link
                            href="/dashboard/learning"
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '5px 10px', borderRadius: 9999,
                                background: T.blue50, color: T.blue700,
                                border: `1px solid ${T.blueLight}`,
                                fontSize: '0.6875rem', fontWeight: 700,
                                letterSpacing: '0.04em', textTransform: 'uppercase',
                                textDecoration: 'none',
                            }}
                        >
                            Library · {summaries.length}
                        </Link>
                    )}
                </div>
                <header style={{
                    background: '#fff',
                    border: `1px solid ${T.line}`,
                    borderRadius: 14,
                    padding: '22px 24px 20px',
                    marginBottom: 18,
                    boxShadow: '0 1px 2px rgba(15,23,42,.04)',
                }}>
                    <div style={{
                        fontSize: '0.625rem', fontWeight: 700,
                        color: T.blue, letterSpacing: '0.16em',
                        textTransform: 'uppercase', marginBottom: 8,
                    }}>
                        Personalized Roadmap{job?.company ? ` · ${job.company}` : ''}
                    </div>
                    <h1 style={{
                        fontSize: '1.625rem', fontWeight: 800,
                        letterSpacing: '-0.025em', lineHeight: 1.15,
                        marginBottom: 8, color: T.ink,
                    }}>
                        {job?.title
                            ? <>From your resume to <span style={{ color: T.blue }}>{job.title}</span></>
                            : 'Your personalized learning path'}
                    </h1>
                    {job && (
                        <p style={{
                            fontSize: '0.8125rem', color: T.muted,
                            lineHeight: 1.5, margin: 0,
                            display: 'inline-flex', alignItems: 'center',
                            gap: 8, flexWrap: 'wrap',
                        }}>
                            {job.title && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                    <Icon.Briefcase />{job.title}
                                </span>
                            )}
                            {job.company && <>
                                <span>·</span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                    <Icon.Building />{job.company}
                                </span>
                            </>}
                        </p>
                    )}
                </header>
                {content}
            </div>
        </div>
    )

    if (phase === 'loading') {
        return renderCenteredState(
            <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
                <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    border: `2px solid ${T.line2}`, borderTopColor: T.blue,
                    animation: 'lp-spin 0.8s linear infinite',
                }} />
            </div>
        )
    }
    if (phase === 'history') return <LearningHistoryIndex summaries={summaries} />
    if (phase === 'generating') return renderCenteredState(<GeneratingState />)
    if (phase === 'idle') return renderCenteredState(<EmptyState onGenerate={handleGenerate} count={missingSkills.length} />)
    if (phase === 'error') return renderCenteredState(
        <div style={{
            padding: '16px 20px', borderRadius: 12,
            background: T.redBg, border: `1px solid #FCA5A5`,
            display: 'flex', alignItems: 'center', gap: 12,
        }}>
            <span style={{ fontSize: '0.875rem', color: T.redText, fontWeight: 600 }}>
                {error}
            </span>
            <button
                onClick={handleGenerate}
                style={{
                    marginLeft: 'auto', padding: '7px 14px', borderRadius: 8,
                    border: `1px solid ${T.redText}`, background: '#fff',
                    color: T.redText, cursor: 'pointer',
                    fontSize: '0.8125rem', fontWeight: 600,
                    letterSpacing: '-0.005em',
                }}
            >Retry</button>
        </div>
    )

    /* ─── Split layout: phase === 'done' ─── */
    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 340px) minmax(0, 1fr)',
            minHeight: 'calc(100vh - 64px)',
            background: T.bgAlt,
            color: T.ink,
            fontFamily: "'Inter', system-ui, sans-serif",
            WebkitFontSmoothing: 'antialiased',
            lineHeight: 1.55,
        }}>
            {/* ── LEFT RAIL ── */}
            <aside style={{
                background: '#fff',
                borderRight: `1px solid ${T.line2}`,
                position: 'sticky',
                top: 64,
                height: 'calc(100vh - 64px)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            }}>
                <div style={{
                    padding: '24px 22px 18px',
                    borderBottom: `1px solid ${T.line2}`,
                    flexShrink: 0,
                }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        gap: 8, marginBottom: 14,
                    }}>
                        <button
                            onClick={() => router.back()}
                            className="lp-back"
                            style={{
                                fontSize: '0.75rem', color: T.muted, fontWeight: 600,
                                letterSpacing: '0.02em',
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                background: 'none', border: 'none', padding: 0,
                                cursor: 'pointer', transition: 'color .15s',
                            }}
                        >
                            <Icon.ArrowLeft /> Back to matches
                        </button>
                        <Link
                            href="/dashboard/learning"
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '5px 10px', borderRadius: 9999,
                                background: T.blue50, color: T.blue700,
                                border: `1px solid ${T.blueLight}`,
                                fontSize: '0.6875rem', fontWeight: 700,
                                letterSpacing: '0.04em', textTransform: 'uppercase',
                                textDecoration: 'none',
                                transition: 'background .15s, border-color .15s',
                            }}
                        >
                            Library · {summaries.length}
                        </Link>
                    </div>
                    <h2 style={{
                        fontSize: '1.125rem', fontWeight: 800,
                        letterSpacing: '-0.02em', color: T.ink,
                        marginBottom: 6,
                    }}>Your skill gaps</h2>
                    <div style={{ fontSize: '0.75rem', color: T.muted, lineHeight: 1.5 }}>
                        {orderedPaths.length} skill{orderedPaths.length !== 1 ? 's' : ''} detected
                        {job?.title && <> for <b style={{ color: T.ink2, fontWeight: 700 }}>{job.title}</b></>}
                        {job?.company && <> at <b style={{ color: T.ink2, fontWeight: 700 }}>{job.company}</b></>}
                    </div>

                    <button
                        onClick={handleGenerate}
                        className="lp-out"
                        style={{
                            marginTop: 14,
                            width: '100%',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            padding: '8px 12px', borderRadius: 8,
                            fontSize: '0.75rem', fontWeight: 600,
                            background: '#fff', color: T.ink,
                            border: `1px solid ${T.line}`, cursor: 'pointer',
                            letterSpacing: '-0.005em',
                            transition: 'background .18s, border-color .18s',
                        }}
                    >
                        <Icon.Refresh /> Regenerate roadmap
                    </button>
                </div>

                <ul className="lp-rail-list" style={{
                    listStyle: 'none',
                    overflowY: 'auto',
                    flex: 1,
                    padding: 8,
                    margin: 0,
                }}>
                    {orderedPaths.map((p, idx) => (
                        <SkillRailItem
                            key={p.id}
                            path={p}
                            idx={idx}
                            isActive={p.id === activePath?.id}
                            doneCount={progress.get(p.skill_name)?.size ?? 0}
                            onClick={() => setActiveId(p.id)}
                        />
                    ))}
                </ul>
            </aside>

            {/* ── RIGHT PANEL ── */}
            <div style={{ minWidth: 0, overflowX: 'hidden' }}>
                {activePath ? (
                    <SkillDetail
                        path={activePath}
                        job={job}
                        completedSet={progress.get(activePath.skill_name) ?? new Set<number>()}
                        onToggle={(i) => toggle(activePath.skill_name, i)}
                    />
                ) : (
                    <div style={{ padding: 48, color: T.muted }}>Select a skill from the left to see resources.</div>
                )}
            </div>
        </div>
    )
}
