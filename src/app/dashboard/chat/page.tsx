'use client'

import { useState, useRef, useEffect, useCallback, useMemo, createContext, useContext } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown, { type Components as MarkdownComponents } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAuth } from '@/components/providers/AuthProvider'
import { fetchResumes, setPrimaryResumeId, getPrimaryResumeId } from '@/lib/api'
import type { Resume } from '@/lib/types'
import type { ChatMessage, ChatToolCall } from '@/lib/chat/types'

/* ── inline icons (Tabler-style line, currentColor) ─────────────── */
const I = {
    Plus: (p: React.SVGProps<SVGSVGElement>) => (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 5v14M5 12h14" /></svg>
    ),
    Mic: (p: React.SVGProps<SVGSVGElement>) => (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
    ),
    Wave: (p: React.SVGProps<SVGSVGElement>) => (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 12c2 0 2-6 4-6s2 12 4 12 2-12 4-12 2 6 4 6 2 0 2 0" /></svg>
    ),
    Send: (p: React.SVGProps<SVGSVGElement>) => (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 19V5M5 12l7-7 7 7" /></svg>
    ),
    Sparkles: (p: React.SVGProps<SVGSVGElement>) => (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /></svg>
    ),
    Brief: (p: React.SVGProps<SVGSVGElement>) => (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
    ),
    Bolt: (p: React.SVGProps<SVGSVGElement>) => (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M13 3 4 14h7l-1 7 9-12h-7z" /></svg>
    ),
    Map: (p: React.SVGProps<SVGSVGElement>) => (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="2.5" /></svg>
    ),
    Search: (p: React.SVGProps<SVGSVGElement>) => (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
    ),
    Copy: (p: React.SVGProps<SVGSVGElement>) => (
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
    ),
    Refresh: (p: React.SVGProps<SVGSVGElement>) => (
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></svg>
    ),
    Thumb: (p: React.SVGProps<SVGSVGElement>) => (
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M7 11V21H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zM7 11l4-9a3 3 0 0 1 3 3v4h6a2 2 0 0 1 2 2.3l-1.4 7A2 2 0 0 1 18.6 21H7" /></svg>
    ),
    Edit: (p: React.SVGProps<SVGSVGElement>) => (
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
    ),
    File: (p: React.SVGProps<SVGSVGElement>) => (
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
    ),
    Sliders: (p: React.SVGProps<SVGSVGElement>) => (
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 21V14M4 10V3M12 21V12M12 8V3M20 21V16M20 12V3M1 14h6M9 8h6M17 16h6" /></svg>
    ),
    Building: (p: React.SVGProps<SVGSVGElement>) => (
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h6" /></svg>
    ),
    Cash: (p: React.SVGProps<SVGSVGElement>) => (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 1v22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
    ),
    Check: (p: React.SVGProps<SVGSVGElement>) => (
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12.5L9.5 17 19 7" /></svg>
    ),
    Arrow: (p: React.SVGProps<SVGSVGElement>) => (
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
    ),
    Trash: (p: React.SVGProps<SVGSVGElement>) => (
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" /></svg>
    ),
    Pin: (p: React.SVGProps<SVGSVGElement>) => (
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 17v5" /><path d="M9 4h6l1 7-4 3-4-3z" /></svg>
    ),
    Book: (p: React.SVGProps<SVGSVGElement>) => (
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
    ),
    People: (p: React.SVGProps<SVGSVGElement>) => (
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
    ),
    Menu: (p: React.SVGProps<SVGSVGElement>) => (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
    ),
}

/* ── resume display helpers (handles n8n's double-stringified JSON) ─ */
function parseStructured(raw: unknown): Record<string, unknown> | null {
    let v: unknown = raw
    if (!v) return null
    if (typeof v === 'string') { try { v = JSON.parse(v) } catch { return null } }
    if (typeof v === 'string') { try { v = JSON.parse(v) } catch { return null } }
    return (v && typeof v === 'object') ? (v as Record<string, unknown>) : null
}
function resumeDisplayName(r: Resume): string {
    const sd = parseStructured(r.structured_data)
    const pi = (sd?.personal_info as Record<string, string> | undefined) ?? undefined
    const candidate =
        pi?.full_name?.trim() ||
        (typeof sd?.name === 'string' ? (sd.name as string).trim() : '') ||
        r.original_filename?.trim() ||
        ''
    if (candidate && candidate.toLowerCase() !== 'unknown') return candidate
    return `Resume ${r.id.slice(0, 8)}`
}
function resumeSubtitle(r: Resume): string {
    const sd = parseStructured(r.structured_data)
    const pi = (sd?.personal_info as Record<string, string> | undefined) ?? undefined
    const role =
        pi?.title?.trim() ||
        (typeof sd?.professional_title === 'string' ? (sd.professional_title as string).trim() : '') ||
        ''
    const file = r.original_filename?.trim()
    const date = r.created_at ? new Date(r.created_at).toLocaleDateString() : ''
    const parts: string[] = []
    if (role) parts.push(role)
    if (file && file !== resumeDisplayName(r)) parts.push(file)
    if (date) parts.push(`Uploaded ${date}`)
    return parts.join(' · ')
}

/* ── tool name → icon map for inline tool badges ──────────── */
function toolBadgeMeta(name: string): { icon: React.ReactNode; label: string } {
    switch (name) {
        case 'find_matching_jobs': return { icon: <I.Search />, label: 'find_matching_jobs' }
        case 'recommend_skill_to_learn': return { icon: <I.Sliders />, label: 'recommend_skill_to_learn' }
        case 'get_cached_score': return { icon: <I.Cash />, label: 'get_cached_score' }
        case 'get_user_resume': return { icon: <I.File />, label: 'get_user_resume' }
        case 'get_job_scores': return { icon: <I.Brief />, label: 'get_job_scores' }
        case 'get_job_details': return { icon: <I.Brief />, label: 'get_job_details' }
        case 'get_company_research': return { icon: <I.Building />, label: 'get_company_research' }
        case 'get_skill_gaps': return { icon: <I.Bolt />, label: 'get_skill_gaps' }
        case 'search_jobs': return { icon: <I.Search />, label: 'search_jobs' }
        default: return { icon: <I.Sparkles />, label: name }
    }
}

/* ── deterministic company logo gradient ──────────────────── */
const _PALS = [
    ['#0B5CAB', '#063670'], ['#0073BD', '#005689'], ['#E63946', '#B91D2A'],
    ['#10B981', '#047857'], ['#7C3AED', '#5B21B6'], ['#F57C00', '#C2410C'],
    ['#0891B2', '#155E75'], ['#1E40AF', '#1E3A8A'],
]
function logoFor(name: string) {
    let h = 0
    for (const c of name || '?') h = c.charCodeAt(0) + ((h << 5) - h)
    return _PALS[Math.abs(h) % _PALS.length]
}
function CoLogo({ name, size = 32 }: { name: string; size?: number }) {
    const [a, b] = logoFor(name)
    const ini = (name || '?').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase()
    return (
        <div style={{
            width: size, height: size,
            borderRadius: Math.round(size * 0.22),
            background: `linear-gradient(135deg,${a},${b})`,
            color: '#fff',
            display: 'grid', placeItems: 'center',
            fontWeight: 800, fontSize: Math.round(size * 0.36),
            letterSpacing: '-.02em', flexShrink: 0,
            boxShadow: `0 4px 10px -3px ${a}55`,
            fontFamily: 'var(--font-main, Inter, sans-serif)',
        }}>{ini}</div>
    )
}

/* ─────────────────────────────────────────────────────────
   Markdown render overrides — surfaces the language tag on
   fenced code, opens external links in a new tab, and wraps
   tables in an overflow shell so wide tables scroll instead
   of breaking the message column.
   ───────────────────────────────────────────────────────── */
const MARKDOWN_COMPONENTS: MarkdownComponents = {
    code({ className, children, ...props }) {
        // Inline code → className is undefined; fenced code → "language-xxx".
        const m = /language-(\w+)/.exec(className ?? '')
        const lang = m?.[1]
        if (!lang) {
            // Inline — just defer to the .rs-asst-md code styles.
            return <code className={className} {...props}>{children}</code>
        }
        return (
            <code
                className={className}
                data-language={lang}
                {...props}
            >{children}</code>
        )
    },
    a({ href, children, ...props }) {
        const external = href?.startsWith('http')
        return (
            <a
                href={href}
                target={external ? '_blank' : undefined}
                rel={external ? 'noopener noreferrer' : undefined}
                {...props}
            >{children}</a>
        )
    },
    table({ children, ...props }) {
        return (
            <div className="rs-asst-table-wrap" style={{ overflowX: 'auto', maxWidth: '100%' }}>
                <table {...props}>{children}</table>
            </div>
        )
    },
}

/* ── chat history (localStorage-backed) ───────────────────── */
type EnrichedMessage = ChatMessage & { toolCalls?: ChatToolCall[]; streaming?: boolean }

/* Stream events match /api/chat NDJSON protocol. */
type StreamEvent =
    | { type: 'tool_start'; name: string }
    | { type: 'tool_end'; name: string; durationMs: number; result: string }
    | { type: 'text_delta'; delta: string }
    | { type: 'done'; toolCalls?: ChatToolCall[] }
    | { type: 'stopped' }
    | { type: 'error'; error: string }

/* Friendly labels surfaced in the in-progress tool chip. */
const TOOL_LABELS: Record<string, string> = {
    get_user_resume: 'Reading your resume',
    get_job_scores: 'Pulling your scored matches',
    get_job_details: 'Looking up that job',
    get_company_research: 'Checking company research',
    get_skill_gaps: 'Mapping the skill gaps',
    search_jobs: 'Fetching fresh job postings',
    find_matching_jobs: 'Searching matching roles',
    recommend_skill_to_learn: 'Ranking the biggest skill gaps',
    get_cached_score: 'Looking up the cached score',
}
function toolLabel(name: string): string {
    return TOOL_LABELS[name] ?? name.replace(/_/g, ' ')
}
type ChatRecord = {
    id: string
    title: string
    createdAt: number
    updatedAt: number
    sessionResumeId: string | null
    messages: EnrichedMessage[]
}
const HISTORY_KEY = 'rs_chat_history_v1'
const HISTORY_LIMIT = 40

