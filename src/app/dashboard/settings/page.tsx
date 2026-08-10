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
import { CAREER_EXPERIENCE_OPTIONS, CAREER_CHALLENGE_OPTIONS, JOB_TIMELINE_OPTIONS } from '@/lib/onboarding'
import BillingPanel from '@/components/billing/BillingPanel'
import ConfirmModal from '@/components/ConfirmModal'

const SANS = "'Plus Jakarta Sans', system-ui, sans-serif"

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

// Plan-aware usage meters: feature keys (from PLAN_QUOTAS) → display labels + icon.
// Must cover every key in PLAN_QUOTAS (src/lib/plan.ts) — the usage API returns
// all of them dynamically, so a feature missing here silently falls back to its
// raw snake_case name in the UI instead of a proper label (see the `?? {...}`
// fallback below). resume_edit, project_roadmap, project_coach were missing
// until this was audited against plan.ts (2026-08-07).
const USAGE_FEATURE_META: Record<string, { label: string; icon: IconName }> = {
    job_search: { label: 'Job Searches', icon: 'search' },
    score: { label: 'AI Match Runs', icon: 'target' },
    optimize: { label: 'Tailored Resumes', icon: 'doc' },
    company_research: { label: 'Company Research', icon: 'book' },
    build_plan: { label: 'Build Plans', icon: 'monitor' },
    chat: { label: 'AI Chat Messages', icon: 'sparkles' },
    learning_path: { label: 'Learning Paths', icon: 'link' },
    cover_letter: { label: 'Cover Letters', icon: 'doc' },
    resume_edit: { label: 'Resume Editor Messages', icon: 'sparkles' },
    project_roadmap: { label: 'Project Roadmaps', icon: 'monitor' },
    project_coach: { label: 'AI Project Coach', icon: 'user' },
}

type PlanUsage = { plan: 'free' | 'pro' | 'max'; usage: { feature: string; used: number; limit: number }[] }

// ── Icons (paths lifted 1:1 from the approved design) ── //
const ICONS = {
    user: ['M12 12a4 4 0 100-8 4 4 0 000 8z', 'M4 20c0-4 3.5-6 8-6s8 2 8 6'],
    target: ['M12 22a10 10 0 100-20 10 10 0 000 20z', 'M12 16a4 4 0 100-8 4 4 0 000 8z'],
    doc: ['M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z', 'M14 2v6h6'],
    bell: ['M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9', 'M13.73 21a2 2 0 01-3.46 0'],
    card: ['M2 7a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2z', 'M2 10h20'],
    chart: ['M3 3v18h18', 'M7 15l4-4 3 3 5-6'],
    lock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 018 0v4'],
    trash: ['M3 6h18', 'M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6h14z'],
    sparkles: ['M12 3l1.8 4.6L18 9.4l-4.2 1.8L12 16l-1.8-4.8L6 9.4l4.2-1.8z', 'M19 14l.9 2.3L22 17l-2.1.7L19 20l-.9-2.3L16 17l2.1-.7z'],
    book: ['M4 19.5A2.5 2.5 0 016.5 17H20', 'M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z'],
    monitor: ['M3 4h18v12H3z', 'M8 20h8M12 16v4'],
    link: ['M10 13a5 5 0 007.07 0l1.93-1.93a5 5 0 00-7.07-7.07L10 5', 'M14 11a5 5 0 00-7.07 0L5 12.93a5 5 0 007.07 7.07L14 19'],
    search: ['M11 19a8 8 0 100-16 8 8 0 000 16z', 'M21 21l-4.3-4.3'],
    chevronLeft: ['M15 18l-6-6 6-6', ''],
    chevronRight: ['M9 18l6-6-6-6', ''],
    check: ['M20 6L9 17l-5-5', ''],
    x: ['M18 6L6 18M6 6l12 12', ''],
    download: ['M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3', ''],
    warning: ['M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z', 'M12 9v4M12 17h.01'],
} as const
type IconName = keyof typeof ICONS

function Icon({ name, size = 16, stroke = 'currentColor', strokeWidth = 1.8 }: { name: IconName; size?: number; stroke?: string; strokeWidth?: number }) {
    const [d1, d2] = ICONS[name]
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
            <path d={d1} />
            {d2 && <path d={d2} />}
        </svg>
    )
}

const NAV_ITEMS: { id: SectionId; label: string; icon: IconName; danger?: boolean }[] = [
    { id: 'profile', label: 'Profile', icon: 'user' },
    { id: 'prefs', label: 'Job Preferences', icon: 'target' },
    { id: 'resumes', label: 'Resumes', icon: 'doc' },
    { id: 'notifications', label: 'Notifications', icon: 'bell' },
    { id: 'plan', label: 'Plan & Billing', icon: 'card' },
    { id: 'usage', label: 'Usage & Limits', icon: 'chart' },
    { id: 'security', label: 'Security', icon: 'lock' },
    { id: 'danger', label: 'Danger Zone', icon: 'trash', danger: true },
]

