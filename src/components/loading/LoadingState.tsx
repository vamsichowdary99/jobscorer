'use client'

import { useEffect, useState } from 'react'

export interface LoadingStep {
    id: string
    label: string
}

export type LoadingStatus = 'running' | 'cached' | 'success' | 'error'

export interface LoadingStateProps {
    layout?: 'card' | 'inline'
    title?: string
    subtitle?: string
    steps?: LoadingStep[]
    currentStepId?: string
    status?: LoadingStatus
    estimatedTime?: string
    cachedNote?: string
    errorMessage?: string
    onRetry?: () => void
    attempt?: number
    cyclePhrases?: string[]
    cycleIntervalMs?: number
    successText?: string
}

const LS_COLORS = {
    primary: '#135bec', primaryLight: '#e8f0fe', primaryHover: '#0f4cc7',
    bg: '#f8fafc', surface: '#fff', text: '#0f172a', textSec: '#64748b',
    border: '#e2e8f0', success: '#10b981', successBg: '#f0fdf4', successBorder: '#bbf7d0',
    error: '#b91c1c', errorBg: '#fef2f2', errorBorder: '#fecaca', errorIconBg: '#fee2e2',
} as const

// Outfit substitutes for Plus Jakarta Sans (not loaded in this app) — see plan Global Constraints.
const LS_DISPLAY_FONT = "'Outfit', 'Inter', system-ui, sans-serif"
const LS_MONO_FONT = "'JetBrains Mono', ui-monospace, monospace"

const LS_KEYFRAMES = `
    @keyframes ls-ring { 0% { box-shadow: 0 0 0 0 rgba(19,91,236,0.35) } 100% { box-shadow: 0 0 0 7px rgba(19,91,236,0) } }
    @keyframes ls-pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }
    @keyframes ls-pop { from { transform: scale(0.4); opacity: 0 } to { transform: scale(1); opacity: 1 } }
    @keyframes ls-spin { to { transform: rotate(360deg) } }
    @keyframes ls-fade { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: translateY(0) } }
    @keyframes ls-sweep { to { transform: rotate(360deg) } }
    @keyframes ls-inline-pulse { 0%, 100% { opacity: 0.55 } 50% { opacity: 1 } }
    @keyframes ls-inline-fade { from { opacity: 0; transform: translateY(3px) } to { opacity: 1; transform: translateY(0) } }
`
// prefers-reduced-motion is already handled app-wide by src/app/globals.css (identical
// animation-duration/animation-iteration-count rule on `*`) — no local override needed here.

type IconName = 'check' | 'alert' | 'clock' | 'zap' | 'sparkles' | 'refresh'

function LSIcon({ name, size = 16, color = 'currentColor', strokeWidth = 2 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
    const paths: Record<IconName, React.ReactNode> = {
        check: <path d="M20 6L9 17l-5-5" />,
        alert: <><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>,
        clock: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
        zap: <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />,
        sparkles: <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />,
        refresh: <><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></>,
    }
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
            {paths[name]}
        </svg>
    )
}

function LSStepRow({ step, state, isLast }: { step: LoadingStep; state: 'done' | 'current' | 'pending'; isLast: boolean }) {
    const dotBg = state === 'done' ? LS_COLORS.primary : state === 'current' ? LS_COLORS.primaryLight : '#f1f5f9'
    const dotBorder = state === 'current' ? `1.5px solid ${LS_COLORS.primary}` : '1px solid transparent'
    return (
        <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{
                    width: 22, height: 22, borderRadius: '50%', background: dotBg, border: dotBorder,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    animation: state === 'current' ? 'ls-ring 1.6s ease-out infinite' : 'none',
                    transition: 'background 0.3s ease',
                }}>
                    {state === 'done' && <span style={{ animation: 'ls-pop 0.3s ease' }}><LSIcon name="check" size={12} color="#fff" strokeWidth={3} /></span>}
                    {state === 'current' && <div style={{ width: 6, height: 6, borderRadius: '50%', background: LS_COLORS.primary, animation: 'ls-pulse 1.2s ease-in-out infinite' }} />}
                </div>
                {!isLast && <div style={{ width: 2, flex: 1, minHeight: 16, marginTop: 2, background: state === 'done' ? LS_COLORS.primary : LS_COLORS.border, transition: 'background 0.3s ease' }} />}
            </div>
            <div style={{ paddingBottom: isLast ? 0 : 16, paddingTop: 2 }}>
                <div style={{
                    fontSize: 14, fontWeight: state === 'pending' ? 500 : 600,
                    color: state === 'pending' ? '#94a3b8' : LS_COLORS.text,
                    fontFamily: LS_DISPLAY_FONT, transition: 'color 0.3s ease',
                }}>{step.label}</div>
            </div>
        </div>
    )
}

