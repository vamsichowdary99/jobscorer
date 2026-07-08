// resuscore/src/components/resume-editor/ScoreHeader.tsx
'use client'
import React from 'react'
import { M } from './tokens'
import { ScoreRing } from './ScoreRing'

export function ScoreHeader({ coverage, coverageStart, coverageMax, floatDelta, rescoring, rescoredCaption, onRescore }: {
    coverage: number
    coverageStart: number
    coverageMax: number
    floatDelta: { value: string; key: number } | null
    rescoring: boolean
    rescoredCaption: string
    onRescore: () => void
}) {
    return (
        <div style={{ background: M.surface, borderBottom: `1px solid ${M.borderLight}`, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <style>{`@keyframes ra-spin { to { transform: rotate(360deg); } } @keyframes ra-float-up { 0% { opacity: 1; transform: translateY(0); } 100% { opacity: 0; transform: translateY(-30px); } }`}</style>

            <div style={{ position: 'relative', flexShrink: 0 }}>
                <ScoreRing value={coverage} max={coverageMax} />
                {floatDelta && (
                    <div key={floatDelta.key} style={{ position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)', fontSize: '0.875rem', fontWeight: 800, color: M.green, fontFamily: M.fontMono, animation: 'ra-float-up 1.4s ease forwards', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                        {floatDelta.value}
                    </div>
                )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.8125rem', color: M.textMid, fontFamily: M.fontBody, marginBottom: 2 }}>
                    <span style={{ fontWeight: 600 }}>Keyword coverage</span>{' '}
                    <span style={{ color: M.textFaint, fontFamily: M.fontMono }}>{coverageStart} →</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 3 }}>
                    <span style={{ fontSize: '1rem', fontWeight: 800, color: M.green, fontFamily: M.fontMono }}>{coverage}</span>
                    <span style={{ fontSize: '0.8125rem', color: M.textFaint, fontFamily: M.fontMono }}>· {coverageMax} possible</span>
                </div>
                <div style={{ fontSize: '0.6875rem', color: M.textFaint, fontFamily: M.fontBody, lineHeight: 1.35 }}>
                    Updates instantly on every applied change
                </div>
            </div>

            <div style={{ flexShrink: 0, textAlign: 'right' }}>
                <button onClick={onRescore} disabled={rescoring} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 7, border: `1px solid ${M.accentBorder}`, background: M.white, color: M.accent, fontSize: '0.75rem', fontWeight: 600, cursor: rescoring ? 'default' : 'pointer', fontFamily: M.fontBody, marginBottom: 3, whiteSpace: 'nowrap' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={M.accent} strokeWidth="2.5" style={rescoring ? { animation: 'ra-spin 1s linear infinite' } : undefined}>
                        <path d="M21 12a9 9 0 11-2.64-6.36" />
                        <path d="M21 3v6h-6" />
                    </svg>
                    Re-score match
                </button>
                <div style={{ fontSize: '0.625rem', color: M.textFaint, fontFamily: M.fontMono, whiteSpace: 'nowrap' }}>{rescoredCaption}</div>
            </div>
        </div>
    )
}
