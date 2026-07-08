// resuscore/src/components/resume-editor/AuditCard.tsx
'use client'
import React, { useState } from 'react'
import { M } from './tokens'
import type { AuditItem } from './types'

export function AuditCard({ items, allDone, onItemClick, onApplyAll }: {
    items: AuditItem[]
    allDone: boolean
    onItemClick: (id: string) => void
    onApplyAll: () => void
}) {
    const [hoverId, setHoverId] = useState<string | null>(null)

    if (allDone) {
        return (
            <div style={{ background: M.greenLight, border: `1px solid ${M.greenBorder}`, borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={M.green} strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
                <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 700, color: M.green, fontFamily: M.fontHeading }}>Nothing left to fix · Coverage 82</div>
                    <div style={{ fontSize: '0.75rem', color: M.green, fontFamily: M.fontBody }}>All improvements applied</div>
                </div>
            </div>
        )
    }

    const totalScore = items.reduce((s, a) => s + a.score, 0)

    return (
        <div style={{ background: M.white, border: `1px solid ${M.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px 9px', borderBottom: `1px solid ${M.borderLight}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: '0.8125rem', color: M.accent }}>✦</span>
                    <span style={{ fontSize: '0.875rem', fontWeight: 700, color: M.text, fontFamily: M.fontHeading, letterSpacing: '-0.01em' }}>Found {items.length} improvements</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button onClick={onApplyAll} style={{ fontSize: '0.8rem', fontWeight: 600, color: M.accent, background: 'none', border: 'none', cursor: 'pointer', fontFamily: M.fontBody }}>Apply all</button>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: M.green, background: M.greenLight, padding: '2px 8px', borderRadius: 20, border: `1px solid ${M.greenBorder}`, fontFamily: M.fontMono }}>+{totalScore}</span>
                </div>
            </div>
            <div style={{ padding: '6px 14px 8px' }}>
                {items.map((item, i) => (
                    <div key={item.id}
                        onMouseEnter={() => !item.done && setHoverId(item.id)}
                        onMouseLeave={() => setHoverId(null)}
                        style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 0', borderBottom: i < items.length - 1 ? `1px solid ${M.borderLight}` : 'none' }}>
                        {item.done ? (
                            <div style={{ width: 18, height: 18, borderRadius: '50%', background: M.greenLight, border: `1.5px solid ${M.greenBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={M.green} strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
                            </div>
                        ) : (
                            <div style={{ width: 18, height: 18, borderRadius: '50%', background: M.amberLight, border: `1.5px solid ${M.amberBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <div style={{ width: 6, height: 6, borderRadius: '50%', background: M.amber }} />
                            </div>
                        )}
                        <span onClick={!item.done ? () => onItemClick(item.id) : undefined}
                            style={{ flex: 1, fontSize: '0.8125rem', color: item.done ? M.textMuted : M.text, fontFamily: M.fontBody, cursor: !item.done ? 'pointer' : 'default' }}>
                            {item.text}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                            {!item.done && hoverId === item.id && (
                                <button onClick={() => onItemClick(item.id)} style={{ fontSize: '0.7rem', fontWeight: 600, color: M.accent, background: M.accentLight, border: `1px solid ${M.accentBorder}`, borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontFamily: M.fontBody }}>Fix this →</button>
                            )}
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: item.done ? M.greenLight : M.amberLight, color: item.done ? M.green : M.amber, fontFamily: M.fontMono }}>+{item.score}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
