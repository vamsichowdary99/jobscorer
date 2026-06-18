'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { fetchMatches, fetchResumes, fetchResumeById, getPrimaryResumeId, triggerCompanyResearch, RateLimitError, CompanyResearchPendingError, countActiveScoreJobs } from '@/lib/api'
import { addPending } from '@/lib/pendingResearch'
import { locationFacets, matchInLocation, ALL_LOCATION_KEY } from '@/lib/locations'
import { isJobClosed } from '@/lib/jobs/applicationStatus'
import { reportJobStatus } from '@/lib/api'
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import { getScoreColor } from '@/lib/types'
import type { Job, Resume, UserJobMatch } from '@/lib/types'
import { useAuth } from '@/components/providers/AuthProvider'
import LegitimacyBadge from '@/components/LegitimacyBadge'

type FullMatch = UserJobMatch & { job: Job }

/* ── Helpers ── */
// Collapse duplicate listings of the SAME role that arrive under different
// job_ids across providers (Naukri, LinkedIn, JSearch, SerpAPI all index the
// same posting with slightly different metadata). Keep the highest-scored one.
//
// Three normalisation steps prevent provider-variant strings from defeating the
// dedup:
//   1. Company: strip legal suffixes (Inc / Ltd / Pvt / Solutions / Technologies
//      etc.) so "Gravitix Tech" == "Gravitix Tech Solutions Inc".
//   2. Title: sort words alphabetically so "Fresher - Front End Developer" ==
//      "Front End Developer - Fresher" (same words, different order).
//   3. Location: use only the first comma-segment (the city) so "Hyderabad" ==
//      "Hyderabad, Telangana, India".
//
// Rows missing title OR company are kept as-is (can't dedup reliably).
function normaliseCompany(raw: string): string {
    return raw
        .toLowerCase()
        .replace(/\b(pvt\.?|private|ltd\.?|limited|inc\.?|incorporated|llc|llp|solutions?|technologies?|tech|systems?|services?|group|global|india|infotech|infosystems?|software)\b/gi, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
}

function normaliseTitle(raw: string): string {
    return raw
        .toLowerCase()
        .replace(/[-–—,|/\\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .sort()
        .join(' ')
}

function normaliseCity(raw: string): string {
    // Take the first comma-segment — "Hyderabad, Telangana, India" → "hyderabad"
    return raw.split(',')[0].trim().toLowerCase()
}

function dedupeMatchesByRole(list: FullMatch[]): FullMatch[] {
    const best = new Map<string, FullMatch>()
    for (const m of list) {
        const title = (m.job?.title ?? '').trim()
        const company = (m.job?.company ?? '').trim()
        if (!title || !company) { best.set(`uniq:${m.id}`, m); continue }
        const key = `${normaliseTitle(title)}|${normaliseCompany(company)}|${normaliseCity(m.job?.location ?? '')}`
        const existing = best.get(key)
        if (!existing || (m.relevance_score ?? 0) > (existing.relevance_score ?? 0)) {
            best.set(key, m)
        }
    }
    return Array.from(best.values())
}

const ICON_COLORS = ['#0f172a','#1e3a5f','#14532d','#3b0764','#0c4a6e','#1c1917','#431407','#042f2e','#1e1b4b','#162032']

function iconColor(name: string) {
    let h = 0; for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h)
    return ICON_COLORS[Math.abs(h) % ICON_COLORS.length]
}

function formatDate(d: string | null): string {
    if (!d) return ''
    const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Yesterday'
    if (diff < 7) return `${diff} days ago`
    if (diff < 30) return `${Math.floor(diff / 7)} weeks ago`
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function matchLabel(s: number) {
    if (s >= 80) return 'Exceptional Match'
    if (s >= 60) return 'Good Match'
    if (s >= 40) return 'Fair Match'
    return 'Low Match'
}

/* ── 5-bucket recommendation system ──
 * Scoring AI emits one of: strong_apply / apply / apply_with_prep / optimize_resume / low_fit.
 * Old user_job_matches rows that still carry the legacy 3-value enum (apply/
 * optimize_resume/low_fit) keep rendering correctly because those keys remain
 * in the map. */
type RecKey = 'strong_apply' | 'apply' | 'apply_with_prep' | 'optimize_resume' | 'low_fit'

type RecInfo = {
    color: string
    bg: string
    border: string
    label: string
    short: string
    tagline: string
    accentGradient?: string
    icon: React.ReactNode
}

const REC: Record<string, RecInfo> = {
    strong_apply: {
        color: '#047857',
        bg: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
        border: '#6ee7b7',
        label: 'Strong Apply',
        short: 'Strong',
        tagline: 'Exceptional match. Apply without changes.',
        accentGradient: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
        icon: (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
                <path d="M12 2l2.5 6.5L21 11l-6.5 2.5L12 20l-2.5-6.5L3 11l6.5-2.5L12 2z" />
            </svg>
        ),
    },
    apply: {
        color: '#15803d',
        bg: '#f0fdf4',
        border: '#bbf7d0',
        label: 'Apply',
        short: 'Apply',
        tagline: 'Solid match. Apply directly.',
        icon: (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 13l4 4L19 7" />
            </svg>
        ),
    },
    apply_with_prep: {
        color: '#a16207',
        bg: '#fefce8',
        border: '#fde68a',
        label: 'Apply With Prep',
        short: 'Prep first',
        tagline: '1–4 weeks of focused prep, then apply.',
        icon: (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
            </svg>
        ),
    },
    optimize_resume: {
        color: '#c2410c',
        bg: '#fff7ed',
        border: '#fed7aa',
        label: 'Optimize Resume',
        short: 'Optimize',
        tagline: 'Skills are there — your resume needs to tell the story.',
        icon: (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
        ),
    },
    low_fit: {
        color: '#b91c1c',
        bg: '#fef2f2',
        border: '#fecaca',
        label: 'Low Fit',
        short: 'Low fit',
        tagline: 'Not the right role at this stage.',
        icon: (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
            </svg>
        ),
    },
}

function RecommendationBadge({ rec, size = 'sm' }: { rec: string | null; size?: 'sm' | 'lg' }) {
    const r = REC[rec ?? ''] ?? REC.low_fit
    const isStrong = rec === 'strong_apply'

    if (size === 'sm') {
        return (
            <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '3px 9px 3px 8px', borderRadius: 9999,
                background: r.bg, color: r.color,
                border: `1px solid ${r.border}`,
                fontSize: '0.6875rem', fontWeight: 700,
                letterSpacing: '0.01em', whiteSpace: 'nowrap',
                boxShadow: isStrong ? `0 0 0 3px ${r.border}55, 0 1px 2px ${r.color}25` : 'none',
            }}>
                {r.icon}
                {r.short}
            </span>
        )
    }

    return (
        <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 12,
            padding: '10px 16px 10px 11px', borderRadius: 12,
            background: r.bg, color: r.color,
            border: `1px solid ${r.border}`,
            boxShadow: isStrong
                ? `inset 0 1px 0 rgba(255,255,255,0.55), 0 10px 22px -12px ${r.color}66`
                : '0 1px 2px rgba(0,0,0,0.04)',
        }}>
            <div style={{
                width: 32, height: 32, borderRadius: 9,
                background: r.accentGradient ?? `${r.color}18`,
                color: r.accentGradient ? '#fff' : r.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                boxShadow: r.accentGradient ? `0 6px 14px -6px ${r.color}aa` : 'none',
            }}>
                {r.icon}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: 800, letterSpacing: '-0.01em' }}>
                    {r.label}
                </span>
                <span style={{ fontSize: '0.7rem', fontWeight: 500, opacity: 0.78, marginTop: 2 }}>
                    {r.tagline}
                </span>
            </div>
        </div>
    )
}

/* ── AI Analysis bullet parser + renderer ──
 * Parses the GPT-4o ai_reasoning output, now formatted as a markdown bullet list:
 *   - **Match**: Your AWS + Terraform skills mirror the JD's IaC focus.
 *   - **Gap**: Missing Kubernetes — Killercoda free labs cover basics in 1 week.
 *   - **Verdict**: Strong fit. Apply directly.
 * Legacy paragraph rows (pre-bullet-prompt) gracefully fall back to a plain
 * <p> render — old matches still look fine. */
type ReasoningBullet = { label: string; content: string }

function parseReasoningBullets(text: string): ReasoningBullet[] {
    if (!text) return []
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    const bullets: ReasoningBullet[] = []
    for (const raw of lines) {
        const stripped = raw.replace(/^[-•*]\s*/, '')
        const m = stripped.match(/^\*\*([^*]+?)\*\*\s*[:：]\s*(.+)$/)
        if (m) {
            bullets.push({ label: m[1].trim(), content: m[2].trim() })
        } else if (bullets.length > 0) {
            bullets[bullets.length - 1].content += ' ' + stripped
        }
    }
    return bullets
}

