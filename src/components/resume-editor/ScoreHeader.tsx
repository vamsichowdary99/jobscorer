// resuscore/src/components/resume-editor/ScoreHeader.tsx
'use client'
import React from 'react'
import { M } from './tokens'
import { ScoreRing } from './ScoreRing'

export function ScoreHeader({ coverage, coverageMax, floatDelta, rescoring, rescoredCaption, onRescore }: {
    coverage: number
    coverageMax: number
    floatDelta: { value: string; key: number } | null
    rescoring: boolean
    rescoredCaption: string
    onRescore: () => void
}) {
    return (
        <div style={{ background: M.surface, borderBottom: `1px solid ${M.borderLight}`, padding: '14px 16px 12px', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
            <style>{`@keyframes ra-spin { to { transform: rotate(360deg); } } @keyframes ra-float-up { 0% { opacity: 1; transform: translateY(0); } 100% { opacity: 0; transform: translateY(-30px); } }`}</style>

            {/* Row 1 — ring + primary stat, given room to breathe */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                    <ScoreRing value={coverage} max={coverageMax} size={60} stroke={6} />
                    {floatDelta && (
                        <div key={floatDelta.key} style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', fontSize: '0.9375rem', fontWeight: 800, color: M.green, fontFamily: M.fontMono, animation: 'ra-float-up 1.4s ease forwards', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                            {floatDelta.value}
                        </div>
                    )}
                </div>
                <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: M.textFaint, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: M.fontMono, marginBottom: 4 }}>
                        Keyword Coverage
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '1.5rem', fontWeight: 800, color: M.text, fontFamily: M.fontHeading, lineHeight: 1 }}>{coverage}</span>
                        <span style={{ fontSize: '0.8125rem', color: M.textMuted, fontFamily: M.fontBody }}>of {coverageMax} possible</span>
                    </div>
                </div>
            </div>

            {/* Row 2 — caption + re-score control, its own row so it never competes for space */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 10, borderTop: `1px solid ${M.borderLight}` }}>
                <span style={{ fontSize: '0.75rem', color: M.textFaint, fontFamily: M.fontBody, lineHeight: 1.4 }}>
                    Updates instantly on every applied change
                </span>
                <div style={{ flexShrink: 0, textAlign: 'right' }}>
                    <button onClick={onRescore} disabled={rescoring} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 7, border: `1px solid ${M.accentBorder}`, background: M.white, color: M.accent, fontSize: '0.75rem', fontWeight: 600, cursor: rescoring ? 'default' : 'pointer', fontFamily: M.fontBody, marginBottom: 3, whiteSpace: 'nowrap' }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={M.accent} strokeWidth="2.5" style={rescoring ? { animation: 'ra-spin 1s linear infinite' } : undefined}>
                            <path d="M21 12a9 9 0 11-2.64-6.36" />
                            <path d="M21 3v6h-6" />
                        </svg>
                        Re-score match
                    </button>
                    <div style={{ fontSize: '0.6875rem', color: M.textFaint, fontFamily: M.fontMono, whiteSpace: 'nowrap' }}>{rescoredCaption}</div>
                </div>
            </div>
        </div>
    )
}
