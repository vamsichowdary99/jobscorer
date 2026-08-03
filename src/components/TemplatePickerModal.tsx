'use client'

import React, { useEffect, useState } from 'react'
import { ACTIVE_TEMPLATES, TEMPLATE_IMAGES, isTemplateLocked } from '@/templates/catalog'
import { usePlan } from '@/lib/hooks/usePlan'
import { showUpgradePrompt } from '@/lib/quota'

export type TemplateId = 'classic' | 'rezi' | 'london' | 'harvard' | 'open-resume' | 'cobalt' | 'onyx' | 'jade' | 'lapis' | 'executive' | 'amber' | 'athens' | 'axis' | 'beacon' | 'jake'

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

      .tpick-zoomable { transition: transform 200ms ease, box-shadow 200ms ease; cursor: zoom-in; }
      .tpick-zoomable:hover { transform: translateY(-2px); box-shadow: 0 28px 70px rgba(15,23,42,.22) !important; }

      @keyframes tpick-zoom-in { from { opacity:0; transform:scale(.96) } to { opacity:1; transform:scale(1) } }
      .tpick-zoom-img { animation: tpick-zoom-in 220ms cubic-bezier(.16,1,.3,1) both; cursor: zoom-out; }

      .tpick-exit-zoom { transition: background 150ms ease, transform 150ms ease; }
      .tpick-exit-zoom:hover { background: rgba(15,23,42,.88) !important; transform: scale(1.04); }

      @media (prefers-reduced-motion: reduce) {
        .tpick-center-right, .tpick-center-left, .tpick-meta, .tpick-zoom-img { animation: none !important; }
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
function LockIcon({ size = 13 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="11" rx="2.2" /><path d="M8 10V7a4 4 0 018 0v3" /></svg>
}
function ZoomIcon({ size = 15 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" /></svg>
}

/** Floating hint badge on the center thumbnail — the card itself is the click
 *  target (see tpick-zoomable), this just signals that it's zoomable. */
function ZoomBadge() {
  return (
    <div style={{
      position: 'absolute', bottom: 12, left: 12, zIndex: 2, pointerEvents: 'none',
      display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px 6px 8px', borderRadius: 99,
      background: 'rgba(15,23,42,.72)', backdropFilter: 'blur(4px)',
      color: '#fff', fontSize: 11, fontWeight: 600, boxShadow: '0 4px 12px rgba(15,23,42,.35)',
    }}>
      <ZoomIcon size={13} /> View full size
    </div>
  )
}

/** Small lock badge shown on locked template thumbnails — visible, not hidden.
 *  Defaults to top-right; the zoom view uses top-left since top-right is
 *  already occupied by the "Exit zoom" pill. */
function LockBadge({ size = 30, corner = 'top-right' }: { size?: number; corner?: 'top-right' | 'top-left' }) {
  return (
    <div style={{
      position: 'absolute', top: 10, [corner === 'top-right' ? 'right' : 'left']: 10, zIndex: 2,
      width: size, height: size, borderRadius: '50%',
      background: 'rgba(15,23,42,.72)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', boxShadow: '0 4px 12px rgba(15,23,42,.35)',
    }}>
      <LockIcon size={Math.round(size * 0.46)} />
    </div>
  )
}

/* ─── Modal Component ───────────────────────────────────────── */
export default function TemplatePickerModal({ onSelect, onClose, currentTemplateId }: TemplatePickerModalProps) {
  useModalStyles()
  // usePlan() defaults to 'free' for its first ~200ms-2s while /api/billing/usage
  // resolves — treating that as "confirmed free" flashed the premium lock/badge
  // at paying users before flipping to unlocked once the real plan arrived.
  // Gate on `loading` too so nothing renders a locked state until we actually know.
  const { plan, loading: planLoading } = usePlan()

  const templates = ACTIVE_TEMPLATES
  const len = templates.length

  const [idx, setIdx] = useState(() => {
    const startId = currentTemplateId || (typeof window !== 'undefined' ? localStorage.getItem('jobscorer-template') : null) || 'classic'
    const i = templates.findIndex(t => t.id === startId)
    return i >= 0 ? i : 0
  })
  const [dir, setDir] = useState<1 | -1>(1)
  // Browsing (3-up carousel) vs. zoomed (single full-size template, see
  // research notes: showing 3 full A4 pages side-by-side can never be both
  // comparable AND individually readable — real template galleries solve
  // this with small browsing thumbnails + a dedicated full-size zoom, not by
  // endlessly enlarging the side-by-side layout.
  const [zoomed, setZoomed] = useState(false)

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
      if (e.key === 'Escape') { if (zoomed) setZoomed(false); else onClose(); return }
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, len, zoomed])

  const current = templates[idx]
  const prev = templates[(idx - 1 + len) % len]
  const next = templates[(idx + 1) % len]
  const imgFor = (id: string) => TEMPLATE_IMAGES[id] ?? ''
  // While the real plan is loading, never claim a template is locked — an
  // unknown plan should read as neutral, not as "free" (see comment above).
  const currentLocked = !planLoading && isTemplateLocked(current.id, plan)

  const handleUse = () => {
    if (planLoading) return
    if (currentLocked) {
      showUpgradePrompt({
        feature: 'template',
        plan,
        message: `"${current.name}" is a premium template. Upgrade to Pro to unlock it and every other design.`,
      })
      return
    }
    onSelect(current.id as TemplateId)
  }

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
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <div className="tpick-name" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 20, fontWeight: 800, color: '#0F172A' }}>{current.name}</div>
            {currentLocked && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 9.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
                color: '#92400E', background: '#FEF3C7', border: '1px solid #FDE68A',
                padding: '2px 8px 2px 6px', borderRadius: 99,
              }}>
                <LockIcon size={9} /> Premium
              </span>
            )}
          </div>
          <div className="tpick-tagline" style={{ fontSize: 12.5, color: '#64748B', marginTop: 1, maxWidth: 460, marginLeft: 'auto', marginRight: 'auto' }}>{current.tagline}</div>
        </div>
      </div>

      {/* ── Dominant center preview with peeking neighbors ── */}
      {/* containerType:'size' anchors the cqw/cqh units below to this row's
          actual box (flexbox already computes that correctly as "100vh minus
          the header/footer chrome"). The previous vh-based sizing assumed a
          fixed 68-80% of the viewport was always available, but the header/
          footer chrome is roughly fixed-height in px, not viewport-relative —
          so as the viewport shrinks (browser zoom, short windows) that chrome
          eats a growing share of it, the real available row height drops well
          below the assumed 68-80vh, and cards sized off raw vh overflowed the
          row and got clipped by its `overflow:hidden`. cqh/cqw always reflect
          the row's true size, at any zoom level or window size. */}
      <div className="tpick-row" style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '4px 20px', gap: 28, containerType: 'size' } as React.CSSProperties}>
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

        {zoomed ? (
          /* Single full-size template. The outer div centers within the row's
             real box; the inner inline-flex wrapper shrink-wraps tightly to
             the image's own rendered size (height:100% is definite from the
             outer div, so width:auto resolves correctly, and the wrapper's
             own width then shrinks to match) — so the lock badge / exit
             button, anchored to THIS wrapper, hug the picture's actual edges
             instead of the much wider centering area around it. */
          <div style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'relative', height: '100%', display: 'inline-flex' }}>
              <img
                key={idx}
                src={imgFor(current.id)}
                alt={current.name}
                onClick={() => setZoomed(false)}
                className="tpick-zoom-img"
                style={{ height: '100%', width: 'auto', display: 'block', borderRadius: 16, boxShadow: '0 30px 90px rgba(15,23,42,.35)' }}
              />
              {currentLocked && <LockBadge size={44} corner="top-left" />}
              <button
                onClick={() => setZoomed(false)}
                className="tpick-exit-zoom"
                style={{
                  position: 'absolute', top: 14, right: 14, zIndex: 2,
                  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 99,
                  background: 'rgba(15,23,42,.72)', backdropFilter: 'blur(4px)', border: 'none',
                  color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                Exit zoom
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* left neighbor */}
            <div
              className="tpick-neighbor"
              onClick={() => go(-1)}
              role="button"
              aria-label={`Switch to ${prev.name}`}
              style={{
                // Width-driven (not height-driven): guarantees the row never overflows its
                // own width. cqw/cqh are relative to .tpick-row's real box (see containerType
                // above), not the raw viewport, so this stays correct at any zoom/window size.
                flexShrink: 0, position: 'relative', width: `min(28cqw, 620px, calc(74cqh * ${A4_RATIO}))`, aspectRatio: String(A4_RATIO), zIndex: 1,
                opacity: 0.7,
                borderRadius: 18, overflow: 'hidden', background: '#fff',
                boxShadow: '0 20px 50px rgba(15,23,42,.16)',
              }}
            >
              <img src={imgFor(prev.id)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }} />
              {!planLoading && isTemplateLocked(prev.id, plan) && <LockBadge size={24} />}
            </div>

            {/* center card — click/tap to zoom to full size */}
            <div
              key={idx}
              onClick={() => setZoomed(true)}
              role="button"
              aria-label={`View ${current.name} full size`}
              className={`${dir === 1 ? 'tpick-center-right' : 'tpick-center-left'} tpick-center-scroll tpick-zoomable`}
              style={{
                flexShrink: 0, position: 'relative', zIndex: 3,
                // Same width-driven, container-relative fix as the neighbor cards (see comment above).
                width: `min(38cqw, 760px, calc(86cqh * ${A4_RATIO}))`, aspectRatio: String(A4_RATIO),
                borderRadius: 22, overflow: 'hidden auto', background: '#fff',
                border: '1px solid rgba(15,23,42,.05)',
              }}
            >
              <img src={imgFor(current.id)} alt={current.name} style={{ width: '100%', height: 'auto', display: 'block' }} />
              {currentLocked && <LockBadge size={38} />}
              <ZoomBadge />
            </div>

            {/* right neighbor */}
            <div
              className="tpick-neighbor"
              onClick={() => go(1)}
              role="button"
              aria-label={`Switch to ${next.name}`}
              style={{
                flexShrink: 0, position: 'relative', width: `min(28cqw, 620px, calc(74cqh * ${A4_RATIO}))`, aspectRatio: String(A4_RATIO), zIndex: 1,
                opacity: 0.7,
                borderRadius: 18, overflow: 'hidden', background: '#fff',
                boxShadow: '0 20px 50px rgba(15,23,42,.16)',
              }}
            >
              <img src={imgFor(next.id)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }} />
              {!planLoading && isTemplateLocked(next.id, plan) && <LockBadge size={24} />}
            </div>
          </>
        )}

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
          onClick={handleUse}
          disabled={planLoading}
          className="tpick-use-btn"
          style={{
            minWidth: 240, height: 50, padding: '0 28px',
            background: planLoading ? '#94A3B8' : currentLocked ? '#0F172A' : BLUE, color: '#fff',
            border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700,
            cursor: planLoading ? 'default' : 'pointer',
            opacity: planLoading ? 0.75 : 1,
            boxShadow: planLoading ? 'none' : currentLocked ? '0 12px 26px rgba(15,23,42,.3)' : '0 12px 26px rgba(37,99,235,.38)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {!planLoading && currentLocked && <LockIcon size={15} />}
          {planLoading ? 'Use this template' : currentLocked ? 'Upgrade to unlock' : 'Use this template'}
        </button>
      </div>
    </div>
  )
}
