'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { searchJobs, fetchJobsSince, fetchJobsByIds, triggerJobIngestion, triggerScoring, getPrimaryResumeId, RateLimitError } from '@/lib/api'
import type { QueueJobState } from '@/lib/hooks/useQueueJob'
import { QueueStatusBanner } from '@/components/queue/QueueStatusBanner'
import type { Job } from '@/lib/types'
import { useAuth } from '@/components/providers/AuthProvider'
import { createClient as createBrowserSupabase } from '@/lib/supabase/client'
import LegitimacyBadge from '@/components/LegitimacyBadge'
import { PasteJobButton } from '@/components/search/PasteJobModal'
import { DatePostedFilter, filterByDateRange, rangeShortLabel, type DateRange } from '@/components/search/DatePostedFilter'
import {
    Search, MapPin, ChevronDown, Sparkles, Globe,
    CheckCircle2, X, AlertCircle, Clock, Briefcase,
    ExternalLink, Building2, Tag,
} from 'lucide-react'

// ── Static Data ───────────────────────────────────────────────

const LEVEL_OPTIONS = [
    { value: '',            label: 'All Levels',  years: ''         },
    { value: 'internship',  label: 'Internship',  years: '0 yrs'    },
    { value: 'entry_level', label: 'Entry Level', years: '0–2 yrs'  },
    { value: 'mid',         label: 'Mid-Level',   years: '3–6 yrs'  },
    { value: 'senior',      label: 'Senior',      years: '7–11 yrs' },
    { value: 'director',    label: 'Director',    years: '12–14 yrs'},
    { value: 'executive',   label: 'Executive',   years: '15+ yrs'  },
]

const IT_ROLES = [
    // Software Development
    'Software Engineer', 'Software Developer', 'Full Stack Developer', 'Frontend Developer',
    'Backend Developer', 'React Developer', 'Angular Developer', 'Vue.js Developer',
    'Node.js Developer', 'Python Developer', 'Java Developer', '.NET Developer',
    'C++ Developer', 'PHP Developer', 'Ruby Developer', 'Go Developer', 'Rust Developer',
    'Kotlin Developer', 'Swift Developer', 'iOS Developer', 'Android Developer',
    'Mobile Developer', 'React Native Developer', 'Flutter Developer',
    'Junior Software Developer', 'Senior Software Engineer', 'Associate Software Engineer',
    // Web & UI
    'UI Developer', 'UI/UX Designer', 'UX Researcher', 'Web Developer', 'WordPress Developer',
    'Shopify Developer', 'Web Designer', 'Frontend Engineer',
    // Data & Analytics
    'Data Scientist', 'Data Analyst', 'Data Engineer', 'Business Analyst',
    'Business Intelligence Analyst', 'Power BI Developer', 'Tableau Developer',
    'SQL Developer', 'Database Administrator', 'DBA', 'ETL Developer',
    // AI & ML
    'Machine Learning Engineer', 'AI Engineer', 'NLP Engineer', 'Computer Vision Engineer',
    'MLOps Engineer', 'Deep Learning Engineer', 'AI Researcher', 'Prompt Engineer',
    'Generative AI Engineer', 'LLM Engineer',
    // Cloud & DevOps
    'DevOps Engineer', 'Cloud Engineer', 'AWS Engineer', 'Azure Engineer',
    'GCP Engineer', 'Site Reliability Engineer', 'SRE', 'Infrastructure Engineer',
    'Platform Engineer', 'Kubernetes Engineer', 'Docker Engineer', 'CI/CD Engineer',
    'Cloud Architect', 'Solution Architect', 'Enterprise Architect', 'Technical Architect',
    // Security
    'SOC Analyst', 'Cybersecurity Analyst', 'Information Security Analyst',
    'Penetration Tester', 'Ethical Hacker', 'Security Engineer', 'Vulnerability Analyst',
    'Incident Response Analyst', 'Cloud Security Engineer', 'VAPT Engineer',
    'Network Security Engineer', 'Security Operations Engineer',
    // QA & Testing
    'QA Engineer', 'Software Tester', 'Test Engineer', 'Test Automation Engineer',
    'SDET', 'Quality Analyst', 'Manual Tester', 'Performance Test Engineer',
    'Selenium Tester', 'Cypress Engineer',
    // Networking & Systems
    'Network Engineer', 'System Administrator', 'Linux Administrator',
    'Windows Administrator', 'IT Administrator', 'Technical Support Engineer',
    'IT Support Engineer', 'Help Desk Engineer', 'NOC Engineer',
    // Product & Management
    'Product Manager', 'Project Manager', 'Scrum Master', 'Agile Coach',
    'Technical Program Manager', 'IT Project Manager', 'Delivery Manager',
    'Engineering Manager',
    // Specialized
    'Salesforce Developer', 'SAP Consultant', 'SAP ABAP Developer', 'ServiceNow Developer',
    'Blockchain Developer', 'Web3 Developer', 'Smart Contract Developer',
    'Embedded Systems Engineer', 'Firmware Engineer', 'VLSI Engineer',
    'Hardware Engineer', 'IoT Engineer', 'Robotics Engineer',
    'Technical Writer', 'Scrum Master', 'RPA Developer', 'UiPath Developer',
    'Automation Engineer', 'Integration Engineer', 'API Developer',
]

const INDIA_LOCATIONS = [
    'Remote', 'Work From Home', 'Pan India',
    'Bengaluru', 'Bangalore', 'Mumbai', 'Delhi', 'New Delhi', 'Hyderabad',
    'Chennai', 'Pune', 'Kolkata', 'Ahmedabad', 'Noida', 'Gurugram', 'Gurgaon',
    'Jaipur', 'Chandigarh', 'Coimbatore', 'Nagpur', 'Indore', 'Bhopal',
    'Lucknow', 'Kochi', 'Thiruvananthapuram', 'Visakhapatnam', 'Vizag',
    'Vadodara', 'Surat', 'Mysuru', 'Mysore', 'Nashik', 'Patna', 'Bhubaneswar',
    'Dehradun', 'Mohali', 'Navi Mumbai', 'Thane', 'Goa', 'Mangalore',
    'Hubli', 'Trichy', 'Madurai', 'Salem', 'Vellore', 'Warangal',
    'Rajkot', 'Jodhpur', 'Udaipur', 'Agra', 'Varanasi', 'Aurangabad',
    'Ranchi', 'Raipur', 'Guwahati', 'Shimla', 'Jammu',
]

// ── Reusable Autocomplete Input ───────────────────────────────