export default function SettingsPage() {
    const { user, signOut } = useAuth()
    const router = useRouter()
    const supabase = createClient()

    const [activeSection, setActiveSection] = useState<SectionId>('profile')
    const [mobileOpen, setMobileOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [settings, setSettings] = useState<UserSettings | null>(null)
    const [original, setOriginal] = useState<UserSettings | null>(null)
    const [resumes, setResumes] = useState<Resume[]>([])
    const [confirmDeleteResumeId, setConfirmDeleteResumeId] = useState<string | null>(null)
    const [usage, setUsage] = useState<UsageStats | null>(null)
    const [planUsage, setPlanUsage] = useState<PlanUsage | null>(null)
    const [loading, setLoading] = useState(true)
    const [toastVisible, setToastVisible] = useState(false)
    const [deleteModalOpen, setDeleteModalOpen] = useState(false)
    const [deleteConfirmText, setDeleteConfirmText] = useState('')
    const [signOutAllPending, setSignOutAllPending] = useState(false)
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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

    const selectSection = (id: SectionId) => {
        setActiveSection(id)
        setMobileOpen(true)
    }

    // Deep-link: /dashboard/settings#plan (e.g. redirected from the old /billing
    // route) opens the Plan & Billing section once the page has loaded.
    useEffect(() => {
        if (loading) return
        if (typeof window !== 'undefined' && window.location.hash) {
            const id = window.location.hash.slice(1) as SectionId
            if (NAV_ITEMS.some(n => n.id === id)) selectSection(id)
        }
    }, [loading])

    useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current) }, [])

    const showToast = () => {
        setToastVisible(true)
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
        toastTimerRef.current = setTimeout(() => setToastVisible(false), 2000)
    }

    // Compute per-section dirty state by comparing current settings against the
    // last-saved snapshot (`original`). Each section reads its own slice.
    const dirty = settings && original ? {
        profile: settings.full_name !== original.full_name ||
            settings.phone !== original.phone ||
            settings.headline !== original.headline ||
            settings.linkedin_url !== original.linkedin_url ||
            settings.github_url !== original.github_url,
        prefs: JSON.stringify({
            r: settings.target_roles, l: settings.target_locations,
            e: settings.experience_level, p: settings.remote_preference,
            ce: settings.career_experience_level, cc: settings.career_challenges,
            co: settings.career_challenge_other, jt: settings.job_search_timeline,
        }) !== JSON.stringify({
            r: original.target_roles, l: original.target_locations,
            e: original.experience_level, p: original.remote_preference,
            ce: original.career_experience_level, cc: original.career_challenges,
            co: original.career_challenge_other, jt: original.job_search_timeline,
        }),
    } : { profile: false, prefs: false }

    const saveProfile = async () => {
        if (!settings || !user?.id) return
        const patch = {
            full_name: settings.full_name,
            phone: settings.phone,
            headline: settings.headline,
            linkedin_url: settings.linkedin_url,
            github_url: settings.github_url,
        }
        await updateUserSettings(user.id, patch)
        setOriginal(s => s ? { ...s, ...patch } : s)
        showToast()
    }
    const savePrefs = async () => {
        if (!settings || !user?.id) return
        const patch = {
            target_roles: settings.target_roles,
            target_locations: settings.target_locations,
            experience_level: settings.experience_level,
            remote_preference: settings.remote_preference,
            career_experience_level: settings.career_experience_level,
            career_challenges: settings.career_challenges,
            career_challenge_other: settings.career_challenge_other,
            job_search_timeline: settings.job_search_timeline,
        }
        await updateUserSettings(user.id, patch)
        setOriginal(s => s ? { ...s, ...patch } : s)
        showToast()
    }
    // Notifications toggle instantly and persist immediately — no separate save step.
    const saveNotifPrefs = async (next: NotificationPrefs) => {
        if (!user?.id) return
        setSettings(s => s ? { ...s, notification_prefs: next } : s)
        await updateUserSettings(user.id, { notification_prefs: next })
        setOriginal(s => s ? { ...s, notification_prefs: next } : s)
        showToast()
    }
    const saveEmailFrequency = async (freq: string) => {
        if (!user?.id) return
        setSettings(s => s ? { ...s, email_frequency: freq } : s)
        await updateUserSettings(user.id, { email_frequency: freq })
        setOriginal(s => s ? { ...s, email_frequency: freq } : s)
        showToast()
    }

    const resetSection = (id: 'profile' | 'prefs') => {
        if (!original) return
        if (id === 'profile') {
            setSettings(s => s ? {
                ...s, full_name: original.full_name, phone: original.phone,
                headline: original.headline, linkedin_url: original.linkedin_url, github_url: original.github_url,
            } : s)
        } else {
            setSettings(s => s ? {
                ...s, target_roles: original.target_roles, target_locations: original.target_locations,
                experience_level: original.experience_level, remote_preference: original.remote_preference,
                career_experience_level: original.career_experience_level, career_challenges: original.career_challenges,
                career_challenge_other: original.career_challenge_other, job_search_timeline: original.job_search_timeline,
            } : s)
        }
    }

    const handleDeleteResume = (id: string) => setConfirmDeleteResumeId(id)

    const performDeleteResume = async (id: string) => {
        setConfirmDeleteResumeId(null)
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
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 64px)', color: '#94a3b8', fontFamily: SANS, fontSize: 14 }}>
                Loading settings…
            </div>
        )
    }

    const displayName = settings.full_name ?? user?.email?.split('@')[0] ?? 'You'
    const initial = firstInitial(settings.full_name ?? user?.email)
    const q = searchQuery.trim().toLowerCase()
    const filteredNavItems = NAV_ITEMS.filter(it => !q || it.label.toLowerCase().includes(q))
    const planLabel = !planUsage || planUsage.plan === 'free' ? 'Free' : planUsage.plan === 'pro' ? 'Pro' : 'Max'

    // ── Section body renderer — used for both the desktop main column and the
    // mobile drill-down detail screen so the two stay in lockstep. ── //
    function renderSection(id: SectionId) {
        if (!settings) return null
        switch (id) {
            case 'profile': return (
                <>
                    <h1 style={S.h1}>Profile</h1>
                    <p style={S.sub}>Your basic account details. Email cannot be changed.</p>

                    <div style={S.card}>
                        <div style={S.avatarRow}>
                            <div style={S.avatarCircle}>{initial}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{displayName}</div>
                                <div style={{ fontSize: 12.5, color: '#94a3b8', marginTop: 2 }}>JPG or PNG · up to 2MB</div>
                            </div>
                            <button style={S.btnOutlineSmall} onClick={() => alert('Avatar upload coming soon.')}>Change avatar</button>
                        </div>

                        <div style={S.grid2} className="set-grid2">
                            <Field label="Full name">
                                <input style={S.input} type="text" value={settings.full_name ?? ''}
                                    onChange={e => setSettings(s => s ? { ...s, full_name: e.target.value } : s)}
                                    placeholder="Your name" />
                            </Field>
                            <Field label="Email">
                                <div style={S.readonlyBox}>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{settings.email}</span>
                                    <span style={{ color: '#10b981', fontWeight: 700, fontSize: 11.5, whiteSpace: 'nowrap' }}>✓ Verified</span>
                                </div>
                            </Field>
                            <Field label="Phone number">
                                <input style={S.input} type="tel" value={settings.phone ?? ''}
                                    onChange={e => setSettings(s => s ? { ...s, phone: e.target.value } : s)}
                                    placeholder="+91 98765 43210" />
                            </Field>
                            <Field label="Member since">
                                <div style={S.readonlyBox}>{formatMemberSince(settings.joined_at)}</div>
                            </Field>
                        </div>
                    </div>

                    <div style={S.card}>
                        <div style={S.cardEyebrow}>Professional details</div>
                        <div style={S.grid2} className="set-grid2">
                            <div style={{ gridColumn: '1 / -1' }}>
                                <Field label="Professional headline">
                                    <input style={S.input} type="text" value={settings.headline ?? ''}
                                        onChange={e => setSettings(s => s ? { ...s, headline: e.target.value } : s)}
                                        placeholder="e.g. Full Stack Developer, 2 yrs exp" />
                                </Field>
                            </div>
                            <Field label="LinkedIn URL">
                                <input style={S.input} type="text" value={settings.linkedin_url ?? ''}
                                    onChange={e => setSettings(s => s ? { ...s, linkedin_url: e.target.value } : s)}
                                    placeholder="linkedin.com/in/username" />
                            </Field>
                            <Field label="GitHub / Portfolio URL">
                                <input style={S.input} type="text" value={settings.github_url ?? ''}
                                    onChange={e => setSettings(s => s ? { ...s, github_url: e.target.value } : s)}
                                    placeholder="github.com/username" />
                            </Field>
                        </div>
                    </div>

                    <FooterButtons disabled={!dirty.profile} onCancel={() => resetSection('profile')} onSave={saveProfile} />
                </>
            )

            case 'prefs': return (
                <>
                    <h1 style={S.h1}>Job Preferences</h1>
                    <p style={S.sub}>Tells our AI what jobs to surface for you.</p>

                    <div style={S.card}>
                        <div style={S.cardEyebrow}>Target roles</div>
                        <ChipField
                            values={settings.target_roles}
                            placeholder="Start typing a role…"
                            options={IT_ROLES}
                            inputRef={rolesInputRef}
                            onChange={vs => setSettings(s => s ? { ...s, target_roles: vs } : s)}
                        />
                        <SuggestRow suggestions={ROLE_SUGGESTIONS} existing={settings.target_roles}
                            onAdd={v => {
                                setSettings(s => s ? { ...s, target_roles: dedupAdd(s.target_roles, v) } : s)
                                requestAnimationFrame(() => rolesInputRef.current?.focus())
                            }} />
                    </div>

                    <div style={S.card}>
                        <div style={S.cardEyebrow}>Target locations</div>
                        <ChipField
                            values={settings.target_locations}
                            placeholder="Start typing a city…"
                            options={INDIA_LOCATIONS}
                            inputRef={locationsInputRef}
                            onChange={vs => setSettings(s => s ? { ...s, target_locations: vs } : s)}
                        />
                        <SuggestRow suggestions={LOCATION_SUGGESTIONS} existing={settings.target_locations}
                            onAdd={v => {
                                setSettings(s => s ? { ...s, target_locations: dedupAdd(s.target_locations, v) } : s)
                                requestAnimationFrame(() => locationsInputRef.current?.focus())
                            }} />
                    </div>

                    <div style={S.card}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                            <div style={{ ...S.cardEyebrow, marginBottom: 0 }}>Experience level</div>
                            {(() => {
                                const selected = parseLevels(settings.experience_level)
                                const allOn = selected.length === ALL_LEVEL_KEYS.length
                                return (
                                    <button
                                        onClick={() => setSettings(s => s ? { ...s, experience_level: allOn ? '' : serializeLevels(ALL_LEVEL_KEYS) } : s)}
                                        style={{ ...S.pillToggle, background: allOn ? '#135bec' : '#eff6ff', color: allOn ? '#fff' : '#135bec', borderColor: allOn ? '#135bec' : '#bfdbfe' }}>
                                        {allOn ? '✓ All Levels' : 'All Levels'}
                                    </button>
                                )
                            })()}
                        </div>
                        {(() => {
                            const selected = parseLevels(settings.experience_level)
                            const toggle = (key: string) => {
                                const next = selected.includes(key) ? selected.filter(k => k !== key) : [...selected, key]
                                setSettings(s => s ? { ...s, experience_level: serializeLevels(next) } : s)
                            }
                            return (
                                <div style={S.levelGrid} className="set-level-grid">
                                    {EXPERIENCE_LEVELS.map(lvl => {
                                        const active = selected.includes(lvl.key)
                                        return (
                                            <button key={lvl.key} onClick={() => toggle(lvl.key)}
                                                style={{ ...S.levelTile, borderColor: active ? '#135bec' : '#e2e8f0', background: active ? '#135bec' : '#fff', color: active ? '#fff' : '#0f172a' }}>
                                                <span style={{ fontSize: 13, fontWeight: 700 }}>{lvl.label}</span>
                                                <span style={{ fontSize: 11, opacity: 0.75 }}>{lvl.years}</span>
                                            </button>
                                        )
                                    })}
                                </div>
                            )
                        })()}
                    </div>

                    <div style={S.card}>
                        <div style={S.cardEyebrow}>Remote preference</div>
                        <div style={S.remoteGrid} className="set-remote-grid">
                            {REMOTE_OPTIONS.map(opt => {
                                const active = settings.remote_preference === opt
                                return (
                                    <button key={opt} onClick={() => setSettings(s => s ? { ...s, remote_preference: opt } : s)}
                                        style={{ ...S.remoteTile, borderColor: active ? '#135bec' : '#e2e8f0', background: active ? '#eff6ff' : '#fff', color: active ? '#135bec' : '#475569', fontWeight: active ? 700 : 500 }}>
                                        <span style={{ width: 13, height: 13, borderRadius: '50%', border: `2px solid ${active ? '#135bec' : '#cbd5e1'}`, background: active ? '#135bec' : 'transparent', flexShrink: 0 }} />
                                        {opt}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    <div style={S.card}>
                        <div style={S.cardEyebrow}>Your experience level</div>
                        <div style={S.levelGrid} className="set-level-grid">
                            {CAREER_EXPERIENCE_OPTIONS.map(opt => {
                                const active = settings.career_experience_level === opt
                                return (
                                    <button key={opt} onClick={() => setSettings(s => s ? { ...s, career_experience_level: opt } : s)}
                                        style={{ ...S.levelTile, alignItems: 'center', textAlign: 'center', borderColor: active ? '#135bec' : '#e2e8f0', background: active ? '#eff6ff' : '#fff', color: active ? '#135bec' : '#334155' }}>
                                        <span style={{ fontSize: 13, fontWeight: 700 }}>{opt}</span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    <div style={S.card}>
                        <div style={S.cardEyebrow}>Biggest career challenge</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }} className="set-challenge-grid">
                            {CAREER_CHALLENGE_OPTIONS.map(opt => {
                                const active = settings.career_challenges.includes(opt.key)
                                return (
                                    <button key={opt.key}
                                        onClick={() => setSettings(s => s ? {
                                            ...s, career_challenges: active ? s.career_challenges.filter(k => k !== opt.key) : [...s.career_challenges, opt.key],
                                        } : s)}
                                        style={{ ...S.remoteTile, gap: 10, borderColor: active ? '#135bec' : '#e2e8f0', background: active ? '#eff6ff' : '#fff', color: active ? '#135bec' : '#334155', fontWeight: active ? 700 : 500 }}>
                                        <span style={{ fontSize: 17, flexShrink: 0 }}>{opt.icon}</span>
                                        {opt.label}
                                    </button>
                                )
                            })}
                        </div>
                        {settings.career_challenges.includes('other') && (
                            <textarea
                                value={settings.career_challenge_other ?? ''}
                                onChange={e => setSettings(s => s ? { ...s, career_challenge_other: e.target.value } : s)}
                                placeholder="Tell us a bit more about your challenge…"
                                style={{ width: '100%', marginTop: 12, height: 80, border: '1.5px solid #135bec', borderRadius: 12, padding: '12px 14px', fontSize: 13.5, fontFamily: SANS, color: '#0f172a', outline: 'none', resize: 'none' }}
                            />
                        )}
                    </div>

                    <div style={S.card}>
                        <div style={S.cardEyebrow}>When do you want your next job?</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {JOB_TIMELINE_OPTIONS.map(opt => {
                                const active = settings.job_search_timeline === opt.key
                                return (
                                    <button key={opt.key} onClick={() => setSettings(s => s ? { ...s, job_search_timeline: opt.key } : s)}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 9, border: `1.5px solid ${active ? '#135bec' : '#e2e8f0'}`, background: active ? '#eff6ff' : '#fff', color: active ? '#135bec' : '#334155', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
                                        {opt.label}
                                        {active && <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#135bec', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>✓</span>}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    <FooterButtons disabled={!dirty.prefs} onCancel={() => resetSection('prefs')} onSave={savePrefs} />
                </>
            )

            case 'resumes': return (
                <>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24 }}>
                        <div>
                            <h1 style={{ ...S.h1, marginBottom: 6 }}>Resumes</h1>
                            <p style={{ ...S.sub, marginBottom: 0 }}>The Primary resume is what AI matches against.</p>
                        </div>
                        <Link href="/dashboard/upload" style={S.btnPrimaryLink}>+ Upload new</Link>
                    </div>

                    <div style={S.cardNoPad}>
                        {resumes.length === 0 ? (
                            <div style={{ padding: 28, textAlign: 'center', color: '#94a3b8', fontSize: 13.5 }}>No resumes uploaded yet.</div>
                        ) : resumes.map((r, i) => {
                            const isPrimary = !!r.is_primary
                            const tailoredFor = (r as any).tailored_for ?? null
                            return (
                                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderBottom: i === resumes.length - 1 ? 'none' : '1px solid #f1f5f9' }} className="set-resume-row">
                                    <span style={{ width: 40, height: 40, borderRadius: 9, background: isPrimary ? '#eff6ff' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <Icon name="doc" size={18} stroke={isPrimary ? '#135bec' : '#64748b'} />
                                    </span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 14.5, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.original_filename ?? 'resume.pdf'}</div>
                                        <div style={{ fontSize: 12.5, color: '#94a3b8', marginTop: 2 }}>
                                            {isPrimary ? 'Uploaded' : 'Added'} {formatResumeDate(r.created_at)} · {isPrimary ? 'master resume' : (tailoredFor ?? 'tailored resume')}
                                        </div>
                                    </div>
                                    {isPrimary ? (
                                        <span style={S.primaryBadge}>★ Primary</span>
                                    ) : (
                                        <button style={S.setPrimaryBtn} onClick={() => handleSetPrimary(r.id)}>Set as primary</button>
                                    )}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                        <button type="button" title="Download" style={S.iconBtn} onClick={() => handleDownloadResume(r.id)}>
                                            <Icon name="download" size={16} />
                                        </button>
                                        <button type="button" title="Delete" style={S.iconBtn} onClick={() => handleDeleteResume(r.id)}
                                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2'; (e.currentTarget as HTMLButtonElement).style.color = '#dc2626' }}
                                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#64748b' }}>
                                            <Icon name="trash" size={16} />
                                        </button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </>
            )

            case 'notifications': return (
                <>
                    <h1 style={S.h1}>Notifications</h1>
                    <p style={S.sub}>Control what we email and notify you about.</p>

                    <div style={{ ...S.toggleRow, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 18px' }}>
                        <div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>Email frequency</div>
                            <div style={{ fontSize: 12.5, color: '#94a3b8', marginTop: 2 }}>How often we batch and send updates</div>
                        </div>
                        <select style={S.select} value={settings.email_frequency} onChange={e => saveEmailFrequency(e.target.value)}>
                            {EMAIL_FREQ.map(f => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
                        </select>
                    </div>

                    <div>
                        {(Object.entries({
                            new_strong_matches: ['New strong matches', 'When jobs above 80% match are found'],
                            weekly_digest: ['Weekly match digest', 'Sunday morning summary of new jobs and activity'],
                            interview_reminders: ['Interview reminders', 'When you have an upcoming interview'],
                            product_updates: ['Product updates', 'New features and improvements'],
                            tips_career_advice: ['Tips & career advice', 'Occasional career growth content'],
                        }) as [keyof NotificationPrefs, [string, string]][]).map(([key, [title, desc]], i, arr) => {
                            const on = settings.notification_prefs[key]
                            const isLast = i === arr.length - 1
                            return (
                                <div key={key} style={{ ...S.toggleRow, borderBottom: isLast ? 'none' : '1px solid #f1f5f9' }}>
                                    <div>
                                        <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{title}</div>
                                        <div style={{ fontSize: 12.5, color: '#94a3b8', marginTop: 2 }}>{desc}</div>
                                    </div>
                                    <ToggleSwitch on={on} onClick={() => saveNotifPrefs({ ...settings.notification_prefs, [key]: !on })} />
                                </div>
                            )
                        })}
                    </div>
                </>
            )

            case 'plan': return (
                <>
                    <h1 style={S.h1}>Plan &amp; Billing</h1>
                    <p style={S.sub}>Your subscription, upgrades, and payment.</p>
                    <BillingPanel />
                </>
            )

            case 'usage': {
                const rows = (planUsage?.usage ?? []).map(u => {
                    const meta = USAGE_FEATURE_META[u.feature] ?? { label: u.feature, icon: 'doc' as IconName }
                    const limit = u.limit < 0 ? Math.max(u.used, 1) : u.limit
                    const pct = Math.min(100, Math.round((u.used / Math.max(1, limit)) * 100))
                    const warn = u.limit >= 0 && pct >= 80
                    const color = warn ? '#f59e0b' : '#135bec'
                    const iconBg = warn ? '#fef3c7' : '#eff6ff'
                    return { ...u, meta, limit, pct, color, iconBg }
                })
                return (
                    <>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 28 }}>
                            <div>
                                <h1 style={{ ...S.h1, marginBottom: 6 }}>Usage &amp; Limits</h1>
                                <p style={{ ...S.sub, marginBottom: 0 }}>Your activity this month on the <b style={{ color: '#135bec' }}>{planLabel}</b> plan.</p>
                            </div>
                            {usage?.resetDate && (
                                <span style={S.pill}>Resets {new Date(usage.resetDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</span>
                            )}
                        </div>

                        <div style={S.usageGrid} className="set-usage-grid">
                            {rows.map(u => (
                                <div key={u.feature} style={S.card}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                                        <span style={{ width: 32, height: 32, borderRadius: 8, background: u.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <Icon name={u.meta.icon} size={16} stroke={u.color} strokeWidth={2} />
                                        </span>
                                        <span style={{ fontSize: 13.5, fontWeight: 600, color: '#334155' }}>{u.meta.label}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 }}>
                                        <span style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{u.used}</span>
                                        <span style={{ fontSize: 13, color: '#94a3b8' }}>/ {u.limit < 0 ? '∞' : u.limit} used</span>
                                        <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: u.color }}>{u.pct}%</span>
                                    </div>
                                    <div style={{ height: 7, borderRadius: 99, background: '#f1f5f9', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', borderRadius: 99, background: u.color, width: `${u.pct}%`, transition: 'width 0.5s ease' }} />
                                    </div>
                                </div>
                            ))}
                            {!planUsage && <div style={{ fontSize: 13, color: '#94a3b8', padding: 18 }}>Loading your usage…</div>}
                        </div>

                        <div style={S.infoBanner}>
                            <span style={{ width: 34, height: 34, borderRadius: 8, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Icon name="sparkles" size={16} stroke="#135bec" strokeWidth={2} />
                            </span>
                            <span style={{ flex: 1, fontSize: 13.5, color: '#1e3a8a' }}>
                                {(!planUsage || planUsage.plan === 'free')
                                    ? <>You&apos;re on the <b style={{ color: '#0f172a', fontWeight: 700 }}>Free Plan</b>. Upgrade for much higher monthly limits.</>
                                    : planUsage.plan === 'max'
                                        ? <>You&apos;re already on <b style={{ color: '#0f172a', fontWeight: 700 }}>Max</b> — the highest tier. Limits reset automatically each month.</>
                                        : <>You&apos;re on the <b style={{ color: '#0f172a', fontWeight: 700 }}>Pro Plan</b>. Manage it under Plan &amp; Billing.</>}
                            </span>
                            {(planUsage?.plan ?? 'free') !== 'max' && (
                                <button style={S.btnOutlineSmall} onClick={() => selectSection('plan')}>
                                    {planUsage && planUsage.plan !== 'free' ? 'Manage plan →' : 'View Plans →'}
                                </button>
                            )}
                        </div>
                    </>
                )
            }

            case 'security': return (
                <>
                    <h1 style={S.h1}>Security</h1>
                    <p style={S.sub}>Account access and authentication.</p>

                    <div style={S.cardEyebrow}>Authentication</div>
                    <div style={{ ...S.cardNoPad, marginBottom: 24 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
                            <span style={{ width: 38, height: 38, borderRadius: 9, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Icon name="lock" size={17} stroke="#135bec" strokeWidth={2} />
                            </span>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Password</div>
                                <div style={{ fontSize: 12.5, color: '#94a3b8' }}>Reset via emailed link</div>
                            </div>
                            <button style={S.btnOutlineSmall} onClick={async () => {
                                if (!user?.email) return
                                await supabase.auth.resetPasswordForEmail(user.email, {
                                    redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
                                })
                                alert('Password reset link sent to your email.')
                            }}>Change password</button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px' }}>
                            <span style={{ width: 38, height: 38, borderRadius: 9, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#ea4335', flexShrink: 0 }}>G</span>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Google</div>
                                <div style={{ fontSize: 12.5, color: '#94a3b8' }}>{settings.email}</div>
                            </div>
                            <span style={S.connectedBadge}><Icon name="check" size={11} stroke="#059669" strokeWidth={3} /> Connected</span>
                        </div>
                    </div>

                    <div style={S.cardEyebrow}>Active sessions</div>
                    <div style={{ ...S.card, display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }} className="set-session-row">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <span style={{ width: 38, height: 38, borderRadius: 9, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', flexShrink: 0 }}>
                                <Icon name="monitor" size={17} stroke="#334155" strokeWidth={2} />
                                <span style={{ position: 'absolute', top: -2, right: -2, width: 9, height: 9, borderRadius: '50%', background: '#10b981', border: '2px solid #fff' }} />
                            </span>
                            <div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>This device</div>
                                <div style={{ fontSize: 12.5, color: '#94a3b8' }}>active now</div>
                            </div>
                        </div>
                        <button style={S.btnOutlineSmall} onClick={signOut}>Sign out</button>
                    </div>
                </>
            )

            case 'danger': return (
                <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <span style={{ width: 30, height: 30, borderRadius: 8, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Icon name="warning" size={16} stroke="#dc2626" strokeWidth={2} />
                        </span>
                        <h1 style={{ ...S.h1, marginBottom: 0 }}>Danger Zone</h1>
                    </div>
                    <p style={S.sub}>Destructive actions. These cannot be undone.</p>

                    <div style={{ ...S.cardNoPad, border: '1px solid #fecaca' }}>
                        <div style={{ padding: '20px 22px', borderBottom: '1px solid #fee2e2' }} className="set-danger-row">
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 14.5, fontWeight: 700, color: '#0f172a', marginBottom: 3 }}>Sign out everywhere</div>
                                <div style={{ fontSize: 12.5, color: '#94a3b8' }}>Sign out on all devices, including this one. You&apos;ll need to log in again.</div>
                            </div>
                            <button style={S.btnDangerOutline} onClick={handleSignOutEverywhere} disabled={signOutAllPending}>
                                {signOutAllPending ? 'Signing out…' : 'Sign out all sessions'}
                            </button>
                        </div>
                        <div style={{ padding: '20px 22px', background: '#fef2f2' }} className="set-danger-row">
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 14.5, fontWeight: 700, color: '#0f172a', marginBottom: 3 }}>Delete account</div>
                                <div style={{ fontSize: 12.5, color: '#94a3b8' }}>Permanently delete your account, resumes, matches, and data.</div>
                            </div>
                            <button style={S.btnDanger} onClick={() => setDeleteModalOpen(true)}>Delete my account</button>
                        </div>
                    </div>
                </>
            )
        }
    }

    return (
        <div style={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', fontFamily: SANS, color: '#0f172a', background: '#f8fafc' }}>

            {/* ── DESKTOP: sidebar + single active section ── */}
            <div className="set-desktop" style={{ flex: 1, minHeight: 0, display: 'flex' }}>
                <aside style={{ width: 272, minWidth: 272, background: '#fff', borderRight: '1px solid #e2e8f0', overflowY: 'auto', padding: '16px 12px 24px' }}>
                    <div style={{ position: 'relative', margin: '4px 4px 14px' }}>
                        <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', display: 'flex' }}>
                            <Icon name="search" size={14} strokeWidth={2.2} />
                        </span>
                        <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search settings"
                            style={{ width: '100%', padding: '8px 12px 8px 32px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f1f5f9', fontSize: 13, fontFamily: 'inherit', color: '#0f172a', outline: 'none' }} />
                    </div>

                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', padding: '12px 12px 6px' }}>Account</div>
                    {filteredNavItems.map(item => {
                        const active = activeSection === item.id
                        return (
                            <button key={item.id} onClick={() => selectSection(item.id)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                                    padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                                    fontSize: 13.5, marginBottom: 2,
                                    background: active ? (item.danger ? '#fef2f2' : '#eff6ff') : 'transparent',
                                    color: active ? (item.danger ? '#dc2626' : '#135bec') : (item.danger ? '#dc2626' : '#334155'),
                                    fontWeight: active ? 700 : 500,
                                }}>
                                <Icon name={item.icon} size={16} />
                                <span style={{ flex: 1 }}>{item.label}</span>
                            </button>
                        )
                    })}
                </aside>

                <main style={{ flex: 1, overflowY: 'auto', padding: '44px 48px 100px' }}>
                    <div style={{ maxWidth: 680, margin: '0 auto' }}>
                        {renderSection(activeSection)}
                    </div>
                </main>
            </div>

            {/* ── MOBILE: list screen + drill-down detail ── */}
            <div className="set-mobile" style={{ flex: 1, minHeight: 0, overflowY: 'auto', position: 'relative' }}>
                <div style={{ padding: '20px 18px 100px' }}>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em', margin: '4px 0 4px', color: '#0f172a' }}>Settings</h1>
                    <p style={{ fontSize: 13.5, color: '#64748b', margin: '0 0 18px' }}>Manage your account, resumes, and plan.</p>

                    <div style={{ position: 'relative', marginBottom: 18 }}>
                        <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', display: 'flex' }}>
                            <Icon name="search" size={14} strokeWidth={2.2} />
                        </span>
                        <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search settings"
                            style={{ width: '100%', padding: '11px 14px 11px 34px', borderRadius: 11, border: '1px solid #e2e8f0', background: '#fff', fontSize: 14, fontFamily: 'inherit', color: '#0f172a', outline: 'none' }} />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, marginBottom: 20 }}>
                        <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#eff6ff', color: '#135bec', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, fontWeight: 700, flexShrink: 0 }}>{initial}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</div>
                            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{settings.email}</div>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#135bec', background: '#eff6ff', padding: '4px 11px', borderRadius: 99, flexShrink: 0 }}>{planLabel}</span>
                    </div>

                    {filteredNavItems.map(item => (
                        <button key={item.id} onClick={() => selectSection(item.id)}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 13, textAlign: 'left', padding: 14, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, marginBottom: 10, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44 }}>
                            <span style={{ width: 36, height: 36, borderRadius: 9, background: item.danger ? '#fef2f2' : '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Icon name={item.icon} size={17} stroke={item.danger ? '#dc2626' : '#135bec'} />
                            </span>
                            <span style={{ flex: 1, fontSize: 14.5, fontWeight: 600, color: item.danger ? '#dc2626' : '#0f172a' }}>{item.label}</span>
                            <Icon name="chevronRight" size={16} stroke="#cbd5e1" strokeWidth={2.2} />
                        </button>
                    ))}
                </div>

                {mobileOpen && (
                    <div style={{ position: 'absolute', inset: 0, background: '#f8fafc', zIndex: 10 }}>
                        <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', background: '#fff', borderBottom: '1px solid #e2e8f0' }}>
                            <button onClick={() => setMobileOpen(false)} style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', border: 'none', borderRadius: 9, cursor: 'pointer', flexShrink: 0 }}>
                                <Icon name="chevronLeft" size={17} stroke="#334155" strokeWidth={2.2} />
                            </button>
                            <span style={{ fontSize: 15.5, fontWeight: 700, color: '#0f172a' }}>{NAV_ITEMS.find(n => n.id === activeSection)?.label}</span>
                        </div>
                        <div style={{ padding: '18px 16px 100px' }}>
                            {renderSection(activeSection)}
                        </div>
                    </div>
                )}
            </div>

            {toastVisible && <div className="set-toast">✓ Changes saved</div>}

            {/* Delete confirmation modal */}
            {deleteModalOpen && (
                <div style={S.modalBackdrop} onClick={(e) => { if (e.target === e.currentTarget) setDeleteModalOpen(false) }}>
                    <div style={S.modal}>
                        <div style={{ padding: '24px 24px 20px' }}>
                            <div style={S.modalIcon}><Icon name="warning" size={18} stroke="#dc2626" strokeWidth={2} /></div>
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
                                Type <b style={{ color: '#dc2626' }}>DELETE</b> to confirm:
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

            <ConfirmModal
                open={confirmDeleteResumeId !== null}
                title="Delete this resume?"
                message="This removes it from your account for good — any matches or tailored versions built from it stay untouched."
                confirmLabel="Delete resume"
                onConfirm={() => confirmDeleteResumeId && performDeleteResume(confirmDeleteResumeId)}
                onCancel={() => setConfirmDeleteResumeId(null)}
            />

            <style>{`
                @keyframes setToastIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
                .set-toast {
                    position: fixed; bottom: 24px; right: 24px; z-index: 60;
                    background: #0f172a; color: #fff; padding: 12px 18px; border-radius: 10px;
                    font-size: 13.5px; font-weight: 600; box-shadow: 0 8px 24px rgba(15,23,42,.25);
                    animation: setToastIn .2s ease both; font-family: ${SANS};
                }
                .set-mobile { display: none; }
                @media (max-width: 900px) {
                    .set-desktop { display: none !important; }
                    .set-mobile { display: block !important; }
                    .set-toast { right: auto; left: 50%; transform: translateX(-50%); bottom: 24px; }
                    .set-grid2 { grid-template-columns: 1fr !important; }
                    .set-usage-grid { grid-template-columns: 1fr !important; }
                    .set-level-grid { grid-template-columns: repeat(2, 1fr) !important; }
                    .set-remote-grid { grid-template-columns: 1fr !important; }
                    .set-challenge-grid { grid-template-columns: 1fr !important; }
                    .set-danger-row { display: flex !important; flex-direction: column !important; align-items: flex-start !important; gap: 12px !important; }
                    .set-danger-row button { width: 100% !important; }
                    .set-resume-row { flex-wrap: wrap !important; }
                    .set-session-row { flex-direction: column !important; align-items: flex-start !important; gap: 14px !important; }
                    .set-session-row button { width: 100% !important; }
                }
                input::placeholder { color: #94a3b8; opacity: 1; }
            `}</style>
        </div>
    )
}

// ── Sub-components ── //

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <div style={S.fieldLabel}>{label}</div>
            {children}
        </div>
    )
}

function FooterButtons({ disabled, onCancel, onSave }: { disabled: boolean; onCancel: () => void; onSave: () => void }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button style={S.btnGhost} onClick={onCancel}>Cancel</button>
            <button style={{ ...S.btnPrimary, background: disabled ? '#cbd5e1' : '#135bec', cursor: disabled ? 'not-allowed' : 'pointer' }} disabled={disabled} onClick={onSave}>Save changes</button>
        </div>
    )
}

function ToggleSwitch({ on, onClick }: { on: boolean; onClick: () => void }) {
    return (
        <button onClick={onClick} style={{ position: 'relative', width: 38, height: 22, background: on ? '#135bec' : '#e2e8f0', borderRadius: 99, cursor: 'pointer', border: 'none', padding: 0, flexShrink: 0, transition: 'background 0.15s' }}>
            <span style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 18, height: 18, background: '#fff', borderRadius: '50%', transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(15,23,42,0.2)' }} />
        </button>
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
                borderRadius: 9, minHeight: 44, alignItems: 'center',
                boxShadow: focused ? '0 0 0 3px #dbeafe' : 'none',
                transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
                onMouseDown={e => {
                    if (e.target === actualInputRef.current) return
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
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => onChange(values.filter(x => x !== v))}
                            style={S.chipRemove}
                        ><Icon name="x" size={10} strokeWidth={3} /></button>
                    </span>
                ))}
                <input ref={actualInputRef} style={S.chipInput} type="text"
                    value={input}
                    placeholder={values.length === 0 ? placeholder : ''}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    onChange={e => { setInput(e.target.value); setHighlight(0) }}
                    onKeyDown={e => {
                        if (e.key === 'Enter') {
                            e.preventDefault()
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

function SuggestRow({ suggestions, existing, onAdd }: {
    suggestions: string[]; existing: string[]; onAdd: (v: string) => void
}) {
    const remaining = suggestions.filter(s => !existing.some(e => e.toLowerCase() === s.toLowerCase()))
    if (remaining.length === 0) return null
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {remaining.map(s => (
                <button key={s} onClick={() => onAdd(s)} style={S.suggestChip}>+ {s}</button>
            ))}
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

// ── Styles ── //
const S: Record<string, React.CSSProperties> = {
    h1: { fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 6px', color: '#0f172a' },
    sub: { fontSize: 14.5, color: '#64748b', margin: '0 0 24px' },
    card: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 22px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 0 },
    cardNoPad: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', marginBottom: 16 },
    cardEyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 12 },
    fieldLabel: { fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 },
    grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 20px', marginTop: 20, paddingTop: 20, borderTop: '1px solid #f1f5f9' },
    avatarRow: { display: 'flex', alignItems: 'center', gap: 16 },
    avatarCircle: { width: 56, height: 56, borderRadius: '50%', background: '#eff6ff', color: '#135bec', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, flexShrink: 0 },
    input: {
        width: '100%', padding: '10px 13px', borderRadius: 9, border: '1px solid #e2e8f0',
        background: '#f8fafc', fontSize: 13.5, fontFamily: 'inherit', outline: 'none', color: '#0f172a',
    },
    readonlyBox: {
        padding: '10px 13px', borderRadius: 9, border: '1px solid #e2e8f0', background: '#f1f5f9',
        fontSize: 13.5, color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 40,
    },
    btnPrimary: {
        padding: '10px 20px', color: '#fff', border: 'none', borderRadius: 9,
        fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit',
    },
    btnPrimaryLink: {
        display: 'inline-flex', alignItems: 'center', padding: '9px 18px', background: '#135bec', color: '#fff',
        border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap',
    },
    btnGhost: {
        padding: '10px 20px', background: '#fff', border: '1px solid #e2e8f0', color: '#334155',
        borderRadius: 9, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    },
    btnOutlineSmall: {
        padding: '8px 14px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
        fontSize: 12.5, fontWeight: 600, color: '#135bec', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
    },
    btnDanger: {
        padding: '9px 18px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8,
        fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
    },
    btnDangerOutline: {
        padding: '9px 18px', background: '#fff', color: '#dc2626', border: '1.5px solid #fecaca', borderRadius: 8,
        fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
    },
    pillToggle: {
        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
        padding: '6px 14px', borderRadius: 99, border: '1px solid #bfdbfe', cursor: 'pointer',
    },
    pill: { fontSize: 12, fontWeight: 600, color: '#64748b', background: '#f1f5f9', padding: '7px 14px', borderRadius: 99, whiteSpace: 'nowrap' },
    chip: {
        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: '#135bec',
        background: '#eff6ff', border: '1px solid #bfdbfe', padding: '5px 6px 5px 12px', borderRadius: 99,
    },
    chipRemove: {
        width: 18, height: 18, borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        color: '#135bec', cursor: 'pointer', background: 'transparent', border: 'none', padding: 2,
    },
    chipInput: {
        flex: 1, minWidth: 140, border: 'none', outline: 'none', background: 'transparent',
        fontSize: 13.5, color: '#0f172a', padding: '6px 2px', fontFamily: 'inherit',
    },
    suggestChip: {
        fontSize: 12, fontWeight: 600, color: '#64748b', background: '#f8fafc', border: '1px dashed #cbd5e1',
        padding: '5px 12px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
    },
    dropdown: {
        position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, background: '#fff',
        border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 12px 28px rgba(15,23,42,0.12)',
        zIndex: 20, maxHeight: 320, overflowY: 'auto', padding: 6,
    },
    dropdownItem: {
        display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 6,
        fontSize: 13.5, fontFamily: 'inherit', color: '#1e293b', border: 'none', cursor: 'pointer',
    },
    levelGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 },
    levelTile: {
        display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start', padding: '12px',
        borderRadius: 9, border: '1.5px solid #e2e8f0', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
        transition: 'background 0.15s, border-color 0.15s, color 0.15s',
    },
    remoteGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 },
    remoteTile: {
        display: 'flex', alignItems: 'center', gap: 9, padding: '12px 14px', borderRadius: 9,
        border: '1.5px solid #e2e8f0', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, textAlign: 'left',
    },
    primaryBadge: {
        display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: '#135bec',
        background: '#eff6ff', padding: '5px 12px', borderRadius: 99, flexShrink: 0,
    },
    setPrimaryBtn: {
        fontSize: 12.5, fontWeight: 600, color: '#135bec', background: 'none', border: 'none', cursor: 'pointer',
        flexShrink: 0, fontFamily: 'inherit', padding: '6px 4px',
    },
    iconBtn: {
        width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none',
        border: 'none', borderRadius: 7, cursor: 'pointer', color: '#64748b', fontFamily: 'inherit',
    },
    toggleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, padding: '16px 0' },
    select: {
        padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff',
        fontSize: 13.5, fontFamily: 'inherit', color: '#0f172a', cursor: 'pointer', outline: 'none',
    },
    usageGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 20 },
    infoBanner: {
        display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', background: '#eff6ff',
        border: '1px solid #bfdbfe', borderRadius: 12,
    },
    connectedBadge: {
        display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#059669',
        background: '#ecfdf5', padding: '5px 12px', borderRadius: 99,
    },
    modalBackdrop: {
        position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70, padding: 24,
    },
    modal: {
        background: '#fff', borderRadius: 16, maxWidth: 480, width: '100%',
        boxShadow: '0 20px 50px rgba(15,23,42,0.25)', overflow: 'hidden', fontFamily: SANS,
    },
    modalIcon: {
        width: 40, height: 40, borderRadius: 10, background: '#fef2f2', color: '#dc2626',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14,
    },
    modalList: {
        listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16,
        background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px',
    },
    modalListItem: { fontSize: 12, color: '#475569', display: 'flex', alignItems: 'center', gap: 8 },
}
