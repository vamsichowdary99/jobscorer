'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useAuth } from '@/components/providers/AuthProvider'
import {
    fetchDashboardStats,
    fetchMatches,
    fetchResearchHistory,
    fetchAllOptimizedResumes,
    fetchResumes,
    fetchApplicationPipelineCounts,
    type DashboardStats,
    type DashboardActivityEvent,
    type ApplicationPipelineCounts,
} from '@/lib/api'
import type { Job, UserJobMatch } from '@/lib/types'

type FullMatch = UserJobMatch & { job: Job }

const TIPS = [
    'Companies hire fastest on Tuesdays — apply early in the week.',
    'A tailored resume gets 3× more interview callbacks than a generic one.',
    'Researching a company before applying makes you 40% more likely to land an interview.',
    'Skills that appear in 5+ job descriptions are your biggest leverage points.',
    'Apply within 48 hours of a posting going live — recruiters review newest applications first.',
]

function timeOfDayGreeting() {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
}

function relativeTime(iso: string | null | undefined) {
    if (!iso) return 'recently'
    const t = new Date(iso).getTime()
    if (!Number.isFinite(t)) return 'recently'
    const diff = Date.now() - t
    if (diff < 0) return 'just now'
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    const d = Math.floor(h / 24)
    if (d < 7) return `${d}d ago`
    const w = Math.floor(d / 7)
    return `${w}w ago`
}

function firstInitial(s: string | null | undefined) {
    return (s ?? 'U').trim()[0]?.toUpperCase() ?? 'U'
}

function companyGradient(name: string | null | undefined) {
    const palettes = [
        ['#135bec', '#0f4cc7'],
        ['#16a34a', '#15803d'],
        ['#d97706', '#c2410c'],
        ['#7c3aed', '#5b21b6'],
        ['#0891b2', '#155e75'],
        ['#f59e0b', '#d97706'],
        ['#dc2626', '#991b1b'],
    ]
    const key = (name ?? 'U')
    let h = 0
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
    const [a, b] = palettes[h % palettes.length]
    return `linear-gradient(135deg, ${a}, ${b})`
}

function scoreTier(score: number) {
    if (score >= 90) return { label: 'EXCELLENT', color: '#16a34a' }
    if (score >= 75) return { label: 'STRONG', color: '#135bec' }
    if (score >= 60) return { label: 'GOOD', color: '#d97706' }
    return { label: 'LOW', color: '#94a3b8' }
}