function loadHistory(): ChatRecord[] {
    if (typeof window === 'undefined') return []
    try {
        const raw = localStorage.getItem(HISTORY_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : []
    } catch { return [] }
}
function saveHistory(records: ChatRecord[]) {
    if (typeof window === 'undefined') return
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(records.slice(0, HISTORY_LIMIT)))
    } catch { /* quota / blocked — silently degrade */ }
}
function newChatId(): string {
    return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
function deriveTitle(messages: EnrichedMessage[]): string {
    const first = messages.find(m => m.role === 'user')?.content?.trim() || 'New chat'
    return first.length > 38 ? first.slice(0, 38) + '…' : first
}

const QUICK_ACTIONS = [
    { icon: <I.Brief />, label: 'Find me jobs that fit', prompt: 'Which jobs are my strongest fit right now? Show me the top matches with what each one is pulling.' },
    { icon: <I.Bolt />, label: 'Tailor my resume', prompt: 'How would you tailor my resume for my best match?' },
    { icon: <I.Map />, label: 'Plan my next skill', prompt: 'What skill should I learn next to lift my match rate the most?' },
    { icon: <I.Search />, label: 'Research a company', prompt: 'Tell me about a company I should research before applying.' },
]

/* ─────────────────────────────────────────────────────────
   Atoms
   ───────────────────────────────────────────────────────── */
function Avatar({ size = 30 }: { size?: number }) {
    return (
        <div style={{
            width: size, height: size, borderRadius: '50%',
            display: 'grid', placeItems: 'center', color: '#fff', flexShrink: 0,
            background: 'linear-gradient(135deg,#2563EB,#1E40AF)',
            boxShadow: '0 4px 10px -3px rgba(37,99,235,.45), inset 0 1px 0 rgba(255,255,255,.18)',
        }}>
            <I.Sparkles width={Math.round(size * 0.6)} height={Math.round(size * 0.6)} />
        </div>
    )
}

function BetaPill() {
    return (
        <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '5px 12px 5px 8px',
            background: '#fff', border: '1px solid var(--rs-line)', borderRadius: 99,
            boxShadow: '0 1px 2px rgba(15,23,42,.04), 0 1px 3px rgba(15,23,42,.04)',
        }}>
            <Avatar size={24} />
            <span style={{ fontSize: '.75rem', fontWeight: 600, color: 'var(--rs-ink-2)' }}>JobScorer AI</span>
            <span style={{
                fontSize: '.625rem', fontWeight: 700, letterSpacing: '.06em',
                padding: '2px 6px', borderRadius: 4,
                background: 'var(--rs-blue-50)', color: 'var(--rs-blue-700)',
            }}>BETA</span>
        </div>
    )
}

function ToolBadge({ name, durationMs }: { name: string; durationMs?: number }) {
    const m = toolBadgeMeta(name)
    return (
        <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 9px 4px 8px',
            background: 'var(--rs-blue-50)', border: '1px solid #DBEAFE',
            borderRadius: 99, color: 'var(--rs-blue-700)',
            fontSize: '.6875rem', fontWeight: 600, letterSpacing: '-.005em',
        }}>
            <span style={{ display: 'inline-flex', color: 'var(--rs-blue)' }}>{m.icon}</span>
            <span>{m.label}</span>
            {typeof durationMs === 'number' && (
                <span style={{ color: 'var(--rs-blue)', opacity: .65, fontFamily: 'var(--font-mono)', fontSize: '.625rem' }}>
                    · {(durationMs / 1000).toFixed(1)}s
                </span>
            )}
        </div>
    )
}

function Chip({ children, kind }: { children: React.ReactNode; kind?: 'green' | 'amber' | 'blue' }) {
    const palette = kind === 'green'
        ? { bg: '#DCFCE7', fg: '#15803D', bd: '#86EFAC' }
        : kind === 'amber'
            ? { bg: '#FEF3C7', fg: '#B45309', bd: '#FDE68A' }
            : kind === 'blue'
                ? { bg: 'var(--rs-blue-50)', fg: 'var(--rs-blue-700)', bd: '#C7DBFE' }
                : { bg: 'var(--rs-bg-alt)', fg: 'var(--rs-ink-2)', bd: 'var(--rs-line)' }
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 8px', borderRadius: 6,
            fontSize: '.6875rem', fontWeight: 600,
            background: palette.bg, color: palette.fg, border: `1px solid ${palette.bd}`,
            letterSpacing: '-.005em', whiteSpace: 'nowrap',
        }}>{children}</span>
    )
}

function ScoreBadge({ score }: { score: number }) {
    const hi = score >= 80
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 9px', borderRadius: 7,
            fontSize: '.75rem', fontWeight: 800, letterSpacing: '-.01em',
            fontFamily: 'var(--font-mono)',
            background: hi ? 'var(--rs-blue)' : '#DBEAFE',
            color: hi ? '#fff' : 'var(--rs-blue-700)',
        }}>{score}</span>
    )
}

/* ─────────────────────────────────────────────────────────
   Rich tool result cards
   ───────────────────────────────────────────────────────── */

type JobMatchData = {
    job_id: string
    title: string
    company: string
    location?: string | null
    salary?: string | null
    experience_level?: string | null
    source_url?: string | null
    required_skills?: string[]
    matched_skills?: string[]
    missing_skills?: string[]
    similarity?: number
    score: number
}

/* ── interactivity context: shared toast + saved-jobs state ──── */
const SAVED_JOBS_KEY = 'rs_saved_jobs_v1'

type ChatActions = {
    savedIds: Set<string>
    toggleSave: (jobId: string, jobTitle: string, company: string) => void
    openRole: (job: JobMatchData) => void
    tailorResume: (jobId: string) => void
    viewResearch: (jobId: string) => void
    viewLearning: (jobId: string) => void
    seeOpenRoles: (companyName: string) => void
    fullResearch: (companyName: string) => void
    buildLearningPath: () => void
    /** Submit a follow-up prompt as if the user typed it. */
    sendPrompt: (prompt: string) => void
    toast: (msg: string) => void
}
const ChatActionsCtx = createContext<ChatActions | null>(null)
function useActions(): ChatActions {
    const ctx = useContext(ChatActionsCtx)
    if (!ctx) throw new Error('ChatActionsCtx not provided')
    return ctx
}

