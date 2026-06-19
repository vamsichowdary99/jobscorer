'use client'

/**
 * Paste Job Description — modal triggered from the Search page when the user
 * wants to score a job they found *outside* our ingestion pipeline (LinkedIn,
 * Naukri, referral, etc.). They paste the JD, we drop a row into `jobs`, run
 * the same scoring/research workflows we'd run on any ingested job, then send
 * them to Matches/Optimize.
 *
 * Design mirrors the prototype in resuscore/project/Paste Job Description.html
 * from the Claude design handoff — same gradient icon badge, 580px card, 3-step
 * loading checklist, success state with two CTAs.
 */

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/providers/AuthProvider'
import {
    createManualJob,
    triggerScoring,
    getPrimaryResumeId,
    fetchResumeById,
    triggerCompanyResearch,
    CompanyResearchPendingError,
    RateLimitError,
} from '@/lib/api'
import { createClient as createBrowserSupabase } from '@/lib/supabase/client'

const DESCRIPTION_LIMIT = 8000

type Phase = 'form' | 'loading' | 'success' | 'error'
type StepIdx = 0 | 1 | 2 | 3

const STEP_LABELS = [
    'Saving job to your database',
    'Scoring against your resume',
    'Researching the company',
] as const

export function PasteJobButton({ compact }: { compact?: boolean } = {}) {
    const [open, setOpen] = useState(false)
    return (
        <>
            {compact ? (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        padding: '10px 8px', borderRadius: 10,
                        border: '1.5px solid #BFDBFE', background: '#fff',
                        color: '#135bec', fontWeight: 700, fontSize: '0.875rem',
                        cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                    }}
                >
                    <ClipIcon size={14} color="#135bec" sw={2} />
                    Paste JD
                </button>
            ) : (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="rs-paste-trigger"
                    aria-label="Paste a job description from elsewhere"
                >
                    <span className="rs-paste-trigger__icon">
                        <ClipIcon size={20} color="#fff" sw={1.75} />
                    </span>
                    <span className="rs-paste-trigger__pill">
                        Paste Job Description
                    </span>
                </button>
            )}
            {open && <PasteJobModal onClose={() => setOpen(false)} />}
            <style>{TRIGGER_CSS}</style>
        </>
    )
}