const REASONING_LABEL_STYLES: Record<string, { color: string; bg: string; border: string }> = {
    Match:              { color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
    Disqualifier:       { color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
    Gap:                { color: '#a16207', bg: '#fefce8', border: '#fde68a' },
    Verdict:            { color: '#1d4ed8', bg: '#dbeafe', border: '#bfdbfe' },
    'Why this matters': { color: '#7e22ce', bg: '#f3e8ff', border: '#e9d5ff' },
}

function ReasoningBullets({ text }: { text: string }) {
    const bullets = parseReasoningBullets(text)
    if (bullets.length === 0) {
        return (
            <p style={{ fontSize: '0.9rem', lineHeight: 1.75, color: '#374151' }}>
                {text}
            </p>
        )
    }
    return (
        <ul style={{
            listStyle: 'none', padding: 0, margin: 0,
            display: 'flex', flexDirection: 'column', gap: 12,
        }}>
            {bullets.map((b, i) => {
                const style = REASONING_LABEL_STYLES[b.label] ?? {
                    color: '#475569', bg: '#f8fafc', border: '#e2e8f0',
                }
                return (
                    <li key={i} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 14,
                    }}>
                        <span style={{
                            flexShrink: 0,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            padding: '4px 11px', borderRadius: 9999,
                            background: style.bg, color: style.color,
                            border: `1px solid ${style.border}`,
                            fontSize: '0.6875rem', fontWeight: 700,
                            letterSpacing: '0.04em', textTransform: 'uppercase',
                            minWidth: 92, height: 24,
                        }}>
                            {b.label}
                        </span>
                        <p style={{
                            margin: 0, paddingTop: 2,
                            fontSize: '0.9rem', lineHeight: 1.55, color: '#1f2937', flex: 1,
                        }}>
                            {b.content.replace(/\*\*/g, '')}
                        </p>
                    </li>
                )
            })}
        </ul>
    )
}

/* ── Company Icon ── */
function CompanyIcon({ company, size = 42 }: { company: string | null; size?: number }) {
    const name = company ?? '?'
    const bg = iconColor(name)
    const letter = name[0].toUpperCase()
    const r = Math.round(size * 0.22)
    return (
        <div style={{
            width: size, height: size, borderRadius: r,
            background: bg, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(255,255,255,0.92)', fontSize: size * 0.42, fontWeight: 700,
            letterSpacing: '-0.02em', boxShadow: `0 1px 4px ${bg}80`,
        }}>{letter}</div>
    )
}

/* ── Match % badge ── */
function MatchBadge({ score }: { score: number }) {
    const [c, bg] = score >= 80
        ? ['#15803d', '#dcfce7']
        : score >= 60
            ? ['#c2410c', '#ffedd5']
            : ['#b91c1c', '#fee2e2']
    return (
        <span style={{
            fontSize: '0.6rem', fontWeight: 800, padding: '3px 8px',
            borderRadius: 6, color: c, background: bg, letterSpacing: '0.04em',
            whiteSpace: 'nowrap',
        }}>
            {score}% MATCH
        </span>
    )
}