function AutocompleteInput({
    value, onChange, placeholder, suggestions, icon,
    borderStyle,
}: {
    value: string
    onChange: (v: string) => void
    placeholder: string
    suggestions: string[]
    icon: React.ReactNode
    borderStyle?: React.CSSProperties
}) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    const filtered = value.trim().length === 0
        ? suggestions.slice(0, 8)
        : suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase())).slice(0, 10)

    useEffect(() => {
        function handleOutside(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', handleOutside)
        return () => document.removeEventListener('mousedown', handleOutside)
    }, [])

    return (
        <div ref={ref} style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: 1, ...borderStyle }}>
            <div style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '8px 14px' }}>
                {icon}
                <input
                    type="text"
                    placeholder={placeholder}
                    value={value}
                    onChange={e => { onChange(e.target.value); setOpen(true) }}
                    onFocus={() => setOpen(true)}
                    style={{
                        flex: 1, border: 'none', outline: 'none',
                        fontSize: '0.8125rem', color: '#1E293B',
                        background: 'transparent', fontFamily: 'inherit',
                    }}
                    autoComplete="off"
                />
                {value && (
                    <button
                        type="button"
                        onClick={() => { onChange(''); setOpen(false) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#CBD5E1', flexShrink: 0, lineHeight: 1 }}
                    >
                        <X size={12} />
                    </button>
                )}
            </div>

            {open && filtered.length > 0 && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 8px)', left: 0,
                    minWidth: 240, maxHeight: 280,
                    background: '#fff', border: '1px solid #E2E8F0',
                    borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    zIndex: 200, overflowY: 'auto',
                }}>
                    {filtered.map(s => (
                        <button
                            key={s}
                            type="button"
                            onMouseDown={e => { e.preventDefault(); onChange(s); setOpen(false) }}
                            style={{
                                display: 'block', width: '100%', textAlign: 'left',
                                padding: '8px 14px', border: 'none', cursor: 'pointer',
                                fontSize: '0.8125rem', fontFamily: 'inherit',
                                background: value === s ? '#EFF6FF' : 'transparent',
                                color: value === s ? '#2563EB' : '#374151',
                                fontWeight: value === s ? 600 : 400,
                            }}
                            onMouseEnter={e => { if (value !== s) (e.currentTarget as HTMLButtonElement).style.background = '#F8FAFC' }}
                            onMouseLeave={e => { if (value !== s) (e.currentTarget as HTMLButtonElement).style.background = value === s ? '#EFF6FF' : 'transparent' }}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

// ── Level Dropdown ────────────────────────────────────────────

function LevelDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)
    const selected = LEVEL_OPTIONS.find(o => o.value === value) ?? LEVEL_OPTIONS[0]

    useEffect(() => {
        function handleOutside(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', handleOutside)
        return () => document.removeEventListener('mousedown', handleOutside)
    }, [])

    return (
        <div ref={ref} style={{ position: 'relative', padding: '8px 14px', borderRight: '1px solid #E2E8F0' }}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    border: 'none', background: 'transparent', cursor: 'pointer',
                    fontSize: '0.8125rem', color: '#1E293B', fontFamily: 'inherit',
                    padding: 0, whiteSpace: 'nowrap',
                }}
            >
                {selected.label}
                {selected.years && (
                    <span style={{
                        fontSize: '0.6875rem', fontWeight: 500,
                        color: '#94A3B8',
                        fontVariantNumeric: 'tabular-nums',
                        letterSpacing: '0.01em',
                    }}>
                        · {selected.years}
                    </span>
                )}
                <ChevronDown size={13} style={{ color: '#94A3B8', transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none', marginLeft: 2 }} />
            </button>

            {open && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 8px)', left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#fff', border: '1px solid #E2E8F0',
                    borderRadius: 12, boxShadow: '0 12px 32px rgba(15,23,42,0.12), 0 2px 6px rgba(15,23,42,0.06)',
                    zIndex: 200, overflow: 'hidden', minWidth: 220,
                    padding: 4,
                }}>
                    {LEVEL_OPTIONS.map(opt => {
                        const isActive = value === opt.value
                        return (
                            <button
                                key={opt.value}
                                type="button"
                                onMouseDown={e => { e.preventDefault(); onChange(opt.value); setOpen(false) }}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    gap: 18, width: '100%', textAlign: 'left',
                                    padding: '9px 12px', borderRadius: 8,
                                    border: 'none', cursor: 'pointer',
                                    fontSize: '0.8125rem', fontFamily: 'inherit',
                                    background: isActive ? '#EFF6FF' : 'transparent',
                                    color: isActive ? '#1D4ED8' : '#1E293B',
                                    fontWeight: isActive ? 600 : 500,
                                    transition: 'background 0.12s',
                                }}
                                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = '#F8FAFC' }}
                                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                            >
                                <span>{opt.label}</span>
                                {opt.years && (
                                    <span style={{
                                        fontSize: '0.6875rem', fontWeight: 600,
                                        padding: '2px 8px', borderRadius: 9999,
                                        color: isActive ? '#1D4ED8' : '#64748B',
                                        background: isActive ? '#DBEAFE' : '#F1F5F9',
                                        fontVariantNumeric: 'tabular-nums',
                                        letterSpacing: '0.01em',
                                        whiteSpace: 'nowrap',
                                    }}>
                                        {opt.years}
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

// ── Helpers ───────────────────────────────────────────────────

// Remember the last ingestion's job IDs per (query+location+level) signature so
// a follow-up "Search DB" click with the same filters re-surfaces every job the
// ingestion produced — even ones whose title/level/location don't strictly
// match. Without this, n8n surfaces a job titled "Software Engineer" for a
// "Full Stack Developer" search and a strict ILIKE filter loses it.
const INGEST_CACHE_PREFIX = 'lastIngest:'
const INGEST_CACHE_TTL_MS = 4 * 60 * 60 * 1000  // 4 hours — keeps ingested job sets across browser refreshes

function filterSig(query: string, location: string, level: string): string {
    const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'na'
    return `${INGEST_CACHE_PREFIX}${norm(query)}:${norm(location)}:${norm(level)}`
}

function rememberIngestion(query: string, location: string, level: string, jobIds: string[]) {
    if (typeof window === 'undefined' || jobIds.length === 0) return
    try {
        localStorage.setItem(filterSig(query, location, level), JSON.stringify({
            jobIds,
            ingestedAt: Date.now(),
        }))
    } catch { /* quota — ignore */ }
}

function recallIngestion(query: string, location: string, level: string): string[] {
    if (typeof window === 'undefined') return []
    try {
        const raw = localStorage.getItem(filterSig(query, location, level))
        if (!raw) return []
        const { jobIds, ingestedAt } = JSON.parse(raw) as { jobIds: string[]; ingestedAt: number }
        if (Date.now() - ingestedAt > INGEST_CACHE_TTL_MS) return []
        return Array.isArray(jobIds) ? jobIds : []
    } catch { return [] }
}

const LEVEL_LABELS: Record<string, string> = {
    internship:  'Internship',
    entry_level: 'Entry Level',
    associate:   'Associate',
    mid:         'Mid-Level',
    mid_level:   'Mid-Level',
    mid_senior:  'Mid-Senior',
    senior:      'Senior',
    director:    'Director',
    executive:   'Executive',
}

const LEVEL_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    internship:  { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0' },
    entry_level: { bg: '#DBEAFE', text: '#2563EB', border: '#93C5FD' },
    associate:   { bg: '#DBEAFE', text: '#2563EB', border: '#93C5FD' },
    mid:         { bg: '#fffbeb', text: '#92400e', border: '#fde68a' },
    mid_level:   { bg: '#fffbeb', text: '#92400e', border: '#fde68a' },
    mid_senior:  { bg: '#fffbeb', text: '#92400e', border: '#fde68a' },
    senior:      { bg: '#fdf4ff', text: '#7e22ce', border: '#e9d5ff' },
    director:    { bg: '#fff1f2', text: '#be123c', border: '#fecdd3' },
    executive:   { bg: '#fff1f2', text: '#be123c', border: '#fecdd3' },
}

const SOURCE_COLORS: Record<string, string> = {
    serpapi:    '#3B82F6',
    jobspy:     '#7C3AED',
    theirstack: '#0891B2',
    linkedin:   '#0A66C2',
    indeed:     '#003A9B',
}

function getCompanyColor(company: string | null, source: string): string {
    const src = source?.toLowerCase()
    if (SOURCE_COLORS[src]) return SOURCE_COLORS[src]
    const colors = ['#3B82F6','#7C3AED','#10B981','#F59E0B','#EF4444','#0891B2','#EC4899','#64748B']
    const idx = (company ?? 'U').charCodeAt(0) % colors.length
    return colors[idx]
}

function formatDate(dateStr: string | null): string {
    if (!dateStr) return 'Recently posted'
    try {
        const d = new Date(dateStr)
        if (isNaN(d.getTime())) return dateStr
        const now = new Date()
        const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
        if (diff === 0) return 'Today'
        if (diff === 1) return 'Yesterday'
        if (diff < 7) return `${diff}d ago`
        if (diff < 30) return `${Math.floor(diff / 7)}w ago`
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    } catch {
        return dateStr
    }
}

function parseSkills(raw: string[] | null): string[] {
    if (!raw) return []
    if (Array.isArray(raw)) return raw.filter(Boolean)
    try {
        const parsed = JSON.parse(raw as unknown as string)
        if (Array.isArray(parsed)) return parsed
        if (parsed && typeof parsed === 'object') return Object.values(parsed).flat() as string[]
    } catch { /* not JSON */ }
    return []
}

// ── Company Avatar ────────────────────────────────────────────

function CompanyAvatar({ company, source, size = 36 }: { company: string | null; source: string; size?: number }) {
    const bg = getCompanyColor(company, source)
    const initial = (company ?? 'U')[0].toUpperCase()
    return (
        <div style={{
            width: size, height: size, borderRadius: size > 30 ? 10 : '50%',
            background: bg, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: size > 30 ? '0.9rem' : '0.7rem', fontWeight: 700, flexShrink: 0,
        }}>
            {initial}
        </div>
    )
}

// ── Level Badge ───────────────────────────────────────────────

function LevelBadge({ level }: { level: string | null }) {
    if (!level) return null
    const key = level.toLowerCase()
    const label = LEVEL_LABELS[key] ?? level
    const c = LEVEL_COLORS[key] ?? { bg: '#F1F5F9', text: '#475569', border: '#CBD5E1' }
    return (
        <span style={{
            fontSize: '0.6875rem', fontWeight: 600, padding: '2px 8px',
            borderRadius: 9999, background: c.bg, color: c.text,
            border: `1px solid ${c.border}`,
            whiteSpace: 'nowrap', letterSpacing: '0.01em',
        }}>
            {label}
        </span>
    )
}

// ── Left Panel: Job Card ──────────────────────────────────────

function JobCard({ job, selected, onClick }: { job: Job; selected: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            style={{
                width: '100%', textAlign: 'left',
                padding: '10px 14px',
                background: selected ? '#EFF6FF' : '#fff',
                border: 'none',
                borderLeft: `3px solid ${selected ? '#2563EB' : 'transparent'}`,
                borderBottom: '1px solid #F1F5F9',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'flex', flexDirection: 'column', gap: 5,
            }}
            onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLButtonElement).style.background = '#F8FAFC' }}
            onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLButtonElement).style.background = '#fff' }}
        >
            {/* Company row + date */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <CompanyAvatar company={job.company} source={job.source} size={28} />
                    <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 500 }}>
                        {job.company ?? 'Unknown'}
                    </span>
                </div>
                <span style={{ fontSize: '0.6875rem', color: '#94A3B8' }}>{formatDate(job.posted_date)}</span>
            </div>

            {/* Title */}
            <h3 style={{
                fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.35,
                color: selected ? '#2563EB' : '#1E293B',
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
                {job.title}
            </h3>

            {/* Location + badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {job.location && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#64748B', fontSize: '0.6875rem' }}>
                        <MapPin size={11} />
                        <span>{job.location.length > 28 ? job.location.slice(0, 28) + '…' : job.location}</span>
                    </div>
                )}
                {job.location && job.experience_level && <span style={{ color: '#CBD5E1', fontSize: '0.75rem' }}>·</span>}
                <LevelBadge level={job.experience_level} />
                {(job.legitimacy_tier === 'verified' || job.legitimacy_tier === 'proceed_with_caution') && (
                    <LegitimacyBadge
                        tier={job.legitimacy_tier}
                        signals={job.legitimacy_signals}
                        size="sm"
                    />
                )}
            </div>

            {/* Suspicious banner — stops the fresher from clicking a ghost */}
            {job.legitimacy_tier === 'suspicious' && (
                <LegitimacyBadge
                    tier={job.legitimacy_tier}
                    signals={job.legitimacy_signals}
                    variant="strip"
                />
            )}

            {/* Salary if available */}
            {job.salary && (
                <span style={{ fontSize: '0.6875rem', color: '#059669', fontWeight: 500 }}>
                    💰 {job.salary.length > 24 ? job.salary.slice(0, 24) + '…' : job.salary}
                </span>
            )}
        </button>
    )
}

