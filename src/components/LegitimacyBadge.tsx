'use client'

import { useState } from 'react'

export type LegitimacyTier = 'verified' | 'proceed_with_caution' | 'suspicious' | 'unknown'

export interface LegitimacySignals {
    posting_age_days?: number | null
    jd_specificity_score?: number
    matched_tech_keywords?: string[]
    red_phrase_matches?: string[]
    has_walk_in_phrase?: boolean
    salary_disclosed?: boolean
    has_company_name?: boolean
    apply_destination_type?: string
    jd_length_chars?: number
    spam_title?: boolean
    _composite_score?: number
}

interface Props {
    readonly tier: LegitimacyTier | null | undefined
    readonly signals?: LegitimacySignals | null
    readonly size?: 'sm' | 'md' | 'lg'
    readonly variant?: 'inline' | 'strip'
}

/* ─────────────────────────────────────────────
   Icon set — hand-tuned SVGs, no emoji
   (emoji renders inconsistently across OSes)
   ──────────────────────────────────────────── */

function ShieldCheck({ size }: { size: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 2 4 5v6c0 5 3.4 9.5 8 11 4.6-1.5 8-6 8-11V5l-8-3z"
                stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

function ShieldAlert({ size }: { size: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 2 4 5v6c0 5 3.4 9.5 8 11 4.6-1.5 8-6 8-11V5l-8-3z"
                stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2.2"
                strokeLinecap="round" />
        </svg>
    )
}

function ShieldX({ size }: { size: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 2 4 5v6c0 5 3.4 9.5 8 11 4.6-1.5 8-6 8-11V5l-8-3z"
                stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <path d="m9 9 6 6M15 9l-6 6" stroke="currentColor" strokeWidth="2.2"
                strokeLinecap="round" />
        </svg>
    )
}

/* ─────────────────────────────────────────────
   Tier configuration
   Hierarchy: verified=quiet, caution=medium, suspicious=loud
   ──────────────────────────────────────────── */

type TierStyle = {
    icon: typeof ShieldCheck
    label: string
    short: string
    fg: string
    bg: string
    border: string
    accent: string
}

const TIERS: Record<LegitimacyTier, TierStyle> = {
    verified: {
        icon: ShieldCheck,
        label: 'Verified posting',
        short: 'Verified',
        fg: '#15803d',
        bg: '#f0fdf4',
        border: '#bbf7d0',
        accent: '#22c55e',
    },
    proceed_with_caution: {
        icon: ShieldAlert,
        label: 'Verify before applying',
        short: 'Caution',
        fg: '#b45309',
        bg: '#fffbeb',
        border: '#fde68a',
        accent: '#f59e0b',
    },
    suspicious: {
        icon: ShieldX,
        label: 'Likely ghost job',
        short: 'Suspicious',
        fg: '#991b1b',
        bg: '#fef2f2',
        border: '#fecaca',
        accent: '#ef4444',
    },
    unknown: {
        icon: ShieldAlert,
        label: 'Not yet evaluated',
        short: 'Unknown',
        fg: '#6b7280',
        bg: '#f9fafb',
        border: '#e5e7eb',
        accent: '#9ca3af',
    },
}

/* ─────────────────────────────────────────────
   Build human-readable reason strings from signals
   ──────────────────────────────────────────── */

function reasonsFor(tier: LegitimacyTier, s: LegitimacySignals | null | undefined): string[] {
    if (!s) return []
    const out: string[] = []

    if (s.has_walk_in_phrase && s.red_phrase_matches?.length) {
        out.push(`"${s.red_phrase_matches[0]}" language`)
    }
    if (s.spam_title) out.push('Spam markers in title')
    if (s.has_company_name === false) out.push('Company name missing')
    if (s.apply_destination_type === 'anonymous_form') out.push('Apply via anonymous form')
    if (s.apply_destination_type === 'invalid_url') out.push('Invalid apply URL')

    if (typeof s.jd_specificity_score === 'number' && s.jd_specificity_score === 0) {
        out.push('No tech terms in JD')
    } else if (typeof s.jd_specificity_score === 'number' && s.jd_specificity_score >= 5) {
        out.push(`${s.jd_specificity_score} tech terms named`)
    }

    if (typeof s.posting_age_days === 'number') {
        if (s.posting_age_days > 45) out.push(`Posted ${s.posting_age_days} days ago`)
        else if (s.posting_age_days <= 7 && tier === 'verified') out.push('Fresh posting')
    }

    if (s.apply_destination_type === 'official_ats') out.push('Routes to official ATS')
    if (s.salary_disclosed && tier === 'verified') out.push('Salary disclosed')

    return out.slice(0, 3)
}

/* ─────────────────────────────────────────────
   Main component
   ──────────────────────────────────────────── */

export default function LegitimacyBadge({
    tier,
    signals,
    size = 'md',
    variant = 'inline',
}: Props) {
    const [open, setOpen] = useState(false)
    if (!tier || tier === 'unknown') return null

    const cfg = TIERS[tier]
    const Icon = cfg.icon
    const reasons = reasonsFor(tier, signals)

    const sizing = {
        sm: { icon: 11, font: '0.625rem', pad: '2px 6px', radius: 4, gap: 4 },
        md: { icon: 13, font: '0.6875rem', pad: '3px 8px', radius: 5, gap: 5 },
        lg: { icon: 15, font: '0.75rem', pad: '4px 10px', radius: 6, gap: 6 },
    }[size]

    /* ─── STRIP variant ─ for "suspicious" / loud surface treatment ─── */
    if (variant === 'strip' && tier === 'suspicious') {
        return (
            <div
                onMouseEnter={() => setOpen(true)}
                onMouseLeave={() => setOpen(false)}
                style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: `linear-gradient(90deg, ${cfg.bg} 0%, #ffffff 100%)`,
                    borderLeft: `3px solid ${cfg.accent}`,
                    boxShadow: 'inset 0 0 0 1px rgba(239,68,68,0.08)',
                    color: cfg.fg,
                }}
            >
                <span
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        background: cfg.accent,
                        color: '#fff',
                        flexShrink: 0,
                        animation: 'legitPulse 2.4s ease-in-out infinite',
                    }}
                >
                    <Icon size={13} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
                        {cfg.label}
                    </div>
                    {reasons.length > 0 && (
                        <div
                            style={{
                                fontSize: '0.6875rem',
                                color: cfg.fg,
                                opacity: 0.75,
                                marginTop: 1,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                            }}
                        >
                            {reasons.join(' · ')}
                        </div>
                    )}
                </div>
                <style>{`@keyframes legitPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }`}</style>
            </div>
        )
    }

    /* ─── INLINE variant ─ default pill ─── */
    return (
        <span
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            style={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                gap: sizing.gap,
                padding: sizing.pad,
                borderRadius: sizing.radius,
                background: cfg.bg,
                color: cfg.fg,
                border: `1px solid ${cfg.border}`,
                fontSize: sizing.font,
                fontWeight: 700,
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
                lineHeight: 1.2,
                cursor: reasons.length > 0 ? 'help' : 'default',
                whiteSpace: 'nowrap',
            }}
        >
            <Icon size={sizing.icon} />
            {cfg.short}

            {open && reasons.length > 0 && (
                <span
                    style={{
                        position: 'absolute',
                        top: 'calc(100% + 6px)',
                        left: 0,
                        zIndex: 50,
                        background: '#111827',
                        color: '#f9fafb',
                        padding: '8px 12px',
                        borderRadius: 8,
                        fontSize: '0.6875rem',
                        fontWeight: 500,
                        letterSpacing: 0,
                        textTransform: 'none',
                        maxWidth: 280,
                        whiteSpace: 'normal',
                        lineHeight: 1.5,
                        boxShadow: '0 10px 30px -8px rgba(0,0,0,0.4)',
                        pointerEvents: 'none',
                    }}
                >
                    <div style={{ fontWeight: 700, marginBottom: 4, color: cfg.accent }}>
                        {cfg.label}
                    </div>
                    {reasons.map((r) => (
                        <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                            <span style={{
                                width: 3, height: 3, borderRadius: '50%',
                                background: cfg.accent, flexShrink: 0,
                            }} />
                            {r}
                        </div>
                    ))}
                </span>
            )}
        </span>
    )
}
