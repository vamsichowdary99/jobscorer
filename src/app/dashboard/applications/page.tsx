'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/components/providers/AuthProvider'
import {
    fetchApplications,
    fetchMatches,
    fetchResumes,
    getPrimaryResumeId,
    setPrimaryResumeId,
    createApplication,
    updateApplicationStatus,
    updateApplication,
    deleteApplication,
    type Application,
    type ApplicationStatus,
    type ApplicationRejectionReason,
} from '@/lib/api'
import type { Job, Resume, UserJobMatch } from '@/lib/types'

type FullMatch = UserJobMatch & { job: Job }

/** Sentinel value used in the resume dropdown for the "all resumes" view. */
const ALL_RESUMES = '__all__' as const
type ResumeFilter = string  // either a resume UUID or ALL_RESUMES

/** Pull a sensible display name out of a Resume regardless of which parser shape we got. */
function resumeDisplayName(r: Resume): string {
    const sd: any = (r as any).structured_data
    let parsed: any = sd
    if (typeof sd === 'string') {
        try {
            const once = JSON.parse(sd)
            parsed = typeof once === 'string' ? JSON.parse(once) : once
        } catch { parsed = null }
    }
    if (parsed && typeof parsed === 'object') {
        const name = parsed.name || parsed?.personal_info?.full_name || parsed?.basics?.name
        if (typeof name === 'string' && name.trim()) return name.trim()
    }
    if ((r as any).original_filename) return String((r as any).original_filename).replace(/\.(pdf|docx?|txt)$/i, '')
    return `Resume · ${r.id.slice(0, 6)}`
}

/** A short subline ("Frontend Engineer", "Recent graduate"…) to distinguish resumes. */
function resumeRoleLabel(r: Resume): string {
    const sd: any = (r as any).structured_data
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
        : Array.isArray(parsed.work_experience)
            ? parsed.work_experience
            : []
    if (workArr.length > 0 && typeof workArr[0]?.title === 'string') return workArr[0].title
    const skills = parsed.skills?.technical || parsed.technical_skills
    if (Array.isArray(skills) && skills.length > 0) return `${skills[0]} candidate`
    return 'Recent graduate'
}

const STATUS_ORDER: ApplicationStatus[] = ['applied', 'interview', 'offer', 'rejected']

const STATUS_META: Record<ApplicationStatus, { label: string; color: string; bg: string; dot: string; pillBg: string; pillText: string }> = {
    applied:   { label: 'Applied',   color: '#135bec', bg: '#eff6ff', dot: '#135bec', pillBg: '#eff6ff', pillText: '#135bec' },
    interview: { label: 'Interview', color: '#16a34a', bg: '#dcfce7', dot: '#16a34a', pillBg: '#dcfce7', pillText: '#16a34a' },
    offer:     { label: 'Offer',     color: '#d97706', bg: '#fef3c7', dot: '#d97706', pillBg: '#fef3c7', pillText: '#d97706' },
    rejected:  { label: 'Rejected',  color: '#dc2626', bg: '#fee2e2', dot: '#dc2626', pillBg: '#fee2e2', pillText: '#dc2626' },
    withdrawn: { label: 'Withdrawn', color: '#64748b', bg: '#f1f5f9', dot: '#64748b', pillBg: '#f1f5f9', pillText: '#64748b' },
}

const LOGO_PALETTE: Array<[string, string]> = [
    ['#0B5CAB', '#063670'], ['#10B981', '#047857'], ['#E63946', '#B91D2A'],
    ['#1E40AF', '#1E3A8A'], ['#F57C00', '#C2410C'], ['#0891B2', '#155E75'],
    ['#7C3AED', '#5B21B6'], ['#DB2777', '#9D174D'], ['#0073BD', '#005689'],
    ['#16a34a', '#15803d'], ['#d97706', '#b45309'], ['#475569', '#1e293b'],
]

function paletteFor(name: string | null | undefined): [string, string] {
    const key = (name ?? '?')
    let h = 0
    for (const c of key) h = c.charCodeAt(0) + ((h << 5) - h)
    return LOGO_PALETTE[Math.abs(h) % LOGO_PALETTE.length]
}

function initials(name: string | null | undefined): string {
    const clean = (name ?? '?').replace(/[^A-Za-z ]/g, '').trim()
    const parts = clean.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return clean.slice(0, 2).toUpperCase() || '?'
}

function fmtRelDay(iso: string | null | undefined): string {
    if (!iso) return ''
    const t = new Date(iso).getTime()
    if (!Number.isFinite(t)) return ''
    const days = Math.round((Date.now() - t) / 86400000)
    if (days === 0) return 'today'
    if (days === 1) return 'yesterday'
    if (days < 7) return `${days}d ago`
    if (days < 14) return '1w ago'
    if (days < 30) return `${Math.round(days / 7)}w ago`
    return `${Math.round(days / 30)}mo ago`
}

