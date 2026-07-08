// resuscore/src/components/resume-editor/DiffCard.tsx
'use client'
import React, { useState } from 'react'
import { M, A } from './tokens'
import type { Proposal } from './types'
import { PillBadge } from './PillBadge'

export function DiffCard({ proposal, state, onApply, onReject, onEdit }: {
    proposal: Proposal
    state: 'active' | 'editing' | 'applied' | 'rejected'
    onApply: (text?: string) => void
    onReject: () => void
    onEdit: () => void
}) {
    const [editText, setEditText] = useState(proposal.after)

    if (state === 'applied') {
        return (
            <div style={{ background: A.greenBg, border: `1px solid ${M.greenBorder}`, borderRadius: 8, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={M.green} strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
                <span style={{ fontSize: '0.8rem', color: M.green, fontWeight: 600, fontFamily: M.fontBody, flex: 1 }}>Applied · {proposal.sectionLabel}</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: M.green, fontFamily: M.fontMono }}>+{proposal.est}</span>
            </div>
        )
    }

    if (state === 'rejected') {
        return (
            <div style={{ background: M.surface, border: `1px solid ${M.border}`, borderRadius: 8, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8, opacity: 0.65 }}>
                <span style={{ color: M.textFaint, fontSize: '0.875rem' }}>✕</span>
                <span style={{ fontSize: '0.8rem', color: M.textMuted, fontFamily: M.fontBody }}>Suggestion rejected · {proposal.sectionLabel}</span>
            </div>
        )
    }

    return (
        <div style={{ background: M.white, border: `1.5px solid ${M.accent}22`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 24px rgba(29,106,245,0.10)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', background: '#fafbff', borderBottom: `1px solid ${M.borderLight}` }}>
                <span style={{ fontSize: '0.75rem', fontFamily: M.fontBody, color: M.text, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proposal.sectionLabel}</span>
                <PillBadge type={proposal.badge} />
            </div>
            <div style={{ padding: '11px 14px 9px' }}>
                <div style={{ marginBottom: 9 }}>
                    <div style={{ fontSize: '0.575rem', fontWeight: 700, letterSpacing: '0.1em', color: M.textFaint, textTransform: 'uppercase', marginBottom: 4, fontFamily: M.fontMono }}>BEFORE</div>
                    <div style={{ fontSize: '0.8125rem', lineHeight: 1.55, color: M.textFaint, fontFamily: M.fontBody, padding: '7px 10px', background: A.beforeBg, borderRadius: 7, borderLeft: `2px solid ${A.beforeBorder}` }}>{proposal.before}</div>
                </div>
                <div style={{ marginBottom: 9 }}>
                    <div style={{ fontSize: '0.575rem', fontWeight: 700, letterSpacing: '0.1em', color: M.green, textTransform: 'uppercase', marginBottom: 4, fontFamily: M.fontMono }}>AFTER</div>
                    {state === 'editing' ? (
                        <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={3}
                            style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: `1.5px solid ${M.accent}`, background: M.white, fontSize: '0.8125rem', fontFamily: M.fontBody, color: M.text, resize: 'vertical', lineHeight: 1.5, boxSizing: 'border-box' }} />
                    ) : (
                        <div style={{ fontSize: '0.8125rem', lineHeight: 1.55, color: M.text, fontWeight: 500, fontFamily: M.fontBody, padding: '7px 10px', background: A.greenAfterBg, borderRadius: 7, borderLeft: `2.5px solid ${M.greenBorder}` }}>{proposal.after}</div>
                    )}
                </div>
                <div style={{ fontSize: '0.775rem', color: M.textMuted, fontFamily: M.fontBody, lineHeight: 1.5, padding: '5px 10px', background: M.surface, borderRadius: 6, marginBottom: 9 }}>
                    <span style={{ fontWeight: 600, color: M.textMid }}>Why: </span>{proposal.why}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: `1px solid ${M.borderLight}` }}>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: M.green, fontFamily: M.fontMono }}>est. +{proposal.est}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {state === 'editing' ? (
                            <>
                                <button onClick={onReject} style={{ padding: '6px 12px', border: 'none', background: 'none', cursor: 'pointer', color: M.textMuted, fontSize: '0.8125rem', fontWeight: 500, fontFamily: M.fontBody }}>Cancel</button>
                                <button onClick={() => onApply(editText)} style={{ padding: '6px 18px', border: 'none', borderRadius: 7, background: M.accent, color: '#fff', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', fontFamily: M.fontBody, boxShadow: `0 1px 8px ${M.accent}44` }}>Save & Apply</button>
                            </>
                        ) : (
                            <>
                                <button onClick={onReject} style={{ padding: '6px 12px', border: 'none', background: 'none', cursor: 'pointer', color: M.textMuted, fontSize: '0.8125rem', fontWeight: 500, fontFamily: M.fontBody }}>Reject</button>
                                <button onClick={onEdit} style={{ padding: '6px 13px', border: `1px solid ${M.border}`, borderRadius: 7, background: M.white, color: M.text, fontSize: '0.8125rem', fontWeight: 500, cursor: 'pointer', fontFamily: M.fontBody }}>Edit</button>
                                <button onClick={() => onApply()} style={{ padding: '6px 18px', border: 'none', borderRadius: 7, background: M.accent, color: '#fff', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', fontFamily: M.fontBody, boxShadow: `0 2px 10px ${M.accent}44` }}>✓ Apply</button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