function PasteJobModal({ onClose }: { onClose: () => void }) {
    const { user } = useAuth()
    const router = useRouter()

    // ── Form state ────────────────────────────────────────────
    const [company, setCompany] = useState('')
    const [jobTitle, setJobTitle] = useState('')
    const [location, setLocation] = useState('')
    const [description, setDescription] = useState('')
    const [url, setUrl] = useState('')
    const [showUrl, setShowUrl] = useState(false)

    // ── Pipeline state ────────────────────────────────────────
    const [phase, setPhase] = useState<Phase>('form')
    const [step, setStep] = useState<StepIdx>(0)
    const [jobId, setJobId] = useState<string | null>(null)
    const [score, setScore] = useState<number | null>(null)
    const [errorMsg, setErrorMsg] = useState('')
    // Single source of truth for "should this submission keep going" — the
    // AbortSignal owned by handleSubmit's controller. We deliberately avoid a
    // separate `cancelledRef = useRef(false)`: React 19 Strict Mode runs the
    // useEffect cleanup once on mount as an idempotency probe, which would
    // permanently flip a "cancelled" ref to true and poison every future
    // submit. Using a per-submit AbortController scoped inside handleSubmit
    // sidesteps that entirely.
    const abortRef = useRef<AbortController | null>(null)

    useEffect(() => () => {
        // Only abort in-flight work on UNMOUNT. Strict Mode runs this cleanup
        // immediately after the first mount in dev — that's safe because
        // there's no in-flight work yet (abortRef is still null on first cleanup).
        abortRef.current?.abort()
    }, [])

    // Hard close — abort then call the parent close handler.
    function handleClose() {
        abortRef.current?.abort()
        onClose()
    }

    const canSubmit = company.trim().length > 0 && description.trim().length > 0

    async function handleSubmit() {
        if (!canSubmit) return
        if (!user?.id) { setErrorMsg('Sign in first to score this job.'); setPhase('error'); return }

        const resumeId = getPrimaryResumeId()
        if (!resumeId) {
            setErrorMsg('Pick a primary resume first. Go to Upload → click a resume → "Use this for scoring".')
            setPhase('error')
            return
        }

        // Fresh AbortController for this submission. handleClose triggers .abort().
        abortRef.current = new AbortController()
        const signal = abortRef.current.signal

        setPhase('loading')
        setStep(0)
        setErrorMsg('')

        // ── Step 0 → 1: insert the job row ────────────────────
        let newJobId: string
        console.log('[paste-job] step 0: saving job…')
        try {
            const { id } = await createManualJob({
                title: jobTitle.trim(),
                company: company.trim(),
                location: location.trim() || undefined,
                description: description.trim(),
                source_url: url.trim() || undefined,
            }, { signal })
            newJobId = id
            setJobId(id)
            console.log('[paste-job] step 0 done → jobId:', id)
        } catch (err) {
            console.error('[paste-job] step 0 failed:', err)
            if (signal.aborted) return  // user closed; nothing to do
            setErrorMsg(err instanceof Error ? err.message : 'Could not save the job. Try again.')
            setPhase('error')
            return
        }
        if (signal.aborted) return
        setStep(1)

        // ── Step 1 → 2: score the job ─────────────────────────
        console.log('[paste-job] step 1: triggering scoring…')
        try {
            const result = await triggerScoring({
                resumeId,
                userId: user.id,
                jobIds: [newJobId],
                mode: 'all',         // single job — RAG shortlist makes no sense
                forceScore: true,    // brand-new job, no cached score to honor
            })
            console.log('[paste-job] step 1 triggered:', result)
        } catch (err) {
            console.error('[paste-job] step 1 failed:', err)
            if (err instanceof RateLimitError) {
                setErrorMsg(`Slow down — try again in ${err.retryAfterSec}s.`)
            } else {
                setErrorMsg(err instanceof Error ? err.message : 'Scoring failed.')
            }
            setPhase('error')
            return
        }

        // Poll user_job_matches until the row lands — same pattern as the
        // existing per-job scoring in the search page.
        const supabase = createBrowserSupabase()
        const deadline = Date.now() + 90_000
        let scored: number | null = null
        while (Date.now() < deadline) {
            if (signal.aborted) return
            const { data } = await supabase
                .from('user_job_matches')
                .select('relevance_score')
                .eq('user_id', user.id)
                .eq('resume_id', resumeId)
                .eq('job_id', newJobId)
                .maybeSingle()
            const row = data as { relevance_score: number | null } | null
            if (row?.relevance_score != null) {
                scored = row.relevance_score
                break
            }
            await new Promise(r => setTimeout(r, 2000))
        }
        if (signal.aborted) return
        if (scored === null) {
            setErrorMsg('Scoring is taking longer than expected. Check AI Matches in a minute.')
            setPhase('error')
            return
        }
        setScore(Math.round(scored))
        setStep(2)

        // ── Step 2 → 3: kick off company research (fire-and-forget) ──
        // We don't await — the workflow runs longer than the modal stays
        // open. The user can open the Research page when they want it.
        ;(async () => {
            try {
                const resume = await fetchResumeById(resumeId)
                if (!resume) return
                await triggerCompanyResearch({
                    job_id: newJobId,
                    user_id: user.id,
                    resume_id: resumeId,
                    job: {
                        id: newJobId,
                        created_at: new Date().toISOString(),
                        source: 'manual_paste',
                        source_id: '',
                        title: jobTitle.trim() || `${company.trim()} role`,
                        company: company.trim(),
                        location: location.trim() || null,
                        description: description.trim(),
                        salary: null,
                        posted_date: new Date().toISOString(),
                        schedule_type: null,
                        source_url: url.trim() || null,
                        experience_level: null,
                        required_skills: null,
                    },
                    resume: { structured_data: resume.structured_data },
                }, { timeoutMs: 5000 })
            } catch (err) {
                // CompanyResearchPendingError is expected — workflow continues server-side.
                if (!(err instanceof CompanyResearchPendingError)) {
                    console.warn('[paste-job] company research kickoff failed:', err)
                }
            }
        })()

        setStep(3)
        // Small beat so the user sees step 3 tick to done.
        setTimeout(() => { if (!signal.aborted) setPhase('success') }, 600)
    }

    function handleViewScore() {
        if (jobId) router.push(`/dashboard/matches?jobId=${jobId}`)
        onClose()
    }
    function handleGenerateResume() {
        if (jobId) router.push(`/dashboard/optimize?jobId=${jobId}`)
        onClose()
    }

    return (
        <>
            <div
                onClick={e => { if (e.target === e.currentTarget) handleClose() }}
                className="rs-paste-overlay"
            >
                <div className="rs-paste-card" role="dialog" aria-modal="true" aria-label="Paste Job Description">
                    <div className="rs-paste-handle" aria-hidden="true" />
                    <button onClick={handleClose} className="rs-paste-close" aria-label="Close">
                        <XIcon />
                    </button>

                    {phase === 'form' && (
                        <FormPhase
                            company={company} setCompany={setCompany}
                            jobTitle={jobTitle} setJobTitle={setJobTitle}
                            location={location} setLocation={setLocation}
                            description={description} setDescription={setDescription}
                            url={url} setUrl={setUrl}
                            showUrl={showUrl} setShowUrl={setShowUrl}
                            canSubmit={canSubmit}
                            onCancel={handleClose}
                            onSubmit={handleSubmit}
                        />
                    )}

                    {phase === 'loading' && (
                        <LoadingPhase step={step} onCancel={handleClose} />
                    )}

                    {phase === 'success' && (
                        <SuccessPhase
                            score={score}
                            onViewScore={handleViewScore}
                            onGenerateResume={handleGenerateResume}
                        />
                    )}

                    {phase === 'error' && (
                        <ErrorPhase
                            message={errorMsg}
                            onRetry={() => { setPhase('form'); setErrorMsg('') }}
                            onClose={handleClose}
                        />
                    )}
                </div>
            </div>
            <style>{MODAL_CSS}</style>
        </>
    )
}