function fmtFutureInterview(iso: string | null | undefined): string | null {
    if (!iso) return null
    const t = new Date(iso).getTime()
    const ms = t - Date.now()
    if (ms < 0) return null
    const hours = ms / 3600000
    if (hours < 24) {
        const h = Math.max(1, Math.round(hours))
        return `In ${h} hour${h === 1 ? '' : 's'}`
    }
    const days = Math.floor(hours / 24)
    const d = new Date(iso)
    if (days < 7) return `${d.toLocaleDateString('en-US', { weekday: 'short' })} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtDateShort(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Pull the displayable company + role from an Application — may come from job or external fields. */
function displayCompany(a: Application): string {
    return a.job?.company ?? a.external_company ?? 'Unknown company'
}
function displayRole(a: Application): string {
    return a.job?.title ?? a.external_role ?? 'Untitled role'
}
function displayLocation(a: Application): string | null {
    return a.job?.location ?? a.external_location ?? null
}
function displaySalary(a: Application): string | null {
    return a.job?.salary ?? a.external_salary ?? null
}
function displayUrl(a: Application): string | null {
    return a.job?.source_url ?? a.external_url ?? null
}

export default function ApplicationsPage() {
    const { user } = useAuth()
    const [apps, setApps] = useState<Application[]>([])
    const [matches, setMatches] = useState<FullMatch[]>([])
    const [resumes, setResumes] = useState<Resume[]>([])
    const [primaryResumeId, setPrimaryResumeIdState] = useState<string | null>(null)
    const [resumeFilter, setResumeFilter] = useState<ResumeFilter>(ALL_RESUMES)
    const [loading, setLoading] = useState(true)
    const [drawerId, setDrawerId] = useState<string | null>(null)
    const [drawerTab, setDrawerTab] = useState<'overview' | 'timeline' | 'notes' | 'prep'>('overview')
    const [addModalOpen, setAddModalOpen] = useState(false)
    const [addModalTab, setAddModalTab] = useState<'matches' | 'manual'>('matches')
    const [rejectPopover, setRejectPopover] = useState<{ id: string; anchor: { x: number; y: number } } | null>(null)
    const [draggingId, setDraggingId] = useState<string | null>(null)
    const [dragOverStatus, setDragOverStatus] = useState<ApplicationStatus | null>(null)
    const [toast, setToast] = useState<{ msg: string; gold?: boolean; id: number } | null>(null)
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [isMobile, setIsMobile] = useState(false)
    const [mobileView, setMobileView] = useState<'list' | 'kanban'>('list')
    const [mobileStatusFilter, setMobileStatusFilter] = useState<'all' | ApplicationStatus>('all')

    useEffect(() => {
        if (!user?.id) return
        let cancelled = false
        ;(async () => {
            setLoading(true)
            const [a, m, rs] = await Promise.all([
                fetchApplications(user.id),
                fetchMatches(user.id),
                fetchResumes(user.id).catch(() => [] as Resume[]),
            ])
            if (cancelled) return
            setApps(a)
            setMatches(m)
            setResumes(rs)
            const primary = getPrimaryResumeId()
            setPrimaryResumeIdState(primary)
            // Default selection: primary resume if set & exists, else "All resumes".
            if (primary && rs.some(r => r.id === primary)) {
                setResumeFilter(primary)
            } else {
                setResumeFilter(ALL_RESUMES)
            }
            setLoading(false)
        })()
        return () => { cancelled = true }
    }, [user?.id])

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 767px)')
        setIsMobile(mq.matches)
        const h = (e: MediaQueryListEvent) => setIsMobile(e.matches)
        mq.addEventListener('change', h)
        return () => mq.removeEventListener('change', h)
    }, [])

    /**
     * Resolve which resume an application belongs to. We try (in order):
     *   1. The joined optimized_resume.resume_id — the strong signal when the user
     *      ran Optimize before applying.
     *   2. The user_job_matches row for the same job — for apps imported straight
     *      from matches without optimizing first, this is how we know which
     *      resume scored them.
     * Manual entries (no job_id) end up with `null` and only appear in "All resumes".
     */
    const resumeIdForApp = useMemo(() => {
        const matchByJob = new Map<string, string>()
        for (const m of matches) {
            if (m.job_id && m.resume_id && !matchByJob.has(m.job_id)) {
                matchByJob.set(m.job_id, m.resume_id)
            }
        }
        return (a: Application): string | null => {
            const fromOptimized = a.optimized_resume?.resume_id ?? null
            if (fromOptimized) return fromOptimized
            if (a.job_id) return matchByJob.get(a.job_id) ?? null
            return null
        }
    }, [matches])

    /** Map: resume_id → number of apps tied to that resume. Includes an `__all__` bucket. */
    const appCountByResume = useMemo(() => {
        const map: Record<string, number> = { [ALL_RESUMES]: apps.length }
        for (const a of apps) {
            const rid = resumeIdForApp(a)
            if (rid) map[rid] = (map[rid] ?? 0) + 1
        }
        return map
    }, [apps, resumeIdForApp])

    /** Apps after the resume filter has been applied. The user only ever sees this. */
    const visibleApps = useMemo(() => {
        if (resumeFilter === ALL_RESUMES) return apps
        return apps.filter(a => resumeIdForApp(a) === resumeFilter)
    }, [apps, resumeFilter, resumeIdForApp])

    const handleResumeSelect = (id: ResumeFilter) => {
        setResumeFilter(id)
        // Promote to primary so the choice sticks across sessions for this user.
        if (id !== ALL_RESUMES) {
            setPrimaryResumeId(id)
            setPrimaryResumeIdState(id)
        }
    }

    const showToast = (msg: string, opts?: { gold?: boolean; duration?: number }) => {
        const id = Date.now()
        setToast({ msg, gold: opts?.gold, id })
        if (toastTimer.current) clearTimeout(toastTimer.current)
        toastTimer.current = setTimeout(() => setToast(null), opts?.duration ?? 3500)
    }

    /** Move an application — opens rejection popover instead of committing for `rejected`. */
    const moveApp = async (id: string, newStatus: ApplicationStatus, anchor?: { x: number; y: number }) => {
        const app = apps.find(a => a.id === id)
        if (!app || app.status === newStatus) return
        if (newStatus === 'rejected') {
            setRejectPopover({ id, anchor: anchor ?? { x: window.innerWidth / 2 - 160, y: window.innerHeight / 2 - 160 } })
            return
        }
        await commitMove(id, newStatus)
    }

    const commitMove = async (id: string, newStatus: ApplicationStatus, extra?: { rejection_reason?: ApplicationRejectionReason; rejection_note?: string }) => {
        const app = apps.find(a => a.id === id)
        if (!app) return
        const prev = app.status
        // Optimistic update
        setApps(curr => curr.map(a => a.id === id ? { ...a, status: newStatus } : a))
        const ok = await updateApplicationStatus(id, newStatus, extra)
        if (!ok) {
            setApps(curr => curr.map(a => a.id === id ? { ...a, status: prev } : a))
            showToast('Could not update status — try again')
            return
        }
        // Refresh the updated row's timeline by re-pulling — cheap.
        const refreshed = await fetchApplications(user!.id)
        setApps(refreshed)
        if (newStatus === 'offer' && prev !== 'offer') {
            fireConfetti()
            showToast(`🎉 You got an offer at ${displayCompany(app)}!`, { gold: true, duration: 5500 })
        } else if (newStatus === 'interview' && prev === 'applied') {
            showToast(`✅ Moved to Interview · ${displayCompany(app)}`)
        } else {
            showToast(`Moved to ${STATUS_META[newStatus].label} · ${displayCompany(app)}`)
        }
    }

    const handleRejectionSave = async (reason: ApplicationRejectionReason, note?: string) => {
        if (!rejectPopover) return
        await commitMove(rejectPopover.id, 'rejected', { rejection_reason: reason, rejection_note: note })
        setRejectPopover(null)
    }
    const handleRejectionSkip = async () => {
        if (!rejectPopover) return
        await commitMove(rejectPopover.id, 'rejected')
        setRejectPopover(null)
    }

    const handleDeleteApplication = async (id: string) => {
        if (!confirm('Delete this application permanently? This cannot be undone.')) return
        const app = apps.find(a => a.id === id)
        setApps(curr => curr.filter(a => a.id !== id))
        await deleteApplication(id)
        showToast(`Deleted · ${app ? displayCompany(app) : 'application'}`)
        setDrawerId(null)
    }

    // Counts for the funnel strip — scoped to the currently-selected resume.
    const counts = useMemo(() => {
        const c = { applied: 0, interview: 0, offer: 0, rejected: 0, withdrawn: 0 }
        for (const a of visibleApps) c[a.status] += 1
        return c
    }, [visibleApps])

    const total = visibleApps.length
    const responseRate = total === 0 ? 0
        : Math.round(((counts.interview + counts.offer + counts.rejected) / total) * 100)
    const avgTimeToInterview = useMemo(() => {
        const samples: number[] = []
        for (const a of visibleApps) {
            if (a.status !== 'interview' && a.status !== 'offer') continue
            const interviewEntry = (a.status_history ?? []).find(h => h.status === 'interview')
            if (!interviewEntry) continue
            const days = Math.round((new Date(interviewEntry.at).getTime() - new Date(a.applied_at).getTime()) / 86400000)
            if (days >= 0) samples.push(days)
        }
        if (samples.length === 0) return 0
        return Math.round(samples.reduce((s, v) => s + v, 0) / samples.length)
    }, [visibleApps])

    // Upcoming interviews (next 7 days)
    const upcoming = useMemo(() => {
        const cutoff = Date.now() + 7 * 86400000
        return visibleApps
            .filter(a => a.interview_at && new Date(a.interview_at).getTime() >= Date.now() && new Date(a.interview_at).getTime() <= cutoff)
            .sort((a, b) => new Date(a.interview_at!).getTime() - new Date(b.interview_at!).getTime())
    }, [visibleApps])

    // Group apps by status for the kanban
    const grouped = useMemo(() => {
        const g: Record<ApplicationStatus, Application[]> = { applied: [], interview: [], offer: [], rejected: [], withdrawn: [] }
        for (const a of visibleApps) g[a.status].push(a)
        // Interview sorted by interview_at ascending; others by applied_at descending
        g.interview.sort((a, b) => (new Date(a.interview_at ?? a.applied_at).getTime()) - (new Date(b.interview_at ?? b.applied_at).getTime()))
        for (const s of ['applied', 'offer', 'rejected', 'withdrawn'] as ApplicationStatus[]) {
            g[s].sort((a, b) => new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime())
        }
        return g
    }, [visibleApps])

    const drawerApp = drawerId ? apps.find(a => a.id === drawerId) ?? null : null
    const selectedResume = resumeFilter === ALL_RESUMES ? null : resumes.find(r => r.id === resumeFilter) ?? null

    /* ── MOBILE LAYOUT ─────────────────────────────────────── */
    if (isMobile) {
        const MobileAddModal = () => addModalOpen ? (
            <MobileAddSheet
                tab={addModalTab}
                onTabChange={setAddModalTab}
                matches={matches.filter(m => {
                    if (apps.some(a => a.job_id === m.job_id)) return false
                    if (resumeFilter !== ALL_RESUMES && m.resume_id !== resumeFilter) return false
                    return true
                })}
                selectedResumeName={selectedResume ? resumeDisplayName(selectedResume) : null}
                onClose={() => setAddModalOpen(false)}
                onAddFromMatch={async (m) => {
                    if (!user?.id) return
                    const created = await createApplication({ user_id: user.id, job_id: m.job_id, status: 'applied' })
                    if (created) {
                        const refreshed = await fetchApplications(user.id)
                        setApps(refreshed)
                        showToast(`📨 Applied to ${m.job.company} · ${m.job.title}`)
                        setAddModalOpen(false)
                    }
                }}
                onAddManual={async (payload) => {
                    if (!user?.id) return
                    const created = await createApplication({ user_id: user.id, external_company: payload.company, external_role: payload.role, external_url: payload.url || null, status: payload.status, notes: payload.notes || null, applied_at: payload.applied_at })
                    if (created) {
                        const refreshed = await fetchApplications(user.id)
                        setApps(refreshed)
                        showToast(`📨 Added · ${payload.company}`)
                        setAddModalOpen(false)
                    }
                }}
            />
        ) : null

        const MobileToast = () => toast ? (
            <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 80, background: toast.gold ? 'linear-gradient(135deg, #d97706, #b45309)' : '#0f172a', color: '#fff', padding: '14px 22px', borderRadius: 12, fontSize: 14, fontWeight: 600, boxShadow: '0 24px 48px -12px rgba(15,23,42,.18)', maxWidth: 'min(94vw, 480px)', whiteSpace: 'nowrap' }}>
                {toast.msg}
            </div>
        ) : null

        const mobileHd: React.CSSProperties = {
            padding: '20px 16px 0', background: '#fff', borderBottom: '1px solid #eef2f7',
        }
        const mobileHdInner: React.CSSProperties = {
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16,
        }
        const mobileEyebrow: React.CSSProperties = {
            fontFamily: "var(--font-mono), 'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700,
            letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 4,
        }
        const mobileH1: React.CSSProperties = {
            fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', color: '#0f172a', marginBottom: 2,
        }
        const mobileSubtitle: React.CSSProperties = { fontSize: 13, color: '#64748b', marginBottom: 0 }
        const mobileAddBtn: React.CSSProperties = {
            background: '#135bec', color: '#fff', border: 'none', borderRadius: 10,
            padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0, marginTop: 4,
        }

        /* ── Loading ── */
        if (loading) return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 12 }}>
                <div style={{ width: 36, height: 36, border: '3px solid #e2e8f0', borderTopColor: '#135bec', borderRadius: '50%', animation: 'mtrSpin 0.8s linear infinite' }} />
                <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>Loading tracker…</div>
                <style>{`@keyframes mtrSpin { to { transform: rotate(360deg); } }`}</style>
            </div>
        )

        /* ── Empty state ── */
        if (apps.length === 0) return (
            <>
                <div style={{ minHeight: 'calc(100vh - 64px)', background: '#f6f8fb', display: 'flex', flexDirection: 'column' }}>
                    <div style={mobileHd}>
                        <div style={mobileHdInner}>
                            <div>
                                <div style={mobileEyebrow}>TRACKER</div>
                                <div style={mobileH1}>Application Pipeline</div>
                                <div style={mobileSubtitle}>Track every application from sent to signed.</div>
                            </div>
                            <button style={mobileAddBtn} onClick={() => { setAddModalTab('matches'); setAddModalOpen(true) }}>+ Add</button>
                        </div>
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 32px', textAlign: 'center', gap: 16 }}>
                        <div style={{ width: 72, height: 72, borderRadius: '50%', border: '2px dashed #135bec', background: '#eff6ff', display: 'grid', placeItems: 'center' }}>
                            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#135bec" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                                <circle cx="8" cy="14" r=".5" fill="#135bec" /><circle cx="12" cy="14" r=".5" fill="#135bec" /><circle cx="16" cy="14" r=".5" fill="#135bec" />
                                <circle cx="8" cy="17" r=".5" fill="#135bec" /><circle cx="12" cy="17" r=".5" fill="#135bec" />
                            </svg>
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.015em' }}>No applications yet</div>
                        <div style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, maxWidth: 280 }}>
                            Add your first application and track it through every stage — Applied → Interview → Offer
                        </div>
                        <button style={{ background: '#135bec', color: '#fff', border: 'none', borderRadius: 12, padding: '14px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 8 }}
                            onClick={() => { setAddModalTab('matches'); setAddModalOpen(true) }}>
                            + Add Application
                        </button>
                    </div>
                </div>
                <MobileAddModal />
                <MobileToast />
            </>
        )

        /* ── Active state ── */
        return (
            <>
                <div style={{ minHeight: 'calc(100vh - 64px)', background: '#f6f8fb', display: 'flex', flexDirection: 'column', paddingBottom: 28 }}>

                    {/* Header */}
                    <div style={mobileHd}>
                        <div style={mobileHdInner}>
                            <div>
                                <div style={mobileEyebrow}>TRACKER</div>
                                <div style={mobileH1}>Application Pipeline</div>
                                <div style={mobileSubtitle}>Track every application from sent to signed.</div>
                            </div>
                            <button style={mobileAddBtn} onClick={() => { setAddModalTab('matches'); setAddModalOpen(true) }}>+ Add</button>
                        </div>
                    </div>

                    {/* Scope bar */}
                    <div style={{ padding: '12px 16px 0', background: '#fff' }}>
                        <ResumeFilterBar
                            resumes={resumes}
                            selectedId={resumeFilter}
                            onSelect={handleResumeSelect}
                            primaryResumeId={primaryResumeId}
                            countByResume={appCountByResume}
                            totalApps={apps.length}
                            visibleCount={visibleApps.length}
                            loading={loading}
                        />
                    </div>

                    {/* Pipeline funnel */}
                    <div style={{ margin: '12px 16px 0', background: '#fff', borderRadius: 14, padding: 14, border: '1px solid #eef2f7' }}>
                        {/* Stage row */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            {(['applied', 'interview', 'offer', 'rejected'] as ApplicationStatus[]).map((s, i) => (
                                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    {i > 0 && <span style={{ color: '#cbd5e1', fontSize: 14, marginRight: 4 }}>›</span>}
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                                        <span style={{ fontSize: 20, fontWeight: 800, color: STATUS_META[s].color, lineHeight: 1 }}>{counts[s]}</span>
                                        <span style={{ fontSize: 9.5, fontWeight: 600, color: '#64748b', letterSpacing: '-0.01em' }}>{STATUS_META[s].label}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {/* Progress bar */}
                        <div style={{ height: 6, borderRadius: 99, background: '#f1f5f9', display: 'flex', overflow: 'hidden', marginBottom: 8 }}>
                            {(['applied', 'interview', 'offer', 'rejected', 'withdrawn'] as ApplicationStatus[]).filter(s => counts[s] > 0).map((s, i, arr) => (
                                <div key={s} style={{ background: STATUS_META[s].color, width: `${(counts[s] / Math.max(1, total)) * 100}%`, minWidth: 4, borderRadius: i === 0 ? '99px 0 0 99px' : i === arr.length - 1 ? '0 99px 99px 0' : 0 }} />
                            ))}
                        </div>
                        {/* Bar labels */}
                        <div style={{ display: 'flex', gap: 8, fontSize: 11, flexWrap: 'wrap' }}>
                            {counts.applied > 0 && <span style={{ color: '#135bec', fontWeight: 700 }}>{counts.applied} Applied</span>}
                            {counts.interview > 0 && <span style={{ color: '#16a34a', fontWeight: 700 }}>/ {counts.interview} Interview</span>}
                            {counts.offer > 0 && <span style={{ color: '#d97706', fontWeight: 700 }}>/ {counts.offer} Offer</span>}
                            {counts.rejected > 0 && <span style={{ color: '#dc2626', fontWeight: 700 }}>/ {counts.rejected} Rejected</span>}
                        </div>
                    </div>

                    {/* Stats 2×3 grid */}
                    <div style={{ margin: '10px 16px 0', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                        {([
                            { label: 'Total', value: String(total), mono: false },
                            { label: 'Applied', value: String(counts.applied), mono: false },
                            { label: 'Interview', value: String(counts.interview), mono: false, color: counts.interview > 0 ? '#16a34a' : undefined },
                            { label: 'Offer', value: String(counts.offer), mono: false, color: counts.offer > 0 ? '#d97706' : undefined },
                            { label: 'Response %', value: `${responseRate}%`, mono: true },
                            { label: 'To Interview', value: avgTimeToInterview > 0 ? `${avgTimeToInterview}d` : '—', mono: false },
                        ] as { label: string; value: string; mono: boolean; color?: string }[]).map(({ label, value, mono, color }) => (
                            <div key={label} style={{ background: '#fff', border: '1px solid #eef2f7', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                                <div style={{ fontSize: mono ? 15 : 20, fontWeight: 800, color: color ?? '#0f172a', letterSpacing: '-0.02em', lineHeight: 1, fontFamily: mono ? "var(--font-mono), 'JetBrains Mono', monospace" : 'inherit' }}>
                                    {value}
                                </div>
                                <div style={{ fontSize: 9.5, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 3 }}>{label}</div>
                            </div>
                        ))}
                    </div>

                    {/* Status filter tabs */}
                    <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 14px', display: 'flex', overflowX: 'auto', scrollbarWidth: 'none', flexShrink: 0, marginTop: 12 } as React.CSSProperties}>
                        {([
                            { key: 'all' as const, label: 'All', count: visibleApps.length, bg: '#f1f5f9', color: '#64748b' },
                            { key: 'applied' as const, label: 'Applied', count: counts.applied, bg: '#eff6ff', color: '#135bec' },
                            { key: 'interview' as const, label: 'Interview', count: counts.interview, bg: '#dcfce7', color: '#16a34a' },
                            { key: 'offer' as const, label: 'Offer', count: counts.offer, bg: '#fef3c7', color: '#d97706' },
                            { key: 'rejected' as const, label: 'Rejected', count: counts.rejected, bg: '#fee2e2', color: '#dc2626' },
                        ]).map(({ key, label, count, bg, color }) => {
                            const active = mobileStatusFilter === key
                            return (
                                <button key={key} onClick={() => setMobileStatusFilter(key)} style={{ padding: '9px 12px 7px', fontSize: 12, fontWeight: active ? 700 : 600, color: active ? '#135bec' : '#64748b', background: 'none', border: 'none', borderBottom: `2.5px solid ${active ? '#135bec' : 'transparent'}`, marginBottom: -1, whiteSpace: 'nowrap', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, fontFamily: 'inherit' }}>
                                    {label}
                                    <span style={{ minWidth: 16, height: 16, padding: '0 4px', borderRadius: 99, background: bg, color, fontFamily: "var(--font-mono), 'JetBrains Mono', monospace", fontSize: 9, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{count}</span>
                                </button>
                            )
                        })}
                    </div>

                    {/* View tabs */}
                    <div className="mob-view-toggle" style={{ margin: '12px 16px 0', display: 'flex', alignItems: 'center', gap: 3, background: '#fff', borderRadius: 12, padding: 4, border: '1px solid #eef2f7' }}>
                        {(['kanban', 'list'] as const).map(v => (
                            <button key={v} onClick={() => setMobileView(v)} style={{ flex: 1, padding: '8px 12px', borderRadius: 9, fontSize: 13, fontWeight: 600, background: mobileView === v ? '#eff6ff' : 'transparent', color: mobileView === v ? '#135bec' : '#64748b', border: 'none', cursor: 'pointer' }}>
                                {v === 'kanban' ? 'Kanban' : 'List'}
                            </button>
                        ))}
                        {mobileView === 'kanban' && (
                            <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, paddingRight: 8, flexShrink: 0, letterSpacing: '-0.01em' }}>swipe →</span>
                        )}
                    </div>

                    {/* List view */}
                    {mobileView === 'list' && (
                        <div style={{ padding: '14px 16px 0' }}>
                            {(['applied', 'interview', 'offer', 'rejected', 'withdrawn'] as ApplicationStatus[]).filter(s => grouped[s].length > 0).filter(s => mobileStatusFilter === 'all' || s === mobileStatusFilter).map(status => (
                                <div key={status} style={{ marginBottom: 18 }}>
                                    {/* Group header */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                        <span style={{ fontFamily: "var(--font-mono), 'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: STATUS_META[status].color, flexShrink: 0 }}>
                                            {STATUS_META[status].label} · {grouped[status].length}
                                        </span>
                                        <div style={{ flex: 1, height: 1, background: '#eef2f7' }} />
                                    </div>
                                    {/* App cards */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {grouped[status].map(a => {
                                            const company = displayCompany(a)
                                            const role = displayRole(a)
                                            const location = displayLocation(a)
                                            const salary = displaySalary(a)
                                            const [c1, c2] = paletteFor(company)
                                            const ini = initials(company)
                                            return (
                                                <div key={a.id} onClick={() => { setDrawerId(a.id); setDrawerTab('overview') }} style={{ background: '#fff', border: '1px solid #eef2f7', borderRadius: 12, padding: '12px 14px', display: 'flex', gap: 11, alignItems: 'flex-start', cursor: 'pointer' }}>
                                                    <div style={{ width: 40, height: 40, borderRadius: 10, background: `linear-gradient(135deg, ${c1}, ${c2})`, display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: 14, flexShrink: 0 }}>{ini}</div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{role}</div>
                                                        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{company}{location ? ` · ${location}` : ''}</div>
                                                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                                                            <span style={{ fontSize: 11, color: '#94a3b8' }}>{fmtRelDay(a.applied_at)}</span>
                                                            {salary && <span style={{ fontSize: 11, color: '#94a3b8' }}>· {salary}</span>}
                                                            {a.optimized_resume && <span style={{ fontSize: 10, fontWeight: 700, color: '#135bec', background: '#eff6ff', padding: '1px 6px', borderRadius: 6 }}>tailored</span>}
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 99, background: STATUS_META[status].pillBg, flexShrink: 0, marginTop: 2 }}>
                                                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: STATUS_META[status].dot, flexShrink: 0 }} />
                                                        <span style={{ fontSize: 10.5, fontWeight: 600, color: STATUS_META[status].pillText }}>{STATUS_META[status].label}</span>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            ))}
                            {visibleApps.length === 0 && (
                                <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                                    No applications for this resume filter.
                                </div>
                            )}
                        </div>
                    )}

                    {/* Kanban view — horizontal scroll */}
                    {mobileView === 'kanban' && (
                        <div className="mob-kanban-view" style={{ marginTop: 14, paddingLeft: 16, display: 'flex', gap: 10, overflowX: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
                            {(['applied', 'interview', 'offer', 'rejected'] as ApplicationStatus[]).map(status => (
                                <div key={status} style={{ flexShrink: 0, width: 210, display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 4 }}>
                                    <div style={{ padding: '8px 12px', borderRadius: 10, background: STATUS_META[status].bg }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_META[status].dot, flexShrink: 0 }} />
                                            <span style={{ fontSize: 12.5, fontWeight: 700, color: STATUS_META[status].color }}>{STATUS_META[status].label}</span>
                                            <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginLeft: 'auto', fontFamily: "var(--font-mono), 'JetBrains Mono', monospace" }}>{grouped[status].length}</span>
                                        </div>
                                    </div>
                                    {grouped[status].length === 0 ? (
                                        <div style={{ border: '1.5px dashed #e2e8f0', borderRadius: 10, padding: '20px 10px', textAlign: 'center', color: '#94a3b8', fontSize: 12, fontWeight: 500 }}>
                                            Drop here
                                        </div>
                                    ) : grouped[status].map(a => {
                                        const company = displayCompany(a)
                                        const role = displayRole(a)
                                        const [c1, c2] = paletteFor(company)
                                        const ini = initials(company)
                                        return (
                                            <div key={a.id} onClick={() => { setDrawerId(a.id); setDrawerTab('overview') }} style={{ background: '#fff', border: '1px solid #eef2f7', borderRadius: 10, padding: 12, cursor: 'pointer' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                                    <div style={{ width: 28, height: 28, borderRadius: 7, background: `linear-gradient(135deg, ${c1}, ${c2})`, display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: 11, flexShrink: 0 }}>{ini}</div>
                                                    <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{company}</span>
                                                </div>
                                                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 6, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}>{role}</div>
                                                <div style={{ fontSize: 11, color: '#94a3b8' }}>{fmtRelDay(a.applied_at)}</div>
                                            </div>
                                        )
                                    })}
                                </div>
                            ))}
                            {/* Right padding sentinel */}
                            <div style={{ flexShrink: 0, width: 16 }} />
                        </div>
                    )}
                </div>

                {/* Detail drawer — reused as-is (full-screen on mobile) */}
                {drawerApp && (
                    <DetailDrawer
                        app={drawerApp}
                        tab={drawerTab}
                        onTabChange={setDrawerTab}
                        onClose={() => setDrawerId(null)}
                        onStatusChange={(newStatus, anchor) => moveApp(drawerApp.id, newStatus, anchor)}
                        onDelete={() => handleDeleteApplication(drawerApp.id)}
                        onNotesChange={async (notes) => {
                            setApps(curr => curr.map(x => x.id === drawerApp.id ? { ...x, notes } : x))
                            await updateApplication(drawerApp.id, { notes })
                        }}
                        onInterviewDateChange={async (iso) => {
                            setApps(curr => curr.map(x => x.id === drawerApp.id ? { ...x, interview_at: iso } : x))
                            await updateApplication(drawerApp.id, { interview_at: iso })
                        }}
                    />
                )}

                <MobileAddModal />

                {rejectPopover && (
                    <RejectionPopover
                        anchor={rejectPopover.anchor}
                        onSave={handleRejectionSave}
                        onSkip={handleRejectionSkip}
                        onClose={() => setRejectPopover(null)}
                    />
                )}

                <MobileToast />
                <style>{`@keyframes mtrSpin { to { transform: rotate(360deg); } }`}</style>
            </>
        )
    }

    return (
        <>
            <div style={S.page}>
                {/* ── Header ── */}
                <div style={S.head}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={S.eyebrow}>TRACKER</div>
                        <h1 style={S.h1}>Application Pipeline</h1>
                        <div style={S.headSub}>Track every application from sent to signed.</div>
                    </div>
                    <div style={S.headActions}>
                        <button style={S.btnPrimary} onClick={() => { setAddModalTab('matches'); setAddModalOpen(true) }}>
                            + Add Application
                        </button>
                    </div>
                </div>

                {/* ── Resume filter strip ── */}
                <ResumeFilterBar
                    resumes={resumes}
                    selectedId={resumeFilter}
                    onSelect={handleResumeSelect}
                    primaryResumeId={primaryResumeId}
                    countByResume={appCountByResume}
                    totalApps={apps.length}
                    visibleCount={visibleApps.length}
                    loading={loading}
                />

                {/* ── Funnel ── */}
                <div style={S.funnel}>
                    {/* Bar labels */}
                    <div style={S.funnelBarLabels}>
                        {STATUS_ORDER.concat(['withdrawn']).filter(s => counts[s] > 0).map(s => (
                            <span key={s} style={{ color: STATUS_META[s].color }}>
                                <b style={{ color: '#0f172a' }}>{counts[s]}</b> {STATUS_META[s].label}
                            </span>
                        ))}
                    </div>
                    {/* Progress bar */}
                    <div style={S.funnelBar}>
                        {([...STATUS_ORDER, 'withdrawn'] as ApplicationStatus[]).filter(s => counts[s] > 0).map((s, i, arr) => {
                            const width = (counts[s] / Math.max(1, total)) * 100
                            return (
                                <div key={s} style={{
                                    background: STATUS_META[s].color,
                                    width: `${width}%`,
                                    minWidth: 20,
                                    height: '100%',
                                    borderRadius: i === 0 ? '99px 0 0 99px' : i === arr.length - 1 ? '0 99px 99px 0' : 0,
                                }} />
                            )
                        })}
                    </div>
                    {/* Cells */}
                    <div style={S.funnelRow} className="rs-funnel-row">
                        <FCell icon="📨" label="Total Applications" num={total} sub="all time" />
                        <FCell dot="#135bec" label="Applied" num={counts.applied} sub="awaiting response" />
                        <FCell dot="#16a34a" label="Interview" num={counts.interview} sub={counts.interview > 0 ? 'callbacks earned' : 'no callbacks yet'} numColor={counts.interview > 0 ? '#16a34a' : undefined} numSize={counts.interview > 0 ? 42 : undefined} />
                        <FCell dot="#d97706" label="Offer" num={counts.offer} sub={counts.offer > 0 ? '🎉 you earned this' : 'keep pushing'} numColor="#d97706" sparkle={counts.offer > 0} />
                        <FCell icon="📊" label="Response Rate" num={`${responseRate}%`} sub="applications that got a response" />
                        <FCell icon="⏱" label="Avg time to interview" num={avgTimeToInterview} suffix="days" sub="from sent to scheduled" />
                    </div>
                </div>

                {/* ── Upcoming ribbon ── */}
                {upcoming.length > 0 && (
                    <div style={S.ribbon}>
                        <div style={S.ribbonIcon}>⏰</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={S.ribbonEyebrow}>UPCOMING · {upcoming.length} INTERVIEW{upcoming.length > 1 ? 'S' : ''} IN NEXT 7 DAYS</div>
                            <div style={S.ribbonMsg}>
                                Your <b>{displayCompany(upcoming[0])}</b> {displayRole(upcoming[0]).split('·')[0].trim()} interview is in{' '}
                                <b>{fmtFutureInterview(upcoming[0].interview_at)}</b>.
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                            <button style={{ ...S.btnOutline, padding: '7px 12px', fontSize: 12.5, borderRadius: 8 }}
                                onClick={() => { setDrawerId(upcoming[0].id); setDrawerTab('overview') }}>
                                Open research →
                            </button>
                            <button style={S.ribbonLink}
                                onClick={() => { setDrawerId(upcoming[0].id); setDrawerTab('prep') }}>
                                Prep checklist →
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Filtered-empty state — keep the kanban visible but call out the cause ── */}
                {!loading && resumeFilter !== ALL_RESUMES && visibleApps.length === 0 && apps.length > 0 && (
                    <div style={{
                        background: '#fff', border: '1px dashed #cbd5e1', borderRadius: 14,
                        padding: '28px 32px', marginBottom: 18, display: 'flex',
                        alignItems: 'center', gap: 18, flexWrap: 'wrap',
                    }}>
                        <div style={{
                            width: 56, height: 56, borderRadius: 14,
                            background: 'linear-gradient(135deg, #eef4ff 0%, #dbe7ff 100%)',
                            display: 'grid', placeItems: 'center',
                            border: '1px solid #dbeafe', flexShrink: 0,
                        }}>
                            <ResumeFilterDoc size={24} color="#135bec" />
                        </div>
                        <div style={{ flex: 1, minWidth: 240 }}>
                            <div style={{
                                fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
                                fontSize: 10.5, fontWeight: 700, color: '#64748b',
                                letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6,
                            }}>
                                NOTHING TIED TO THIS RESUME YET
                            </div>
                            <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>
                                You have {apps.length} application{apps.length === 1 ? '' : 's'} on other resumes.
                            </div>
                            <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
                                Score this resume against jobs in AI Matches, or import a match below to start its pipeline.
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => handleResumeSelect(ALL_RESUMES)} style={{ ...S.btnOutline, padding: '8px 14px', fontSize: 13, borderRadius: 9 }}>
                                See all applications
                            </button>
                            <button onClick={() => { setAddModalTab('matches'); setAddModalOpen(true) }} style={{ ...S.btnPrimary, padding: '8px 14px', fontSize: 13, borderRadius: 9 }}>
                                Import a match →
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Kanban Board (suppressed when filter hides everything — the banner above tells the story) ── */}
                {!(resumeFilter !== ALL_RESUMES && visibleApps.length === 0 && apps.length > 0) && (
                <div style={S.board} className="rs-board">
                    {STATUS_ORDER.map(status => {
                        const cards = grouped[status]
                        const isDropTarget = dragOverStatus === status
                        return (
                            <div
                                key={status}
                                style={{
                                    ...S.column,
                                    ...(status === 'offer' ? { borderLeftWidth: '2px', borderLeftStyle: 'solid', borderLeftColor: '#fde68a' } : {}),
                                    ...(status === 'rejected' ? { opacity: 0.78 } : {}),
                                    ...(isDropTarget ? {
                                        background: status === 'offer' ? '#fffbeb' : status === 'interview' ? '#f0fdf4' : status === 'rejected' ? '#fef2f2' : '#f0f9ff',
                                        borderTopWidth: '1px', borderRightWidth: '1px', borderBottomWidth: '1px', borderLeftWidth: '1px',
                                        borderTopStyle: 'dashed', borderRightStyle: 'dashed', borderBottomStyle: 'dashed', borderLeftStyle: 'dashed',
                                        borderTopColor: status === 'offer' ? '#fcd34d' : status === 'interview' ? '#86efac' : status === 'rejected' ? '#fca5a5' : '#7dd3fc',
                                        borderRightColor: status === 'offer' ? '#fcd34d' : status === 'interview' ? '#86efac' : status === 'rejected' ? '#fca5a5' : '#7dd3fc',
                                        borderBottomColor: status === 'offer' ? '#fcd34d' : status === 'interview' ? '#86efac' : status === 'rejected' ? '#fca5a5' : '#7dd3fc',
                                        borderLeftColor: status === 'offer' ? '#fcd34d' : status === 'interview' ? '#86efac' : status === 'rejected' ? '#fca5a5' : '#7dd3fc',
                                    } : {}),
                                }}
                                onDragOver={e => { e.preventDefault(); setDragOverStatus(status) }}
                                onDragLeave={() => setDragOverStatus(s => s === status ? null : s)}
                                onDrop={e => {
                                    e.preventDefault()
                                    const id = e.dataTransfer.getData('text/plain')
                                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
                                    moveApp(id, status, { x: rect.left + 40, y: rect.top + 100 })
                                    setDragOverStatus(null)
                                }}
                            >
                                <div style={S.colHead}>
                                    <span style={{ ...S.pill, background: STATUS_META[status].pillBg, color: STATUS_META[status].pillText }}>
                                        <span style={{ ...S.dot, background: STATUS_META[status].dot }} />
                                        {STATUS_META[status].label} {cards.length}
                                    </span>
                                    <button style={S.colAdd} title={`Add to ${STATUS_META[status].label}`}
                                        onClick={() => { setAddModalTab('manual'); setAddModalOpen(true) }}>+</button>
                                </div>
                                <div style={S.colBody}>
                                    {loading ? (
                                        <SkeletonCards count={3} />
                                    ) : cards.length === 0 ? (
                                        <EmptyColumn status={status} />
                                    ) : cards.map(a => (
                                        <AppCard
                                            key={a.id}
                                            app={a}
                                            onClick={() => { setDrawerId(a.id); setDrawerTab('overview') }}
                                            onDragStart={() => setDraggingId(a.id)}
                                            onDragEnd={() => { setDraggingId(null); setDragOverStatus(null) }}
                                            dragging={draggingId === a.id}
                                        />
                                    ))}
                                </div>
                            </div>
                        )
                    })}
                </div>
                )}

                {/* Hint: withdrawn apps live in a tiny strip below the board */}
                {grouped.withdrawn.length > 0 && (
                    <div style={{ marginTop: 24, opacity: 0.6 }}>
                        <div style={{ fontFamily: "var(--font-mono), 'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 10 }}>
                            Withdrawn · {grouped.withdrawn.length}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                            {grouped.withdrawn.map(a => (
                                <AppCard key={a.id} app={a} compact
                                    onClick={() => { setDrawerId(a.id); setDrawerTab('overview') }} />
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* ── Drawer ── */}
            {drawerApp && (
                <DetailDrawer
                    app={drawerApp}
                    tab={drawerTab}
                    onTabChange={setDrawerTab}
                    onClose={() => setDrawerId(null)}
                    onStatusChange={(newStatus, anchor) => moveApp(drawerApp.id, newStatus, anchor)}
                    onDelete={() => handleDeleteApplication(drawerApp.id)}
                    onNotesChange={async (notes) => {
                        setApps(curr => curr.map(x => x.id === drawerApp.id ? { ...x, notes } : x))
                        await updateApplication(drawerApp.id, { notes })
                    }}
                    onInterviewDateChange={async (iso) => {
                        setApps(curr => curr.map(x => x.id === drawerApp.id ? { ...x, interview_at: iso } : x))
                        await updateApplication(drawerApp.id, { interview_at: iso })
                    }}
                />
            )}

            {/* ── Add Application modal ── */}
            {addModalOpen && (
                <AddModal
                    tab={addModalTab}
                    onTabChange={setAddModalTab}
                    matches={matches.filter(m => {
                        // Don't show jobs that are already in the pipeline.
                        if (apps.some(a => a.job_id === m.job_id)) return false
                        // If a specific resume is active, strictly require the match to be scored
                        // against it — drop matches scored on other resumes AND matches with no
                        // resume linkage at all (we can't promise they belong to this resume).
                        if (resumeFilter !== ALL_RESUMES && m.resume_id !== resumeFilter) return false
                        return true
                    })}
                    selectedResumeName={selectedResume ? resumeDisplayName(selectedResume) : null}
                    onClose={() => setAddModalOpen(false)}
                    onAddFromMatch={async (m) => {
                        if (!user?.id) return
                        const created = await createApplication({
                            user_id: user.id,
                            job_id: m.job_id,
                            status: 'applied',
                        })
                        if (created) {
                            const refreshed = await fetchApplications(user.id)
                            setApps(refreshed)
                            showToast(`📨 Applied to ${m.job.company} · ${m.job.title}`)
                            setAddModalOpen(false)
                        }
                    }}
                    onAddManual={async (payload) => {
                        if (!user?.id) return
                        const created = await createApplication({
                            user_id: user.id,
                            external_company: payload.company,
                            external_role: payload.role,
                            external_url: payload.url || null,
                            status: payload.status,
                            notes: payload.notes || null,
                            applied_at: payload.applied_at,
                        })
                        if (created) {
                            const refreshed = await fetchApplications(user.id)
                            setApps(refreshed)
                            showToast(`📨 Added · ${payload.company}`)
                            setAddModalOpen(false)
                        }
                    }}
                />
            )}

            {/* ── Rejection popover ── */}
            {rejectPopover && (
                <RejectionPopover
                    anchor={rejectPopover.anchor}
                    onSave={handleRejectionSave}
                    onSkip={handleRejectionSkip}
                    onClose={() => setRejectPopover(null)}
                />
            )}

            {/* ── Toast ── */}
            {toast && (
                <div style={{
                    position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 80,
                    background: toast.gold ? 'linear-gradient(135deg, #d97706, #b45309)' : '#0f172a',
                    color: '#fff', padding: '14px 22px', borderRadius: 12,
                    fontSize: 14, fontWeight: 600,
                    boxShadow: '0 24px 48px -12px rgba(15,23,42,.18), 0 8px 16px -8px rgba(15,23,42,.08)',
                    maxWidth: 'min(94vw, 480px)',
                    animation: 'rsToastIn 0.35s cubic-bezier(.22,.61,.36,1)',
                }}>
                    {toast.msg}
                </div>
            )}

            <style>{`
                @keyframes rsToastIn { from { opacity: 0; transform: translate(-50%, 20px); } to { opacity: 1; transform: translate(-50%, 0); } }
                @keyframes rsSparkle { 0%, 100% { opacity: 0.4; transform: scale(1) rotate(0deg); } 50% { opacity: 1; transform: scale(1.25) rotate(20deg); } }
                @keyframes rsDrawerIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
                @media (max-width: 1100px) {
                    .rs-funnel-row { grid-template-columns: repeat(3, 1fr) !important; row-gap: 24px !important; }
                    .rs-board { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
                }
                @media (max-width: 700px) {
                    .rs-funnel-row { grid-template-columns: repeat(2, 1fr) !important; }
                    .rs-board { grid-template-columns: 1fr !important; }
                }
            `}</style>
        </>
    )
}

// ── Sub-components ── //

function FCell({ icon, dot, label, num, sub, numColor, numSize, sparkle, suffix }: {
    icon?: string; dot?: string; label: string;
    num: number | string; sub: string;
    numColor?: string; numSize?: number; sparkle?: boolean; suffix?: string;
}) {
    return (
        <div style={S.fcell}>
            <div style={S.fcellLabel}>
                {icon ? <span>{icon}</span> : dot ? <span style={{ ...S.dot, background: dot }} /> : null}
                {label}
            </div>
            <div style={{ ...S.fcellNum, color: numColor ?? '#0f172a', fontSize: numSize ?? 36, position: 'relative', display: 'inline-block' }}>
                {num}
                {suffix && <span style={{ fontSize: 18, fontWeight: 600, color: '#64748b', marginLeft: 4 }}>{suffix}</span>}
                {sparkle && (
                    <span style={{
                        position: 'absolute', top: -6, right: -16, fontSize: 14, color: '#d97706',
                        animation: 'rsSparkle 2.4s ease-in-out infinite',
                    }}>✦</span>
                )}
            </div>
            <div style={S.fcellSub}>{sub}</div>
        </div>
    )
}

function AppCard({ app, onClick, onDragStart, onDragEnd, dragging, compact }: {
    app: Application
    onClick: () => void
    onDragStart?: () => void
    onDragEnd?: () => void
    dragging?: boolean
    compact?: boolean
}) {
    const company = displayCompany(app)
    const role = displayRole(app)
    const [c1, c2] = paletteFor(company)
    const ini = initials(company)
    const interviewFuture = app.status === 'interview' && app.interview_at && new Date(app.interview_at).getTime() > Date.now()
    const upcomingSoon = interviewFuture && (new Date(app.interview_at!).getTime() - Date.now()) <= 7 * 86400000
    const chips: React.ReactNode[] = []
    if (app.optimized_resume) chips.push(<span key="r" style={{ ...S.chip, background: '#eff6ff', color: '#135bec' }}>📄 tailored</span>)
    if (app.company_research) chips.push(<span key="cr" style={{ ...S.chip, background: '#dcfce7', color: '#16a34a' }}>🔍 Researched</span>)
    if (upcomingSoon && (new Date(app.interview_at!).getTime() - Date.now()) <= 36 * 3600000) {
        chips.push(<span key="ic" style={{ ...S.chip, background: '#fef3c7', color: '#d97706' }}>⏰ {fmtFutureInterview(app.interview_at)}</span>)
    }

    return (
        <div
            draggable
            onDragStart={e => {
                e.dataTransfer.setData('text/plain', app.id)
                e.dataTransfer.effectAllowed = 'move'
                onDragStart?.()
            }}
            onDragEnd={onDragEnd}
            onClick={onClick}
            style={{
                ...S.appCard,
                ...(compact ? { padding: '10px 12px' } : {}),
                ...(dragging ? { boxShadow: '0 16px 32px -8px rgba(15,23,42,.18)' } : {}),
                cursor: dragging ? 'grabbing' : 'grab',
            }}
        >
            <div style={S.acTop}>
                <div style={{ ...S.acLogo, background: `linear-gradient(135deg, ${c1}, ${c2})` }}>{ini}</div>
                <div style={S.acCo}>{company}</div>
                <button style={S.acMenu} onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>⋯</button>
            </div>
            <div style={S.acRole}>{role}</div>
            {app.status === 'interview' && app.interview_at && interviewFuture ? (
                <div style={{ ...S.acMeta, color: upcomingSoon ? '#d97706' : '#94a3b8', fontWeight: upcomingSoon ? 600 : 400 }}>
                    ⏰ {fmtFutureInterview(app.interview_at)}
                </div>
            ) : app.status === 'offer' && app.offer_at ? (
                <div style={{ ...S.acMeta, color: '#d97706', fontWeight: 600 }}>
                    🎉 Offer {fmtRelDay(app.offer_at)}
                </div>
            ) : (
                <div style={S.acMeta}>
                    Applied {fmtRelDay(app.applied_at)}
                    {displaySalary(app) && ` · ${displaySalary(app)}`}
                </div>
            )}
            {chips.length > 0 && !compact && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {chips}
                </div>
            )}
        </div>
    )
}

function EmptyColumn({ status }: { status: ApplicationStatus }) {
    const msg = {
        applied:   'Add your first application to get started',
        interview: 'Drag here when you land a callback',
        offer:     '🏆 The destination column. Land one here.',
        rejected:  'Hopefully this stays empty',
        withdrawn: '—',
    }[status]
    return (
        <div style={{
            border: `1.5px dashed ${status === 'offer' ? '#fde68a' : '#e2e8f0'}`,
            borderRadius: 10, padding: '24px 14px', textAlign: 'center',
            color: status === 'offer' ? '#d97706' : '#94a3b8',
            fontSize: 12.5, fontWeight: 500, lineHeight: 1.5,
            background: status === 'offer' ? 'rgba(254,243,199,.3)' : 'transparent',
        }}>
            <span style={{ fontSize: 24, display: 'block', marginBottom: 6, opacity: 0.6 }}>↓</span>
            {msg}
        </div>
    )
}

function SkeletonCards({ count }: { count: number }) {
    return (
        <>
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} style={{
                    height: 110, background: '#f1f5f9', borderRadius: 10,
                    animation: 'rsPulse 1.4s ease-in-out infinite',
                    animationDelay: `${i * 0.15}s`,
                }} />
            ))}
            <style>{`@keyframes rsPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
        </>
    )
}

