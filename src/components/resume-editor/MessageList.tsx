// resuscore/src/components/resume-editor/MessageList.tsx
'use client'
import React, { useEffect, useRef } from 'react'
import { M, A } from './tokens'
import type { ChatMessage } from './useAssistant'

export function MessageList({ messages, isTyping }: { messages: ChatMessage[]; isTyping: boolean }) {
    const ref = useRef<HTMLDivElement>(null)
    useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight })

    return (
        <div ref={ref} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
            <style>{`@keyframes ra-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }`}</style>
            {messages.length === 0 && !isTyping && (
                <div style={{ fontSize: '0.8125rem', color: M.textFaint, fontFamily: M.fontBody, textAlign: 'center', padding: '20px 8px' }}>
                    Ask me anything about your resume, or tap a quick action below.
                </div>
            )}
            {messages.map(msg => {
                if (msg.kind === 'user') return (
                    <div key={msg.id} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <div style={{ background: M.accentLight, border: `1px solid ${M.accentBorder}`, borderRadius: '12px 12px 3px 12px', padding: '8px 12px', maxWidth: '82%', fontSize: '0.875rem', color: M.text, fontFamily: M.fontBody, lineHeight: 1.5 }}>{msg.text}</div>
                    </div>
                )
                if (msg.kind === 'assistant') return (
                    <div key={msg.id} style={{ fontSize: '0.875rem', color: M.textMid, fontFamily: M.fontBody, lineHeight: 1.55, padding: '0 2px' }}>
                        {msg.text}
                        {msg.streaming && <span style={{ animation: 'ra-blink 1s infinite', marginLeft: 2 }}>▍</span>}
                    </div>
                )
                if (msg.kind === 'applied') return (
                    <div key={msg.id} style={{ background: A.greenBg, border: `1px solid ${M.greenBorder}`, borderRadius: 8, padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 7 }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={M.green} strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
                        <span style={{ fontSize: '0.775rem', color: M.green, fontWeight: 600, fontFamily: M.fontBody }}>Applied</span>
                        <span style={{ fontSize: '0.775rem', color: M.textMuted }}>·</span>
                        <span style={{ fontSize: '0.775rem', color: M.textMid, flex: 1, fontFamily: M.fontBody }}>{msg.text}</span>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: M.green, fontFamily: M.fontMono }}>+{msg.pts}</span>
                        <button onClick={msg.onUndo} style={{ color: M.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontFamily: M.fontBody, fontSize: '0.775rem' }}>Undo</button>
                    </div>
                )
                if (msg.kind === 'rejected') return (
                    <div key={msg.id} style={{ fontSize: '0.8125rem', color: M.textFaint, fontFamily: M.fontBody, padding: '0 2px', opacity: 0.7 }}>✕ Rejected · {msg.text}</div>
                )
                if (msg.kind === 'buttons') return (
                    <div key={msg.id} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {msg.buttons?.map(btn => (
                            <button key={btn.label} onClick={btn.onClick} style={{ padding: '7px 14px', borderRadius: 8, border: `1.5px solid ${M.accentBorder}`, background: M.accentLight, color: M.accent, fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', fontFamily: M.fontBody }}>{btn.label}</button>
                        ))}
                    </div>
                )
                return null
            })}
            {isTyping && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 2px' }}>
                    {[0, 1, 2].map(i => (
                        <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: M.textFaint, animation: `ra-blink 1s ease ${i * 0.2}s infinite` }} />
                    ))}
                </div>
            )}
        </div>
    )
}
