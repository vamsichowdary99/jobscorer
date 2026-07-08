// resuscore/src/components/resume-editor/ScoreRing.tsx
'use client'
import React from 'react'
import { M } from './tokens'

export function ScoreRing({ value, max = 100, size = 52, stroke = 5 }: {
    value: number
    max?: number
    size?: number
    stroke?: number
}) {
    const r = (size - stroke) / 2
    const circumference = 2 * Math.PI * r
    const pct = Math.max(0, Math.min(1, value / max))
    return (
        <svg width={size} height={size} style={{ flexShrink: 0 }}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={M.borderLight} strokeWidth={stroke} />
            <circle
                cx={size / 2} cy={size / 2} r={r} fill="none" stroke={M.accent} strokeWidth={stroke}
                strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - pct)}
                style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', transition: 'stroke-dashoffset 0.4s ease' }}
            />
            <text x={size / 2} y={size / 2 - 3} textAnchor="middle" dominantBaseline="middle"
                fontSize="12" fontWeight={800} fill={M.text} fontFamily={M.fontBody}>{value}</text>
            <text x={size / 2} y={size / 2 + 10} textAnchor="middle" fontSize="6.5" fill={M.textFaint}
                fontFamily={M.fontMono} letterSpacing="0.05em">COVERAGE</text>
        </svg>
    )
}
