// resuscore/src/components/resume-editor/MobileAssistantSheet.tsx
//
// Mobile surface for the Resume Studio AI Assistant: a bottom sheet over the
// full-screen resume preview (rendered by the caller, page.tsx). Reuses the
// same sub-components and the same useAssistant() controller as the desktop
// AssistantPanel — this is a different arrangement of the same real,
// backend-wired state, not a separate mock implementation.
'use client'
import React, { useState } from 'react'
import { M, A } from './tokens'
import type { AssistantController } from './useAssistant'
import { ScoreHeader } from './ScoreHeader'
import { AuditCard } from './AuditCard'
import { MessageList } from './MessageList'
import { DiffCard } from './DiffCard'
import { SkeletonCard } from './SkeletonCard'
import { QuickChips } from './QuickChips'

type SheetState = 'closed' | 'half' | 'card' | 'full'

// Proportional heights of the tab's own container (not raw viewport), so
// this scales sanely across phone sizes without a resize-observer. `card`
// gets the most room since a full diff card (before/after/why/footer) is
// taller than the audit list `full` needs.
const SHEET_HEIGHT: Record<SheetState, string> = {
    closed: '0px', half: '38%', card: '58%', full: '54%',
}

export function MobileAssistantSheet({ assistant: a }: { assistant: AssistantController }) {
    // Arriving on the Assistant tab is itself the "open" action, so start
    // showing content rather than the closed-state pill (skip the extra tap
    // the original pill-triggered-from-elsewhere design assumed). This is
    // the sheet's "resting" state, distinct from `displayState` below.
    const [sheetState, setSheetState] = useState<SheetState>('full')
    // User-controlled "make it bigger" override, independent of sheetState —
    // whatever content is currently showing (audit list, chat, diff card)
    // just gets more room. Doesn't reset on its own; the user toggles it off
    // the same way they toggled it on.
    const [expanded, setExpanded] = useState(false)

    // A pending/active/editing proposal always takes over the sheet as `card`
    // layout, regardless of the resting state — computed as a plain derived
    // value (no ref-diffing, no effect) so it can never drift out of sync
    // with `a.activeCard`. Explicitly closing the sheet is still respected:
    // an unresolved card behind a closed sheet doesn't force it back open.
    const displayState: SheetState = sheetState === 'closed' ? 'closed' : a.activeCard ? 'card' : sheetState

    // Spec: Apply/Reject always returns the sheet to `half` (resume visible,
    // card gone) — not "back to whatever it was," a fixed resting state.
    const handleApply = (text?: string) => { a.applyActiveCard(text); setSheetState('half') }
    const handleReject = () => { a.rejectActiveCard(); setSheetState('half') }

    const pendingCount = a.auditItems.filter(item => !item.done).length

    if (displayState === 'closed') {
        return (
            <button onClick={() => setSheetState('full')} style={{
                position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)',
                background: A.darkToast, color: '#fff', borderRadius: 24, padding: '12px 20px',
                display: 'flex', alignItems: 'center', gap: 9, boxShadow: '0 8px 28px rgba(0,0,0,0.3)',
                border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', zIndex: 60, fontFamily: M.fontBody,
            }}>
                <span style={{ color: A.toastLink, fontSize: '1rem' }}>✦</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                    {a.auditGenerated && pendingCount > 0 ? `${pendingCount} improvement${pendingCount !== 1 ? 's' : ''}` : 'Ask AI Assistant'}
                </span>
                {a.auditGenerated && (
                    <>
                        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.2)' }} />
                        <span style={{ fontSize: '0.9rem', fontWeight: 800, color: A.toastLink, fontFamily: M.fontMono }}>{a.coverage}</span>
                    </>
                )}
            </button>
        )
    }

    const showAudit = displayState === 'full'
    const chatIsStub = displayState === 'card'
    const sheetHeight = expanded ? '88%' : SHEET_HEIGHT[displayState]

    return (
        <>
            {a.toasts.length > 0 && (
                <div style={{
                    position: 'absolute', bottom: `calc(${sheetHeight} + 12px)`, left: 12, right: 12,
                    display: 'flex', flexDirection: 'column', gap: 6, zIndex: 70, pointerEvents: 'none',
                }}>
                    {a.toasts.map(t => (
                        <div key={t.id} style={{
                            background: A.darkToast, color: '#fff', borderRadius: 10, padding: '9px 14px',
                            display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                            fontSize: '0.8125rem', fontFamily: M.fontBody, pointerEvents: 'auto',
                        }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
                            <span style={{ flex: 1 }}>{t.text}</span>
                            <button onClick={t.onUndo} style={{ color: A.toastLink, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontFamily: M.fontBody, fontSize: '0.8125rem' }}>Undo</button>
                        </div>
                    ))}
                </div>
            )}

            <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, height: sheetHeight,
                background: M.white, borderRadius: '18px 18px 0 0', boxShadow: '0 -8px 32px rgba(15,23,42,0.18)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                transition: 'height 0.35s cubic-bezier(0.4,0,0.2,1)', zIndex: 55,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px 4px', flexShrink: 0 }}>
                    <div style={{ width: 30, height: 4, borderRadius: 2, background: M.border }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button onClick={() => setExpanded(e => !e)} aria-label={expanded ? 'Shrink assistant panel' : 'Enlarge assistant panel'} title={expanded ? 'Shrink panel' : 'Enlarge panel'} style={{
                            background: M.surface, border: `1px solid ${M.border}`, borderRadius: 7, width: 26, height: 26,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: M.textMuted,
                        }}>
                            {expanded ? (
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                            ) : (
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 15l6-6 6 6" /></svg>
                            )}
                        </button>
                        <button onClick={() => setSheetState('closed')} aria-label="Close assistant" style={{
                            background: M.surface, border: `1px solid ${M.border}`, borderRadius: 7, width: 26, height: 26,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: M.textMuted,
                        }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                        </button>
                    </div>
                </div>

                <ScoreHeader
                    coverage={a.coverage} coverageStart={a.coverageStart} coverageMax={a.coverageMax} floatDelta={a.floatDelta}
                    rescoring={a.rescoring} rescoredCaption={a.rescoredCaption} onRescore={a.onRescore}
                />

                {showAudit && (
                    <div style={{ padding: '8px 14px 0', flexShrink: 0, maxHeight: '40%', overflowY: 'auto' }}>
                        <AuditCard items={a.auditItems} allDone={a.allDone} generated={a.auditGenerated} loading={a.auditLoading} coverage={a.coverage} onItemClick={a.onAuditItemClick} onApplyAll={a.onApplyAll} onFindImprovements={a.onFindImprovements} />
                    </div>
                )}

                <div style={{ flex: chatIsStub ? '0 0 44px' : '1', minHeight: 0, overflow: 'hidden' }}>
                    <MessageList messages={a.messages} isTyping={a.isTyping} />
                </div>

                {a.activeCard && (
                    // maxHeight (not just overflowY) is load-bearing here: without a real
                    // cap, a long diff card sizes to its content and can push Apply/Reject
                    // below the sheet's own overflow:hidden bound with no way to scroll to
                    // them — mirrors the desktop version's 46vh cap for the same reason.
                    <div style={{ padding: '6px 12px', background: M.surface, borderTop: `1px solid ${M.borderLight}`, flexShrink: 0, maxHeight: '70%', overflowY: 'auto' }}>
                        {a.activeCard.state === 'pending' ? (
                            <SkeletonCard />
                        ) : (
                            <DiffCard
                                proposal={a.activeCard.proposal}
                                state={a.activeCard.state as 'active' | 'editing' | 'applied' | 'rejected'}
                                onApply={handleApply}
                                onReject={handleReject}
                                onEdit={a.editActiveCard}
                            />
                        )}
                    </div>
                )}

                <QuickChips onSelect={a.sendChip} />

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: M.white, borderTop: `1px solid ${M.borderLight}`, flexShrink: 0 }}>
                    <input type="text" value={a.inputValue} onChange={e => a.setInputValue(e.target.value)}
                        placeholder="Ask about your resume…"
                        onKeyDown={e => { if (e.key === 'Enter') a.sendMessage(a.inputValue) }}
                        style={{ flex: 1, padding: '9px 14px', borderRadius: 22, border: `1.5px solid ${M.border}`, background: M.surface, fontSize: '0.875rem', fontFamily: M.fontBody, color: M.text, outline: 'none' }} />
                    <button onClick={() => a.sendMessage(a.inputValue)} style={{ width: 36, height: 36, borderRadius: '50%', background: M.accent, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: `0 2px 8px ${M.accent}44` }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
                    </button>
                </div>
            </div>
        </>
    )
}
