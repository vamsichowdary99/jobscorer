// resuscore/src/components/resume-editor/SkeletonCard.tsx
'use client'
import React from 'react'
import { A } from './tokens'

const SHIMMER_STYLE: React.CSSProperties = {
    background: `linear-gradient(90deg, ${A.skeletonBase} 25%, ${A.skeletonHighlight} 50%, ${A.skeletonBase} 75%)`,
    backgroundSize: '400px 100%',
    animation: 'ra-shimmer 1.4s infinite linear',
    borderRadius: 4,
}

const ROWS: [string, number][] = [['40%', 0], ['90%', 8], ['70%', 4], ['85%', 12], ['65%', 4]]

export function SkeletonCard() {
    return (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <style>{`@keyframes ra-shimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }`}</style>
            {ROWS.map(([w, mt], i) => (
                <div key={i} style={{ ...SHIMMER_STYLE, height: 10, width: w, marginTop: mt }} />
            ))}
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                {['56px', '56px', '76px'].map((w, i) => (
                    <div key={i} style={{ ...SHIMMER_STYLE, height: 30, width: w, borderRadius: 7 }} />
                ))}
            </div>
        </div>
    )
}
