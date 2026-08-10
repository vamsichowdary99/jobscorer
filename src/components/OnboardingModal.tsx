'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/providers/AuthProvider'
import { fetchUserSettings, updateUserSettings, fileToBase64 } from '@/lib/api'
import { setPendingUpload } from '@/lib/pendingResumeUpload'
import {
    ONBOARDING_ROLE_OPTIONS, ONBOARDING_LOCATION_OPTIONS,
    CAREER_EXPERIENCE_OPTIONS, CAREER_CHALLENGE_OPTIONS, JOB_TIMELINE_OPTIONS,
} from '@/lib/onboarding'

const SANS = "'Plus Jakarta Sans', system-ui, sans-serif"
const MONO = "'JetBrains Mono', monospace"
const BLUE = '#135bec'
const TOTAL_STEPS = 6

/* ─── Inject keyframes + responsive rules once ──────────────── */
function useOnboardingStyles() {
    useEffect(() => {
        if (document.getElementById('onb-styles')) return
        const s = document.createElement('style')
        s.id = 'onb-styles'
        s.textContent = `
      @keyframes onb-overlay-in { from { opacity: 0 } to { opacity: 1 } }
      @keyframes onb-modal-in {
        from { opacity: 0; transform: translateY(18px) scale(0.97); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes onb-step-in {
        from { opacity: 0; transform: translateX(14px); }
        to   { opacity: 1; transform: translateX(0); }
      }
      @keyframes onb-chip-in {
        from { transform: scale(0.85); } to { transform: scale(1); }
      }
      @keyframes onb-pulse {
        0%, 100% { opacity: 1; } 50% { opacity: 0.5; }
      }
      .onb-overlay { animation: onb-overlay-in 250ms ease both; }
      .onb-modal { animation: onb-modal-in 350ms cubic-bezier(0.2,0.8,0.2,1) both; }
      .onb-step { animation: onb-step-in 300ms ease both; }
      .onb-chip { animation: onb-chip-in 200ms cubic-bezier(0.2,0.8,0.2,1) both; }
      .onb-dot { animation: onb-pulse 1.4s ease-in-out infinite; }
      .onb-continue:not(:disabled):hover { filter: brightness(1.06); }
      .onb-role-card:hover, .onb-timeline-row:hover, .onb-challenge-card:hover { border-color: #94a3b8; }
      .onb-role-card.active:hover, .onb-timeline-row.active:hover, .onb-challenge-card.active:hover { border-color: ${BLUE}; }
      .onb-suggestion:hover { background: #eff6ff; }
      .onb-dropzone:hover { border-color: ${BLUE}; }

      @media (prefers-reduced-motion: reduce) {
        .onb-overlay, .onb-modal, .onb-step, .onb-chip, .onb-dot { animation: none !important; }
      }

      @media (max-width: 640px) {
        .onb-modal { max-height: 90vh !important; border-radius: 18px !important; }
        .onb-header { padding: 18px 20px 0 !important; }
        .onb-body { padding: 16px 20px !important; }
        .onb-footer { padding: 12px 20px 20px !important; }
        .onb-title { font-size: 17px !important; }
        .onb-role-grid { grid-template-columns: repeat(2, 1fr) !important; }
        .onb-challenge-grid { display: flex !important; flex-direction: column !important; gap: 7px !important; }
      }
    `
        document.head.appendChild(s)
    }, [])
}

type OnboardingSnapshot = {
    selectedRoles: string[]
    experienceLevel: string | null
    locations: string[]
    challenges: string[]
    otherChallenge: string
    timeline: string | null
}

