// resuscore/src/components/resume-editor/AssistantPanel.tsx
'use client'
import React from 'react'
import { M, A } from './tokens'
import type { AssistantController } from './useAssistant'
import { ScoreHeader } from './ScoreHeader'
import { AuditCard } from './AuditCard'
import { MessageList } from './MessageList'
import { DiffCard } from './DiffCard'
import { SkeletonCard } from './SkeletonCard'
import { QuickChips } from './QuickChips'

export function AssistantPanel({ controller: a }: { controller: AssistantController }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <ScoreHeader
                coverage={a.coverage} coverageStart={a.coverageStart} coverageMax={a.coverageMax} floatDelta={a.floatDelta}
                rescoring={a.rescoring} rescoredCaption={a.rescoredCaption} onRescore={a.onRescore}
            />

            <div style={{ padding: '10px 14px 0', flexShrink: 0, maxHeight: '30vh', overflowY: 'auto' }}>
                <AuditCard items={a.auditItems} allDone={a.allDone} generated={a.auditGenerated} loading={a.auditLoading} coverage={a.coverage} onItemClick={a.onAuditItemClick} onApplyAll={a.onApplyAll} onFindImprovements={a.onFindImprovements} />
            </div>

            <MessageList messages={a.messages} isTyping={a.isTyping} />

            {a.activeCard && (
                <div style={{ padding: '8px 12px', background: M.surface, borderTop: `1px solid ${M.borderLight}`, flexShrink: 0, maxHeight: '46vh', overflowY: 'auto' }}>
                    {a.activeCard.state === 'pending' ? (
                        <SkeletonCard />
                    ) : (
                        <DiffCard
                            proposal={a.activeCard.proposal}
                            state={a.activeCard.state as 'active' | 'editing' | 'applied' | 'rejected'}
                            onApply={a.applyActiveCard}
                            onReject={a.rejectActiveCard}
                            onEdit={a.editActiveCard}
                        />
                    )}
                </div>
            )}

            <QuickChips onSelect={a.sendChip} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: M.white, borderTop: `1px solid ${M.borderLight}`, flexShrink: 0 }}>
                <input type="text" value={a.inputValue} onChange={e => a.setInputValue(e.target.value)}
                    placeholder="Ask anything about your resume…"
                    onKeyDown={e => { if (e.key === 'Enter') a.sendMessage(a.inputValue) }}
                    style={{ flex: 1, padding: '9px 14px', borderRadius: 22, border: `1.5px solid ${M.border}`, background: M.surface, fontSize: '0.875rem', fontFamily: M.fontBody, color: M.text, outline: 'none' }} />
                <button onClick={() => a.sendMessage(a.inputValue)} style={{ width: 36, height: 36, borderRadius: '50%', background: M.accent, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: `0 2px 8px ${M.accent}44` }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
                </button>
            </div>

            {a.toasts.length > 0 && (
                <div style={{ position: 'fixed', bottom: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 6, zIndex: 200 }}>
                    {a.toasts.map(t => (
                        <div key={t.id} style={{ background: A.darkToast, color: '#fff', borderRadius: 10, padding: '9px 16px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.25)', fontSize: '0.8125rem', fontFamily: M.fontBody }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
                            <span>{t.text}</span>
                            <button onClick={t.onUndo} style={{ background: 'none', border: 'none', cursor: 'pointer', color: A.toastLink, fontSize: '0.8125rem', fontWeight: 600, fontFamily: M.fontBody }}>Undo</button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