// ── Right Panel: Job Detail ───────────────────────────────────

type SingleScoreState =
    | { state: 'loading'; jobId: string; queueJobId?: string }
    | { state: 'success'; jobId: string; score: number; recommendation?: string }
    | { state: 'error'; jobId: string; message: string }

function ScoreThisJobButton({
    jobId,
    scoreState,
    onScore,
    hasResume,
}: {
    jobId: string
    scoreState: SingleScoreState | undefined
    onScore: (jobId: string) => void
    hasResume: boolean
}) {
    const state = scoreState?.state

    // Loading
    if (state === 'loading') {
        return (
            <button
                disabled
                style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '8px 16px', borderRadius: 8,
                    background: '#F8FAFC', color: '#64748B',
                    border: '1px solid #E2E8F0',
                    fontSize: '0.8125rem', fontWeight: 600,
                    whiteSpace: 'nowrap', cursor: 'not-allowed',
                    fontFamily: 'inherit',
                }}
            >
                <span style={{
                    display: 'inline-block', width: 12, height: 12,
                    border: '2px solid #CBD5E1', borderTopColor: '#2563EB',
                    borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                }} />
                Scoring…
            </button>
        )
    }

    // Success
    if (state === 'success' && scoreState?.state === 'success') {
        const score = scoreState.score
        const tone =
            score >= 80 ? { from: '#10B981', to: '#059669', shadow: 'rgba(5,150,105,0.28)' } :
            score >= 60 ? { from: '#3B82F6', to: '#2563EB', shadow: 'rgba(37,99,235,0.28)' } :
            score >= 40 ? { from: '#F59E0B', to: '#D97706', shadow: 'rgba(217,119,6,0.28)' } :
                          { from: '#EF4444', to: '#DC2626', shadow: 'rgba(220,38,38,0.28)' }
        return (
            <button
                onClick={() => onScore(jobId)}
                title={scoreState.recommendation ? `Recommendation: ${scoreState.recommendation.replace(/_/g, ' ')}` : undefined}
                style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '8px 16px', borderRadius: 8,
                    background: `linear-gradient(135deg, ${tone.from}, ${tone.to})`,
                    color: '#fff',
                    border: 'none',
                    fontSize: '0.8125rem', fontWeight: 700,
                    whiteSpace: 'nowrap', cursor: 'pointer',
                    boxShadow: `0 2px 10px ${tone.shadow}`,
                    transition: 'opacity 0.15s',
                    fontFamily: 'inherit',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.opacity = '0.88'}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.opacity = '1'}
            >
                <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    minWidth: 22, height: 22, borderRadius: 999,
                    background: 'rgba(255,255,255,0.22)',
                    fontSize: '0.75rem', fontWeight: 800,
                    padding: '0 6px',
                }}>
                    {score}
                </span>
                View match
                <ExternalLink size={12} style={{ opacity: 0.85 }} />
            </button>
        )
    }

    // Error
    if (state === 'error' && scoreState?.state === 'error') {
        return (
            <button
                onClick={() => onScore(jobId)}
                title={scoreState.message}
                style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '8px 16px', borderRadius: 8,
                    background: '#fff', color: '#B91C1C',
                    border: '1px solid #FECACA',
                    fontSize: '0.8125rem', fontWeight: 600,
                    whiteSpace: 'nowrap', cursor: 'pointer',
                    fontFamily: 'inherit',
                    transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#FEF2F2'}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = '#fff'}
            >
                <AlertCircle size={13} />
                Retry score
            </button>
        )
    }

    // Idle
    return (
        <button
            onClick={() => hasResume && onScore(jobId)}
            disabled={!hasResume}
            title={hasResume ? 'Score this job against your resume' : 'Upload a resume to score jobs'}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 8,
                background: '#fff',
                color: hasResume ? '#2563EB' : '#94A3B8',
                border: `1px solid ${hasResume ? '#BFDBFE' : '#E2E8F0'}`,
                fontSize: '0.8125rem', fontWeight: 600,
                whiteSpace: 'nowrap', cursor: hasResume ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
                transition: 'background 0.15s, border-color 0.15s, transform 0.1s',
            }}
            onMouseEnter={e => {
                if (!hasResume) return
                const el = e.currentTarget as HTMLButtonElement
                el.style.background = '#EFF6FF'
                el.style.borderColor = '#93C5FD'
            }}
            onMouseLeave={e => {
                if (!hasResume) return
                const el = e.currentTarget as HTMLButtonElement
                el.style.background = '#fff'
                el.style.borderColor = '#BFDBFE'
            }}
        >
            <Sparkles size={13} />
            Score this job
        </button>
    )
}

