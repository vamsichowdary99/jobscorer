// resuscore/src/components/resume-editor/AuditCard.tsx
'use client'
import React, { useState } from 'react'
import { M } from './tokens'
import type { AuditItem } from './types'

export function AuditCard({ items, allDone, generated, loading, coverage, onItemClick, onApplyAll, onFindImprovements }: {
    items: AuditItem[]
    allDone: boolean
    // Audit generation is manual now (post-Phase-3 cost pass) — generated
    // distinguishes "never asked" (show the find-improvements prompt below)
    // from "asked and everything's already fixed" (the allDone success state).
    generated: boolean
    loading: boolean
    coverage: number
    onItemClick: (id: string) => void
    onApplyAll: () => void
    onFindImprovements: () => void
}) {
    const [hoverId, setHoverId] = useState<string | null>(null)
    // Collapsible so the suggestion list doesn't crowd out the chat below it
    // in the fixed-height Assistant panel — defaults open (unchanged behavior).
    const [collapsed, setCollapsed] = useState(false)

    if (!generated) {
        return (
            <div style={{ background: M.white, border: `1px solid ${M.border}`, borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 700, color: M.text, fontFamily: M.fontHeading }}>Find improvements</div>
                    <div style={{ fontSize: '0.75rem', color: M.textMuted, fontFamily: M.fontBody, marginTop: 2 }}>Let AI scan this resume against the job for specific fixes.</div>
                </div>
                <button onClick={onFindImprovements} disabled={loading} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: M.accent, color: '#fff', fontSize: '0.8125rem', fontWeight: 600, cursor: loading ? 'default' : 'pointer', fontFamily: M.fontBody, whiteSpace: 'nowrap', opacity: loading ? 0.7 : 1, flexShrink: 0 }}>
                    {loading ? 'Analyzing…' : '✦ Find improvements'}
                </button>
            </div>
        )
    }

    if (allDone) {
        return (
            <div style={{ background: M.greenLight, border: `1px solid ${M.greenBorder}`, borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={M.green} strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
                <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 700, color: M.green, fontFamily: M.fontHeading }}>Nothing left to fix · Coverage {coverage}</div>
                    <div style={{ fontSize: '0.75rem', color: M.green, fontFamily: M.fontBody }}>All improvements applied</div>
                </div>
            </div>
        )
    }

    const totalScore = items.reduce((s, a) => s + a.score, 0)

    return (
        <div style={{ background: M.white, border: `1px solid ${M.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px 9px', borderBottom: collapsed ? 'none' : `1px solid ${M.borderLight}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: '0.8125rem', color: M.accent }}>✦</span>
                    <span style={{ fontSize: '0.875rem', fontWeight: 700, color: M.text, fontFamily: M.fontHeading, letterSpacing: '-0.01em' }}>Found {items.length} improvements</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {!collapsed && (
                        <button onClick={onApplyAll} style={{ fontSize: '0.8rem', fontWeight: 600, color: M.accent, background: 'none', border: 'none', cursor: 'pointer', fontFamily: M.fontBody }}>Apply all</button>
                    )}
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: M.green, background: M.greenLight, padding: '2px 8px', borderRadius: 20, border: `1px solid ${M.greenBorder}`, fontFamily: M.fontMono }}>+{totalScore}</span>
                    <button
                        onClick={() => setCollapsed(c => !c)}
                        title={collapsed ? 'Show suggestions' : 'Hide suggestions — see chat'}
                        aria-label={collapsed ? 'Show suggestions' : 'Hide suggestions — see chat'}
                        aria-expanded={!collapsed}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer', flexShrink: 0, marginLeft: 2 }}
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={M.textMuted} strokeWidth="2.5"
                            style={{ transform: collapsed ? 'none' : 'rotate(180deg)', transition: 'transform 0.2s' }}>
                            <path d="M6 9l6 6 6-6" />
                        </svg>
                    </button>
                </div>
            </div>
            {!collapsed && <div style={{ padding: '6px 14px 8px' }}>
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
            </div>}
        </div>
    )
}
