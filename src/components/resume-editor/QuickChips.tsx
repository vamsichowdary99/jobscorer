// resuscore/src/components/resume-editor/QuickChips.tsx
'use client'
import React from 'react'
import { M } from './tokens'

const CHIPS = ['Tailor for this job', 'Fix summary keyword', 'Shorten resume']

export function QuickChips({ onSelect }: { onSelect: (chip: string) => void }) {
    return (
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', padding: '7px 14px 4px', borderTop: `1px solid ${M.borderLight}`, background: M.white, flexShrink: 0 }}>
            {CHIPS.map(chip => (
                <button key={chip} onClick={() => onSelect(chip)}
                    style={{ padding: '6px 13px', borderRadius: 20, border: `1px solid ${M.border}`, background: M.white, color: M.textMid, fontSize: '0.8125rem', fontFamily: M.fontBody, cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = M.accentBorder; e.currentTarget.style.background = M.accentLight; e.currentTarget.style.color = M.accent }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = M.border; e.currentTarget.style.background = M.white; e.currentTarget.style.color = M.textMid }}>
                    {chip}
                </button>
            ))}
        </div>
    )
}