function DetailDrawer({ app, tab, onTabChange, onClose, onStatusChange, onDelete, onNotesChange, onInterviewDateChange }: {
    app: Application
    tab: 'overview' | 'timeline' | 'notes' | 'prep'
    onTabChange: (t: 'overview' | 'timeline' | 'notes' | 'prep') => void
    onClose: () => void
    onStatusChange: (newStatus: ApplicationStatus, anchor?: { x: number; y: number }) => void
    onDelete: () => void
    onNotesChange: (notes: string) => void
    onInterviewDateChange: (iso: string) => void
}) {
    const company = displayCompany(app)
    const role = displayRole(app)
    const [c1, c2] = paletteFor(company)
    const ini = initials(company)
    return (
        <>
            <div onClick={onClose} style={{
                position: 'fixed', inset: 0, background: 'rgba(15,23,42,.42)',
                backdropFilter: 'blur(2px)', zIndex: 50, animation: 'rsBackdropIn 0.22s ease',
            }} />
            <aside style={S.drawer}>
                <div style={S.dwHead}>
                    <div style={{ ...S.acLogo, width: 48, height: 48, fontSize: 18, borderRadius: 11, background: `linear-gradient(135deg, ${c1}, ${c2})` }}>{ini}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={S.dwCo}>{company}</div>
                        <div style={S.dwRole}>{role}</div>
                        <span style={{ ...S.pill, background: STATUS_META[app.status].pillBg, color: STATUS_META[app.status].pillText }}>
                            <span style={{ ...S.dot, background: STATUS_META[app.status].dot }} />
                            {STATUS_META[app.status].label}
                        </span>
                    </div>
                    <button style={S.dwClose} onClick={onClose}>×</button>
                </div>
                <div style={S.tabs}>
                    {(['overview', 'timeline', 'notes', 'prep'] as const).map(t => (
                        <button key={t} style={{
                            ...S.tab,
                            color: tab === t ? '#135bec' : '#64748b',
                            borderBottom: tab === t ? '2px solid #135bec' : '2px solid transparent',
                        }} onClick={() => onTabChange(t)}>
                            {t === 'overview' ? 'Overview' : t === 'timeline' ? 'Timeline' : t === 'notes' ? 'Notes' : 'Interview Prep'}
                        </button>
                    ))}
                </div>
                <div style={S.dwBody}>
                    {tab === 'overview' && <OverviewTab app={app} onStatusChange={onStatusChange} onDelete={onDelete} />}
                    {tab === 'timeline' && <TimelineTab app={app} />}
                    {tab === 'notes' && <NotesTab app={app} onNotesChange={onNotesChange} />}
                    {tab === 'prep' && <PrepTab app={app} onInterviewDateChange={onInterviewDateChange} />}
                </div>
            </aside>
            <style>{`@keyframes rsBackdropIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
        </>
    )
}

function OverviewTab({ app, onStatusChange, onDelete }: { app: Application; onStatusChange: (s: ApplicationStatus, a?: { x: number; y: number }) => void; onDelete: () => void }) {
    const url = displayUrl(app)
    const salary = displaySalary(app)
    const location = displayLocation(app)
    return (
        <>
            <div style={S.dwCard}>
                <div style={S.dwCardHead}>Job posting</div>
                <DwRow k="Salary" v={salary ?? '—'} />
                <DwRow k="Location" v={location ?? '—'} />
                <DwRow k="Applied" v={fmtRelDay(app.applied_at) || '—'} />
                {url && <DwRow k="Source" v={<a href={url} target="_blank" rel="noreferrer" style={S.dwLink}>View original ↗</a>} last />}
            </div>

            {app.optimized_resume ? (
                <div style={S.dwCard}>
                    <div style={S.dwCardHead}>Tailored Resume</div>
                    <div style={S.dwResume}>
                        <div style={S.dwResumeThumb}>📄</div>
                        <div style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>
                            <b style={{ fontSize: 13, color: '#0f172a', display: 'block', marginBottom: 2 }}>Tailored resume</b>
                            <span style={{ color: '#135bec', fontWeight: 600, fontSize: 11.5 }}>
                                {app.optimized_resume.keyword_alignment_score ? `${Math.round(app.optimized_resume.keyword_alignment_score)}% match` : 'Tailored for this role'}
                            </span>
                        </div>
                        <Link href="/dashboard/resumes" style={{ ...S.btnOutline, padding: '6px 12px', fontSize: 12.5, borderRadius: 8 }}>View</Link>
                    </div>
                </div>
            ) : (
                <div style={{ ...S.dwCard, borderStyle: 'dashed', textAlign: 'center' }}>
                    <div style={S.dwCardHead}>No tailored resume yet</div>
                    <div style={{ fontSize: 12.5, color: '#64748b', marginBottom: 10 }}>Tailor a resume for this role to lift your match score.</div>
                    <Link href={app.job_id ? `/dashboard/optimize?jobId=${app.job_id}` : '/dashboard/optimize'}
                        style={{ ...S.btnPrimary, padding: '7px 12px', fontSize: 12.5, borderRadius: 8 }}>
                        📄 Tailor a resume
                    </Link>
                </div>
            )}

            {app.company_research ? (
                <div style={S.dwCard}>
                    <div style={S.dwCardHead}>Company research</div>
                    <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 10, padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <div style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>🔍</div>
                        <div style={{ flex: 1, fontSize: 12.5, color: '#166534', lineHeight: 1.5 }}>
                            <b style={{ color: '#14532d', fontSize: 13, display: 'block', marginBottom: 3 }}>
                                {app.company_research.company_name} Research Report
                            </b>
                            Strong fit analysis available — open the full report for details.
                        </div>
                    </div>
                    <Link href="/dashboard/research" style={{ ...S.dwLink, display: 'inline-block', marginTop: 8 }}>Open full report →</Link>
                </div>
            ) : (
                <div style={{ ...S.dwCard, borderStyle: 'dashed', textAlign: 'center' }}>
                    <div style={S.dwCardHead}>No company research yet</div>
                    <Link href="/dashboard/research" style={{ ...S.btnOutline, padding: '6px 12px', fontSize: 12.5, borderRadius: 8 }}>
                        🔍 Research {displayCompany(app)}
                    </Link>
                </div>
            )}

            {/* Transitions */}
            <div style={{ marginTop: 16, paddingTop: 18, borderTop: '1px solid #eef2f7' }}>
                <div style={S.dwTransitionsEyebrow}>Move this application</div>
                {app.status === 'applied' && (
                    <>
                        <button style={{ ...S.btnGreen, width: '100%', justifyContent: 'center', marginBottom: 8 }}
                            onClick={(e) => onStatusChange('interview', { x: e.clientX, y: e.clientY })}>
                            ✓ Mark as Interview
                        </button>
                        <button style={{ ...S.btnGold, width: '100%', justifyContent: 'center', marginBottom: 8 }}
                            onClick={(e) => onStatusChange('offer', { x: e.clientX, y: e.clientY })}>
                            🏆 Mark as Offer
                        </button>
                        <button style={{ ...S.btnRedOutline, width: '100%', justifyContent: 'center', marginBottom: 8 }}
                            onClick={(e) => onStatusChange('rejected', { x: e.clientX, y: e.clientY })}>
                            Mark as Rejected
                        </button>
                    </>
                )}
                {app.status === 'interview' && (
                    <>
                        <button style={{ ...S.btnGold, width: '100%', justifyContent: 'center', marginBottom: 8 }}
                            onClick={(e) => onStatusChange('offer', { x: e.clientX, y: e.clientY })}>
                            🏆 Mark as Offer
                        </button>
                        <button style={{ ...S.btnRedOutline, width: '100%', justifyContent: 'center', marginBottom: 8 }}
                            onClick={(e) => onStatusChange('rejected', { x: e.clientX, y: e.clientY })}>
                            Mark as Rejected
                        </button>
                    </>
                )}
                {app.status === 'offer' && (
                    <button style={{ ...S.btnOutline, width: '100%', justifyContent: 'center', marginBottom: 8 }}
                        onClick={(e) => onStatusChange('rejected', { x: e.clientX, y: e.clientY })}>
                        Decline offer
                    </button>
                )}
                {(app.status === 'rejected' || app.status === 'withdrawn') && (
                    <button style={{ ...S.btnOutline, width: '100%', justifyContent: 'center', marginBottom: 8 }}
                        onClick={(e) => onStatusChange('applied', { x: e.clientX, y: e.clientY })}>
                        Re-open application
                    </button>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                    {(app.status !== 'withdrawn' && app.status !== 'rejected') && (
                        <button style={S.ghostLink}
                            onClick={(e) => onStatusChange('withdrawn', { x: e.clientX, y: e.clientY })}>
                            Withdraw application
                        </button>
                    )}
                    <button style={{ ...S.ghostLink, color: '#dc2626', marginLeft: 'auto' }} onClick={onDelete}>Delete</button>
                </div>
            </div>
        </>
    )
}

function DwRow({ k, v, last }: { k: string; v: React.ReactNode; last?: boolean }) {
    return (
        <div style={{
            display: 'flex', justifyContent: 'space-between', fontSize: 13.5, padding: '7px 0',
            borderBottom: last ? 'none' : '1px dashed #eef2f7',
        }}>
            <span style={{ color: '#64748b' }}>{k}</span>
            <span style={{ color: '#0f172a', fontWeight: 600 }}>{v}</span>
        </div>
    )
}

function TimelineTab({ app }: { app: Application }) {
    const history = app.status_history ?? []
    return (
        <div style={{ paddingLeft: 8, position: 'relative' }}>
            {history.map((h, i) => (
                <div key={i} style={{ position: 'relative', display: 'grid', gridTemplateColumns: '20px 1fr', gap: 14, paddingBottom: 18 }}>
                    {i < history.length - 1 && (
                        <div style={{ position: 'absolute', left: 9, top: 18, bottom: 0, width: 2, background: '#e2e8f0' }} />
                    )}
                    <div style={{
                        width: 11, height: 11, borderRadius: '50%',
                        marginTop: 6, marginLeft: 4,
                        background: STATUS_META[h.status]?.dot ?? '#94a3b8',
                        boxShadow: `0 0 0 1.5px ${STATUS_META[h.status]?.dot ?? '#94a3b8'}, 0 0 0 4px #fff`,
                    }} />
                    <div style={{ fontSize: 13.5 }}>
                        <div style={{
                            fontFamily: "var(--font-mono), 'JetBrains Mono', monospace", fontSize: 10.5,
                            fontWeight: 600, color: '#64748b', letterSpacing: '0.06em',
                            marginBottom: 3, textTransform: 'uppercase',
                        }}>{fmtDateShort(h.at)}</div>
                        <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>
                            {h.status === 'applied' ? 'Applied' : `Moved to ${STATUS_META[h.status]?.label}`}
                        </div>
                        {h.note && <div style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.5 }}>{h.note}</div>}
                    </div>
                </div>
            ))}
            {history.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                    No timeline events yet.
                </div>
            )}
        </div>
    )
}

