// resuscore/src/components/resume-editor/ScoreRing.tsx
'use client'
import React from 'react'
import { M } from './tokens'

// Pure progress ring — no text label baked in beyond the number itself.
// The "what is this a percentage of" context lives in the caller (ScoreHeader),
// not crammed as illegible sub-6px text inside the ring.
export function ScoreRing({ value, max = 100, size = 60, stroke = 6 }: {
    value: number
    max?: number
    size?: number
    stroke?: number
}) {
    const r = (size - stroke) / 2
    const circumference = 2 * Math.PI * r
    const pct = Math.max(0, Math.min(1, value / max))
    const fontSize = Math.round(size * 0.33)
    return (
        <svg width={size} height={size} style={{ flexShrink: 0 }}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={M.borderLight} strokeWidth={stroke} />
            <circle
                cx={size / 2} cy={size / 2} r={r} fill="none" stroke={M.accent} strokeWidth={stroke}
                strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - pct)}
                style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', transition: 'stroke-dashoffset 0.4s ease' }}
            />
            <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
                fontSize={fontSize} fontWeight={800} fill={M.text} fontFamily={M.fontBody}>{value}</text>
        </svg>
    )
}