// ── FORM ─────────────────────────────────────────────────────

function FormPhase(props: {
    company: string; setCompany: (v: string) => void
    jobTitle: string; setJobTitle: (v: string) => void
    location: string; setLocation: (v: string) => void
    description: string; setDescription: (v: string) => void
    url: string; setUrl: (v: string) => void
    showUrl: boolean; setShowUrl: (v: boolean) => void
    canSubmit: boolean
    onCancel: () => void
    onSubmit: () => void
}) {
    const counterTone = props.description.length > 7000 ? '#F59E0B' : '#94A3B8'

    return (
        <>
            <div className="rs-paste-header">
                <div className="rs-paste-header__badge">
                    <ClipIcon size={20} color="#135bec" />
                </div>
                <div>
                    <h2 className="rs-paste-header__title">Score any job, from anywhere</h2>
                    <p className="rs-paste-header__sub">
                        Paste a job description from LinkedIn, Naukri, a referral, or anywhere else.
                    </p>
                </div>
            </div>

            <div className="rs-paste-form">
                <div className="rs-paste-grid-2">
                    <Field label="Company Name" required>
                        <input
                            value={props.company}
                            onChange={e => props.setCompany(e.target.value)}
                            placeholder="e.g. Stripe"
                            className="rs-paste-input"
                        />
                    </Field>
                    <Field label="Job Title">
                        <input
                            value={props.jobTitle}
                            onChange={e => props.setJobTitle(e.target.value)}
                            placeholder="e.g. Senior Backend Engineer"
                            className="rs-paste-input"
                        />
                    </Field>
                </div>

                <Field label="Location" optional>
                    <input
                        value={props.location}
                        onChange={e => props.setLocation(e.target.value)}
                        placeholder="e.g. Bengaluru / Remote"
                        className="rs-paste-input"
                    />
                </Field>

                <div>
                    <div className="rs-paste-field-row">
                        <label className="rs-paste-label">Job Description <span className="rs-paste-required-dot" /></label>
                        <span className="rs-paste-counter" style={{ color: counterTone }}>
                            {props.description.length.toLocaleString()} / {DESCRIPTION_LIMIT.toLocaleString()}
                        </span>
                    </div>
                    <textarea
                        value={props.description}
                        onChange={e => props.setDescription(e.target.value.slice(0, DESCRIPTION_LIMIT))}
                        placeholder="Paste the full job description here…"
                        className="rs-paste-textarea"
                    />
                </div>

                {!props.showUrl ? (
                    <button type="button" onClick={() => props.setShowUrl(true)} className="rs-paste-link">
                        <span className="rs-paste-link__plus">+</span> Add source URL (optional)
                    </button>
                ) : (
                    <Field label="Source URL" optional>
                        <input
                            value={props.url}
                            onChange={e => props.setUrl(e.target.value)}
                            placeholder="https://linkedin.com/jobs/view/…"
                            className="rs-paste-input"
                        />
                    </Field>
                )}

                <div className="rs-paste-info">
                    <span className="rs-paste-info__icon"><InfoIcon /></span>
                    <p className="rs-paste-info__text">
                        We&apos;ll run scoring, company research, and resume optimisation — same as any job in our database.
                    </p>
                </div>

                <div className="rs-paste-actions">
                    <button onClick={props.onCancel} className="rs-paste-btn-ghost" type="button">Cancel</button>
                    <button
                        onClick={props.onSubmit}
                        disabled={!props.canSubmit}
                        className="rs-paste-btn-primary"
                        type="button"
                    >
                        Analyze Job <span aria-hidden>→</span>
                    </button>
                </div>
            </div>
        </>
    )
}