function LSInline({ steps = [], cyclePhrases, status = 'running', cycleIntervalMs = 1700, successText, errorMessage, onRetry }: LoadingStateProps) {
    const phrases = cyclePhrases && cyclePhrases.length ? cyclePhrases : steps.map(s => `${s.label}…`)
    const [i, setI] = useState(0)
    const [fadeKey, setFadeKey] = useState(0)

    useEffect(() => {
        if (status !== 'running' || phrases.length < 2) return
        const id = setInterval(() => {
            setI(v => (v + 1) % phrases.length)
            setFadeKey(k => k + 1)
        }, cycleIntervalMs)
        return () => clearInterval(id)
    }, [status, phrases.length, cycleIntervalMs])

    const isError = status === 'error'
    const isSuccess = status === 'success'
    const bg = isError ? LS_COLORS.errorBg : isSuccess ? LS_COLORS.successBg : LS_COLORS.primaryLight
    const border = isError ? LS_COLORS.errorBorder : isSuccess ? LS_COLORS.successBorder : '#dce9fc'

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 12, height: 44, padding: '0 16px',
            borderRadius: 10, background: bg, border: `1px solid ${border}`,
            fontFamily: LS_DISPLAY_FONT, width: '100%', boxSizing: 'border-box',
            transition: 'background 0.25s ease, border-color 0.25s ease',
        }}>
            <style>{LS_KEYFRAMES}</style>
            <div style={{
                position: 'relative', width: 20, height: 20, flexShrink: 0, borderRadius: '50%',
                background: '#fff', border: `1.5px solid ${isError ? LS_COLORS.errorBorder : isSuccess ? LS_COLORS.successBorder : '#c7dcfb'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
            }}>
                {isError ? <LSIcon name="alert" size={11} color={LS_COLORS.error} /> :
                 isSuccess ? <LSIcon name="check" size={11} color={LS_COLORS.success} strokeWidth={3} /> :
                 <>
                    <div style={{ position: 'absolute', inset: 0, background: 'conic-gradient(from 0deg, rgba(19,91,236,0.45), rgba(19,91,236,0) 35%)', animation: 'ls-sweep 2.2s linear infinite' }} />
                    <div style={{ position: 'relative', width: 5, height: 5, borderRadius: '50%', background: LS_COLORS.primary, animation: 'ls-inline-pulse 2.2s ease-in-out infinite' }} />
                 </>}
            </div>
            <div style={{
                fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1,
                color: isError ? LS_COLORS.error : isSuccess ? LS_COLORS.success : LS_COLORS.text,
            }}>
                {isError ? (errorMessage || 'Something went wrong — try again') :
                 isSuccess ? (successText || 'Done') :
                 <span key={fadeKey} style={{ display: 'inline-block', animation: 'ls-inline-fade 0.35s ease' }}>{phrases[i]}</span>}
            </div>
            {isError && onRetry && (
                <button onClick={onRetry} style={{
                    border: 'none', background: 'none', color: LS_COLORS.error, fontWeight: 700, fontSize: 12.5,
                    cursor: 'pointer', fontFamily: LS_DISPLAY_FONT, flexShrink: 0, padding: 0, textDecoration: 'underline',
                }}>Retry</button>
            )}
        </div>
    )
}

export function LoadingState({
    layout = 'card', title, subtitle, steps = [], currentStepId, status = 'running',
    estimatedTime, cachedNote, errorMessage, onRetry, attempt = 1,
    cyclePhrases, cycleIntervalMs, successText,
}: LoadingStateProps) {
    if (layout === 'inline') {
        return <LSInline steps={steps} cyclePhrases={cyclePhrases} status={status}
            cycleIntervalMs={cycleIntervalMs} successText={successText}
            errorMessage={errorMessage} onRetry={onRetry} />
    }

    const currentIndex = steps.findIndex(s => s.id === currentStepId)
    const isError = status === 'error'
    const isSuccess = status === 'success'
    const isCached = status === 'cached'

    const badgeBg = isError ? LS_COLORS.errorIconBg : isSuccess ? LS_COLORS.successBg : LS_COLORS.primaryLight
    const badgeColor = isError ? LS_COLORS.error : isSuccess ? LS_COLORS.success : LS_COLORS.primary

    return (
        <div style={{
            width: 440, maxWidth: '100%', background: LS_COLORS.surface, border: `1px solid ${LS_COLORS.border}`,
            borderRadius: 16, padding: '32px 32px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 12px 32px -12px rgba(15,23,42,0.12)',
            fontFamily: LS_DISPLAY_FONT, boxSizing: 'border-box',
        }}>
            <style>{LS_KEYFRAMES}</style>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 22 }}>
                <div style={{
                    width: 40, height: 40, borderRadius: 11, background: badgeBg, color: badgeColor,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                    {isError ? <LSIcon name="alert" size={19} /> :
                     isSuccess ? <span style={{ animation: 'ls-pop 0.35s ease' }}><LSIcon name="check" size={19} strokeWidth={2.5} /></span> :
                     isCached ? <LSIcon name="zap" size={18} /> :
                     <span style={{ display: 'inline-flex', animation: 'ls-spin 1.4s linear infinite' }}><LSIcon name="sparkles" size={18} /></span>}
                </div>
                <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 17, fontWeight: 700, color: LS_COLORS.text, lineHeight: 1.3 }}>
                        {isError ? 'Something went wrong' : title}
                    </div>
                    <div style={{ fontSize: 13.5, color: LS_COLORS.textSec, marginTop: 3, lineHeight: 1.4 }}>
                        {isError ? (errorMessage || 'We hit a snag — please try again.') : subtitle}
                    </div>
                </div>
            </div>

            {isCached && !isError && (
                <div style={{
                    display: 'flex', gap: 10, alignItems: 'flex-start', background: LS_COLORS.primaryLight,
                    border: '1px solid #dce9fc', borderRadius: 10, padding: '10px 12px', marginBottom: 20,
                    animation: 'ls-fade 0.3s ease',
                }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: LS_COLORS.primary, flexShrink: 0 }}>⚡</div>
                    <div style={{ fontSize: 12.5, color: '#1e3a8a', lineHeight: 1.45 }}>
                        <strong style={{ color: LS_COLORS.primary }}>Using cached research.</strong> {cachedNote}
                    </div>
                </div>
            )}

            {!isError && steps.length > 0 && (
                <div style={{ marginBottom: 4 }}>
                    {steps.map((step, i) => {
                        const state: 'done' | 'current' | 'pending' = isSuccess || i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'pending'
                        return <LSStepRow key={step.id} step={step} state={state} isLast={i === steps.length - 1} />
                    })}
                </div>
            )}

            {isError && (
                <button onClick={onRetry} style={{
                    width: '100%', height: 40, borderRadius: 9, border: 'none', background: LS_COLORS.primary,
                    color: '#fff', fontSize: 13.5, fontWeight: 700, fontFamily: LS_DISPLAY_FONT, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4, marginBottom: 4,
                }}>
                    <LSIcon name="refresh" size={14} color="#fff" /> Try again{attempt > 1 ? ` (attempt ${attempt})` : ''}
                </button>
            )}

            {!isError && (
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    marginTop: 18, paddingTop: 16, borderTop: `1px solid ${LS_COLORS.border}`,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: LS_COLORS.textSec }}>
                        <LSIcon name="clock" size={13} color={LS_COLORS.textSec} />
                        <span style={{ fontSize: 12, fontWeight: 500 }}>{isSuccess ? 'Completed' : 'Estimated time'}</span>
                    </div>
                    <span style={{ fontSize: 12.5, fontFamily: LS_MONO_FONT, fontWeight: 600, color: isSuccess ? LS_COLORS.success : LS_COLORS.text }}>
                        {isSuccess ? 'Done' : estimatedTime}
                    </span>
                </div>
            )}
        </div>
    )
}