export default function OnboardingModal() {
    useOnboardingStyles()
    const { user } = useAuth()
    const router = useRouter()

    const [ready, setReady] = useState(false)
    const [show, setShow] = useState(false)
    const [showSuccess, setShowSuccess] = useState(false)
    const [step, setStep] = useState(1)
    const [submitting, setSubmitting] = useState(false)

    const [selectedRoles, setSelectedRoles] = useState<string[]>([])
    const [experienceLevel, setExperienceLevel] = useState<string | null>(null)
    const [locations, setLocations] = useState<string[]>([])
    const [challenges, setChallenges] = useState<string[]>([])
    const [otherChallenge, setOtherChallenge] = useState('')
    const [timeline, setTimeline] = useState<string | null>(null)
    const [resumeFile, setResumeFile] = useState<File | null>(null)
    const [dragOver, setDragOver] = useState(false)

    const fileInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (!user?.id) return
        let cancelled = false
        fetchUserSettings(user.id, user.email ?? null).then(s => {
            if (cancelled) return
            if (!s.onboarding_completed) {
                const snap: OnboardingSnapshot = {
                    selectedRoles: s.target_roles, experienceLevel: s.career_experience_level,
                    locations: s.target_locations, challenges: s.career_challenges,
                    otherChallenge: s.career_challenge_other ?? '', timeline: s.job_search_timeline,
                }
                setSelectedRoles(snap.selectedRoles)
                setExperienceLevel(snap.experienceLevel)
                setLocations(snap.locations)
                setChallenges(snap.challenges)
                setOtherChallenge(snap.otherChallenge)
                setTimeline(snap.timeline)
                setShow(true)
            }
            setReady(true)
        })
        return () => { cancelled = true }
    }, [user?.id])

    if (!ready || (!show && !showSuccess)) return null

    const canContinue = (() => {
        switch (step) {
            case 1: return selectedRoles.length > 0
            case 2: return experienceLevel !== null
            case 3: return locations.length > 0
            case 4: return challenges.length > 0
            case 5: return timeline !== null
            case 6: return true
            default: return false
        }
    })()

    async function handleFinish() {
        if (!user?.id) return
        setSubmitting(true)
        await updateUserSettings(user.id, {
            target_roles: selectedRoles,
            target_locations: locations,
            career_experience_level: experienceLevel,
            career_challenges: challenges,
            career_challenge_other: challenges.includes('other') ? otherChallenge : null,
            job_search_timeline: timeline,
            onboarding_completed: true,
        })
        if (resumeFile) {
            // Hand off to the same pending-upload mechanism the landing page uses
            // (Hero.tsx) so /dashboard/upload picks it up on mount and shows the
            // real "AI Analyzing your profile…" progress state — instead of the
            // generic success card, which had no live status of its own.
            const base64 = await fileToBase64(resumeFile)
            setPendingUpload({ filename: resumeFile.name, mimeType: resumeFile.type || 'application/pdf', base64 })
            setShow(false)
            router.push('/dashboard/upload')
            return
        }
        setSubmitting(false)
        setShow(false)
        setShowSuccess(true)
    }

    function handleContinue() {
        if (!canContinue) return
        if (step === TOTAL_STEPS) {
            void handleFinish()
        } else {
            setStep(s => s + 1)
        }
    }

    function handleFile(f: File | null) {
        if (!f) return
        if (f.type !== 'application/pdf') return
        setResumeFile(f)
    }

    if (showSuccess) {
        const roleLabel = selectedRoles[0] ?? 'your target role'
        const userName = (user?.user_metadata?.full_name as string | undefined) ?? user?.email?.split('@')[0] ?? 'there'
        return (
            <div
                className="onb-overlay"
                style={{
                    position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
                }}
            >
                <div
                    style={{
                        width: 'min(460px, 100%)', background: '#fff', borderRadius: 20,
                        boxShadow: '0 30px 70px -15px rgba(15,23,42,0.35)', padding: 28,
                        fontFamily: SANS,
                    }}
                    className="onb-modal"
                >
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, marginBottom: 14 }}>🤖</div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>Welcome, {userName}!</div>
                    <p style={{ fontSize: 14, color: '#475569', marginTop: 6, lineHeight: 1.5 }}>
                        You&rsquo;re targeting {roleLabel}. We&rsquo;ve already started building your personalized career roadmap.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '18px 0' }}>
                        {['Resume Analysis', 'Skill Gap Detection', 'Recommended Learning Path', 'Job Matching'].map((label, i) => (
                            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, color: '#334155', fontWeight: 600 }}>
                                <span className="onb-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: BLUE, flexShrink: 0, animationDelay: `${i * 0.2}s` }} />
                                {label}
                            </div>
                        ))}
                    </div>
                    <button
                        onClick={() => { setShowSuccess(false); router.push('/dashboard') }}
                        style={{ width: '100%', padding: '13px 24px', background: BLUE, color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, fontFamily: SANS, cursor: 'pointer' }}
                    >
                        Go to dashboard
                    </button>
                </div>
            </div>
        )
    }

    const pct = Math.round((step / TOTAL_STEPS) * 100)

    return (
        <div
            className="onb-overlay"
            style={{
                position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
            }}
        >
            <div
                className="onb-modal"
                style={{
                    width: 'min(620px, 100%)', minHeight: 360, maxHeight: '86vh', background: '#fff',
                    borderRadius: 20, boxShadow: '0 30px 70px -15px rgba(15,23,42,0.35)',
                    display: 'flex', flexDirection: 'column', fontFamily: SANS,
                }}
            >
                {/* Header */}
                <div className="onb-header" style={{ padding: '24px 28px 0' }}>
                    <div className="onb-title" style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                        Welcome to JobScorer 👋
                    </div>
                    <p style={{ fontSize: 13, color: '#475569', marginTop: 6 }}>
                        Let&rsquo;s personalize your AI Career Coach in less than 2 minutes.
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 8 }}>
                        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#94a3b8' }}>
                            Step {step} of {TOTAL_STEPS}
                        </span>
                        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, color: BLUE }}>{pct}%</span>
                    </div>
                    <div style={{ height: 5, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: BLUE, borderRadius: 99, transition: 'width 400ms cubic-bezier(0.2,0.8,0.2,1)' }} />
                    </div>
                </div>

                {/* Body */}
                <div className="onb-body" style={{ padding: '22px 28px', overflowY: 'auto', flex: 1 }}>
                    <div key={step} className="onb-step">
                        {step === 1 && (
                            <StepRoles selectedRoles={selectedRoles} setSelectedRoles={setSelectedRoles} />
                        )}
                        {step === 2 && (
                            <StepExperience experienceLevel={experienceLevel} setExperienceLevel={setExperienceLevel} />
                        )}
                        {step === 3 && (
                            <StepLocations locations={locations} setLocations={setLocations} />
                        )}
                        {step === 4 && (
                            <StepChallenges
                                challenges={challenges} setChallenges={setChallenges}
                                otherChallenge={otherChallenge} setOtherChallenge={setOtherChallenge}
                            />
                        )}
                        {step === 5 && (
                            <StepTimeline timeline={timeline} setTimeline={setTimeline} />
                        )}
                        {step === 6 && (
                            <StepResume
                                resumeFile={resumeFile} setResumeFile={setResumeFile}
                                dragOver={dragOver} setDragOver={setDragOver}
                                fileInputRef={fileInputRef} onFile={handleFile}
                            />
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="onb-footer" style={{ padding: '16px 28px', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: step > 1 ? 'space-between' : 'flex-end' }}>
                    {step > 1 && (
                        <button
                            onClick={() => setStep(s => s - 1)}
                            style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: 14, fontWeight: 700, fontFamily: SANS, cursor: 'pointer', padding: '8px 4px' }}
                        >
                            ← Back
                        </button>
                    )}
                    <button
                        className="onb-continue"
                        disabled={!canContinue || submitting}
                        onClick={handleContinue}
                        style={{
                            padding: '11px 24px', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, fontFamily: SANS,
                            color: '#fff', background: canContinue && !submitting ? BLUE : '#cbd5e1',
                            boxShadow: canContinue && !submitting ? '0 8px 20px -6px rgba(19,91,236,0.5)' : 'none',
                            cursor: canContinue && !submitting ? 'pointer' : 'not-allowed',
                            transition: 'background 150ms ease, box-shadow 150ms ease',
                        }}
                    >
                        {submitting ? 'Saving…' : step === TOTAL_STEPS ? 'Finish' : 'Continue'}
                    </button>
                </div>
            </div>
        </div>
    )
}