function Field({ label, required, optional, children }: {
    label: string; required?: boolean; optional?: boolean; children: React.ReactNode
}) {
    return (
        <div>
            <label className="rs-paste-label">
                {label}
                {required && <span className="rs-paste-required-dot" aria-label="required" />}
                {optional && <span className="rs-paste-optional">(optional)</span>}
            </label>
            {children}
        </div>
    )
}

// ── LOADING ──────────────────────────────────────────────────

function LoadingPhase({ step, onCancel }: { step: StepIdx; onCancel: () => void }) {
    const [elapsed, setElapsed] = useState(0)
    useEffect(() => {
        const t = setInterval(() => setElapsed(e => e + 1), 1000)
        return () => clearInterval(t)
    }, [])

    const longRunning = elapsed > 20
    const veryLong = elapsed > 60

    return (
        <div>
            <div className="rs-paste-header">
                <div className="rs-paste-header__badge">
                    <ClipIcon size={20} color="#135bec" />
                </div>
                <div>
                    <h2 className="rs-paste-header__title">Processing your job…</h2>
                    <p className="rs-paste-header__sub">
                        {veryLong
                            ? `Still working (${elapsed}s) — something is unusual. Try cancelling and retrying.`
                            : longRunning
                                ? `Working… ${elapsed}s elapsed. Scoring usually completes within 30–60s.`
                                : 'Sit tight — this usually takes 10–30 seconds.'}
                    </p>
                </div>
            </div>
            <div className="rs-paste-steps">
                {STEP_LABELS.map((label, i) => {
                    const done = step > i
                    const active = step === i
                    return (
                        <div key={i} className="rs-paste-step">
                            <div
                                className="rs-paste-step__bullet"
                                data-state={done ? 'done' : active ? 'active' : 'pending'}
                            >
                                {done ? (
                                    <CheckIcon />
                                ) : active ? (
                                    <div className="rs-paste-spinner" />
                                ) : (
                                    <div className="rs-paste-pending-dot" />
                                )}
                            </div>
                            <span className="rs-paste-step__label" data-state={done ? 'done' : active ? 'active' : 'pending'}>
                                {label}
                            </span>
                        </div>
                    )
                })}
            </div>
            {longRunning && (
                <div className="rs-paste-actions" style={{ marginTop: 18 }}>
                    <button onClick={onCancel} className="rs-paste-btn-ghost" type="button">
                        Cancel and try again
                    </button>
                </div>
            )}
        </div>
    )
}

