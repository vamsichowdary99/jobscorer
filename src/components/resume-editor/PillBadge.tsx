// resuscore/src/components/resume-editor/PillBadge.tsx
'use client'
import React from 'react'
import { M } from './tokens'
import type { ProposalBadge } from './types'

const VARIANTS: Record<ProposalBadge, { bg: string; border: string; color: string; label: string }> = {
    message: { bg: M.accentLight, border: M.accentBorder, color: M.accent, label: 'From your message' },
    project: { bg: M.greenLight, border: M.greenBorder, color: M.green, label: 'From your resume' },
    ai: { bg: M.surfaceAlt, border: M.border, color: M.textMid, label: 'AI wording — no facts added' },
    evidence: { bg: M.greenLight, border: M.greenBorder, color: M.green, label: 'From your completed project' },
}

export function PillBadge({ type }: { type: ProposalBadge }) {
    const v = VARIANTS[type]
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: 20,
            background: v.bg, border: `1px solid ${v.border}`, fontSize: '0.6875rem', fontWeight: 600,
            color: v.color, fontFamily: M.fontBody, whiteSpace: 'nowrap',
        }}>
            {v.label}
        </span>
    )
}
