'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/components/providers/AuthProvider'
import {
    fetchUserSettings,
    updateUserSettings,
    fetchUsageStats,
    fetchResumes,
    deleteResume,
    setPrimaryResumeId,
    type UserSettings,
    type NotificationPrefs,
    type UsageStats,
} from '@/lib/api'
import type { Resume } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { INDIA_LOCATIONS } from '@/lib/locations'
import BillingPanel from '@/components/billing/BillingPanel'

type SectionId = 'profile' | 'prefs' | 'resumes' | 'notifications' | 'plan' | 'usage' | 'security' | 'danger'

const ROLE_SUGGESTIONS = ['Full Stack Developer', 'SDE 1', 'Data Engineer', 'Site Reliability Engineer']
const LOCATION_SUGGESTIONS = ['Chennai', 'Gurugram', 'Mumbai', 'Noida', 'Remote (India)']
const EXPERIENCE_LEVELS = [
    { key: 'internship', label: 'Internship', years: '0 yrs' },
    { key: 'entry', label: 'Entry Level', years: '0–2 yrs' },
    { key: 'mid', label: 'Mid-Level', years: '3–6 yrs' },
    { key: 'senior', label: 'Senior', years: '7–11 yrs' },
    { key: 'director', label: 'Director', years: '12–14 yrs' },
    { key: 'executive', label: 'Executive', years: '15+ yrs' },
] as const

function parseLevels(raw: string | null | undefined): string[] {
    if (!raw) return []
    return raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
}
function serializeLevels(levels: string[]): string {
    return levels.join(',')
}
const ALL_LEVEL_KEYS = EXPERIENCE_LEVELS.map(l => l.key)
const REMOTE_OPTIONS = ['Remote OK', 'Hybrid OK', 'On-site only', 'No preference'] as const
const EMAIL_FREQ = ['real-time', 'daily', 'weekly'] as const

// Mirrors the autocomplete lists from /dashboard/search — same vocabulary so a
// preference users type here matches what the job scrapers/filters use.
const IT_ROLES = [
    'Software Engineer', 'Software Developer', 'Full Stack Developer', 'Frontend Developer',
    'Backend Developer', 'React Developer', 'Angular Developer', 'Vue.js Developer',
    'Node.js Developer', 'Python Developer', 'Java Developer', '.NET Developer',
    'C++ Developer', 'PHP Developer', 'Ruby Developer', 'Go Developer', 'Rust Developer',
    'Kotlin Developer', 'Swift Developer', 'iOS Developer', 'Android Developer',
    'Mobile Developer', 'React Native Developer', 'Flutter Developer',
    'Junior Software Developer', 'Senior Software Engineer', 'Associate Software Engineer',
    'UI Developer', 'UI/UX Designer', 'UX Researcher', 'Web Developer', 'WordPress Developer',
    'Shopify Developer', 'Web Designer', 'Frontend Engineer',
    'Data Scientist', 'Data Analyst', 'Data Engineer', 'Business Analyst',
    'Business Intelligence Analyst', 'Power BI Developer', 'Tableau Developer',
    'SQL Developer', 'Database Administrator', 'DBA', 'ETL Developer',
    'Machine Learning Engineer', 'AI Engineer', 'NLP Engineer', 'Computer Vision Engineer',
    'MLOps Engineer', 'Deep Learning Engineer', 'AI Researcher', 'Prompt Engineer',
    'Generative AI Engineer', 'LLM Engineer',
    'DevOps Engineer', 'Cloud Engineer', 'AWS Engineer', 'Azure Engineer',
    'GCP Engineer', 'Site Reliability Engineer', 'SRE', 'Infrastructure Engineer',
    'Platform Engineer', 'Kubernetes Engineer', 'Docker Engineer', 'CI/CD Engineer',
    'Cloud Architect', 'Solution Architect', 'Enterprise Architect', 'Technical Architect',
    'SOC Analyst', 'Cybersecurity Analyst', 'Information Security Analyst',
    'Penetration Tester', 'Ethical Hacker', 'Security Engineer', 'Vulnerability Analyst',
    'Incident Response Analyst', 'Cloud Security Engineer', 'VAPT Engineer',
    'Network Security Engineer', 'Security Operations Engineer',
    'QA Engineer', 'Software Tester', 'Test Engineer', 'Test Automation Engineer',
    'SDET', 'Quality Analyst', 'Manual Tester', 'Performance Test Engineer',
    'Selenium Tester', 'Cypress Engineer',
    'Network Engineer', 'System Administrator', 'Linux Administrator',
    'Windows Administrator', 'IT Administrator', 'Technical Support Engineer',
    'IT Support Engineer', 'Help Desk Engineer', 'NOC Engineer',
    'Product Manager', 'Project Manager', 'Scrum Master', 'Agile Coach',
    'Technical Program Manager', 'IT Project Manager', 'Delivery Manager',
    'Engineering Manager',
    'Salesforce Developer', 'SAP Consultant', 'SAP ABAP Developer', 'ServiceNow Developer',
    'Blockchain Developer', 'Web3 Developer', 'Smart Contract Developer',
    'Embedded Systems Engineer', 'Firmware Engineer', 'VLSI Engineer',
    'Hardware Engineer', 'IoT Engineer', 'Robotics Engineer',
    'Technical Writer', 'RPA Developer', 'UiPath Developer',
    'Automation Engineer', 'Integration Engineer', 'API Developer',
]