/* ─── Shared bits ────────────────────────────────────────────── */

function Heading({ title, subtitle }: { title: string; subtitle: string }) {
    return (
        <>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em', margin: 0 }}>{title}</h2>
            <p style={{ fontSize: 13, color: '#475569', marginTop: 5, marginBottom: 18 }}>{subtitle}</p>
        </>
    )
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
    return (
        <span className="onb-chip" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: BLUE,
            background: '#eff6ff', border: '1px solid #bfdbfe', padding: '6px 8px 6px 13px', borderRadius: 99,
        }}>
            {label}
            <button
                type="button" onClick={onRemove}
                style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(19,91,236,0.12)', border: 'none', color: BLUE, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, lineHeight: 1, padding: 0 }}
            >×</button>
        </span>
    )
}

/** Free-typing autocomplete with an inline (non-absolute) suggestion list and a
 * separate row of removable chips below — used for Step 1 (roles) and Step 3 (locations). */
function TagAutocomplete({ values, onChange, options, placeholder, maxCount }: {
    values: string[]; onChange: (vs: string[]) => void; options: string[]; placeholder: string; maxCount?: number
}) {
    const [input, setInput] = useState('')
    const [focused, setFocused] = useState(false)
    const atLimit = maxCount !== undefined && values.length >= maxCount

    const query = input.trim().toLowerCase()
    const suggestions = atLimit ? [] : options
        .filter(o => !values.some(v => v.toLowerCase() === o.toLowerCase()))
        .filter(o => query === '' ? false : o.toLowerCase().includes(query))
        .slice(0, 8)

    function add(v: string) {
        const trimmed = v.trim()
        if (!trimmed || atLimit) return
        if (values.some(x => x.toLowerCase() === trimmed.toLowerCase())) { setInput(''); return }
        onChange([...values, trimmed])
        setInput('')
    }

    return (
        <div>
            <input
                type="text"
                value={input}
                disabled={atLimit}
                onChange={e => setInput(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setTimeout(() => setFocused(false), 150)}
                onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); add(suggestions[0] ?? input) }
                    else if (e.key === 'Escape') { (e.target as HTMLInputElement).blur() }
                }}
                placeholder={atLimit ? 'Maximum reached' : placeholder}
                style={{
                    width: '100%', border: `1.5px solid ${focused ? BLUE : '#e2e8f0'}`, borderRadius: 12,
                    padding: '13px 16px', fontSize: 14, fontFamily: SANS, outline: 'none', color: '#0f172a',
                    background: atLimit ? '#f8fafc' : '#fff', transition: 'border-color 150ms ease',
                }}
            />

            {focused && suggestions.length > 0 && (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 4px 12px -4px rgba(15,23,42,0.1)', maxHeight: 280, overflowY: 'auto', marginTop: 8, padding: 6 }}>
                    {suggestions.map(opt => (
                        <button
                            key={opt} type="button" className="onb-suggestion"
                            onMouseDown={e => { e.preventDefault(); add(opt) }}
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', borderRadius: 8, fontSize: 13.5, fontFamily: SANS, color: '#1e293b', background: 'transparent', border: 'none', cursor: 'pointer' }}
                        >
                            {opt}
                        </button>
                    ))}
                </div>
            )}

            {values.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                    {values.map(v => <Chip key={v} label={v} onRemove={() => onChange(values.filter(x => x !== v))} />)}
                </div>
            )}

            {atLimit && (
                <div style={{ fontFamily: MONO, fontSize: 11, color: '#94a3b8', marginTop: 10 }}>Maximum 5 roles selected</div>
            )}
        </div>
    )
}