function NotesTab({ app, onNotesChange }: { app: Application; onNotesChange: (notes: string) => void }) {
    const [notes, setNotes] = useState(app.notes ?? '')
    const [saved, setSaved] = useState(false)
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    useEffect(() => {
        if (notes === (app.notes ?? '')) return
        if (saveTimer.current) clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(() => {
            onNotesChange(notes)
            setSaved(true)
            setTimeout(() => setSaved(false), 1600)
        }, 800)
        return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
    }, [notes, app.notes, onNotesChange])
    return (
        <>
            <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Capture anything important about this role — recruiter names, prep ideas, deal-breakers, salary signal..."
                style={S.notesTextarea}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 11.5, color: '#94a3b8' }}>
                <span>{notes.length} characters</span>
                {saved && (
                    <span style={{
                        color: '#16a34a', fontWeight: 600, fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
                        fontSize: 10.5, letterSpacing: '0.05em',
                    }}>● Saved just now</span>
                )}
            </div>
        </>
    )
}

function PrepTab({ app, onInterviewDateChange }: { app: Application; onInterviewDateChange: (iso: string) => void }) {
    const [dateInput, setDateInput] = useState(app.interview_at ? new Date(app.interview_at).toISOString().slice(0, 16) : '')
    return (
        <>
            <div style={{ marginBottom: 14 }}>
                <label style={{ ...S.fieldLabel, marginBottom: 6, display: 'block' }}>Interview date & time</label>
                <input
                    type="datetime-local"
                    value={dateInput}
                    onChange={e => setDateInput(e.target.value)}
                    onBlur={() => { if (dateInput) onInterviewDateChange(new Date(dateInput).toISOString()) }}
                    style={S.input}
                />
            </div>
            {app.company_research && (
                <div style={{ marginBottom: 14 }}>
                    <label style={S.fieldLabel}>Suggested talking points · from research</label>
                    <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6, padding: 0 }}>
                        <li style={{
                            display: 'flex', gap: 10, padding: '10px 12px', background: '#dcfce7',
                            borderRadius: 8, fontSize: 13, color: '#166534', lineHeight: 1.45,
                        }}>
                            <span>💡</span>
                            Research the company first — pull insights from your saved report to anchor your answers.
                        </li>
                    </ul>
                </div>
            )}
            <div>
                <label style={S.fieldLabel}>Common questions for {(displayRole(app).split('·')[0] || displayRole(app)).trim()}</label>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6, padding: 0 }}>
                    {[
                        'Walk me through your most challenging project and the trade-offs you made.',
                        'How would you design a URL shortener? Estimate scale.',
                        'Explain the difference between processes and threads, with an example.',
                        'SQL: write a query for the 2nd-highest salary in a table.',
                        'Tell me about a time you debugged a tricky production issue.',
                    ].map((q, i) => (
                        <li key={i} style={{
                            display: 'flex', gap: 10, padding: '10px 12px', background: '#eff6ff',
                            borderRadius: 8, fontSize: 13, color: '#1e3a8a', lineHeight: 1.45,
                        }}>
                            <span style={{ color: '#135bec', fontWeight: 700, flexShrink: 0 }}>→</span>
                            {q}
                        </li>
                    ))}
                </ul>
            </div>
        </>
    )
}

