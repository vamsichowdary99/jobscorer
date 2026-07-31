'use client'

import { useEffect, useRef } from 'react'
import { M } from '@/lib/meridianTokens'

let stylesInjected = false
function injectStyles() {
    if (stylesInjected || typeof document === 'undefined') return
    if (document.getElementById('confirm-modal-styles')) { stylesInjected = true; return }
    const s = document.createElement('style')
    s.id = 'confirm-modal-styles'
    s.textContent = `
      @keyframes confirm-modal-backdrop { from { opacity: 0 } to { opacity: 1 } }
      @keyframes confirm-modal-card { from { opacity: 0; transform: scale(0.96) translateY(4px) } to { opacity: 1; transform: scale(1) translateY(0) } }
      @media (prefers-reduced-motion: reduce) {
        .confirm-modal-backdrop, .confirm-modal-card { animation: none !important; }
      }
      .confirm-modal-cancel:hover { background: ${M.surface}; border-color: ${M.border}; }
      .confirm-modal-confirm:hover { filter: brightness(0.93); }
      .confirm-modal-confirm:focus-visible, .confirm-modal-cancel:focus-visible {
        outline: 2px solid ${M.accent}; outline-offset: 2px;
      }
    `
    document.head.appendChild(s)
    stylesInjected = true
}

/**
 * Replaces window.confirm() for destructive actions — a native browser
 * dialog reads as "the browser is asking," not "jobscorer.in is asking,"
 * and can't carry the app's own voice or branding.
 */
export default function ConfirmModal({
    open, title = 'Delete this?', message, confirmLabel = 'Delete', cancelLabel = 'Cancel', danger = true, onConfirm, onCancel,
}: {
    open: boolean
    title?: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    danger?: boolean
    onConfirm: () => void
    onCancel: () => void
}) {
    const cancelRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        injectStyles()
    }, [])

    useEffect(() => {
        if (!open) return
        // Cancel gets default focus, never the destructive action — an
        // accidental Enter press must never delete something.
        cancelRef.current?.focus()
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open, onCancel])

    if (!open) return null

    return (
        <div
            className="confirm-modal-backdrop"
            onClick={onCancel}
            role="presentation"
            style={{
                position: 'fixed', inset: 0, zIndex: 1000,
                background: 'rgba(15,30,64,0.45)', backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
                animation: 'confirm-modal-backdrop 160ms ease',
            }}
        >
            <div
                className="confirm-modal-card"
                onClick={e => e.stopPropagation()}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="confirm-modal-title"
                aria-describedby="confirm-modal-message"
                style={{
                    background: M.white, borderRadius: 18, width: 380, maxWidth: '100%',
                    padding: '24px 24px 20px', boxShadow: '0 24px 60px rgba(15,30,64,0.22)',
                    fontFamily: M.fontBody, animation: 'confirm-modal-card 180ms cubic-bezier(.2,.8,.2,1)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 18 }}>
                    <div
                        aria-hidden
                        style={{
                            flexShrink: 0, width: 38, height: 38, borderRadius: 12,
                            background: danger ? '#FEF2F2' : M.accentLight,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={danger ? M.red : M.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" />
                            <path d="M10 11v6M14 11v6" />
                        </svg>
                    </div>
                    <div>
                        <div id="confirm-modal-title" style={{ fontSize: 16.5, fontWeight: 800, color: M.text, letterSpacing: '-0.01em' }}>{title}</div>
                        <div id="confirm-modal-message" style={{ fontSize: 13.5, color: M.textMuted, lineHeight: 1.5, marginTop: 5 }}>{message}</div>
                    </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button
                        ref={cancelRef}
                        className="confirm-modal-cancel"
                        onClick={onCancel}
                        style={{ padding: '9px 18px', borderRadius: 9999, background: 'none', border: `1.5px solid ${M.borderLight}`, cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: M.textMid, fontFamily: M.fontBody, transition: 'background 120ms ease, border-color 120ms ease' }}
                    >
                        {cancelLabel}
                    </button>
                    <button
                        className="confirm-modal-confirm"
                        onClick={onConfirm}
                        style={{ padding: '9px 20px', borderRadius: 9999, background: danger ? M.red : M.accent, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 700, fontFamily: M.fontBody, transition: 'filter 120ms ease' }}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    )
}