/* ─── Step 1 — Target Role ───────────────────────────────────── */
function StepRoles({ selectedRoles, setSelectedRoles }: { selectedRoles: string[]; setSelectedRoles: (vs: string[]) => void }) {
    return (
        <div>
            <Heading title="What role are you targeting?" subtitle="Select up to 5 roles — this tailors your entire experience." />
            <div style={{ display: 'flex', gap: 8, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '9px 12px', marginBottom: 16 }}>
                <span style={{ fontSize: 13, flexShrink: 0 }}>ℹ️</span>
                <p style={{ fontSize: 12, color: '#3b5ba5', lineHeight: 1.5, margin: 0 }}>
                    Your selected roles power your AI Career Coach. We&rsquo;ll use them to find the best job matches and personalize your skill gap analysis, learning paths, projects, resume optimization, and interview preparation. Choose the roles you&rsquo;re genuinely targeting. You can change them anytime.
                </p>
            </div>
            <TagAutocomplete
                values={selectedRoles} onChange={setSelectedRoles}
                options={ONBOARDING_ROLE_OPTIONS} placeholder="Search for a role…" maxCount={5}
            />
        </div>
    )
}

/* ─── Step 2 — Experience Level ──────────────────────────────── */
function StepExperience({ experienceLevel, setExperienceLevel }: { experienceLevel: string | null; setExperienceLevel: (v: string) => void }) {
    return (
        <div>
            <Heading title="What's your experience level?" subtitle="This helps us calibrate advice to where you are today." />
            <div className="onb-role-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {CAREER_EXPERIENCE_OPTIONS.map(opt => {
                    const active = experienceLevel === opt
                    return (
                        <button
                            key={opt} type="button" onClick={() => setExperienceLevel(opt)}
                            className={`onb-role-card${active ? ' active' : ''}`}
                            style={{
                                padding: '12px 8px', borderRadius: 10, border: `1.5px solid ${active ? BLUE : '#e2e8f0'}`,
                                background: active ? '#eff6ff' : '#fff', color: active ? BLUE : '#334155',
                                fontSize: 13, fontWeight: 700, fontFamily: SANS, textAlign: 'center', cursor: 'pointer',
                                boxShadow: active ? '0 4px 14px -4px rgba(19,91,236,0.3)' : 'none',
                                transition: 'border-color 150ms ease, background 150ms ease',
                            }}
                        >
                            {opt}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

/* ─── Step 3 — Work Location ──────────────────────────────────── */
function StepLocations({ locations, setLocations }: { locations: string[]; setLocations: (vs: string[]) => void }) {
    return (
        <div>
            <Heading title="Where do you want to work?" subtitle="Add as many locations as you like." />
            <TagAutocomplete
                values={locations} onChange={setLocations}
                options={ONBOARDING_LOCATION_OPTIONS} placeholder="Search for a city or region…"
            />
        </div>
    )
}

/* ─── Step 4 — Career Challenge ──────────────────────────────── */
function StepChallenges({ challenges, setChallenges, otherChallenge, setOtherChallenge }: {
    challenges: string[]; setChallenges: (vs: string[]) => void
    otherChallenge: string; setOtherChallenge: (v: string) => void
}) {
    function toggle(key: string) {
        setChallenges(challenges.includes(key) ? challenges.filter(k => k !== key) : [...challenges, key])
    }
    return (
        <div>
            <Heading title="What's your biggest career challenge?" subtitle="We'll focus your coaching here first." />
            <div className="onb-challenge-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {CAREER_CHALLENGE_OPTIONS.map(opt => {
                    const active = challenges.includes(opt.key)
                    return (
                        <button
                            key={opt.key} type="button" onClick={() => toggle(opt.key)}
                            className={`onb-challenge-card${active ? ' active' : ''}`}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px', borderRadius: 12,
                                border: `1.5px solid ${active ? BLUE : '#e2e8f0'}`, background: active ? '#eff6ff' : '#fff',
                                color: active ? BLUE : '#334155', fontSize: 13, fontWeight: 700, fontFamily: SANS,
                                textAlign: 'left', cursor: 'pointer', transition: 'border-color 150ms ease, background 150ms ease',
                            }}
                        >
                            <span style={{ fontSize: 19, flexShrink: 0 }}>{opt.icon}</span>
                            {opt.label}
                        </button>
                    )
                })}
            </div>
            {challenges.includes('other') && (
                <textarea
                    value={otherChallenge}
                    onChange={e => setOtherChallenge(e.target.value)}
                    placeholder="Tell us a bit more about your challenge…"
                    style={{
                        width: '100%', marginTop: 12, height: 88, border: `1.5px solid ${BLUE}`, borderRadius: 12,
                        padding: '12px 14px', fontSize: 13.5, fontFamily: SANS, color: '#0f172a', outline: 'none', resize: 'none',
                    }}
                />
            )}
        </div>
    )
}