function AddModal({ tab, onTabChange, matches, selectedResumeName, onClose, onAddFromMatch, onAddManual }: {
    tab: 'matches' | 'manual'
    onTabChange: (t: 'matches' | 'manual') => void
    matches: FullMatch[]
    selectedResumeName: string | null
    onClose: () => void
    onAddFromMatch: (m: FullMatch) => void
    onAddManual: (payload: { company: string; role: string; url: string; status: ApplicationStatus; notes: string; applied_at: string }) => void
}) {
    const [filter, setFilter] = useState<'all' | '70' | '80'>('all')
    const [form, setForm] = useState({
        company: '', role: '', url: '',
        status: 'applied' as ApplicationStatus,
        notes: '',
        applied_at: new Date().toISOString().slice(0, 10),
    })
    const filteredMatches = matches
        .filter(m => filter === 'all' ? true : filter === '70' ? (m.relevance_score ?? 0) >= 70 : (m.relevance_score ?? 0) >= 80)
        .slice(0, 8)

    return (
        <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{
            position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24, background: 'rgba(15,23,42,.42)', backdropFilter: 'blur(2px)',
        }}>
            <div style={{
                width: 580, maxWidth: '100%', background: '#fff', borderRadius: 18,
                boxShadow: '0 24px 48px -12px rgba(15,23,42,.14), 0 8px 16px -8px rgba(15,23,42,.06)',
                padding: 28, maxHeight: 'calc(100vh - 48px)', overflowY: 'auto',
                animation: 'rsModalIn 0.2s ease',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                    <div>
                        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.015em' }}>Add application</div>
                        <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                            {selectedResumeName
                                ? <>Pulling matches scored with <b style={{ color: '#135bec' }}>{selectedResumeName}</b>.</>
                                : 'Pull from your AI matches or enter one manually.'}
                        </div>
                    </div>
                    <button onClick={onClose} style={{
                        width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center',
                        color: '#64748b', fontSize: 20, lineHeight: 1, background: 'transparent', border: 'none', cursor: 'pointer',
                    }}>×</button>
                </div>
                <div style={{
                    display: 'flex', background: '#f1f5f9', borderRadius: 10, padding: 4, marginBottom: 18, gap: 2,
                }}>
                    <button onClick={() => onTabChange('matches')} style={{
                        flex: 1, padding: '8px 12px', borderRadius: 7, fontSize: 13, fontWeight: 600,
                        background: tab === 'matches' ? '#fff' : 'transparent',
                        color: tab === 'matches' ? '#135bec' : '#64748b',
                        boxShadow: tab === 'matches' ? '0 1px 3px rgba(15,23,42,.08)' : 'none',
                        border: 'none', cursor: 'pointer',
                    }}>From your matches</button>
                    <button onClick={() => onTabChange('manual')} style={{
                        flex: 1, padding: '8px 12px', borderRadius: 7, fontSize: 13, fontWeight: 600,
                        background: tab === 'manual' ? '#fff' : 'transparent',
                        color: tab === 'manual' ? '#135bec' : '#64748b',
                        boxShadow: tab === 'manual' ? '0 1px 3px rgba(15,23,42,.08)' : 'none',
                        border: 'none', cursor: 'pointer',
                    }}>Manually</button>
                </div>

                {tab === 'matches' ? (
                    <>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                            {(['all', '70', '80'] as const).map(f => (
                                <button key={f} onClick={() => setFilter(f)} style={{
                                    fontSize: 11.5, fontWeight: 600, padding: '5px 10px', borderRadius: 99,
                                    background: filter === f ? '#eff6ff' : '#fff',
                                    border: `1px solid ${filter === f ? '#dbeafe' : '#e2e8f0'}`,
                                    color: filter === f ? '#135bec' : '#475569', cursor: 'pointer',
                                }}>
                                    {f === 'all' ? 'All' : `≥ ${f}% match`}
                                </button>
                            ))}
                        </div>
                        {filteredMatches.length === 0 ? (
                            <div style={{ padding: '24px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 13, border: '1.5px dashed #e2e8f0', borderRadius: 10, lineHeight: 1.55 }}>
                                {selectedResumeName ? (
                                    <>
                                        <div style={{ fontSize: 24, marginBottom: 6 }}>🎯</div>
                                        <div style={{ color: '#475569', fontWeight: 600, marginBottom: 4 }}>
                                            No matches scored with <span style={{ color: '#135bec' }}>{selectedResumeName}</span> yet.
                                        </div>
                                        <div>Score this resume against jobs in AI Matches, or add a job manually.</div>
                                    </>
                                ) : (
                                    'No unapplied matches at this threshold. Lower the filter or score more jobs.'
                                )}
                            </div>
                        ) : filteredMatches.map(m => {
                            const [c1, c2] = paletteFor(m.job.company)
                            return (
                                <div key={m.id} style={{
                                    display: 'flex', alignItems: 'center', gap: 12, padding: 12,
                                    border: '1px solid #e2e8f0', borderRadius: 10, marginBottom: 8,
                                }}>
                                    <div style={{ ...S.acLogo, width: 36, height: 36, fontSize: 14, background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
                                        {initials(m.job.company)}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <b style={{ fontSize: 13.5, display: 'block', fontWeight: 700, color: '#0f172a' }}>{m.job.title}</b>
                                        <span style={{ fontSize: 11.5, color: '#94a3b8' }}>
                                            {m.job.company} {m.job.location ? `· ${m.job.location}` : ''}
                                        </span>
                                    </div>
                                    <div style={{
                                        fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
                                        fontSize: 14, fontWeight: 800, color: '#16a34a', padding: '0 10px',
                                    }}>{Math.round(m.relevance_score ?? 0)}</div>
                                    <button onClick={() => onAddFromMatch(m)} style={{ ...S.btnPrimary, padding: '7px 12px', fontSize: 12.5, borderRadius: 8 }}>
                                        Apply
                                    </button>
                                </div>
                            )
                        })}
                    </>
                ) : (
                    <div style={{ display: 'grid', gap: 12 }}>
                        <div>
                            <label style={S.fieldLabel}>Company name</label>
                            <input style={S.input} value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} placeholder="e.g. Postman" />
                        </div>
                        <div>
                            <label style={S.fieldLabel}>Role title</label>
                            <input style={S.input} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} placeholder="e.g. Associate Software Engineer" />
                        </div>
                        <div>
                            <label style={S.fieldLabel}>Job URL (optional)</label>
                            <input style={S.input} value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://..." />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                                <label style={S.fieldLabel}>Applied date</label>
                                <input type="date" style={S.input} value={form.applied_at} onChange={e => setForm({ ...form, applied_at: e.target.value })} />
                            </div>
                            <div>
                                <label style={S.fieldLabel}>Status</label>
                                <select style={S.input} value={form.status} onChange={e => setForm({ ...form, status: e.target.value as ApplicationStatus })}>
                                    {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label style={S.fieldLabel}>Notes (optional)</label>
                            <textarea style={{ ...S.input, minHeight: 70 }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Anything to remember…" />
                        </div>
                    </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, paddingTop: 16, borderTop: '1px solid #eef2f7' }}>
                    <button style={S.btnGhost} onClick={onClose}>Cancel</button>
                    {tab === 'manual' ? (
                        <button style={S.btnPrimary} disabled={!form.company.trim() || !form.role.trim()}
                            onClick={() => onAddManual({
                                company: form.company.trim(), role: form.role.trim(), url: form.url.trim(),
                                status: form.status, notes: form.notes, applied_at: new Date(form.applied_at).toISOString(),
                            })}>
                            Add to Tracker
                        </button>
                    ) : (
                        <button style={S.btnOutline} onClick={() => onTabChange('manual')}>+ Add manually instead</button>
                    )}
                </div>
                <style>{`@keyframes rsModalIn { from { opacity: 0; transform: scale(.96) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }`}</style>
            </div>
        </div>
    )
}

function MobileAddSheet({ tab, onTabChange, matches, selectedResumeName, onClose, onAddFromMatch, onAddManual }: {
    tab: 'matches' | 'manual'
    onTabChange: (t: 'matches' | 'manual') => void
    matches: FullMatch[]
    selectedResumeName: string | null
    onClose: () => void
    onAddFromMatch: (m: FullMatch) => void
    onAddManual: (payload: { company: string; role: string; url: string; status: ApplicationStatus; notes: string; applied_at: string }) => void
}) {
    const [filter, setFilter] = useState<'all' | '70' | '80'>('all')
    const [form, setForm] = useState({
        company: '', role: '', url: '',
        status: 'applied' as ApplicationStatus,
        notes: '',
        applied_at: new Date().toISOString().slice(0, 10),
    })
    const filteredMatches = matches
        .filter(m => filter === 'all' ? true : filter === '70' ? (m.relevance_score ?? 0) >= 70 : (m.relevance_score ?? 0) >= 80)
        .slice(0, 8)

    const fieldLabel: React.CSSProperties = {
        fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
        fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', color: '#64748b',
        display: 'block', marginBottom: 5, letterSpacing: '0.06em',
    }
    const fieldInput: React.CSSProperties = {
        width: '100%', padding: '9px 11px', borderRadius: 9,
        border: '1px solid #e2e8f0', fontSize: 13.5, fontFamily: 'inherit',
        color: '#0f172a', outline: 'none', background: '#fff',
    }

    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(3px)', zIndex: 48 }} />
            <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderRadius: '22px 22px 0 0', maxHeight: '88vh', display: 'flex', flexDirection: 'column', zIndex: 49, animation: 'mobSheetUp 0.28s cubic-bezier(.32,.72,.2,1)' }}>
                {/* Handle */}
                <div style={{ width: 36, height: 4, borderRadius: 99, background: '#e2e8f0', margin: '12px auto 0', flexShrink: 0 }} />
                {/* Header */}
                <div style={{ padding: '14px 18px 0', position: 'relative', flexShrink: 0 }}>
                    <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>Add application</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        {selectedResumeName
                            ? <>Pulling matches scored with <b style={{ color: '#135bec' }}>{selectedResumeName}</b></>
                            : 'Pull from your AI matches or enter one manually.'}
                    </div>
                    <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 16, width: 28, height: 28, borderRadius: 8, background: '#f1f5f9', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', cursor: 'pointer', fontSize: 18, lineHeight: 1, fontFamily: 'inherit' }}>×</button>
                </div>
                {/* Segment control */}
                <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 10, padding: 4, margin: '12px 16px 0', gap: 3, flexShrink: 0 }}>
                    {(['matches', 'manual'] as const).map(t => (
                        <button key={t} onClick={() => onTabChange(t)} style={{ flex: 1, padding: 8, borderRadius: 7, border: 'none', fontSize: 12.5, fontWeight: tab === t ? 700 : 600, background: tab === t ? '#fff' : 'none', color: tab === t ? '#135bec' : '#64748b', boxShadow: tab === t ? '0 1px 3px rgba(15,23,42,0.1)' : 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                            {t === 'matches' ? 'From your matches' : 'Manually'}
                        </button>
                    ))}
                </div>
                {/* Matches tab */}
                {tab === 'matches' && (
                    <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px' }}>
                        {/* Score filter chips */}
                        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                            {(['all', '70', '80'] as const).map(f => (
                                <button key={f} onClick={() => setFilter(f)} style={{ padding: '5px 13px', borderRadius: 99, border: `1.5px solid ${filter === f ? '#135bec' : '#e2e8f0'}`, background: filter === f ? '#eff6ff' : '#fff', color: filter === f ? '#135bec' : '#64748b', fontSize: 11.5, fontWeight: filter === f ? 700 : 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                                    {f === 'all' ? 'All' : `≥${f}% match`}
                                </button>
                            ))}
                        </div>
                        {filteredMatches.length === 0 ? (
                            <div style={{ padding: '24px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 13, border: '1.5px dashed #e2e8f0', borderRadius: 10, lineHeight: 1.55 }}>
                                {selectedResumeName ? (
                                    <><div style={{ fontSize: 22, marginBottom: 6 }}>🎯</div><div style={{ color: '#475569', fontWeight: 600, marginBottom: 4 }}>No matches for <span style={{ color: '#135bec' }}>{selectedResumeName}</span> yet.</div><div>Score this resume in AI Matches first.</div></>
                                ) : 'No unapplied matches at this threshold. Lower the filter or score more jobs.'}
                            </div>
                        ) : filteredMatches.map(m => {
                            const [c1, c2] = paletteFor(m.job.company)
                            const score = Math.round(m.relevance_score ?? 0)
                            const scoreBg = score >= 80 ? '#dcfce7' : score >= 70 ? '#eff6ff' : '#fef3c7'
                            const scoreColor = score >= 80 ? '#15803d' : score >= 70 ? '#135bec' : '#b45309'
                            return (
                                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 11px', border: '1px solid #e2e8f0', borderRadius: 11, background: '#fff', marginBottom: 8 }}>
                                    <div style={{ width: 38, height: 38, borderRadius: 10, background: `linear-gradient(135deg, ${c1}, ${c2})`, display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: 14, flexShrink: 0 }}>{initials(m.job.company)}</div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.job.title}</div>
                                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{m.job.company}{m.job.location ? ` · ${m.job.location}` : ''}</div>
                                    </div>
                                    <div style={{ fontFamily: "var(--font-mono), 'JetBrains Mono', monospace", fontSize: 13, fontWeight: 800, padding: '5px 8px', borderRadius: 8, background: scoreBg, color: scoreColor, flexShrink: 0 }}>{score}</div>
                                    <button onClick={() => onAddFromMatch(m)} style={{ padding: '6px 13px', borderRadius: 8, border: 'none', background: '#135bec', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>Apply</button>
                                </div>
                            )
                        })}
                    </div>
                )}
                {/* Manual tab */}
                {tab === 'manual' && (
                    <>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px' }}>
                            <div style={{ marginBottom: 10 }}>
                                <label style={fieldLabel}>Company Name *</label>
                                <input style={fieldInput} value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} placeholder="e.g. SysCloud, Infosys, TCS…" />
                            </div>
                            <div style={{ marginBottom: 10 }}>
                                <label style={fieldLabel}>Job Title *</label>
                                <input style={fieldInput} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} placeholder="e.g. Junior DevOps Engineer" />
                            </div>
                            <div style={{ marginBottom: 10 }}>
                                <label style={fieldLabel}>Job URL (optional)</label>
                                <input style={fieldInput} value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://…" />
                            </div>
                            <div style={{ marginBottom: 10 }}>
                                <label style={fieldLabel}>Status</label>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {STATUS_ORDER.map(s => (
                                        <button key={s} onClick={() => setForm({ ...form, status: s })} style={{ padding: '7px 13px', borderRadius: 99, border: `1.5px solid ${form.status === s ? STATUS_META[s].dot : '#e2e8f0'}`, background: form.status === s ? STATUS_META[s].bg : '#fff', color: form.status === s ? STATUS_META[s].color : '#64748b', fontSize: 12, fontWeight: form.status === s ? 700 : 600, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_META[s].dot, flexShrink: 0 }} />{STATUS_META[s].label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div style={{ marginBottom: 10 }}>
                                <label style={fieldLabel}>Applied Date</label>
                                <input type="date" style={fieldInput} value={form.applied_at} onChange={e => setForm({ ...form, applied_at: e.target.value })} />
                            </div>
                            <div style={{ marginBottom: 10 }}>
                                <label style={fieldLabel}>Notes (optional)</label>
                                <textarea style={{ ...fieldInput, resize: 'vertical', minHeight: 64 } as React.CSSProperties} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Referral, job link, contact name…" />
                            </div>
                        </div>
                        <div style={{ padding: '11px 16px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8, flexShrink: 0 }}>
                            <button onClick={onClose} style={{ flex: 1, padding: 11, borderRadius: 10, border: '1px solid #cfe2ff', background: '#fff', color: '#1e3a6e', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                            <button disabled={!form.company.trim() || !form.role.trim()} onClick={() => onAddManual({ company: form.company.trim(), role: form.role.trim(), url: form.url.trim(), status: form.status, notes: form.notes, applied_at: new Date(form.applied_at).toISOString() })} style={{ flex: 2, padding: 11, border: 'none', borderRadius: 10, background: '#135bec', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 3px 10px rgba(19,91,236,0.3)', opacity: (!form.company.trim() || !form.role.trim()) ? 0.5 : 1 }}>Save Application</button>
                        </div>
                    </>
                )}
            </div>
            <style>{`@keyframes mobSheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
        </>
    )
}

function RejectionPopover({ anchor, onSave, onSkip, onClose }: {
    anchor: { x: number; y: number }
    onSave: (reason: ApplicationRejectionReason, note?: string) => void
    onSkip: () => void
    onClose: () => void
}) {
    const [reason, setReason] = useState<ApplicationRejectionReason>('ghosted')
    const [note, setNote] = useState('')
    return (
        <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{ position: 'fixed', inset: 0, zIndex: 70 }}>
            <div style={{
                position: 'absolute',
                left: Math.min(window.innerWidth - 340, Math.max(20, anchor.x)),
                top: Math.min(window.innerHeight - 320, anchor.y),
                width: 320,
                background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
                padding: 18, boxShadow: '0 24px 48px -12px rgba(15,23,42,.18)',
            }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
                    📝 What happened?
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                    {[
                        ['ghosted', 'No response (ghosted)'],
                        ['rejected_after_application', 'Rejected after application'],
                        ['rejected_after_interview', 'Rejected after interview'],
                        ['i_withdrew', 'I withdrew'],
                        ['better_offer_elsewhere', 'Better offer elsewhere'],
                    ].map(([value, label]) => (
                        <label key={value as string} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#475569', cursor: 'pointer' }}>
                            <input type="radio" name="rsn" value={value as string} checked={reason === value}
                                onChange={() => setReason(value as ApplicationRejectionReason)}
                                style={{ accentColor: '#dc2626' }} />
                            {label}
                        </label>
                    ))}
                </div>
                <textarea
                    value={note} onChange={e => setNote(e.target.value)}
                    placeholder="Anything to remember for next time? (optional)"
                    style={{ width: '100%', fontSize: 12.5, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, minHeight: 60, marginBottom: 12, fontFamily: 'inherit', outline: 'none' }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button style={{ ...S.btnGhost, padding: '7px 12px', fontSize: 12.5, borderRadius: 8 }} onClick={onSkip}>Skip</button>
                    <button style={{ ...S.btnRed, padding: '7px 12px', fontSize: 12.5, borderRadius: 8 }}
                        onClick={() => onSave(reason, note || undefined)}>Save reason</button>
                </div>
            </div>
        </div>
    )
}

// Lightweight confetti (CSS particles)
function fireConfetti() {
    const canvas = document.createElement('div')
    canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:79;overflow:hidden'
    document.body.appendChild(canvas)
    const colors = ['#d97706', '#fbbf24', '#fde68a', '#135bec', '#16a34a']
    for (let i = 0; i < 60; i++) {
        const p = document.createElement('div')
        const size = 6 + Math.random() * 6
        p.style.cssText = `
            position:absolute;top:-20px;left:${Math.random() * 100}%;
            width:${size}px;height:${size}px;
            background:${colors[Math.floor(Math.random() * colors.length)]};
            border-radius:${Math.random() > 0.5 ? '50%' : '2px'};
            animation:rsConfetti ${1.5 + Math.random() * 1.5}s ease-out forwards;
            animation-delay:${Math.random() * 0.3}s;
        `
        canvas.appendChild(p)
    }
    if (!document.getElementById('rs-confetti-style')) {
        const style = document.createElement('style')
        style.id = 'rs-confetti-style'
        style.textContent = `@keyframes rsConfetti { to { transform: translateY(100vh) rotate(720deg); opacity: 0; } }`
        document.head.appendChild(style)
    }
    setTimeout(() => canvas.remove(), 3500)
}

// ── Resume Filter Bar ── //

/**
 * Resume scope strip. Sits between the page header and the funnel, telling the
 * user which resume's pipeline they're looking at and letting them swap to a
 * different one. Pattern mirrors the matches page selector so muscle memory
 * carries over.
 */
function ResumeFilterBar({
    resumes, selectedId, onSelect, primaryResumeId, countByResume, totalApps, visibleCount, loading,
}: {
    resumes: Resume[]
    selectedId: ResumeFilter
    onSelect: (id: ResumeFilter) => void
    primaryResumeId: string | null
    countByResume: Record<string, number>
    totalApps: number
    visibleCount: number
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

    // Pre-load: no resumes uploaded yet.
    if (!loading && resumes.length === 0) {
        return (
            <Link href="/dashboard/upload" style={{
                display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22,
                padding: '12px 16px', background: '#f8fafc', border: '1px dashed #cbd5e1',
                borderRadius: 12, fontSize: 13, color: '#64748b', textDecoration: 'none',
            }}>
                <span style={{
                    width: 36, height: 36, borderRadius: 9, background: '#fff',
                    border: '1px dashed #cbd5e1', display: 'grid', placeItems: 'center', color: '#94a3b8',
                }}>
                    <ResumeFilterDoc size={16} color="#94a3b8" />
                </span>
                <span style={{ flex: 1 }}>Upload a resume to scope your pipeline to it.</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#135bec' }}>Upload →</span>
            </Link>
        )
    }

    const selected = selectedId === ALL_RESUMES ? null : resumes.find(r => r.id === selectedId) ?? null
    const isAll = selectedId === ALL_RESUMES

    return (
        <div ref={wrapperRef} style={{
            position: 'relative', marginBottom: 22, display: 'flex',
            alignItems: 'stretch', gap: 12, flexWrap: 'wrap',
        }}>
            {/* ── Trigger pill ── */}
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-haspopup="listbox"
                aria-expanded={open}
                style={{
                    flex: '1 1 360px',
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '11px 16px 11px 14px',
                    background: '#fff',
                    border: open ? '1.5px solid #135bec' : '1.5px solid #e2e8f0',
                    borderRadius: 14,
                    cursor: 'pointer', textAlign: 'left',
                    fontFamily: 'inherit',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                    boxShadow: open
                        ? '0 0 0 4px rgba(19,91,236,0.12), 0 1px 3px rgba(15,23,42,0.04)'
                        : '0 1px 3px rgba(15,23,42,0.04)',
                    position: 'relative',
                    overflow: 'hidden',
                    minWidth: 0,
                }}
                onMouseEnter={e => { if (!open) e.currentTarget.style.borderColor = '#c7d8f8' }}
                onMouseLeave={e => { if (!open) e.currentTarget.style.borderColor = '#e2e8f0' }}
            >
                {/* Left accent stripe */}
                <span style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
                    background: isAll ? '#94a3b8' : '#135bec',
                }} />
                <div style={{
                    flexShrink: 0,
                    width: 42, height: 42, borderRadius: 11,
                    background: isAll
                        ? 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)'
                        : 'linear-gradient(135deg, #eef4ff 0%, #dbe7ff 100%)',
                    display: 'grid', placeItems: 'center',
                    border: isAll ? '1px solid #e2e8f0' : '1px solid #dbeafe',
                }}>
                    <ResumeFilterDoc size={19} color={isAll ? '#64748b' : '#135bec'} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                        fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
                        fontSize: 10, fontWeight: 700, color: '#94a3b8',
                        letterSpacing: '0.12em', textTransform: 'uppercase',
                        marginBottom: 3,
                    }}>
                        Pipeline scope
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                        <span style={{
                            fontSize: 15, fontWeight: 700, color: '#0f172a',
                            letterSpacing: '-0.01em',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            maxWidth: 260,
                        }}>
                            {selected ? resumeDisplayName(selected) : 'All resumes'}
                        </span>
                        {selected && primaryResumeId === selected.id && <ResumeFilterStar />}
                        <span style={{
                            fontSize: 11, fontWeight: 600, color: '#475569',
                            padding: '2px 8px', borderRadius: 99,
                            background: '#f1f5f9',
                            fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
                            letterSpacing: '-0.005em',
                        }}>
                            {visibleCount} job application{visibleCount === 1 ? '' : 's'}
                        </span>
                    </div>
                </div>
                <svg
                    width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{
                        flexShrink: 0,
                        transform: open ? 'rotate(180deg)' : 'rotate(0)',
                        transition: 'transform 0.2s ease',
                    }}
                >
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>

            {/* Context hint — only when filtering and hiding rows */}
            {!isAll && totalApps > visibleCount && (
                <div style={{
                    flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 14px', background: '#fffbeb', border: '1px solid #fde68a',
                    borderRadius: 12, fontSize: 12.5, color: '#92400e', fontWeight: 500,
                }}>
                    <span>👁️</span>
                    <span>Hiding {totalApps - visibleCount} app{totalApps - visibleCount === 1 ? '' : 's'} tied to other resumes</span>
                    <button
                        onClick={() => onSelect(ALL_RESUMES)}
                        style={{
                            border: 'none', background: 'transparent', padding: '2px 6px',
                            color: '#b45309', fontWeight: 700, cursor: 'pointer', fontSize: 12.5,
                            textDecoration: 'underline', textUnderlineOffset: 2,
                        }}
                    >
                        Show all
                    </button>
                </div>
            )}

            {/* ── Dropdown panel ── */}
            {open && (
                <div
                    role="listbox"
                    style={{
                        position: 'absolute',
                        top: 'calc(100% + 8px)',
                        left: 0,
                        width: 'min(440px, 100%)',
                        background: '#fff',
                        border: '1px solid #e2e8f0',
                        borderRadius: 14,
                        boxShadow: '0 24px 48px -12px rgba(15,23,42,.18), 0 8px 16px -8px rgba(15,23,42,.06)',
                        padding: 8,
                        zIndex: 40,
                        animation: 'rsResumeDropIn 0.18s ease-out',
                        maxHeight: 380,
                        overflowY: 'auto',
                    }}
                >
                    {/* "All resumes" virtual option */}
                    <ResumeFilterRow
                        title="All resumes"
                        subtitle="Show every application in the pipeline"
                        count={countByResume[ALL_RESUMES] ?? totalApps}
                        selected={isAll}
                        kind="all"
                        onClick={() => { onSelect(ALL_RESUMES); setOpen(false) }}
                    />

                    {resumes.length > 0 && (
                        <div style={{
                            fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
                            fontSize: 9.5, fontWeight: 700, color: '#94a3b8',
                            letterSpacing: '0.14em', textTransform: 'uppercase',
                            padding: '10px 12px 6px',
                            borderTop: '1px solid #f1f5f9', marginTop: 4,
                        }}>
                            Your resumes · {resumes.length}
                        </div>
                    )}

                    {resumes.map(r => {
                        const isSelected = r.id === selectedId
                        const isPrimary = r.id === primaryResumeId
                        const count = countByResume[r.id] ?? 0
                        return (
                            <ResumeFilterRow
                                key={r.id}
                                title={resumeDisplayName(r)}
                                subtitle={resumeRoleLabel(r)}
                                count={count}
                                selected={isSelected}
                                primary={isPrimary}
                                kind="resume"
                                onClick={() => { onSelect(r.id); setOpen(false) }}
                            />
                        )
                    })}

                    {/* Footer */}
                    <Link href="/dashboard/upload" style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '12px 14px', marginTop: 6,
                        borderTop: '1px solid #f1f5f9',
                        fontSize: 12.5, color: '#135bec', fontWeight: 600,
                        textDecoration: 'none',
                    }}>
                        <span style={{ fontSize: 16 }}>+</span> Upload another resume
                    </Link>
                </div>
            )}

            <style>{`
                @keyframes rsResumeDropIn {
                    from { opacity: 0; transform: translateY(-6px) scale(.99); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
            `}</style>
        </div>
    )
}

function ResumeFilterRow({ title, subtitle, count, selected, primary, kind, onClick }: {
    title: string
    subtitle: string
    count: number
    selected: boolean
    primary?: boolean
    kind: 'all' | 'resume'
    onClick: () => void
}) {
    return (
        <button
            type="button"
            role="option"
            aria-selected={selected}
            onClick={onClick}
            style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                padding: '10px 12px',
                background: selected ? '#eff6ff' : 'transparent',
                border: 'none',
                borderRadius: 10,
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
                transition: 'background 0.12s',
                position: 'relative',
                marginBottom: 2,
            }}
            onMouseEnter={e => { if (!selected) e.currentTarget.style.background = '#f8fafc' }}
            onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
        >
            <div style={{
                flexShrink: 0,
                width: 32, height: 32, borderRadius: 9,
                background: kind === 'all'
                    ? (selected ? '#e2e8f0' : '#f1f5f9')
                    : (selected ? '#dbe7ff' : '#f1f5f9'),
                display: 'grid', placeItems: 'center',
            }}>
                {kind === 'all' ? (
                    <span style={{ fontSize: 16 }}>🗂️</span>
                ) : (
                    <ResumeFilterDoc size={15} color={selected ? '#135bec' : '#64748b'} />
                )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                        fontSize: 13.5,
                        fontWeight: selected ? 700 : 600,
                        color: selected ? '#0f172a' : '#1f2937',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        letterSpacing: '-0.005em',
                    }}>
                        {title}
                    </span>
                    {primary && <ResumeFilterStar />}
                </div>
                <div style={{
                    fontSize: 11.5,
                    color: '#94a3b8',
                    marginTop: 1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                    {subtitle}
                </div>
            </div>
            <span style={{
                flexShrink: 0,
                fontSize: 11, fontWeight: 700,
                padding: '3px 9px', borderRadius: 99,
                background: count > 0
                    ? (selected ? '#135bec' : '#f1f5f9')
                    : 'transparent',
                color: count > 0
                    ? (selected ? '#fff' : '#475569')
                    : '#cbd5e1',
                fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
                minWidth: 28, textAlign: 'center',
                letterSpacing: '-0.01em',
            }}>
                {count}
            </span>
        </button>
    )
}

function ResumeFilterDoc({ size = 16, color = '#64748b' }: { size?: number; color?: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
            <path d="M14 3v6h6" />
            <line x1="8" y1="13" x2="14" y2="13" />
            <line x1="8" y1="17" x2="14" y2="17" />
        </svg>
    )
}

function ResumeFilterStar({ size = 11 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" strokeWidth="1.5" strokeLinejoin="round" aria-label="Primary resume">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
    )
}

// ── Styles ── //
const S: Record<string, React.CSSProperties> = {
    page: { maxWidth: 1400, margin: '0 auto', padding: '0 8px 96px', color: '#0f172a' },
    head: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 24, flexWrap: 'wrap' },
    eyebrow: { fontFamily: "var(--font-mono), 'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748b', marginBottom: 10 },
    h1: { fontSize: 34, fontWeight: 800, letterSpacing: '-0.025em', color: '#0f172a', lineHeight: 1.1, marginBottom: 8 },
    headSub: { fontSize: 15, color: '#475569' },
    headActions: { display: 'flex', gap: 10, alignItems: 'center' },
    btnPrimary: {
        display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 16px',
        borderRadius: 10, fontSize: 13.5, fontWeight: 600, background: '#135bec', color: '#fff',
        border: '1px solid transparent', cursor: 'pointer',
        boxShadow: '0 1px 0 rgba(255,255,255,.18) inset, 0 6px 14px -4px rgba(19,91,236,.4)',
        textDecoration: 'none',
    },
    btnOutline: {
        display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 16px',
        borderRadius: 10, fontSize: 13.5, fontWeight: 600, background: '#fff', color: '#135bec',
        border: '1px solid #dbeafe', cursor: 'pointer', textDecoration: 'none',
    },
    btnGhost: {
        display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 16px',
        borderRadius: 10, fontSize: 13.5, fontWeight: 600, background: 'transparent', color: '#475569',
        border: '1px solid transparent', cursor: 'pointer',
    },
    btnGreen: {
        display: 'inline-flex', alignItems: 'center', gap: 7, padding: '12px 18px',
        borderRadius: 10, fontSize: 14, fontWeight: 600, background: '#16a34a', color: '#fff',
        border: 'none', cursor: 'pointer',
    },
    btnGold: {
        display: 'inline-flex', alignItems: 'center', gap: 7, padding: '12px 18px',
        borderRadius: 10, fontSize: 14, fontWeight: 600, background: '#d97706', color: '#fff',
        border: 'none', cursor: 'pointer',
    },
    btnRed: {
        display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 16px',
        borderRadius: 10, fontSize: 13.5, fontWeight: 600, background: '#dc2626', color: '#fff',
        border: 'none', cursor: 'pointer',
    },
    btnRedOutline: {
        display: 'inline-flex', alignItems: 'center', gap: 7, padding: '12px 18px',
        borderRadius: 10, fontSize: 14, fontWeight: 600, background: '#fff', color: '#dc2626',
        border: '1px solid #fecaca', cursor: 'pointer',
    },
    ghostLink: {
        fontSize: 12.5, fontWeight: 600, color: '#64748b', padding: '6px 10px',
        borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer',
    },
    pill: {
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px',
        borderRadius: 99, fontSize: 11.5, fontWeight: 700, letterSpacing: '-0.005em',
    },
    dot: { width: 7, height: 7, borderRadius: '50%', display: 'inline-block', flexShrink: 0 },
    funnel: {
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
        padding: '22px 24px 24px', boxShadow: '0 1px 3px rgba(15,23,42,.04)', marginBottom: 16,
    },
    funnelBarLabels: {
        display: 'flex', justifyContent: 'flex-start', gap: 18,
        fontFamily: "var(--font-mono), 'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
        letterSpacing: '0.1em', textTransform: 'uppercase', color: '#64748b', marginBottom: 8,
    },
    funnelBar: {
        display: 'flex', alignItems: 'center', gap: 2, height: 8, marginBottom: 22,
        borderRadius: 99, overflow: 'hidden',
    },
    funnelRow: { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', alignItems: 'stretch' },
    fcell: { padding: '0 20px', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 },
    fcellLabel: {
        fontFamily: "var(--font-mono), 'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
        letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b',
        marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
    },
    fcellNum: {
        fontFamily: "var(--font-mono), 'JetBrains Mono', monospace", fontSize: 36, fontWeight: 700,
        letterSpacing: '-0.03em', color: '#0f172a', lineHeight: 1, marginBottom: 6,
    },
    fcellSub: { fontSize: 12, color: '#94a3b8', lineHeight: 1.4 },
    ribbon: {
        background: '#fffbeb', border: '1px solid #fde68a', borderLeft: '3px solid #f59e0b',
        borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24,
    },
    ribbonIcon: { width: 36, height: 36, borderRadius: 10, background: '#fef3c7', display: 'grid', placeItems: 'center', fontSize: 18, flexShrink: 0 },
    ribbonEyebrow: {
        fontFamily: "var(--font-mono), 'JetBrains Mono', monospace", fontSize: 10.5, fontWeight: 700,
        letterSpacing: '0.14em', textTransform: 'uppercase', color: '#d97706', marginBottom: 3,
    },
    ribbonMsg: { fontSize: 15, fontWeight: 600, color: '#92400e', letterSpacing: '-0.01em' },
    ribbonLink: { fontSize: 13, fontWeight: 600, color: '#d97706', padding: '6px 10px', border: 'none', background: 'transparent', cursor: 'pointer' },
    board: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16, marginBottom: 32 },
    column: {
        background: '#fff',
        borderTopWidth: '1px', borderRightWidth: '1px', borderBottomWidth: '1px', borderLeftWidth: '1px',
        borderTopStyle: 'solid', borderRightStyle: 'solid', borderBottomStyle: 'solid', borderLeftStyle: 'solid',
        borderTopColor: '#e2e8f0', borderRightColor: '#e2e8f0', borderBottomColor: '#e2e8f0', borderLeftColor: '#e2e8f0',
        borderRadius: 12, padding: 12,
        display: 'flex', flexDirection: 'column', minHeight: 300, maxHeight: '78vh',
        boxShadow: '0 1px 3px rgba(15,23,42,.04)', transition: 'background 0.15s, border-color 0.15s',
    },
    colHead: {
        padding: '6px 6px 14px', display: 'flex', alignItems: 'center', gap: 10,
        background: '#fff', borderBottom: '1px solid #eef2f7', marginBottom: 10,
    },
    colAdd: {
        marginLeft: 'auto', width: 26, height: 26, borderRadius: 7,
        display: 'grid', placeItems: 'center', color: '#94a3b8',
        background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18,
    },
    colBody: { display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', padding: '0 2px 6px', flex: 1 },
    appCard: {
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
        padding: '13px 14px', position: 'relative',
        transition: 'border-color 0.15s, box-shadow 0.15s, transform 0.15s',
    },
    acTop: { display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 },
    acLogo: {
        width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center',
        color: '#fff', fontWeight: 800, fontSize: 13, letterSpacing: '-.01em', flexShrink: 0,
    },
    acCo: {
        fontSize: 12.5, fontWeight: 700, color: '#0f172a', flex: 1, minWidth: 0,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    },
    acMenu: {
        width: 24, height: 24, borderRadius: 6, color: '#94a3b8',
        fontSize: 16, lineHeight: 1, display: 'grid', placeItems: 'center',
        background: 'transparent', border: 'none', cursor: 'pointer',
    },
    acRole: {
        fontSize: 14, fontWeight: 600, color: '#0f172a', letterSpacing: '-0.005em',
        lineHeight: 1.35, marginBottom: 8,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
    },
    acMeta: { fontSize: 11.5, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 },
    chip: {
        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px',
        borderRadius: 6, fontSize: 10.5, fontWeight: 600, letterSpacing: '-0.005em',
    },
    drawer: {
        position: 'fixed', top: 0, right: 0, width: 520, maxWidth: '100vw', height: '100vh',
        background: '#fff', borderLeft: '1px solid #e2e8f0',
        boxShadow: '0 24px 48px -12px rgba(15,23,42,.14), 0 8px 16px -8px rgba(15,23,42,.06)',
        zIndex: 51, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        animation: 'rsDrawerIn 0.28s cubic-bezier(.22,.61,.36,1)',
    },
    dwHead: { padding: '20px 22px 16px', borderBottom: '1px solid #eef2f7', display: 'flex', gap: 14, alignItems: 'flex-start', flexShrink: 0 },
    dwCo: { fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 2 },
    dwRole: { fontSize: 18, fontWeight: 700, letterSpacing: '-0.015em', color: '#0f172a', lineHeight: 1.25, marginBottom: 8 },
    dwClose: { width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center', color: '#64748b', fontSize: 18, lineHeight: 1, background: 'transparent', border: 'none', cursor: 'pointer' },
    tabs: { display: 'flex', borderBottom: '1px solid #eef2f7', padding: '0 22px', gap: 4, flexShrink: 0 },
    tab: { padding: '12px 14px', fontSize: 13, fontWeight: 600, color: '#64748b', borderBottom: '2px solid transparent', marginBottom: -1, letterSpacing: '-0.005em', background: 'transparent', cursor: 'pointer' },
    dwBody: { flex: 1, overflowY: 'auto', padding: '20px 22px 28px' },
    dwCard: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, marginBottom: 12 },
    dwCardHead: {
        fontFamily: "var(--font-mono), 'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700,
        letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748b', marginBottom: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    },
    dwLink: { fontSize: 12.5, fontWeight: 600, color: '#135bec', textDecoration: 'none' },
    dwResume: { display: 'flex', gap: 12, background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 10, padding: 12, marginTop: 10, alignItems: 'center' },
    dwResumeThumb: { width: 38, height: 48, background: '#fff', border: '1px solid #dbeafe', borderRadius: 5, display: 'grid', placeItems: 'center', fontSize: 18, flexShrink: 0 },
    dwTransitionsEyebrow: {
        fontFamily: "var(--font-mono), 'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700,
        letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748b', marginBottom: 12,
    },
    notesTextarea: {
        width: '100%', minHeight: 240, padding: '14px 16px', fontSize: 13.5, lineHeight: 1.6,
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, resize: 'vertical',
        outline: 'none', color: '#0f172a', fontFamily: 'inherit',
    },
    fieldLabel: {
        fontSize: 11.5, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase',
        letterSpacing: '0.08em', fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
        marginBottom: 6, display: 'block',
    },
    input: {
        width: '100%', padding: '10px 12px', fontSize: 13.5,
        border: '1px solid #e2e8f0', borderRadius: 9, background: '#fff',
        outline: 'none', fontFamily: 'inherit', color: '#0f172a',
    },
}
