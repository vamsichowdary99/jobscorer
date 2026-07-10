// resuscore/src/components/resume-editor/CoverLetterView.tsx
'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CoverLetter } from '@/lib/types'
import { handleQuota } from '@/lib/quota'
import { M } from '@/lib/meridianTokens'

export type CoverLetterStatus = 'idle' | 'loading' | 'ready' | 'error' | 'quota' | 'not_optimized'

export interface CoverLetterController {
    letter: CoverLetter | null
    status: CoverLetterStatus
    error: string | null
    generate: (force?: boolean) => void
}

/**
 * Owns the cover letter's fetch lifecycle for one (resumeId, jobId) pair.
 * Instantiate ONCE per selected resume in the parent page and share the same
 * controller between the desktop panel and the mobile overlay — that's what
 * makes cache-hit state and the in-flight guard survive a tab switch.
 */
export function useCoverLetter(resumeId: string | null, jobId: string | null): CoverLetterController {
    const [letter, setLetter] = useState<CoverLetter | null>(null)
    const [status, setStatus] = useState<CoverLetterStatus>('idle')
    const [error, setError] = useState<string | null>(null)
    const inFlightRef = useRef(false)
    // Lets an in-flight response detect it's answering a since-abandoned
    // (resumeId, jobId) pair — e.g. the user switched resumes mid-request.
    const idsRef = useRef<{ resumeId: string | null; jobId: string | null }>({ resumeId, jobId })

    // Keeps idsRef in sync for the staleness check inside generate()'s async
    // callback — a plain sync effect, no setState, so it's a one-way mirror.
    // Also clears inFlightRef: it's a single guard shared by the whole hook,
    // not scoped per pair, so without this a click on a newly-selected resume
    // would be silently dropped while a stale fetch for the OLD resume is
    // still in flight (that stale response is separately neutralized by
    // isStale() below, so clearing the guard here is safe).
    useEffect(() => {
        idsRef.current = { resumeId, jobId }
        inFlightRef.current = false
    }, [resumeId, jobId])

    // Reset state when the selected (resume, job) pair changes. Adjusted
    // during render (React's documented pattern for this) rather than in a
    // useEffect, which would cost an extra commit + cascading render.
    const [prevIds, setPrevIds] = useState({ resumeId, jobId })
    if (prevIds.resumeId !== resumeId || prevIds.jobId !== jobId) {
        setPrevIds({ resumeId, jobId })
        setLetter(null)
        setStatus('idle')
        setError(null)
    }

    const generate = useCallback((force = false) => {
        if (inFlightRef.current || !resumeId || !jobId) return
        const myResumeId = resumeId
        const myJobId = jobId
        const isStale = () => idsRef.current.resumeId !== myResumeId || idsRef.current.jobId !== myJobId

        inFlightRef.current = true
        setStatus('loading')
        setError(null)

        fetch('/api/cover-letter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resume_id: myResumeId, job_id: myJobId, force_refresh: force }),
        })
            .then(async (res) => {
                if (isStale()) return
                if (res.status === 402) {
                    await handleQuota(res)
                    const body = await res.json().catch(() => ({}) as Record<string, unknown>)
                    setStatus('quota')
                    setError(typeof body.error === 'string' ? body.error : 'Monthly limit reached.')
                    return
                }
                if (res.status === 409) {
                    setStatus('not_optimized')
                    return
                }
                const body = await res.json().catch(() => ({}) as Record<string, unknown>)
                if (!res.ok || !body.success) {
                    setStatus('error')
                    setError(typeof body.error === 'string' ? body.error : 'Could not generate the cover letter.')
                    return
                }
                setLetter(body.cover_letter as CoverLetter)
                setStatus('ready')
            })
            .catch(() => {
                if (isStale()) return
                setStatus('error')
                setError('Could not reach the server. Check your connection and try again.')
            })
            .finally(() => {
                inFlightRef.current = false
            })
    }, [resumeId, jobId])

    return { letter, status, error, generate }
}

