'use client'

import { Suspense, useEffect, useMemo, useState, useCallback, useRef, type SVGProps, type ReactElement } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
    fetchLearningPaths, triggerLearningPathGeneration, fetchLearningPathSummaries, getPrimaryResumeId, type LearningPathSummary,
    fetchBuildPlanProjectSummaries, fetchProjectRoadmaps, generateProjectRoadmap, fetchProjectRoadmapDetail, startProjectRoadmap, saveMilestoneProgress,
    projectCoachTeachMe, projectCoachStuck, projectCoachReviewWork, completeMilestone, fetchProjectEvidence, fetchUserAchievements,
    type BuildPlanProjectSummary, type ProjectRoadmapSummary, type ProjectMilestoneWithProgress,
} from '@/lib/api'
import type { LearningPath, LearningResource, Job, MilestoneChecklistItem, MilestoneTask, CheckpointResult, ProjectEvidence, UserAchievement } from '@/lib/types'
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

/* ─── Milestone Workspace (ported from milestone-workspace.html) ──── */
const WS_MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"

type WsResIconKey = 'yt' | 'doc' | 'guide' | 'blog' | 'zap'
const WS_RES_ICON: Record<WsResIconKey, { bg: string; fg: string }> = {
    yt: { bg: '#FEE2E2', fg: '#DC2626' },
    doc: { bg: '#DCFCE7', fg: '#15803D' },
    guide: { bg: '#FFF7ED', fg: '#EA580C' },
    blog: { bg: '#F5F3FF', fg: '#6D28D9' },
    zap: { bg: '#FFF7ED', fg: '#EA580C' },
}
function WsResIcon({ k, size = 16 }: { k: WsResIconKey; size?: number }) {
    const { fg } = WS_RES_ICON[k]
    if (k === 'yt') return <svg width={size} height={size} viewBox="0 0 24 24" fill={fg}><path d="M23 12s0-3.85-.5-5.7a3 3 0 00-2.1-2.1C18.55 3.7 12 3.7 12 3.7s-6.55 0-8.4.5A3 3 0 001.5 6.3C1 8.15 1 12 1 12s0 3.85.5 5.7a3 3 0 002.1 2.1c1.85.5 8.4.5 8.4.5s6.55 0 8.4-.5a3 3 0 002.1-2.1c.5-1.85.5-5.7.5-5.7zM9.75 15.5v-7L15.5 12l-5.75 3.5z" /></svg>
    if (k === 'doc') return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={fg} strokeWidth={2} strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
    if (k === 'guide') return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={fg} strokeWidth={2} strokeLinecap="round"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" /><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" /></svg>
    if (k === 'blog') return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={fg} strokeWidth={2} strokeLinecap="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={fg} strokeWidth={2} strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
}
function wsInline(text: string): ReactElement {
    const parts = text.split('`')
    return (
        <>
            {parts.map((part, i) =>
                i % 2 === 1
                    ? <code key={i} style={{ fontFamily: WS_MONO, background: T.sand, padding: '1px 5px', borderRadius: 4, fontSize: '0.85em' }}>{part}</code>
                    : <span key={i}>{part}</span>
            )}
        </>
    )
}

/** Maps the real MilestoneResource.type ('doc'|'repo'|'tool') to a WsResIcon key for display. */
function resIconFor(type: string): WsResIconKey {
    if (type === 'repo') return 'guide'
    if (type === 'tool') return 'zap'
    return 'doc'
}

/** Flattens a milestone's per-task checklist items into one ordered list — this is
 * the layout `milestone_progress.checklist_state` (a flat boolean[]) is indexed against. */
function flattenChecklist(milestone: ProjectMilestoneWithProgress): { taskIdx: number; itemIdx: number; item: MilestoneChecklistItem }[] {
    const out: { taskIdx: number; itemIdx: number; item: MilestoneChecklistItem }[] = []
    milestone.tasks.forEach((task, taskIdx) => {
        (task.checklist || []).forEach((item, itemIdx) => out.push({ taskIdx, itemIdx, item }))
    })
    return out
}

/** Per-task slice offsets into the flat checklist_state array, so each task can read/write its own items. */
function taskChecklistOffsets(milestone: ProjectMilestoneWithProgress): number[] {
    const offsets: number[] = []
    let running = 0
    milestone.tasks.forEach((task) => {
        offsets.push(running)
        running += (task.checklist || []).length
    })
    return offsets
}

/** True once every `required` checklist item across all tasks is checked (the Review My Work gate). */
function allRequiredChecked(milestone: ProjectMilestoneWithProgress, checklistState: boolean[]): boolean {
    const flat = flattenChecklist(milestone)
    const required = flat.filter(f => f.item.required)
    if (required.length === 0) return flat.length > 0 && flat.every((_, i) => checklistState[i])
    return required.every((_, i) => {
        const flatIdx = flat.findIndex(f => f === required[i])
        return checklistState[flatIdx]
    })
}

// ── Lightweight syntax highlighting for coach code blocks ──────────────────
// A hand-rolled tokenizer, not a full grammar engine — these are short instructional
// snippets (commands, configs, small files), not a code editor, so a regex pass over
// comments/strings/numbers/keywords is enough for legibility without a new dependency.
// Colors are drawn from this page's own palette (T.blue / T.green / T.amberText / T.muted2)
// rather than an imported dark theme — code should read as JobScorer's, not a bolted-on IDE skin.

const WS_LANG_KEYWORDS: Record<string, string[]> = {
    bash: ['sudo', 'apt', 'apt-get', 'yum', 'dnf', 'brew', 'install', 'update', 'upgrade', 'cd', 'ls', 'mkdir', 'rm', 'cp', 'mv', 'echo', 'export', 'source', 'chmod', 'chown', 'curl', 'wget', 'git', 'docker', 'docker-compose', 'python', 'python3', 'pip', 'pip3', 'npm', 'npx', 'node', 'az', 'aws', 'gcloud', 'systemctl', 'service', 'yarn', 'if', 'then', 'else', 'fi', 'for', 'do', 'done', 'while', 'function', 'return', 'exit', 'cat', 'grep', 'find'],
    python: ['def', 'class', 'import', 'from', 'as', 'return', 'if', 'elif', 'else', 'for', 'while', 'in', 'not', 'and', 'or', 'is', 'None', 'True', 'False', 'try', 'except', 'finally', 'with', 'pass', 'break', 'continue', 'lambda', 'yield', 'global', 'nonlocal', 'self', 'async', 'await', 'raise'],
    javascript: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'import', 'export', 'from', 'default', 'class', 'extends', 'new', 'this', 'async', 'await', 'try', 'catch', 'finally', 'typeof', 'instanceof', 'null', 'undefined', 'true', 'false'],
    dockerfile: ['FROM', 'RUN', 'CMD', 'COPY', 'ADD', 'WORKDIR', 'EXPOSE', 'ENV', 'ARG', 'ENTRYPOINT', 'VOLUME', 'USER', 'LABEL', 'ONBUILD', 'STOPSIGNAL', 'HEALTHCHECK', 'SHELL'],
    yaml: ['true', 'false', 'null'],
}
WS_LANG_KEYWORDS.sh = WS_LANG_KEYWORDS.shell = WS_LANG_KEYWORDS.zsh = WS_LANG_KEYWORDS.console = WS_LANG_KEYWORDS.bash
WS_LANG_KEYWORDS.py = WS_LANG_KEYWORDS.python
WS_LANG_KEYWORDS.js = WS_LANG_KEYWORDS.jsx = WS_LANG_KEYWORDS.javascript
WS_LANG_KEYWORDS.ts = WS_LANG_KEYWORDS.tsx = WS_LANG_KEYWORDS.typescript = [...WS_LANG_KEYWORDS.javascript, 'interface', 'type', 'enum', 'implements', 'private', 'public', 'readonly', 'namespace']
WS_LANG_KEYWORDS.docker = WS_LANG_KEYWORDS.dockerfile
WS_LANG_KEYWORDS.yml = WS_LANG_KEYWORDS.yaml

const WS_HASH_COMMENT_LANGS = new Set(['bash', 'sh', 'shell', 'zsh', 'console', 'python', 'py', 'yaml', 'yml', 'dockerfile', 'docker', 'toml'])
const WS_SLASH_COMMENT_LANGS = new Set(['javascript', 'js', 'jsx', 'typescript', 'ts', 'tsx', 'json', 'jsonc', 'java', 'c', 'cpp', 'go', 'rust', 'rs'])

function wsBuildTokenRegex(lang: string): RegExp | null {
    const parts: string[] = []
    if (WS_HASH_COMMENT_LANGS.has(lang)) parts.push('#[^\\n]*')
    if (WS_SLASH_COMMENT_LANGS.has(lang)) parts.push('//[^\\n]*')
    parts.push('"(?:[^"\\\\]|\\\\.)*"', "'(?:[^'\\\\]|\\\\.)*'")
    parts.push('\\b\\d+(?:\\.\\d+)?\\b')
    const kw = WS_LANG_KEYWORDS[lang]
    if (kw && kw.length) parts.push(`\\b(?:${kw.join('|')})\\b`)
    return parts.length ? new RegExp(parts.join('|'), 'g') : null
}

function wsHighlightCode(code: string, lang: string): ReactElement[] | string {
    const regex = wsBuildTokenRegex(lang.toLowerCase())
    if (!regex) return code
    const out: ReactElement[] = []
    let lastIndex = 0
    let match: RegExpExecArray | null
    let key = 0
    while ((match = regex.exec(code))) {
        if (match.index > lastIndex) out.push(<span key={key++}>{code.slice(lastIndex, match.index)}</span>)
        const token = match[0]
        const isComment = token.startsWith('#') || token.startsWith('//')
        const isString = token.startsWith('"') || token.startsWith("'")
        const isNumber = /^\d/.test(token)
        const color = isComment ? T.muted2 : isString ? T.green : isNumber ? T.amberText : T.blue
        out.push(
            <span key={key++} style={{ color, fontWeight: !isComment && !isString && !isNumber ? 600 : 400, fontStyle: isComment ? 'italic' : 'normal' }}>
                {token}
            </span>
        )
        lastIndex = regex.lastIndex
    }
    if (lastIndex < code.length) out.push(<span key={key++}>{code.slice(lastIndex)}</span>)
    return out
}

const WS_CODE_LANG_LABELS: Record<string, string> = {
    bash: 'Terminal', sh: 'Terminal', shell: 'Terminal', zsh: 'Terminal', console: 'Terminal',
    python: 'Python', py: 'Python',
    javascript: 'JavaScript', js: 'JavaScript', jsx: 'JavaScript',
    typescript: 'TypeScript', ts: 'TypeScript', tsx: 'TypeScript',
    json: 'JSON', jsonc: 'JSON',
    yaml: 'YAML', yml: 'YAML',
    dockerfile: 'Dockerfile', docker: 'Dockerfile',
    text: 'Text', plaintext: 'Text', txt: 'Text',
}
function wsCodeLangLabel(lang: string): string {
    const l = lang.toLowerCase()
    if (WS_CODE_LANG_LABELS[l]) return WS_CODE_LANG_LABELS[l]
    return l ? l.charAt(0).toUpperCase() + l.slice(1) : 'Code'
}