function JobDetailPanel({
    job,
    scoreState,
    onScore,
    hasResume,
}: {
    job: Job
    scoreState: SingleScoreState | undefined
    onScore: (jobId: string) => void
    hasResume: boolean
}) {
    const descLines = (job.description ?? '').split('\n').filter(Boolean)
    const skills = parseSkills(job.required_skills)

    return (
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}
            className="animate-fade-in-up">

            {/* Header */}
            <div>
                {/* Company + source row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <CompanyAvatar company={job.company} source={job.source} size={40} />
                    <span style={{ fontSize: '0.8125rem', color: '#64748B', fontWeight: 500 }}>
                        {job.company ?? 'Unknown Company'}
                    </span>
                    <span style={{ color: '#CBD5E1' }}>·</span>
                    <span style={{
                        fontSize: '0.6875rem', padding: '2px 8px', borderRadius: 4,
                        background: '#F8FAFC', color: '#94A3B8', border: '1px solid #E2E8F0',
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                        {job.source}
                    </span>
                    {/* Score + Apply buttons — top right */}
                    <div style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <ScoreThisJobButton
                            jobId={job.id}
                            scoreState={scoreState}
                            onScore={onScore}
                            hasResume={hasResume}
                        />
                        {job.source_url && (
                            <Link
                                href={job.source_url}
                                target="_blank"
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    padding: '8px 18px', borderRadius: 8,
                                    background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
                                    color: '#fff', fontSize: '0.8125rem', fontWeight: 600,
                                    textDecoration: 'none', whiteSpace: 'nowrap',
                                    boxShadow: '0 2px 10px rgba(37,99,235,0.25)',
                                    transition: 'opacity 0.15s',
                                }}
                                onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.opacity = '0.88'}
                                onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.opacity = '1'}
                            >
                                Apply Now <ExternalLink size={13} />
                            </Link>
                        )}
                    </div>
                </div>

                {/* Title */}
                <h1 style={{
                    fontSize: '1.15rem', fontWeight: 700, color: '#1E293B',
                    lineHeight: 1.3, letterSpacing: '-0.01em', marginBottom: 10,
                }}>
                    {job.title}
                </h1>

                {/* Meta chips */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    {job.location && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '4px 12px', borderRadius: 9999,
                            background: '#DBEAFE', border: '1px solid #93C5FD',
                            fontSize: '0.75rem', color: '#2563EB', fontWeight: 500,
                        }}>
                            <MapPin size={12} />
                            {job.location}
                        </div>
                    )}
                    {job.schedule_type && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '4px 12px', borderRadius: 9999,
                            background: '#F1F5F9', border: '1px solid #E2E8F0',
                            fontSize: '0.75rem', color: '#64748B', fontWeight: 500,
                        }}>
                            <Clock size={12} />
                            {job.schedule_type}
                        </div>
                    )}
                    {job.salary && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '4px 12px', borderRadius: 9999,
                            background: '#f0fdf4', border: '1px solid #bbf7d0',
                            fontSize: '0.75rem', color: '#166534', fontWeight: 500,
                        }}>
                            💰 {job.salary}
                        </div>
                    )}
                    <LevelBadge level={job.experience_level} />
                    <span style={{ fontSize: '0.6875rem', color: '#94A3B8', marginLeft: 2 }}>
                        Posted: {formatDate(job.posted_date)}
                    </span>
                </div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: '#E2E8F0' }} />

            {/* Required Skills */}
            {skills.length > 0 && (
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                        <Tag size={13} style={{ color: '#64748B' }} />
                        <h4 style={{
                            fontSize: '0.6875rem', fontWeight: 700, color: '#94A3B8',
                            textTransform: 'uppercase', letterSpacing: '0.08em',
                        }}>
                            Required Skills
                        </h4>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {skills.map((s, i) => (
                            <span key={i} style={{
                                fontSize: '0.75rem', padding: '4px 10px', borderRadius: 6,
                                background: '#EFF6FF', color: '#2563EB',
                                fontWeight: 500, border: '1px solid #BFDBFE',
                            }}>
                                {s}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Job Description */}
            <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                    <Briefcase size={13} style={{ color: '#64748B' }} />
                    <h4 style={{
                        fontSize: '0.6875rem', fontWeight: 700, color: '#94A3B8',
                        textTransform: 'uppercase', letterSpacing: '0.08em',
                    }}>
                        Job Description
                    </h4>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {descLines.length > 0 ? descLines.map((line, i) => {
                        const clean = line.replace(/\*\*/g, '').replace(/#{1,6}\s/g, '').trim()
                        if (!clean) return null
                        const isBullet = /^[•\-\*]\s/.test(clean)
                        const isHeading = line.startsWith('#') || (line.startsWith('**') && line.endsWith('**') && line.length < 80)

                        if (isHeading) return (
                            <p key={i} style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#1E293B', marginTop: 10 }}>
                                {clean.replace(/\*\*/g, '')}
                            </p>
                        )
                        if (isBullet) return (
                            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                <span style={{ color: '#2563EB', fontWeight: 700, marginTop: 2, flexShrink: 0 }}>•</span>
                                <p style={{ fontSize: '0.875rem', lineHeight: 1.7, color: '#374151' }}>
                                    {clean.replace(/^[•\-\*]\s*/, '')}
                                </p>
                            </div>
                        )
                        return (
                            <p key={i} style={{ fontSize: '0.875rem', lineHeight: 1.7, color: '#374151' }}>
                                {clean}
                            </p>
                        )
                    }) : (
                        <p style={{ fontSize: '0.875rem', color: '#94A3B8', fontStyle: 'italic' }}>
                            No description available.
                        </p>
                    )}
                </div>
            </div>

            {/* Bottom Apply CTA */}
            {job.source_url && (
                <div style={{ paddingTop: 8, borderTop: '1px solid #E2E8F0' }}>
                    <Link
                        href={job.source_url}
                        target="_blank"
                        style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            width: '100%', padding: '12px 24px', borderRadius: 8,
                            background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
                            color: '#fff', fontSize: '0.875rem', fontWeight: 600,
                            textDecoration: 'none',
                            boxShadow: '0 2px 10px rgba(37,99,235,0.2)',
                            transition: 'opacity 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.opacity = '0.88'}
                        onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.opacity = '1'}
                    >
                        Apply for this Role <ExternalLink size={14} />
                    </Link>
                </div>
            )}
        </div>
    )
}

// ── Empty States ──────────────────────────────────────────────

function EmptyDetail() {
    return (
        <div style={{
            position: 'relative',
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '48px 40px', textAlign: 'center',
            overflow: 'hidden',
            background: `
                radial-gradient(circle at 50% 8%, rgba(37, 99, 235, 0.06), transparent 55%),
                radial-gradient(circle at 85% 95%, rgba(96, 165, 250, 0.05), transparent 50%),
                #ffffff
            `,
        }}>
            {/* Dot grid backdrop, softened by radial mask */}
            <div aria-hidden style={{
                position: 'absolute', inset: 0,
                backgroundImage: 'radial-gradient(circle, #E2E8F0 1px, transparent 1px)',
                backgroundSize: '22px 22px',
                opacity: 0.55,
                maskImage: 'radial-gradient(ellipse 78% 62% at 50% 50%, black 25%, transparent 75%)',
                WebkitMaskImage: 'radial-gradient(ellipse 78% 62% at 50% 50%, black 25%, transparent 75%)',
                pointerEvents: 'none',
            }} />

            {/* Layered icon — rings + glow + sparkle */}
            <div style={{
                position: 'relative', width: 152, height: 152,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 28,
                animation: 'gentle-float 6s ease-in-out infinite',
            }}>
                <div aria-hidden style={{
                    position: 'absolute', inset: 0, borderRadius: '50%',
                    border: '1px dashed #DBEAFE',
                    animation: 'orbit-spin 28s linear infinite',
                }} />
                <div aria-hidden style={{
                    position: 'absolute', inset: 18, borderRadius: '50%',
                    border: '1px solid #EFF6FF',
                }} />
                <div aria-hidden style={{
                    position: 'absolute', inset: 28, borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(37, 99, 235, 0.22), transparent 70%)',
                    filter: 'blur(10px)',
                }} />
                <div style={{
                    position: 'relative',
                    width: 76, height: 76, borderRadius: 22,
                    background: 'linear-gradient(135deg, #60A5FA 0%, #2563EB 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 18px 36px -12px rgba(37, 99, 235, 0.55), inset 0 1px 0 rgba(255,255,255,0.45)',
                }}>
                    <Briefcase size={32} style={{ color: '#fff', strokeWidth: 1.75 }} />
                </div>
                <div aria-hidden style={{
                    position: 'absolute', top: 22, right: 26,
                    width: 9, height: 9, borderRadius: '50%',
                    background: '#FCD34D',
                    boxShadow: '0 0 14px rgba(252, 211, 77, 0.75)',
                }} />
                <div aria-hidden style={{
                    position: 'absolute', bottom: 30, left: 22,
                    width: 6, height: 6, borderRadius: '50%',
                    background: '#A78BFA',
                    boxShadow: '0 0 10px rgba(167, 139, 250, 0.65)',
                }} />
            </div>

            <div style={{ position: 'relative', zIndex: 1, maxWidth: 380 }}>
                <p style={{
                    fontSize: '0.6875rem', fontWeight: 700, color: '#2563EB',
                    textTransform: 'uppercase', letterSpacing: '0.2em',
                    marginBottom: 12,
                }}>
                    Job Workspace
                </p>
                <h2 style={{
                    fontSize: '1.625rem', fontWeight: 700, color: '#0F172A',
                    letterSpacing: '-0.02em', lineHeight: 1.2,
                    marginBottom: 12,
                }}>
                    Pick a role to see the full story
                </h2>
                <p style={{
                    fontSize: '0.9375rem', color: '#64748B', lineHeight: 1.65,
                }}>
                    Search a role on the left, then choose a listing to preview its description, required skills, and apply link — all in one view.
                </p>

                <div style={{
                    display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
                    gap: 8, marginTop: 28,
                }}>
                    {[
                        { label: 'Full description', accent: '#2563EB' },
                        { label: 'Required skills',  accent: '#7C3AED' },
                        { label: 'One-click apply',  accent: '#059669' },
                    ].map(p => (
                        <span key={p.label} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 7,
                            padding: '6px 14px', borderRadius: 9999,
                            background: '#ffffff', border: '1px solid #E2E8F0',
                            fontSize: '0.75rem', fontWeight: 500, color: '#475569',
                            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
                        }}>
                            <span aria-hidden style={{
                                width: 6, height: 6, borderRadius: '50%',
                                background: p.accent,
                                boxShadow: `0 0 8px ${p.accent}55`,
                            }} />
                            {p.label}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    )
}

function EmptyList({ hasSearched, searching }: { hasSearched: boolean; searching: boolean }) {
    if (searching) return (
        <div style={{
            padding: '56px 24px', textAlign: 'center',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
        }}>
            <div style={{
                position: 'relative', width: 56, height: 56,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 16,
            }}>
                <div aria-hidden style={{
                    position: 'absolute', inset: 0, borderRadius: '50%',
                    border: '2px solid #EFF6FF',
                }} />
                <div aria-hidden style={{
                    position: 'absolute', inset: 0, borderRadius: '50%',
                    border: '2px solid transparent', borderTopColor: '#2563EB',
                    animation: 'spin 0.9s linear infinite',
                }} />
                <Search size={20} style={{ color: '#2563EB' }} />
            </div>
            <p style={{
                fontSize: '0.8125rem', fontWeight: 600, color: '#1E293B',
                letterSpacing: '-0.01em', marginBottom: 4,
            }}>
                Looking up jobs
            </p>
            <p style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                Scanning our database…
            </p>
        </div>
    )

    if (!hasSearched) return (
        <div style={{
            position: 'relative',
            padding: '44px 24px 36px',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', textAlign: 'center',
            minHeight: 400,
            overflow: 'hidden',
        }}>
            <div aria-hidden style={{
                position: 'absolute', inset: 0,
                backgroundImage: 'radial-gradient(circle, #E2E8F0 1px, transparent 1px)',
                backgroundSize: '18px 18px',
                opacity: 0.45,
                maskImage: 'radial-gradient(ellipse 70% 55% at 50% 38%, black 0%, transparent 72%)',
                WebkitMaskImage: 'radial-gradient(ellipse 70% 55% at 50% 38%, black 0%, transparent 72%)',
                pointerEvents: 'none',
            }} />

            {/* Stacked-card icon — suggests "your jobs will land here" */}
            <div style={{
                position: 'relative', width: 116, height: 116,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 22,
            }}>
                <div aria-hidden style={{
                    position: 'absolute', width: 56, height: 56, borderRadius: 14,
                    background: 'linear-gradient(180deg, #F1F5F9 0%, #ffffff 100%)',
                    border: '1px solid #E2E8F0',
                    transform: 'rotate(-10deg) translate(-14px, 6px)',
                    boxShadow: '0 6px 14px -6px rgba(15, 23, 42, 0.08)',
                }} />
                <div aria-hidden style={{
                    position: 'absolute', width: 56, height: 56, borderRadius: 14,
                    background: 'linear-gradient(180deg, #DBEAFE 0%, #ffffff 100%)',
                    border: '1px solid #BFDBFE',
                    transform: 'rotate(8deg) translate(14px, -2px)',
                    boxShadow: '0 8px 18px -8px rgba(37, 99, 235, 0.22)',
                }} />
                <div style={{
                    position: 'relative',
                    width: 64, height: 64, borderRadius: 18,
                    background: 'linear-gradient(135deg, #60A5FA, #2563EB)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 14px 26px -10px rgba(37, 99, 235, 0.55), inset 0 1px 0 rgba(255,255,255,0.4)',
                    animation: 'gentle-float 5s ease-in-out infinite',
                }}>
                    <Search size={26} style={{ color: '#fff', strokeWidth: 2 }} />
                </div>
                <div aria-hidden style={{
                    position: 'absolute', top: 14, right: 18,
                    width: 7, height: 7, borderRadius: '50%',
                    background: '#FCD34D',
                    boxShadow: '0 0 10px rgba(252, 211, 77, 0.7)',
                }} />
            </div>

            <p style={{
                fontSize: '0.625rem', fontWeight: 700, color: '#2563EB',
                textTransform: 'uppercase', letterSpacing: '0.2em',
                marginBottom: 8,
            }}>
                Job Search
            </p>
            <h3 style={{
                fontSize: '1.0625rem', fontWeight: 700, color: '#0F172A',
                letterSpacing: '-0.015em', marginBottom: 8, lineHeight: 1.25,
            }}>
                Start your job hunt
            </h3>
            <p style={{
                fontSize: '0.8125rem', color: '#64748B', lineHeight: 1.6,
                maxWidth: 240, marginBottom: 20,
            }}>
                Type a role, location, or level above to discover openings tailored to you.
            </p>

            {/* Decorative example chips (static — visual aid only) */}
            <div style={{
                display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
                gap: 6, maxWidth: 240,
            }}>
                {['Frontend Developer', 'Data Analyst', 'DevOps · Bengaluru'].map(s => (
                    <span key={s} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '5px 11px', borderRadius: 9999,
                        background: '#ffffff', border: '1px solid #E2E8F0',
                        fontSize: '0.6875rem', color: '#475569', fontWeight: 500,
                        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
                    }}>
                        <Sparkles size={9} style={{ color: '#2563EB' }} />
                        {s}
                    </span>
                ))}
            </div>
        </div>
    )

    return (
        <div style={{
            padding: '44px 24px',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            textAlign: 'center',
        }}>
            <div style={{
                position: 'relative', width: 96, height: 96,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 18,
            }}>
                <div aria-hidden style={{
                    position: 'absolute', inset: 0, borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(245, 158, 11, 0.14), transparent 70%)',
                    filter: 'blur(6px)',
                }} />
                <div style={{
                    position: 'relative',
                    width: 60, height: 60, borderRadius: 16,
                    background: 'linear-gradient(135deg, #FEF3C7, #FDE68A)',
                    border: '1px solid #FCD34D',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 10px 20px -10px rgba(245, 158, 11, 0.45)',
                }}>
                    <Search size={24} style={{ color: '#B45309', strokeWidth: 2 }} />
                </div>
            </div>
            <p style={{
                fontWeight: 700, fontSize: '0.9375rem', color: '#0F172A',
                marginBottom: 6, letterSpacing: '-0.01em',
            }}>
                No jobs in your local DB
            </p>
            <p style={{
                fontSize: '0.8125rem', color: '#64748B', lineHeight: 1.55,
                maxWidth: 220, marginBottom: 18,
            }}>
                Try different keywords, or pull fresh listings from the web.
            </p>
            <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '6px 12px', borderRadius: 9999,
                background: '#0F172A', color: '#fff',
                fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.02em',
            }}>
                <Globe size={11} />
                Use “Fetch from Web”
            </div>
        </div>
    )
}