// ── Paper card shell — same maxWidth/shadow as the recruiters preview ──────
const PAPER_SHADOW = '0 4px 32px rgba(15,30,64,0.10), 0 1px 4px rgba(15,30,64,0.06), 0 12px 48px rgba(15,30,64,0.06)'

function PaperShell({ children, compact }: { children: React.ReactNode; compact?: boolean }) {
    return (
        <div style={{ flex: 1, overflowY: 'auto', padding: compact ? '10px 8px 20px' : '28px 28px 48px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: '100%', maxWidth: 700, minHeight: compact ? undefined : 880, background: '#fffffe', boxShadow: PAPER_SHADOW, borderRadius: compact ? 6 : 2 }}>
                {children}
            </div>
        </div>
    )
}

function shimmerBlock(width: string, height = 11): React.ReactElement {
    return (
        <div style={{
            width, height, borderRadius: 4,
            background: `linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)`,
            backgroundSize: '400px 100%', animation: 'cl-shimmer 1.4s infinite linear',
        }} />
    )
}

function LetterSkeleton({ compact }: { compact?: boolean }) {
    return (
        <PaperShell compact={compact}>
            <style>{`@keyframes cl-shimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }`}</style>
            <div style={{ padding: compact ? '24px 20px' : '64px 64px 48px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
                    {shimmerBlock('38%', 16)}
                    {shimmerBlock('56%', 10)}
                </div>
                <div style={{ height: 1, background: M.borderLight, margin: '24px 0 28px' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 28 }}>
                    {shimmerBlock('30%')}
                    {shimmerBlock('22%')}
                </div>
                {[92, 100, 96, 68].map((w, i) => (
                    <div key={i} style={{ marginBottom: i === 3 ? 0 : 10 }}>{shimmerBlock(`${w}%`)}</div>
                ))}
            </div>
        </PaperShell>
    )
}

// ── Sanitizers matching the resume PDF's download filename convention ──────
function sanitizeForFilename(s: string): string {
    return s.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_')
}

interface ActionButtonProps {
    onClick: () => void
    disabled?: boolean
    variant?: 'primary' | 'secondary' | 'error'
    children: React.ReactNode
}

function ActionButton({ onClick, disabled, variant = 'secondary', children }: ActionButtonProps) {
    const isPrimary = variant === 'primary'
    const isError = variant === 'error'
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '9px 16px', borderRadius: 8,
                background: isError ? M.red : isPrimary ? (disabled ? '#334155' : `linear-gradient(135deg, ${M.accent}, ${M.accentMid})`) : M.white,
                color: isPrimary || isError ? '#fff' : M.textMuted,
                border: isPrimary || isError ? 'none' : `1.5px solid ${M.border}`,
                fontWeight: isPrimary || isError ? 700 : 600, fontSize: '0.8125rem',
                cursor: disabled ? 'wait' : 'pointer', fontFamily: M.fontBody,
                boxShadow: isPrimary && !disabled ? `0 2px 10px -2px ${M.accent}66` : 'none',
                transition: 'all 0.15s',
            }}
        >
            {children}
        </button>
    )
}

interface CoverLetterViewProps {
    controller: CoverLetterController
    entry: { resume_id: string; job_id: string } | null
    job: { title?: string | null; company?: string | null; location?: string | null } | null
    profileState: { name: string; email: string; phone: string; location: string; linkedin: string; github: string; portfolio: string }
    // Mobile overlay — shrinks the letter to a shown-in-full miniature (same
    // `zoom` technique the resume preview uses) while keeping action buttons
    // at normal, tappable size below it. See the "ready" branch below.
    compact?: boolean
}

export function CoverLetterView({ controller, entry, job, profileState, compact = false }: CoverLetterViewProps) {
    const router = useRouter()
    const { letter, status, error, generate } = controller
    const [copied, setCopied] = useState(false)
    const [pdfLoading, setPdfLoading] = useState(false)
    const [pdfError, setPdfError] = useState(false)

    const handleCopy = useCallback(() => {
        if (!letter) return
        const text = `${letter.greeting}\n\n${letter.body_paragraphs.join('\n\n')}\n\n${letter.closing}\n${letter.signature}`
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1800)
        }).catch(() => { /* clipboard permission denied — no-op */ })
    }, [letter])

    const handleDownloadPdf = useCallback(async () => {
        if (!letter) return
        setPdfLoading(true)
        setPdfError(false)
        try {
            const [renderer, pdfDoc] = await Promise.all([
                import('@react-pdf/renderer'),
                import('@/components/ResumeRenderer/CoverLetterPdfDocument'),
            ])
            const doc = React.createElement(pdfDoc.default, { letter, profile: profileState, job: job ?? null })
            const blob = await renderer.pdf(doc as Parameters<typeof renderer.pdf>[0]).toBlob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            const safeName = sanitizeForFilename(profileState.name || 'Resume')
            const safeCompany = job?.company ? sanitizeForFilename(job.company) : ''
            a.download = safeCompany ? `${safeCompany}_-_${safeName}_Cover_Letter.pdf` : `${safeName}_Cover_Letter.pdf`
            a.click()
            URL.revokeObjectURL(url)
        } catch (err) {
            console.error('Cover letter PDF error:', err)
            setPdfError(true)
            setTimeout(() => setPdfError(false), 3000)
        } finally {
            setPdfLoading(false)
        }
    }, [letter, profileState, job])

    // ── No-entry (raw-resume mode) — never calls the API at all ──
    if (!entry) {
        return (
            <PaperShell compact={compact}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: compact ? 260 : 880, padding: compact ? 24 : 48, textAlign: 'center' }}>
                    <div style={{ width: 52, height: 52, borderRadius: 14, background: M.surfaceAlt, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={M.textFaint} strokeWidth="1.8"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
                    </div>
                    <div style={{ fontSize: '1.0625rem', fontWeight: 700, color: M.text, fontFamily: M.fontHeading, marginBottom: 6 }}>
                        Cover letters are written from a job-optimized resume
                    </div>
                    <div style={{ fontSize: '0.875rem', color: M.textMuted, fontFamily: M.fontBody, maxWidth: 360, marginBottom: 20, lineHeight: 1.5 }}>
                        Optimize this resume for a job first — the cover letter draws its proof points from that match.
                    </div>
                    <button
                        onClick={() => router.push('/dashboard/matches')}
                        style={{ padding: '11px 22px', background: M.accent, color: '#fff', border: 'none', borderRadius: 9, fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', fontFamily: M.fontBody, boxShadow: '0 4px 14px -4px rgba(29,106,245,0.4)' }}
                    >
                        Find a job to optimize for
                    </button>
                </div>
            </PaperShell>
        )
    }

    // ── Row of action buttons shown under a ready letter ──
    const actionsRow = (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '16px 28px 32px', maxWidth: 700, margin: '0 auto', width: '100%' }}>
            <ActionButton onClick={() => generate(true)} disabled={status === 'loading'}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"><path d="M21 12a9 9 0 11-3-6.7" /><path d="M21 3v6h-6" /></svg>
                Regenerate
            </ActionButton>
            <ActionButton onClick={handleCopy}>
                {copied ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={M.green} strokeWidth="2.6"><path d="M20 6L9 17l-5-5" /></svg>
                ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 012-2h10" /></svg>
                )}
                {copied ? 'Copied' : 'Copy'}
            </ActionButton>
            <ActionButton onClick={handleDownloadPdf} disabled={pdfLoading} variant={pdfError ? 'error' : 'primary'}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>
                {pdfLoading ? 'Generating…' : pdfError ? 'Failed — Retry' : 'Download PDF'}
            </ActionButton>
        </div>
    )

    // ── Loading ──
    if (status === 'loading' && !letter) return <LetterSkeleton compact={compact} />

    // ── Quota exceeded ──
    if (status === 'quota') {
        return (
            <PaperShell compact={compact}>
                <StateMessage
                    compact={compact}
                    tone="amber"
                    title="You've used all your cover letters for this month"
                    body={error ?? 'Upgrade your plan for more.'}
                    action={{ label: 'See plans', onClick: () => router.push('/dashboard/billing') }}
                />
            </PaperShell>
        )
    }

    // ── Row-deleted race / any other not_optimized surfaced mid-session ──
    if (status === 'not_optimized') {
        return (
            <PaperShell compact={compact}>
                <StateMessage
                    compact={compact}
                    tone="neutral"
                    title="This resume isn't optimized for a job anymore"
                    body="Optimize it again for this job, then come back to generate a cover letter."
                    action={{ label: 'Go to matches', onClick: () => router.push('/dashboard/matches') }}
                />
            </PaperShell>
        )
    }

    // ── Error ──
    if (status === 'error') {
        return (
            <PaperShell compact={compact}>
                <StateMessage
                    compact={compact}
                    tone="red"
                    title="Couldn't generate the cover letter"
                    body={error ?? 'Something went wrong. Try again.'}
                    action={{ label: 'Retry', onClick: () => generate(false) }}
                />
            </PaperShell>
        )
    }

    // ── Empty (idle) — the tab's landing state. Generation is opt-in: nothing
    // runs until this button is clicked, so opening the tab never spends quota
    // or triggers the n8n workflow on its own. ──
    if (!letter) {
        return (
            <PaperShell compact={compact}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: compact ? 260 : 880, padding: compact ? 24 : 48, textAlign: 'center' }}>
                    <div style={{
                        width: compact ? 52 : 64, height: compact ? 52 : 64, borderRadius: compact ? 14 : 18,
                        background: `linear-gradient(135deg, ${M.accent}, ${M.accentMid})`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
                        boxShadow: `0 8px 24px -6px ${M.accent}66`,
                    }}>
                        <svg width={compact ? 22 : 28} height={compact ? 22 : 28} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
                    </div>
                    <div style={{ fontSize: compact ? '1rem' : '1.1875rem', fontWeight: 700, color: M.text, fontFamily: M.fontHeading, marginBottom: 8, letterSpacing: '-0.01em' }}>
                        Write your cover letter{job?.title ? ` for ${job.title}` : ''}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: M.textMuted, fontFamily: M.fontBody, maxWidth: 380, marginBottom: 24, lineHeight: 1.55 }}>
                        Grounded in your optimized resume and {job?.company ? job.company : 'this job'}&apos;s requirements — no invented skills.
                    </div>
                    <button
                        onClick={() => generate(false)}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                            padding: compact ? '11px 20px' : '13px 28px',
                            background: `linear-gradient(135deg, ${M.accent}, ${M.accentMid})`, color: '#fff', border: 'none',
                            borderRadius: 10, fontSize: compact ? '13.5px' : '14.5px', fontWeight: 700, cursor: 'pointer',
                            fontFamily: M.fontBody, boxShadow: `0 6px 18px -4px ${M.accent}66`,
                        }}
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" /><circle cx="11" cy="11" r="2" /></svg>
                        Generate Cover Letter
                    </button>
                    <div style={{ marginTop: 12, fontSize: '0.75rem', color: M.textFaint, fontFamily: M.fontBody }}>
                        Takes about 15 seconds
                    </div>
                </div>
            </PaperShell>
        )
    }

    // ── Ready — the letter itself ──
    const dateLabel = new Date(letter.generated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    const contactParts = [profileState.email, profileState.phone, profileState.location, profileState.linkedin].filter(Boolean)

    const letterCard = (
        <div style={{
            width: '100%', maxWidth: 700, background: '#fffffe', boxShadow: compact ? 'none' : PAPER_SHADOW, borderRadius: 2,
            padding: '56px 64px 64px', fontFamily: M.fontHeading, color: '#1a1a1a',
            animation: compact ? undefined : 'cl-fade-in 0.25s ease-out',
        }}>
            <style>{`@keyframes cl-fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }`}</style>

            {/* Letterhead */}
            <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: '1.0625rem', fontWeight: 700, letterSpacing: '0.01em' }}>{profileState.name || 'Your Name'}</div>
                {contactParts.length > 0 && (
                    <div style={{ fontSize: '0.75rem', color: '#5a5a5a', marginTop: 3, fontFamily: M.fontBody }}>
                        {contactParts.join('  ·  ')}
                    </div>
                )}
            </div>
            <div style={{ height: 1, background: '#d8d8d8' }} />

            {/* Date + Re line */}
            <div style={{ marginTop: 22, marginBottom: 22, fontSize: '0.8125rem', color: '#444', fontFamily: M.fontBody }}>
                <div>{dateLabel}</div>
                {job?.title && (
                    <div style={{ marginTop: 4 }}>
                        Re: {job.title}{job.company ? ` — ${job.company}` : ''}
                    </div>
                )}
            </div>

            {/* Body */}
            <div style={{ fontSize: 15, lineHeight: 1.7 }}>
                <p style={{ margin: '0 0 14px' }}>{letter.greeting}</p>
                {letter.body_paragraphs.map((p, i) => (
                    <p key={i} style={{ margin: '0 0 14px' }}>{p}</p>
                ))}
                <p style={{ margin: '28px 0 0' }}>{letter.closing}</p>
                <p style={{ margin: '4px 0 0', fontWeight: 700 }}>{letter.signature}</p>
            </div>
        </div>
    )

    // Compact (mobile overlay) — same `zoom` shrink-to-fit technique the resume
    // preview uses, so the whole letter is visible without scrolling. Actions
    // stay outside the zoomed box, at normal tappable size, like the resume
    // overlay's own "Change Template" / "Download PDF" footer.
    if (compact) {
        return (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', background: '#f1f5f9', padding: '8px 6px 16px' }}>
                    <div style={{ background: '#fff', borderRadius: 6, boxShadow: '0 2px 12px rgba(15,23,42,0.08)', overflow: 'hidden' }}>
                        <div style={{ width: 700, zoom: 0.45, pointerEvents: 'none' }}>
                            {letterCard}
                        </div>
                    </div>
                </div>
                <div style={{ flexShrink: 0, padding: '10px 14px', display: 'flex', gap: 8, borderTop: `1px solid ${M.borderLight}`, background: M.white }}>
                    <ActionButton onClick={() => generate(true)} disabled={status === 'loading'}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"><path d="M21 12a9 9 0 11-3-6.7" /><path d="M21 3v6h-6" /></svg>
                        Regenerate
                    </ActionButton>
                    <ActionButton onClick={handleCopy}>
                        {copied ? (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={M.green} strokeWidth="2.6"><path d="M20 6L9 17l-5-5" /></svg>
                        ) : (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 012-2h10" /></svg>
                        )}
                        {copied ? 'Copied' : 'Copy'}
                    </ActionButton>
                    <ActionButton onClick={handleDownloadPdf} disabled={pdfLoading} variant="primary">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>
                        {pdfLoading ? 'Generating…' : 'Download PDF'}
                    </ActionButton>
                </div>
            </div>
        )
    }

    return (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, padding: '28px 28px 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {letterCard}
            </div>
            {actionsRow}
        </div>
    )
}

function StateMessage({ tone, title, body, action, compact }: {
    tone: 'red' | 'amber' | 'neutral'
    title: string
    body: string
    action: { label: string; onClick: () => void }
    compact?: boolean
}) {
    const color = tone === 'red' ? M.red : tone === 'amber' ? M.amber : M.textMuted
    const bg = tone === 'red' ? '#fee2e2' : tone === 'amber' ? M.amberLight : M.surfaceAlt
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: compact ? 260 : 880, padding: compact ? 24 : 48, textAlign: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M12 9v4M12 17h.01" /><circle cx="12" cy="12" r="9" /></svg>
            </div>
            <div style={{ fontSize: '1.0625rem', fontWeight: 700, color: M.text, fontFamily: M.fontHeading, marginBottom: 6 }}>{title}</div>
            <div style={{ fontSize: '0.875rem', color: M.textMuted, fontFamily: M.fontBody, maxWidth: 360, marginBottom: 20, lineHeight: 1.5 }}>{body}</div>
            <button
                onClick={action.onClick}
                style={{ padding: '10px 20px', background: M.white, color: M.text, border: `1.5px solid ${M.border}`, borderRadius: 9, fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', fontFamily: M.fontBody }}
            >
                {action.label}
            </button>
        </div>
    )
}