/** Light, bordered code card (GitHub-Primer-style) with a language label + real copy-to-clipboard. */
function WsCodeBlock({ code, lang }: { code: string; lang: string }) {
    const [copied, setCopied] = useState(false)
    const copy = () => {
        navigator.clipboard.writeText(code).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        })
    }
    return (
        <div style={{ background: '#F8FAFC', border: `1px solid ${T.line}`, borderRadius: 10, overflow: 'hidden', margin: '4px 0 20px' }}>
            <div style={{ padding: '7px 14px', borderBottom: `1px solid ${T.line}`, background: T.sand, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: WS_MONO, fontSize: 11, fontWeight: 700, color: T.muted2, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{wsCodeLangLabel(lang)}</span>
                <button onClick={copy} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', background: copied ? '#DCFCE7' : '#fff', border: `1px solid ${copied ? '#BBF7D0' : T.line}`, borderRadius: 6, fontSize: 11, fontWeight: 700, color: copied ? T.greenText : T.muted, cursor: 'pointer' }}>
                    {copied ? '✓ Copied' : 'Copy'}
                </button>
            </div>
            <pre style={{ margin: 0, padding: '14px 16px', overflowX: 'auto' }}>
                <code style={{ fontFamily: WS_MONO, fontSize: '12.5px', color: T.ink2, lineHeight: 1.8, whiteSpace: 'pre' }}>{wsHighlightCode(code, lang)}</code>
            </pre>
        </div>
    )
}

/** Renders AI coach output as styled markdown, matching this page's light, blue-accented design language. */
const WS_DISPLAY_FONT = "'Outfit', sans-serif"

function WsMarkdown({ content }: { content: string }) {
    return (
        <div style={{ fontSize: '13.5px', color: T.ink2, lineHeight: 1.75 }}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    h1: (p) => <h3 style={{ fontFamily: WS_DISPLAY_FONT, fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', color: T.ink, margin: '0 0 14px' }}>{p.children}</h3>,
                    h2: (p) => <h3 style={{ fontFamily: WS_DISPLAY_FONT, fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', color: T.ink, margin: '32px 0 14px', paddingBottom: 10, borderBottom: `1px solid ${T.line2}` }}>{p.children}</h3>,
                    h3: (p) => <h4 style={{ fontFamily: WS_DISPLAY_FONT, fontSize: 15, fontWeight: 700, color: T.ink, margin: '26px 0 10px' }}>{p.children}</h4>,
                    h4: (p) => <h5 style={{ fontFamily: WS_DISPLAY_FONT, fontSize: 13.5, fontWeight: 700, color: T.ink, margin: '20px 0 8px' }}>{p.children}</h5>,
                    p: (p) => <p style={{ margin: '0 0 16px' }}>{p.children}</p>,
                    ul: (p) => <ul style={{ margin: '0 0 16px', paddingLeft: 20 }}>{p.children}</ul>,
                    ol: (p) => <ol style={{ margin: '0 0 16px', paddingLeft: 20 }}>{p.children}</ol>,
                    li: (p) => <li style={{ marginBottom: 9 }}>{p.children}</li>,
                    strong: (p) => <strong style={{ color: T.ink, fontWeight: 700 }}>{p.children}</strong>,
                    a: (p) => <a href={p.href} target="_blank" rel="noopener noreferrer" style={{ color: T.blue, fontWeight: 600 }}>{p.children}</a>,
                    // `pre` is a passthrough — the `code` override below does all the rendering, so a
                    // fenced block only needs one component deciding "is this a block or inline" (via className).
                    pre: (p) => <>{p.children}</>,
                    code: (p) => {
                        const { className, children } = p as { className?: string; children?: ReactElement | string }
                        const isBlock = /language-/.test(className || '')
                        if (!isBlock) {
                            return <code style={{ fontFamily: WS_MONO, fontSize: '12.5px', background: T.sand, padding: '2px 6px', borderRadius: 4, color: T.ink2 }}>{children}</code>
                        }
                        const text = typeof children === 'string' ? children.replace(/\n$/, '') : String(children ?? '')
                        const langMatch = /language-(\w+)/.exec(className || '')
                        return <WsCodeBlock code={text} lang={langMatch ? langMatch[1] : ''} />
                    },
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    )
}

function WsCoachLoading({ label }: { label: string }) {
    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', border: `3px solid ${T.line}`, borderTopColor: T.blue, animation: 'lp-spin 0.9s linear infinite' }} />
            <div style={{ fontSize: '13.5px', color: T.muted }}>{label}</div>
        </div>
    )
}

function WsCoachError({ message, onRetry }: { message: string; onRetry: () => void }) {
    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: '13.5px', color: T.redText }}>{message}</div>
            <button onClick={onRetry} style={{ padding: '8px 18px', background: T.blue, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Try Again</button>
        </div>
    )
}

type WsCoach = 'teach-me' | 'stuck' | 'review' | null

function WsCoachHeader({ icon, iconBg, iconBorder, title, sub, active, showReview = true, onBack, onSwitch }: {
    icon: ReactElement; iconBg: string; iconBorder: string; title: string; sub: string
    active: WsCoach; showReview?: boolean; onBack: () => void; onSwitch: (c: Exclude<WsCoach, null>) => void
}) {
    const allTabs: { key: Exclude<WsCoach, null>; label: string; color: string; icon: ReactElement }[] = [
        { key: 'teach-me', label: 'Teach Me', color: T.blue, icon: <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" /><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" /></svg> },
        { key: 'stuck', label: "I'm Stuck", color: '#DC2626', icon: <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth={2} strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg> },
        { key: 'review', label: 'Review My Work', color: T.blue, icon: <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg> },
    ]
    const tabs = showReview ? allTabs : allTabs.filter(t => t.key !== 'review')
    return (
        <div style={{ flexShrink: 0, padding: '16px 32px 0', background: '#fff', borderBottom: `1px solid ${T.line2}` }}>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 10 }}>
                <span style={{ color: T.blue, cursor: 'pointer', fontWeight: 600 }} onClick={onBack}>Project Coach</span>
                {' › '}<strong style={{ color: T.ink }}>{title}</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 9, background: iconBg, border: `1px solid ${iconBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
                    <div>
                        <div style={{ fontFamily: WS_DISPLAY_FONT, fontSize: 20, fontWeight: 800, color: T.ink, letterSpacing: '-.02em' }}>{title}</div>
                        <div style={{ fontSize: 13, color: T.muted }}>{sub}</div>
                    </div>
                </div>
                <button onClick={onBack} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${T.line}`, background: '#fff', cursor: 'pointer', fontSize: 16, color: T.muted }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 0 }}>
                {tabs.map(tb => (
                    <button key={tb.key} onClick={() => onSwitch(tb.key)} style={{
                        padding: '10px 18px', border: 'none', background: 'transparent',
                        fontSize: '13.5px', fontWeight: active === tb.key ? 700 : 600,
                        color: active === tb.key ? tb.color : T.muted, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 7,
                        borderBottom: active === tb.key ? `2px solid ${tb.color}` : '2px solid transparent', marginBottom: -1,
                    }}>{tb.icon}{tb.label}</button>
                ))}
            </div>
        </div>
    )
}

