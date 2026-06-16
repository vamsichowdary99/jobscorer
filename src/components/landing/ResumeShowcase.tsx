'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { C, SANS, MONO } from './tokens';

const SHOWCASE = [
  { name: 'Aarav Sharma', role: 'SDE-1 · Backend',               src: '/resumes-it/aarav-sharma.png' },
  { name: 'Priya Nair',   role: 'Frontend Engineer · Fresher',   src: '/resumes-it/priya-nair.png' },
  { name: 'Rohan Mehta',  role: 'Full-Stack Developer · Intern', src: '/resumes-it/rohan-mehta.png' },
  { name: 'Ananya Reddy', role: 'Data Engineer · Entry-Level',   src: '/resumes-it/ananya-reddy.png' },
  { name: 'Karthik Iyer', role: 'QA Automation · Fresher',       src: '/resumes-it/karthik-iyer.png' },
  { name: 'Sneha Gupta',  role: 'DevOps Engineer · Junior',      src: '/resumes-it/sneha-gupta.png' },
  { name: 'Vivek Menon',  role: 'Cloud Engineer · Entry-Level',  src: '/resumes-it/vivek-menon.png' },
  { name: 'Ishaan Verma', role: 'ML Engineer · Fresher',         src: '/resumes-it/ishaan-verma.png' },
];

const AUTOPLAY_MS = 3000;

type CardData = (typeof SHOWCASE)[number];

function ResumeCard({ data, scale = 1, blurred = false }: { data: CardData; scale?: number; blurred?: boolean }) {
  const w = Math.round(420 * scale);
  const h = Math.round(560 * scale);
  return (
    <div
      className="rs-carousel-card"
      style={{
        width: w,
        height: h,
        background: '#fff',
        borderRadius: Math.round(12 * scale),
        boxShadow: '0 18px 50px -18px rgba(15,23,42,.32), 0 4px 12px rgba(15,23,42,.08), inset 0 0 0 1px rgba(15,23,42,.05)',
        overflow: 'hidden',
        position: 'relative',
        filter: blurred ? 'blur(3px)' : 'none',
        userSelect: 'none',
      }}
    >
      <Image
        src={data.src}
        alt={`${data.name} — ${data.role} resume`}
        width={w}
        height={h}
        style={{
          display: 'block', width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center',
          userSelect: 'none', pointerEvents: 'none',
        }}
        priority={!blurred && scale >= 1}
      />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg,rgba(255,255,255,0.28) 0%,transparent 26%)', pointerEvents: 'none' }} />
    </div>
  );
}

function arrowStyle(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute',
    [side]: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    zIndex: 5,
    width: 48,
    height: 48,
    borderRadius: '50%',
    background: '#fff',
    border: `1px solid ${C.border}`,
    boxShadow: '0 6px 18px -6px rgba(15,23,42,.25)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    outlineOffset: 3,
  };
}

export default function ResumeShowcase() {
  const [focus, setFocus] = useState(0);
  const n = SHOWCASE.length;

  // Autoplay is gated by three independent signals.
  const [paused, setPaused] = useState(false);          // pointer is over the carousel
  const [inView, setInView] = useState(true);           // carousel is on-screen
  const [reducedMotion, setReducedMotion] = useState(false);

  // Responsive card scaling — SSR-safe (default assumes desktop).
  const [vw, setVw] = useState(1200);
  useEffect(() => {
    const check = () => setVw(window.innerWidth);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  const isMobile = vw < 640;
  const centerScale = isMobile ? 0.70 : 1.0;
  const stageH = isMobile ? Math.round(560 * centerScale + 80) : 600;

  const containerRef = useRef<HTMLDivElement | null>(null);

  const go = useCallback((dir: number) => setFocus(f => (f + dir + n) % n), [n]);

  // Honour prefers-reduced-motion (and react to changes live).
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Pause when the carousel scrolls off-screen — no point animating unseen work.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.25 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Autoplay. Keyed on `focus`, so any advance (auto OR manual via arrows/dots/
  // preview cards) tears down and recreates the timer — i.e. manual interaction
  // resets the countdown. Disabled while paused, off-screen, or reduced-motion.
  useEffect(() => {
    if (paused || !inView || reducedMotion) return;
    const id = setTimeout(() => setFocus(f => (f + 1) % n), AUTOPLAY_MS);
    return () => clearTimeout(id);
  }, [focus, paused, inView, reducedMotion, n]);

  const left = (focus - 1 + n) % n;
  const right = (focus + 1) % n;

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
    >
      <div className="sc-stage" style={{ position: 'relative', width: 'min(760px,94vw)', height: stageH, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* Left preview — clickable, lifts on hover */}
        <div
          className="sc-stage-back sc-stage-back-left"
          onClick={() => go(-1)}
          role="button"
          aria-label={`Show previous resume — ${SHOWCASE[left].name}`}
          style={{ position: 'absolute', transition: 'all .45s cubic-bezier(.22,.65,.28,1)', transform: 'translateX(-220px) scale(.8) rotate(-6deg)', opacity: .45, zIndex: 1, cursor: 'pointer' }}
        >
          <ResumeCard data={SHOWCASE[left]} scale={.9} blurred />
        </div>
        {/* Right preview — clickable, lifts on hover */}
        <div
          className="sc-stage-back sc-stage-back-right"
          onClick={() => go(1)}
          role="button"
          aria-label={`Show next resume — ${SHOWCASE[right].name}`}
          style={{ position: 'absolute', transition: 'all .45s cubic-bezier(.22,.65,.28,1)', transform: 'translateX(220px) scale(.8) rotate(6deg)', opacity: .45, zIndex: 1, cursor: 'pointer' }}
        >
          <ResumeCard data={SHOWCASE[right]} scale={.9} blurred />
        </div>
        {/* Focus card */}
        <div key={focus} style={{ position: 'relative', zIndex: 3, animation: reducedMotion ? 'none' : 'jsScFocusIn .45s cubic-bezier(.22,.65,.28,1)' }}>
          <ResumeCard data={SHOWCASE[focus]} scale={centerScale} />
        </div>

        <button onClick={() => go(-1)} style={arrowStyle('left')} aria-label="Previous resume">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <button onClick={() => go(1)} style={arrowStyle('right')} aria-label="Next resume">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>

      <div style={{ textAlign: 'center', marginTop: 20 }}>
        <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 16, color: C.text }}>{SHOWCASE[focus].name}</div>
        <div style={{ fontFamily: MONO, fontSize: 12, color: C.textSec, marginTop: 3 }}>{SHOWCASE[focus].role}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          {SHOWCASE.map((r, i) => (
            <button
              key={r.name}
              onClick={() => setFocus(i)}
              aria-label={`Show ${r.name}`}
              style={{
                width: i === focus ? 24 : 8,
                height: 8,
                borderRadius: 4,
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                background: i === focus ? C.primary : C.border,
                transition: 'all .3s',
                outlineOffset: 3,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
