'use client';

import { useEffect, useRef, useState } from 'react';
import { C, SANS } from './tokens';

const STAR_COLOR = '#f59e0b';

type ReviewPart = { text: string; hi?: boolean };
type Review = {
  parts: ReviewPart[];
  name: string;
  outcome: string;
  stars: number;
  initials: string;
  color: string;
};

const REVIEWS: Review[] = [
  {
    parts: [
      { text: 'Got 4 callbacks in 2 weeks after running the ' },
      { text: 'ATS analysis on Naukri', hi: true },
      { text: '. Was missing 8 of 12 keywords — fixed in an afternoon.' },
    ],
    name: 'Arjun K.', outcome: 'Now SDE-1 at Razorpay', stars: 5, initials: 'AK', color: '#1e3a5f',
  },
  {
    parts: [
      { text: 'Pasted a Swiggy JD and got a ' },
      { text: '91% fit score with exact bullet rewrites', hi: true },
      { text: '. ATS keyword score went from 42 to 78 overnight.' },
    ],
    name: 'Priya M.', outcome: 'Now Backend Engineer at Swiggy', stars: 5, initials: 'PM', color: '#C2410C',
  },
  {
    parts: [
      { text: 'The company research is wild — ' },
      { text: 'actual salary ranges, tech stack, and hiring signals', hi: true },
      { text: '. Walked into my CRED interview more prepared than ever.' },
    ],
    name: 'Rohan S.', outcome: 'Now Platform Engineer at CRED', stars: 5, initials: 'RS', color: '#0f172a',
  },
  {
    parts: [
      { text: 'JobScorer told me exactly which roles to skip. ' },
      { text: 'Stopped wasting time on mismatched JDs', hi: true },
      { text: ' and landed an interview at Razorpay in week 2.' },
    ],
    name: 'Sneha T.', outcome: 'Now SDE at Razorpay', stars: 5, initials: 'ST', color: '#135bec',
  },
  {
    parts: [
      { text: 'The gap analysis showed me I needed ' },
      { text: 'Docker and system design basics', hi: true },
      { text: '. Upskilled in 3 weeks and got shortlisted at Postman.' },
    ],
    name: 'Karan V.', outcome: 'Now Full Stack Engineer at Postman', stars: 4, initials: 'KV', color: '#7c3aed',
  },
  {
    parts: [
      { text: 'Finally understood why I was getting ghosted. ' },
      { text: 'The fit score report', hi: true },
      { text: " is brutally honest — and that's exactly what I needed." },
    ],
    name: 'Meera R.', outcome: 'Now Associate Engineer at Infosys', stars: 5, initials: 'MR', color: '#0891b2',
  },
  {
    parts: [
      { text: 'Scored 15 jobs in one evening. ' },
      { text: 'The batch scoring saved me hours', hi: true },
      { text: ' and I could see at a glance which ones were actually worth applying to.' },
    ],
    name: 'Dev P.', outcome: 'Now Senior Engineer at Zepto', stars: 5, initials: 'DP', color: '#059669',
  },
  {
    parts: [
      { text: 'Interview prep + STAR stories are ' },
      { text: 'genuinely better than anything I found on YouTube', hi: true },
      { text: '. Got my Swiggy offer after bombing 6 previous interviews.' },
    ],
    name: 'Ananya B.', outcome: 'Now SDE-2 at Swiggy', stars: 5, initials: 'AB', color: '#b45309',
  },
];

function Stars({ count }: { count: number }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <svg key={i} width="16" height="16" viewBox="0 0 24 24">
          <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" fill={i <= count ? STAR_COLOR : '#e2e8f0'} />
        </svg>
      ))}
    </div>
  );
}

function Card({ r }: { r: Review }) {
  return (
    <div
      style={{
        width: 320,
        flexShrink: 0,
        background: '#fff',
        borderRadius: 18,
        border: '1px solid #e4e4e7',
        padding: '28px 26px 22px',
        boxShadow: '0 2px 12px rgba(15,23,42,0.06)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        userSelect: 'none',
      }}
    >
      <p style={{ fontSize: 15, color: '#111827', lineHeight: 1.65, marginBottom: 28, fontFamily: SANS }}>
        {r.parts.map((p, i) =>
          p.hi ? (
            <mark key={i} style={{ background: '#e4e4e7', color: 'inherit', borderRadius: 3, padding: '1px 2px', textDecoration: 'underline', textDecorationColor: '#aaa', textUnderlineOffset: 2 }}>
              {p.text}
            </mark>
          ) : (
            <span key={i}>{p.text}</span>
          )
        )}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: r.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.9)', fontSize: 13, fontWeight: 700, flexShrink: 0, fontFamily: SANS }}>
            {r.initials}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', fontFamily: SANS }}>{r.name}</div>
            <div style={{ fontSize: 12, color: C.success, fontWeight: 600, marginTop: 2, fontFamily: SANS }}>{r.outcome}</div>
          </div>
        </div>
        <Stars count={r.stars} />
      </div>
    </div>
  );
}