function ScoreRing({ score, size = 44 }: { score: number; size?: number }) {
    const tier = scoreTier(score)
    const r = (size - 8) / 2
    const c = 2 * Math.PI * r
    const offset = c * (1 - Math.min(100, Math.max(0, score)) / 100)
    return (
        <div style={{ position: 'relative', width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={4} />
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tier.color} strokeWidth={4}
                    strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`} />
            </svg>
            <div style={{
                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 800, color: tier.color,
            }}>{score}</div>
        </div>
    )
}

export default function DashboardHomePage() {
    const { user } = useAuth()
    const [stats, setStats] = useState<DashboardStats | null>(null)
    const [topMatches, setTopMatches] = useState<FullMatch[]>([])
    const [pipeline, setPipeline] = useState<{ company_name: string; job_title: string | null; researched_at: string }[]>([])
    const [resumes, setResumes] = useState<{ name: string; jobTitle: string; updatedAt: string }[]>([])
    const [hasResume, setHasResume] = useState<boolean | null>(null)
    const [appCounts, setAppCounts] = useState<ApplicationPipelineCounts | null>(null)
    const [loading, setLoading] = useState(true)
    const [tipIdx, setTipIdx] = useState(0)
    const [nudgeDismissed, setNudgeDismissed] = useState(false)
    const [greeting, setGreeting] = useState('Hello')

    // Randomize the tip and compute time-aware greeting only on the client to
    // avoid SSR hydration mismatch (random + clock-hour differ between renders).
    useEffect(() => {
        setTipIdx(Math.floor(Math.random() * TIPS.length))
        setGreeting(timeOfDayGreeting())
    }, [])

    useEffect(() => {
        if (!user?.id) return
        let cancelled = false
        ;(async () => {
            setLoading(true)
            // Fetch the rich data first, then derive stats from it so
            // fetchDashboardStats doesn't re-query the same tables.
            const [matchesRes, researchRes, optimizedRes, resumesRes, appCountsRes] = await Promise.all([
                fetchMatches(user.id),
                fetchResearchHistory(user.id, null),
                fetchAllOptimizedResumes(user.id),
                fetchResumes(user.id),
                fetchApplicationPipelineCounts(user.id),
            ])
            if (cancelled) return
            const statsRes = await fetchDashboardStats(user.id, {
                matches: matchesRes.map(m => ({
                    relevance_score: m.relevance_score ?? null,
                    missing_skills: (m.missing_skills as string[] | null) ?? null,
                    created_at: m.created_at,
                })),
                optimized: optimizedRes.map((r: any) => ({
                    id: r.id, job_id: r.job_id, updated_at: r.updated_at, optimized_data: r.optimized_data,
                })),
                research: researchRes.map(r => ({
                    id: r.analysis_id, company_name: r.company_name, created_at: r.researched_at,
                })),
            })
            if (cancelled) return
            setStats(statsRes)
            setTopMatches(matchesRes.slice(0, 3))
            setPipeline(researchRes.slice(0, 3).map(r => ({
                company_name: r.company_name,
                job_title: r.job_title,
                researched_at: r.researched_at,
            })))
            setResumes(optimizedRes.slice(0, 3).map((r: any) => ({
                name: `${(user.email?.split('@')[0] ?? 'resume')}_${(r.job?.company ?? 'role').toLowerCase().replace(/\s+/g, '_')}.pdf`,
                jobTitle: r.job?.title ? `for ${r.job.title}` : 'tailored resume',
                updatedAt: r.updated_at,
            })))
            setHasResume(resumesRes.length > 0)
            setAppCounts(appCountsRes)
            setLoading(false)
        })()
        return () => { cancelled = true }
    }, [user?.id])

    // ── New user empty state ── //
    if (hasResume === false) {
        return (
            <div style={{ maxWidth: 720, margin: '40px auto', padding: 32 }}>
                <div style={{
                    background: 'linear-gradient(135deg, #ffffff 0%, #eff6ff 100%)',
                    border: '1px solid #e2e8f0', borderRadius: 16, padding: '48px 40px',
                    textAlign: 'center', boxShadow: '0 4px 16px rgba(15,23,42,0.05)',
                }}>
                    <div style={{
                        width: 80, height: 80, borderRadius: '50%', background: '#eff6ff',
                        display: 'grid', placeItems: 'center', fontSize: 38, margin: '0 auto 20px',
                    }}>📄</div>
                    <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', marginBottom: 8, letterSpacing: '-0.02em' }}>
                        Welcome to JobScorer, {user?.email?.split('@')[0] ?? 'there'} 🎉
                    </h1>
                    <p style={{ fontSize: 14, color: '#475569', marginBottom: 24, maxWidth: 420, margin: '0 auto 24px' }}>
                        Upload your resume in 30 seconds to start finding matches tailored to your profile.
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
                        <Step icon="✅" label="Sign up" done />
                        <Step icon="⏳" label="Upload resume" />
                        <Step icon="⚪" label="Get matches" />
                    </div>
                    <Link href="/dashboard/upload" style={S.primaryCta}>📄 Upload Resume</Link>
                </div>
            </div>
        )
    }

    const isLoading = loading || stats === null
    const showNudge = !nudgeDismissed && stats !== null && stats.strongMatchesThisWeek > 0
    const displayName = user?.email?.split('@')[0] ?? 'there'
    const resumeScore = stats?.resumeScore ?? null
    const activeDays = stats?.activeDaysThisWeek ?? 0

    return (
        <div style={S.page}>
            {/* ── GREETING BAR ── */}
            <div style={S.greetingBar} className="rs-fade-in">
                <div style={{ flex: 1 }}>
                    <div style={S.eyebrow}>DASHBOARD</div>
                    <h1 style={S.greetingHeadline}>
                        {greeting}, {displayName} <span style={{ display: 'inline-block', transform: 'rotate(-8deg)' }}>👋</span>
                    </h1>
                    <p style={S.greetingSub}>
                        {isLoading
                            ? 'Loading your career intelligence…'
                            : stats!.strongMatchesThisWeek > 0
                                ? <>You have <b style={{ color: '#0f172a' }}>{stats!.strongMatchesThisWeek} strong match{stats!.strongMatchesThisWeek === 1 ? '' : 'es'}</b> above 80% this week</>
                                : stats!.totalMatches > 0
                                    ? <>You have <b style={{ color: '#0f172a' }}>{stats!.totalMatches} match{stats!.totalMatches === 1 ? '' : 'es'}</b> across all jobs scored</>
                                    : 'Search jobs and run AI scoring to see your matches here.'}
                    </p>
                </div>
                <div style={S.streakBox}>
                    <div style={S.streakEyebrow}>WEEKLY STREAK</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {Array.from({ length: 7 }).map((_, i) => (
                            <div key={i} style={{
                                width: 10, height: 10, borderRadius: '50%',
                                background: i < activeDays ? '#135bec' : '#cbd5e1',
                            }} />
                        ))}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#1e3a8a' }}>
                        {activeDays} day{activeDays === 1 ? '' : 's'} active this week
                    </div>
                    <div style={{ fontSize: 11, color: '#475569' }}>
                        {activeDays >= 4 ? 'Keep going 🔥' : activeDays >= 1 ? 'Build the habit' : 'Start your streak'}
                    </div>
                </div>
            </div>

            {/* ── STAT TILES ── */}
            <div style={S.statGrid} className="rs-fade-in" data-delay="0.1">
                <StatTile
                    icon="📊" label="RESUME SCORE"
                    number={resumeScore !== null ? String(resumeScore) : '—'}
                    suffix={resumeScore !== null ? '/100' : undefined}
                    delta={resumeScore !== null && resumeScore >= 75 ? { text: 'Strong fit', color: '#16a34a' } : undefined}
                    href="/dashboard/upload"
                />
                <StatTile
                    icon="🎯" label="AI MATCHES"
                    number={String(stats?.totalMatches ?? 0)}
                    delta={(stats?.strongMatchesThisWeek ?? 0) > 0
                        ? { text: `↑ ${stats!.strongMatchesThisWeek} strong this week`, color: '#16a34a' }
                        : undefined}
                    href="/dashboard/matches"
                />
                <StatTile
                    icon="📨" label="APPLICATIONS"
                    number={String(appCounts?.total ?? 0)}
                    delta={appCounts && appCounts.total > 0
                        ? { text: `${appCounts.applied} awaiting response`, color: '#64748b' }
                        : { text: 'Start tracking', color: '#94a3b8' }}
                    href="/dashboard/applications"
                />
                <StatTile
                    icon="🏆" label="INTERVIEW CALLBACKS"
                    number={String((appCounts?.interview ?? 0) + (appCounts?.offer ?? 0))}
                    delta={appCounts && (appCounts.interview + appCounts.offer) > 0
                        ? { text: appCounts.offer > 0 ? `${appCounts.offer} offer${appCounts.offer === 1 ? '' : 's'} 🎉` : 'keep going', color: '#d97706' }
                        : { text: 'no callbacks yet', color: '#d97706' }}
                    href="/dashboard/applications"
                    isNorthStar
                />
            </div>

            {/* ── SMART NUDGE ── */}
            {showNudge && (
                <div style={S.nudge}>
                    <div style={{ fontSize: 18 }}>💡</div>
                    <div style={{ flex: 1, fontSize: 14, color: '#1e3a8a', fontWeight: 500 }}>
                        {stats!.strongMatchesThisWeek} strong match{stats!.strongMatchesThisWeek === 1 ? '' : 'es'} this week — tailor your resume to apply faster
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Link href="/dashboard/matches" style={S.nudgeBtn}>Review matches →</Link>
                        <button onClick={() => setNudgeDismissed(true)} style={S.nudgeDismiss}>Dismiss ×</button>
                    </div>
                </div>
            )}

            {/* ── BODY GRID ── */}
            <div style={S.bodyGrid}>

                {/* ─── MAIN COLUMN ─── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>

                    {/* TOP MATCHES */}
                    <div style={S.card}>
                        <div style={S.cardHeader}>
                            <div style={S.cardTitle}>🎯 Top Matches Today</div>
                            {stats && stats.totalMatches > 0 && (
                                <Link href="/dashboard/matches" style={S.cardLink}>View all {stats.totalMatches} →</Link>
                            )}
                        </div>
                        {isLoading ? <Skeleton lines={3} height={86} />
                            : topMatches.length === 0
                                ? <EmptyState icon="🎯" label="No matches yet. Run AI scoring on your jobs." href="/dashboard/search" cta="Search jobs →" />
                                : topMatches.map(m => <MatchRow key={m.id} match={m} />)}
                    </div>

                    {/* APPLICATION PIPELINE (Wave 2 — live data from `applications` table) */}
                    <div style={S.card}>
                        <div style={S.cardHeader}>
                            <div style={S.cardTitle}>📋 Application Pipeline</div>
                            <Link href="/dashboard/applications" style={S.cardLink}>View tracker →</Link>
                        </div>
                        {(() => {
                            const c = appCounts ?? { applied: 0, interview: 0, offer: 0, rejected: 0, withdrawn: 0, total: 0 }
                            const maxStage = Math.max(c.applied, c.interview, c.offer, c.rejected, 1)
                            return (
                                <>
                                    <div style={S.pipelineGrid}>
                                        <PipelineStage label="APPLIED" number={c.applied} barColor="#135bec" barWidth={(c.applied / maxStage) * 100} />
                                        <PipelineStage label="INTERVIEW" number={c.interview} barColor="#16a34a" barWidth={(c.interview / maxStage) * 100} />
                                        <PipelineStage label="OFFER" number={c.offer} barColor="#d97706" barWidth={(c.offer / maxStage) * 100} />
                                        <PipelineStage label="REJECTED" number={c.rejected} barColor="#94a3b8" barWidth={(c.rejected / maxStage) * 100} muted={c.rejected === 0} />
                                    </div>
                                    {c.total === 0 && (
                                        <EmptyState
                                            icon="📋"
                                            label="Start tracking applications — open the tracker to add your first one or import from your AI matches."
                                            href="/dashboard/applications"
                                            cta="Open tracker →"
                                            compact
                                        />
                                    )}
                                </>
                            )
                        })()}
                    </div>

                    {/* SKILL GAPS + QUICK ACTIONS */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div style={S.card}>
                            <div style={S.cardHeader}>
                                <div style={S.cardTitle}>📊 Skill Gaps</div>
                            </div>
                            <p style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>What&apos;s holding you back</p>
                            {isLoading ? <Skeleton lines={3} height={22} />
                                : (stats?.topGaps ?? []).length === 0
                                    ? <EmptyState icon="📊" label="Score some jobs to see your gaps" href="/dashboard/search" cta="Search jobs →" compact />
                                    : (
                                        <>
                                            {stats!.topGaps.map(g => <SkillRow key={g.skill} skill={g.skill} count={g.jobCount} max={stats!.topGaps[0].jobCount} />)}
                                            <div style={S.insightBox}>
                                                <div style={{ fontSize: 16, flexShrink: 0 }}>💡</div>
                                                <div style={{ fontSize: 13, color: '#1e3a8a', lineHeight: 1.5 }}>
                                                    Learning <b>{stats!.topGaps[0].skill}</b> would unlock <b>{stats!.topGaps[0].jobCount} more strong matches</b>
                                                </div>
                                            </div>
                                            <Link href="/dashboard/learning" style={{ ...S.btnOutline, width: '100%', marginTop: 12, justifyContent: 'center', boxSizing: 'border-box' }}>
                                                View Learning Path →
                                            </Link>
                                        </>
                                    )}
                        </div>

                        <div style={S.card}>
                            <div style={S.cardHeader}>
                                <div style={S.cardTitle}>⚡ Quick Actions</div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <ActionTile icon="🔍" label="Search Jobs" sub="Find your next role"
                                    context={stats ? `${stats.totalMatches} matches scored` : ''} href="/dashboard/search" />
                                <ActionTile icon="📝" label="Tailor Resume" sub="For a specific job"
                                    context={stats?.optimizedResumesCount ? `${stats.optimizedResumesCount} tailored` : 'None yet'} href="/dashboard/optimize" />
                                <ActionTile icon="🏢" label="Research Company" sub="Before you apply"
                                    context={stats ? `${stats.companiesResearchedCount} researched` : ''} href="/dashboard/research" />
                                <ActionTile icon="💬" label="Career Coach" sub="Ask anything"
                                    context="Available 24/7" href="/dashboard/chat" />
                            </div>
                        </div>
                    </div>

                    {/* COMPANIES IN PIPELINE + TAILORED RESUMES */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div style={S.card}>
                            <div style={S.cardHeader}>
                                <div style={S.cardTitle}>🏢 Companies in Pipeline</div>
                                {pipeline.length > 0 && (
                                    <Link href="/dashboard/research" style={S.cardLink}>View all →</Link>
                                )}
                            </div>
                            {isLoading ? <Skeleton lines={3} height={48} />
                                : pipeline.length === 0
                                    ? <EmptyState icon="🏢" label="No company research yet" href="/dashboard/research" cta="Research a company →" compact />
                                    : pipeline.map(p => (
                                        <div key={p.company_name + p.researched_at} style={S.itemRow}>
                                            <div style={{ ...S.itemIcon, background: companyGradient(p.company_name) }}>{firstInitial(p.company_name)}</div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={S.itemName}>{p.company_name}</div>
                                                <div style={S.itemMeta}>{p.job_title ?? 'Research'}</div>
                                            </div>
                                            <div style={{ ...S.itemBadge, background: '#dbeafe', color: '#1d4ed8' }}>Researched</div>
                                            <div style={S.itemTime}>{relativeTime(p.researched_at)}</div>
                                        </div>
                                    ))}
                        </div>

                        <div style={S.card}>
                            <div style={S.cardHeader}>
                                <div style={S.cardTitle}>📄 Tailored Resumes</div>
                                {resumes.length > 0 && (
                                    <Link href="/dashboard/resumes" style={S.cardLink}>View all →</Link>
                                )}
                            </div>
                            {isLoading ? <Skeleton lines={3} height={48} />
                                : resumes.length === 0
                                    ? <EmptyState icon="📄" label="No tailored resumes yet" href="/dashboard/optimize" cta="Tailor a resume →" compact />
                                    : resumes.map(r => (
                                        <Link href="/dashboard/resumes" key={r.name + r.updatedAt} style={{ ...S.itemRow, textDecoration: 'none', color: 'inherit' }}>
                                            <div style={{ ...S.itemIcon, background: '#eff6ff', color: '#135bec', fontSize: 18 }}>📄</div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={S.itemName}>{r.name}</div>
                                                <div style={S.itemMeta}>{r.jobTitle}</div>
                                            </div>
                                            <div style={S.itemTime}>{relativeTime(r.updatedAt)}</div>
                                            <div style={S.iconBtn} title="Download">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                                            </div>
                                        </Link>
                                    ))}
                        </div>
                    </div>
                </div>

                {/* ─── SIDEBAR ─── */}
                <div style={S.sidebar}>
                    <div style={S.card}>
                        <div style={S.cardHeader}>
                            <div style={S.cardTitle}>📜 Recent Activity</div>
                        </div>
                        {isLoading ? <Skeleton lines={3} height={36} />
                            : (stats?.recentActivity ?? []).length === 0
                                ? <div style={{ fontSize: 12, color: '#94a3b8', padding: 8 }}>Your activity will appear here as you use the app.</div>
                                : <Timeline events={stats!.recentActivity} />}
                    </div>

                    <div style={S.tipCard}>
                        <div style={S.tipLabel}>💡 TIP</div>
                        <div style={S.tipText}>{TIPS[tipIdx]}</div>
                    </div>
                </div>
            </div>

            <style>{`
                .rs-fade-in { animation: rsFadeIn 0.4s ease both; }
                .rs-fade-in[data-delay="0.1"] { animation-delay: 0.1s; }
                @keyframes rsFadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                @media (max-width: 1024px) {
                    .rs-body-grid { grid-template-columns: 1fr !important; }
                    .rs-sidebar { position: static !important; }
                }
                @media (max-width: 768px) {
                    .rs-stat-grid { grid-template-columns: repeat(2, 1fr) !important; }
                    .rs-greeting-bar { flex-direction: column !important; align-items: flex-start !important; }
                }
            `}</style>
        </div>
    )
}

/* ── Sub-components ── */

function Step({ icon, label, done }: { icon: string; label: string; done?: boolean }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 99,
            background: done ? '#dcfce7' : '#f8fafc',
            border: `1px solid ${done ? '#bbf7d0' : '#e2e8f0'}`,
            fontSize: 12, fontWeight: 600,
            color: done ? '#166534' : '#64748b',
        }}>
            <span>{icon}</span>{label}
        </div>
    )
}

function StatTile({ icon, label, number, suffix, delta, href, isNorthStar }: {
    icon: string; label: string; number: string; suffix?: string
    delta?: { text: string; color: string }; href: string; isNorthStar?: boolean
}) {
    const [hover, setHover] = useState(false)
    const base: React.CSSProperties = {
        background: isNorthStar ? 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)' : '#fff',
        border: `1px solid ${isNorthStar ? '#fde68a' : '#e2e8f0'}`,
        borderRadius: 12, padding: 20,
        boxShadow: hover ? '0 4px 12px rgba(15,23,42,0.08)' : '0 1px 3px rgba(15,23,42,0.04)',
        position: 'relative', textDecoration: 'none', color: 'inherit', display: 'block',
        transform: hover ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'transform 0.2s, box-shadow 0.2s',
    }
    return (
        <Link href={href} style={base}
            onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
            {isNorthStar && (
                <>
                    <div style={S.northStarBadge}>⭐ NORTH STAR</div>
                    <div style={{ position: 'absolute', top: 12, right: 90, fontSize: 16 }}>✨</div>
                </>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 14, color: isNorthStar ? '#f59e0b' : '#135bec' }}>{icon}</span>
                <span style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    color: isNorthStar ? '#d97706' : '#94a3b8',
                }}>{label}</span>
            </div>
            <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 36, fontWeight: 800,
                color: isNorthStar ? '#92400e' : '#0f172a', lineHeight: 1, marginBottom: 8,
            }}>
                {number}
                {suffix && <span style={{ fontSize: 14, color: '#94a3b8', fontWeight: 500 }}>{suffix}</span>}
            </div>
            {delta && (
                <div style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700,
                    color: delta.color, display: 'flex', alignItems: 'center', gap: 4,
                }}>{delta.text}</div>
            )}
        </Link>
    )
}

function MatchRow({ match }: { match: FullMatch }) {
    const job = match.job
    const score = Math.round(match.relevance_score ?? 0)
    const tier = scoreTier(score)
    const matched = (match.matched_skills ?? []).length
    const total = matched + (match.missing_skills ?? []).length
    const insight = total > 0
        ? matched / total >= 0.8
            ? { text: `✓ Strong fit on ${matched} of ${total} required skills`, color: '#16a34a' }
            : matched > 0
                ? { text: `✓ You have ${matched} of ${total} required skills`, color: '#16a34a' }
                : { text: `⚠ Missing key skills`, color: '#d97706' }
        : null

    return (
        <div style={S.matchRow}>
            <div style={{ ...S.matchLogo, background: companyGradient(job.company) }}>{firstInitial(job.company)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={S.matchTitle}>{job.title}</div>
                <div style={S.matchCompany}>{job.company ?? 'Unknown Company'}</div>
                <div style={S.matchMeta}>
                    {[job.location, job.salary, job.posted_date ? `Posted ${relativeTime(job.posted_date)}` : null].filter(Boolean).join(' · ')}
                </div>
                {insight && <div style={{ fontSize: 12, color: insight.color, marginTop: 6 }}>{insight.text}</div>}
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    {job.source_url && (
                        <Link href={job.source_url} target="_blank" style={S.btnPrimary}>Apply Now ↗</Link>
                    )}
                    <Link href={`/dashboard/optimize?jobId=${job.id}`} style={S.btnOutline}>Tailor Resume</Link>
                </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <ScoreRing score={score} />
                <div style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 600,
                    letterSpacing: '0.08em', textTransform: 'uppercase', color: tier.color,
                }}>{tier.label}</div>
            </div>
        </div>
    )
}

function PipelineStage({ label, number, barColor, barWidth, muted, badge }: {
    label: string; number: number; barColor: string; barWidth: number; muted?: boolean; badge?: string
}) {
    const isHighlight = !!badge
    return (
        <div style={{
            background: isHighlight ? '#fffbeb' : '#f8fafc',
            border: `1px solid ${isHighlight ? '#fde68a' : '#e2e8f0'}`,
            borderRadius: 10, padding: 14, position: 'relative', overflow: 'hidden',
            opacity: muted ? 0.6 : 1,
        }}>
            <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
                letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b', marginBottom: 6,
            }}>{label}</div>
            <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 32, fontWeight: 800,
                color: '#0f172a', lineHeight: 1, marginBottom: 10,
            }}>{number}</div>
            <div style={{ height: 4, borderRadius: 99, background: '#e2e8f0', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${barWidth}%`, background: barColor, borderRadius: 99 }} />
            </div>
            {badge && (
                <div style={{
                    position: 'absolute', top: 10, right: 10, fontSize: 10, fontWeight: 700,
                    color: '#d97706', background: '#fef3c7', padding: '3px 8px', borderRadius: 6,
                }}>{badge}</div>
            )}
        </div>
    )
}