function WsTeachMe({ roadmapId, milestoneId, taskIndex, milestoneTitle, task, cache, onCache, showReviewLink, onBack, onSwitch }: {
    roadmapId: string; milestoneId: string; taskIndex: number; milestoneTitle: string; task: MilestoneTask | undefined
    cache: Record<string, string>; onCache: (key: string, content: string) => void
    showReviewLink: boolean
    onBack: () => void; onSwitch: (c: Exclude<WsCoach, null>) => void
}) {
    const cacheKey = `${milestoneId}:${taskIndex}`
    const [content, setContent] = useState<string | null>(cache[cacheKey] ?? null)
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(!cache[cacheKey])

    const load = useCallback(() => {
        if (cache[cacheKey]) { setContent(cache[cacheKey]); setLoading(false); return }
        setLoading(true)
        setError(null)
        projectCoachTeachMe({ roadmap_id: roadmapId, milestone_id: milestoneId, task_index: taskIndex }).then(res => {
            if (res.success && res.content) {
                onCache(cacheKey, res.content)
                setContent(res.content)
            } else {
                setError(res.error || 'Teach Me is temporarily unavailable.')
            }
            setLoading(false)
        }).catch(() => {
            setError('Teach Me is temporarily unavailable.')
            setLoading(false)
        })
        // `cache` is intentionally excluded — it changes identity on every write and would
        // re-trigger this callback; the cache-hit check above already reads the latest value.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cacheKey, roadmapId, milestoneId, taskIndex])

    useEffect(() => { load() }, [load])

    const header = (
        <WsCoachHeader
            icon={<svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={T.blue} strokeWidth={2.2} strokeLinecap="round"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" /><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" /></svg>}
            iconBg={T.blue50} iconBorder={T.blueLight} title="Teach Me" sub={task ? `${milestoneTitle} — ${task.title}` : milestoneTitle}
            active="teach-me" showReview={showReviewLink} onBack={onBack} onSwitch={onSwitch}
        />
    )

    if (loading || error) {
        return (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.bgAlt, minHeight: 0 }}>
                {header}
                <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
                    {loading ? <WsCoachLoading label="Preparing a walkthrough for this task…" /> : <WsCoachError message={error!} onRetry={load} />}
                </div>
            </div>
        )
    }

    // Header scrolls away WITH the content (not pinned) — the whole panel scrolls as one unit.
    return (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: T.bgAlt, minHeight: 0 }}>
            <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflowY: 'auto' }}>
                {header}
                <div style={{ padding: '28px 32px' }}>
                    <WsMarkdown content={content || ''} />
                </div>
            </div>
            {task && (task.resources || []).length > 0 && (
                <div style={{ width: 220, flexShrink: 0, minHeight: 0, borderLeft: `1px solid ${T.line2}`, overflowY: 'auto', background: '#fff', padding: '16px 14px' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.muted2, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>Resources</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {task.resources.map((r, i) => (
                            <a key={i} href={r.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#fff', border: `1px solid ${T.line2}`, borderRadius: 10, textDecoration: 'none' }}>
                                <div style={{ width: 32, height: 32, borderRadius: 8, background: WS_RES_ICON[resIconFor(r.type)].bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><WsResIcon k={resIconFor(r.type)} /></div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '12.5px', fontWeight: 700, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</div>
                                    <div style={{ fontSize: 11, color: T.muted, textTransform: 'capitalize' }}>{r.type}</div>
                                </div>
                            </a>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

type WsStuckTurn = { query: string; content?: string; error?: string }

function WsStuck({ roadmapId, milestoneId, taskIndex, history, onHistoryChange, showReviewLink, onBack, onSwitch }: {
    roadmapId: string; milestoneId: string; taskIndex: number
    history: Record<string, WsStuckTurn[]>; onHistoryChange: (key: string, turns: WsStuckTurn[]) => void
    showReviewLink: boolean
    onBack: () => void; onSwitch: (c: Exclude<WsCoach, null>) => void
}) {
    const cacheKey = `${milestoneId}:${taskIndex}`
    const [turns, setTurns] = useState<WsStuckTurn[]>(history[cacheKey] ?? [])
    const [query, setQuery] = useState('')
    const [pending, setPending] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const el = scrollRef.current
        if (el) el.scrollTop = el.scrollHeight
    }, [turns.length, pending])

    const analyze = (q: string) => {
        if (!q.trim() || pending) return
        setPending(true)
        setQuery('')
        projectCoachStuck({ roadmap_id: roadmapId, milestone_id: milestoneId, task_index: taskIndex, error_text: q }).then(res => {
            const turn: WsStuckTurn = res.success && res.content
                ? { query: q, content: res.content }
                : { query: q, error: res.error || "I'm Stuck is temporarily unavailable." }
            const next = [...turns, turn]
            onHistoryChange(cacheKey, next)
            setTurns(next)
            setPending(false)
        }).catch(() => {
            const next = [...turns, { query: q, error: "I'm Stuck is temporarily unavailable." }]
            onHistoryChange(cacheKey, next)
            setTurns(next)
            setPending(false)
        })
    }

    const header = (
        <WsCoachHeader
            icon={<svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth={2.2} strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>}
            iconBg="#FEF2F2" iconBorder="#FECACA" title="I'm Stuck" sub="Describe your issue or paste an error — I'll diagnose and guide you step-by-step."
            active="stuck" showReview={showReviewLink} onBack={onBack} onSwitch={onSwitch}
        />
    )

    if (turns.length === 0 && !pending) {
        return (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.bgAlt, minHeight: 0 }}>
                {header}
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 60px', overflowY: 'auto' }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: T.ink, marginBottom: 8, letterSpacing: '-0.02em' }}>What&apos;s going wrong?</div>
                    <div style={{ fontSize: 14, color: T.muted, marginBottom: 32 }}>Describe your error or paste a message — I&apos;ll diagnose it instantly.</div>
                    <div style={{ width: '100%', maxWidth: 680, background: '#fff', border: `1.5px solid ${T.line}`, borderRadius: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                        <div style={{ padding: '14px 16px' }}>
                            <textarea
                                value={query} onChange={e => setQuery(e.target.value)} rows={3}
                                placeholder="Ask anything… paste your error, describe what's wrong"
                                style={{ width: '100%', border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 15, color: T.ink, outline: 'none', resize: 'none', lineHeight: 1.6, boxSizing: 'border-box' }}
                            />
                        </div>
                        <div style={{ padding: '10px 16px 12px', display: 'flex', justifyContent: 'flex-end', borderTop: `1px solid ${T.line2}` }}>
                            <button onClick={() => analyze(query)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 18px', background: '#DC2626', color: '#fff', border: 'none', borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><polyline points="22 2 11 13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>Analyze
                            </button>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
                        {['docker build . failed to solve: process npm install exited with code 1', 'npm install fails inside container', 'container exits immediately after start', 'permission denied on file inside container'].map(sug => (
                            <button key={sug} onClick={() => analyze(sug)} style={{ padding: '7px 16px', border: `1.5px solid ${T.line}`, borderRadius: 20, background: '#fff', cursor: 'pointer', fontSize: '12.5px', color: T.muted }}>{sug.length > 34 ? sug.slice(0, 34) + '…' : sug}</button>
                        ))}
                    </div>
                </div>
            </div>
        )
    }

    // Header scrolls away WITH the transcript (not pinned); only the input bar stays fixed at the bottom.
    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.bgAlt, minHeight: 0 }}>
            <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {header}
                <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {turns.map((t, i) => (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <div style={{ maxWidth: '60%', background: T.blue, color: '#fff', borderRadius: '16px 16px 4px 16px', padding: '12px 18px', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{t.query}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                                <div style={{ width: 34, height: 34, borderRadius: '50%', background: T.blue50, border: `2px solid ${T.blue}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                                    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={T.blue} strokeWidth={2} strokeLinecap="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" /></svg>
                                </div>
                                <div style={{ flex: 1, background: '#fff', border: `1px solid ${T.line}`, borderRadius: '4px 16px 16px 16px', padding: '18px 22px', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
                                    {t.error ? <div style={{ fontSize: '13.5px', color: T.redText }}>{t.error}</div> : <WsMarkdown content={t.content || ''} />}
                                </div>
                            </div>
                        </div>
                    ))}
                    {pending && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ width: 34, height: 34, borderRadius: '50%', background: T.blue50, border: `2px solid ${T.blue}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={T.blue} strokeWidth={2} strokeLinecap="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" /></svg>
                            </div>
                            <div style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: '16px 16px 16px 4px', padding: '14px 18px', display: 'flex', gap: 6, alignItems: 'center' }}>
                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.muted, display: 'inline-block', animation: 'lp-spin 0.9s linear infinite' }} />
                                <span style={{ fontSize: '12.5px', color: T.muted }}>Diagnosing…</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            <div style={{ flexShrink: 0, borderTop: `1px solid ${T.line2}`, padding: '12px 24px', background: '#fff', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <textarea
                    value={query} onChange={e => setQuery(e.target.value)} rows={1}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); analyze(query) } }}
                    placeholder="Ask another question…"
                    style={{ flex: 1, border: `1.5px solid ${T.line}`, borderRadius: 10, padding: '10px 14px', fontFamily: 'inherit', fontSize: 14, color: T.ink, outline: 'none', resize: 'none', lineHeight: 1.5, boxSizing: 'border-box' }}
                />
                <button onClick={() => analyze(query)} disabled={pending || !query.trim()} style={{ padding: '10px 18px', background: pending || !query.trim() ? T.line : '#DC2626', color: pending || !query.trim() ? T.muted : '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: pending || !query.trim() ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>Send</button>
                {showReviewLink && (
                    <button onClick={() => onSwitch('review')} style={{ padding: '10px 18px', background: '#fff', border: `1.5px solid ${T.line}`, borderRadius: 10, fontSize: 13, fontWeight: 700, color: T.ink, cursor: 'pointer', whiteSpace: 'nowrap' }}>Review My Work</button>
                )}
            </div>
        </div>
    )
}

function WsReview({ roadmapId, milestoneId, canReview, initialGithubUrl, onBack, onSwitch, onPassed }: {
    roadmapId: string; milestoneId: string; canReview: boolean; initialGithubUrl: string
    onBack: () => void; onSwitch: (c: Exclude<WsCoach, null>) => void
    onPassed: (result: CheckpointResult, githubUrl: string) => Promise<boolean>
}) {
    const [phase, setPhase] = useState<'input' | 'loading' | 'results'>('input')
    const [githubUrl, setGithubUrl] = useState(initialGithubUrl)
    const [result, setResult] = useState<CheckpointResult | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [continuing, setContinuing] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)

    const analyze = () => {
        if (!canReview) return
        setPhase('loading')
        setError(null)
        projectCoachReviewWork({ roadmap_id: roadmapId, milestone_id: milestoneId, github_url: githubUrl || undefined }).then(res => {
            if (res.success) {
                setResult({ passed: !!res.passed, feedback: res.feedback || '', issues: res.issues || [] })
                setPhase('results')
            } else {
                setError(res.error || 'Review My Work is temporarily unavailable.')
                setPhase('input')
            }
        }).catch(() => {
            setError('Review My Work is temporarily unavailable.')
            setPhase('input')
        })
    }

    const continueNext = async () => {
        if (!result) return
        setContinuing(true)
        setSaveError(null)
        let ok = false
        try {
            ok = await onPassed(result, githubUrl)
        } catch {
            ok = false
        }
        if (!ok) {
            setContinuing(false)
            setSaveError('Could not save your progress — please try again.')
        }
    }

    const header = (
        <WsCoachHeader
            icon={<svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth={2.2} strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>}
            iconBg="#DCFCE7" iconBorder="#BBF7D0" title="Review My Work" sub="Submit your GitHub repo (optional) and get an AI verdict on this milestone."
            active="review" onBack={onBack} onSwitch={onSwitch}
        />
    )

    // Results can be long (feedback + issue list) — header scrolls away with it instead of staying pinned.
    if (phase === 'results' && result) {
        return (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.bgAlt, minHeight: 0 }}>
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                    {header}
                    <div style={{ display: 'flex', flexDirection: 'column', padding: '22px 28px 40px', gap: 18 }}>
                        {result.passed ? (
                            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 14, padding: '20px 24px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth={2.5} strokeLinecap="round"><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" /></svg></div>
                                    <span style={{ fontSize: 16, fontWeight: 800, color: T.greenText }}>Ready to advance</span>
                                </div>
                                <p style={{ fontSize: '13.5px', color: T.ink, lineHeight: 1.7, margin: '0 0 16px' }}>{result.feedback}</p>
                                {saveError && <div style={{ fontSize: '12.5px', color: T.redText, marginBottom: 12 }}>{saveError}</div>}
                                <button onClick={continueNext} disabled={continuing} style={{ padding: '10px 20px', background: T.blue, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: continuing ? 'default' : 'pointer', opacity: continuing ? 0.6 : 1 }}>
                                    {continuing ? 'Saving…' : 'Continue to Next Milestone'}
                                </button>
                            </div>
                        ) : (
                            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 14, padding: '20px 24px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                                    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth={2.5} strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /></svg>
                                    <span style={{ fontSize: 16, fontWeight: 800, color: '#92400E' }}>Fix {result.issues.length || 'a few'} thing{result.issues.length === 1 ? '' : 's'} before continuing</span>
                                </div>
                                {result.feedback && <p style={{ fontSize: '13.5px', color: '#78350F', lineHeight: 1.7, margin: '0 0 12px' }}>{result.feedback}</p>}
                                {result.issues.length > 0 && (
                                    <ol style={{ margin: '0 0 16px', paddingLeft: 20 }}>
                                        {result.issues.map((issue, i) => <li key={i} style={{ fontSize: '13.5px', color: '#78350F', marginBottom: 6 }}>{issue}</li>)}
                                    </ol>
                                )}
                                <button onClick={() => setPhase('input')} style={{ padding: '10px 20px', background: '#fff', border: '1.5px solid #F59E0B', borderRadius: 10, fontSize: 13, fontWeight: 700, color: '#92400E', cursor: 'pointer' }}>Review Again</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.bgAlt, minHeight: 0 }}>
            {header}
            {phase === 'input' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 60px', gap: 20, overflowY: 'auto' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: T.ink, letterSpacing: '-.02em' }}>Ready to submit this milestone?</div>
                    <div style={{ fontSize: 14, color: T.muted, textAlign: 'center', maxWidth: 480 }}>The AI reviews your checklist and (optionally) your GitHub repo, then tells you if you&apos;re ready for the next milestone.</div>
                    {!canReview && (
                        <div style={{ padding: '10px 16px', background: T.amberBg, color: T.amberText, borderRadius: 10, fontSize: '12.5px', fontWeight: 600, maxWidth: 480, textAlign: 'center' }}>
                            Complete all required checklist items in the Tasks tab before requesting a review.
                        </div>
                    )}
                    <div style={{ width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <input
                            value={githubUrl} onChange={e => setGithubUrl(e.target.value)}
                            placeholder="https://github.com/you/your-repo (optional)"
                            style={{ width: '100%', padding: '11px 14px', border: `1.5px solid ${T.line}`, borderRadius: 10, fontSize: 14, color: T.ink, outline: 'none', boxSizing: 'border-box' }}
                        />
                        {error && <div style={{ fontSize: '12.5px', color: T.redText }}>{error}</div>}
                        <button onClick={analyze} disabled={!canReview} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 28px',
                            background: canReview ? T.blue : T.line, color: canReview ? '#fff' : T.muted, border: 'none', borderRadius: 10,
                            fontSize: 14, fontWeight: 700, cursor: canReview ? 'pointer' : 'default', boxShadow: canReview ? '0 2px 8px rgba(37,99,235,.3)' : 'none',
                        }}>
                            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>Review My Work
                        </button>
                    </div>
                </div>
            )}
            {phase === 'loading' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 60 }}>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', border: `3px solid ${T.line}`, borderTopColor: T.blue, marginBottom: 20, animation: 'lp-spin 0.9s linear infinite' }} />
                    <div style={{ fontSize: 17, fontWeight: 700, color: T.ink, marginBottom: 6 }}>Reviewing your implementation…</div>
                    <div style={{ fontSize: '13.5px', color: T.muted }}>Checking your checklist against the milestone goal</div>
                </div>
            )}
        </div>
    )
}

function WsTaskRow({ task, idx, checklistState, onToggleItem, open, onToggleOpen }: {
    task: MilestoneTask; idx: number; checklistState: boolean[]; onToggleItem: (itemIdx: number) => void
    open: boolean; onToggleOpen: () => void
}) {
    const checklist = task.checklist || []
    const requiredIdxs = checklist.map((c, i) => c.required ? i : -1).filter(i => i >= 0)
    const gateIdxs = requiredIdxs.length ? requiredIdxs : checklist.map((_, i) => i)
    const done = gateIdxs.length > 0 && gateIdxs.every(i => checklistState[i])

    return (
        <div style={{ borderBottom: `1px solid ${T.line2}` }}>
            <div onClick={onToggleOpen} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', cursor: 'pointer' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: T.sand, border: `1.5px solid ${T.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: WS_MONO, fontSize: 12, fontWeight: 700, color: T.muted }}>{idx + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: done ? T.muted : T.ink, marginBottom: 2, textDecoration: done ? 'line-through' : 'none' }}>{task.title}</div>
                    <div style={{ fontSize: '12.5px', color: T.muted }}>{wsInline(task.description)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <span style={{ fontSize: '12.5px', fontWeight: 600, color: done ? T.greenText : T.muted }}>{done ? 'Done' : `${gateIdxs.filter(i => checklistState[i]).length}/${gateIdxs.length}`}</span>
                    <span style={{ flexShrink: 0, color: T.muted2, display: 'flex', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>
                        <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>
                    </span>
                </div>
            </div>
            {open && (
                <div style={{ padding: '0 20px 18px 64px', display: 'flex', flexDirection: 'column', gap: 18 }}>
                    {checklist.length > 0 && (
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.muted2, marginBottom: 10 }}>Checklist</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {checklist.map((item, i) => {
                                    const checked = !!checklistState[i]
                                    return (
                                        <div key={i} onClick={() => onToggleItem(i)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                                            <div style={{
                                                width: 18, height: 18, borderRadius: 5, border: checked ? 'none' : '1.5px solid #CBD5E1',
                                                background: checked ? '#22C55E' : '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                {checked && <svg width={9} height={9} viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth={2.4} strokeLinecap="round"><path d="M1.5 5l2.5 2.5 4.5-4.5" /></svg>}
                                            </div>
                                            <span style={{ fontSize: 13, color: checked ? T.muted : T.ink, textDecoration: checked ? 'line-through' : 'none' }}>{item.item}</span>
                                            {item.required && <span style={{ fontSize: 10, fontWeight: 700, color: T.muted2 }}>Required</span>}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                    {task.deliverable && (
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.muted2, marginBottom: 10 }}>Deliverable</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 3 }}>{task.deliverable.name}</div>
                            <div style={{ fontSize: '12.5px', color: T.muted, marginBottom: task.deliverable.example_snippet ? 10 : 0 }}>{task.deliverable.description}</div>
                            {task.deliverable.example_snippet && (
                                <pre style={{ fontFamily: WS_MONO, fontSize: '12.5px', color: '#E2E8F0', background: '#0F1117', margin: 0, padding: '14px 16px', borderRadius: 10, lineHeight: 1.8, whiteSpace: 'pre', overflowX: 'auto' }}>{task.deliverable.example_snippet}</pre>
                            )}
                        </div>
                    )}
                    {(task.resources || []).length > 0 && (
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.muted2, marginBottom: 10 }}>Resources</div>
                            <div style={{ border: `1px solid ${T.line2}`, borderRadius: 10, overflow: 'hidden' }}>
                                {task.resources.map((r, i) => (
                                    <a key={i} href={r.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderBottom: i < task.resources.length - 1 ? `1px solid ${T.line2}` : 'none', background: '#fff', textDecoration: 'none' }}>
                                        <div style={{ width: 34, height: 34, borderRadius: 8, background: WS_RES_ICON[resIconFor(r.type)].bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><WsResIcon k={resIconFor(r.type)} /></div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 1 }}>{r.title}</div>
                                            <div style={{ fontSize: '11.5px', color: T.muted, textTransform: 'capitalize' }}>{r.type}</div>
                                        </div>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: T.blue, fontSize: '12.5px', fontWeight: 700, flexShrink: 0 }}>
                                            Open <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                                        </span>
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}
                    {task.github_example && (
                        <a href={task.github_example.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', border: `1px solid ${T.line2}`, borderRadius: 10, textDecoration: 'none' }}>
                            <div style={{ width: 34, height: 34, borderRadius: 8, background: T.sand, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <svg width={16} height={16} viewBox="0 0 24 24" fill={T.ink}><path d="M12 .5C5.65.5.5 5.65.5 12A11.5 11.5 0 008.4 23.15c.58.1.79-.25.79-.55v-2c-3.22.7-3.9-1.55-3.9-1.55-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.57-.29-5.28-1.28-5.28-5.7 0-1.26.45-2.29 1.2-3.1-.12-.3-.52-1.5.12-3.13 0 0 .97-.31 3.18 1.18a11 11 0 015.8 0c2.2-1.5 3.17-1.18 3.17-1.18.64 1.63.24 2.83.12 3.13.75.81 1.2 1.84 1.2 3.1 0 4.43-2.71 5.4-5.3 5.69.42.36.79 1.08.79 2.18v3.23c0 .3.2.66.8.55A11.5 11.5 0 0023.5 12c0-6.35-5.15-11.5-11.5-11.5z" /></svg>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{task.github_example.name}</div>
                                <div style={{ fontSize: '11.5px', color: T.muted }}>★ {task.github_example.stars} · reference example</div>
                            </div>
                        </a>
                    )}
                </div>
            )}
        </div>
    )
}

function WsMilestoneDetail({ milestone, checklistState, onToggleChecklistItem, openTask, onToggleOpenTask, onOpenCoach, isLastMilestone, canContinue, continuing, onContinue }: {
    milestone: ProjectMilestoneWithProgress; checklistState: boolean[]; onToggleChecklistItem: (flatIdx: number) => void
    openTask: number | null; onToggleOpenTask: (i: number) => void; onOpenCoach: (c: Exclude<WsCoach, null>) => void
    isLastMilestone: boolean; canContinue: boolean; continuing: boolean; onContinue: () => void
}) {
    const [tab, setTab] = useState<'overview' | 'tasks' | 'coach'>('overview')
    const offsets = useMemo(() => taskChecklistOffsets(milestone), [milestone])
    const totalItems = checklistState.length
    const checkedItems = checklistState.filter(Boolean).length
    const pct = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0
    const statusLabel = pct === 100 ? 'Complete' : pct > 0 ? 'In Progress' : 'Not Started'
    const statusDot = pct === 100 ? '#22C55E' : pct > 0 ? T.blue : '#1E293B'
    const dos = milestone.tasks.map(t => t.title)
    const dels = milestone.tasks.filter(t => t.deliverable).map(t => t.deliverable!.name)
    const alreadyCompleted = milestone.progress?.status === 'completed'

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', background: T.bgAlt, minHeight: 0 }}>
            <div style={{ padding: '28px 36px 0', borderBottom: `1px solid ${T.line2}`, background: T.bgAlt }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, marginBottom: 16, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 240 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.blue, marginBottom: 6 }}>Milestone {milestone.milestone_number}</div>
                        <h2 style={{ fontSize: 30, fontWeight: 800, color: T.ink, letterSpacing: '-0.04em', margin: '0 0 8px' }}>{milestone.title}</h2>
                        <div style={{ fontSize: 14, color: T.muted }}>{milestone.goal}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, flexShrink: 0, paddingTop: 4 }}>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', marginBottom: 3 }}>
                                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth={2} strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                                <span style={{ fontSize: 12, color: T.muted }}>Estimated Time</span>
                            </div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: T.ink }}>{milestone.estimated_hours ? `${milestone.estimated_hours} Hours` : 'Not estimated'}</div>
                        </div>
                        <div style={{ width: 1, height: 14, background: T.line2 }} />
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 12, color: T.muted, marginBottom: 3 }}>Status</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                                <div style={{ width: 10, height: 10, borderRadius: '50%', background: statusDot }} />
                                <span style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{statusLabel}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                    <div style={{ fontSize: '13.5px', fontWeight: 700, color: T.muted, whiteSpace: 'nowrap' }}>{pct}% Complete</div>
                    <div style={{ flex: 1, height: 6, background: '#E2E8F0', borderRadius: 99, overflow: 'hidden', maxWidth: 520 }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: T.blue, borderRadius: 99, transition: 'width .4s' }} />
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 0 }}>
                    {(['overview', 'tasks', 'coach'] as const).map(tb => (
                        <button key={tb} onClick={() => setTab(tb)} style={{
                            padding: '10px 20px', border: 'none', background: 'transparent', fontSize: 14,
                            fontWeight: tab === tb ? 700 : 500, color: tab === tb ? T.blue : T.muted, cursor: 'pointer',
                            borderBottom: tab === tb ? `2.5px solid ${T.blue}` : '2.5px solid transparent', marginBottom: -1,
                        }}>{tb === 'overview' ? 'Overview' : tb === 'tasks' ? 'Tasks' : 'Project Coach'}</button>
                    ))}
                </div>
            </div>

            {!isLastMilestone && !alreadyCompleted && (
                <div style={{
                    padding: '14px 36px', background: canContinue ? '#F0FDF4' : '#fff', borderBottom: `1px solid ${T.line2}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
                }}>
                    <div style={{ fontSize: '13.5px', color: canContinue ? T.greenText : T.muted, fontWeight: canContinue ? 700 : 500 }}>
                        {canContinue ? '✓ All required checklist items complete.' : 'Complete all required checklist items to continue.'}
                    </div>
                    <button onClick={onContinue} disabled={!canContinue || continuing} style={{
                        padding: '9px 20px', background: canContinue ? T.blue : T.line, color: canContinue ? '#fff' : T.muted,
                        border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
                        cursor: canContinue && !continuing ? 'pointer' : 'default', opacity: continuing ? 0.6 : 1,
                    }}>{continuing ? 'Saving…' : 'Continue to Next Milestone →'}</button>
                </div>
            )}
            {isLastMilestone && !alreadyCompleted && (
                <div style={{ padding: '14px 36px', background: '#fff', borderBottom: `1px solid ${T.line2}` }}>
                    <div style={{ fontSize: '13.5px', color: T.muted }}>
                        This is the final milestone — pass <strong style={{ color: T.ink }}>Review My Work</strong> in the Project Coach tab to mark the whole project complete.
                    </div>
                </div>
            )}

            <div style={{ padding: '28px 36px 60px', flex: 1 }}>
                {tab === 'overview' && (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, border: `1px solid ${T.line}`, borderRadius: 14, overflow: 'hidden', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', marginBottom: 24 }}>
                            <div style={{ padding: 28, borderRight: `1px solid ${T.line}` }}>
                                <div style={{ fontSize: 16, fontWeight: 800, color: T.ink, marginBottom: 10 }}>Goal</div>
                                <div style={{ fontSize: 14, color: T.muted, lineHeight: 1.7, marginBottom: 22 }}>{milestone.goal}</div>
                                <div style={{ fontSize: 16, fontWeight: 800, color: T.ink, marginBottom: 14 }}>What You&apos;ll Do</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {dos.map(d => (
                                        <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <div style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${T.blue}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                <svg width={10} height={10} viewBox="0 0 10 10" fill="none" stroke={T.blue} strokeWidth={2.4} strokeLinecap="round"><path d="M1.5 5l2.5 2.5 4.5-4.5" /></svg>
                                            </div>
                                            <span style={{ fontSize: 14, color: T.ink }}>{d}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div style={{ padding: 28 }}>
                                <div style={{ fontSize: 16, fontWeight: 800, color: T.ink, marginBottom: 18 }}>Expected Deliverables</div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    {dels.length === 0 && <div style={{ fontSize: 13, color: T.muted }}>No standalone deliverables for this milestone.</div>}
                                    {dels.map((d, j) => (
                                        <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: j < dels.length - 1 ? `1px solid ${T.line2}` : 'none' }}>
                                            <div style={{ width: 20, height: 20, borderRadius: 4, background: T.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                <svg width={10} height={10} viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth={2.4} strokeLinecap="round"><path d="M1.5 5l2.5 2.5 4.5-4.5" /></svg>
                                            </div>
                                            <span style={{ flex: 1, fontSize: 14, color: T.ink }}>{d}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 14, padding: '24px 28px', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                                <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={T.blue} strokeWidth={2} strokeLinecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                                <span style={{ fontSize: 16, fontWeight: 800, color: T.ink }}>Project Coach</span>
                            </div>
                            <div style={{ fontSize: 13, color: T.muted, marginBottom: 20 }}>I&apos;m here to help you with this milestone. Choose an option below or ask me anything.</div>
                            <div style={{ display: 'grid', gridTemplateColumns: isLastMilestone ? '1fr 1fr 1fr' : '1fr 1fr', gap: 12 }}>
                                <WsCoachCard label="Teach Me" desc="Explain concepts step-by-step" onClick={() => onOpenCoach('teach-me')}
                                    icon={<svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={T.blue} strokeWidth={1.8} strokeLinecap="round"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" /><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" /></svg>} />
                                <WsCoachCard label="I'm Stuck" desc="Get help with errors or issues" onClick={() => onOpenCoach('stuck')}
                                    icon={<svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth={1.8} strokeLinecap="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>} />
                                {isLastMilestone && (
                                    <WsCoachCard label="Review My Work" desc="Final AI review — completes the project" onClick={() => onOpenCoach('review')}
                                        icon={<svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={T.blue} strokeWidth={1.8} strokeLinecap="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>} />
                                )}
                            </div>
                        </div>
                    </>
                )}

                {tab === 'tasks' && (
                    <>
                        <div style={{ marginBottom: 18 }}>
                            <div style={{ fontSize: 20, fontWeight: 800, color: T.ink, letterSpacing: '-0.02em', marginBottom: 4 }}>Tasks</div>
                            <div style={{ fontSize: '13.5px', color: T.muted }}>Follow these tasks to complete this milestone. Expand a task to see its resources.</div>
                        </div>
                        <div style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                            {milestone.tasks.map((task, j) => {
                                const offset = offsets[j]
                                const slice = checklistState.slice(offset, offset + (task.checklist || []).length)
                                return (
                                    <WsTaskRow key={j} task={task} idx={j} checklistState={slice} open={openTask === j}
                                        onToggleOpen={() => onToggleOpenTask(j)}
                                        onToggleItem={(itemIdx) => onToggleChecklistItem(offset + itemIdx)} />
                                )
                            })}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: '#fff', border: `1px solid ${T.line}`, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', marginTop: 16, gap: 12, flexWrap: 'wrap' }}>
                            <div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: T.blue, marginBottom: 3 }}>Need more help?</div>
                                <div style={{ fontSize: '12.5px', color: T.muted }}>Ask the Project Coach for guidance specific to this milestone.</div>
                            </div>
                            <button onClick={() => setTab('coach')} style={{ padding: '10px 20px', background: T.blue, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Ask Project Coach</button>
                        </div>
                    </>
                )}

                {tab === 'coach' && (
                    <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                            <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={T.blue} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" /></svg>
                            <div style={{ fontSize: 18, fontWeight: 800, color: T.ink, letterSpacing: '-0.02em' }}>Project Coach</div>
                        </div>
                        <div style={{ fontSize: '13.5px', color: T.muted, marginBottom: 20 }}>I&apos;m here to help you with this milestone. Choose an option below or ask me anything.</div>
                        <div style={{ display: 'grid', gridTemplateColumns: isLastMilestone ? 'repeat(3,1fr)' : 'repeat(2,1fr)', gap: 10, marginBottom: 22 }}>
                            <WsCoachCard label="Teach Me" desc="Explain concepts step-by-step" onClick={() => onOpenCoach('teach-me')}
                                icon={<svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={T.blue} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" /><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" /></svg>} />
                            <WsCoachCard label="I'm Stuck" desc="Get help with errors or issues" onClick={() => onOpenCoach('stuck')}
                                icon={<svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M8 6l4-4 4 4" /><path d="M12 2v10.3" /><path d="M4.93 10.93A10 10 0 1021.07 10.93" /></svg>} />
                            {isLastMilestone && (
                                <WsCoachCard label="Review My Work" desc="Final AI review — completes the project" onClick={() => onOpenCoach('review')}
                                    icon={<svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={T.blue} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>} />
                            )}
                        </div>
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: '12.5px', fontWeight: 600, color: T.muted, marginBottom: 10, letterSpacing: '0.02em' }}>Suggested Questions</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {['How do I create a Node.js app?', 'What should my Dockerfile look like?', "I'm getting an error while building the image", 'How do I run the container?'].map(q => (
                                    <button key={q} onClick={() => onOpenCoach('teach-me')} style={{ padding: '7px 14px', background: '#fff', border: `1.5px solid ${T.line}`, borderRadius: 20, fontSize: '12.5px', color: T.blue, fontWeight: 600, cursor: 'pointer' }}>{q}</button>
                                ))}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: '#fff', border: `1px solid ${T.line}`, borderRadius: 12, padding: '8px 8px 8px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                            <input type="text" placeholder="Ask the Project Coach anything about this milestone…" style={{ flex: 1, border: 'none', outline: 'none', fontSize: '13.5px', color: T.ink, background: 'transparent' }} />
                            <button onClick={() => onOpenCoach('teach-me')} style={{ width: 36, height: 36, borderRadius: 9, background: T.blue, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                                <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                            </button>
                        </div>
                        <div style={{ textAlign: 'center', fontSize: 12, color: T.muted, marginTop: 12 }}>AI responses may not always be 100% accurate. Verify important steps.</div>
                    </>
                )}
            </div>
        </div>
    )
}

function WsCoachCard({ icon, label, desc, onClick }: { icon: ReactElement; label: string; desc: string; onClick: () => void }) {
    return (
        <button onClick={onClick} className="ws-coach-card" style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 12, padding: '18px 12px', textAlign: 'center', cursor: 'pointer' }}>
            <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'center' }}>{icon}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: '11.5px', color: T.muted }}>{desc}</div>
        </button>
    )
}

function WsOverview({ roadmap, milestones, onStart, onSelectMilestone }: {
    roadmap: import('@/lib/types').ProjectRoadmap; milestones: ProjectMilestoneWithProgress[]
    onStart: () => void; onSelectMilestone: (i: number) => void
}) {
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
    const curve = roadmap.milestone_score_curve || []
    const N = curve.length
    const totalGain = roadmap.expected_score_impact || 0
    const baseScore = N > 0 ? Math.round(curve[0].score_after - (totalGain * 2) / (N * (N + 1))) : null
    const finalScore = N > 0 ? curve[N - 1].score_after : null
    const progressions = roadmap.skill_progressions || []
    const alreadyKnow = progressions.filter(p => p.from_level !== 'none').map(p => p.skill)
    const willLearn = progressions.map(p => p.skill)
    const deliverables = Array.from(new Set(
        milestones.flatMap(m => m.tasks.filter(t => t.deliverable).map(t => t.deliverable!.name))
    ))

    const { user } = useAuth()
    const [evidence, setEvidence] = useState<ProjectEvidence | null>(null)
    useEffect(() => {
        if (roadmap.status !== 'completed') return
        let cancelled = false
        fetchProjectEvidence(roadmap.id).then(e => { if (!cancelled) setEvidence(e) })
        return () => { cancelled = true }
    }, [roadmap.id, roadmap.status])

    const [achievements, setAchievements] = useState<UserAchievement[]>([])
    useEffect(() => {
        if (roadmap.status !== 'completed' || !user?.id) return
        let cancelled = false
        fetchUserAchievements(user.id).then(a => { if (!cancelled) setAchievements(a) })
        return () => { cancelled = true }
    }, [roadmap.status, user?.id])
    const [bulletCopied, setBulletCopied] = useState(false)
    const copyBullet = () => {
        if (!evidence?.resume_bullet) return
        navigator.clipboard.writeText(evidence.resume_bullet).then(() => {
            setBulletCopied(true)
            setTimeout(() => setBulletCopied(false), 1500)
        })
    }

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.bgAlt, minHeight: 0 }}>
            <div style={{ flexShrink: 0, padding: '13px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', borderBottom: `1px solid ${T.line2}`, gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: T.muted }}>
                    <span>My Projects</span>
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={T.muted2} strokeWidth={2} strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>
                    <span style={{ fontWeight: 600, color: T.ink }}>{roadmap.project_name}</span>
                </div>
                <button onClick={onStart} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 22px', background: T.blue, color: '#fff', border: 'none', borderRadius: 10, fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(37,99,235,.25)' }}>
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
                    Start Milestone 1
                </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                <div style={{ padding: '32px 40px 60px', maxWidth: 1440, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

                    {roadmap.status === 'completed' && (
                        <div style={{ background: T.blue50, border: `1px solid ${T.blueLight}`, borderRadius: 14, padding: '20px 24px', marginBottom: 24 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth={2.5} strokeLinecap="round"><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" /></svg>
                                <span style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>Project Complete</span>
                            </div>
                            {evidence?.resume_bullet ? (
                                <>
                                    <p style={{ fontSize: 14, color: T.ink, fontStyle: 'italic', lineHeight: 1.7, margin: '0 0 12px' }}>&ldquo;{evidence.resume_bullet}&rdquo;</p>
                                    <button onClick={copyBullet} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: bulletCopied ? '#DCFCE7' : '#fff', border: `1.5px solid ${bulletCopied ? '#BBF7D0' : T.blue}`, borderRadius: 8, fontSize: 12.5, fontWeight: 700, color: bulletCopied ? T.greenText : T.blue, cursor: 'pointer' }}>
                                        {bulletCopied ? '✓ Copied' : 'Copy Resume Bullet'}
                                    </button>
                                </>
                            ) : (
                                <p style={{ fontSize: '13.5px', color: T.muted, margin: 0 }}>Generating your resume bullet — check back in a moment.</p>
                            )}
                            {achievements.length > 0 && (
                                <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.blueLight}` }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Achievements</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                        {achievements.map(a => (
                                            <span key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: T.greenBg, border: `1px solid #BBF7D0`, borderRadius: 999, fontSize: 12, fontWeight: 600, color: T.greenText }}>
                                                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={T.greenText} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" /></svg>
                                                {a.label}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div style={{ marginBottom: 28 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                            <h1 style={{ fontSize: 30, fontWeight: 800, color: T.ink, letterSpacing: '-0.04em', margin: 0 }}>Project Overview</h1>
                        </div>
                        <p style={{ fontSize: 14, color: T.muted, marginBottom: 22 }}>Get a complete understanding of this project and what you will build.</p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                            {[
                                { icon: <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth={2} strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>, label: 'Estimated Time', big: roadmap.estimated_weeks ? `${roadmap.estimated_weeks} Week${roadmap.estimated_weeks === 1 ? '' : 's'}` : 'Not estimated', sub: `${milestones.length} milestones` },
                                { icon: <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth={2} strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>, label: 'Difficulty', big: cap(roadmap.difficulty), sub: 'Great for building real-world skills' },
                                { icon: <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth={2} strokeLinecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>, label: 'Score Impact', big: totalGain ? `+${totalGain}%` : 'Not estimated', sub: 'Match score gain on completion' },
                                { icon: <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth={2} strokeLinecap="round"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>, label: 'Skills Covered', big: `${roadmap.tech_stack.length} Skill${roadmap.tech_stack.length === 1 ? '' : 's'}`, sub: roadmap.tech_stack.slice(0, 3).join(', ') || 'See tech stack below' },
                            ].map(c => (
                                <div key={c.label} style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                                        {c.icon}<span style={{ fontSize: 12, fontWeight: 600, color: T.muted }}>{c.label}</span>
                                    </div>
                                    <div style={{ fontSize: c.big.length > 14 ? 18 : 21, fontWeight: 800, color: T.ink, lineHeight: 1.25, marginBottom: 5 }}>{c.big}</div>
                                    <div style={{ fontSize: 12, color: T.blue, fontWeight: 500 }}>{c.sub}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18, marginBottom: 18 }}>
                        <div style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 14, padding: '24px 28px', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
                            <div style={{ fontSize: 15, fontWeight: 800, color: T.ink, marginBottom: 14 }}>About This Project</div>
                            <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.8, marginBottom: 12, whiteSpace: 'pre-line' }}>
                                {roadmap.project_theory || roadmap.project_description || 'No description generated yet.'}
                            </p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {roadmap.tech_stack.map(t => (
                                    <span key={t} style={{ padding: '4px 10px', background: T.blue50, color: T.blue, fontSize: 12, fontWeight: 600, borderRadius: 6 }}>{t}</span>
                                ))}
                            </div>
                        </div>
                        <div style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 14, padding: '24px 28px', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
                            <div style={{ fontSize: 15, fontWeight: 800, color: T.ink, marginBottom: 14 }}>Why This Project?</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
                                {progressions.length === 0 && <div style={{ fontSize: 13, color: T.muted }}>Closes {roadmap.tech_stack.join(', ') || 'key'} gaps for this role.</div>}
                                {progressions.map(p => (
                                    <div key={p.skill} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: T.blue50, border: `1px solid ${T.blueLight}`, borderRadius: 10 }}>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{p.skill}</div>
                                        <span style={{ fontSize: '11.5px', color: T.blue, fontWeight: 600 }}>{cap(p.from_level)} → {cap(p.to_level)}</span>
                                    </div>
                                ))}
                            </div>
                            {baseScore !== null && finalScore !== null && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}><span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>Current Match</span><span style={{ fontSize: 12, fontWeight: 700, color: T.muted }}>{baseScore}%</span></div>
                                        <div style={{ height: 8, background: T.sand, borderRadius: 99, overflow: 'hidden' }}><div style={{ width: `${baseScore}%`, height: '100%', background: '#94A3B8', borderRadius: 99 }} /></div>
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}><span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>After Completion</span><span style={{ fontSize: 12, fontWeight: 700, color: T.greenText }}>{finalScore}%</span></div>
                                        <div style={{ height: 8, background: T.sand, borderRadius: 99, overflow: 'hidden' }}><div style={{ width: `${finalScore}%`, height: '100%', background: T.blue, borderRadius: 99 }} /></div>
                                    </div>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: T.greenText, textAlign: 'right' }}>+{finalScore - baseScore}% improvement</div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 14, padding: '24px 28px', boxShadow: '0 1px 4px rgba(0,0,0,.05)', marginBottom: 18, overflowX: 'auto' }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: T.ink, marginBottom: 22 }}>Your Milestone Journey</div>
                        <div style={{ display: 'flex', alignItems: 'flex-start', position: 'relative', minWidth: 560 }}>
                            <div style={{ position: 'absolute', top: 19, left: '10%', right: '10%', height: 2, background: T.line2, zIndex: 0 }} />
                            {milestones.map((m, i) => {
                                const complete = m.progress?.status === 'completed'
                                const active = m.milestone_number === roadmap.current_milestone
                                const clickable = !m.locked
                                return (
                                    <div key={m.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, position: 'relative', zIndex: 1 }}>
                                        <div onClick={() => clickable && onSelectMilestone(i)} style={{
                                            width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontFamily: WS_MONO, fontSize: 14, fontWeight: 700, cursor: clickable ? 'pointer' : 'default',
                                            background: complete ? '#22C55E' : active ? T.blue : '#fff',
                                            border: complete ? 'none' : active ? `2.5px solid ${T.blue}` : `2px solid ${T.line}`,
                                            color: complete || active ? '#fff' : T.muted2, opacity: m.locked ? 0.6 : 1,
                                        }}>{complete ? '✓' : m.milestone_number}</div>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: 12, fontWeight: active ? 700 : 600, color: active ? T.blue : T.muted }}>{m.title}</div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
                        <div style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 14, padding: '24px 28px', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
                            <div style={{ fontSize: 15, fontWeight: 800, color: T.ink, marginBottom: 16 }}>What You&apos;ll Be Able To Do</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                                {milestones.length === 0 && <div style={{ fontSize: 13, color: T.muted }}>Milestone goals not available for this project.</div>}
                                {milestones.map(m => (
                                    <div key={m.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                                        <div style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${T.blue}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                                            <svg width={10} height={10} viewBox="0 0 10 10" fill="none" stroke={T.blue} strokeWidth={2.4} strokeLinecap="round"><path d="M1.5 5l2.5 2.5 4.5-4.5" /></svg>
                                        </div>
                                        <span style={{ fontSize: '13.5px', color: T.ink, lineHeight: 1.6 }}>{m.goal}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 14, padding: '24px 28px', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
                            <div style={{ fontSize: 15, fontWeight: 800, color: T.ink, marginBottom: 16 }}>Portfolio Outcome</div>
                            <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.7, marginBottom: 10 }}>{roadmap.github_outcome || 'A working GitHub repo demonstrating this project.'}</p>
                            <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.7, marginBottom: 20 }}>{roadmap.portfolio_outcome}</p>
                            <div style={{ background: T.blue50, border: `1px solid ${T.blueLight}`, borderRadius: 10, padding: '14px 16px' }}>
                                <div style={{ fontSize: '11.5px', fontWeight: 700, color: T.blue, marginBottom: 5 }}>Resume Bullet (unlocked on completion)</div>
                                <div style={{ fontSize: '12.5px', color: T.muted, lineHeight: 1.6 }}>Generated automatically once every milestone passes review.</div>
                            </div>
                        </div>
                    </div>

                    {progressions.length > 0 && (
                        <div style={{ marginBottom: 32 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={T.blue} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>
                                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.blue }}>Before You Start</span>
                            </div>
                            <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.6, marginBottom: 16 }}>Here&apos;s where you stand on the skills this project covers.</p>
                            <div style={{ border: `1px solid ${T.line}`, borderRadius: 12, overflow: 'hidden' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                                    <div style={{ borderRight: `1px solid ${T.line}` }}>
                                        <div style={{ padding: '12px 16px', background: '#F0FDF4', borderBottom: '1px solid #BBF7D0' }}>
                                            <span style={{ fontSize: 12, fontWeight: 700, color: '#15803D' }}>Some Experience Already</span>
                                        </div>
                                        <div style={{ padding: '8px 16px' }}>
                                            {alreadyKnow.length === 0 && <div style={{ padding: '8px 0', fontSize: 12, color: T.muted }}>None yet — all new for you.</div>}
                                            {alreadyKnow.map((s, i, arr) => (
                                                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 0', borderBottom: i < arr.length - 1 ? `1px solid ${T.line2}` : 'none' }}>
                                                    <svg width={14} height={14} fill="#16A34A" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
                                                    <span style={{ fontSize: 13, color: T.ink }}>{s}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ padding: '12px 16px', background: '#fff', borderBottom: `1px solid ${T.line}` }}>
                                            <span style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>You Will Learn</span>
                                        </div>
                                        <div style={{ padding: '8px 16px' }}>
                                            {willLearn.map((s, i, arr) => (
                                                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 0', borderBottom: i < arr.length - 1 ? `1px solid ${T.line2}` : 'none' }}>
                                                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={T.blue} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>
                                                    <span style={{ fontSize: 13, color: T.ink }}>{s}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {deliverables.length > 0 && (
                        <div style={{ marginBottom: 32 }}>
                            <div style={{ fontSize: 14, fontWeight: 800, color: T.blue, marginBottom: 14 }}>FILES YOU&apos;LL PRODUCE</div>
                            <div style={{ background: T.bgAlt, border: `1px solid ${T.line}`, borderRadius: 10, padding: '16px 20px', overflowX: 'auto' }}>
                                <div style={{ fontFamily: WS_MONO, fontSize: '12.5px', color: T.ink, lineHeight: 2 }}>
                                    {Array.from(new Set([...deliverables, 'README.md', '.gitignore'])).map(l => (
                                        <div key={l} style={{ color: T.muted }}>├── {l}</div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <button onClick={onStart} style={{ padding: '14px 48px', background: T.blue, color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 16px rgba(37,99,235,.3)', letterSpacing: '-0.01em' }}>Start Milestone 1 →</button>
                    </div>

                </div>
            </div>
        </div>
    )
}

/**
 * Bottom-right stack of transient achievement notifications. Uses the app's existing
 * "verified" green (T.green*) rather than the brand blue — blue already means "the AI
 * did this" throughout this page (Teach Me, Generate); green already means "you actually
 * did this" (Confirmed Projects checkmarks, Ready-to-advance). An achievement is the
 * latter, so it borrows that established color, not a new gamified one. Icon is a
 * verification seal, not a star — professional register, not "unlocked" game language.
 */
function AchievementToastStack({ toasts }: { toasts: { id: string; label: string }[] }) {
    if (toasts.length === 0) return null
    return (
        <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 60, display: 'flex', flexDirection: 'column-reverse', gap: 8 }}>
            {toasts.map(t => (
                <div key={t.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#fff',
                    border: `1px solid ${T.line}`, borderLeftWidth: 3, borderLeftColor: T.green,
                    borderRadius: 10, boxShadow: '0 8px 24px rgba(15,23,42,.12)', minWidth: 250, animation: 'lp-toast-in .25s ease',
                }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: T.greenBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" /></svg>
                    </div>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Achievement earned</div>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>{t.label}</div>
                    </div>
                </div>
            ))}
            <style>{`@keyframes lp-toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        </div>
    )
}

function MilestoneWorkspace({ roadmapId, onBack }: { roadmapId: string; onBack: () => void }) {
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [roadmap, setRoadmap] = useState<import('@/lib/types').ProjectRoadmap | null>(null)
    const [milestones, setMilestones] = useState<ProjectMilestoneWithProgress[]>([])
    const [view, setView] = useState<'overview' | 'ms'>('overview')
    const [msIdx, setMsIdx] = useState(0)
    const [coach, setCoach] = useState<WsCoach>(null)
    const [checklistByMilestone, setChecklistByMilestone] = useState<boolean[][]>([])
    const [openTask, setOpenTask] = useState<number | null>(null)
    const [isNarrow, setIsNarrow] = useState(false)
    const [railOpen, setRailOpen] = useState(false)
    const [continuing, setContinuing] = useState(false)
    const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
    const [teachMeCache, setTeachMeCache] = useState<Record<string, string>>({})
    const [stuckHistory, setStuckHistory] = useState<Record<string, WsStuckTurn[]>>({})
    const [achievementToasts, setAchievementToasts] = useState<{ id: string; label: string }[]>([])

    useEffect(() => {
        let cancelled = false
        fetchProjectRoadmapDetail(roadmapId).then(detail => {
            if (cancelled) return
            if (!detail) { setLoadError('Could not load this roadmap.'); setLoading(false); return }
            setRoadmap(detail.roadmap)
            setMilestones(detail.milestones)
            setChecklistByMilestone(detail.milestones.map(m => {
                const total = flattenChecklist(m).length
                const saved = m.progress?.checklist_state
                if (Array.isArray(saved) && saved.length === total) return saved.slice()
                return new Array(total).fill(false)
            }))
            setView(detail.roadmap.status === 'not_started' ? 'overview' : 'ms')
            setMsIdx(Math.max(0, detail.roadmap.current_milestone - 1))
            setLoading(false)
        }).catch(() => { if (!cancelled) { setLoadError('Could not load this roadmap.'); setLoading(false) } })
        return () => { cancelled = true }
    }, [roadmapId])

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 1024px)')
        setIsNarrow(mq.matches)
        const handler = (e: MediaQueryListEvent) => setIsNarrow(e.matches)
        mq.addEventListener('change', handler)
        return () => mq.removeEventListener('change', handler)
    }, [])

    const goMilestone = (i: number) => { setMsIdx(i); setView('ms'); setCoach(null); setOpenTask(null); setRailOpen(false) }
    const goOverview = () => { setView('overview'); setCoach(null); setRailOpen(false) }

    const handleStart = () => {
        goMilestone(0)
        setRoadmap(r => {
            if (r && r.status === 'not_started') {
                void startProjectRoadmap(roadmapId)
                return { ...r, status: 'in_progress', started_at: new Date().toISOString() }
            }
            return r
        })
    }

    /** Persists a passed Checkpoint Review, advances current_milestone, and navigates on. Returns success. */
    const handleMilestonePassed = async (result: CheckpointResult, githubUrl: string): Promise<boolean> => {
        const milestone = milestones[msIdx]
        if (!milestone) return false
        let res: Awaited<ReturnType<typeof completeMilestone>>
        try {
            res = await completeMilestone(milestone.id, { checkpoint_result: result, github_url: githubUrl || undefined })
        } catch {
            return false
        }
        if (!res.success) return false

        const newCurrent = res.current_milestone ?? milestone.milestone_number + 1
        setMilestones(prev => prev.map(m => ({
            ...m,
            locked: m.milestone_number > newCurrent,
            progress: m.id === milestone.id
                ? { ...(m.progress ?? { id: '', user_id: '', roadmap_id: roadmapId, milestone_id: m.id, checklist_state: checklistByMilestone[msIdx] ?? [], github_url: null, notes: null, created_at: '', updated_at: '' }), status: 'completed', github_url: githubUrl || m.progress?.github_url || null, checkpoint_result: result, completed_at: new Date().toISOString() }
                : m.progress,
        })))
        setRoadmap(r => r ? {
            ...r,
            current_milestone: newCurrent,
            status: res.roadmap_completed ? 'completed' : r.status,
            completed_at: res.roadmap_completed ? new Date().toISOString() : r.completed_at,
        } : r)

        if (res.achievements_earned && res.achievements_earned.length > 0) {
            const toasts = res.achievements_earned.map(a => ({ id: `${a.achievement}-${Date.now()}`, label: a.label }))
            setAchievementToasts(prev => [...prev, ...toasts])
            toasts.forEach(t => {
                setTimeout(() => setAchievementToasts(prev => prev.filter(x => x.id !== t.id)), 5000)
            })
        }

        const nextIdx = msIdx + 1
        if (nextIdx < milestones.length && milestones[nextIdx].milestone_number <= newCurrent) {
            goMilestone(nextIdx)
        } else {
            goOverview()
        }
        return true
    }

    /** Non-final milestones: no AI review, just a checklist-gated advance. */
    const handleSimpleContinue = async () => {
        setContinuing(true)
        const ok = await handleMilestonePassed(
            { passed: true, feedback: 'All required checklist items completed.', issues: [] },
            milestones[msIdx]?.progress?.github_url ?? ''
        )
        if (!ok) setContinuing(false)
    }

    const toggleChecklistItem = (milestoneIdx: number, flatIdx: number) => {
        setChecklistByMilestone(prev => {
            const next = prev.map(row => row.slice())
            if (next[milestoneIdx]) next[milestoneIdx][flatIdx] = !next[milestoneIdx][flatIdx]
            return next
        })
        const milestone = milestones[milestoneIdx]
        if (!milestone) return
        if (saveTimers.current[milestone.id]) clearTimeout(saveTimers.current[milestone.id])
        saveTimers.current[milestone.id] = setTimeout(() => {
            setChecklistByMilestone(current => {
                const state = current[milestoneIdx]
                if (state) void saveMilestoneProgress(milestone.id, { checklist_state: state })
                return current
            })
        }, 1500)
    }

    if (loading) {
        return (
            <div style={{ height: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 28, height: 28, border: `2px solid ${T.line2}`, borderTopColor: T.blue, borderRadius: '50%', animation: 'lp-spin 0.8s linear infinite' }} />
            </div>
        )
    }
    if (loadError || !roadmap) {
        return (
            <div style={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <div style={{ fontSize: 15, color: T.muted }}>{loadError || 'Roadmap not found.'}</div>
                <button onClick={onBack} style={{ padding: '8px 18px', background: T.blue, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Back to Projects</button>
            </div>
        )
    }

    const activeMilestone = milestones[msIdx]

    return (
        <div style={{ height: 'calc(100vh - 64px)', overflow: 'hidden', background: T.bgAlt, minWidth: 320, display: 'flex', flexDirection: 'row', position: 'relative' }}>
            <AchievementToastStack toasts={achievementToasts} />
            {isNarrow && railOpen && (
                <div onClick={() => setRailOpen(false)} style={{ position: 'fixed', inset: 0, top: 64, background: 'rgba(15,23,42,.4)', zIndex: 40 }} />
            )}
            {isNarrow && !railOpen && (
                <button onClick={() => setRailOpen(true)} aria-label="Open milestone list" style={{
                    position: 'absolute', top: 12, left: 12, zIndex: 30, width: 36, height: 36, borderRadius: 9,
                    background: '#fff', border: `1px solid ${T.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,.08)',
                }}>
                    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={T.ink} strokeWidth={2.2} strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
                </button>
            )}
            <div style={{
                width: 220, minWidth: 220, flexShrink: 0, height: '100%', background: '#fff', borderRight: `1px solid ${T.line}`,
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                ...(isNarrow ? {
                    position: 'fixed' as const, top: 64, bottom: 0, left: railOpen ? 0 : -221,
                    transition: 'left .25s ease', zIndex: 41, boxShadow: railOpen ? '4px 0 24px rgba(15,23,42,.15)' : 'none',
                } : {}),
            }}>
                <div style={{ padding: '18px 16px 12px' }}>
                    <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: T.muted, fontSize: 12, fontWeight: 600, padding: 0, marginBottom: 14 }}>
                        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                        Back to Projects
                    </button>
                    <div style={{ fontFamily: WS_MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: T.muted2, marginBottom: 12 }}>Project Roadmap</div>
                    <div onClick={goOverview} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: view === 'overview' ? T.blue50 : 'transparent', cursor: 'pointer' }}>
                        <div style={{ width: 28, height: 28, borderRadius: 6, background: T.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.2} strokeLinecap="round"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" /><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" /></svg>
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 700, color: T.ink, flex: 1 }}>Overview</span>
                        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={T.muted2} strokeWidth={2.2} strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>
                    </div>
                </div>

                <div style={{ borderTop: `1px solid ${T.line2}`, overflowY: 'auto', flex: 1 }}>
                    {milestones.map((m, i) => {
                        const state = checklistByMilestone[i] ?? []
                        const doneCount = state.filter(Boolean).length
                        const complete = m.progress?.status === 'completed'
                        const active = view === 'ms' && msIdx === i
                        const locked = m.locked
                        return (
                            <button key={m.id} onClick={() => !locked && goMilestone(i)} disabled={locked} style={{
                                display: 'flex', alignItems: 'flex-start', padding: '14px 16px', borderBottom: `1px solid ${T.line2}`,
                                cursor: locked ? 'default' : 'pointer', background: active ? T.blue50 : 'transparent', border: 'none', borderLeft: 'none', borderRight: 'none', borderTop: 'none', width: '100%', textAlign: 'left',
                                opacity: locked ? 0.55 : 1,
                            }}>
                                <div style={{ width: 22, flexShrink: 0, paddingTop: 2, fontSize: 12, fontWeight: 700, color: T.muted2, fontFamily: WS_MONO }}>{m.milestone_number}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '13.5px', fontWeight: 700, color: active ? T.blue : T.ink, lineHeight: 1.3, marginBottom: 2 }}>Milestone {m.milestone_number}</div>
                                    <div style={{ fontSize: 12, color: T.muted, marginBottom: 6 }}>{m.title}</div>
                                    {!locked && state.length > 0 && (
                                        <div style={{ fontSize: 11, color: T.muted2 }}>{doneCount}/{state.length} checklist items</div>
                                    )}
                                </div>
                                <div style={{ flexShrink: 0, marginLeft: 10, marginTop: 2 }}>
                                    {locked ? (
                                        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={T.muted2} strokeWidth={2} strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
                                    ) : complete ? (
                                        <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#22C55E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <svg width={11} height={11} viewBox="0 0 11 11" fill="none" stroke="white" strokeWidth={2.4} strokeLinecap="round"><path d="M1.5 5.5l3 3 5-5" /></svg>
                                        </div>
                                    ) : (
                                        <div style={{ width: 22, height: 22, borderRadius: '50%', border: '1.5px solid #CBD5E1', background: '#fff' }} />
                                    )}
                                </div>
                            </button>
                        )
                    })}
                </div>
            </div>

            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {coach === 'teach-me' && activeMilestone && (
                    <WsTeachMe
                        roadmapId={roadmapId} milestoneId={activeMilestone.id} taskIndex={openTask ?? 0}
                        milestoneTitle={activeMilestone.title} task={activeMilestone.tasks[openTask ?? 0]}
                        cache={teachMeCache} onCache={(key, content) => setTeachMeCache(prev => ({ ...prev, [key]: content }))}
                        showReviewLink={activeMilestone.milestone_number === milestones.length}
                        onBack={() => setCoach(null)} onSwitch={setCoach}
                    />
                )}
                {coach === 'stuck' && activeMilestone && (
                    <WsStuck
                        roadmapId={roadmapId} milestoneId={activeMilestone.id} taskIndex={openTask ?? 0}
                        history={stuckHistory} onHistoryChange={(key, turns) => setStuckHistory(prev => ({ ...prev, [key]: turns }))}
                        showReviewLink={activeMilestone.milestone_number === milestones.length}
                        onBack={() => setCoach(null)} onSwitch={setCoach}
                    />
                )}
                {coach === 'review' && activeMilestone && (
                    <WsReview
                        roadmapId={roadmapId} milestoneId={activeMilestone.id}
                        canReview={allRequiredChecked(activeMilestone, checklistByMilestone[msIdx] ?? [])}
                        initialGithubUrl={activeMilestone.progress?.github_url ?? ''}
                        onBack={() => setCoach(null)} onSwitch={setCoach}
                        onPassed={handleMilestonePassed}
                    />
                )}
                {coach === null && view === 'overview' && (
                    <WsOverview roadmap={roadmap} milestones={milestones} onStart={handleStart}
                        onSelectMilestone={(i) => !milestones[i].locked && goMilestone(i)} />
                )}
                {coach === null && view === 'ms' && activeMilestone && (
                    <WsMilestoneDetail
                        key={msIdx}
                        milestone={activeMilestone}
                        checklistState={checklistByMilestone[msIdx] ?? []}
                        onToggleChecklistItem={(flatIdx) => toggleChecklistItem(msIdx, flatIdx)}
                        openTask={openTask}
                        onToggleOpenTask={(i) => setOpenTask(cur => cur === i ? null : i)}
                        onOpenCoach={setCoach}
                        isLastMilestone={activeMilestone.milestone_number === milestones.length}
                        canContinue={allRequiredChecked(activeMilestone, checklistByMilestone[msIdx] ?? [])}
                        continuing={continuing}
                        onContinue={handleSimpleContinue}
                    />
                )}
            </div>
        </div>
    )
}