// ── SUCCESS ──────────────────────────────────────────────────

function SuccessPhase({ score, onViewScore, onGenerateResume }: {
    score: number | null
    onViewScore: () => void
    onGenerateResume: () => void
}) {
    return (
        <div className="rs-paste-success">
            <div className="rs-paste-success__ring">
                <svg width="32" height="32" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24">
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            </div>
            <div>
                <h2 className="rs-paste-success__title">Job ready!</h2>
                <p className="rs-paste-success__msg">
                    Your job is scored{score != null ? <> at <b className="rs-paste-success__score">{score}/100</b></> : null} and ready to act on.
                </p>
            </div>
            <div className="rs-paste-success__actions">
                <button onClick={onViewScore} className="rs-paste-btn-outline" type="button">View Match Score</button>
                <button onClick={onGenerateResume} className="rs-paste-btn-primary" type="button">Generate Resume</button>
            </div>
        </div>
    )
}

// ── ERROR ────────────────────────────────────────────────────

function ErrorPhase({ message, onRetry, onClose }: {
    message: string
    onRetry: () => void
    onClose: () => void
}) {
    return (
        <div className="rs-paste-success">
            <div className="rs-paste-success__ring rs-paste-success__ring--error">
                <svg width="28" height="28" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
            </div>
            <div>
                <h2 className="rs-paste-success__title">Something went wrong</h2>
                <p className="rs-paste-success__msg">{message || 'Unexpected error — please try again.'}</p>
            </div>
            <div className="rs-paste-success__actions">
                <button onClick={onClose} className="rs-paste-btn-outline" type="button">Close</button>
                <button onClick={onRetry} className="rs-paste-btn-primary" type="button">Try again</button>
            </div>
        </div>
    )
}

// ── ICONS ────────────────────────────────────────────────────

function ClipIcon({ size = 20, color = 'currentColor', sw = 1.75 }: { size?: number; color?: string; sw?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
            <rect x="9" y="3" width="6" height="4" rx="1.5" />
            <line x1="9" y1="12" x2="15" y2="12" />
            <line x1="9" y1="16" x2="13" y2="16" />
        </svg>
    )
}
function XIcon() {
    return (
        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    )
}
function InfoIcon() {
    return (
        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" />
            <circle cx="12" cy="8" r="0.5" fill="currentColor" stroke="currentColor" strokeWidth="1" />
        </svg>
    )
}
function CheckIcon() {
    return (
        <svg width="14" height="14" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
        </svg>
    )
}

// ── CSS ──────────────────────────────────────────────────────

const TRIGGER_CSS = `
.rs-paste-trigger {
    display: inline-flex; align-items: stretch; gap: 0;
    padding: 0; background: none; border: none; cursor: pointer;
    position: relative; transition: transform 0.18s ease;
    font-family: inherit;
}
.rs-paste-trigger:hover { transform: translateY(-2px); }
.rs-paste-trigger:focus-visible { outline: 3px solid rgba(19,91,236,0.35); outline-offset: 4px; border-radius: 12px; }
.rs-paste-trigger__icon {
    width: 38px; height: 38px; flex-shrink: 0;
    border-radius: 10px 0 0 10px;
    background: linear-gradient(135deg, #3B82F6, #135bec);
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 14px rgba(19,91,236,0.32);
}
.rs-paste-trigger__pill {
    padding: 0 16px;
    display: flex; align-items: center;
    border-radius: 0 10px 10px 0;
    background: #fff; color: #135bec;
    font-size: 0.8125rem; font-weight: 700;
    border: 1.5px solid #BFDBFE; border-left: none;
    box-shadow: 6px 0 14px rgba(19,91,236,0.06);
    letter-spacing: -0.005em; white-space: nowrap;
}
`