function SkillRow({ skill, count, max }: { skill: string; count: number; max: number }) {
    const pct = Math.min(100, (count / Math.max(1, max)) * 100)
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{
                fontSize: 14, fontWeight: 500, color: '#0f172a', width: 110, flexShrink: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{skill}</div>
            <div style={{ flex: 1, height: 6, background: '#eff6ff', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: '#135bec', borderRadius: 99 }} />
            </div>
            <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600,
                color: '#135bec', flexShrink: 0,
            }}>{count} job{count === 1 ? '' : 's'}</div>
        </div>
    )
}

function ActionTile({ icon, label, sub, context, href }: {
    icon: string; label: string; sub: string; context: string; href: string
}) {
    const [hover, setHover] = useState(false)
    return (
        <Link href={href} style={{
            padding: 14, border: '1px solid #e2e8f0', borderRadius: 10,
            display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
            transition: 'all 0.15s', minHeight: 84, textDecoration: 'none', color: 'inherit',
            background: hover ? '#eff6ff' : 'transparent',
            borderColor: hover ? '#135bec' : '#e2e8f0',
        }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
            <div style={{
                width: 36, height: 36, borderRadius: '50%', background: '#eff6ff',
                display: 'grid', placeItems: 'center', fontSize: 18, flexShrink: 0,
            }}>{icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{label}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{sub}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{context}</div>
            </div>
        </Link>
    )
}

function Timeline({ events }: { events: DashboardActivityEvent[] }) {
    const dotColor: Record<DashboardActivityEvent['kind'], string> = {
        match: '#d97706', resume: '#16a34a', research: '#7c3aed',
    }
    return (
        <div style={{ position: 'relative', paddingLeft: 24 }}>
            <div style={{ position: 'absolute', left: 7, top: 0, bottom: 0, width: 2, background: '#e2e8f0' }} />
            {events.map((e, i) => (
                <div key={i} style={{ position: 'relative', marginBottom: 16 }}>
                    <div style={{
                        position: 'absolute', left: -20, top: 4, width: 8, height: 8,
                        borderRadius: '50%', background: dotColor[e.kind],
                    }} />
                    <div style={{ fontSize: 13, color: '#475569', marginBottom: 2, lineHeight: 1.4 }}>{e.title}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{relativeTime(e.timestamp)}</div>
                </div>
            ))}
        </div>
    )
}

function EmptyState({ icon, label, href, cta, compact }: {
    icon: string; label: string; href: string; cta: string; compact?: boolean
}) {
    return (
        <div style={{
            textAlign: 'center', padding: compact ? '20px 14px' : '40px 20px',
            border: '2px dashed #e2e8f0', borderRadius: 10,
        }}>
            <div style={{ fontSize: compact ? 24 : 32, marginBottom: compact ? 8 : 12 }}>{icon}</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 14, lineHeight: 1.5 }}>{label}</div>
            <Link href={href} style={S.btnOutline}>{cta}</Link>
        </div>
    )
}