type LibFilter = 'all' | 'inprogress' | 'complete' | 'new'

function LearningHistoryIndex({ summaries }: { summaries: LearningPathSummary[] }) {
    const [filter, setFilter] = useState<LibFilter>('all')
    const [visible, setVisible] = useState(false)
    const [section, setSection] = useState<'skills' | 'projects'>('skills')
    const [activeRoadmapId, setActiveRoadmapId] = useState<string | null>(null)
    const [projectCount, setProjectCount] = useState(0)
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

    if (activeRoadmapId) {
        return <MilestoneWorkspace roadmapId={activeRoadmapId} onBack={() => setActiveRoadmapId(null)} />
    }

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
                    <h1 className="lib-h1">
                        {section === 'skills' ? 'Your learning paths' : 'Your projects'}
                    </h1>
                    <p className="lib-sub">
                        {section === 'skills'
                            ? (total === 0
                                ? 'No learning paths yet. Generate one from AI Matches.'
                                : (<>You&rsquo;ve generated <b>{total} learning path{total !== 1 ? 's' : ''}</b>. Pick one to resume.</>))
                            : 'Build real projects to close skill gaps — each one generates a GitHub-ready portfolio artifact.'
                        }
                    </p>
                </header>

                {/* ── Section tabs ── */}
                <div className="lib-section-tabs" role="tablist">
                    <button
                        role="tab"
                        aria-selected={section === 'skills'}
                        className={'lib-section-tab' + (section === 'skills' ? ' active' : '')}
                        onClick={() => setSection('skills')}
                    >
                        Skills
                        <span className="lib-section-tab-badge">{total}</span>
                    </button>
                    <button
                        role="tab"
                        aria-selected={section === 'projects'}
                        className={'lib-section-tab' + (section === 'projects' ? ' active' : '')}
                        onClick={() => setSection('projects')}
                    >
                        Projects
                        <span className="lib-section-tab-badge">{projectCount}</span>
                    </button>
                </div>

                {/* ── Skills content ── */}
                {section === 'skills' && (<>
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
                </>)}

                {/* ── Projects content ── */}
                {section === 'projects' && <ProjectsSection onOpen={setActiveRoadmapId} onCount={setProjectCount} />}

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

/* ─── Projects section ───────────────────────────────────────── */
/** Joins a build-plan project with its roadmap (if one has been generated yet). */
type ProjectEntry = { key: string; summary: BuildPlanProjectSummary; roadmap: ProjectRoadmapSummary | null }

function ProjectsSection({ onOpen, onCount }: { onOpen: (roadmapId: string) => void; onCount: (n: number) => void }) {
    const { user } = useAuth()
    const [entries, setEntries] = useState<ProjectEntry[] | null>(null)
    const [generating, setGenerating] = useState<Record<string, boolean>>({})
    const [genError, setGenError] = useState<Record<string, string>>({})

    useEffect(() => {
        if (!user?.id) return
        let cancelled = false
        Promise.all([fetchBuildPlanProjectSummaries(user.id), fetchProjectRoadmaps()]).then(([summaries, roadmaps]) => {
            if (cancelled) return
            const joined = summaries.map(summary => {
                const roadmap = roadmaps.find(r =>
                    r.resume_id === summary.resume_id && r.job_id === summary.job_id && r.build_plan_project_id === summary.build_plan_project_id
                ) ?? null
                return { key: `${summary.resume_id}:${summary.job_id}:${summary.build_plan_project_id}`, summary, roadmap }
            })
            setEntries(joined)
            onCount(joined.length)
        }).catch(() => { if (!cancelled) { setEntries([]); onCount(0) } })
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id])

    const handleGetRoadmap = async (entry: ProjectEntry) => {
        setGenerating(g => ({ ...g, [entry.key]: true }))
        setGenError(e => ({ ...e, [entry.key]: '' }))
        try {
            const res = await generateProjectRoadmap({
                resume_id: entry.summary.resume_id,
                job_id: entry.summary.job_id,
                build_plan_project_id: entry.summary.build_plan_project_id,
            })
            if (res.success && res.roadmap_id) {
                onOpen(res.roadmap_id)
            } else {
                setGenError(e => ({ ...e, [entry.key]: res.error || 'Failed to generate roadmap' }))
            }
        } catch (err) {
            setGenError(e => ({ ...e, [entry.key]: err instanceof Error ? err.message : 'Failed to generate roadmap' }))
        } finally {
            setGenerating(g => ({ ...g, [entry.key]: false }))
        }
    }

    if (entries === null) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
                <div style={{ width: 24, height: 24, border: `2px solid ${T.line2}`, borderTopColor: T.blue, borderRadius: '50%', animation: 'lp-spin 0.8s linear infinite' }} />
            </div>
        )
    }

    if (entries.length === 0) {
        return (
            <div className="lib-empty">
                <div className="lib-empty-icon">
                    <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 3l1.8 4.6L18 9.4l-4.2 1.8L12 16l-1.8-4.8L6 9.4l4.2-1.8z" />
                        <path d="M19 14l.9 2.3L22 17l-2.1.7L19 20l-.9-2.3L16 17l2.1-.7z" />
                    </svg>
                </div>
                <div className="lib-empty-h">No projects yet</div>
                <p className="lib-empty-sub">Score a job in AI Matches and generate a Build Plan to see project recommendations here.</p>
                <Link className="lib-empty-cta" href="/dashboard/matches">
                    Go to AI Matches
                </Link>
            </div>
        )
    }

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 24 }}>
                <p style={{ fontSize: '.8125rem', color: T.muted, margin: 0, fontWeight: 500 }}>
                    Build real projects to close skill gaps and prove it to recruiters.
                </p>
                <span style={{ fontSize: '.8125rem', color: T.muted, fontWeight: 500, whiteSpace: 'nowrap' }}>
                    {entries.length} project{entries.length !== 1 ? 's' : ''}
                </span>
            </div>

            <div className="lib-proj-grid">
                {entries.map(entry => {
                    const { summary, roadmap } = entry
                    const p = summary.project
                    const isGenerating = !!generating[entry.key]
                    const error = genError[entry.key]
                    const totalMilestones = roadmap?.milestone_score_curve?.length ?? null
                    const status = roadmap?.status ?? 'not_started'
                    const badgeLabel = status === 'completed' ? 'Completed' : status === 'in_progress' ? 'In progress' : 'Not started'
                    const badgeClass = status === 'completed' ? 'lib-proj-badge-done' : status === 'in_progress' ? 'lib-proj-badge-ip' : 'lib-proj-badge-ns'

                    return (
                        <div key={entry.key} className="lib-proj-card">
                            <div className="lib-proj-header">
                                <div className="lib-proj-meta">
                                    <span className={`lib-proj-badge ${badgeClass}`}>{badgeLabel}</span>
                                    <span className="lib-proj-impact">
                                        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                                            <polyline points="16 7 22 7 22 13" />
                                        </svg>
                                        +{p.impact_pct}% match score
                                    </span>
                                </div>
                                <h3 className="lib-proj-title">{p.name}</h3>
                                <p className="lib-proj-desc">{p.description}</p>
                                <div style={{ fontSize: 11, color: T.muted2, marginTop: 4 }}>{summary.job_title} · {summary.company_name}</div>
                            </div>

                            <div className="lib-proj-tech">
                                {p.tech.map(t => (
                                    <span key={t} className="lib-proj-chip">{t}</span>
                                ))}
                            </div>

                            <div className="lib-proj-foot">
                                <div className="lib-proj-stats">
                                    {roadmap?.estimated_weeks != null && (
                                        <span className="lib-proj-stat">
                                            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                                <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                                            </svg>
                                            {roadmap.estimated_weeks} weeks
                                        </span>
                                    )}
                                    {roadmap?.difficulty && (
                                        <span className="lib-proj-stat">
                                            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                            </svg>
                                            {roadmap.difficulty.charAt(0).toUpperCase() + roadmap.difficulty.slice(1)}
                                        </span>
                                    )}
                                    {totalMilestones != null && (
                                        <span className="lib-proj-stat">
                                            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                                            </svg>
                                            {status === 'not_started' ? totalMilestones : `${roadmap!.current_milestone}/${totalMilestones}`} milestones
                                        </span>
                                    )}
                                </div>
                                <button className="lib-proj-cta" type="button" disabled={isGenerating}
                                    onClick={() => roadmap ? onOpen(roadmap.id) : handleGetRoadmap(entry)}>
                                    {isGenerating ? 'Generating…' : roadmap
                                        ? (status === 'completed' ? '✓ View Project' : status === 'in_progress' ? `Continue Milestone ${roadmap.current_milestone}` : 'Open Roadmap')
                                        : 'Get Roadmap'}
                                    {!isGenerating && (
                                        <span className="lib-proj-cta-arrow">
                                            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M7 17L17 7M7 7h10v10" />
                                            </svg>
                                        </span>
                                    )}
                                </button>
                            </div>
                            {error && <div style={{ padding: '0 20px 16px', fontSize: 12, color: T.redText }}>{error}</div>}
                        </div>
                    )
                })}
            </div>
        </div>
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

            /* Section tabs (Skills / Projects) */
            .lib-section-tabs {
                display: flex; gap: 0;
                border-bottom: 2px solid ${T.line2};
                margin-bottom: 32px; margin-top: -8px;
            }
            .lib-section-tab {
                font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
                font-size: .9375rem; font-weight: 700;
                color: ${T.muted}; padding: 0 24px 14px 0;
                border: none; border-bottom: 2px solid transparent;
                background: none; cursor: pointer;
                transition: color .15s, border-color .15s;
                margin-bottom: -2px;
                display: inline-flex; align-items: center; gap: 8px;
                letter-spacing: -.01em;
            }
            .lib-section-tab + .lib-section-tab { padding-left: 0; }
            .lib-section-tab.active { color: ${T.ink}; border-bottom-color: ${T.blue}; }
            .lib-section-tab:hover:not(.active) { color: ${T.ink2}; }
            .lib-section-tab-badge {
                font-size: .6rem; font-weight: 800; letter-spacing: .08em;
                text-transform: uppercase; padding: 2px 7px; border-radius: 99px;
                background: ${T.line2}; color: ${T.muted};
                transition: background .15s, color .15s;
            }
            .lib-section-tab.active .lib-section-tab-badge {
                background: ${T.blueLight}; color: ${T.blue};
            }

            /* Project cards */
            .lib-proj-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
                gap: 18px;
            }
            .lib-proj-card {
                background: #fff; border: 1px solid ${T.line};
                border-radius: 14px; overflow: hidden;
                display: flex; flex-direction: column;
                cursor: pointer; text-decoration: none; color: ${T.ink};
                transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
            }
            .lib-proj-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 20px 40px -12px rgba(15,23,42,.1), 0 8px 16px -8px rgba(15,23,42,.05);
                border-color: #BFDBFE;
            }
            .lib-proj-card:hover .lib-proj-cta-arrow { transform: translateX(2px); }
            .lib-proj-header {
                padding: 22px 24px 18px;
                border-bottom: 1px solid ${T.line2};
            }
            .lib-proj-meta {
                display: flex; align-items: center; gap: 8px;
                margin-bottom: 10px;
            }
            .lib-proj-badge {
                font-size: .6rem; font-weight: 800; letter-spacing: .1em;
                text-transform: uppercase; padding: 3px 9px; border-radius: 99px;
            }
            .lib-proj-badge-ns { background: #F1F5F9; color: ${T.muted}; }
            .lib-proj-badge-ip { background: ${T.blueLight}; color: ${T.blue}; }
            .lib-proj-badge-done { background: ${T.greenBg}; color: ${T.green}; }
            .lib-proj-impact {
                margin-left: auto;
                font-size: .75rem; font-weight: 700; color: ${T.green};
                display: inline-flex; align-items: center; gap: 4px;
            }
            .lib-proj-title {
                font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
                font-size: 1.125rem; font-weight: 700;
                color: ${T.ink}; letter-spacing: -.025em; line-height: 1.3;
                margin: 0 0 8px;
            }
            .lib-proj-desc {
                font-size: .8125rem; color: ${T.muted}; line-height: 1.55;
                margin: 0;
                display: -webkit-box; -webkit-line-clamp: 2;
                -webkit-box-orient: vertical; overflow: hidden;
            }
            .lib-proj-tech {
                padding: 14px 24px 16px;
                border-bottom: 1px solid ${T.line2};
                display: flex; gap: 6px; flex-wrap: wrap;
            }
            .lib-proj-chip {
                font-size: .6875rem; font-weight: 700;
                padding: 3px 10px; border-radius: 99px;
                background: ${T.blue50}; color: ${T.blue700};
                border: 1px solid ${T.blueLight};
                letter-spacing: .01em;
            }
            .lib-proj-foot {
                padding: 14px 24px;
                display: flex; align-items: center; justify-content: space-between;
                flex-wrap: wrap;
                row-gap: 8px; column-gap: 12px;
                background: #F8FAFD;
            }
            .lib-proj-stats {
                display: flex; align-items: center; flex-wrap: wrap;
                gap: 4px 14px;
                min-width: 0;
            }
            .lib-proj-stat {
                font-size: .75rem; color: ${T.muted}; font-weight: 500;
                display: inline-flex; align-items: center; gap: 5px;
                white-space: nowrap;
            }
            .lib-proj-cta {
                font-size: .8125rem; font-weight: 700;
                color: ${T.blue};
                display: inline-flex; align-items: center; gap: 5px;
                background: none; border: none; cursor: pointer;
                padding: 0; font-family: inherit;
                white-space: nowrap; flex-shrink: 0; margin-left: auto;
                transition: color .15s;
            }
            .lib-proj-cta:hover { color: ${T.blue600}; }
            .lib-proj-cta-arrow { transition: transform .18s ease; display: inline-flex; }

            /* Responsive */
            @media (max-width: 720px) {
                .lib-shell { padding: 32px 20px 64px; }
                .lib-h1 { font-size: 2rem; }
                .lib-count { margin-left: 0; width: 100%; }
                .lib-proj-grid { grid-template-columns: 1fr; }
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
    const libProgress = useLibraryProgress(summaries)

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
                <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: T.bgAlt, minHeight: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
                    {/* Header */}
                    <div style={{ background: '#fff', borderBottom: `1px solid ${T.line}`, padding: '18px 14px 14px', flexShrink: 0 }}>
                        <div style={{ fontFamily: 'var(--font-mono,monospace)', fontSize: 9, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase' as const, color: T.muted2, marginBottom: 5 }}>LEARNING PATHS</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: T.ink, letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: 2 }}>My Learning Paths</div>
                        <div style={{ fontSize: '12.5px', color: T.muted }}>{summaries.length} path{summaries.length !== 1 ? 's' : ''} · tap one to view your skill gaps</div>
                    </div>
                    {/* Cards */}
                    <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 80 }}>
                        {summaries.map(s => {
                            const spct = libProgress[s.job_id] ?? 0
                            const sRingColor = spct < 20 ? '#dc2626' : spct < 60 ? '#f59e0b' : T.blue
                            const sCirc = 88
                            const sOffset = sCirc - (sCirc * spct / 100)
                            return (
                                <div key={s.job_id} className="mob-lib-card" onClick={() => router.push(`/dashboard/learning?jobId=${s.job_id}`)} style={{ padding: 14, borderBottom: '1px solid #eef2f7', background: '#fff', cursor: 'pointer', transition: 'background 0.12s' }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
                                        {/* Left */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontFamily: 'var(--font-mono,monospace)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: T.muted2, marginBottom: 4 }}>{s.job?.company ?? 'Unknown'}</div>
                                            <div style={{ fontSize: 15, fontWeight: 800, color: T.ink, letterSpacing: '-0.02em', marginBottom: 8, lineHeight: 1.25 }}>{s.job?.title ?? 'Untitled role'}</div>
                                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 99, background: '#f1f5f9', border: `1px solid ${T.line}`, fontSize: 11, fontWeight: 600, color: T.muted }}>
                                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                                                    {s.skill_count} skill{s.skill_count !== 1 ? 's' : ''}
                                                </span>
                                                {s.critical_count > 0 && (
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 99, background: T.redBg, border: '1px solid #fca5a5', fontSize: 11, fontWeight: 700, color: '#dc2626' }}>
                                                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#dc2626', display: 'inline-block' }} />{s.critical_count} critical
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        {/* Right: progress ring */}
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                                            <div style={{ position: 'relative', width: 38, height: 38 }}>
                                                <svg width="38" height="38" viewBox="0 0 38 38">
                                                    <circle cx="19" cy="19" r="14" fill="none" stroke="#e2e8f0" strokeWidth="3.5"/>
                                                    <circle cx="19" cy="19" r="14" fill="none" stroke={sRingColor} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={String(sCirc)} strokeDashoffset={String(sOffset)} transform="rotate(-90 19 19)"/>
                                                </svg>
                                                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono,monospace)', fontSize: 11, fontWeight: 800, color: sRingColor }}>{Math.round(spct)}</div>
                                            </div>
                                            <div style={{ fontFamily: 'var(--font-mono,monospace)', fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: T.muted2 }}>done</div>
                                        </div>
                                    </div>
                                    {/* Bottom progress bar */}
                                    <div style={{ marginTop: 10, height: 3, borderRadius: 99, background: '#f1f5f9', overflow: 'hidden' }}>
                                        <div style={{ width: `${spct}%`, height: '100%', background: sRingColor, borderRadius: 99 }} />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                    {/* Sticky footer */}
                    <div style={{ position: 'sticky', bottom: 0, background: '#fff', borderTop: `1px solid ${T.line}`, padding: '11px 14px 16px', flexShrink: 0 }}>
                        <button onClick={() => router.push('/dashboard/matches')} style={{ width: '100%', padding: '12px 0', background: '#135bec', color: '#fff', border: 'none', borderRadius: 10, fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: '0 4px 14px -4px rgba(19,91,236,0.4)' }}>
                            <Icon.Sparkles width={13} height={13} />Generate New Path
                        </button>
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

                {/* ── Gaps bar (2-row) ── */}
                <div style={{ background: '#fff', borderBottom: `1px solid ${T.line}`, padding: '11px 13px 10px', flexShrink: 0 }}>
                    {/* Row 1: breadcrumb */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'nowrap' as const, overflow: 'hidden' }}>
                        <button onClick={() => router.push('/dashboard/learning')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: T.muted, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, flexShrink: 0 }}>
                            <Icon.ArrowLeft />Learning Paths
                        </button>
                        <div style={{ width: 1, height: 16, background: T.line, flexShrink: 0 }} />
                        {job?.company && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 99, background: T.blue50, border: `1px solid ${T.blueLight}`, fontSize: '11.5px', fontWeight: 700, color: T.blue, flexShrink: 0, overflow: 'hidden', maxWidth: 140, textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                                <Icon.Building style={{ color: T.blue, flexShrink: 0 }} />{job.company}
                            </span>
                        )}
                        {mLibCount > 0 && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 99, background: '#f0fdf4', border: '1px solid #bbf7d0', fontFamily: 'var(--font-mono,monospace)', fontSize: 9, fontWeight: 700, color: '#15803d', flexShrink: 0, whiteSpace: 'nowrap' as const }}>
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                                {mLibCount} saved
                            </span>
                        )}
                    </div>
                    {/* Row 2: title + regenerate */}
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: T.ink, letterSpacing: '-0.02em', flex: 1 }}>Your Skill Gaps</div>
                        <button onClick={handleGenerate} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 8, border: `1.5px solid ${T.line}`, background: '#fff', fontSize: 11, fontWeight: 700, color: T.muted, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                            <Icon.Refresh width={11} height={11} />Regenerate
                        </button>
                    </div>
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
