'use client'

import React, { useEffect, useState } from 'react'
import { ACTIVE_TEMPLATES, TEMPLATE_IMAGES } from '@/templates/catalog'

export type TemplateId = 'classic' | 'rezi' | 'london' | 'harvard' | 'open-resume' | 'cobalt' | 'onyx' | 'jade' | 'lapis' | 'executive' | 'amber' | 'athens' | 'axis' | 'beacon'

interface TemplatePickerModalProps {
  onSelect: (id: TemplateId) => void
  onClose: () => void
  currentTemplateId?: string
}

const BLUE = '#2563EB'
const A4_RATIO = 210 / 297 // width / height

/* ─── Inject keyframes once ─────────────────────────────────── */
function useModalStyles() {
  useEffect(() => {
    if (document.getElementById('tpicker-styles')) return
    const s = document.createElement('style')
    s.id = 'tpicker-styles'
    s.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&display=swap');

      @keyframes tpick-fade { from { opacity:0 } to { opacity:1 } }
      @keyframes tpick-fade-up { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }

      @keyframes tpick-in-right {
        from { opacity:0; transform:translateX(3%) scale(.96); box-shadow: 0 20px 50px -12px rgba(15,23,42,.18); }
        to   { opacity:1; transform:translateX(0) scale(1); box-shadow: 0 60px 130px -20px rgba(15,23,42,.4), 0 20px 46px -12px rgba(15,23,42,.24); }
      }
      @keyframes tpick-in-left {
        from { opacity:0; transform:translateX(-3%) scale(.96); box-shadow: 0 20px 50px -12px rgba(15,23,42,.18); }
        to   { opacity:1; transform:translateX(0) scale(1); box-shadow: 0 60px 130px -20px rgba(15,23,42,.4), 0 20px 46px -12px rgba(15,23,42,.24); }
      }

      .tpick-center-right { animation: tpick-in-right 300ms cubic-bezier(.16,1,.3,1) both; }
      .tpick-center-left  { animation: tpick-in-left 300ms cubic-bezier(.16,1,.3,1) both; }
      .tpick-meta { animation: tpick-fade-up 260ms cubic-bezier(.16,1,.3,1) both; }

      .tpick-arrow {
        transition: background 160ms ease, border-color 160ms ease, color 160ms ease, transform 160ms ease, box-shadow 160ms ease;
      }
      .tpick-arrow:hover {
        background: ${BLUE}; border-color: ${BLUE}; color: #fff; transform: scale(1.08);
        box-shadow: 0 16px 32px rgba(37,99,235,.38);
      }
      .tpick-arrow:active { transform: scale(0.97); }

      .tpick-neighbor { transition: opacity 220ms ease, transform 220ms ease; cursor: pointer; }
      .tpick-neighbor:hover { opacity: .92 !important; }

      .tpick-center-scroll { scrollbar-width: none; -ms-overflow-style: none; }
      .tpick-center-scroll::-webkit-scrollbar { width: 0px; background: transparent; }
      .tpick-center-scroll:hover { scrollbar-width: thin; }
      .tpick-center-scroll:hover::-webkit-scrollbar { width: 6px; }
      .tpick-center-scroll::-webkit-scrollbar-thumb { background: rgba(15,23,42,.18); border-radius: 99px; }
      .tpick-center-scroll::-webkit-scrollbar-track { background: transparent; }

      .tpick-use-btn { transition: transform 150ms ease, box-shadow 150ms ease, background 150ms ease; }
      .tpick-use-btn:hover { transform: translateY(-1px); box-shadow: 0 16px 32px rgba(37,99,235,.4); }
      .tpick-use-btn:active { transform: translateY(0); }

      .tpick-dot { transition: width 200ms ease, background 200ms ease, transform 150ms ease; cursor: pointer; }
      .tpick-dot:hover { transform: scaleY(1.3); }

      .tpick-close { transition: background 150ms ease, border-color 150ms ease, color 150ms ease; }
      .tpick-close:hover { background: #F1F5F9; border-color: #CBD5E1; color: #0F172A; }

      @media (prefers-reduced-motion: reduce) {
        .tpick-center-right, .tpick-center-left, .tpick-meta { animation: none !important; }
      }

      @media (max-width: 820px) {
        .tpick-header { padding: 18px 16px 0 !important; }
        .tpick-title { font-size: 15px !important; }
        .tpick-name { font-size: 20px !important; }
        .tpick-tagline { font-size: 12.5px !important; max-width: 88vw !important; }
        .tpick-row { gap: 10px !important; padding: 4px 10px !important; }
        .tpick-arrow { width: 40px !important; height: 40px !important; }
        .tpick-neighbor { display: none !important; }
        .tpick-center-scroll { width: min(78vw, 480px) !important; }
        .tpick-footer { padding: 14px 16px 22px !important; }
      }
    `
    document.head.appendChild(s)
  }, [])
}

function ChevronLeft() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
}
function ChevronRight() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
}

/* ─── Modal Component ───────────────────────────────────────── */
export default function TemplatePickerModal({ onSelect, onClose, currentTemplateId }: TemplatePickerModalProps) {
  useModalStyles()

  const templates = ACTIVE_TEMPLATES
  const len = templates.length

  const [idx, setIdx] = useState(() => {
    const startId = currentTemplateId || (typeof window !== 'undefined' ? localStorage.getItem('jobscorer-template') : null) || 'classic'
    const i = templates.findIndex(t => t.id === startId)
    return i >= 0 ? i : 0
  })
  const [dir, setDir] = useState<1 | -1>(1)

  const go = (delta: number) => {
    setDir(delta > 0 ? 1 : -1)
    setIdx(i => (i + delta + len) % len)
  }
  const goTo = (i: number) => {
    if (i === idx) return
    setDir(i >= idx ? 1 : -1)
    setIdx(i)
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, len])

  const current = templates[idx]
  const prev = templates[(idx - 1 + len) % len]
  const next = templates[(idx + 1) % len]
  const imgFor = (id: string) => TEMPLATE_IMAGES[id] ?? ''

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'radial-gradient(ellipse 80% 60% at 50% 38%, #F8FAFC 0%, #FFFFFF 70%)',
        display: 'flex', flexDirection: 'column',
        animation: 'tpick-fade 200ms ease both',
      }}
    >
      {/* ── Header (centered) ── */}
      <div className="tpick-header" style={{ flexShrink: 0, position: 'relative', padding: '10px 56px 0', textAlign: 'center' }}>
        <button
          onClick={onClose}
          aria-label="Close template picker"
          className="tpick-close"
          style={{
            position: 'absolute', top: 8, right: 20,
            width: 34, height: 34, borderRadius: 10, background: '#fff', border: '1px solid #E2E8F0',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B',
            cursor: 'pointer',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>

        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
          color: '#2563EB', background: '#EFF6FF', border: '1px solid #DBEAFE',
          padding: '2px 10px', borderRadius: 99, whiteSpace: 'nowrap',
        }}>
          Resume Format
        </div>

        <div className="tpick-title" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 12.5, fontWeight: 700, color: '#94A3B8', marginTop: 5 }}>
          Choose your template
        </div>

        <div key={idx} className="tpick-meta" style={{ marginTop: 2 }}>
          <div className="tpick-name" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 20, fontWeight: 800, color: '#0F172A' }}>{current.name}</div>
          <div className="tpick-tagline" style={{ fontSize: 12.5, color: '#64748B', marginTop: 1, maxWidth: 460, marginLeft: 'auto', marginRight: 'auto' }}>{current.tagline}</div>
        </div>
      </div>

      {/* ── Dominant center preview with peeking neighbors ── */}
      <div className="tpick-row" style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '4px 20px', gap: 28 }}>
        <button
          onClick={() => go(-1)}
          aria-label="Previous template"
          className="tpick-arrow"
          style={{
            flexShrink: 0, zIndex: 5, width: 56, height: 56, borderRadius: 99, background: 'rgba(255,255,255,.92)',
            border: '1px solid #E2E8F0', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0F172A',
            cursor: 'pointer', boxShadow: '0 10px 24px rgba(15,23,42,.14)',
          }}
        >
          <ChevronLeft />
        </button>

        {/* left neighbor */}
        <div
          className="tpick-neighbor"
          onClick={() => go(-1)}
          role="button"
          aria-label={`Switch to ${prev.name}`}
          style={{
            // Width-driven (not height-driven): guarantees the row never overflows the
            // viewport width, which the old `height: min(68vh, 748px)` didn't account for —
            // on common laptop widths (1366-1536px) with a tall/maximized window, the
            // height-derived width blew past the viewport edge and got clipped by the
            // row's `overflow: hidden`, showing a stray sliver of the neighbor card.
            // The calc() term still respects the original 68vh height budget, just
            // expressed as an equivalent width via the card's aspect ratio.
            flexShrink: 0, width: `min(24vw, 529px, calc(68vh * ${A4_RATIO}))`, aspectRatio: String(A4_RATIO), zIndex: 1,
            opacity: 0.7,
            borderRadius: 18, overflow: 'hidden', background: '#fff',
            boxShadow: '0 20px 50px rgba(15,23,42,.16)',
          }}
        >
          <img src={imgFor(prev.id)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }} />
        </div>

        {/* center card */}
        <div
          key={idx}
          className={`${dir === 1 ? 'tpick-center-right' : 'tpick-center-left'} tpick-center-scroll`}
          style={{
            flexShrink: 0, position: 'relative', zIndex: 3,
            // Same width-driven fix as the neighbor cards (see comment above).
            width: `min(32vw, 622px, calc(80vh * ${A4_RATIO}))`, aspectRatio: String(A4_RATIO),
            borderRadius: 22, overflow: 'hidden auto', background: '#fff',
            border: '1px solid rgba(15,23,42,.05)',
          }}
        >
          <img src={imgFor(current.id)} alt={current.name} style={{ width: '100%', height: 'auto', display: 'block' }} />
        </div>

        {/* right neighbor */}
        <div
          className="tpick-neighbor"
          onClick={() => go(1)}
          role="button"
          aria-label={`Switch to ${next.name}`}
          style={{
            flexShrink: 0, width: `min(24vw, 529px, calc(68vh * ${A4_RATIO}))`, aspectRatio: String(A4_RATIO), zIndex: 1,
            opacity: 0.7,
            borderRadius: 18, overflow: 'hidden', background: '#fff',
            boxShadow: '0 20px 50px rgba(15,23,42,.16)',
          }}
        >
          <img src={imgFor(next.id)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }} />
        </div>

        <button
          onClick={() => go(1)}
          aria-label="Next template"
          className="tpick-arrow"
          style={{
            flexShrink: 0, zIndex: 5, width: 56, height: 56, borderRadius: 99, background: 'rgba(255,255,255,.92)',
            border: '1px solid #E2E8F0', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0F172A',
            cursor: 'pointer', boxShadow: '0 10px 24px rgba(15,23,42,.14)',
          }}
        >
          <ChevronRight />
        </button>
      </div>

      {/* ── Footer: dots + CTA ── */}
      <div className="tpick-footer" style={{ flexShrink: 0, textAlign: 'center', padding: '6px 20px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 7, marginBottom: 12 }}>
          {templates.map((t, i) => (
            <button
              key={t.id}
              onClick={() => goTo(i)}
              aria-label={`Go to ${t.name}`}
              aria-current={i === idx}
              className="tpick-dot"
              style={{
                width: i === idx ? 22 : 7, height: 7, borderRadius: 99, border: 'none', padding: 0,
                background: i === idx ? BLUE : '#CBD5E1',
              }}
            />
          ))}
        </div>

        <button
          onClick={() => onSelect(current.id as TemplateId)}
          className="tpick-use-btn"
          style={{
            minWidth: 240, height: 50, padding: '0 28px', background: BLUE, color: '#fff',
            border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 12px 26px rgba(37,99,235,.38)',
          }}
        >
          Use this template
        </button>
      </div>
    </div>
  )
}