function JobMatchExpanded({ job }: { job: JobMatchData }) {
    const A = useActions()
    const isSaved = A.savedIds.has(job.job_id)
    return (
        <div className="rs-jm-card" style={{
            background: '#fff', border: '1px solid var(--rs-line)',
            borderRadius: 12, overflow: 'hidden',
            boxShadow: '0 1px 2px rgba(15,23,42,.04)',
            transition: 'all .18s ease',
        }}>
            <button
                type="button"
                onClick={() => A.openRole(job)}
                aria-label={`Open ${job.title} at ${job.company}`}
                className="rs-jm-head"
                style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: 14, borderBottom: '1px solid var(--rs-line-2)',
                    width: '100%', background: 'transparent', border: 'none',
                    textAlign: 'left', cursor: 'pointer',
                }}>
                <CoLogo name={job.company} size={42} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                        fontSize: '.875rem', fontWeight: 700, letterSpacing: '-.015em',
                        color: 'var(--rs-ink)', marginBottom: 2, lineHeight: 1.2,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{job.title}</div>
                    <div style={{
                        fontSize: '.75rem', color: 'var(--rs-muted)',
                        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                    }}>
                        <span style={{ fontWeight: 600, color: 'var(--rs-ink-2)' }}>{job.company}</span>
                        {job.location && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <I.Map />{job.location}
                            </span>
                        )}
                        {job.salary && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <I.Cash />{job.salary}
                            </span>
                        )}
                    </div>
                </div>
                <ScoreBadge score={job.score} />
            </button>
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(job.matched_skills?.length ?? 0) > 0 && (
                    <div>
                        <div style={{
                            fontSize: '.625rem', fontWeight: 700, letterSpacing: '.08em',
                            textTransform: 'uppercase', color: '#15803D',
                            marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5,
                        }}>
                            <I.Check style={{ color: '#10B981' }} /> Matched · {job.matched_skills!.length}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                            {job.matched_skills!.slice(0, 8).map(s => (
                                <Chip key={s} kind="green">{s}</Chip>
                            ))}
                        </div>
                    </div>
                )}
                {(job.missing_skills?.length ?? 0) > 0 && (
                    <div>
                        <div style={{
                            fontSize: '.625rem', fontWeight: 700, letterSpacing: '.08em',
                            textTransform: 'uppercase', color: '#B45309',
                            marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5,
                        }}>
                            <I.Plus style={{ color: '#F59E0B' }} /> To learn · {job.missing_skills!.length}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                            {job.missing_skills!.slice(0, 8).map(s => (
                                <Chip key={s} kind="amber">{s}</Chip>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            <div style={{
                display: 'flex', gap: 6, padding: '10px 14px 12px',
                borderTop: '1px solid var(--rs-line-2)', background: 'var(--rs-bg-alt)',
            }}>
                <button type="button" className="rs-btn rs-btn-primary"
                    onClick={() => A.openRole(job)}
                    style={{ flex: 1, justifyContent: 'center' }}>
                    <I.Arrow /> View role
                </button>
                <button type="button" className="rs-btn rs-btn-outline"
                    onClick={() => A.toggleSave(job.job_id, job.title, job.company)}
                    style={isSaved ? { background: 'var(--rs-blue-50)', color: 'var(--rs-blue-700)', borderColor: '#C7DBFE' } : undefined}>
                    {isSaved ? <I.Check /> : <I.Pin />}
                    {isSaved ? 'Saved' : 'Save'}
                </button>
                <button type="button" className="rs-btn rs-btn-outline"
                    onClick={() => A.tailorResume(job.job_id)}>
                    <I.Bolt /> Tailor
                </button>
            </div>
        </div>
    )
}

function JobMatchRow({ job }: { job: JobMatchData }) {
    const A = useActions()
    return (
        <button type="button" className="rs-jm-row"
            onClick={() => A.openRole(job)}
            aria-label={`Open ${job.title} at ${job.company}`}
            style={{
                display: 'flex', alignItems: 'center', gap: 11,
                padding: 10, border: '1px solid var(--rs-line)', borderRadius: 10,
                background: '#fff', transition: 'all .15s ease',
                width: '100%', textAlign: 'left', cursor: 'pointer',
                fontFamily: 'inherit',
            }}>
            <CoLogo name={job.company} size={36} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    fontSize: '.8125rem', fontWeight: 700,
                    color: 'var(--rs-ink)', letterSpacing: '-.01em',
                    lineHeight: 1.25, marginBottom: 2,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{job.title}</div>
                <div style={{
                    fontSize: '.75rem', color: 'var(--rs-muted)',
                    display: 'flex', alignItems: 'center', gap: 6,
                }}>
                    <span style={{ fontWeight: 600, color: 'var(--rs-ink-2)' }}>{job.company}</span>
                    {job.location && <span style={{ color: 'var(--rs-muted-2)' }}>·</span>}
                    {job.location && <span>{job.location}</span>}
                </div>
            </div>
            <ScoreBadge score={job.score} />
            <span style={{ color: 'var(--rs-muted-2)' }}><I.Arrow /></span>
        </button>
    )
}

function exportJobsCSV(jobs: JobMatchData[]) {
    const header = ['Title', 'Company', 'Location', 'Salary', 'Score', 'Matched', 'Missing', 'Source']
    const escape = (v: unknown) => {
        const s = v == null ? '' : String(v)
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const rows = jobs.map(j => [
        j.title, j.company, j.location ?? '', j.salary ?? '', j.score,
        (j.matched_skills ?? []).join('; '),
        (j.missing_skills ?? []).join('; '),
        j.source_url ?? '',
    ].map(escape).join(','))
    const csv = [header.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `jobscorer-matches-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function JobMatchesCard({ jobs }: { jobs: JobMatchData[] }) {
    const A = useActions()
    const [showAll, setShowAll] = useState(false)
    if (!jobs.length) return null
    const expanded = jobs.slice(0, 2)
    const rest = jobs.slice(2)
    const compact = showAll ? rest : rest.slice(0, 3)
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {expanded.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: expanded.length === 1 ? '1fr' : '1fr 1fr', gap: 10 }}>
                    {expanded.map(j => <JobMatchExpanded key={j.job_id} job={j} />)}
                </div>
            )}
            {compact.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {compact.map(j => <JobMatchRow key={j.job_id} job={j} />)}
                </div>
            )}
            {jobs.length > 2 && (
                <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    {rest.length > 3 && (
                        <button type="button" className="rs-btn rs-btn-soft" onClick={() => setShowAll(s => !s)}>
                            {showAll ? 'Show fewer' : `See all ${jobs.length} matches`} <I.Arrow />
                        </button>
                    )}
                    <button type="button" className="rs-btn rs-btn-ghost" onClick={() => { exportJobsCSV(jobs); A.toast('CSV downloaded') }}>
                        Export as CSV
                    </button>
                </div>
            )}
        </div>
    )
}

type SkillGap = { skill: string; appears_in: number; out_of: number }

function SkillGapChart({ gaps, sampleSize }: { gaps: SkillGap[]; sampleSize: number }) {
    const [showAll, setShowAll] = useState(false)
    if (!gaps.length) return null
    const max = Math.max(...gaps.map(g => g.appears_in))
    const visible = showAll ? gaps : gaps.slice(0, 5)
    return (
        <div style={{
            background: '#fff', border: '1px solid var(--rs-line)',
            borderRadius: 12, padding: 14,
            boxShadow: '0 1px 2px rgba(15,23,42,.04)',
        }}>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: '.6875rem', fontWeight: 700, letterSpacing: '.08em',
                textTransform: 'uppercase', color: 'var(--rs-muted)',
                marginBottom: 12,
            }}>
                <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: 'var(--rs-blue)',
                    boxShadow: '0 0 0 3px var(--rs-blue-50)',
                }} />
                Top skill gaps · across {sampleSize} matches
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {visible.map((g, i) => {
                    const pct = (g.appears_in / max) * 100
                    const tone = i === 0 ? 'blue' : i < 2 ? 'amber' : 'blue'
                    return (
                        <div key={g.skill}>
                            <div style={{
                                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                                marginBottom: 4,
                            }}>
                                <span style={{
                                    fontSize: '.8125rem', fontWeight: 600,
                                    color: 'var(--rs-ink)', letterSpacing: '-.005em',
                                }}>{g.skill}</span>
                                <span style={{
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: '.6875rem', color: 'var(--rs-muted)', fontWeight: 600,
                                }}>{g.appears_in} of {g.out_of}</span>
                            </div>
                            <div style={{
                                height: 5, background: 'var(--rs-line-2)',
                                borderRadius: 99, overflow: 'hidden',
                            }}>
                                <div style={{
                                    height: '100%',
                                    width: `${pct}%`,
                                    background: tone === 'amber' ? '#F59E0B' : 'var(--rs-blue)',
                                    borderRadius: 99,
                                    transition: 'width .6s cubic-bezier(.16,1,.3,1)',
                                }} />
                            </div>
                        </div>
                    )
                })}
            </div>
            <SkillGapActions
                gaps={gaps}
                showAll={showAll}
                onToggle={() => setShowAll(s => !s)}
            />
        </div>
    )
}

function SkillGapActions({ gaps, showAll, onToggle }: { gaps: SkillGap[]; showAll: boolean; onToggle: () => void }) {
    const A = useActions()
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            marginTop: 12, paddingTop: 12,
            borderTop: '1px solid var(--rs-line-2)',
        }}>
            <button type="button" className="rs-btn rs-btn-primary"
                onClick={A.buildLearningPath}>
                <I.Book /> Build learning path
            </button>
            {gaps.length > 5 && (
                <button type="button" className="rs-btn rs-btn-ghost"
                    onClick={onToggle}>
                    {showAll ? 'Show fewer' : `Show all ${gaps.length}`}
                </button>
            )}
        </div>
    )
}

/* ── Follow-up suggestion chips ─────────────────────────────
   Renders below a tool-result card. Each chip submits a new
   user message via the shared sendPrompt action so the AI can
   continue the conversation without the user typing.
*/
function FollowUpChips({ chips }: { chips: string[] }) {
    const A = useActions()
    if (!chips.length) return null
    return (
        <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 6,
            marginTop: 4,
        }}>
            {chips.map((chip) => (
                <button
                    key={chip}
                    type="button"
                    onClick={() => A.sendPrompt(chip)}
                    className="rs-followup-chip"
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '7px 12px', borderRadius: 99,
                        background: '#fff', border: '1px solid var(--rs-line)',
                        fontSize: '.78rem', fontWeight: 500,
                        color: 'var(--rs-ink-2)', letterSpacing: '-.005em',
                        cursor: 'pointer',
                        boxShadow: '0 1px 2px rgba(15,23,42,.04)',
                        fontFamily: 'inherit',
                    }}
                >
                    <span style={{ color: 'var(--rs-blue)', display: 'inline-flex' }}>
                        <I.Sparkles width={13} height={13} />
                    </span>
                    {chip}
                </button>
            ))}
        </div>
    )
}

/* Build chips for the skill-gap chart from the gaps themselves. */
function buildSkillGapChips(gaps: SkillGap[]): string[] {
    if (!gaps.length) return []
    const top = gaps[0]?.skill
    const second = gaps[1]?.skill
    const out: string[] = []
    if (top && second) out.push(`Build a 4-week ${top} + ${second} plan`)
    else if (top) out.push(`Build a 4-week ${top} plan`)
    out.push('Tailor my resume for my top match')
    out.push('Show me roles where I am already strong')
    return out
}

/* Build chips for a company snapshot using the data in the card. */
function buildCompanyChips(co: CompanyData): string[] {
    const name = co.company_name
    if (!name) return []
    const out: string[] = []
    out.push(`Should I prepare differently for ${name}'s interview?`)
    out.push(`What's my strongest fit role at ${name}?`)
    if (co.industry) out.push(`Research ${name}'s ${co.industry.toLowerCase()} stack`)
    return out
}

/* Build chips for a job-matches card. */
function buildJobMatchChips(jobs: JobMatchData[]): string[] {
    if (!jobs.length) return []
    const top = jobs[0]
    const out: string[] = []
    out.push('What single skill would lift these matches the most?')
    if (top) out.push(`Tailor my resume for ${top.company}`)
    if (top?.company) out.push(`Tell me what ${top.company} is like as a place to work`)
    return out
}

type CompanyData = {
    company_name: string
    industry?: string | null
    size_stage?: string | null
    headquarters?: string | null
    overview?: string | null
    tech_stack?: string[] | string | null
    domain?: string | null
    hiring_signals?: unknown
    resume_tips?: unknown
}

function CompanySnapshotCard({ co }: { co: CompanyData }) {
    const A = useActions()
    let stack: string[] = []
    if (Array.isArray(co.tech_stack)) {
        stack = co.tech_stack.filter(s => typeof s === 'string')
    } else if (typeof co.tech_stack === 'string') {
        stack = co.tech_stack.split(/[,\n]/).map(s => s.trim()).filter(Boolean)
    } else if (co.tech_stack && typeof co.tech_stack === 'object') {
        const obj = co.tech_stack as Record<string, unknown>
        const flat = Object.values(obj).flatMap(v => Array.isArray(v) ? v : typeof v === 'string' ? [v] : [])
        stack = flat.filter(s => typeof s === 'string') as string[]
    }
    return (
        <div style={{
            background: '#fff', border: '1px solid var(--rs-line)',
            borderRadius: 12, padding: 14,
            boxShadow: '0 1px 2px rgba(15,23,42,.04)',
        }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
                <CoLogo name={co.company_name} size={44} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                        fontSize: '.9375rem', fontWeight: 700,
                        color: 'var(--rs-ink)', letterSpacing: '-.015em',
                    }}>{co.company_name}</div>
                    <div style={{
                        fontSize: '.75rem', color: 'var(--rs-muted)',
                        display: 'flex', gap: 10, marginTop: 3, flexWrap: 'wrap',
                        alignItems: 'center',
                    }}>
                        {co.industry && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <I.Building />{co.industry}
                            </span>
                        )}
                        {co.size_stage && (
                            <>
                                <span style={{ color: 'var(--rs-muted-2)' }}>·</span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    <I.People />{co.size_stage}
                                </span>
                            </>
                        )}
                        {co.headquarters && (
                            <>
                                <span style={{ color: 'var(--rs-muted-2)' }}>·</span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    <I.Map />{co.headquarters}
                                </span>
                            </>
                        )}
                    </div>
                </div>
                <Chip kind="green"><I.Check />Hiring</Chip>
            </div>
            {co.overview && (
                <div style={{
                    fontSize: '.8125rem', color: 'var(--rs-ink-2)',
                    lineHeight: 1.55, marginBottom: 12,
                }}>{co.overview}</div>
            )}
            {stack.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                    <div style={{
                        fontSize: '.625rem', fontWeight: 700, letterSpacing: '.08em',
                        textTransform: 'uppercase', color: 'var(--rs-muted)', marginBottom: 6,
                    }}>Tech stack signals</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {stack.slice(0, 14).map(s => <Chip key={s}>{s}</Chip>)}
                    </div>
                </div>
            )}
            <div style={{
                display: 'flex', gap: 6,
                paddingTop: 10, borderTop: '1px solid var(--rs-line-2)',
            }}>
                <button type="button" className="rs-btn rs-btn-primary"
                    onClick={() => A.seeOpenRoles(co.company_name)}>
                    <I.Search />See open roles
                </button>
                <button type="button" className="rs-btn rs-btn-outline"
                    onClick={() => A.fullResearch(co.company_name)}>
                    <I.File />Full research
                </button>
            </div>
        </div>
    )
}

/* Normalize a row from either find_matching_jobs or get_job_scores into JobMatchData. */
function normalizeJobRow(row: Record<string, unknown>): JobMatchData | null {
    if (!row || typeof row !== 'object') return null
    const job_id = row.job_id as string | undefined
    const title = row.title as string | undefined
    const company = row.company as string | undefined
    if (!job_id || !title || !company) return null

    const rawScore =
        typeof row.score === 'number' ? (row.score as number) :
        typeof row.match_score === 'number' ? (row.match_score as number) :
        typeof row.relevance_score === 'number' ? (row.relevance_score as number) :
        null
    const score = rawScore !== null ? Math.max(0, Math.min(100, Math.round(rawScore))) : 0

    return {
        job_id,
        title,
        company,
        location: (row.location as string | null | undefined) ?? null,
        salary: (row.salary as string | null | undefined) ?? null,
        experience_level: (row.experience_level as string | null | undefined) ?? null,
        required_skills: (row.required_skills as string[] | undefined) ?? [],
        matched_skills: (row.matched_skills as string[] | undefined) ?? [],
        missing_skills: (row.missing_skills as string[] | undefined) ?? [],
        similarity: typeof row.similarity === 'number' ? (row.similarity as number) : undefined,
        score,
    }
}

/* ── Render the rich card matching a tool result ─────────── */
function ToolResultCard({ call }: { call: ChatToolCall }) {
    if (!call.result) return null
    let parsed: unknown
    try { parsed = JSON.parse(call.result) } catch { return null }

    // Job lists — both find_matching_jobs (RAG live) and get_job_scores (cached n8n scoring)
    // produce arrays of jobs we can render with the same card. Normalize and render.
    if ((call.name === 'find_matching_jobs' || call.name === 'get_job_scores') && Array.isArray(parsed)) {
        const jobs = (parsed as Record<string, unknown>[])
            .map(normalizeJobRow)
            .filter((j): j is JobMatchData => j !== null)
        if (!jobs.length) return null
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <JobMatchesCard jobs={jobs} />
                <FollowUpChips chips={buildJobMatchChips(jobs)} />
            </div>
        )
    }

    if (call.name === 'recommend_skill_to_learn' && typeof parsed === 'object' && parsed !== null) {
        const obj = parsed as Record<string, unknown>
        const gaps = (obj.gaps as SkillGap[] | undefined) ?? []
        const sampleSize = typeof obj.sample_size === 'number' ? (obj.sample_size as number) : 20
        if (!gaps.length) return null
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <SkillGapChart gaps={gaps} sampleSize={sampleSize} />
                <FollowUpChips chips={buildSkillGapChips(gaps)} />
            </div>
        )
    }

    if (call.name === 'get_company_research' && typeof parsed === 'object' && parsed !== null) {
        const co = parsed as CompanyData
        if (!co.company_name) return null
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <CompanySnapshotCard co={co} />
                <FollowUpChips chips={buildCompanyChips(co)} />
            </div>
        )
    }

    return null
}