// ── Main Page ─────────────────────────────────────────────────

// Per-user search state survives in-app navigation (Dashboard → Search → AI
// Matches → back) by stashing into sessionStorage. New users have no entry, so
// they still see the empty "Search above to browse jobs" state on first load.
const SEARCH_STATE_PREFIX = 'searchPageState:'
type PersistedSearchState = {
    query: string
    location: string
    level: string
    results: Job[]
    selectedId: string | null
    hasSearched: boolean
}

export default function SearchPage() {
    const { user } = useAuth()
    const router = useRouter()
    const [query, setQuery] = useState('')
    const [location, setLocation] = useState('')
    const [level, setLevel] = useState('')
    const [results, setResults] = useState<Job[]>([])
    const [selected, setSelected] = useState<Job | null>(null)
    const [searching, setSearching] = useState(false)
    const [hasSearched, setHasSearched] = useState(false)
    const [dateFilter, setDateFilter] = useState<DateRange>('any')
    const restoredRef = useRef(false)

    // Derived: results passed through the date filter. All UI/scoring uses this.
    const visibleResults = useMemo(() => filterByDateRange(results, dateFilter), [results, dateFilter])
    const postedDates = useMemo(() => results.map(j => j.posted_date), [results])
    const isFilterHidingAll = dateFilter !== 'any' && visibleResults.length === 0 && results.length > 0

    // Keep the right-panel selection in sync with whatever is visible. If the
    // filter hides the current job, fall back to the first visible one (or null).
    useEffect(() => {
        if (!selected) return
        if (visibleResults.some(j => j.id === selected.id)) return
        setSelected(visibleResults[0] ?? null)
    }, [visibleResults, selected])

    useEffect(() => {
        if (!user?.id || restoredRef.current) return
        restoredRef.current = true
        try {
            const raw = sessionStorage.getItem(SEARCH_STATE_PREFIX + user.id)
            if (!raw) return
            const saved = JSON.parse(raw) as PersistedSearchState
            if (!saved.hasSearched) return
            setQuery(saved.query || '')
            setLocation(saved.location || '')
            setLevel(saved.level || '')
            setResults(saved.results || [])
            setHasSearched(true)
            if (saved.results?.length) {
                const sel = saved.selectedId
                    ? saved.results.find(j => j.id === saved.selectedId)
                    : null
                setSelected(sel ?? saved.results[0])
            }
        } catch { /* corrupt entry — ignore */ }
    }, [user?.id])

    useEffect(() => {
        if (!user?.id || !restoredRef.current || !hasSearched) return
        try {
            sessionStorage.setItem(SEARCH_STATE_PREFIX + user.id, JSON.stringify({
                query, location, level, results,
                selectedId: selected?.id ?? null,
                hasSearched,
            } satisfies PersistedSearchState))
        } catch { /* quota — ignore */ }
    }, [user?.id, query, location, level, results, selected, hasSearched])

    const [ingesting, setIngesting] = useState(false)
    const ingestingRef = useRef(false)
    const [ingestStatus, setIngestStatus] = useState('')
    const [ingestSuccess, setIngestSuccess] = useState(false)
    const [showIngestBanner, setShowIngestBanner] = useState(false)

    // Phase 8 — queue-driven ingestion lifecycle (replaces setInterval polling).
    // The QueueStatusBanner owns the useQueueJob subscription; we just react to
    // its onComplete/onFail callbacks. Two parallel hooks on the same channel
    // would conflict (Supabase Realtime de-dupes by channel name).
    const [ingestJobId, setIngestJobId] = useState<string | null>(null)
    const ingestStartTimeRef = useRef<string>('')
    const queryAtStartRef = useRef<string>('')
    const locationAtStartRef = useRef<string>('')
    const levelAtStartRef = useRef<string>('')

    const onIngestComplete = async (state: QueueJobState) => {
        const log = state.raw as { new_jobs_added?: number } | null
        const since = ingestStartTimeRef.current
        const queryStart = queryAtStartRef.current
        const locStart = locationAtStartRef.current
        const lvlStart = levelAtStartRef.current
        try {
            let jobs = await fetchJobsSince(since)
            if (jobs.length === 0) {
                jobs = await searchJobs(queryStart, {
                    location: locStart || undefined,
                    experience_level: lvlStart || undefined,
                })
                // n8n's experience_level extraction is unreliable — drop the level
                // filter on miss so role+location still surface results.
                if (jobs.length === 0 && lvlStart) {
                    jobs = await searchJobs(queryStart, { location: locStart || undefined })
                }
            }
            setResults(jobs)
            setHasSearched(true)
            if (jobs.length > 0) setSelected(jobs[0])
            // Stash the ingested job IDs so a follow-up Search DB click with the
            // same filters keeps showing the full set, not just strict matches.
            rememberIngestion(queryStart, locStart, lvlStart, jobs.map(j => j.id))
            setIngestStatus(`${log?.new_jobs_added ?? 0} new jobs added · Showing all ${jobs.length} fetched results`)
        } catch {
            setIngestStatus(`${log?.new_jobs_added ?? 0} new jobs added. Click "Search DB" to view.`)
        } finally {
            ingestingRef.current = false
            setIngesting(false)
            setIngestSuccess(true)
            setIngestJobId(null)
        }
    }

    const onIngestFail = () => {
        ingestingRef.current = false
        setIngesting(false)
        setIngestSuccess(false)
        setIngestStatus('Ingestion failed. Check n8n logs.')
        setIngestJobId(null)
    }

    const [scoring, setScoring] = useState(false)
    const [scoreStatus, setScoreStatus] = useState('')
    const [scoreError, setScoreError] = useState('')
    const [gateData, setGateData] = useState<{ maxSimilarity: number } | null>(null)

    const [singleScores, setSingleScores] = useState<Record<string, SingleScoreState>>({})


    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!query.trim()) return
        setSearching(true)
        setIngestStatus('')
        setShowIngestBanner(false)
        setSelected(null)
        setScoreStatus('')
        setScoreError('')
        try {
            const [jobs, rememberedIds] = await Promise.all([
                searchJobs(query, {
                    location: location || undefined,
                    experience_level: level || undefined,
                }),
                Promise.resolve(recallIngestion(query, location, level)),
            ])

            // Union strict results with the last ingestion's exact job set so
            // jobs n8n surfaced (but that don't strictly match the title filter)
            // remain visible. Cached set is capped to a 30-min TTL.
            const seen = new Set(jobs.map(j => j.id))
            const missingIds = rememberedIds.filter(id => !seen.has(id))
            let merged: Job[] = jobs
            if (missingIds.length > 0) {
                const extras = await fetchJobsByIds(missingIds)
                merged = [...jobs, ...extras].sort((a, b) => {
                    const aDate = a.posted_date || a.created_at || ''
                    const bDate = b.posted_date || b.created_at || ''
                    return bDate.localeCompare(aDate)
                })
            }

            setResults(merged)
            setHasSearched(true)
            if (merged.length > 0) setSelected(merged[0])
        } catch {
            setResults([])
        } finally {
            setSearching(false)
        }
    }

    const handleIngest = async () => {
        if (ingestingRef.current) return
        if (!query.trim()) {
            setIngestStatus('Please enter a job title first.')
            setIngestSuccess(false)
            setShowIngestBanner(true)
            return
        }
        ingestingRef.current = true
        setIngesting(true)
        setIngestSuccess(false)
        setIngestStatus('Scraping LinkedIn, Indeed & Google Jobs…')
        setShowIngestBanner(true)

        const ingestStartTime = new Date().toISOString()
        ingestStartTimeRef.current = ingestStartTime
        queryAtStartRef.current = query
        locationAtStartRef.current = location
        levelAtStartRef.current = level

        let result: Record<string, unknown>
        try {
            result = await triggerJobIngestion({
                role: query,
                location: location || 'India',
                experience_level: level || 'entry_level',
            }) as Record<string, unknown>
        } catch (err) {
            setIngestSuccess(false)
            if (err instanceof RateLimitError) {
                setIngestStatus(`Slow down — try again in ${err.retryAfterSec}s.`)
            } else {
                setIngestStatus('Failed to trigger ingestion. Is n8n running on localhost:5678?')
            }
            ingestingRef.current = false
            setIngesting(false)
            return
        }

        const logId = result?.ingestion_log_id as string | undefined
        if (!logId) {
            setIngestSuccess(true)
            setIngestStatus('Job fetch initiated! Results appear in ~60–90 seconds. Click "Search DB" to check.')
            ingestingRef.current = false
            setIngesting(false)
            return
        }

        // Phase 8: hand off to useQueueJob hook — the useEffect above watches
        // ingestJob.terminal and runs the post-completion logic via Realtime + 5s
        // polling fallback. Cache-hits resolve instantly inside the hook.
        setIngestStatus(logId.startsWith('cache-hit:')
            ? 'Loading cached results…'
            : 'Fetching jobs from web…')
        setIngestJobId(logId)
    }

    const handleScore = async (opts?: { forceScore?: boolean }) => {
        const primaryResumeId = getPrimaryResumeId()
        if (!primaryResumeId) {
            setScoreError('Pick a primary resume first. Go to Upload, click a resume, then "⚡ Use this for scoring".')
            return
        }
        if (visibleResults.length === 0) {
            setScoreError(results.length === 0
                ? 'Search for jobs first, then score.'
                : `No jobs in ${rangeShortLabel(dateFilter).toLowerCase()}. Widen the date filter to score.`)
            return
        }
        setScoring(true)
        setScoreError('')
        setScoreStatus('Scoring jobs against your resume…')
        setGateData(null)
        try {
            const jobIds = visibleResults.map(j => j.id)
            const res = await triggerScoring({
                resumeId: primaryResumeId,
                userId: user?.id ?? '',
                jobIds,
                experienceLevel: level || undefined,
                mode: 'rag',
                forceScore: opts?.forceScore ?? false,
            })

            if (res.gate_triggered) {
                setScoreStatus('')
                setGateData({ maxSimilarity: res.max_similarity ?? 0 })
                return
            }

            if (res.success) {
                const totalSearched = jobIds.length
                const scored = res.jobs_scored ?? totalSearched
                const skipped = totalSearched - scored
                const msg = skipped > 0
                    ? `Scored ${scored} of ${totalSearched} jobs. ${skipped} skipped (asked for more experience than your resume shows). Redirecting…`
                    : `Scored ${scored} jobs! Redirecting to matches…`
                setScoreStatus(msg)
                setTimeout(() => router.push('/dashboard/matches'), skipped > 0 ? 2800 : 1500)
            } else {
                setScoreError('Scoring returned an error. Check n8n logs.')
            }
        } catch (err) {
            if (err instanceof RateLimitError) {
                setScoreError(`Slow down — try again in ${err.retryAfterSec}s.`)
            } else {
                setScoreError(err instanceof Error ? err.message : 'Scoring failed. Is n8n running?')
            }
            setScoreStatus('')
        } finally {
            setScoring(false)
        }
    }

    async function handleScoreSingleJob(jobId: string) {
        const resumeId = getPrimaryResumeId()
        const userId = user?.id
        if (!resumeId || !userId) {
            setSingleScores(s => ({ ...s, [jobId]: { state: 'error', jobId, message: 'Upload a resume first' } }))
            return
        }
        const current = singleScores[jobId]
        if (current?.state === 'loading') return
        if (current?.state === 'success') {
            router.push(`/dashboard/matches?jobId=${jobId}`)
            return
        }

        setSingleScores(s => ({ ...s, [jobId]: { state: 'loading', jobId } }))

        const sb = createBrowserSupabase()
        const readRow = async () => {
            const { data } = await sb.from('user_job_matches')
                .select('relevance_score, recommendation')
                .eq('user_id', userId)
                .eq('resume_id', resumeId)
                .eq('job_id', jobId)
                .maybeSingle()
            return data as { relevance_score: number; recommendation?: string } | null
        }

        try {
            const res = await triggerScoring({
                resumeId, userId, jobIds: [jobId],
                experienceLevel: level || undefined,
                mode: 'all',
                forceScore: false,
            })

            if (res.from_cache) {
                const row = await readRow()
                if (row) {
                    setSingleScores(s => ({ ...s, [jobId]: { state: 'success', jobId, score: row.relevance_score, recommendation: row.recommendation } }))
                    return
                }
            }

            const queueJobId = (res as { queue_job_id?: string }).queue_job_id
            if (queueJobId) {
                setSingleScores(s => ({ ...s, [jobId]: { state: 'loading', jobId, queueJobId } }))
            }
            const deadline = Date.now() + 90_000
            while (Date.now() < deadline) {
                await new Promise(r => setTimeout(r, 2000))
                const row = await readRow()
                if (row?.relevance_score != null) {
                    setSingleScores(s => ({ ...s, [jobId]: { state: 'success', jobId, score: row.relevance_score, recommendation: row.recommendation } }))
                    return
                }
            }
            setSingleScores(s => ({ ...s, [jobId]: { state: 'error', jobId, message: 'Scoring timed out — check AI Matches in a moment.' } }))
        } catch (err) {
            const message =
                err instanceof RateLimitError ? `Rate limited — retry in ${err.retryAfterSec}s` :
                    err instanceof Error ? err.message :
                        'Scoring failed'
            setSingleScores(s => ({ ...s, [jobId]: { state: 'error', jobId, message } }))
        }
    }

    return (
        <div style={{
            display: 'flex', flexDirection: 'column',
            height: 'calc(100vh - 64px)',
            overflow: 'hidden',
            background: '#F1F5F9',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}>

            {/* ── Top Search Bar ── */}
            <div style={{
                background: '#fff',
                borderBottom: '1px solid #E2E8F0',
                padding: '12px 24px',
                flexShrink: 0,
                display: 'flex', flexDirection: 'column', gap: 8,
            }}>
                {/* Row 1: pill search bar */}
                <form onSubmit={handleSearch} style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{
                        display: 'flex', flex: 1,
                        border: '1px solid #E2E8F0',
                        borderRadius: 9999,
                        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                        background: '#fff',
                    }}>
                        {/* Job title autocomplete */}
                        <AutocompleteInput
                            value={query}
                            onChange={setQuery}
                            placeholder="Job title, company, or keyword…"
                            suggestions={IT_ROLES}
                            icon={<Search size={13} style={{ color: '#94A3B8', marginRight: 7, flexShrink: 0 }} />}
                            borderStyle={{ flex: 2, borderRight: '1px solid #E2E8F0', borderRadius: '9999px 0 0 9999px' }}
                        />

                        {/* Location autocomplete */}
                        <AutocompleteInput
                            value={location}
                            onChange={setLocation}
                            placeholder="City or location"
                            suggestions={INDIA_LOCATIONS}
                            icon={<MapPin size={13} style={{ color: '#94A3B8', marginRight: 7, flexShrink: 0 }} />}
                            borderStyle={{ flex: 1, borderRight: '1px solid #E2E8F0' }}
                        />

                        {/* Level dropdown */}
                        <LevelDropdown value={level} onChange={setLevel} />

                        {/* Search button */}
                        <button
                            type="submit"
                            disabled={searching}
                            style={{
                                padding: '8px 20px',
                                background: searching
                                    ? '#93C5FD'
                                    : 'linear-gradient(135deg, #3B82F6, #2563EB)',
                                color: '#fff',
                                border: 'none', cursor: searching ? 'not-allowed' : 'pointer',
                                fontSize: '0.8125rem', fontWeight: 600,
                                transition: 'opacity 0.15s',
                                whiteSpace: 'nowrap', flexShrink: 0,
                                fontFamily: 'inherit',
                                borderRadius: '0 9999px 9999px 0',
                            }}
                        >
                            {searching ? 'Searching…' : 'Search DB'}
                        </button>
                    </div>
                </form>

                {/* Row 2: action buttons */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.8125rem', color: '#94A3B8' }}>
                            {hasSearched && !searching && (
                                dateFilter === 'any'
                                    ? `${results.length} jobs found`
                                    : `${visibleResults.length} of ${results.length} jobs`
                            )}
                        </span>
                        {hasSearched && !searching && results.length > 0 && (
                            <DatePostedFilter
                                value={dateFilter}
                                onChange={setDateFilter}
                                postedDates={postedDates}
                            />
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <PasteJobButton />
                        <button
                            onClick={() => handleScore()}
                            disabled={scoring || visibleResults.length === 0}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 5,
                                padding: '6px 14px', borderRadius: 9999,
                                background: scoring || visibleResults.length === 0
                                    ? '#E2E8F0'
                                    : 'linear-gradient(135deg, #7C3AED, #6D28D9)',
                                color: scoring || visibleResults.length === 0 ? '#94A3B8' : '#fff',
                                border: 'none', cursor: scoring || visibleResults.length === 0 ? 'not-allowed' : 'pointer',
                                fontSize: '0.8125rem', fontWeight: 600,
                                boxShadow: visibleResults.length > 0 && !scoring ? '0 2px 8px rgba(109,40,217,0.25)' : 'none',
                                transition: 'all 0.15s', whiteSpace: 'nowrap',
                                fontFamily: 'inherit',
                            }}
                        >
                            <Sparkles size={13} />
                            {scoring ? 'Scoring…' : 'Find Best Jobs'}
                        </button>
                        <button
                            onClick={handleIngest}
                            disabled={ingesting}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 5,
                                padding: '6px 14px', borderRadius: 9999,
                                background: ingesting ? '#334155' : '#1E293B',
                                color: '#fff',
                                border: 'none', cursor: ingesting ? 'not-allowed' : 'pointer',
                                fontSize: '0.8125rem', fontWeight: 600,
                                opacity: ingesting ? 0.7 : 1,
                                transition: 'all 0.15s', whiteSpace: 'nowrap',
                                fontFamily: 'inherit',
                            }}
                        >
                            <Globe size={13} />
                            {ingesting ? 'Scraping…' : 'Fetch from Web'}
                        </button>
                    </div>
                </div>

                {/* Phase 8 — Queue status pill (shows queue position + lifecycle while waiting) */}
                {ingestJobId && (
                    <QueueStatusBanner
                        jobId={ingestJobId}
                        label="Fetching jobs"
                        onComplete={onIngestComplete}
                        onFail={onIngestFail}
                    />
                )}

                {/* Ingest status banner */}
                {showIngestBanner && ingestStatus && (
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 14px', borderRadius: 8,
                        background: ingestSuccess ? '#F0FDF4' : ingesting ? '#EFF6FF' : '#FEF2F2',
                        border: `1px solid ${ingestSuccess ? '#BBF7D0' : ingesting ? '#BFDBFE' : '#FECACA'}`,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {ingesting && (
                                <div style={{
                                    width: 14, height: 14, border: '2px solid #93C5FD',
                                    borderTopColor: '#2563EB', borderRadius: '50%',
                                    animation: 'spin 0.8s linear infinite', flexShrink: 0,
                                }} />
                            )}
                            {ingestSuccess && <CheckCircle2 size={15} style={{ color: '#16A34A', flexShrink: 0 }} />}
                            {!ingesting && !ingestSuccess && <AlertCircle size={15} style={{ color: '#DC2626', flexShrink: 0 }} />}
                            <span style={{
                                fontSize: '0.8125rem', fontWeight: 500,
                                color: ingestSuccess ? '#166534' : ingesting ? '#1D4ED8' : '#DC2626',
                            }}>
                                {ingestStatus}
                            </span>
                        </div>
                        <button
                            onClick={() => setShowIngestBanner(false)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 2, flexShrink: 0 }}
                        >
                            <X size={14} />
                        </button>
                    </div>
                )}

                {/* Score status banner */}
                {scoreStatus && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '10px 14px', borderRadius: 8,
                        background: '#EEF2FF', border: '1px solid #C7D2FE',
                    }}>
                        {scoring && (
                            <div style={{
                                width: 14, height: 14, border: '2px solid #A5B4FC',
                                borderTopColor: '#6366F1', borderRadius: '50%',
                                animation: 'spin 0.8s linear infinite', flexShrink: 0,
                            }} />
                        )}
                        {!scoring && <CheckCircle2 size={15} style={{ color: '#4338CA', flexShrink: 0 }} />}
                        <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: '#4338CA' }}>
                            {scoreStatus}
                        </span>
                    </div>
                )}

                {/* Gate warning — low resume match detected */}
                {gateData && (
                    <div style={{
                        padding: '12px 14px', borderRadius: 8,
                        background: '#FFFBEB', border: '1px solid #FDE68A',
                        display: 'flex', flexDirection: 'column', gap: 10,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <AlertCircle size={15} style={{ color: '#D97706', flexShrink: 0, marginTop: 1 }} />
                            <div>
                                <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#92400E', marginBottom: 2 }}>
                                    Low resume match detected
                                </p>
                                <p style={{ fontSize: '0.75rem', color: '#78350F', lineHeight: 1.5 }}>
                                    Your resume has very low similarity ({(gateData.maxSimilarity * 100).toFixed(0)}%) with these
                                    job listings. Scoring will likely return all low-fit results and use your token quota.
                                </p>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button
                                onClick={() => { setGateData(null); handleScore({ forceScore: true }) }}
                                style={{
                                    fontSize: '0.75rem', fontWeight: 600,
                                    padding: '5px 12px', borderRadius: 6,
                                    background: '#F59E0B', color: '#fff',
                                    border: 'none', cursor: 'pointer',
                                }}
                            >
                                Score Anyway
                            </button>
                            <button
                                onClick={() => { setGateData(null); router.push('/dashboard/learning') }}
                                style={{
                                    fontSize: '0.75rem', fontWeight: 600,
                                    padding: '5px 12px', borderRadius: 6,
                                    background: '#EFF6FF', color: '#2563EB',
                                    border: '1px solid #BFDBFE', cursor: 'pointer',
                                }}
                            >
                                View Learning Path
                            </button>
                            <button
                                onClick={() => setGateData(null)}
                                style={{
                                    fontSize: '0.75rem', fontWeight: 500,
                                    padding: '5px 12px', borderRadius: 6,
                                    background: 'transparent', color: '#78350F',
                                    border: '1px solid #FCD34D', cursor: 'pointer',
                                }}
                            >
                                Try a Different Search
                            </button>
                        </div>
                    </div>
                )}

                {/* Score error banner */}
                {scoreError && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '10px 14px', borderRadius: 8,
                        background: '#FEF2F2', border: '1px solid #FECACA',
                    }}>
                        <AlertCircle size={15} style={{ color: '#DC2626', flexShrink: 0 }} />
                        <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: '#DC2626' }}>{scoreError}</span>
                        <button
                            onClick={() => setScoreError('')}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 2, marginLeft: 'auto', flexShrink: 0 }}
                        >
                            <X size={14} />
                        </button>
                    </div>
                )}
            </div>

            {/* ── Two-Panel Body ── */}
            <div style={{ display: 'flex', flex: '1 1 0', minHeight: 0, overflow: 'hidden', padding: '12px 16px', gap: 12 }}>

                {/* Left Panel: Job List */}
                <div style={{
                    width: '32%', minWidth: 260, maxWidth: 400,
                    background: '#fff',
                    borderRadius: 10,
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                    display: 'flex', flexDirection: 'column',
                    overflowY: 'auto', overflowX: 'hidden',
                    height: '100%',
                }}>
                    {/* Count header */}
                    {hasSearched && results.length > 0 && (
                        <div style={{
                            padding: '10px 16px',
                            borderBottom: '1px solid #F1F5F9',
                            fontSize: '0.75rem', color: '#64748B',
                            flexShrink: 0, background: '#FAFAFA',
                        }}>
                            {dateFilter === 'any'
                                ? `${results.length} jobs found`
                                : `${visibleResults.length} of ${results.length} jobs · ${rangeShortLabel(dateFilter)}`}
                        </div>
                    )}

                    {results.length === 0 || !hasSearched || searching ? (
                        <EmptyList hasSearched={hasSearched} searching={searching} />
                    ) : isFilterHidingAll ? (
                        <div style={{
                            padding: '32px 20px', textAlign: 'center',
                            color: '#64748B', fontSize: '0.8125rem', lineHeight: 1.5,
                        }}>
                            <Clock size={20} style={{ color: '#CBD5E1', marginBottom: 10 }} />
                            <div style={{ fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                                No jobs posted in {rangeShortLabel(dateFilter).toLowerCase()}
                            </div>
                            <button
                                type="button"
                                onClick={() => setDateFilter('any')}
                                style={{
                                    marginTop: 10, padding: '6px 12px',
                                    background: '#EFF4FE', color: '#0F4DD0',
                                    border: '1px solid #BFDBFE', borderRadius: 9999,
                                    fontSize: '0.75rem', fontWeight: 600,
                                    cursor: 'pointer', fontFamily: 'inherit',
                                }}
                            >
                                Show all {results.length}
                            </button>
                        </div>
                    ) : (
                        visibleResults.map(job => (
                            <JobCard
                                key={job.id}
                                job={job}
                                selected={selected?.id === job.id}
                                onClick={() => setSelected(job)}
                            />
                        ))
                    )}
                </div>

                {/* Right Panel: Job Detail */}
                <div style={{
                    flex: '1 1 0', minWidth: 0,
                    overflowY: 'auto', overflowX: 'hidden',
                    height: '100%',
                    background: '#fff',
                    borderRadius: 10,
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                }}>
                    {selected ? (
                        <JobDetailPanel
                            key={selected.id}
                            job={selected}
                            scoreState={singleScores[selected.id]}
                            onScore={handleScoreSingleJob}
                            hasResume={!!getPrimaryResumeId()}
                        />
                    ) : (
                        <EmptyDetail />
                    )}
                </div>
            </div>

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes gentle-float {
                    0%, 100% { transform: translateY(0); }
                    50%      { transform: translateY(-6px); }
                }
                @keyframes orbit-spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    )
}