/* ── Left panel job card ── */
function JobCard({ match, selected, onClick, idx }: {
    match: FullMatch; selected: boolean; onClick: () => void; idx: number
}) {
    const job = match.job
    const score = match.relevance_score ?? 0
    return (
        <div
            onClick={onClick}
            style={{
                margin: '0 12px 8px',
                padding: '14px 16px',
                borderRadius: 12,
                border: `1.5px solid ${selected ? '#135bec' : '#e5e7eb'}`,
                background: selected ? '#f0f6ff' : 'white',
                cursor: 'pointer',
                transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
                boxShadow: selected ? '0 0 0 3px rgba(19,91,236,0.1)' : '0 1px 3px rgba(0,0,0,0.04)',
                animationName: 'cardIn',
                animationDuration: '0.35s',
                animationTimingFunction: 'ease',
                animationFillMode: 'both',
                animationDelay: `${idx * 0.05}s`,
            }}
            onMouseEnter={e => { if (!selected) { e.currentTarget.style.borderColor = '#c7d8f8'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.07)' } }}
            onMouseLeave={e => { if (!selected) { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)' } }}
        >
            {/* Top row: icon + badge */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <CompanyIcon company={job.company} size={40} />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                    <MatchBadge score={score} />
                    <RecommendationBadge rec={match.recommendation} size="sm" />
                </div>
            </div>

            {/* Title */}
            <h3 style={{
                fontSize: '0.9375rem', fontWeight: 700, color: '#111827',
                lineHeight: 1.3, marginBottom: 3,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{job.title}</h3>

            {/* Company · Location */}
            <p style={{
                fontSize: '0.8rem', color: '#6b7280', marginBottom: 10,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
                {job.company ?? 'Unknown'}{job.location ? ` • ${job.location}` : ''}
            </p>

            {/* Suspicious banner — pre-empts the click for likely ghost jobs */}
            {job.legitimacy_tier === 'suspicious' && (
                <div style={{ marginBottom: 10 }}>
                    <LegitimacyBadge tier={job.legitimacy_tier} signals={job.legitimacy_signals} variant="strip" />
                </div>
            )}

            {/* Bottom row: salary + date + tier pill (verified/caution only) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    {job.salary && (
                        <span style={{
                            fontSize: '0.75rem', padding: '3px 10px', borderRadius: 6,
                            background: '#f3f4f6', color: '#374151', fontWeight: 600,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>{job.salary}</span>
                    )}
                    {(job.legitimacy_tier === 'verified' || job.legitimacy_tier === 'proceed_with_caution') && (
                        <LegitimacyBadge
                            tier={job.legitimacy_tier}
                            signals={job.legitimacy_signals}
                            size="sm"
                        />
                    )}
                </div>
                {job.posted_date && (
                    <span style={{ fontSize: '0.6875rem', color: '#9ca3af', whiteSpace: 'nowrap' }}>
                        {formatDate(job.posted_date)}
                    </span>
                )}
            </div>
        </div>
    )
}

/* ── Large score ring (right panel) ── */
function ScoreRing({ score }: { score: number }) {
    const color = getScoreColor(score)
    const r = 52, circ = 2 * Math.PI * r
    const offset = circ - (score / 100) * circ
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <svg width="130" height="130" viewBox="0 0 130 130">
                <circle cx="65" cy="65" r={r} fill="none" stroke="#f3f4f6" strokeWidth="10" />
                <circle
                    cx="65" cy="65" r={r} fill="none"
                    stroke={color} strokeWidth="10" strokeLinecap="round"
                    strokeDasharray={circ} strokeDashoffset={offset}
                    style={{
                        transform: 'rotate(-90deg)', transformOrigin: 'center',
                        transition: 'stroke-dashoffset 1s cubic-bezier(.34,1.56,.64,1)',
                        filter: `drop-shadow(0 0 8px ${color}55)`,
                    }}
                />
                <text x="65" y="58" textAnchor="middle" fontSize="30" fontWeight="800" fill={color}
                    style={{ fontFamily: "'Manrope', sans-serif" }}>
                    {score}%
                </text>
                <text x="65" y="76" textAnchor="middle" fontSize="10" fontWeight="600" fill="#9ca3af"
                    style={{ fontFamily: "'Manrope', sans-serif", letterSpacing: '0.06em' }}>
                    AI SCORE
                </text>
            </svg>
            <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#374151' }}>
                {matchLabel(score)}
            </span>
        </div>
    )
}

/* ── Description parser: detect section headers ── */
function parseDescription(text: string) {
    const HEADERS = /^(key responsibilities|responsibilities|requirements|qualifications|about the role|role overview|about the job|what you.ll do|what we.re looking for|benefits|what we offer|nice to have|preferred|about us|who you are)/i
    const lines = text.split('\n')
    const sections: { type: 'heading' | 'bullet' | 'text'; content: string }[] = []

    for (const raw of lines) {
        const line = raw.trim()
        if (!line) continue
        const stripped = line.replace(/^[-•*]\s*/, '')
        if (HEADERS.test(stripped) || (stripped.endsWith(':') && stripped.length < 60 && !stripped.startsWith('-'))) {
            sections.push({ type: 'heading', content: stripped.replace(/:$/, '') })
        } else if (/^[-•*]\s/.test(line) || /^\d+\.\s/.test(line)) {
            sections.push({ type: 'bullet', content: stripped.replace(/^\d+\.\s/, '') })
        } else {
            sections.push({ type: 'text', content: line })
        }
    }
    return sections
}

/* ── Right panel: full detail ── */
function JobDetail({ match, onReported }: { match: FullMatch; onReported?: (jobId: string) => void }) {
    const job = match.job
    const score = match.relevance_score ?? 0
    const matched = match.matched_skills ?? []
    const missing = match.missing_skills ?? []
    const gaps = match.gaps ?? null
    const reasoning = match.ai_reasoning ?? ''
    const descSections = job.description ? parseDescription(job.description) : []
    const router = useRouter()
    const { user } = useAuth()
    const [researchLoading, setResearchLoading] = useState(false)
    const [researchError, setResearchError] = useState<string | null>(null)
    const [isMobile, setIsMobile] = useState(false)
    useEffect(() => {
        const mq = window.matchMedia('(max-width: 767px)')
        setIsMobile(mq.matches)
        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
        mq.addEventListener('change', handler)
        return () => mq.removeEventListener('change', handler)
    }, [])

    // Hard blockers always surface first; mitigatable nice-to-haves trail them.
    const sortedGaps = gaps ? [...gaps].sort((a, b) => {
        const aHard = a.severity === 'hard_blocker' ? 0 : 1
        const bHard = b.severity === 'hard_blocker' ? 0 : 1
        return aHard - bHard
    }) : null
    const hardCount = sortedGaps?.filter(g => g.severity === 'hard_blocker').length ?? 0
    const niceCount = sortedGaps ? sortedGaps.length - hardCount : 0

    async function handleOptimize() {
        setResearchLoading(true)
        setResearchError(null)
        try {
            // Use the resume the match was scored against — NOT the localStorage
            // "primary" — otherwise picking Vamsi in the selector but having
            // Khasim as primary sends the n8n research under the wrong resume,
            // and the research page (which filters by selected resume) shows nothing.
            const resumeId = match.resume_id ?? getPrimaryResumeId()
            let resumeData = null
            if (resumeId) {
                resumeData = await fetchResumeById(resumeId)
            }
            const result = await triggerCompanyResearch({
                job_id: match.job_id ?? job.id,
                user_id: user?.id ?? '',
                job: job,
                resume: { structured_data: resumeData?.structured_data ?? null },
                resume_id: resumeId ?? undefined,
            })
            if (result.success && result.company_research) {
                sessionStorage.setItem(
                    `company_research_${job.id}`,
                    JSON.stringify({ ...result.company_research, ai_analysis: result.ai_analysis })
                )
                // Pass resumeId so the research page defaults its selector to
                // the same resume the match was scored against.
                const url = resumeId
                    ? `/dashboard/research?jobId=${job.id}&resumeId=${resumeId}`
                    : `/dashboard/research?jobId=${job.id}`
                router.push(url)
            } else {
                setResearchError('Research returned no data. Please try again.')
            }
        } catch (err: any) {
            if (err instanceof CompanyResearchPendingError) {
                // n8n + Firecrawl runs longer than our 60s client budget.
                // The workflow still completes; it writes to `company_research`
                // and `company_research_analysis`. Send the user to the research
                // page so they can pick it up when it lands (page polls the table).
                const resumeId = match.resume_id ?? getPrimaryResumeId()
                // Register the pending job so the global toaster can notify
                // even if the user navigates away from /research before it finishes.
                if (user?.id && job.company) {
                    addPending({
                        jobId: job.id,
                        userId: user.id,
                        companyName: job.company,
                        resumeId: resumeId ?? null,
                    })
                }
                // Pass `company` through the URL so the research page can start
                // polling immediately — without waiting for fetchResearchHistory
                // (which won't return this brand-new job until the analysis row
                // lands). Bug fix May 2026: poll was previously gated on
                // matches.find(...).job.company being defined, which is a chicken
                // -and-egg for brand-new researches.
                const params = new URLSearchParams({ jobId: job.id, pending: '1' })
                if (resumeId) params.set('resumeId', resumeId)
                if (job.company) params.set('company', job.company)
                router.push(`/dashboard/research?${params.toString()}`)
                return
            }
            if (err instanceof RateLimitError) {
                setResearchError(`Slow down — try again in ${err.retryAfterSec}s.`)
            } else {
                setResearchError(err.message || 'Failed to research company')
            }
        } finally {
            setResearchLoading(false)
        }
    }

    return (
        <div key={match.id} style={{ animation: 'detailIn 0.3s ease both', paddingBottom: 64 }}>

            {/* ── JOB HEADER ── */}
            <div style={{
                background: 'white',
                padding: isMobile ? '14px 16px 12px' : '28px 36px 24px',
                borderBottom: '1px solid #f3f4f6',
                position: 'sticky', top: 0, zIndex: 10,
            }}>
                <div style={{ display: 'flex', gap: isMobile ? 10 : 18, alignItems: 'flex-start' }}>
                    <CompanyIcon company={job.company} size={isMobile ? 40 : 56} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h1 style={{
                            fontSize: isMobile ? '1.05rem' : '1.5rem', fontWeight: 800, color: '#111827',
                            letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: 6,
                        }}>{job.title}</h1>
                        <div style={{ display: 'flex', gap: isMobile ? 8 : 16, alignItems: 'center', flexWrap: 'wrap' }}>
                            {job.company && (
                                <span style={{ fontSize: isMobile ? '0.8125rem' : '0.875rem', fontWeight: 600, color: '#135bec' }}>
                                    {job.company}
                                </span>
                            )}
                            {job.location && (
                                <span style={{ fontSize: '0.8125rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                                    {job.location}
                                </span>
                            )}
                            {!isMobile && job.schedule_type && (
                                <span style={{ fontSize: '0.8125rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                                    {job.schedule_type}
                                </span>
                            )}
                            {job.experience_level && (
                                <span style={{
                                    fontSize: '0.75rem', padding: '2px 9px', borderRadius: 20,
                                    background: '#f3f4f6', color: '#6b7280', fontWeight: 600, textTransform: 'capitalize',
                                }}>{job.experience_level}</span>
                            )}
                            {!isMobile && (job.legitimacy_tier === 'verified' || job.legitimacy_tier === 'proceed_with_caution') && (
                                <LegitimacyBadge
                                    tier={job.legitimacy_tier}
                                    signals={job.legitimacy_signals}
                                    size="md"
                                />
                            )}
                        </div>
                        {!isMobile && job.legitimacy_tier === 'suspicious' && (
                            <div style={{ marginTop: 12, maxWidth: 520 }}>
                                <LegitimacyBadge
                                    tier={job.legitimacy_tier}
                                    signals={job.legitimacy_signals}
                                    variant="strip"
                                />
                            </div>
                        )}
                        {match.recommendation && (
                            <div style={{ marginTop: isMobile ? 8 : 14 }}>
                                <RecommendationBadge rec={match.recommendation} size={isMobile ? 'sm' : 'lg'} />
                            </div>
                        )}
                    </div>
                    {/* Action cluster — desktop only (right column) */}
                    {!isMobile && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0, maxWidth: 340 }}>
                        {/* Action buttons */}
                        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                            <button style={{
                                padding: '10px 20px', borderRadius: 8,
                                border: '1.5px solid #e5e7eb', background: 'white',
                                fontSize: '0.875rem', fontWeight: 600, color: '#374151',
                                cursor: 'pointer', fontFamily: "'Manrope', sans-serif",
                            }}>Save</button>
                            {job.source_url && (
                                <Link href={job.source_url} target="_blank" style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    padding: '10px 22px', borderRadius: 8,
                                    background: '#135bec', color: 'white',
                                    fontSize: '0.875rem', fontWeight: 700, textDecoration: 'none',
                                    boxShadow: '0 2px 8px rgba(19,91,236,0.3)',
                                    transition: 'all 0.15s ease',
                                }}
                                    onMouseEnter={e => { e.currentTarget.style.background = '#0f4cc7'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                                    onMouseLeave={e => { e.currentTarget.style.background = '#135bec'; e.currentTarget.style.transform = 'translateY(0)' }}
                                >
                                    Apply Now
                                </Link>
                            )}
                        </div>
                        {/* Crowdsourced status check */}
                        <button
                            type="button"
                            onClick={async () => {
                                if (!match.job_id) return
                                await reportJobStatus(match.job_id, 'closed')
                                onReported?.(match.job_id)
                            }}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                marginTop: 12, padding: 0, border: 'none', background: 'none',
                                color: '#94A3B8', fontSize: '0.78rem', fontWeight: 500,
                                cursor: 'pointer', fontFamily: "'Manrope', sans-serif", transition: 'color 0.15s ease',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.color = '#135bec' }}
                            onMouseLeave={e => { e.currentTarget.style.color = '#94A3B8' }}
                        >
                            <span aria-hidden style={{ fontSize: '0.85rem', lineHeight: 1 }}>⚑</span>
                            <span style={{ textDecoration: 'underline', textUnderlineOffset: 3, textDecorationColor: '#cbd5e1' }}>
                                No longer accepting applications? Tell us
                            </span>
                        </button>
                        <div style={{
                            display: 'flex', alignItems: 'flex-start', gap: 9,
                            marginTop: 0, padding: '11px 14px', borderRadius: 10, width: '100%',
                            background: '#fef2f2', border: '1px solid #fecaca',
                        }}>
                            <span aria-hidden style={{ fontSize: '0.95rem', lineHeight: 1.3, flexShrink: 0 }}>⚠️</span>
                            <p style={{ fontSize: '0.78rem', fontWeight: 700, color: '#b91c1c', margin: 0, lineHeight: 1.45, textAlign: 'left' }}>
                                Click <strong>Apply</strong> to see if the job is open or closed before creating a resume for this company.
                            </p>
                        </div>
                        </div>
                    )}
                </div>

                {/* Mobile action buttons — below the title row, clear chat bubble */}
                {isMobile && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingRight: 64 }}>
                        <button style={{
                            flex: 1, padding: '9px 12px', borderRadius: 8,
                            border: '1.5px solid #e5e7eb', background: 'white',
                            fontSize: '0.875rem', fontWeight: 600, color: '#374151',
                            cursor: 'pointer', fontFamily: "'Manrope', sans-serif",
                        }}>Save</button>
                        {job.source_url ? (
                            <Link href={job.source_url} target="_blank" style={{
                                flex: 2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                padding: '9px 16px', borderRadius: 8,
                                background: '#135bec', color: 'white',
                                fontSize: '0.875rem', fontWeight: 700, textDecoration: 'none',
                                boxShadow: '0 2px 8px rgba(19,91,236,0.3)',
                            }}>
                                Apply Now
                            </Link>
                        ) : (
                            <div style={{ flex: 2 }} />
                        )}
                    </div>
                )}
            </div>

            {/* ── BODY ── */}
            <div style={{ padding: isMobile ? '14px 16px' : '28px 36px' }}>

                {/* Score + Skills row */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.8fr', gap: 16, marginBottom: 20 }}>

                    {/* Score card */}
                    <div style={{
                        background: 'white', borderRadius: 14,
                        border: '1px solid #f3f4f6',
                        padding: '24px 20px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                    }}>
                        <ScoreRing score={score} />
                    </div>

                    {/* Skills card */}
                    <div style={{
                        background: 'white', borderRadius: 14,
                        border: '1px solid #f3f4f6',
                        padding: '20px 22px',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#135bec" strokeWidth="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
                                <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827' }}>Skills Analysis</span>
                            </div>
                            <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Compared to your profile</span>
                        </div>

                        {matched.length > 0 && (
                            <div style={{ marginBottom: 14 }}>
                                <p style={{
                                    fontSize: '0.6rem', fontWeight: 800, color: '#15803d',
                                    letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8,
                                }}>
                                    Matched Skills ({matched.length})
                                </p>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {matched.slice(0, 6).map((s, i) => (
                                        <span key={i} style={{
                                            fontSize: '0.75rem', padding: '4px 11px', borderRadius: 20,
                                            background: '#f0fdf4', color: '#15803d',
                                            border: '1px solid #bbf7d0', fontWeight: 500,
                                        }}>{s}</span>
                                    ))}
                                    {matched.length > 6 && (
                                        <span style={{
                                            fontSize: '0.75rem', padding: '4px 11px', borderRadius: 20,
                                            background: '#f3f4f6', color: '#6b7280', fontWeight: 500,
                                        }}>+{matched.length - 6} more</span>
                                    )}
                                </div>
                            </div>
                        )}

                        {sortedGaps && sortedGaps.length > 0 ? (
                            <div>
                                <div style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    marginBottom: 10, gap: 10, flexWrap: 'wrap',
                                }}>
                                    <p style={{
                                        fontSize: '0.6rem', fontWeight: 800, color: '#c2410c',
                                        letterSpacing: '0.08em', textTransform: 'uppercase',
                                    }}>
                                        What's Missing — and how to close it ({sortedGaps.length})
                                    </p>
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                        {hardCount > 0 && (
                                            <span style={{
                                                fontSize: '0.625rem', fontWeight: 700, padding: '2px 8px',
                                                borderRadius: 9999, background: '#fef2f2', color: '#b91c1c',
                                                border: '1px solid #fecaca', letterSpacing: '0.02em',
                                            }}>
                                                {hardCount} blocker{hardCount > 1 ? 's' : ''}
                                            </span>
                                        )}
                                        {niceCount > 0 && (
                                            <span style={{
                                                fontSize: '0.625rem', fontWeight: 700, padding: '2px 8px',
                                                borderRadius: 9999, background: '#fff7ed', color: '#c2410c',
                                                border: '1px solid #fed7aa', letterSpacing: '0.02em',
                                            }}>
                                                {niceCount} nice-to-have{niceCount > 1 ? 's' : ''}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                                    {(sortedGaps ?? []).map((g, i) => {
                                        const isHard = g.severity === 'hard_blocker'
                                        const bg = isHard ? '#fef2f2' : '#fff7ed'
                                        const color = isHard ? '#b91c1c' : '#c2410c'
                                        const border = isHard ? '#fecaca' : '#fed7aa'
                                        return (
                                            <span
                                                key={`${g.skill}-${i}`}
                                                title={isHard ? 'Hard blocker' : 'Nice to have'}
                                                style={{
                                                    fontSize: '0.75rem', padding: '4px 11px', borderRadius: 20,
                                                    background: bg, color, border: `1px solid ${border}`,
                                                    fontWeight: 500,
                                                }}
                                            >
                                                {g.skill}
                                            </span>
                                        )
                                    })}
                                </div>
                                <Link href={`/dashboard/learning?jobId=${match.job_id}`}>
                                    <button style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 6,
                                        padding: '7px 14px', borderRadius: 8,
                                        background: '#fff7ed', color: '#c2410c',
                                        border: '1px solid #fed7aa', cursor: 'pointer',
                                        fontSize: '0.8125rem', fontWeight: 700,
                                    }}>
                                        🗺️ Generate full learning plan →
                                    </button>
                                </Link>
                            </div>
                        ) : missing.length > 0 && (
                            // Legacy flat list when gaps[] isn't available (pre-Block B rows)
                            <div>
                                <p style={{
                                    fontSize: '0.6rem', fontWeight: 800, color: '#c2410c',
                                    letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8,
                                }}>
                                    Missing / Gaps ({missing.length})
                                </p>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                                    {missing.map((s, i) => (
                                        <span key={i} style={{
                                            fontSize: '0.75rem', padding: '4px 11px', borderRadius: 20,
                                            background: '#fff7ed', color: '#c2410c',
                                            border: '1px solid #fed7aa', fontWeight: 500,
                                        }}>{s}</span>
                                    ))}
                                </div>
                                <Link href={`/dashboard/learning?jobId=${match.job_id}`}>
                                    <button style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 6,
                                        padding: '7px 14px', borderRadius: 8,
                                        background: '#fff7ed', color: '#c2410c',
                                        border: '1px solid #fed7aa', cursor: 'pointer',
                                        fontSize: '0.8125rem', fontWeight: 700,
                                    }}>
                                        🗺️ View Learning Path →
                                    </button>
                                </Link>
                            </div>
                        )}
                    </div>
                </div>

                {/* Optimize banner — show for any recommendation that benefits from prep:
                 * optimize_resume (skills present, resume buries them) and
                 * apply_with_prep (1–2 mitigatable hard_blockers) both warrant the
                 * tailoring + research workflow. low_fit deliberately suppresses it. */}
                {((match.recommendation === 'optimize_resume' ||
                   match.recommendation === 'apply_with_prep' ||
                   missing.length > 0) &&
                  match.recommendation !== 'low_fit') && (
                    <div style={{ marginBottom: 28 }}>
                        <div style={{
                            background: 'linear-gradient(135deg, #1d4ed8 0%, #135bec 50%, #2563eb 100%)',
                            borderRadius: 14, padding: isMobile ? '14px 16px' : '18px 24px',
                            display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? 12 : 16,
                            flexWrap: isMobile ? 'wrap' : 'nowrap',
                            boxShadow: '0 4px 16px rgba(19,91,236,0.3)',
                        }}>
                            <div style={{
                                width: 40, height: 40, borderRadius: 10,
                                background: 'rgba(255,255,255,0.15)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            }}>
                                {researchLoading ? (
                                    <div style={{
                                        width: 20, height: 20, border: '2.5px solid rgba(255,255,255,0.3)',
                                        borderTopColor: 'white', borderRadius: '50%',
                                        animation: 'spin 0.8s linear infinite',
                                    }} />
                                ) : (
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                                    </svg>
                                )}
                            </div>
                            <div style={{ flex: 1 }}>
                                <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'white', marginBottom: 2 }}>
                                    {researchLoading ? 'Researching company...' : 'Optimize your resume for this role'}
                                </p>
                                <p style={{ fontSize: '0.775rem', color: 'rgba(255,255,255,0.75)' }}>
                                    {researchLoading
                                        ? `Firecrawl is browsing ${job.company ?? 'the company'}'s website for insights`
                                        : `AI will research ${job.company ?? 'this company'} and help optimize your resume.`}
                                </p>
                            </div>
                            <button
                                onClick={handleOptimize}
                                disabled={researchLoading}
                                style={{
                                    padding: '9px 18px', borderRadius: 8,
                                    background: researchLoading ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.15)',
                                    border: '1.5px solid rgba(255,255,255,0.35)',
                                    color: 'white', fontSize: '0.8125rem', fontWeight: 700,
                                    whiteSpace: 'nowrap', flexShrink: 0,
                                    cursor: researchLoading ? 'not-allowed' : 'pointer',
                                    transition: 'background 0.15s',
                                    fontFamily: "'Manrope', sans-serif",
                                    opacity: researchLoading ? 0.6 : 1,
                                }}
                                onMouseEnter={e => { if (!researchLoading) e.currentTarget.style.background = 'rgba(255,255,255,0.25)' }}
                                onMouseLeave={e => { if (!researchLoading) e.currentTarget.style.background = 'rgba(255,255,255,0.15)' }}
                            >
                                {researchLoading ? 'Researching...' : 'Optimize Now'}
                            </button>
                        </div>
                        {researchError && (
                            <p style={{
                                marginTop: 8, fontSize: '0.8rem', color: '#ef4444',
                                padding: '8px 12px', background: '#fef2f2', borderRadius: 8,
                            }}>
                                {researchError}
                            </p>
                        )}
                    </div>
                )}

                {/* AI Reasoning */}
                {reasoning && (
                    <div style={{
                        marginBottom: 28, background: 'white',
                        borderRadius: 14, border: '1px solid #f3f4f6',
                        padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                    }}>
                        <p style={{
                            fontSize: '0.6rem', fontWeight: 800, color: '#6b7280',
                            letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: 14,
                        }}>AI Analysis</p>
                        <ReasoningBullets text={reasoning} />
                    </div>
                )}

                {/* Job description */}
                {descSections.length > 0 && (
                    <div style={{
                        background: 'white', borderRadius: 14,
                        border: '1px solid #f3f4f6', padding: '24px 28px',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                    }}>
                        {descSections.map((s, i) => {
                            if (s.type === 'heading') return (
                                <h2 key={i} style={{
                                    fontSize: '1rem', fontWeight: 800, color: '#111827',
                                    letterSpacing: '-0.01em', marginTop: i === 0 ? 0 : 24, marginBottom: 12,
                                }}>{s.content}</h2>
                            )
                            if (s.type === 'bullet') return (
                                <div key={i} style={{
                                    display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start',
                                }}>
                                    <span style={{
                                        width: 5, height: 5, borderRadius: '50%',
                                        background: '#135bec', flexShrink: 0, marginTop: 8,
                                    }} />
                                    <p style={{ fontSize: '0.9rem', lineHeight: 1.7, color: '#374151' }}>
                                        {s.content}
                                    </p>
                                </div>
                            )
                            return (
                                <p key={i} style={{
                                    fontSize: '0.9rem', lineHeight: 1.75, color: '#374151', marginBottom: 10,
                                }}>
                                    {s.content}
                                </p>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}

/* ══════════════════════════════════════════════════════
   RESUME SELECTOR
   ─────────────────────────────────────────────────────
   The user has multiple resumes; without filtering, the matches
   list is a jumble of scores across all of them. This selector
   picks one resume at a time. Default is the primary resume; the
   currently active one shows a blue accent bar; primary shows a star.
══════════════════════════════════════════════════════ */

/** Pull the candidate's display name out of either resume parser schema. */
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

/** A short role hint to distinguish resumes at a glance. */
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
        : Array.isArray(parsed.work_experience)
            ? parsed.work_experience
            : []
    if (workArr.length > 0 && typeof workArr[0]?.title === 'string') {
        return workArr[0].title
    }
    // Fallback: first skill cluster name or "Recent graduate"
    const skills = parsed.skills?.technical || parsed.technical_skills
    if (Array.isArray(skills) && skills.length > 0) return `${skills[0]} candidate`
    return 'Recent graduate'
}

/** Small document glyph — keeps things visually anchored to "resume". */
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

function LocationPin({ size = 13, color = '#135bec' }: { size?: number; color?: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
            strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
        </svg>
    )
}

/**
 * Compact location filter dropdown for the matches header. Collapses what could
 * be 20-30 metros into a single button + scrollable panel, instead of a chip row
 * that would overflow. Mirrors ResumeSelector's open/close + panel styling so it
 * feels native to the left rail.
 */
function LocationFilter({
    options,
    value,
    onSelect,
    totalCount,
}: {
    options: { key: string; label: string; count: number }[]
    value: string
    onSelect: (key: string) => void
    totalCount: number
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

    const rows = [{ key: ALL_LOCATION_KEY, label: 'All locations', count: totalCount }, ...options]
    const current = rows.find(r => r.key === value) ?? rows[0]
    const isFiltered = value !== ALL_LOCATION_KEY

    return (
        <div ref={wrapperRef} style={{ position: 'relative', marginTop: 10, display: 'inline-block' }}>
            {/* ── Trigger ── */}
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-haspopup="listbox"
                aria-expanded={open}
                style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    padding: '6px 9px 6px 11px',
                    background: isFiltered ? '#f5f8ff' : 'white',
                    border: `1.5px solid ${open ? '#135bec' : isFiltered ? '#c7d8f8' : '#e5e7eb'}`,
                    borderRadius: 9, cursor: 'pointer',
                    fontFamily: "'Manrope', sans-serif",
                    boxShadow: open ? '0 0 0 3px rgba(19,91,236,0.12)' : 'none',
                    transition: 'border-color 0.15s, box-shadow 0.15s, background 0.15s',
                }}
                onMouseEnter={e => { if (!open && !isFiltered) e.currentTarget.style.borderColor = '#c7d8f8' }}
                onMouseLeave={e => { if (!open && !isFiltered) e.currentTarget.style.borderColor = '#e5e7eb' }}
            >
                <LocationPin color={isFiltered ? '#135bec' : '#6b7280'} />
                <span style={{
                    fontSize: '0.75rem', fontWeight: 700, letterSpacing: '-0.01em',
                    color: isFiltered ? '#135bec' : '#374151',
                    maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                    {current.label}
                </span>
                <span style={{
                    fontSize: '0.66rem', fontWeight: 700, lineHeight: 1.5,
                    color: isFiltered ? '#4f86f0' : '#9ca3af',
                    background: isFiltered ? '#e3edff' : '#f3f4f6',
                    borderRadius: 999, padding: '1px 6px',
                }}>
                    {current.count}
                </span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6b7280"
                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ flexShrink: 0, marginLeft: 1, transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s ease' }}>
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>

            {/* ── Panel ── */}
            {open && (
                <div
                    role="listbox"
                    className="left-scroll"
                    style={{
                        position: 'absolute', top: 'calc(100% + 6px)', left: 0,
                        minWidth: 224,
                        background: 'white', border: '1px solid #e5e7eb', borderRadius: 11,
                        boxShadow: '0 10px 30px rgba(15,23,42,0.10), 0 4px 10px rgba(15,23,42,0.06)',
                        padding: 6, zIndex: 50, animation: 'rsDropIn 0.18s ease-out',
                        maxHeight: 300, overflowY: 'auto',
                    }}
                >
                    {rows.map((r, idx) => {
                        const isSel = r.key === value
                        return (
                            <div key={r.key}>
                                <button
                                    type="button"
                                    role="option"
                                    aria-selected={isSel}
                                    onClick={() => { onSelect(r.key); setOpen(false) }}
                                    style={{
                                        width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                                        padding: '8px 9px', borderRadius: 8, border: 'none', cursor: 'pointer',
                                        background: isSel ? '#eef4ff' : 'transparent',
                                        fontFamily: "'Manrope', sans-serif", textAlign: 'left',
                                        transition: 'background 0.12s',
                                    }}
                                    onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = '#f9fafb' }}
                                    onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent' }}
                                >
                                    <span style={{ display: 'inline-flex', opacity: r.key === ALL_LOCATION_KEY ? 0.5 : 1 }}>
                                        <LocationPin size={12} color={isSel ? '#135bec' : '#9ca3af'} />
                                    </span>
                                    <span style={{
                                        flex: 1, minWidth: 0, fontSize: '0.78rem', fontWeight: 600,
                                        color: isSel ? '#135bec' : '#374151',
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    }}>
                                        {r.label}
                                    </span>
                                    <span style={{ flexShrink: 0, fontSize: '0.68rem', fontWeight: 700, color: isSel ? '#4f86f0' : '#9ca3af' }}>
                                        {r.count}
                                    </span>
                                </button>
                                {/* divider after the "All locations" row */}
                                {idx === 0 && rows.length > 1 && (
                                    <div style={{ height: 1, background: '#f3f4f6', margin: '4px 8px' }} />
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

function ResumeSelector({
    resumes,
    selectedResumeId,
    onSelect,
    matchCountByResume,
    primaryResumeId,
    loading,
}: {
    resumes: Resume[]
    selectedResumeId: string | null
    onSelect: (id: string) => void
    matchCountByResume: Record<string, number>
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
    const totalMatches = Object.values(matchCountByResume).reduce((a, b) => a + b, 0)

    if (loading) {
        return (
            <div style={{
                padding: '12px 14px',
                background: '#f3f4f6',
                borderRadius: 10,
                marginBottom: 14,
                fontSize: '0.75rem',
                color: '#9ca3af',
                fontWeight: 500,
            }}>
                Loading resumes…
            </div>
        )
    }

    if (resumes.length === 0) {
        return (
            <Link href="/dashboard/upload" style={{
                display: 'block',
                padding: '12px 14px',
                background: '#f9fafb',
                border: '1px dashed #d1d5db',
                borderRadius: 10,
                marginBottom: 14,
                fontSize: '0.78rem',
                color: '#6b7280',
                textDecoration: 'none',
                fontWeight: 500,
                textAlign: 'center',
            }}>
                Upload a resume to start scoring →
            </Link>
        )
    }

    return (
        <div ref={wrapperRef} style={{ position: 'relative', marginBottom: 14 }}>
            {/* ── Trigger card ── */}
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-haspopup="listbox"
                aria-expanded={open}
                style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 11,
                    padding: '11px 12px 11px 14px',
                    background: 'white',
                    border: open ? '1.5px solid #135bec' : '1.5px solid #e5e7eb',
                    borderRadius: 11,
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: "'Manrope', sans-serif",
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                    boxShadow: open
                        ? '0 0 0 3px rgba(19,91,236,0.12), 0 1px 3px rgba(0,0,0,0.04)'
                        : '0 1px 3px rgba(0,0,0,0.04)',
                    position: 'relative',
                    overflow: 'hidden',
                }}
                onMouseEnter={e => { if (!open) e.currentTarget.style.borderColor = '#c7d8f8' }}
                onMouseLeave={e => { if (!open) e.currentTarget.style.borderColor = '#e5e7eb' }}
            >
                {/* Blue accent bar */}
                <span style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: 3, background: '#135bec',
                }} />
                <div style={{
                    flexShrink: 0,
                    width: 34, height: 34, borderRadius: 9,
                    background: 'linear-gradient(135deg, #eef4ff 0%, #dbe7ff 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <DocIcon size={17} color="#135bec" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                        fontSize: '0.6125rem', fontWeight: 700, color: '#9ca3af',
                        letterSpacing: '0.08em', textTransform: 'uppercase',
                        marginBottom: 2,
                    }}>
                        Showing matches for
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                            fontSize: '0.875rem', fontWeight: 700, color: '#111827',
                            letterSpacing: '-0.01em',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            maxWidth: 180,
                        }}>
                            {selected ? resumeDisplayName(selected) : 'Select a resume'}
                        </span>
                        {selected && primaryResumeId === selected.id && <StarBadge />}
                    </div>
                </div>
                <svg
                    width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="#6b7280" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{
                        flexShrink: 0,
                        transform: open ? 'rotate(180deg)' : 'rotate(0)',
                        transition: 'transform 0.2s ease',
                    }}
                >
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>

            {/* ── Dropdown panel ── */}
            {open && (
                <div
                    role="listbox"
                    style={{
                        position: 'absolute',
                        top: 'calc(100% + 6px)',
                        left: 0, right: 0,
                        background: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: 11,
                        boxShadow: '0 10px 30px rgba(15,23,42,0.10), 0 4px 10px rgba(15,23,42,0.06)',
                        padding: 6,
                        zIndex: 50,
                        animation: 'rsDropIn 0.18s ease-out',
                        maxHeight: 320,
                        overflowY: 'auto',
                    }}
                >
                    {resumes.map(r => {
                        const isSelected = r.id === selectedResumeId
                        const isPrimary = r.id === primaryResumeId
                        const count = matchCountByResume[r.id] ?? 0
                        return (
                            <button
                                key={r.id}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                onClick={() => { onSelect(r.id); setOpen(false) }}
                                style={{
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    padding: '10px 10px',
                                    background: isSelected ? '#eef4ff' : 'transparent',
                                    border: 'none',
                                    borderRadius: 8,
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    fontFamily: "'Manrope', sans-serif",
                                    transition: 'background 0.12s',
                                    position: 'relative',
                                }}
                                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#f9fafb' }}
                                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                            >
                                <div style={{
                                    flexShrink: 0,
                                    width: 28, height: 28, borderRadius: 7,
                                    background: isSelected ? '#dbe7ff' : '#f3f4f6',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <DocIcon size={14} color={isSelected ? '#135bec' : '#6b7280'} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                        <span style={{
                                            fontSize: '0.83rem',
                                            fontWeight: isSelected ? 700 : 600,
                                            color: isSelected ? '#0f172a' : '#1f2937',
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                            letterSpacing: '-0.005em',
                                        }}>
                                            {resumeDisplayName(r)}
                                        </span>
                                        {isPrimary && <StarBadge />}
                                    </div>
                                    <div style={{
                                        fontSize: '0.71rem',
                                        color: '#9ca3af',
                                        marginTop: 1,
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    }}>
                                        {resumeRoleLabel(r)}
                                    </div>
                                </div>
                                <span style={{
                                    flexShrink: 0,
                                    fontSize: '0.68rem', fontWeight: 700,
                                    padding: '3px 8px', borderRadius: 999,
                                    background: count > 0 ? (isSelected ? '#135bec' : '#f3f4f6') : 'transparent',
                                    color: count > 0 ? (isSelected ? 'white' : '#6b7280') : '#d1d5db',
                                    minWidth: 22, textAlign: 'center',
                                    letterSpacing: '0.02em',
                                }}>
                                    {count}
                                </span>
                            </button>
                        )
                    })}

                    {/* Footer hint */}
                    {totalMatches === 0 && (
                        <div style={{
                            padding: '10px 12px 4px',
                            fontSize: '0.7rem',
                            color: '#9ca3af',
                            textAlign: 'center',
                            borderTop: '1px solid #f3f4f6',
                            marginTop: 4,
                        }}>
                            No scored jobs yet. Search & click <span style={{ fontWeight: 700, color: '#374151' }}>Find Best Jobs</span>.
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

/* ══════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════ */
type FilterType = 'all' | 'high' | 'medium' | 'low'

export default function MatchesPage() {
    const { user } = useAuth()
    const searchParams = useSearchParams()
    const requestedJobId = searchParams?.get('jobId') ?? null
    const [matches, setMatches] = useState<FullMatch[]>([])
    const [loading, setLoading] = useState(true)
    const [selected, setSelected] = useState<FullMatch | null>(null)
    const [filter, setFilter] = useState<FilterType>('all')
    // Location facet — lets the user narrow a resume's accumulated matches to a
    // single metro (Bangalore vs Hyderabad vs …) since matches pile up across
    // every search. Keyed by metro bucket; 'all' shows everything.
    const [locationFilter, setLocationFilter] = useState<string>(ALL_LOCATION_KEY)
    // Jobs the user just flagged "no longer accepting" — hidden instantly for
    // this user (the DB flip via report_job_status protects everyone else).
    const [reportedClosed, setReportedClosed] = useState<Set<string>>(new Set())
    // True while a scoring run is still queued/running for this user. Drives the
    // "scoring in progress" banner and the polling backstop below so the user
    // who just got redirected here from "Find Best Matches" sees activity
    // instead of a blank list.
    const [scoringInFlight, setScoringInFlight] = useState(false)

    // Resume selector — pinned at the top of the left panel. Filters the
    // matches list to a single resume so scores stop being a jumble across
    // every resume the user has uploaded.
    const [resumes, setResumes] = useState<Resume[]>([])
    const [resumesLoading, setResumesLoading] = useState(true)
    const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null)
    const [primaryResumeId, setPrimaryResumeId] = useState<string | null>(null)

    // Refs so we can scroll the requested job into view in the left rail.
    const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())
    const honoredJobIdRef = useRef<string | null>(null)

    const reload = async (userId: string) => {
        const data = await fetchMatches(userId)
        const sorted = [...data].sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0))
        setMatches(sorted)
        setSelected(prev => {
            if (prev) return prev
            // If the URL asked for a specific job, prefer that one.
            if (requestedJobId) {
                const target = sorted.find(m => m.job_id === requestedJobId || m.job?.id === requestedJobId)
                if (target) return target
            }
            return sorted[0] ?? null
        })
    }

    useEffect(() => {
        if (!user) return
        reload(user.id)
            .catch(() => setMatches([]))
            .finally(() => setLoading(false))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user])

    // Load the user's resumes for the selector, default to primary
    useEffect(() => {
        if (!user) return
        setResumesLoading(true)
        const primary = getPrimaryResumeId()
        setPrimaryResumeId(primary)
        fetchResumes(user.id)
            .then((rs) => {
                setResumes(rs)
                // Default selection: primary if it exists in this user's resumes,
                // else first resume, else null.
                setSelectedResumeId(prev => {
                    if (prev && rs.some(r => r.id === prev)) return prev
                    if (primary && rs.some(r => r.id === primary)) return primary
                    return rs[0]?.id ?? null
                })
            })
            .catch(() => setResumes([]))
            .finally(() => setResumesLoading(false))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user])

    // When the URL jobId changes (deep-link from chat / other pages), select
    // that match and scroll its card into view. Honor each unique id only once
    // so manual selection isn't overridden on every render.
    useEffect(() => {
        if (!requestedJobId || matches.length === 0) return
        if (honoredJobIdRef.current === requestedJobId) return
        const target = matches.find(m => m.job_id === requestedJobId || m.job?.id === requestedJobId)
        if (!target) return
        honoredJobIdRef.current = requestedJobId
        setSelected(target)
        // Defer scroll until card is rendered with selected styling.
        setTimeout(() => {
            const card = cardRefs.current.get(target.job_id ?? target.job?.id ?? '')
            card?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 60)
    }, [requestedJobId, matches])

    // Phase 8 — auto-refresh when a scoring queue job completes for this user.
    // Subscribes via Supabase Realtime; if Realtime drops, the user can still
    // manually navigate away and back to refetch. New rows in user_job_matches
    // also trigger a reload so partial scoring runs surface progressively.
    useEffect(() => {
        if (!user) return
        const sb = createBrowserClient()
        const channel = sb
            .channel(`matches-page-${user.id}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'job_queue', filter: `user_id=eq.${user.id}` },
                (payload) => {
                    const row = payload.new as { workflow_type?: string; status?: string }
                    if (row.workflow_type === 'score' && (row.status === 'done' || row.status === 'completed')) {
                        reload(user.id).catch(() => { /* swallow — UI still has prior data */ })
                    }
                }
            )
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'user_job_matches', filter: `user_id=eq.${user.id}` },
                () => {
                    reload(user.id).catch(() => { /* ignore */ })
                }
            )
            .subscribe()
        return () => { sb.removeChannel(channel) }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user])

    // Polling backstop for the Realtime subscription above. Scoring is async
    // (n8n queue processor) and can take minutes; the optimistic redirect from
    // search lands the user here before any match exists. Realtime is the
    // primary refresh, but events can be dropped (network, tab throttling, a
    // missed reconnect). So while a score job is in flight we poll fetchMatches
    // every 8s and re-check the queue. Polling self-terminates the moment the
    // queue has no active score jobs, and is hard-capped at 6 minutes so a
    // stuck/failed run can never leave us polling forever.
    useEffect(() => {
        if (!user) return
        let cancelled = false
        let timer: ReturnType<typeof setTimeout> | undefined
        const deadline = Date.now() + 6 * 60 * 1000

        const tick = async () => {
            if (cancelled) return
            let active = 0
            try {
                active = await countActiveScoreJobs(user.id)
            } catch {
                // Transient query failure — treat as "unknown", try once more
                // next tick rather than tearing down the whole backstop.
                active = scoringInFlight ? 1 : 0
            }
            if (cancelled) return
            setScoringInFlight(active > 0)
            if (active > 0) {
                await reload(user.id).catch(() => { /* keep prior data */ })
                if (cancelled) return
                if (Date.now() < deadline) {
                    timer = setTimeout(tick, 8000)
                } else {
                    setScoringInFlight(false)
                }
            }
        }

        // Kick off immediately so a freshly-redirected user gets a status read
        // without waiting a full interval.
        void tick()
        return () => { cancelled = true; if (timer) clearTimeout(timer) }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user])

    // Resume-scoped view: when a resume is selected, only show its matches.
    // The counts in the score-tier tabs (High/Medium/Low) also reflect just
    // this resume's slice so the numbers always tell the truth.
    const resumeScoped = selectedResumeId
        ? matches.filter(m => m.resume_id === selectedResumeId)
        : matches

    // Faceted filtering: resume → HIDE CLOSED → location → score-tier. Closed/
    // expired (and just-reported) jobs are dropped FIRST, so the location chips,
    // the All/High/Medium/Low counts, and the visible list all agree and never
    // include a dead listing.
    const openResumeScoped = dedupeMatchesByRole(
        resumeScoped.filter(m => !isJobClosed(m.job) && !reportedClosed.has(m.job_id ?? ''))
    )
    const locationOptions = locationFacets(openResumeScoped)
    const locationScoped = openResumeScoped.filter(m => matchInLocation(m, locationFilter))

    const filtered = locationScoped.filter(m => {
        const s = m.relevance_score ?? 0
        if (filter === 'high') return s >= 80
        if (filter === 'medium') return s >= 60 && s < 80
        if (filter === 'low') return s < 60
        return true
    })

    const highFit = locationScoped.filter(m => (m.relevance_score ?? 0) >= 80).length
    const medFit  = locationScoped.filter(m => { const s = m.relevance_score ?? 0; return s >= 60 && s < 80 }).length
    const lowFit  = locationScoped.filter(m => (m.relevance_score ?? 0) < 60).length

    // Pre-compute match counts per resume_id for the selector dropdown so
    // each row can show how many scored jobs that resume has.
    const matchCountByResume = matches.reduce<Record<string, number>>((acc, m) => {
        if (m.resume_id) acc[m.resume_id] = (acc[m.resume_id] ?? 0) + 1
        return acc
    }, {})

    // When the user switches resume, drop a stale right-pane selection that
    // belongs to a different resume — then default to the new top match.
    useEffect(() => {
        if (!selectedResumeId) return
        setSelected(prev => {
            if (prev && prev.resume_id === selectedResumeId) return prev
            // Recompute the scoped top from the latest `matches` rather than the
            // `resumeScoped` closure: on first load `reload()` defaults `selected`
            // to the GLOBAL top match (which may belong to another resume), and
            // this effect must re-run once matches arrive to correct it. Hence
            // `matches` is in the dep array — without it the detail panel kept
            // showing a different resume's top job.
            const scoped = matches.filter(m => m.resume_id === selectedResumeId)
            return scoped[0] ?? null
        })
    }, [selectedResumeId, matches])

    // Reset the location facet when switching resumes — a different resume may
    // not have any matches in the previously-selected metro.
    useEffect(() => {
        setLocationFilter(ALL_LOCATION_KEY)
    }, [selectedResumeId])

    const FILTERS: { key: FilterType; label: string; count: number }[] = [
        { key: 'all',    label: 'All',    count: locationScoped.length },
        { key: 'high',   label: 'High',   count: highFit },
        { key: 'medium', label: 'Medium', count: medFit },
        { key: 'low',    label: 'Low',    count: lowFit },
    ]

    const [isMobile, setIsMobile] = useState(false)
    const [mobileSheetOpen, setMobileSheetOpen] = useState(false)
    useEffect(() => {
        const mq = window.matchMedia('(max-width: 767px)')
        setIsMobile(mq.matches)
        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
        mq.addEventListener('change', handler)
        return () => mq.removeEventListener('change', handler)
    }, [])

    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');
                .matches-root * { font-family: 'Manrope', -apple-system, sans-serif; }
                @keyframes cardIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                @keyframes detailIn {
                    from { opacity: 0; transform: translateY(6px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to   { transform: rotate(360deg); }
                }
                @keyframes rsDropIn {
                    from { opacity: 0; transform: translateY(-4px) scale(0.99); }
                    to   { opacity: 1; transform: translateY(0) scale(1); }
                }
                .left-scroll::-webkit-scrollbar { width: 4px; }
                .left-scroll::-webkit-scrollbar-track { background: transparent; }
                .left-scroll::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 2px; }
                .right-scroll::-webkit-scrollbar { width: 5px; }
                .right-scroll::-webkit-scrollbar-track { background: transparent; }
                .right-scroll::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 3px; }
                .right-scroll::-webkit-scrollbar-thumb:hover { background: #d1d5db; }
                .filter-tab { padding: 6px 14px; border-radius: 8px; border: none; cursor: pointer; font-size: 0.75rem; font-weight: 600; transition: all 0.15s; font-family: 'Manrope', sans-serif; }
                .filter-tab.active { background: #135bec; color: white; box-shadow: 0 2px 6px rgba(19,91,236,0.3); }
                .filter-tab:not(.active) { background: #f3f4f6; color: #6b7280; }
                .filter-tab:not(.active):hover { background: #e5e7eb; color: #374151; }
            `}</style>

            <div className="matches-root" style={{
                display: 'flex',
                height: 'calc(100vh - 64px)',
                overflow: 'hidden',
                fontFamily: "'Manrope', -apple-system, sans-serif",
            }}>

                {/* ════════ LEFT PANEL ════════ */}
                <div style={{
                    width: isMobile ? '100%' : 360,
                    flexShrink: 0,
                    background: '#f9fafb',
                    borderRight: isMobile ? 'none' : '1px solid #e5e7eb',
                    display: 'flex',
                    flexDirection: 'column',
                }}>
                    {/* Header */}
                    <div style={{
                        padding: '18px 20px 14px',
                        background: 'white',
                        borderBottom: '1px solid #f3f4f6',
                        flexShrink: 0,
                    }}>
                        {/* Resume selector — pinned at the top so the user always
                            knows whose matches they're looking at. */}
                        <ResumeSelector
                            resumes={resumes}
                            selectedResumeId={selectedResumeId}
                            onSelect={setSelectedResumeId}
                            matchCountByResume={matchCountByResume}
                            primaryResumeId={primaryResumeId}
                            loading={resumesLoading}
                        />

                        {/* Scoring-in-progress banner — shown while the queue still
                            has an active score job. Reassures the user redirected
                            here mid-run that results are on the way (the list below
                            fills in progressively as matches land). */}
                        {scoringInFlight && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 9,
                                padding: '9px 12px', marginBottom: 12, borderRadius: 9,
                                background: '#eff6ff', border: '1px solid #bfdbfe',
                            }}>
                                <div style={{
                                    width: 15, height: 15, flexShrink: 0,
                                    border: '2px solid #bfdbfe', borderTopColor: '#135bec',
                                    borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                                }} />
                                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1e40af', lineHeight: 1.4 }}>
                                    Scoring your matches… results appear here automatically as they’re ready.
                                </span>
                            </div>
                        )}

                        {/* Count + filters button row */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                            <span style={{
                                fontSize: '0.6875rem', fontWeight: 800, color: '#6b7280',
                                letterSpacing: '0.06em', textTransform: 'uppercase',
                            }}>
                                {loading ? '—' : filtered.length} Jobs Found
                            </span>
                            <button style={{
                                display: 'flex', alignItems: 'center', gap: 5,
                                padding: '5px 12px', borderRadius: 7,
                                border: '1.5px solid #e5e7eb', background: 'white',
                                fontSize: '0.75rem', fontWeight: 600, color: '#374151',
                                cursor: 'pointer', fontFamily: "'Manrope', sans-serif",
                            }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/>
                                </svg>
                                Filters
                            </button>
                        </div>

                        {/* Filter tabs */}
                        <div style={{ display: 'flex', gap: 6 }}>
                            {FILTERS.map(f => (
                                <button
                                    key={f.key}
                                    onClick={() => setFilter(f.key)}
                                    className={`filter-tab ${filter === f.key ? 'active' : ''}`}
                                >
                                    {f.label} {f.count}
                                </button>
                            ))}
                        </div>

                        {/* Location facet — a compact dropdown so the filter header stays
                            tight even when a resume's matches span many metros. Only shown
                            once there's more than one location to choose between. */}
                        {locationOptions.length >= 2 && (
                            <LocationFilter
                                options={locationOptions}
                                value={locationFilter}
                                onSelect={setLocationFilter}
                                totalCount={openResumeScoped.length}
                            />
                        )}
                    </div>

                    {/* Job list */}
                    <div className="left-scroll" style={{ flex: 1, overflowY: 'auto', paddingTop: 10 }}>
                        {loading ? (
                            <div style={{ padding: '60px 20px', textAlign: 'center' }}>
                                <div style={{
                                    width: 32, height: 32, border: '3px solid #f3f4f6',
                                    borderTopColor: '#135bec', borderRadius: '50%',
                                    animation: 'spin 0.8s linear infinite', margin: '0 auto 14px',
                                }} />
                                <p style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Loading matches…</p>
                            </div>
                        ) : filtered.length === 0 ? (
                            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                                {resumeScoped.length === 0 && selectedResumeId ? (
                                    <>
                                        <p style={{ color: '#374151', fontSize: '0.875rem', fontWeight: 600, marginBottom: 4 }}>
                                            No scored jobs for this resume yet
                                        </p>
                                        <p style={{ color: '#9ca3af', fontSize: '0.78rem', lineHeight: 1.5 }}>
                                            Head to <Link href="/dashboard/search" style={{ color: '#135bec', fontWeight: 600, textDecoration: 'none' }}>Search</Link> and run <span style={{ fontWeight: 600, color: '#374151' }}>Find Best Jobs</span> to score this resume.
                                        </p>
                                    </>
                                ) : (
                                    <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>No matches in this category</p>
                                )}
                            </div>
                        ) : filtered.map((match, i) => {
                            const refKey = match.job_id ?? match.job?.id ?? match.id
                            return (
                                <div
                                    key={match.id}
                                    ref={(el) => {
                                        if (el) cardRefs.current.set(refKey, el)
                                        else cardRefs.current.delete(refKey)
                                    }}
                                >
                                    <JobCard
                                        match={match}
                                        selected={selected?.id === match.id}
                                        onClick={() => { setSelected(match); if (isMobile) setMobileSheetOpen(true) }}
                                        idx={i}
                                    />
                                </div>
                            )
                        })}
                        <div style={{ height: 16 }} />
                    </div>
                </div>

                {/* ════════ RIGHT PANEL ════════ — hidden on mobile */}
                {!isMobile && <div className="right-scroll" style={{
                    flex: 1,
                    background: '#f7f8fa',
                    overflowY: 'auto',
                    minWidth: 0,
                }}>
                    {loading ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                            <div style={{
                                width: 40, height: 40, border: '3px solid #f3f4f6',
                                borderTopColor: '#135bec', borderRadius: '50%',
                                animation: 'spin 0.8s linear infinite',
                            }} />
                        </div>
                    ) : !selected ? (
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            height: '100%', flexDirection: 'column', gap: 16,
                        }}>
                            <div style={{
                                width: 72, height: 72, borderRadius: 18,
                                background: 'white', border: '1.5px solid #e5e7eb',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '2rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                            }}>🎯</div>
                            <div style={{ textAlign: 'center' }}>
                                <p style={{ fontWeight: 800, color: '#111827', marginBottom: 6, fontSize: '1.125rem' }}>
                                    No matches yet
                                </p>
                                <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: 24, maxWidth: 360, lineHeight: 1.65 }}>
                                    Upload your resume, search for jobs, then click <strong>Find Best Jobs</strong> to get AI-scored matches.
                                </p>
                                <Link href="/dashboard/search" style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    padding: '11px 24px', borderRadius: 9,
                                    background: '#135bec', color: 'white',
                                    fontWeight: 700, fontSize: '0.875rem', textDecoration: 'none',
                                    boxShadow: '0 2px 8px rgba(19,91,236,0.3)',
                                }}>
                                    Go to Job Search →
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <JobDetail
                            key={selected.id}
                            match={selected}
                            onReported={(jobId) => {
                                setReportedClosed(prev => new Set(prev).add(jobId))
                                setSelected(filtered.find(m => m.job_id !== jobId) ?? null)
                            }}
                        />
                    )}
                </div>}

            </div>

            {/* ── Mobile Bottom Sheet: Match Detail ── */}
            {isMobile && mobileSheetOpen && selected && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
                    <div onClick={() => setMobileSheetOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#f7f8fa', borderRadius: '20px 20px 0 0', maxHeight: '90vh', overflowY: 'auto', paddingBottom: 32 }}>
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 20px 0' }}>
                            <div style={{ width: 36, height: 4, borderRadius: 2, background: '#e5e7eb' }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 16px 0' }}>
                            <button onClick={() => setMobileSheetOpen(false)} style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>Close</button>
                        </div>
                        <JobDetail
                            key={selected.id}
                            match={selected}
                            onReported={(jobId) => {
                                setReportedClosed(prev => new Set(prev).add(jobId))
                                setSelected(filtered.find(m => m.job_id !== jobId) ?? null)
                                setMobileSheetOpen(false)
                            }}
                        />
                    </div>
                </div>
            )}
        </>
    )
}