export default function Testimonials() {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const offsetRef = useRef(0);
  const pausedRef = useRef(false);
  const halfRef = useRef(0);
  const [, setPaused] = useState(false);
  const SPEED = 28; // px/sec

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => { halfRef.current = track.scrollWidth / 2; };
    measure();
    window.addEventListener('resize', measure);
    let raf = 0;
    let last: number | null = null;
    const tick = (t: number) => {
      if (last === null) last = t;
      const dt = (t - last) / 1000;
      last = t;
      if (!pausedRef.current && halfRef.current > 0) {
        offsetRef.current += SPEED * dt;
        if (offsetRef.current >= halfRef.current) offsetRef.current -= halfRef.current;
        if (offsetRef.current < 0) offsetRef.current += halfRef.current;
        track.style.transform = `translateX(${-offsetRef.current}px)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
    };
  }, []);

  const setPause = (v: boolean) => { pausedRef.current = v; setPaused(v); };
  const nudge = (dir: number) => {
    const half = halfRef.current || 1;
    let next = offsetRef.current + dir * 348;
    if (next >= half) next -= half;
    if (next < 0) next += half;
    offsetRef.current = next;
    if (trackRef.current) trackRef.current.style.transform = `translateX(${-next}px)`;
  };

  const arrowBtn: React.CSSProperties = {
    width: 44,
    height: 44,
    borderRadius: '50%',
    border: `1px solid ${C.border}`,
    background: '#fff',
    color: C.text,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(15,23,42,0.10)',
    flexShrink: 0,
    transition: 'background .15s, border-color .15s, transform .15s',
  };

  return (
    <section style={{ padding: '80px 0', background: '#f4f4f5', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 48, padding: '0 32px' }}>
        <h2 style={{ fontFamily: SANS, fontSize: 'clamp(2rem,3.5vw,2.75rem)', fontWeight: 800, letterSpacing: '-0.03em', color: C.primary, marginBottom: 8 }}>
          Our Testimonials
        </h2>
        <p style={{ fontFamily: SANS, fontSize: 'clamp(1rem,1.5vw,1.125rem)', color: C.textSec, marginBottom: 0 }}>
          Real engineers. Real callbacks.
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, maxWidth: '100%' }}>
        <button
          className="testim-arrow"
          style={{ ...arrowBtn, marginLeft: 'clamp(12px,3vw,40px)' }}
          aria-label="Previous testimonials"
          onClick={() => nudge(-1)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>

        <div
          className="testim-scroller"
          tabIndex={0}
          role="group"
          aria-label="Customer testimonials. Hover or focus to pause auto-scroll. Use arrow buttons to navigate."
          onMouseEnter={() => setPause(true)}
          onMouseLeave={() => setPause(false)}
          onFocus={() => setPause(true)}
          onBlur={() => setPause(false)}
          onKeyDown={e => {
            if (e.key === 'ArrowRight') { e.preventDefault(); nudge(1); }
            if (e.key === 'ArrowLeft')  { e.preventDefault(); nudge(-1); }
          }}
          style={{
            flex: 1,
            overflow: 'hidden',
            WebkitMaskImage: 'linear-gradient(90deg,transparent 0%,black 6%,black 94%,transparent 100%)',
            maskImage: 'linear-gradient(90deg,transparent 0%,black 6%,black 94%,transparent 100%)',
          }}
        >
          <div ref={trackRef} className="testim-track" style={{ display: 'flex', gap: 20, width: 'max-content', padding: '8px 0 16px', willChange: 'transform' }}>
            {[...REVIEWS, ...REVIEWS].map((r, i) => <Card key={i} r={r} />)}
          </div>
        </div>

        <button
          className="testim-arrow"
          style={{ ...arrowBtn, marginRight: 'clamp(12px,3vw,40px)' }}
          aria-label="Next testimonials"
          onClick={() => nudge(1)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>
    </section>
  );
}