/* ─── Step 5 — Job Timeline ──────────────────────────────────── */
function StepTimeline({ timeline, setTimeline }: { timeline: string | null; setTimeline: (v: string) => void }) {
    return (
        <div>
            <Heading title="When do you want your next job?" subtitle="This sets the pace of your roadmap." />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {JOB_TIMELINE_OPTIONS.map(opt => {
                    const active = timeline === opt.key
                    return (
                        <button
                            key={opt.key} type="button" onClick={() => setTimeline(opt.key)}
                            className={`onb-timeline-row${active ? ' active' : ''}`}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px',
                                borderRadius: 12, border: `1.5px solid ${active ? BLUE : '#e2e8f0'}`, background: active ? '#eff6ff' : '#fff',
                                color: active ? BLUE : '#334155', fontSize: 14, fontWeight: 700, fontFamily: SANS, cursor: 'pointer',
                                transition: 'border-color 150ms ease, background 150ms ease',
                            }}
                        >
                            {opt.label}
                            {active && (
                                <span style={{ width: 20, height: 20, borderRadius: '50%', background: BLUE, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>✓</span>
                            )}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

/* ─── Step 6 — Resume Upload ─────────────────────────────────── */
function StepResume({ resumeFile, setResumeFile, dragOver, setDragOver, fileInputRef, onFile }: {
    resumeFile: File | null; setResumeFile: (f: File | null) => void
    dragOver: boolean; setDragOver: (v: boolean) => void
    fileInputRef: React.RefObject<HTMLInputElement | null>
    onFile: (f: File | null) => void
}) {
    return (
        <div>
            <Heading title="Upload your resume" subtitle="We'll use it to power your AI Career Coach." />
            {resumeFile ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: 16, background: '#f8fafc' }}>
                    <span style={{ width: 36, height: 36, borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>📄</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resumeFile.name}</span>
                    <button type="button" onClick={() => setResumeFile(null)} style={{ background: 'transparent', border: 'none', color: '#dc2626', fontSize: 13, fontWeight: 700, fontFamily: SANS, cursor: 'pointer' }}>Remove</button>
                </div>
            ) : (
                <div
                    className="onb-dropzone"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => { e.preventDefault(); setDragOver(false); onFile(e.dataTransfer.files?.[0] ?? null) }}
                    style={{
                        border: `2px dashed ${dragOver ? BLUE : '#cbd5e1'}`, borderRadius: 16, padding: '40px 24px',
                        textAlign: 'center', background: '#f8fafc', cursor: 'pointer', transition: 'border-color 150ms ease',
                    }}
                >
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📤</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Drag your PDF here</div>
                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                        or <span style={{ color: BLUE, fontWeight: 700 }}>browse files</span>
                    </div>
                    <input
                        ref={fileInputRef} type="file" accept="application/pdf" style={{ display: 'none' }}
                        onChange={e => onFile(e.target.files?.[0] ?? null)}
                    />
                </div>
            )}
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 14 }}>
                🔒 Your resume is securely stored and only used to personalize your AI Career Coach.
            </p>
        </div>
    )
}