const MODAL_CSS = `
@keyframes rsPasteFadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@keyframes rsPasteSpin   { to { transform: rotate(360deg); } }

.rs-paste-overlay {
    position: fixed; inset: 0; z-index: 200;
    background: rgba(15,23,42,0.45); backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
}
.rs-paste-card {
    background: #fff; border-radius: 22px;
    padding: 32px 32px 28px;
    width: 580px; max-width: 100%;
    max-height: 90vh; overflow-y: auto;
    box-shadow: 0 28px 70px rgba(15,23,42,0.18);
    animation: rsPasteFadeUp 0.24s ease;
    position: relative;
    font-family: 'Plus Jakarta Sans', var(--font-mono), sans-serif;
    color: #0F172A;
}
.rs-paste-close {
    position: absolute; top: 20px; right: 20px;
    width: 32px; height: 32px; border-radius: 9px;
    background: #F1F5F9; border: 1px solid #E2E8F0;
    color: #64748B; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.15s;
}
.rs-paste-close:hover { background: #E2E8F0; }

.rs-paste-header {
    display: flex; align-items: flex-start; gap: 16px;
    margin-bottom: 28px; padding-right: 44px;
}
.rs-paste-header__badge {
    width: 46px; height: 46px; border-radius: 13px;
    background: linear-gradient(135deg, #EFF6FF, #DBEAFE);
    border: 1px solid #BFDBFE;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; color: #135bec;
}
.rs-paste-header__title {
    font-size: 20px; font-weight: 700; color: #0F172A;
    font-family: 'Space Grotesk', 'Plus Jakarta Sans', sans-serif;
    letter-spacing: -0.025em; line-height: 1.25; margin: 0 0 7px;
}
.rs-paste-header__sub {
    font-size: 14px; color: #64748B; line-height: 1.65; margin: 0;
}

.rs-paste-form { display: flex; flex-direction: column; gap: 18px; }
.rs-paste-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.rs-paste-label {
    display: block;
    font-size: 11px; font-weight: 700; color: #94A3B8;
    text-transform: uppercase; letter-spacing: 0.1em;
    margin-bottom: 8px;
    font-family: var(--font-mono), 'JetBrains Mono', monospace;
}
.rs-paste-required-dot {
    display: inline-block; width: 5px; height: 5px; border-radius: 50%;
    background: #135bec; margin-left: 6px; vertical-align: middle;
}
.rs-paste-optional {
    text-transform: none; letter-spacing: 0;
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-weight: 400; color: #CBD5E1; margin-left: 6px;
}
.rs-paste-field-row {
    display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 8px;
}
.rs-paste-field-row .rs-paste-label { margin-bottom: 0; }
.rs-paste-counter {
    font-size: 11.5px; font-weight: 500;
    font-family: 'Plus Jakarta Sans', sans-serif;
}

.rs-paste-input, .rs-paste-textarea {
    width: 100%; padding: 11px 14px; border-radius: 10px;
    border: 1.5px solid #E2E8F0; background: #fff;
    font-size: 14.5px; color: #0F172A; outline: none;
    font-family: 'Plus Jakarta Sans', sans-serif; line-height: 1.5;
    transition: border-color 0.15s, box-shadow 0.15s;
}
.rs-paste-input:focus, .rs-paste-textarea:focus {
    border-color: #135bec;
    box-shadow: 0 0 0 3px rgba(19,91,236,0.1);
}
.rs-paste-textarea {
    min-height: 200px; resize: vertical;
    font-family: var(--font-mono), 'JetBrains Mono', monospace;
    font-size: 13px; line-height: 1.75;
}
.rs-paste-link {
    align-self: flex-start; background: none; border: none;
    cursor: pointer; font-size: 13.5px; color: #135bec;
    font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 600;
    padding: 2px 0; display: inline-flex; align-items: center; gap: 6px;
}
.rs-paste-link__plus { font-size: 20px; line-height: 1; font-weight: 300; }

.rs-paste-info {
    background: #EFF6FF; border-radius: 11px; padding: 13px 16px;
    display: flex; gap: 11px; align-items: flex-start;
    border: 1px solid #DBEAFE;
}
.rs-paste-info__icon { color: #135bec; flex-shrink: 0; margin-top: 1px; }
.rs-paste-info__text {
    font-size: 13px; color: #2563EB; line-height: 1.65; margin: 0;
    font-family: 'Plus Jakarta Sans', sans-serif;
}

.rs-paste-actions {
    display: flex; justify-content: flex-end; align-items: center;
    gap: 10px; padding-top: 2px;
}
.rs-paste-btn-ghost {
    padding: 11px 22px; border-radius: 9999px;
    background: none; border: none; cursor: pointer;
    font-size: 14.5px; font-weight: 600; color: #64748B;
    font-family: 'Space Grotesk', 'Plus Jakarta Sans', sans-serif;
}
.rs-paste-btn-ghost:hover { color: #0F172A; }
.rs-paste-btn-primary {
    padding: 11px 28px; border-radius: 9999px;
    background: linear-gradient(135deg, #3B82F6, #135bec);
    color: #fff; border: none; cursor: pointer;
    font-size: 14.5px; font-weight: 700;
    font-family: 'Space Grotesk', 'Plus Jakarta Sans', sans-serif;
    box-shadow: 0 3px 16px rgba(19,91,236,0.35);
    letter-spacing: -0.01em; transition: transform 0.15s, box-shadow 0.15s;
    display: inline-flex; align-items: center; gap: 6px;
}
.rs-paste-btn-primary:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(19,91,236,0.45);
}
.rs-paste-btn-primary:disabled {
    background: #E2E8F0; color: #94A3B8;
    cursor: not-allowed; box-shadow: none;
}
.rs-paste-btn-outline {
    padding: 11px 22px; border-radius: 9999px;
    background: #EFF6FF; color: #135bec;
    border: 1.5px solid #BFDBFE; cursor: pointer;
    font-size: 14.5px; font-weight: 700;
    font-family: 'Space Grotesk', 'Plus Jakarta Sans', sans-serif;
}
.rs-paste-btn-outline:hover { background: #DBEAFE; }

.rs-paste-handle { display: none; }

.rs-paste-steps { margin-top: 4px; }
.rs-paste-step {
    display: flex; align-items: center; gap: 16px;
    padding: 16px 0;
    border-bottom: 1px solid #F8FAFC;
}
.rs-paste-step:last-child { border-bottom: none; }
.rs-paste-step__bullet {
    width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.3s;
}
.rs-paste-step__bullet[data-state='done']   { background: #F0FDF4; border: 1.5px solid #BBF7D0; }
.rs-paste-step__bullet[data-state='active'] { background: #EFF6FF; border: 1.5px solid #BFDBFE; }
.rs-paste-step__bullet[data-state='pending']{ background: #F8FAFC; border: 1.5px solid #E2E8F0; }
.rs-paste-spinner {
    width: 15px; height: 15px; border-radius: 50%;
    border: 2.5px solid #BFDBFE; border-top-color: #135bec;
    animation: rsPasteSpin 0.75s linear infinite;
}
.rs-paste-pending-dot {
    width: 8px; height: 8px; border-radius: 50%; background: #CBD5E1;
}
.rs-paste-step__label {
    font-size: 15.5px; font-family: 'Plus Jakarta Sans', sans-serif;
    transition: color 0.3s;
}
.rs-paste-step__label[data-state='done']    { color: #0F172A; font-weight: 600; }
.rs-paste-step__label[data-state='active']  { color: #135bec; font-weight: 600; }
.rs-paste-step__label[data-state='pending'] { color: #94A3B8; font-weight: 400; }

.rs-paste-success {
    padding: 16px 0 8px; display: flex; flex-direction: column;
    align-items: center; gap: 22px; text-align: center;
    animation: rsPasteFadeUp 0.28s ease;
}
.rs-paste-success__ring {
    width: 72px; height: 72px; border-radius: 50%;
    background: #F0FDF4; border: 2px solid #BBF7D0;
    display: flex; align-items: center; justify-content: center;
}
.rs-paste-success__ring--error { background: #FEF2F2; border-color: #FECACA; }
.rs-paste-success__title {
    font-size: 26px; font-weight: 800; color: #0F172A;
    font-family: 'Space Grotesk', 'Plus Jakarta Sans', sans-serif;
    letter-spacing: -0.03em; margin: 0 0 10px;
}
.rs-paste-success__msg {
    font-size: 15px; color: #64748B; line-height: 1.7;
    font-family: 'Plus Jakarta Sans', sans-serif; margin: 0;
}
.rs-paste-success__score {
    color: #135bec; font-weight: 800;
    font-family: var(--font-mono), 'JetBrains Mono', monospace;
}
.rs-paste-success__actions {
    display: flex; gap: 12px; margin-top: 4px; flex-wrap: wrap; justify-content: center;
}

@keyframes rsPasteSlideUp {
    from { transform: translateY(100%); opacity: 0.6; }
    to   { transform: translateY(0);    opacity: 1; }
}

@media (max-width: 767px) {
    /* Overlay: sit at bottom edge */
    .rs-paste-overlay {
        padding: 0;
        align-items: flex-end;
    }
    /* Card becomes a bottom sheet */
    .rs-paste-card {
        width: 100%;
        max-width: 100%;
        border-radius: 22px 22px 0 0;
        padding: 0 0 28px;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 -20px 60px rgba(0,0,0,0.25);
        animation: rsPasteSlideUp 0.32s cubic-bezier(0.32, 0.72, 0, 1);
    }
    /* Handle bar */
    .rs-paste-handle {
        display: block;
        width: 36px;
        height: 4px;
        border-radius: 99px;
        background: #e2e8f0;
        margin: 12px auto 0;
    }
    /* Close button */
    .rs-paste-close { top: 14px; right: 18px; }
    /* Header */
    .rs-paste-header {
        padding: 14px 56px 12px 18px;
        margin-bottom: 0;
    }
    .rs-paste-header__title { font-size: 18px; margin-bottom: 5px; }
    .rs-paste-header__sub { font-size: 12.5px; }
    /* Form body */
    .rs-paste-form { padding: 12px 18px 0; gap: 12px; }
    /* 2-column grid stays 2-column on mobile */
    .rs-paste-grid-2 { grid-template-columns: 1fr 1fr; gap: 10px; }
    /* Inputs */
    .rs-paste-input, .rs-paste-textarea {
        padding: 9px 11px;
        font-size: 13.5px;
        border-radius: 9px;
        border-width: 1px;
    }
    .rs-paste-textarea { min-height: 130px; }
    /* Counter */
    .rs-paste-counter { font-size: 11px; }
    /* Source URL link */
    .rs-paste-link { font-size: 13px; }
    /* Info box */
    .rs-paste-info { padding: 10px 12px; border-radius: 9px; }
    .rs-paste-info__text { font-size: 11.5px; }
    /* Footer actions */
    .rs-paste-actions {
        flex-direction: row;
        justify-content: stretch;
        padding-top: 12px;
        margin: 12px 18px 0;
        border-top: 1px solid #e2e8f0;
    }
    .rs-paste-btn-ghost {
        flex: 1;
        padding: 11px;
        border-radius: 10px;
        border: 1px solid #e2e8f0;
        background: #fff;
        font-size: 13px;
        font-weight: 600;
        color: #64748b;
        width: auto;
    }
    .rs-paste-btn-primary {
        flex: 2;
        padding: 11px;
        border-radius: 10px;
        font-size: 13px;
        font-weight: 700;
        justify-content: center;
        width: auto;
    }
    /* Loading steps */
    .rs-paste-steps { padding: 0 18px; }
    /* Success / error */
    .rs-paste-success { padding: 16px 18px 8px; }
    .rs-paste-success__actions { flex-direction: column; width: 100%; }
    .rs-paste-success__actions button { width: 100%; justify-content: center; }
}
`