function formatMemberSince(iso: string | null) {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

function formatResumeDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function firstInitial(s: string | null | undefined) {
    const c = (s ?? 'U').trim()[0]
    return (c ?? 'U').toUpperCase()
}

// Plan-aware usage meters: feature keys (from PLAN_QUOTAS) → display labels.
const USAGE_FEATURE_LABELS: Record<string, string> = {
    job_search: 'Job Searches',
    score: 'AI Match Runs',
    optimize: 'Tailored Resumes',
    company_research: 'Company Research',
    build_plan: 'Build Plans',
    chat: 'AI Chat Messages',
    learning_path: 'Learning Paths',
}

type PlanUsage = { plan: 'free' | 'pro' | 'max'; usage: { feature: string; used: number; limit: number }[] }

export default function SettingsPage() {
    const { user, signOut } = useAuth()
    const router = useRouter()
    const supabase = createClient()

    const [activeSection, setActiveSection] = useState<SectionId>('profile')
    const [settings, setSettings] = useState<UserSettings | null>(null)
    const [original, setOriginal] = useState<UserSettings | null>(null)
    const [resumes, setResumes] = useState<Resume[]>([])
    const [usage, setUsage] = useState<UsageStats | null>(null)
    const [planUsage, setPlanUsage] = useState<PlanUsage | null>(null)
    const [loading, setLoading] = useState(true)
    const [showSecSheet, setShowSecSheet] = useState(false)
    const [savedPills, setSavedPills] = useState<Record<string, boolean>>({})
    const [deleteModalOpen, setDeleteModalOpen] = useState(false)
    const [deleteConfirmText, setDeleteConfirmText] = useState('')
    const [signOutAllPending, setSignOutAllPending] = useState(false)
    const sectionRefs = useRef<Record<SectionId, HTMLElement | null>>({
        profile: null, prefs: null, resumes: null,
        notifications: null, plan: null, usage: null, security: null, danger: null,
    })
    // Refs to chip inputs so Try/Suggested clicks can refocus them — without
    // this, clicking a Try chip steals focus away and the dropdown never reopens
    // when the user starts typing the next role.
    const rolesInputRef = useRef<HTMLInputElement | null>(null)
    const locationsInputRef = useRef<HTMLInputElement | null>(null)

    useEffect(() => {
        if (!user?.id) return
        let cancelled = false
        ;(async () => {
            setLoading(true)
            const [s, u, r] = await Promise.all([
                fetchUserSettings(user.id, user.email ?? null),
                fetchUsageStats(user.id),
                fetchResumes(user.id),
            ])
            if (cancelled) return
            setSettings(s)
            setOriginal(s)
            setUsage(u)
            setResumes(r)
            setLoading(false)
        })()
        return () => { cancelled = true }
    }, [user?.id, user?.email])

    // Plan-aware usage meters (real quotas from PLAN_QUOTAS + this month's counters).
    useEffect(() => {
        if (!user?.id) return
        let cancelled = false
        fetch('/api/billing/usage')
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (!cancelled && d?.usage) setPlanUsage(d as PlanUsage) })
            .catch(() => {})
        return () => { cancelled = true }
    }, [user?.id])

    // Scroll-spy: update active nav based on which section is in view.
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries.filter(e => e.isIntersecting)
                if (visible.length === 0) return
                visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
                const id = visible[0].target.id as SectionId
                if (id) setActiveSection(id)
            },
            { rootMargin: '-100px 0px -60% 0px', threshold: 0 }
        )
        Object.values(sectionRefs.current).forEach(el => { if (el) observer.observe(el) })
        return () => observer.disconnect()
    }, [loading])

    const scrollTo = (id: SectionId) => {
        const el = sectionRefs.current[id]
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    // Deep-link: /dashboard/settings#plan (e.g. redirected from the old /billing
    // route) opens the Plan & Billing section once the page has loaded.
    useEffect(() => {
        if (loading) return
        if (typeof window !== 'undefined' && window.location.hash) {
            const id = window.location.hash.slice(1) as SectionId
            const t = setTimeout(() => scrollTo(id), 120)
            return () => clearTimeout(t)
        }
    }, [loading])

    // Compute per-section dirty state by comparing current settings against the
    // last-saved snapshot (`original`). Each section reads its own slice.
    const dirty = settings && original ? {
        profile: settings.full_name !== original.full_name,
        prefs: JSON.stringify({
            r: settings.target_roles, l: settings.target_locations,
            e: settings.experience_level, p: settings.remote_preference,
        }) !== JSON.stringify({
            r: original.target_roles, l: original.target_locations,
            e: original.experience_level, p: original.remote_preference,
        }),
        notifications: settings.email_frequency !== original.email_frequency ||
            JSON.stringify(settings.notification_prefs) !== JSON.stringify(original.notification_prefs),
    } : { profile: false, prefs: false, notifications: false }

    const flashSaved = (id: string) => {
        setSavedPills(p => ({ ...p, [id]: true }))
        setTimeout(() => setSavedPills(p => ({ ...p, [id]: false })), 2000)
    }

    const saveProfile = async () => {
        if (!settings || !user?.id) return
        await updateUserSettings(user.id, { full_name: settings.full_name })
        setOriginal(s => s ? { ...s, full_name: settings.full_name } : s)
        flashSaved('profile')
    }
    const savePrefs = async () => {
        if (!settings || !user?.id) return
        await updateUserSettings(user.id, {
            target_roles: settings.target_roles,
            target_locations: settings.target_locations,
            experience_level: settings.experience_level,
            remote_preference: settings.remote_preference,
        })
        setOriginal(s => s ? {
            ...s,
            target_roles: settings.target_roles,
            target_locations: settings.target_locations,
            experience_level: settings.experience_level,
            remote_preference: settings.remote_preference,
        } : s)
        flashSaved('prefs')
    }
    const saveNotifications = async () => {
        if (!settings || !user?.id) return
        await updateUserSettings(user.id, {
            email_frequency: settings.email_frequency,
            notification_prefs: settings.notification_prefs,
        })
        setOriginal(s => s ? {
            ...s,
            email_frequency: settings.email_frequency,
            notification_prefs: settings.notification_prefs,
        } : s)
        flashSaved('notifications')
    }

    const resetSection = (id: 'profile' | 'prefs' | 'notifications') => {
        if (!original) return
        setSettings(s => s ? { ...s, ...partialFromOriginal(original, id) } : s)
    }

    const handleDeleteResume = async (id: string) => {
        if (!confirm('Delete this resume permanently?')) return
        const ok = await deleteResume(id)
        if (ok) setResumes(r => r.filter(x => x.id !== id))
    }
    const handleSetPrimary = async (id: string) => {
        setPrimaryResumeId(id)
        setResumes(r => r.map(x => ({ ...x, is_primary: x.id === id })))
    }

    /**
     * Resumes live in a private bucket. The browser anon-key client can't sign
     * URLs reliably (storage RLS edge cases), so this goes through a server
     * route that uses the service role key after verifying ownership.
     */
    const handleDownloadResume = async (resumeId: string) => {
        try {
            const res = await fetch(`/api/resume-signed-url?id=${encodeURIComponent(resumeId)}`)
            if (!res.ok) {
                const body = await res.json().catch(() => ({}))
                console.warn('[download] failed:', body.error)
                alert(body.error ?? "Couldn't generate a download link. Please try again.")
                return
            }
            const { signedUrl } = await res.json()
            window.open(signedUrl, '_blank')
        } catch (err: any) {
            console.warn('[download] error:', err)
            alert("Couldn't generate a download link. Please try again.")
        }
    }

    const handleSignOutEverywhere = async () => {
        if (!confirm('Sign out of all devices including this one?')) return
        setSignOutAllPending(true)
        try {
            await supabase.auth.signOut({ scope: 'global' })
        } finally {
            setSignOutAllPending(false)
            router.push('/login')
        }
    }

    const handleDeleteAccount = async () => {
        if (deleteConfirmText !== 'DELETE' || !user?.id) return
        // Server route (service role) erases all data + storage AND deletes the
        // auth user itself — full DPDP erasure, no "contact support" step.
        const res = await fetch('/api/account/delete', { method: 'POST' })
        if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            alert(body.error ?? 'Account deletion failed. Please try again or contact support.')
            return
        }
        alert('Your account and all associated data have been permanently deleted.')
        await signOut()
        router.push('/login')
    }

    if (loading || !settings) {
        return <PageShell><div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>Loading settings…</div></PageShell>
    }

    const displayName = settings.full_name ?? user?.email?.split('@')[0] ?? 'You'
    const initial = firstInitial(settings.full_name ?? user?.email)
    const activeSectionLabel = NAV_ITEMS.find(n => n.id === activeSection)?.label ?? 'Profile'

    return (
        <PageShell>
            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <div style={S.eyebrow}>ACCOUNT</div>
                <h1 style={S.pageTitle}>Settings</h1>
                <p style={S.pageSub}>Manage your profile, preferences, and account</p>
            </div>

            {/* Mobile section nav — sticky button showing current section; tapping opens jump sheet */}
            <div className="rs-sec-nav" style={{ display: 'none', position: 'sticky', top: 64, zIndex: 20, background: '#fff', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', margin: '8px -8px 0' }}>
                <button onClick={() => setShowSecSheet(true)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' as const }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#135bec" strokeWidth="2" strokeLinecap="round">
                            <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                            <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                        </svg>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{activeSectionLabel}</span>
                    </div>
                </button>
            </div>

            <div style={S.bodyGrid} className="rs-body-grid">

                {/* Left nav — wrap in a stretching cell, sticky on the inner aside */}
                <div style={S.navWrap} className="rs-side-nav">
                    <aside style={S.nav}>
                        {NAV_ITEMS.map(item => {
                            const active = activeSection === item.id
                            return (
                                <button key={item.id} onClick={() => scrollTo(item.id)}
                                    style={{
                                        ...S.navLink,
                                        background: active ? (item.danger ? '#fef2f2' : '#eff6ff') : 'transparent',
                                        color: active ? (item.danger ? '#dc2626' : '#135bec') : (item.danger ? '#dc2626' : '#334155'),
                                        borderLeft: active ? `2px solid ${item.danger ? '#dc2626' : '#135bec'}` : '2px solid transparent',
                                        fontWeight: active ? 700 : 600,
                                    }}>
                                    <span style={{ fontSize: 16, width: 16, display: 'inline-flex', justifyContent: 'center' }}>{item.icon}</span>
                                    {item.label}
                                </button>
                            )
                        })}
                    </aside>
                </div>

                {/* Content */}
                <main style={S.content}>

                    {/* ─── PROFILE ─── */}
                    <Card id="profile" refSetter={el => sectionRefs.current.profile = el}
                        title="Profile" sub="Your basic account details. Email cannot be changed.">
                        <div style={S.cardBody}>
                            <div style={S.avatarRow}>
                                <div style={S.avatar}>{initial}</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
                                    <div style={{ fontSize: 17, fontWeight: 600, color: '#0f172a' }}>{displayName}</div>
                                    <div style={{ fontSize: 13, color: '#94a3b8' }}>JPG or PNG · up to 2 MB</div>
                                </div>
                                <button style={S.ghostLink} onClick={() => alert('Avatar upload coming soon.')}>Change avatar</button>
                            </div>

                            <Field label="Full name">
                                <input style={S.input}
                                    type="text"
                                    value={settings.full_name ?? ''}
                                    onChange={e => setSettings(s => s ? { ...s, full_name: e.target.value } : s)}
                                    placeholder="Your name" />
                            </Field>

                            <div style={S.fieldRow} className="rs-field-row">
                                <Field label="Email">
                                    <div style={{ position: 'relative' }}>
                                        <input style={{ ...S.input, background: '#f8fafc', color: '#64748b', cursor: 'default' }}
                                            type="email" value={settings.email ?? ''} readOnly />
                                        <span style={S.inputBadge}>✓ Verified</span>
                                    </div>
                                </Field>
                                <Field label="Joined">
                                    <div style={S.joinedPill}>📅 Member since <b style={{ color: '#0f172a', fontWeight: 600 }}>{formatMemberSince(settings.joined_at)}</b></div>
                                </Field>
                            </div>
                        </div>
                        <CardFooter
                            savedVisible={savedPills.profile}
                            disabled={!dirty.profile}
                            onCancel={() => resetSection('profile')}
                            onSave={saveProfile}
                        />
                    </Card>

                    {/* ─── JOB PREFERENCES ─── */}
                    <Card id="prefs" refSetter={el => sectionRefs.current.prefs = el}
                        title="Job Preferences" sub="Tells our AI what jobs to surface for you">
                        <div style={S.cardBody}>
                            <Field label="Target roles">
                                <ChipField
                                    values={settings.target_roles}
                                    placeholder="Start typing a role — suggestions will appear"
                                    options={IT_ROLES}
                                    inputRef={rolesInputRef}
                                    onChange={vs => setSettings(s => s ? { ...s, target_roles: vs } : s)}
                                />
                                <SuggestRow label="Try:" suggestions={ROLE_SUGGESTIONS}
                                    existing={settings.target_roles}
                                    onAdd={v => {
                                        setSettings(s => s ? { ...s, target_roles: dedupAdd(s.target_roles, v) } : s)
                                        // Refocus the chip input so the user can keep typing and the dropdown reopens.
                                        requestAnimationFrame(() => rolesInputRef.current?.focus())
                                    }} />
                            </Field>

                            <Field label="Target locations">
                                <ChipField
                                    values={settings.target_locations}
                                    placeholder="Start typing a city — suggestions will appear"
                                    options={INDIA_LOCATIONS}
                                    inputRef={locationsInputRef}
                                    onChange={vs => setSettings(s => s ? { ...s, target_locations: vs } : s)}
                                />
                                <SuggestRow label="Suggested:" suggestions={LOCATION_SUGGESTIONS}
                                    existing={settings.target_locations}
                                    onAdd={v => {
                                        setSettings(s => s ? { ...s, target_locations: dedupAdd(s.target_locations, v) } : s)
                                        requestAnimationFrame(() => locationsInputRef.current?.focus())
                                    }} />
                            </Field>

                            <Field label="Experience level">
                                {(() => {
                                    const selected = parseLevels(settings.experience_level)
                                    const allOn = selected.length === ALL_LEVEL_KEYS.length
                                    const toggle = (key: string) => {
                                        const next = selected.includes(key)
                                            ? selected.filter(k => k !== key)
                                            : [...selected, key]
                                        setSettings(s => s ? { ...s, experience_level: serializeLevels(next) } : s)
                                    }
                                    const setAll = () => {
                                        setSettings(s => s ? { ...s, experience_level: allOn ? '' : serializeLevels(ALL_LEVEL_KEYS) } : s)
                                    }
                                    return (
                                        <>
                                            <button onClick={setAll}
                                                style={{
                                                    ...S.allLevelsBtn,
                                                    background: allOn ? '#135bec' : '#eff6ff',
                                                    color: allOn ? '#fff' : '#135bec',
                                                    borderColor: allOn ? '#135bec' : '#bfdbfe',
                                                }}>
                                                {allOn ? '✓ All Levels' : 'All Levels'}
                                            </button>
                                            <div style={S.levelGrid} className="rs-level-grid">
                                                {EXPERIENCE_LEVELS.map(lvl => {
                                                    const active = selected.includes(lvl.key)
                                                    return (
                                                        <button key={lvl.key} onClick={() => toggle(lvl.key)}
                                                            style={{
                                                                ...S.levelTile,
                                                                background: active ? '#135bec' : '#fff',
                                                                color: active ? '#fff' : '#0f172a',
                                                                borderColor: active ? '#135bec' : '#cbd5e1',
                                                            }}>
                                                            <span style={{ fontSize: 14, fontWeight: 700 }}>{lvl.label}</span>
                                                            <span style={{
                                                                fontSize: 11, fontWeight: 600,
                                                                color: active ? 'rgba(255,255,255,0.85)' : '#64748b',
                                                                background: active ? 'rgba(255,255,255,0.18)' : '#f1f5f9',
                                                                padding: '2px 8px', borderRadius: 99,
                                                            }}>{lvl.years}</span>
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                            <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
                                                Select one or more. Multiple levels broaden your matches.
                                            </div>
                                        </>
                                    )
                                })()}
                            </Field>

                            <Field label="Remote preference">
                                <div style={S.radioGrid4} className="rs-radioGrid4">
                                    {REMOTE_OPTIONS.map(opt => {
                                        const active = settings.remote_preference === opt
                                        return (
                                            <button key={opt} onClick={() => setSettings(s => s ? { ...s, remote_preference: opt } : s)}
                                                style={{
                                                    ...S.radioTile,
                                                    borderColor: active ? '#135bec' : '#e2e8f0',
                                                    background: active ? '#eff6ff' : '#fff',
                                                    color: active ? '#135bec' : '#475569',
                                                    fontWeight: active ? 600 : 500,
                                                }}>
                                                <span style={{
                                                    width: 14, height: 14, borderRadius: '50%',
                                                    border: `2px solid ${active ? '#135bec' : '#cbd5e1'}`,
                                                    background: active ? '#135bec' : 'transparent',
                                                    boxShadow: active ? 'inset 0 0 0 3px #fff' : 'none',
                                                    flexShrink: 0,
                                                }} />
                                                {opt}
                                            </button>
                                        )
                                    })}
                                </div>
                            </Field>

                            <div style={S.infoChip}>
                                <span style={{ fontSize: 14 }}>💡</span>
                                <span>These preferences shape your AI matches. Changes take effect within a few minutes.</span>
                            </div>
                        </div>
                        <CardFooter
                            savedVisible={savedPills.prefs}
                            disabled={!dirty.prefs}
                            onCancel={() => resetSection('prefs')}
                            onSave={savePrefs}
                        />
                    </Card>

                    {/* ─── RESUME DEFAULTS ─── */}
                    {/* ─── RESUMES ─── */}
                    <Card id="resumes" refSetter={el => sectionRefs.current.resumes = el}
                        title="Resumes" sub="Your uploaded resumes. The Primary resume is what AI matches against.">
                        <div style={{ ...S.cardBody, gap: 4 }}>
                            {resumes.length === 0 ? (
                                <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: 10 }}>
                                    No resumes uploaded yet.
                                </div>
                            ) : resumes.map(r => {
                                const isPrimary = !!r.is_primary
                                const tailoredFor = (r as any).tailored_for ?? null
                                return (
                                    <div key={r.id} style={S.resumeRow} className="rs-resume-row">
                                        <div style={S.fileIcon}>📄</div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={S.fileName}>{r.original_filename ?? 'resume.pdf'}</div>
                                            <div style={S.fileMeta}>
                                                {isPrimary ? 'Uploaded' : 'Added'} {formatResumeDate(r.created_at)}
                                                <span style={{ color: '#cbd5e1' }}>·</span>
                                                {isPrimary ? 'master resume' : (tailoredFor ?? 'tailored resume')}
                                            </div>
                                        </div>
                                        <div className="rs-resume-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                            {isPrimary ? (
                                                <span style={S.primaryPill}>★ Primary</span>
                                            ) : (
                                                <button className="rs-resume-set-primary" style={S.setPrimary} onClick={() => handleSetPrimary(r.id)}>Set as primary</button>
                                            )}
                                            <button
                                                type="button"
                                                style={S.iconBtn}
                                                title="Download"
                                                onClick={() => handleDownloadResume(r.id)}
                                            >
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                                            </button>
                                            <button style={{ ...S.iconBtn }} title="Delete" onClick={() => handleDeleteResume(r.id)}
                                                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2'; (e.currentTarget as HTMLButtonElement).style.color = '#dc2626' }}
                                                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#64748b' }}>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                            <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
                                <Link href="/dashboard/upload" style={S.btnOutline}>+ Upload new resume</Link>
                            </div>
                        </div>
                    </Card>

                    {/* ─── NOTIFICATIONS ─── */}
                    <Card id="notifications" refSetter={el => sectionRefs.current.notifications = el}
                        title="Notifications" sub="Control what we email you about">
                        <div style={S.cardBody}>
                            <div style={S.frequencyRow}>
                                <div>
                                    <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>Email frequency</div>
                                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 3 }}>How often we batch and send updates</div>
                                </div>
                                <select style={S.select}
                                    value={settings.email_frequency}
                                    onChange={e => setSettings(s => s ? { ...s, email_frequency: e.target.value } : s)}>
                                    {EMAIL_FREQ.map(f => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
                                </select>
                            </div>

                            <div>
                                {(Object.entries({
                                    new_strong_matches: ['New strong matches', 'When jobs above 80% are found'],
                                    weekly_digest: ['Weekly match digest', 'Sunday morning summary of new jobs and activity'],
                                    interview_reminders: ['Interview reminders', 'When you have an upcoming interview'],
                                    product_updates: ['Product updates', 'New features and improvements'],
                                    tips_career_advice: ['Tips & career advice', 'Occasional career growth content'],
                                }) as [keyof NotificationPrefs, [string, string]][]).map(([key, [title, desc]], i, arr) => {
                                    const on = settings.notification_prefs[key]
                                    const isLast = i === arr.length - 1
                                    return (
                                        <div key={key} style={{
                                            ...S.toggleRow,
                                            borderBottom: isLast ? 'none' : '1px solid #f1f5f9',
                                            paddingBottom: isLast ? 0 : 12,
                                            paddingTop: i === 0 ? 0 : 12,
                                        }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 3 }}>{title}</div>
                                                <div style={{ fontSize: 13, color: '#64748b' }}>{desc}</div>
                                            </div>
                                            <button onClick={() => setSettings(s => s ? {
                                                ...s, notification_prefs: { ...s.notification_prefs, [key]: !on },
                                            } : s)} style={{
                                                position: 'relative', width: 38, height: 22,
                                                background: on ? '#135bec' : '#e2e8f0', borderRadius: 99,
                                                cursor: 'pointer', transition: 'background 0.2s',
                                                border: 'none', padding: 0, flexShrink: 0,
                                            }}>
                                                <span style={{
                                                    position: 'absolute', top: 2, left: 2, width: 18, height: 18,
                                                    background: '#fff', borderRadius: '50%',
                                                    transform: on ? 'translateX(16px)' : 'translateX(0)',
                                                    transition: 'transform 0.2s',
                                                    boxShadow: '0 1px 3px rgba(15,23,42,0.15)',
                                                }} />
                                            </button>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                        <CardFooter
                            savedVisible={savedPills.notifications}
                            disabled={!dirty.notifications}
                            onCancel={() => resetSection('notifications')}
                            onSave={saveNotifications}
                        />
                    </Card>

                    {/* ─── USAGE ─── */}
                    {/* ─── PLAN & BILLING ─── */}
                    <Card id="plan" refSetter={el => sectionRefs.current.plan = el}
                        title="Plan & Billing" sub="Your subscription, upgrades, and payment">
                        <div style={S.cardBody}>
                            <BillingPanel />
                        </div>
                    </Card>

                    <Card id="usage" refSetter={el => sectionRefs.current.usage = el}
                        title="Usage & Limits" sub={`Your activity this month · resets ${usage?.resetDate ? new Date(usage.resetDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : ''}`}>
                        <div style={S.cardBody}>
                            <div style={S.usageGrid} className="rs-usage-grid">
                                {(planUsage?.usage ?? []).map(u => (
                                    <UsageTile
                                        key={u.feature}
                                        label={USAGE_FEATURE_LABELS[u.feature] ?? u.feature}
                                        value={u.used}
                                        max={u.limit < 0 ? Math.max(u.used, 1) : u.limit}
                                        warnAt={u.feature === 'chat' ? 0.7 : 0.85}
                                    />
                                ))}
                                {!planUsage && (
                                    <div style={{ fontSize: 13, color: '#94a3b8', padding: 18 }}>Loading your usage…</div>
                                )}
                            </div>
                            <div style={S.upgradeCard} className="rs-upgrade-card">
                                <span style={{ fontSize: 22 }}>💡</span>
                                <span style={{ flex: 1, fontSize: 14, color: '#1e3a8a' }}>
                                    {(!planUsage || planUsage.plan === 'free')
                                        ? <>You&apos;re on the <b style={{ color: '#0f172a', fontWeight: 700 }}>Free Plan</b>. Upgrade for much higher monthly limits.</>
                                        : <>You&apos;re on the <b style={{ color: '#0f172a', fontWeight: 700 }}>{planUsage.plan === 'pro' ? 'Pro' : 'Max'} Plan</b>. Manage it under Plan &amp; Billing.</>}
                                </span>
                                <button style={S.btnOutline} onClick={() => scrollTo('plan')}>
                                    {(planUsage && planUsage.plan !== 'free') ? 'Manage plan →' : 'View Plans →'}
                                </button>
                            </div>
                        </div>
                    </Card>

                    {/* ─── SECURITY ─── */}
                    <Card id="security" refSetter={el => sectionRefs.current.security = el}
                        title="Security" sub="Account access and authentication">
                        <div style={S.cardBody}>
                            <div style={S.secRow}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>Password</div>
                                    <div style={{ fontSize: 13, color: '#64748b' }}>Reset via emailed link</div>
                                </div>
                                <button style={{ ...S.btnGhost, border: '1px solid #e2e8f0' }} onClick={async () => {
                                    if (!user?.email) return
                                    await supabase.auth.resetPasswordForEmail(user.email)
                                    alert('Password reset link sent to your email.')
                                }}>
                                    Change password
                                </button>
                            </div>

                            <div style={{ ...S.secRow, paddingTop: 14 }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span style={S.brandG}>G</span>
                                        Google
                                    </div>
                                    <div style={{ fontSize: 13, color: '#64748b' }}>{settings.email} · connected</div>
                                </div>
                                <span style={S.connectedPill}>✓ Connected</span>
                            </div>

                            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>
                                <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>Active sessions</div>
                                <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>Devices currently signed in to your JobScorer account</div>
                                <div style={S.sessionRow}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <div style={S.sessionDot} />
                                        <div>
                                            <div style={{ fontSize: 14, color: '#0f172a', fontWeight: 500 }}>This device</div>
                                            <div style={{ fontSize: 13, color: '#94a3b8' }}>active now</div>
                                        </div>
                                    </div>
                                    <button style={{ ...S.btnGhost, fontSize: 13, padding: '8px 14px' }} onClick={signOut}>Sign out</button>
                                </div>
                                <div style={{ fontSize: 13, color: '#94a3b8', fontStyle: 'italic', marginTop: 12 }}>
                                    Multi-device session management is coming soon.
                                </div>
                            </div>
                        </div>
                    </Card>

                    {/* ─── DANGER ZONE ─── */}
                    <Card id="danger" refSetter={el => sectionRefs.current.danger = el}
                        title="Danger Zone" sub="Destructive actions. These cannot be undone." danger>
                        <div style={S.cardBody}>
                            <div style={S.dangerRow} className="rs-dangerRow">
                                <div style={{ flex: 1 }}>
                                    <div style={S.dangerTitle}>Sign out everywhere</div>
                                    <div style={S.dangerDesc}>Sign you out on all devices including this one. You&apos;ll need to log in again with your email or Google.</div>
                                </div>
                                <button style={S.btnDangerOutline} onClick={handleSignOutEverywhere} disabled={signOutAllPending}>
                                    {signOutAllPending ? 'Signing out…' : 'Sign out all sessions'}
                                </button>
                            </div>

                            <div style={{ ...S.dangerRow, borderBottom: 'none' }} className="rs-dangerRow">
                                <div style={{ flex: 1 }}>
                                    <div style={S.dangerTitle}>Delete account</div>
                                    <div style={S.dangerDesc}>Permanently delete your account, all resumes, matches, and data. This cannot be undone.</div>
                                </div>
                                <button style={S.btnDanger} onClick={() => setDeleteModalOpen(true)}>Delete my account</button>
                            </div>
                        </div>
                    </Card>

                </main>
            </div>

            {/* Mobile section jump sheet */}
            {showSecSheet && (
                <>
                    <div onClick={() => setShowSecSheet(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(3px)', zIndex: 50 }} />
                    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 55, background: '#fff', borderRadius: '22px 22px 0 0', boxShadow: '0 -20px 60px rgba(0,0,0,0.22)', maxHeight: '80vh', overflowY: 'auto' }}>
                        <div style={{ width: 36, height: 4, borderRadius: 99, background: '#e2e8f0', margin: '12px auto 0' }} />
                        <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>Jump to section</div>
                            <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>Settings · {settings.email}</div>
                        </div>
                        <div style={{ padding: '8px 12px 32px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {NAV_ITEMS.map(item => {
                                const active = activeSection === item.id
                                return (
                                    <button key={item.id} onClick={() => { setShowSecSheet(false); setTimeout(() => scrollTo(item.id), 120) }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 11, cursor: 'pointer', border: 'none', background: active ? '#eff6ff' : 'none', fontFamily: 'inherit', width: '100%', textAlign: 'left' as const }}>
                                        <div style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, background: active ? 'rgba(19,91,236,0.1)' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
                                            {item.icon}
                                        </div>
                                        <div style={{ flex: 1, textAlign: 'left' as const }}>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: item.danger ? '#dc2626' : (active ? '#135bec' : '#0f172a') }}>{item.label}</div>
                                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{SEC_DESCRIPTIONS[item.id]}</div>
                                        </div>
                                        {active && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#135bec" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </>
            )}

            {/* Delete confirmation modal */}
            {deleteModalOpen && (
                <div style={S.modalBackdrop} onClick={(e) => { if (e.target === e.currentTarget) setDeleteModalOpen(false) }}>
                    <div style={S.modal}>
                        <div style={{ padding: '24px 24px 20px' }}>
                            <div style={S.modalIcon}>⚠</div>
                            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em', marginBottom: 8 }}>Are you absolutely sure?</h3>
                            <p style={{ fontSize: 13, color: '#475569', marginBottom: 16, lineHeight: 1.6 }}>This will permanently delete your JobScorer account. You&apos;ll lose:</p>
                            <ul style={S.modalList}>
                                {[`${resumes.length} uploaded and tailored resume${resumes.length === 1 ? '' : 's'}`,
                                'All AI job matches and scoring history',
                                'All company research reports',
                                'All tailored resume PDFs'].map((line, i) => (
                                    <li key={i} style={S.modalListItem}>
                                        <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#dc2626', flexShrink: 0 }} />
                                        {line}
                                    </li>
                                ))}
                            </ul>
                            <p style={{ fontSize: 13, color: '#475569', marginBottom: 10 }}>
                                Type <b style={{ color: '#dc2626', fontFamily: "var(--font-mono), 'JetBrains Mono', ui-monospace, monospace" }}>DELETE</b> to confirm:
                            </p>
                            <input style={S.input} type="text" placeholder="DELETE" autoComplete="off"
                                value={deleteConfirmText}
                                onChange={e => setDeleteConfirmText(e.target.value)} autoFocus />
                        </div>
                        <div style={{ padding: '14px 24px', display: 'flex', justifyContent: 'flex-end', gap: 8, background: '#fafbfc', borderTop: '1px solid #e2e8f0' }}>
                            <button style={S.btnGhost} onClick={() => { setDeleteModalOpen(false); setDeleteConfirmText('') }}>Cancel</button>
                            <button style={{ ...S.btnDanger, opacity: deleteConfirmText === 'DELETE' ? 1 : 0.5, cursor: deleteConfirmText === 'DELETE' ? 'pointer' : 'not-allowed' }}
                                disabled={deleteConfirmText !== 'DELETE'} onClick={handleDeleteAccount}>
                                Delete forever
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                @media (max-width: 900px) {
                    .rs-body-grid { grid-template-columns: 1fr !important; gap: 16px !important; }
                    .rs-side-nav { display: none !important; }
                    .rs-tabbar { display: none !important; }
                    .rs-sec-nav { display: block !important; }
                    .rs-field-row { grid-template-columns: 1fr !important; }
                    .rs-usage-grid { grid-template-columns: repeat(2, 1fr) !important; }
                    .rs-level-grid { grid-template-columns: repeat(2, 1fr) !important; }
                    .rs-radioGrid4 { grid-template-columns: repeat(2, 1fr) !important; }
                    .rs-resume-row { flex-wrap: wrap !important; padding: 12px !important; background: #f8fafc !important; border: 1px solid #e2e8f0 !important; border-radius: 10px !important; margin-bottom: 8px !important; row-gap: 0 !important; }
                    .rs-resume-actions { width: 100% !important; border-top: 1px solid #f1f5f9 !important; padding-top: 10px !important; margin-top: 6px !important; }
                    .rs-resume-set-primary { flex: 1 !important; border: 1.5px solid rgba(19,91,236,0.25) !important; background: #eff6ff !important; color: #135bec !important; padding: 7px 0 !important; border-radius: 8px !important; font-size: 12px !important; font-weight: 700 !important; cursor: pointer !important; font-family: inherit !important; }
                    .rs-dangerRow { flex-direction: column !important; align-items: flex-start !important; gap: 12px !important; }
                    .rs-upgrade-card { flex-wrap: wrap !important; align-items: flex-start !important; }
                    .rs-upgrade-card button { width: 100% !important; justify-content: center !important; margin-top: 6px !important; }
                }
                input::placeholder { color: #64748b; opacity: 1; }
            `}</style>
        </PageShell>
    )
}

// ── Sub-components ── //

const NAV_ITEMS: { id: SectionId; label: string; icon: string; danger?: boolean }[] = [
    { id: 'profile', label: 'Profile', icon: '👤' },
    { id: 'prefs', label: 'Job Preferences', icon: '🎯' },
    { id: 'resumes', label: 'Resumes', icon: '📄' },
    { id: 'notifications', label: 'Notifications', icon: '🔔' },
    { id: 'plan', label: 'Plan & Billing', icon: '💳' },
    { id: 'usage', label: 'Usage & Limits', icon: '📊' },
    { id: 'security', label: 'Security', icon: '🔒' },
    { id: 'danger', label: 'Danger Zone', icon: '⚠️', danger: true },
]

const SEC_DESCRIPTIONS: Record<SectionId, string> = {
    profile: 'Name, avatar, email',
    prefs: 'Roles, locations, experience level',
    resumes: 'Uploaded files, primary resume',
    notifications: 'Email frequency and alerts',
    plan: 'Subscription, upgrades, payment',
    usage: 'Monthly activity & quotas',
    security: 'Password, connected accounts, sessions',
    danger: 'Delete account, sign out everywhere',
}

function PageShell({ children }: { children: React.ReactNode }) {
    return (
        <div style={{
            width: '100%', paddingBottom: 96, paddingLeft: 8, paddingRight: 8,
            // Inherit Inter from the body (next/font preload in app/layout.tsx)
            // — keeps Settings visually consistent with every other dashboard page.
            color: '#0f172a',
        }}>{children}</div>
    )
}

function Card({ id, refSetter, title, sub, children, danger }: {
    id: string
    refSetter: (el: HTMLElement | null) => void
    title: string
    sub: string
    children: React.ReactNode
    danger?: boolean
}) {
    return (
        <section id={id} ref={refSetter as any} style={{
            background: danger ? 'linear-gradient(135deg, #fef2f2 0%, rgba(254,242,242,0) 240px), #fff' : '#fff',
            border: `1px solid ${danger ? '#fecaca' : '#e2e8f0'}`,
            borderRadius: 12, boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
            scrollMarginTop: 96, overflow: 'hidden',
        }}>
            <div style={{ padding: '24px 28px 20px' }}>
                <h2 style={{
                    fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em',
                    color: danger ? '#dc2626' : '#0f172a', marginBottom: 6,
                    margin: '0 0 6px 0',
                }}>{title}</h2>
                <p style={{ fontSize: 14, color: danger ? '#991b1b' : '#475569', margin: 0 }}>{sub}</p>
            </div>
            <div style={{ height: 1, background: danger ? '#fecaca' : '#e2e8f0' }} />
            {children}
        </section>
    )
}

function CardFooter({ savedVisible, disabled, onCancel, onSave }: {
    savedVisible: boolean; disabled: boolean
    onCancel: () => void; onSave: () => void
}) {
    return (
        <div style={S.cardFooter}>
            {savedVisible && <span style={S.savePill}>✓ Saved</span>}
            <button style={S.btnGhost} onClick={onCancel}>Cancel</button>
            <button style={{
                ...S.btnPrimary,
                background: disabled ? '#cbd5e1' : '#135bec',
                cursor: disabled ? 'not-allowed' : 'pointer',
            }} disabled={disabled} onClick={onSave}>Save changes</button>
        </div>
    )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label style={S.fieldLabel}>{label}</label>
            {children}
        </div>
    )
}

function ChipField({ values, placeholder, onChange, options = [], inputRef }: {
    values: string[]; placeholder: string
    onChange: (vs: string[]) => void
    /** Master vocabulary for autocomplete (IT_ROLES / INDIA_LOCATIONS). Empty = free-text only. */
    options?: string[]
    /** External ref so the parent can refocus the input after a SuggestRow click. */
    inputRef?: React.RefObject<HTMLInputElement | null>
}) {
    const [input, setInput] = useState('')
    const [focused, setFocused] = useState(false)
    const [highlight, setHighlight] = useState(0)
    const localInputRef = useRef<HTMLInputElement>(null)
    const actualInputRef = inputRef ?? localInputRef
    // Standard combobox pattern: a blur timer briefly delays closing the dropdown
    // so a click on a dropdown item (which would blur the input) has time to
    // register before the dropdown disappears. Clear the timer on focus.
    const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Filter + rank: not already added, matches input case-insensitively.
    // Ranking (so 'soc' surfaces 'SOC Analyst' before 'Associate Software Engineer'):
    //   0 — string startsWith query        (e.g., "soc" → "SOC Analyst")
    //   1 — any word in the string startsWith query
    //   2 — substring match anywhere       (e.g., "soc" inside "asSOCiate")
    const lowerInput = input.trim().toLowerCase()
    const filtered = (() => {
        const available = options.filter(o => !values.some(v => v.toLowerCase() === o.toLowerCase()))
        if (lowerInput === '') return available.slice(0, 10)
        const scored: Array<{ opt: string; rank: number }> = []
        for (const opt of available) {
            const lower = opt.toLowerCase()
            if (lower.startsWith(lowerInput)) {
                scored.push({ opt, rank: 0 })
            } else if (lower.split(/[\s/.-]+/).some(w => w.startsWith(lowerInput))) {
                scored.push({ opt, rank: 1 })
            } else if (lower.includes(lowerInput)) {
                scored.push({ opt, rank: 2 })
            }
        }
        scored.sort((a, b) => a.rank - b.rank)
        return scored.slice(0, 10).map(s => s.opt)
    })()

    // Show dropdown whenever the user has typed a matching query, even if the
    // browser's focus state is briefly stale — this prevents the "I typed half
    // of soc and saw nothing until I clicked away and back" race condition.
    const dropdownOpen = options.length > 0 && filtered.length > 0 && (focused || lowerInput.length > 0)

    function handleFocus() {
        if (blurTimerRef.current !== null) {
            clearTimeout(blurTimerRef.current)
            blurTimerRef.current = null
        }
        setFocused(true)
    }
    function handleBlur() {
        // 180ms grace period so a click on a dropdown item commits before the
        // dropdown vanishes. Dropdown items also call preventDefault on
        // mousedown which would normally avoid the blur entirely, but the
        // delay is belt-and-suspenders.
        if (blurTimerRef.current !== null) clearTimeout(blurTimerRef.current)
        blurTimerRef.current = setTimeout(() => {
            setFocused(false)
            blurTimerRef.current = null
        }, 180)
    }

    // Clean up any pending timer if the component unmounts mid-blur.
    useEffect(() => {
        return () => {
            if (blurTimerRef.current !== null) clearTimeout(blurTimerRef.current)
        }
    }, [])

    function commit(value: string) {
        const v = value.trim()
        if (!v) return
        onChange(dedupAdd(values, v))
        setInput('')
        setHighlight(0)
    }

    return (
        <div style={{ position: 'relative' }}>
            <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 8,
                padding: '10px 12px', background: '#fff',
                border: `1px solid ${focused ? '#135bec' : '#e2e8f0'}`,
                borderRadius: 8, minHeight: 44, alignItems: 'center',
                boxShadow: focused ? '0 0 0 3px #dbeafe' : 'none',
                transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
                // Click anywhere on the chip-field wrapper → focus the input.
                onMouseDown={e => {
                    if (e.target === actualInputRef.current) return
                    // Only refocus on plain clicks in empty space inside the wrapper;
                    // chip × buttons handle their own events.
                    if ((e.target as HTMLElement).tagName === 'DIV') {
                        e.preventDefault()
                        actualInputRef.current?.focus()
                    }
                }}>
                {values.map(v => (
                    <span key={v} style={S.chip}>
                        {v}
                        <button
                            type="button"
                            // preventDefault on mousedown keeps the input focused
                            // when the user clicks × to remove a chip.
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => onChange(values.filter(x => x !== v))}
                            style={S.chipRemove}
                        >×</button>
                    </span>
                ))}
                <input ref={actualInputRef} style={S.chipInput} type="text"
                    value={input}
                    placeholder={placeholder}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    onChange={e => { setInput(e.target.value); setHighlight(0) }}
                    onKeyDown={e => {
                        if (e.key === 'Enter') {
                            e.preventDefault()
                            // Prefer the highlighted suggestion if dropdown is open
                            if (dropdownOpen && filtered[highlight]) {
                                commit(filtered[highlight])
                            } else if (input.trim()) {
                                commit(input)
                            }
                        } else if (e.key === 'ArrowDown' && dropdownOpen) {
                            e.preventDefault()
                            setHighlight(h => Math.min(h + 1, filtered.length - 1))
                        } else if (e.key === 'ArrowUp' && dropdownOpen) {
                            e.preventDefault()
                            setHighlight(h => Math.max(h - 1, 0))
                        } else if (e.key === 'Escape') {
                            actualInputRef.current?.blur()
                        } else if (e.key === 'Backspace' && !input && values.length > 0) {
                            onChange(values.slice(0, -1))
                        }
                    }}
                    autoComplete="off" />
            </div>

            {dropdownOpen && (
                <div style={S.dropdown}>
                    {filtered.map((opt, i) => {
                        const active = i === highlight
                        return (
                            <button
                                key={opt}
                                type="button"
                                // preventDefault on mousedown is the canonical way
                                // to keep the input focused when clicking a dropdown
                                // item — without it the blur fires first and the
                                // dropdown can disappear before the click registers.
                                onMouseDown={e => { e.preventDefault(); commit(opt) }}
                                onMouseEnter={() => setHighlight(i)}
                                style={{
                                    ...S.dropdownItem,
                                    background: active ? '#eff6ff' : 'transparent',
                                    color: active ? '#135bec' : '#1e293b',
                                    fontWeight: active ? 600 : 500,
                                }}
                            >
                                {opt}
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

function SuggestRow({ label, suggestions, existing, onAdd }: {
    label: string; suggestions: string[]; existing: string[]; onAdd: (v: string) => void
}) {
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginRight: 4 }}>{label}</span>
            {suggestions.map(s => {
                const taken = existing.some(e => e.toLowerCase() === s.toLowerCase())
                return (
                    <button key={s} onClick={() => !taken && onAdd(s)}
                        style={{
                            fontSize: 12, fontWeight: 600, color: taken ? '#cbd5e1' : '#1e293b',
                            background: '#f1f5f9', border: '1px dashed #94a3b8',
                            padding: '4px 10px', borderRadius: 99,
                            cursor: taken ? 'not-allowed' : 'pointer',
                            opacity: taken ? 0.5 : 1,
                            pointerEvents: taken ? 'none' : 'auto',
                        }}>
                        {s}
                    </button>
                )
            })}
        </div>
    )
}

function UsageTile({ label, value, max, warnAt = 0.85 }: { label: string; value: number; max: number; warnAt?: number }) {
    const pct = Math.min(100, (value / Math.max(1, max)) * 100)
    const warn = pct / 100 >= warnAt
    return (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 18 }}>
            <div style={{
                fontFamily: "var(--font-mono), 'JetBrains Mono', ui-monospace, monospace", fontSize: 11, fontWeight: 600,
                letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 12,
            }}>{label}</div>
            <div style={{
                fontFamily: "var(--font-mono), 'JetBrains Mono', ui-monospace, monospace", fontSize: 38, fontWeight: 700,
                color: '#0f172a', lineHeight: 1, marginBottom: 14,
            }}>{value}</div>
            <div style={{ height: 5, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden', marginBottom: 10 }}>
                <div style={{ height: '100%', width: `${pct}%`, background: warn ? '#d97706' : '#135bec', borderRadius: 99, transition: 'width 0.6s ease' }} />
            </div>
            <div style={{ fontFamily: "var(--font-mono), 'JetBrains Mono', ui-monospace, monospace", fontSize: 12, color: '#94a3b8' }}>{value} / {max} this month</div>
        </div>
    )
}

// ── Helpers ── //

function dedupAdd(arr: string[], val: string): string[] {
    const v = val.trim()
    if (!v) return arr
    if (arr.some(x => x.toLowerCase() === v.toLowerCase())) return arr
    return [...arr, v]
}

function partialFromOriginal(o: UserSettings, id: 'profile' | 'prefs' | 'notifications'): Partial<UserSettings> {
    if (id === 'profile') return { full_name: o.full_name }
    if (id === 'prefs') return {
        target_roles: o.target_roles, target_locations: o.target_locations,
        experience_level: o.experience_level, remote_preference: o.remote_preference,
    }
    return { email_frequency: o.email_frequency, notification_prefs: o.notification_prefs }
}

// ── Styles ── //
const S: Record<string, React.CSSProperties> = {
    eyebrow: {
        fontFamily: "var(--font-mono), 'JetBrains Mono', ui-monospace, monospace", fontSize: 11, fontWeight: 700,
        letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748b', marginBottom: 10,
    },
    pageTitle: { fontSize: 34, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.025em', marginBottom: 6 },
    pageSub: { fontSize: 15, color: '#475569' },
    bodyGrid: { display: 'grid', gridTemplateColumns: '260px 1fr', gap: 32 },
    // Default `align-items: stretch` makes the nav's grid cell as tall as the
    // content column. With `position: sticky` on the inner nav, it sticks at
    // top:24 and keeps sticking until you scroll past the bottom of the cell.
    navWrap: { display: 'block' },
    nav: { position: 'sticky', top: 24, display: 'flex', flexDirection: 'column', gap: 4 },
    navLink: {
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px', borderRadius: 8, fontSize: 14,
        cursor: 'pointer', textAlign: 'left',
        background: 'transparent', border: 'none',
        fontFamily: 'inherit',
        transition: 'background 0.15s, color 0.15s, border-color 0.15s',
    },
    tabbar: {
        display: 'none', position: 'sticky', top: 0, zIndex: 10,
        background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
        margin: '0 -32px 8px', padding: '0 32px', overflowX: 'auto',
    },
    tabbarLink: {
        flexShrink: 0, padding: 14, fontSize: 13, fontWeight: 500,
        cursor: 'pointer', whiteSpace: 'nowrap', background: 'transparent',
        fontFamily: 'inherit',
    },
    content: { display: 'flex', flexDirection: 'column', gap: 28, minWidth: 0 },
    cardBody: { padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 22 },
    cardFooter: {
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12,
        padding: '18px 28px', borderTop: '1px solid #e2e8f0', background: '#fafbfc',
    },
    fieldLabel: {
        fontFamily: "var(--font-mono), 'JetBrains Mono', ui-monospace, monospace", fontSize: 12, fontWeight: 800,
        letterSpacing: '0.12em', textTransform: 'uppercase', color: '#1e293b',
        display: 'block', marginBottom: 8,
    },
    fieldRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 },
    input: {
        width: '100%', background: '#fff', border: '1px solid #e2e8f0',
        borderRadius: 8, padding: '12px 16px', fontSize: 15, color: '#0f172a',
        outline: 'none', fontFamily: 'inherit',
    },
    inputBadge: {
        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 12, fontWeight: 600, color: '#16a34a',
        background: '#dcfce7', padding: '4px 10px', borderRadius: 99,
    },
    avatarRow: { display: 'flex', alignItems: 'center', gap: 18 },
    avatar: {
        width: 72, height: 72, borderRadius: '50%', background: '#135bec',
        color: '#fff', display: 'grid', placeItems: 'center',
        fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em', flexShrink: 0,
    },
    ghostLink: {
        fontSize: 14, fontWeight: 600, color: '#135bec',
        cursor: 'pointer', padding: '8px 12px', borderRadius: 6,
        background: 'transparent', border: 'none', fontFamily: 'inherit',
    },
    joinedPill: {
        display: 'inline-flex', alignItems: 'center', gap: 8,
        fontSize: 13, color: '#64748b', background: '#f8fafc',
        border: '1px solid #e2e8f0', padding: '10px 14px', borderRadius: 99,
        marginTop: 2,
    },
    btnPrimary: {
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '10px 18px', borderRadius: 8, fontSize: 14, fontWeight: 600,
        background: '#135bec', color: '#fff', border: 'none',
        fontFamily: 'inherit', cursor: 'pointer',
    },
    btnOutline: {
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '10px 18px', borderRadius: 8, fontSize: 14, fontWeight: 600,
        background: '#fff', color: '#135bec', border: '1px solid #135bec',
        fontFamily: 'inherit', cursor: 'pointer', textDecoration: 'none',
    },
    btnGhost: {
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '10px 18px', borderRadius: 8, fontSize: 14, fontWeight: 600,
        background: 'transparent', color: '#64748b', border: 'none',
        fontFamily: 'inherit', cursor: 'pointer',
    },
    btnDanger: {
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '10px 18px', borderRadius: 8, fontSize: 14, fontWeight: 600,
        background: '#dc2626', color: '#fff', border: 'none',
        fontFamily: 'inherit', cursor: 'pointer',
    },
    btnDangerOutline: {
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '10px 18px', borderRadius: 8, fontSize: 14, fontWeight: 600,
        background: '#fff', color: '#dc2626', border: '1px solid #fecaca',
        fontFamily: 'inherit', cursor: 'pointer',
    },
    savePill: {
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: 12, fontWeight: 600, color: '#16a34a',
        background: '#dcfce7', padding: '5px 11px', borderRadius: 99,
        animation: 'rsSaved 0.3s ease',
    },
    chip: {
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: '#dbeafe', color: '#1e3a8a',
        fontSize: 14, fontWeight: 600,
        padding: '6px 8px 6px 12px', borderRadius: 6,
    },
    chipRemove: {
        width: 20, height: 20, borderRadius: 4,
        display: 'inline-grid', placeItems: 'center',
        color: '#135bec', opacity: 0.6, cursor: 'pointer',
        background: 'transparent', border: 'none', fontFamily: 'inherit',
        fontSize: 15, lineHeight: 1,
    },
    chipInput: {
        flex: 1, minWidth: 140, border: 'none', outline: 'none',
        background: 'transparent', fontSize: 15, color: '#0f172a',
        padding: '6px 2px', fontFamily: 'inherit',
    },
    dropdown: {
        position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
        boxShadow: '0 12px 28px rgba(15,23,42,0.12)',
        zIndex: 20, maxHeight: 320, overflowY: 'auto',
        padding: 6,
    },
    dropdownItem: {
        display: 'block', width: '100%', textAlign: 'left',
        padding: '10px 12px', borderRadius: 6,
        fontSize: 14, fontFamily: 'inherit', color: '#1e293b',
        border: 'none', cursor: 'pointer',
        transition: 'background 0.1s ease',
    },
    segmented: { display: 'inline-flex', flexWrap: 'wrap', gap: 8 },
    segment: {
        fontSize: 14, fontWeight: 600, color: '#0f172a',
        background: '#fff', border: '1px solid #cbd5e1',
        padding: '10px 20px', borderRadius: 8,
        cursor: 'pointer', fontFamily: 'inherit',
    },
    allLevelsBtn: {
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
        padding: '8px 16px', borderRadius: 99,
        border: '1px solid #bfdbfe', cursor: 'pointer',
        marginBottom: 10,
    },
    levelGrid: {
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10,
    },
    levelTile: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        padding: '12px 16px', borderRadius: 8,
        border: '1px solid #cbd5e1', background: '#fff',
        cursor: 'pointer', fontFamily: 'inherit',
        textAlign: 'left', transition: 'background 0.15s, border-color 0.15s, color 0.15s',
    },
    radioGrid4: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 },
    radioTile: {
        display: 'flex', alignItems: 'center', gap: 12,
        border: '1px solid #cbd5e1', borderRadius: 8, padding: '14px 18px',
        cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#0f172a',
        background: '#fff', fontFamily: 'inherit',
        textAlign: 'left',
    },
    infoChip: {
        display: 'flex', alignItems: 'center', gap: 12,
        background: '#eff6ff', borderRadius: 8, padding: '14px 18px',
        fontSize: 14, color: '#1e3a8a',
    },
    resumeRow: {
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '14px 16px', borderRadius: 10, border: '1px solid transparent',
    },
    fileIcon: {
        width: 42, height: 42, borderRadius: 8,
        background: '#eff6ff', color: '#135bec',
        display: 'grid', placeItems: 'center', fontSize: 18, flexShrink: 0,
    },
    fileName: {
        fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 3,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    },
    fileMeta: { fontSize: 13, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 },
    primaryPill: {
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontFamily: "var(--font-mono), 'JetBrains Mono', ui-monospace, monospace", fontSize: 11, fontWeight: 600,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        color: '#d97706', background: '#fffbeb', border: '1px solid #fde68a',
        padding: '4px 10px', borderRadius: 99,
    },
    setPrimary: {
        fontSize: 13, fontWeight: 600, color: '#64748b',
        padding: '7px 12px', borderRadius: 6,
        cursor: 'pointer', background: 'transparent', border: 'none',
        fontFamily: 'inherit',
    },
    iconBtn: {
        width: 36, height: 36, borderRadius: 6,
        display: 'grid', placeItems: 'center',
        color: '#64748b', cursor: 'pointer',
        background: 'transparent', border: 'none', fontFamily: 'inherit',
    },
    toggleRow: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 16, padding: '14px 0',
    },
    frequencyRow: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 16, padding: '14px 18px', background: '#f8fafc',
        border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 6,
    },
    select: {
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6,
        padding: '8px 32px 8px 14px', fontSize: 14, fontWeight: 500, color: '#0f172a',
        cursor: 'pointer', appearance: 'none' as const,
        outline: 'none', fontFamily: 'inherit',
        backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6' fill='none'><path d='M1 1l4 4 4-4' stroke='%2364748b' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 10px center',
    },
    usageGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 },
    upgradeCard: {
        display: 'flex', alignItems: 'center', gap: 16,
        background: '#eff6ff', borderRadius: 10, padding: '16px 22px',
    },
    secRow: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 16, padding: '14px 0', borderBottom: '1px solid #f1f5f9',
    },
    brandG: {
        width: 26, height: 26, borderRadius: 4,
        display: 'grid', placeItems: 'center',
        background: '#fff', border: '1px solid #e2e8f0',
        fontSize: 14, fontWeight: 700, color: '#4285F4', flexShrink: 0,
    },
    sessionRow: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, padding: '10px 12px',
        background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0',
    },
    sessionDot: {
        width: 8, height: 8, borderRadius: '50%',
        background: '#16a34a', boxShadow: '0 0 0 3px #dcfce7', flexShrink: 0,
    },
    connectedPill: {
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontFamily: "var(--font-mono), 'JetBrains Mono', ui-monospace, monospace", fontSize: 10, fontWeight: 600,
        letterSpacing: '0.1em', textTransform: 'uppercase', color: '#16a34a',
        background: '#dcfce7', border: '1px solid #bbf7d0',
        padding: '3px 10px', borderRadius: 99,
    },
    dangerRow: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 24, padding: '20px 0', borderBottom: '1px solid #fecaca',
    },
    dangerTitle: {
        fontFamily: "var(--font-mono), 'JetBrains Mono', ui-monospace, monospace", fontSize: 12, fontWeight: 700,
        letterSpacing: '0.12em', textTransform: 'uppercase', color: '#dc2626', marginBottom: 8,
    },
    dangerDesc: { fontSize: 14, color: '#475569', maxWidth: 640 },
    modalBackdrop: {
        position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 50, padding: 24,
    },
    modal: {
        background: '#fff', borderRadius: 16, maxWidth: 480, width: '100%',
        boxShadow: '0 20px 50px rgba(15,23,42,0.25)', overflow: 'hidden',
    },
    modalIcon: {
        width: 40, height: 40, borderRadius: 10,
        background: '#fef2f2', color: '#dc2626',
        display: 'grid', placeItems: 'center', fontSize: 18, marginBottom: 14,
    },
    modalList: {
        listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6,
        marginBottom: 16, background: '#f8fafc', border: '1px solid #e2e8f0',
        borderRadius: 8, padding: '12px 14px',
    },
    modalListItem: { fontSize: 12, color: '#475569', display: 'flex', alignItems: 'center', gap: 8 },
}