/* ─────────────────────────────────────────────────────────
   Composer + bubbles
   ───────────────────────────────────────────────────────── */

function HeroComposer({
    value, onChange, onSend, disabled, dense, isStreaming, onStop,
}: {
    value: string
    onChange: (v: string) => void
    onSend: () => void
    disabled?: boolean
    dense?: boolean
    /** True while the assistant is streaming a response. Replaces Send with Stop. */
    isStreaming?: boolean
    onStop?: () => void
}) {
    const taRef = useRef<HTMLTextAreaElement>(null)
    const expanded = value.split('\n').length > 1 || value.length > 110

    useEffect(() => {
        const ta = taRef.current
        if (!ta) return
        ta.style.height = 'auto'
        ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`
    }, [value])

    return (
        <div
            className="rs-composer"
            style={{
                width: '100%',
                maxWidth: dense ? 880 : 720,
                margin: '0 auto',
                background: '#fff',
                border: '1px solid var(--rs-line)',
                borderRadius: 24,
                boxShadow: '0 12px 36px -12px rgba(15,23,42,.10), 0 2px 6px -2px rgba(15,23,42,.05)',
                padding: 10,
                display: 'grid',
                transition: 'all .2s ease',
                gridTemplateColumns: expanded ? '1fr' : 'auto 1fr auto',
                gridTemplateRows: expanded ? 'auto auto' : 'auto',
                gridTemplateAreas: expanded ? '"primary" "footer"' : '"leading primary trailing"',
                rowGap: expanded ? 4 : 0,
                opacity: disabled ? 0.7 : 1,
            }}
        >
            <div style={{
                gridArea: 'primary',
                display: 'flex', alignItems: 'center',
                padding: expanded ? '8px 10px 4px' : '0 8px',
                minHeight: 46,
            }}>
                <textarea
                    ref={taRef}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            if (!disabled && value.trim()) onSend()
                        }
                    }}
                    placeholder="Ask anything about your resume, jobs, or career…"
                    rows={1}
                    disabled={disabled}
                    style={{
                        flex: 1, border: 'none', outline: 'none', resize: 'none',
                        background: 'transparent',
                        fontSize: '1rem', lineHeight: 1.5,
                        color: 'var(--rs-ink)', fontFamily: 'inherit',
                        padding: expanded ? '4px 0' : '12px 0',
                        minHeight: expanded ? 80 : undefined,
                        maxHeight: 200,
                    }}
                />
            </div>

            {!expanded && (
                <div style={{ gridArea: 'leading', display: 'flex', alignItems: 'center' }}>
                    <button type="button" aria-label="Add attachments" className="rs-c-icon"
                        style={{ width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'var(--rs-muted)', background: 'transparent', border: 'none' }}>
                        <I.Plus />
                    </button>
                </div>
            )}

            <div style={{
                gridArea: expanded ? 'footer' : 'trailing',
                display: 'flex', alignItems: 'center', gap: 6,
                justifyContent: expanded ? 'space-between' : 'flex-end',
            }}>
                {expanded && (
                    <button type="button" aria-label="Add attachments" className="rs-c-icon"
                        style={{ width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'var(--rs-muted)', background: 'transparent', border: 'none' }}>
                        <I.Plus />
                    </button>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: expanded ? 'auto' : 0 }}>
                    <button type="button" aria-label="Record" className="rs-c-icon"
                        style={{ width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'var(--rs-muted)', background: 'transparent', border: 'none' }}>
                        <I.Mic />
                    </button>
                    <button type="button" aria-label="Visualize" className="rs-c-icon"
                        style={{ width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'var(--rs-muted)', background: 'transparent', border: 'none' }}>
                        <I.Wave />
                    </button>
                    {isStreaming ? (
                        <button type="button" aria-label="Stop generating" onClick={onStop} className="rs-fade-up rs-stop-btn"
                            style={{
                                width: 36, height: 36, borderRadius: '50%',
                                display: 'grid', placeItems: 'center',
                                background: 'var(--rs-ink)', color: '#fff',
                                boxShadow: '0 4px 10px -3px rgba(15,23,42,.4)',
                                marginLeft: 2, border: 'none', cursor: 'pointer',
                                position: 'relative',
                            }}>
                            {/* Inner square = stop affordance. The pulsing ring is rendered
                                via ::before on .rs-stop-btn so the icon stays crisp. */}
                            <span aria-hidden style={{
                                width: 11, height: 11, borderRadius: 2,
                                background: '#fff', display: 'inline-block',
                            }} />
                        </button>
                    ) : value.trim() && (
                        <button type="button" aria-label="Send" onClick={onSend} disabled={disabled} className="rs-fade-up"
                            style={{
                                width: 36, height: 36, borderRadius: '50%',
                                display: 'grid', placeItems: 'center',
                                background: 'var(--rs-ink)', color: '#fff',
                                boxShadow: '0 4px 10px -3px rgba(15,23,42,.4)',
                                marginLeft: 2, border: 'none',
                                cursor: disabled ? 'not-allowed' : 'pointer',
                                opacity: disabled ? 0.5 : 1,
                            }}>
                            <I.Send />
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

function ActionChips({ onPick, disabled, isMobile }: { onPick: (t: string) => void; disabled?: boolean; isMobile?: boolean }) {
    return (
        <div style={{
            display: 'flex', gap: 8, justifyContent: isMobile ? 'flex-start' : 'center',
            flexDirection: isMobile ? 'column' : 'row', flexWrap: isMobile ? 'nowrap' : 'wrap',
            marginTop: 18, width: isMobile ? '100%' : undefined,
            maxWidth: isMobile ? '100%' : 880,
            marginLeft: 'auto', marginRight: 'auto',
        }}>
            {QUICK_ACTIONS.map(a => (
                <button key={a.label} type="button" disabled={disabled}
                    onClick={() => onPick(a.prompt)} className="rs-chip-btn"
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 7,
                        padding: isMobile ? '10px 14px' : '8px 14px',
                        borderRadius: isMobile ? 12 : 99,
                        width: isMobile ? '100%' : undefined,
                        background: '#fff', border: '1px solid var(--rs-line)',
                        fontSize: '.8125rem', color: 'var(--rs-ink-2)', fontWeight: 500,
                        boxShadow: '0 1px 2px rgba(15,23,42,.04)',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        opacity: disabled ? 0.5 : 1,
                    }}>
                    <span style={{ color: 'var(--rs-blue)', display: 'inline-flex' }}>{a.icon}</span>
                    {a.label}
                </button>
            ))}
        </div>
    )
}

function UserBubble({ text }: { text: string }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{
                maxWidth: '78%',
                background: '#fff', border: '1px solid var(--rs-line)',
                boxShadow: '0 1px 2px rgba(15,23,42,.04)',
                borderRadius: '18px 18px 4px 18px',
                padding: '12px 16px',
                fontSize: '.9375rem', lineHeight: 1.55, color: 'var(--rs-ink)',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>{text}</div>
        </div>
    )
}

function AsstMessage({
    children, toolCalls, showActions = true, streaming = false,
}: {
    children: React.ReactNode
    toolCalls?: ChatToolCall[]
    showActions?: boolean
    /** When true, suppresses per-message footer + tool cards (they will appear
     *  once the stream finishes) and renders a soft blinking caret after content. */
    streaming?: boolean
}) {
    return (
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <Avatar size={30} />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 2 }}>
                {!streaming && toolCalls && toolCalls.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {toolCalls.map((t, i) => (
                            <ToolBadge key={i} name={t.name} durationMs={t.durationMs} />
                        ))}
                    </div>
                )}
                <div className={`rs-asst-md${streaming ? ' rs-streaming' : ''}`} style={{
                    fontSize: '.9375rem', lineHeight: 1.6, color: 'var(--rs-ink)',
                    wordBreak: 'break-word',
                }}>
                    {children}
                </div>
                {!streaming && toolCalls && toolCalls.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {toolCalls.map((t, i) => (
                            <ToolResultCard key={`tc-${i}`} call={t} />
                        ))}
                    </div>
                )}
                {!streaming && showActions && (
                    <div style={{ display: 'flex', gap: 2, marginTop: 2, marginLeft: -6, opacity: .7 }}>
                        <button type="button" className="rs-icon-btn" title="Copy"><I.Copy /></button>
                        <button type="button" className="rs-icon-btn" title="Regenerate"><I.Refresh /></button>
                        <button type="button" className="rs-icon-btn" title="Helpful"><I.Thumb /></button>
                    </div>
                )}
            </div>
        </div>
    )
}

function TypingIndicator({ pendingTool }: { pendingTool?: string | null }) {
    // When a tool is running, the bubble morphs into a status row with a
    // conic-gradient halo + the tool's friendly label. Otherwise it shows the
    // three classic bouncing dots so the user knows the model is thinking.
    const label = pendingTool ? toolLabel(pendingTool) : null
    return (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
            <Avatar size={30} />
            <div style={{
                background: '#fff',
                border: '1px solid var(--rs-line)',
                borderRadius: '4px 14px 14px 14px',
                padding: label ? '10px 14px 10px 12px' : '12px 14px',
                display: 'flex', gap: 10, alignItems: 'center',
                boxShadow: '0 1px 2px rgba(15,23,42,.04)',
                minHeight: 32,
                transition: 'padding .18s ease',
            }}>
                {label ? (
                    <>
                        <span aria-hidden style={{
                            position: 'relative',
                            width: 16, height: 16, flexShrink: 0,
                            borderRadius: '50%',
                            background: 'conic-gradient(from 0deg, transparent 0deg, var(--rs-blue) 90deg, transparent 270deg)',
                            animation: 'rsToolSpin 1.05s linear infinite',
                            display: 'inline-block',
                        }}>
                            <span style={{
                                position: 'absolute', inset: 2,
                                borderRadius: '50%', background: '#fff',
                                display: 'inline-block',
                            }} />
                            <span style={{
                                position: 'absolute', inset: 6,
                                borderRadius: '50%', background: 'var(--rs-blue)',
                                opacity: 0.85, display: 'inline-block',
                            }} />
                        </span>
                        <span style={{
                            fontSize: '.8125rem', fontWeight: 600,
                            color: 'var(--rs-ink, #0f172a)', letterSpacing: '-.005em',
                            display: 'inline-flex', alignItems: 'baseline', gap: 6,
                        }}>
                            {label}
                            <span style={{
                                fontFamily: "var(--font-mono, 'JetBrains Mono', ui-monospace, monospace)",
                                fontSize: '.6875rem', fontWeight: 600,
                                color: 'var(--rs-muted-2, #94a3b8)',
                                letterSpacing: '.06em', textTransform: 'uppercase',
                            }}>·&nbsp;tool</span>
                        </span>
                    </>
                ) : (
                    <>
                        {[0, 160, 320].map(d => (
                            <span key={d} style={{
                                width: 6, height: 6, borderRadius: '50%',
                                background: 'var(--rs-blue)', display: 'inline-block',
                                animation: 'rsTypingBounce 1.2s ease-in-out infinite',
                                animationDelay: `${d}ms`,
                            }} />
                        ))}
                    </>
                )}
            </div>
        </div>
    )
}

function ResumePicker({
    resumes, onPick, disabled,
}: {
    resumes: Resume[]
    onPick: (r: Resume) => void
    disabled: boolean
}) {
    return (
        <AsstMessage showActions={false}>
            <p style={{ marginBottom: 10 }}>Which resume should I use for this session?</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 460 }}>
                {resumes.map(r => (
                    <button key={r.id} type="button" disabled={disabled}
                        onClick={() => onPick(r)} className="rs-resume-pick"
                        style={{
                            background: '#fff', border: '1px solid var(--rs-line)',
                            borderRadius: 12, padding: '12px 14px',
                            textAlign: 'left',
                            cursor: disabled ? 'not-allowed' : 'pointer',
                            opacity: disabled ? 0.6 : 1,
                            display: 'flex', alignItems: 'center', gap: 12,
                            transition: 'all .15s ease',
                        }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 9,
                            background: 'var(--rs-blue-50)', color: 'var(--rs-blue)',
                            display: 'grid', placeItems: 'center',
                            border: '1px solid #DBEAFE', flexShrink: 0,
                        }}>
                            <I.File />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '.875rem', fontWeight: 600, color: 'var(--rs-ink)', letterSpacing: '-.01em' }}>
                                {resumeDisplayName(r)}
                            </div>
                            {resumeSubtitle(r) && (
                                <div style={{ fontSize: '.75rem', color: 'var(--rs-muted)', marginTop: 2 }}>{resumeSubtitle(r)}</div>
                            )}
                        </div>
                        <span style={{ color: 'var(--rs-muted-2)', fontSize: '.75rem', fontWeight: 600 }}>Use →</span>
                    </button>
                ))}
            </div>
        </AsstMessage>
    )
}

function ErrorBar({ text, onClose }: { text: string; onClose: () => void }) {
    return (
        <div style={{
            marginTop: 12,
            padding: '8px 12px',
            background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            fontSize: '.775rem', color: '#B91C1C',
            maxWidth: 880, margin: '12px auto 0',
        }}>
            <span>⚠ {text}</span>
            <button type="button" onClick={onClose} aria-label="Dismiss"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#B91C1C', fontSize: 14, lineHeight: 1, padding: 0, opacity: .7 }}>✕</button>
        </div>
    )
}

/* ─────────────────────────────────────────────────────────
   Sidebar
   ───────────────────────────────────────────────────────── */

function Sidebar({
    history, activeId, onSelect, onNew, onDelete,
}: {
    history: ChatRecord[]
    activeId: string | null
    onSelect: (id: string) => void
    onNew: () => void
    onDelete: (id: string) => void
}) {
    return (
        <aside style={{
            width: 340, background: '#FAFBFD',
            borderRight: '1px solid var(--rs-line-2)',
            display: 'flex', flexDirection: 'column',
            flexShrink: 0, minHeight: 0,
        }}>
            <div style={{ padding: '14px 14px 10px' }}>
                <button type="button" onClick={onNew} className="rs-new-chat-btn"
                    style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        padding: '11px 14px', borderRadius: 12,
                        background: 'linear-gradient(135deg,#2563EB,#1E40AF)', color: '#fff',
                        fontSize: '.8125rem', fontWeight: 600,
                        boxShadow: '0 8px 18px -6px rgba(37,99,235,.5)',
                        border: 'none', cursor: 'pointer',
                        transition: 'all .15s ease',
                        letterSpacing: '-.005em',
                    }}>
                    <I.Plus width={16} height={16} />
                    New chat
                </button>
            </div>

            {/* Header — modeled after Claude's "Recents" list: title case, real ink color, no all-caps tracking. */}
            <div style={{
                fontSize: '0.9375rem', fontWeight: 700, letterSpacing: '-.01em',
                color: 'var(--rs-ink, #0F172A)',
                padding: '14px 18px 10px',
            }}>Recents</div>

            <div className="rs-thread-scroll" style={{
                flex: 1, overflowY: 'auto',
                padding: '0 8px 14px',
                display: 'flex', flexDirection: 'column', gap: 1,
                minHeight: 0,
            }}>
                {history.length === 0 ? (
                    <div style={{
                        padding: '14px 14px', fontSize: '.8125rem',
                        color: 'var(--rs-muted-2)', lineHeight: 1.5,
                    }}>
                        No chats yet. Start asking — I&apos;ll remember.
                    </div>
                ) : (
                    history.map(h => {
                        const on = h.id === activeId
                        return (
                            <div key={h.id} className="rs-history-row"
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '9px 12px', borderRadius: 8,
                                    // Active state is a subtle slate fill — no dot, no border, no shadow.
                                    background: on ? 'rgba(15,23,42,.06)' : 'transparent',
                                    cursor: 'pointer',
                                    transition: 'background .12s ease',
                                }}
                                onClick={() => onSelect(h.id)}>
                                <span style={{
                                    flex: 1, minWidth: 0,
                                    fontSize: '0.9375rem',
                                    fontWeight: on ? 600 : 500,
                                    color: 'var(--rs-ink, #0F172A)',
                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                    letterSpacing: '-.005em',
                                    lineHeight: 1.45,
                                }}>{h.title || 'New chat'}</span>
                                <button type="button"
                                    onClick={(e) => { e.stopPropagation(); onDelete(h.id) }}
                                    aria-label="Delete chat"
                                    className="rs-history-del"
                                    style={{
                                        width: 26, height: 26,
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                        borderRadius: 5, background: 'transparent', border: 'none',
                                        color: 'var(--rs-muted-2)',
                                        cursor: 'pointer', opacity: 0,
                                        transition: 'opacity .15s ease, background .15s ease, color .15s ease',
                                    }}>
                                    <I.Trash />
                                </button>
                            </div>
                        )
                    })
                )}
            </div>

            <div style={{
                padding: '12px 14px',
                borderTop: '1px solid var(--rs-line-2)',
                fontSize: '.6875rem', color: 'var(--rs-muted)', lineHeight: 1.5,
            }}>
                Chats are saved in this browser only.
            </div>
        </aside>
    )
}

/* ─────────────────────────────────────────────────────────
   PAGE
   ───────────────────────────────────────────────────────── */
export default function AIChatPage() {
    const { user } = useAuth()
    const router = useRouter()
    const [history, setHistory] = useState<ChatRecord[]>([])
    const [activeId, setActiveId] = useState<string | null>(null)

    // Active chat draft state — persisted into history on every turn.
    const [input, setInput] = useState('')
    const [messages, setMessages] = useState<EnrichedMessage[]>([])
    const [sessionResumeId, setSessionResumeId] = useState<string | null>(null)
    const [pendingPick, setPendingPick] = useState<{ message: string; resumes: Resume[] } | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    // Currently-running tool, shown as an inline chip while the model is waiting
    // for tool output. Cleared once text_delta events begin streaming.
    const [pendingTool, setPendingTool] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    // AbortController for the in-flight stream so the Stop button can cancel mid-response.
    const abortRef = useRef<AbortController | null>(null)

    const [isMobile, setIsMobile] = useState(false)
    const [sidebarOpen, setSidebarOpen] = useState(false)

    // Saved jobs (localStorage) + toasts.
    const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
    const [toastMsg, setToastMsg] = useState<string | null>(null)
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const threadEndRef = useRef<HTMLDivElement>(null)
    // Stable handle to the send function so memoized contexts (chips, cards)
    // can fire follow-up prompts without re-creating actions on every keystroke.
    const sendRef = useRef<(text: string) => void>(() => {})

    /* hydrate history once */
    useEffect(() => {
        const recs = loadHistory()
        setHistory(recs)
        try {
            const raw = localStorage.getItem(SAVED_JOBS_KEY)
            if (raw) {
                const arr = JSON.parse(raw)
                if (Array.isArray(arr)) setSavedIds(new Set(arr.filter(x => typeof x === 'string')))
            }
        } catch { /* ignore */ }
    }, [])

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 767px)')
        setIsMobile(mq.matches)
        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
        mq.addEventListener('change', handler)
        return () => mq.removeEventListener('change', handler)
    }, [])

    /* most-recent jobId from any tool result — used as the default for "build learning path" */
    const lastJobId = useMemo<string | null>(() => {
        for (let i = messages.length - 1; i >= 0; i--) {
            const m = messages[i]
            if (m.role !== 'assistant' || !m.toolCalls) continue
            for (const tc of m.toolCalls) {
                if ((tc.name === 'find_matching_jobs' || tc.name === 'get_job_scores') && tc.result) {
                    try {
                        const arr = JSON.parse(tc.result)
                        if (Array.isArray(arr) && arr[0]?.job_id) return arr[0].job_id as string
                    } catch { /* ignore */ }
                }
            }
        }
        return null
    }, [messages])

    /* ── action context (toast + saved + nav) ─────────────── */
    const showToast = useCallback((msg: string) => {
        setToastMsg(msg)
        if (toastTimer.current) clearTimeout(toastTimer.current)
        toastTimer.current = setTimeout(() => setToastMsg(null), 2400)
    }, [])

    const actions: ChatActions = useMemo(() => ({
        savedIds,
        toggleSave: (jobId, jobTitle, company) => {
            setSavedIds(prev => {
                const next = new Set(prev)
                if (next.has(jobId)) next.delete(jobId)
                else next.add(jobId)
                try { localStorage.setItem(SAVED_JOBS_KEY, JSON.stringify(Array.from(next))) } catch { /* ignore */ }
                return next
            })
            showToast(savedIds.has(jobId) ? `Removed ${jobTitle} at ${company}` : `Saved ${jobTitle} at ${company}`)
        },
        openRole: (job) => {
            if (job.source_url) {
                window.open(job.source_url, '_blank', 'noopener,noreferrer')
            } else {
                router.push(`/dashboard/matches?jobId=${encodeURIComponent(job.job_id)}`)
            }
        },
        tailorResume: (jobId) => router.push(`/dashboard/optimize?jobId=${encodeURIComponent(jobId)}`),
        viewResearch: (jobId) => router.push(`/dashboard/research?jobId=${encodeURIComponent(jobId)}`),
        viewLearning: (jobId) => router.push(`/dashboard/learning?jobId=${encodeURIComponent(jobId)}`),
        seeOpenRoles: (companyName) => router.push(`/dashboard/search?q=${encodeURIComponent(companyName)}`),
        fullResearch: (_companyName) => {
            // Research page is keyed by jobId; route there with our latest job context if we have one.
            if (lastJobId) router.push(`/dashboard/research?jobId=${encodeURIComponent(lastJobId)}`)
            else router.push(`/dashboard/research`)
        },
        buildLearningPath: () => {
            if (lastJobId) router.push(`/dashboard/learning?jobId=${encodeURIComponent(lastJobId)}`)
            else router.push(`/dashboard/learning`)
        },
        sendPrompt: (prompt) => sendRef.current(prompt),
        toast: showToast,
    }), [savedIds, lastJobId, router, showToast])

    /* scroll to bottom when content grows */
    useEffect(() => {
        threadEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, isLoading, pendingPick])

    const hasMessages = messages.length > 0

    const conversationTitle = useMemo(() => deriveTitle(messages), [messages])

    /* ── persist current chat to history ─────────────────── */
    const persist = useCallback((nextMessages: EnrichedMessage[], rid: string | null, idOverride?: string) => {
        if (nextMessages.length === 0) return
        const id = idOverride ?? activeId ?? newChatId()
        if (!activeId && !idOverride) setActiveId(id)
        const now = Date.now()
        setHistory(prev => {
            const existing = prev.find(h => h.id === id)
            const record: ChatRecord = existing ? {
                ...existing,
                messages: nextMessages,
                title: existing.title || deriveTitle(nextMessages),
                sessionResumeId: rid,
                updatedAt: now,
            } : {
                id,
                title: deriveTitle(nextMessages),
                createdAt: now,
                updatedAt: now,
                sessionResumeId: rid,
                messages: nextMessages,
            }
            const without = prev.filter(h => h.id !== id)
            const next = [record, ...without]
            saveHistory(next)
            return next
        })
        return id
    }, [activeId])

    /* ── API call (streaming) ─────────────────────────────────
       Consumes NDJSON from /api/chat. Each line is a StreamEvent.
       Caller passes an onEvent handler that updates the UI per
       tool_start/tool_end/text_delta. Returns final {reply, toolCalls}
       when the stream emits `done`. Supports cancellation via signal. */
    const callApi = useCallback(async (
        text: string,
        rid: string,
        history: EnrichedMessage[],
        onEvent: (e: StreamEvent) => void,
        signal: AbortSignal,
    ): Promise<{ reply: string; toolCalls: ChatToolCall[] }> => {
        const cleanHistory: ChatMessage[] = history.map(m => ({ role: m.role, content: m.content }))
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: text,
                userId: user?.id ?? '',
                conversationHistory: cleanHistory,
                resumeId: rid,
            }),
            signal,
        })
        if (!res.ok) {
            // 402 = chat quota exhausted → fire the global upgrade toast.
            const { handleQuota } = await import('@/lib/quota')
            if (await handleQuota(res)) {
                throw new Error("You've used all your AI chat messages on this plan for the month. Upgrade for more.")
            }
            // Server still returns JSON for auth/validation failures pre-stream.
            const body = await res.json().catch(() => ({}))
            throw new Error(body?.error || `HTTP ${res.status}`)
        }
        if (!res.body) throw new Error('Streaming not supported in this environment.')

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let assembled = ''
        const toolCalls: ChatToolCall[] = []

        try {
            for (; ;) {
                const { value, done } = await reader.read()
                if (done) break
                buffer += decoder.decode(value, { stream: true })
                let nl: number
                while ((nl = buffer.indexOf('\n')) >= 0) {
                    const line = buffer.slice(0, nl).trim()
                    buffer = buffer.slice(nl + 1)
                    if (!line) continue
                    let evt: StreamEvent
                    try {
                        evt = JSON.parse(line) as StreamEvent
                    } catch (err) {
                        console.warn('[chat] bad ndjson line:', line, err)
                        continue
                    }
                    onEvent(evt)
                    if (evt.type === 'text_delta') assembled += evt.delta
                    else if (evt.type === 'tool_end') toolCalls.push({ name: evt.name, durationMs: evt.durationMs, result: evt.result })
                    else if (evt.type === 'error') throw new Error(evt.error)
                    else if (evt.type === 'stopped') break
                }
            }
        } finally {
            try { reader.releaseLock() } catch { /* ignore */ }
        }
        return { reply: assembled, toolCalls }
    }, [user?.id])

    /* ── send message ────────────────────────────────────── */
    // Keep sendRef pointing at the latest closure so memoized actions
    // (follow-up chips, card buttons) always invoke the current send.
    useEffect(() => {
        sendRef.current = (t: string) => { void send(t) }
    })

    /* Runs a streaming turn. Inserts a placeholder assistant bubble, then
       mutates its content as text_delta events arrive. Returns the final
       assistant message so the caller can persist it. */
    const runStream = useCallback(async (
        trimmed: string,
        rid: string,
        baseMessages: EnrichedMessage[],
    ): Promise<EnrichedMessage[]> => {
        const placeholder: EnrichedMessage = { role: 'assistant', content: '', streaming: true }
        const withPlaceholder = [...baseMessages, placeholder]
        setMessages(withPlaceholder)

        const placeholderIdx = withPlaceholder.length - 1
        let accumulated = ''
        const seenToolCalls: ChatToolCall[] = []

        const controller = new AbortController()
        abortRef.current = controller

        const onEvent = (e: StreamEvent) => {
            if (e.type === 'tool_start') {
                setPendingTool(e.name)
            } else if (e.type === 'tool_end') {
                setPendingTool(null)
                seenToolCalls.push({ name: e.name, durationMs: e.durationMs, result: e.result })
            } else if (e.type === 'text_delta') {
                setPendingTool(null)
                accumulated += e.delta
                setMessages(prev => {
                    const next = prev.slice()
                    if (next[placeholderIdx]) {
                        next[placeholderIdx] = { ...next[placeholderIdx], content: accumulated, streaming: true }
                    }
                    return next
                })
            } else if (e.type === 'stopped') {
                accumulated += accumulated ? '\n\n_(stopped)_' : '_(stopped)_'
            }
        }

        try {
            const { reply, toolCalls } = await callApi(trimmed, rid, baseMessages, onEvent, controller.signal)
            const final: EnrichedMessage = {
                role: 'assistant',
                content: reply || accumulated,
                toolCalls: (toolCalls.length ? toolCalls : seenToolCalls),
            }
            const finalList = [...baseMessages, final]
            setMessages(finalList)
            return finalList
        } catch (err) {
            // Aborted by user → finalize with whatever streamed so far + (stopped) marker.
            const aborted = (err as { name?: string })?.name === 'AbortError' || controller.signal.aborted
            if (aborted) {
                const final: EnrichedMessage = {
                    role: 'assistant',
                    content: (accumulated || '') + (accumulated ? '\n\n_(stopped)_' : '_(stopped)_'),
                    toolCalls: seenToolCalls.length ? seenToolCalls : undefined,
                }
                const finalList = [...baseMessages, final]
                setMessages(finalList)
                return finalList
            }
            throw err
        } finally {
            setPendingTool(null)
            abortRef.current = null
        }
    }, [callApi])

    /* Stop the in-flight stream — the placeholder bubble will keep
       whatever text has already arrived plus a "(stopped)" marker. */
    const stopStreaming = useCallback(() => {
        abortRef.current?.abort()
    }, [])

    async function send(text: string) {
        const trimmed = text.trim()
        if (!trimmed || isLoading || pendingPick) return
        // Make sure follow-up chips fire the latest closure of send.
        // (sendRef is updated below on every render.)

        const userMsg: EnrichedMessage = { role: 'user', content: trimmed }

        if (!sessionResumeId) {
            const newMsgs = [...messages, userMsg]
            setMessages(newMsgs)
            setInput('')
            setError(null)
            setIsLoading(true)
            try {
                const list = await fetchResumes(user?.id ?? '')
                if (list.length === 0) {
                    const updated: EnrichedMessage[] = [...newMsgs, {
                        role: 'assistant',
                        content: "I don't see any resumes uploaded yet. Head to **Upload** in the sidebar, then come back and ask me again.",
                    }]
                    setMessages(updated)
                    persist(updated, null)
                    return
                }
                if (list.length === 1) {
                    const only = list[0]
                    setSessionResumeId(only.id)
                    setPrimaryResumeId(only.id)
                    const confirm: EnrichedMessage = {
                        role: 'assistant',
                        content: `Using **${resumeDisplayName(only)}** for this session.`,
                    }
                    const afterConfirm = [...newMsgs, confirm]
                    setMessages(afterConfirm)
                    const final = await runStream(trimmed, only.id, afterConfirm)
                    persist(final, only.id)
                    return
                }
                // Auto-select the user's saved primary resume when one exists — avoids the
                // modal interrupt for users who've already declared their primary. They can
                // switch via "Switch resume" in the locked-resume strip if needed.
                const savedPrimaryId = getPrimaryResumeId()
                const savedPrimary = savedPrimaryId ? list.find(r => r.id === savedPrimaryId) : undefined
                const dbPrimary = !savedPrimary ? list.find(r => (r as any).is_primary) : undefined
                const auto = savedPrimary ?? dbPrimary
                if (auto) {
                    setSessionResumeId(auto.id)
                    setPrimaryResumeId(auto.id)
                    const confirm: EnrichedMessage = {
                        role: 'assistant',
                        content: `Using **${resumeDisplayName(auto)}** for this session.`,
                    }
                    const afterConfirm = [...newMsgs, confirm]
                    setMessages(afterConfirm)
                    const final = await runStream(trimmed, auto.id, afterConfirm)
                    persist(final, auto.id)
                    return
                }
                setPendingPick({ message: trimmed, resumes: list })
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load your resumes.')
            } finally {
                setIsLoading(false)
            }
            return
        }

        const updatedHistory = [...messages, userMsg]
        setMessages(updatedHistory)
        setInput('')
        setIsLoading(true)
        setError(null)
        try {
            const final = await runStream(trimmed, sessionResumeId, updatedHistory)
            persist(final, sessionResumeId)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong.')
        } finally {
            setIsLoading(false)
        }
    }

    /* ── handle resume pick ─────────────────────────────── */
    async function handlePickResume(r: Resume) {
        if (!pendingPick) return
        const { message: deferred } = pendingPick
        setSessionResumeId(r.id)
        setPrimaryResumeId(r.id)
        setPendingPick(null)
        setIsLoading(true)
        setError(null)

        const confirm: EnrichedMessage = {
            role: 'assistant',
            content: `Using **${resumeDisplayName(r)}** for this session.`,
        }
        const afterConfirm = [...messages, confirm]
        setMessages(afterConfirm)
        try {
            const final = await runStream(deferred, r.id, afterConfirm)
            persist(final, r.id)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong.')
        } finally {
            setIsLoading(false)
        }
    }

    /* ── new chat / select / delete ─────────────────────── */
    function startNewChat() {
        setMessages([])
        setInput('')
        setError(null)
        setSessionResumeId(null)
        setPendingPick(null)
        setActiveId(null)
    }
    function selectChat(id: string) {
        const rec = history.find(h => h.id === id)
        if (!rec) return
        setActiveId(rec.id)
        setMessages(rec.messages)
        setSessionResumeId(rec.sessionResumeId)
        setPendingPick(null)
        setInput('')
        setError(null)
    }
    function deleteChat(id: string) {
        setHistory(prev => {
            const next = prev.filter(h => h.id !== id)
            saveHistory(next)
            return next
        })
        if (activeId === id) startNewChat()
    }

    return (
        <ChatActionsCtx.Provider value={actions}>
        <div className="rs-chat-root">
            <style>{globalChatStyle}</style>

            {/* Mobile sidebar backdrop */}
            {isMobile && sidebarOpen && (
                <div
                    onClick={() => setSidebarOpen(false)}
                    style={{
                        position: 'fixed', inset: 0, top: 64, zIndex: 198,
                        background: 'rgba(0,0,0,0.35)',
                    }}
                />
            )}

            {/* Sidebar — slide-over on mobile, direct child on desktop */}
            {isMobile ? (
                <div style={{
                    position: 'fixed', left: 0, top: 64, bottom: 0, zIndex: 199,
                    width: 300, overflow: 'hidden',
                    transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
                    transition: 'transform 0.25s cubic-bezier(.4,0,.2,1)',
                    pointerEvents: sidebarOpen ? 'auto' : 'none',
                }}>
                    <Sidebar
                        history={history}
                        activeId={activeId}
                        onSelect={(id) => { selectChat(id); setSidebarOpen(false) }}
                        onNew={() => { startNewChat(); setSidebarOpen(false) }}
                        onDelete={deleteChat}
                    />
                </div>
            ) : (
                <Sidebar
                    history={history}
                    activeId={activeId}
                    onSelect={selectChat}
                    onNew={startNewChat}
                    onDelete={deleteChat}
                />
            )}

            <main className="rs-chat-main" style={{ position: 'relative' }}>
                {/* Mobile hamburger — always visible at top-left */}
                {isMobile && (
                    <button
                        type="button"
                        onClick={() => setSidebarOpen(s => !s)}
                        style={{
                            position: 'absolute', top: 10, left: 10, zIndex: 10,
                            width: 36, height: 36, borderRadius: 9,
                            background: '#fff', border: '1px solid var(--rs-line)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: 'var(--rs-ink)',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        }}
                        aria-label="Chat history"
                    >
                        <I.Menu />
                    </button>
                )}
                {!hasMessages ? (
                    /* ── ENTRY · empty hero state ── */
                    <div className="rs-chat-hero" style={{
                        flex: 1, display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                        padding: isMobile ? '56px 16px 32px' : '40px 32px 56px',
                        background: 'linear-gradient(180deg,#FAFBFD 0%,#FFFFFF 100%)',
                        overflowY: 'auto',
                    }}>
                        <div style={{ marginBottom: 18 }}>
                            <BetaPill />
                        </div>

                        <h1 style={{
                            fontFamily: 'var(--font-main, Inter, sans-serif)',
                            fontSize: 'clamp(1.5rem, 2.6vw, 1.75rem)',
                            fontWeight: 600,
                            letterSpacing: '-.022em',
                            lineHeight: 1.25,
                            color: 'var(--rs-ink)',
                            textAlign: 'center',
                            marginBottom: 30,
                            maxWidth: 560,
                            textWrap: 'balance' as React.CSSProperties['textWrap'],
                        }}>
                            How can I help you today?
                        </h1>

                        <HeroComposer
                            value={input}
                            onChange={setInput}
                            onSend={() => send(input)}
                            disabled={isLoading}
                        />

                        <ActionChips onPick={(t) => send(t)} disabled={isLoading} isMobile={isMobile} />

                        <div style={{
                            fontSize: '.6875rem', color: 'var(--rs-muted-2)',
                            marginTop: 24, letterSpacing: '-.005em', textAlign: 'center',
                        }}>
                            JobScorer AI can use your resume, scored matches, and company research.
                        </div>

                        {error && <ErrorBar text={error} onClose={() => setError(null)} />}
                    </div>
                ) : (
                    /* ── CONVERSATION ── */
                    <>
                        <div style={{
                            height: 56, borderBottom: '1px solid var(--rs-line-2)',
                            display: 'flex', alignItems: 'center',
                            padding: isMobile ? '0 12px' : '0 24px', gap: 8,
                            background: 'rgba(255,255,255,.85)',
                            backdropFilter: 'blur(10px)',
                            WebkitBackdropFilter: 'blur(10px)',
                            flexShrink: 0,
                        }}>
                            {isMobile && (
                                <button
                                    type="button"
                                    onClick={() => setSidebarOpen(s => !s)}
                                    style={{
                                        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                                        background: 'transparent', border: 'none',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer', color: 'var(--rs-ink)',
                                    }}
                                    aria-label="Chat history"
                                >
                                    <I.Menu />
                                </button>
                            )}
                            <BetaPill />
                            <div style={{
                                fontSize: '.8125rem', color: 'var(--rs-muted)',
                                display: 'flex', alignItems: 'center', gap: 6, minWidth: 0,
                            }}>
                                <span style={{
                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                    maxWidth: 320, color: 'var(--rs-ink)', fontWeight: 600,
                                }}>{conversationTitle}</span>
                            </div>
                            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                                <button type="button" className="rs-btn rs-btn-outline" onClick={startNewChat}>
                                    <I.Edit /> New chat
                                </button>
                            </div>
                        </div>

                        <div className="rs-thread-scroll" style={{
                            flex: 1, overflowY: 'auto',
                            padding: '32px 24px 8px',
                            background: 'linear-gradient(180deg,#FAFBFD 0%,#FFFFFF 80px)',
                        }}>
                            <div style={{
                                maxWidth: 880, margin: '0 auto',
                                display: 'flex', flexDirection: 'column', gap: 24,
                            }}>
                                {messages.map((m, i) => m.role === 'user' ? (
                                    <UserBubble key={i} text={m.content} />
                                ) : (
                                    <AsstMessage key={i} toolCalls={m.toolCalls} streaming={!!m.streaming}>
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            components={MARKDOWN_COMPONENTS}
                                        >{m.content}</ReactMarkdown>
                                    </AsstMessage>
                                ))}

                                {pendingPick && (
                                    <ResumePicker
                                        resumes={pendingPick.resumes}
                                        onPick={handlePickResume}
                                        disabled={isLoading}
                                    />
                                )}

                                {/* TypingIndicator only renders when the streaming
                                    placeholder bubble hasn't appeared yet OR
                                    a tool is currently executing (so the user
                                    sees an explicit "Searching matching roles…"
                                    chip even before text starts to stream). */}
                                {isLoading && !pendingPick && (
                                    (() => {
                                        const last = messages[messages.length - 1]
                                        const showAboveStreaming = pendingTool && last?.role === 'assistant' && last.streaming
                                        const showStandalone = !last || last.role === 'user' || !last.streaming
                                        if (showStandalone || showAboveStreaming) {
                                            return <TypingIndicator pendingTool={pendingTool} />
                                        }
                                        return null
                                    })()
                                )}

                                <div ref={threadEndRef} />
                            </div>
                        </div>

                        <div style={{
                            padding: '14px 24px 22px',
                            borderTop: '1px solid var(--rs-line-2)',
                            background: 'linear-gradient(180deg,rgba(255,255,255,0) 0,#fff 24px)',
                            flexShrink: 0,
                        }}>
                            <div style={{ maxWidth: 880, margin: '0 auto' }}>
                                {sessionResumeId && (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        marginBottom: 8, flexWrap: 'wrap', justifyContent: 'center',
                                    }}>
                                        <span style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 5,
                                            padding: '3px 9px 3px 7px',
                                            background: 'var(--rs-blue-50)', border: '1px solid #DBEAFE',
                                            borderRadius: 7,
                                            fontSize: '.6875rem', fontWeight: 600, color: 'var(--rs-blue-700)',
                                        }}>
                                            <span style={{ display: 'inline-flex', color: 'var(--rs-blue)' }}>
                                                <I.File />
                                            </span>
                                            Resume locked for this session
                                        </span>
                                    </div>
                                )}

                                <HeroComposer
                                    value={input}
                                    onChange={setInput}
                                    onSend={() => send(input)}
                                    // While the stream runs, allow typing the next prompt
                                    // (just block submission). Picker modal still blocks input.
                                    disabled={!!pendingPick}
                                    isStreaming={isLoading}
                                    onStop={stopStreaming}
                                    dense
                                />

                                <div style={{
                                    fontSize: '.6875rem', color: 'var(--rs-muted-2)',
                                    textAlign: 'center', marginTop: 9, letterSpacing: '-.005em',
                                }}>
                                    {pendingPick
                                        ? 'Pick a resume above to continue.'
                                        : 'JobScorer AI can use your resume, scored matches, and company research.'}
                                </div>

                                {error && <ErrorBar text={error} onClose={() => setError(null)} />}
                            </div>
                        </div>
                    </>
                )}
            </main>

            {toastMsg && (
                <div role="status" aria-live="polite" className="rs-toast" style={{
                    position: 'fixed', bottom: 28, left: '50%',
                    transform: 'translateX(-50%)',
                    padding: '10px 16px', borderRadius: 10,
                    background: 'var(--rs-ink)', color: '#fff',
                    fontSize: '.8125rem', fontWeight: 500, letterSpacing: '-.005em',
                    boxShadow: '0 12px 36px -12px rgba(15,23,42,.45), 0 4px 10px -3px rgba(15,23,42,.22)',
                    zIndex: 1000,
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                }}>
                    <I.Check style={{ color: '#10B981' }} />
                    {toastMsg}
                </div>
            )}
        </div>
        </ChatActionsCtx.Provider>
    )
}

/* ─────────────────────────────────────────────────────────
   Scoped CSS
   ───────────────────────────────────────────────────────── */
const globalChatStyle = `
.rs-chat-root {
  --rs-blue: #2563EB;
  --rs-blue-600: #1D4ED8;
  --rs-blue-700: #1E40AF;
  --rs-blue-50: #EFF6FF;
  --rs-ink: #0B1220;
  --rs-ink-2: #1E293B;
  --rs-muted: #64748B;
  --rs-muted-2: #94A3B8;
  --rs-line: #E5E7EB;
  --rs-line-2: #EEF2F7;
  --rs-bg-alt: #FAFBFD;

  /* Inset the chat shell from the viewport edges so the sidebar's "Recents"
     list doesn't sit flush against the left edge of the window. The left
     inset is larger than the right so the sidebar visually anchors a bit
     further into the page — feels less like a wall-attached drawer. */
  position: fixed;
  top: 64px; left: 56px; right: 24px; bottom: 0;
  display: flex;
  background: #fff;
  font-family: var(--font-main, Inter, system-ui, sans-serif);
  color: var(--rs-ink);
  -webkit-font-smoothing: antialiased;
}

.rs-chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: #fff;
}

@keyframes rsFadeUp {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes rsTypingBounce {
  0%, 80%, 100% { transform: translateY(0); opacity: .4; }
  40%           { transform: translateY(-4px); opacity: 1; }
}
@keyframes rsToolSpin {
  to { transform: rotate(360deg); }
}
@keyframes rsCaret {
  0%, 49%   { opacity: 1; }
  50%, 100% { opacity: 0; }
}
@keyframes rsStopRing {
  0%   { box-shadow: 0 0 0 0 rgba(220, 38, 38, .35), 0 4px 10px -3px rgba(15,23,42,.4); }
  70%  { box-shadow: 0 0 0 8px rgba(220, 38, 38, 0),   0 4px 10px -3px rgba(15,23,42,.4); }
  100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0),     0 4px 10px -3px rgba(15,23,42,.4); }
}
.rs-fade-up { animation: rsFadeUp .3s ease both; }

/* Streaming caret — a 2-px-wide bar that blinks at the end of the streaming
   assistant bubble. Stops blinking once the streaming prop is removed. */
.rs-streaming::after {
  content: '';
  display: inline-block;
  width: 2px;
  height: 1.05em;
  margin-left: 2px;
  vertical-align: text-bottom;
  background: var(--rs-blue);
  border-radius: 1px;
  animation: rsCaret 1.05s steps(1, end) infinite;
  transform: translateY(2px);
}

/* Stop button — same shape as Send but with a red breathing halo. */
.rs-stop-btn {
  animation: rsStopRing 1.4s ease-in-out infinite;
}
.rs-stop-btn:hover {
  background: #b91c1c !important;
}

/* circle icon buttons in composer */
.rs-c-icon { transition: all .15s ease; cursor: pointer; }
.rs-c-icon:hover { background: var(--rs-bg-alt) !important; color: var(--rs-ink) !important; }

.rs-icon-btn {
  width: 28px; height: 28px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 7px;
  background: transparent; border: none;
  color: var(--rs-muted);
  cursor: pointer;
  transition: all .15s ease;
}
.rs-icon-btn:hover { background: var(--rs-bg-alt); color: var(--rs-ink); }

.rs-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 12px; border-radius: 8px;
  font-size: .75rem; font-weight: 600; letter-spacing: -.005em;
  border: 1px solid transparent;
  transition: all .15s ease;
  cursor: pointer;
  white-space: nowrap;
  font-family: inherit;
}
.rs-btn-primary {
  background: var(--rs-blue); color: #fff;
  box-shadow: 0 4px 10px -3px rgba(37,99,235,.45);
}
.rs-btn-primary:hover { background: var(--rs-blue-600); }
.rs-btn-outline {
  background: #fff; color: var(--rs-ink-2); border-color: var(--rs-line);
  box-shadow: 0 1px 2px rgba(15,23,42,.04);
}
.rs-btn-outline:hover { border-color: #CBD5E1; background: var(--rs-bg-alt); }
.rs-btn-soft {
  background: var(--rs-blue-50); color: var(--rs-blue-700);
  border-color: #C7DBFE;
}
.rs-btn-soft:hover { background: #E0EBFE; }
.rs-btn-ghost { color: var(--rs-ink-2); }
.rs-btn-ghost:hover { background: var(--rs-bg-alt); }

.rs-chip-btn { transition: all .15s ease; }
.rs-chip-btn:not(:disabled):hover {
  border-color: #C7DBFE !important;
  background: var(--rs-blue-50) !important;
  color: var(--rs-blue-700) !important;
}

.rs-followup-chip { transition: all .15s ease; }
.rs-followup-chip:hover {
  border-color: #C7DBFE !important;
  background: var(--rs-blue-50) !important;
  color: var(--rs-blue-700) !important;
  transform: translateY(-1px);
  box-shadow: 0 4px 10px -3px rgba(37,99,235,.18) !important;
}
.rs-followup-chip:active { transform: translateY(0); }

.rs-resume-pick:not(:disabled):hover {
  border-color: #C7DBFE !important;
  background: var(--rs-blue-50) !important;
  box-shadow: 0 6px 18px -6px rgba(15,23,42,.10);
}

.rs-composer:focus-within {
  border-color: var(--rs-blue) !important;
  box-shadow: 0 0 0 4px rgba(37,99,235,.10), 0 12px 36px -12px rgba(15,23,42,.10) !important;
}

.rs-jm-row:hover {
  border-color: #C7DBFE;
  box-shadow: 0 1px 2px rgba(15,23,42,.04), 0 6px 16px -8px rgba(37,99,235,.18);
}

.rs-history-row:hover .rs-history-del { opacity: 1 !important; }
.rs-history-row:hover { background: rgba(37,99,235,.06); }
.rs-history-del:hover { background: #fff; color: #EF4444 !important; }

.rs-new-chat-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 24px -8px rgba(37,99,235,.55);
}

/* thin scrollbar */
.rs-thread-scroll::-webkit-scrollbar { width: 6px; }
.rs-thread-scroll::-webkit-scrollbar-track { background: transparent; }
.rs-thread-scroll::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 99px; }
.rs-thread-scroll::-webkit-scrollbar-thumb:hover { background: #94A3B8; }

/* ─────────────────────────────────────────────────────────
   Assistant Markdown — typography modeled after ChatGPT and
   Claude's response surface. White-dominant body with
   #135bec accents, dark inline-tinted code, generous vertical
   rhythm. Selectors only target inside .rs-asst-md so they
   never leak into UserBubble, tool cards, or composer.
   ───────────────────────────────────────────────────────── */
.rs-asst-md {
  font-size: 0.9375rem;
  line-height: 1.68;
  color: var(--rs-ink, #0F172A);
  letter-spacing: -.003em;
}

/* paragraphs: tight first/last child but real rhythm between */
.rs-asst-md > * + * { margin-top: 0.85em; }
.rs-asst-md > *:first-child { margin-top: 0; }
.rs-asst-md > *:last-child { margin-bottom: 0; }
.rs-asst-md p { margin: 0; }

/* emphasis */
.rs-asst-md strong {
  font-weight: 600;
  color: var(--rs-ink, #0F172A);
  letter-spacing: -.005em;
}
.rs-asst-md em {
  color: var(--rs-ink-2, #1E293B);
  font-style: italic;
}

/* headings — generous space above, tight below, hairline rule on h2 */
.rs-asst-md h1, .rs-asst-md h2, .rs-asst-md h3,
.rs-asst-md h4, .rs-asst-md h5, .rs-asst-md h6 {
  font-weight: 700;
  letter-spacing: -.018em;
  color: var(--rs-ink, #0F172A);
  scroll-margin-top: 80px;
}
.rs-asst-md h1 { font-size: 1.3125rem; margin-top: 1.5em; margin-bottom: .45em; line-height: 1.3; }
.rs-asst-md h2 {
  font-size: 1.0625rem;
  margin-top: 1.4em;
  margin-bottom: .55em;
  line-height: 1.35;
  padding-bottom: .35em;
  border-bottom: 1px solid var(--rs-line, #E2E8F0);
}
.rs-asst-md h3 { font-size: 1rem;    margin-top: 1.25em; margin-bottom: .4em; line-height: 1.4; }
.rs-asst-md h4 { font-size: .9375rem; margin-top: 1.15em; margin-bottom: .35em; }
.rs-asst-md > h1:first-child,
.rs-asst-md > h2:first-child,
.rs-asst-md > h3:first-child { margin-top: 0; }

/* lists — custom blue bullets, generous indent, tight inter-item spacing */
.rs-asst-md ul, .rs-asst-md ol {
  padding-left: 1.55em;
  margin: 0;
}
.rs-asst-md ul { list-style: none; }
.rs-asst-md ul > li {
  position: relative;
  padding-left: .1em;
}
.rs-asst-md ul > li::before {
  content: '';
  position: absolute;
  left: -1.1em;
  top: .68em;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--rs-blue, #135bec);
}
.rs-asst-md ul ul > li::before {
  background: transparent;
  border: 1.5px solid var(--rs-blue, #135bec);
  width: 6px;
  height: 6px;
  top: .62em;
  left: -1.15em;
}
.rs-asst-md ol {
  list-style: none;
  counter-reset: rs-li;
}
.rs-asst-md ol > li {
  position: relative;
  counter-increment: rs-li;
  padding-left: .15em;
}
.rs-asst-md ol > li::before {
  content: counter(rs-li) ".";
  position: absolute;
  left: -1.55em;
  width: 1.3em;
  text-align: right;
  color: var(--rs-blue, #135bec);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  font-size: .9em;
  top: .04em;
}
.rs-asst-md li { margin: .25em 0; }
.rs-asst-md li > p:first-child { margin-top: 0; }
.rs-asst-md li > ul, .rs-asst-md li > ol { margin-top: .3em; margin-bottom: .15em; }

/* links — blue, underline with offset, dotted on hover */
.rs-asst-md a {
  color: var(--rs-blue, #135bec);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
  text-decoration-color: rgba(19, 91, 236, .35);
  transition: text-decoration-color .15s ease;
}
.rs-asst-md a:hover {
  text-decoration-color: var(--rs-blue, #135bec);
}

/* inline code — slate tint instead of blue so it doesn't shout */
.rs-asst-md code {
  background: #F1F5F9;
  border: 1px solid #E2E8F0;
  border-radius: 5px;
  padding: 1.5px 6px;
  font-size: 0.85em;
  color: #0F172A;
  font-family: var(--font-mono, 'JetBrains Mono', 'Fira Code', ui-monospace, monospace);
  font-feature-settings: 'liga' 0, 'calt' 0;
  white-space: nowrap;
}

/* block code — dark theme with language label */
.rs-asst-md pre {
  position: relative;
  background: #0F172A;
  border: 1px solid #1E293B;
  border-radius: 12px;
  padding: 14px 16px;
  overflow-x: auto;
  margin: 0;
  box-shadow: 0 1px 0 rgba(255, 255, 255, .03) inset;
}
.rs-asst-md pre code {
  background: transparent;
  border: none;
  padding: 0;
  color: #E2E8F0;
  font-size: .8125rem;
  line-height: 1.6;
  white-space: pre;
  display: block;
}
/* language tag — pulled from the language-xxx class set by remark-gfm */
.rs-asst-md pre code[class*="language-"]::before {
  content: attr(data-language);
  position: absolute;
  top: 10px; right: 14px;
  font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
  font-size: .6875rem;
  font-weight: 600;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: #64748B;
}

/* tables — bordered, sticky header, striped rows */
.rs-asst-md table {
  border-collapse: collapse;
  width: 100%;
  font-size: .875rem;
  border: 1px solid var(--rs-line, #E2E8F0);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(15, 23, 42, .04);
}
.rs-asst-md thead { background: #F8FAFC; }
.rs-asst-md th {
  text-align: left;
  font-weight: 600;
  color: #334155;
  font-size: .75rem;
  letter-spacing: .04em;
  text-transform: uppercase;
  padding: 10px 14px;
  border-bottom: 1px solid var(--rs-line, #E2E8F0);
}
.rs-asst-md td {
  padding: 10px 14px;
  border-top: 1px solid #F1F5F9;
  color: var(--rs-ink-2, #1E293B);
  vertical-align: top;
}
.rs-asst-md tbody tr:nth-child(even) { background: #FBFCFD; }

/* horizontal rule — soft gradient line */
.rs-asst-md hr {
  height: 1px;
  border: 0;
  background: linear-gradient(to right, transparent, var(--rs-line, #E2E8F0) 20%, var(--rs-line, #E2E8F0) 80%, transparent);
  margin: 1.4em 0;
}

/* blockquote — left bar in blue, slight tinted bg, italic body */
.rs-asst-md blockquote {
  border-left: 3px solid var(--rs-blue, #135bec);
  padding: .1em 0 .1em 14px;
  margin: 0;
  color: var(--rs-ink-2, #1E293B);
  background: linear-gradient(to right, rgba(19, 91, 236, .035), transparent 70%);
  border-radius: 0 4px 4px 0;
}
.rs-asst-md blockquote p { font-style: normal; }
.rs-asst-md blockquote p::first-letter { color: var(--rs-ink, #0F172A); }

/* keyboard <kbd> if it ever appears */
.rs-asst-md kbd {
  display: inline-block;
  padding: 1px 6px;
  font-size: .8em;
  font-family: var(--font-mono, ui-monospace, monospace);
  color: #0F172A;
  background: #F8FAFC;
  border: 1px solid #CBD5E1;
  border-bottom-width: 2px;
  border-radius: 4px;
  vertical-align: middle;
  line-height: 1.5;
}

/* details/summary if model uses it */
.rs-asst-md details {
  border: 1px solid var(--rs-line, #E2E8F0);
  border-radius: 8px;
  padding: 10px 12px;
  background: #FBFCFD;
}
.rs-asst-md summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--rs-ink, #0F172A);
  list-style: none;
}
.rs-asst-md summary::-webkit-details-marker { display: none; }
.rs-asst-md summary::before {
  content: '▸';
  margin-right: 6px;
  color: var(--rs-muted, #64748B);
  display: inline-block;
  transition: transform .15s ease;
}
.rs-asst-md details[open] summary::before { transform: rotate(90deg); }

/* While streaming, the caret sits flush with last line of content. */
.rs-asst-md.rs-streaming > *:last-child { display: inline; }

/* responsive: collapse sidebar on small screens */
@media (max-width: 880px) {
  .rs-chat-root > aside { width: 0; overflow: hidden; border-right: none; }
}

/* mobile: full-bleed chat area (dashboard left nav collapses to 0) */
@media (max-width: 767px) {
  .rs-chat-root {
    left: 0 !important;
    right: 0 !important;
  }
}
`