function Skeleton({ lines, height }: { lines: number; height: number }) {
    return (
        <div>
            {Array.from({ length: lines }).map((_, i) => (
                <div key={i} style={{
                    height, background: '#f1f5f9', borderRadius: 8, marginBottom: 10,
                    animation: 'rsPulse 1.4s ease-in-out infinite',
                    animationDelay: `${i * 0.15}s`,
                }} />
            ))}
            <style>{`@keyframes rsPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
        </div>
    )
}

/* ── Styles ── */
const S: Record<string, React.CSSProperties> = {
    page: {
        maxWidth: 1280, margin: '0 auto', paddingBottom: 80,
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", color: '#0f172a',
    },
    greetingBar: {
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
        padding: '20px 24px', marginBottom: 16,
        boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24,
    },
    eyebrow: {
        fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
        letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8,
    },
    greetingHeadline: {
        fontSize: 26, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', marginBottom: 6,
    },
    greetingSub: { fontSize: 14, color: '#475569', marginBottom: 4 },
    streakBox: {
        background: '#eff6ff', borderRadius: 8, padding: 12,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        minWidth: 180,
    },
    streakEyebrow: {
        fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 600,
        letterSpacing: '0.1em', textTransform: 'uppercase', color: '#135bec',
    },
    statGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 },
    northStarBadge: {
        position: 'absolute', top: 12, right: 12,
        fontFamily: "'JetBrains Mono', monospace", fontSize: 8, fontWeight: 600,
        letterSpacing: '0.08em', textTransform: 'uppercase', color: '#d97706',
        background: '#fef3c7', padding: '2px 7px', borderRadius: 99,
    },
    nudge: {
        background: '#eff6ff', borderLeft: '3px solid #135bec', borderRadius: 10,
        padding: '14px 18px', marginBottom: 24,
        display: 'flex', alignItems: 'center', gap: 12,
    },
    nudgeBtn: {
        padding: '7px 14px', background: '#135bec', color: '#fff', borderRadius: 8,
        fontSize: 13, fontWeight: 600, textDecoration: 'none',
    },
    nudgeDismiss: {
        fontSize: 12, color: '#64748b', background: 'transparent',
        border: 'none', cursor: 'pointer', padding: '4px 8px',
    },
    bodyGrid: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 24, alignItems: 'start' },
    sidebar: { display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 88 },
    card: {
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
        padding: 22, boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
    },
    cardHeader: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16,
    },
    cardTitle: {
        fontSize: 16, fontWeight: 700, color: '#0f172a',
        display: 'flex', alignItems: 'center', gap: 6,
    },
    cardLink: {
        fontSize: 13, fontWeight: 600, color: '#135bec', cursor: 'pointer', textDecoration: 'none',
    },
    matchRow: {
        display: 'flex', gap: 14, padding: 14, border: '1px solid #e2e8f0',
        borderRadius: 10, marginBottom: 12, alignItems: 'flex-start',
    },
    matchLogo: {
        width: 44, height: 44, borderRadius: 10,
        display: 'grid', placeItems: 'center',
        color: '#fff', fontWeight: 800, fontSize: 16, flexShrink: 0,
        boxShadow: '0 4px 10px -3px rgba(19,91,236,0.4)',
    },
    matchTitle: { fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 4 },
    matchCompany: { fontSize: 13, color: '#64748b', marginBottom: 2 },
    matchMeta: { fontSize: 12, color: '#94a3b8' },
    pipelineGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 },
    insightBox: {
        background: '#eff6ff', borderRadius: 8, padding: 12, marginTop: 14,
        display: 'flex', gap: 10, alignItems: 'flex-start',
    },
    itemRow: {
        display: 'flex', alignItems: 'center', gap: 12, padding: 10,
        borderRadius: 8, marginBottom: 8,
    },
    itemIcon: {
        width: 36, height: 36, borderRadius: 8,
        display: 'grid', placeItems: 'center',
        color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0,
    },
    itemName: {
        fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 2,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    },
    itemMeta: { fontSize: 12, color: '#94a3b8' },
    itemBadge: {
        padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
        background: '#dcfce7', color: '#15803d',
    },
    itemTime: { fontSize: 12, color: '#94a3b8' },
    iconBtn: {
        width: 28, height: 28, borderRadius: 6,
        display: 'grid', placeItems: 'center', color: '#64748b', cursor: 'pointer',
    },
    tipCard: { paddingLeft: 12, paddingTop: 14, borderTop: '1px solid #e2e8f0' },
    tipLabel: {
        fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 600,
        letterSpacing: '0.08em', textTransform: 'uppercase', color: '#135bec', marginBottom: 6,
    },
    tipText: { fontSize: 11, fontStyle: 'italic', color: '#475569', lineHeight: 1.5 },
    btnPrimary: {
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '7px 14px', background: '#135bec', color: '#fff', borderRadius: 8,
        fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'none',
    },
    btnOutline: {
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '7px 14px', background: '#fff', color: '#135bec', borderRadius: 8,
        fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'none',
        border: '1px solid #135bec',
    },
    primaryCta: {
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '12px 24px', background: '#135bec', color: '#fff', borderRadius: 10,
        fontSize: 15, fontWeight: 700, textDecoration: 'none',
        boxShadow: '0 4px 14px -4px rgba(19,91,236,0.55)',
    },
}
