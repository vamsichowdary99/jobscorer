'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { C, SANS, MONO } from './tokens';

const cardSx: React.CSSProperties = {
  background: 'white',
  borderRadius: 9,
  border: `1px solid ${C.border}`,
  boxShadow: '0 4px 14px rgba(15,23,42,.08)',
  width: '100%',
  maxWidth: '100%',
  boxSizing: 'border-box',
  overflowWrap: 'break-word',
};

const ck = (col: string = C.success) => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
    <path d="M5 13l4 4L19 7" stroke={col} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const tag = (t: string, bg: string, bd: string, col: string) => (
  <span style={{ padding: '2.5px 7px', borderRadius: 999, background: bg, border: `1px solid ${bd}`, fontSize: 7.5, color: col, fontFamily: MONO, fontWeight: 600, whiteSpace: 'nowrap' }}>
    {t}
  </span>
);

const illoUpload = (
  <div style={{ ...cardSx, padding: '13px 15px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingBottom: 9, borderBottom: `1px solid ${C.border}`, marginBottom: 9 }}>
      <div style={{ width: 18, height: 22, borderRadius: 3, background: C.primaryLight, border: `1px solid ${C.primary}40`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2.4"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
      </div>
      <span style={{ fontSize: 9, fontWeight: 700, color: C.text, fontFamily: MONO }}>resume.pdf</span>
      <span style={{ marginLeft: 'auto', fontSize: 7.5, color: C.success, fontFamily: MONO, fontWeight: 700 }}>PARSING…</span>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {([['Skills', 'React · Node · AWS'], ['Experience', '1 yr'], ['Projects', '3'], ['Education', 'B.Tech CSE']] as Array<[string, string]>).map(([k, v]) => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 8px', background: '#f8fafc', borderRadius: 6, border: `1px solid ${C.border}` }}>
          {ck()}
          <span style={{ fontSize: 8, color: C.textSec, fontFamily: MONO, fontWeight: 600 }}>{k}:</span>
          <span style={{ fontSize: 8, color: C.text, fontWeight: 700, marginLeft: 'auto' }}>{v}</span>
        </div>
      ))}
    </div>
    <div style={{ marginTop: 9, textAlign: 'center', fontSize: 7.5, color: C.primary, fontFamily: MONO, fontWeight: 700, letterSpacing: '0.04em' }}>50+ DATA POINTS EXTRACTED</div>
  </div>
);

const illoMatch = (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, width: '100%' }}>
    {([
      ['Backend Engineer', 'Naukri',    '91%', 91, C.success, true],
      ['SDE-1 Fullstack',  'LinkedIn',  '78%', 78, '#d97706', false],
      ['Data Analyst',     'Instahyre', '54%', 54, '#94a3b8', false],
    ] as Array<[string, string, string, number, string, boolean]>).map(([r, src, s, pct, col, hot], i) => (
      <div key={i} style={{ ...cardSx, padding: '9px 11px', border: hot ? `1.5px solid ${C.success}` : `1px solid ${C.border}`, boxShadow: hot ? '0 6px 18px rgba(16,185,129,.18)' : '0 3px 10px rgba(15,23,42,.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 9, color: C.text, fontWeight: 700 }}>{r}</span>
          {tag(src, C.primaryLight, `${C.primary}30`, C.primary)}
          <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: col, fontFamily: MONO }}>{s}</span>
        </div>
        <div style={{ height: 4, borderRadius: 3, background: '#eef2f7', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: col, borderRadius: 3 }} />
        </div>
      </div>
    ))}
  </div>
);

const illoGap = (
  <div style={{ ...cardSx, padding: '13px 15px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 9, borderBottom: `1px solid ${C.border}`, marginBottom: 9 }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>
      <span style={{ fontSize: 9, fontWeight: 700, color: C.text, fontFamily: MONO, letterSpacing: '0.04em' }}>SKILL GAP REPORT</span>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {([['Docker', 'High', 92, '#ef4444'], ['System Design', 'High', 85, '#ef4444'], ['Kafka', 'Medium', 58, '#d97706']] as Array<[string, string, number, string]>).map(([g, lvl, pct, col]) => (
        <div key={g}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 3 }}>
            <span style={{ fontSize: 8.5, color: C.text, fontWeight: 700 }}>{g}</span>
            <span style={{ marginLeft: 'auto', fontSize: 7.5, fontWeight: 700, color: col, fontFamily: MONO }}>{lvl} impact</span>
          </div>
          <div style={{ height: 4, borderRadius: 3, background: '#eef2f7', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: col, borderRadius: 3 }} />
          </div>
        </div>
      ))}
    </div>
  </div>
);

const illoResearch = (
  <div style={{ ...cardSx, padding: '13px 15px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingBottom: 9, borderBottom: `1px solid ${C.border}`, marginBottom: 9 }}>
      <div style={{ width: 20, height: 20, borderRadius: 5, background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-3"/></svg>
      </div>
      <div>
        <div style={{ fontSize: 9, fontWeight: 700, color: C.text, lineHeight: 1.1 }}>Target company</div>
        <div style={{ fontSize: 7, color: C.textSec, fontFamily: MONO }}>Backend Engineer</div>
      </div>
      <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 3 }}>{ck()}<span style={{ fontSize: 7, color: C.success, fontFamily: MONO, fontWeight: 700 }}>RESEARCHED</span></span>
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
      {['Fastify', 'p99 < 80ms', 'Test culture', 'Go + Kafka'].map(g => (
        <span key={g} style={{ padding: '2.5px 7px', borderRadius: 999, background: C.primaryLight, border: `1px solid ${C.primary}30`, fontSize: 7.5, color: C.primary, fontFamily: MONO, fontWeight: 600, whiteSpace: 'nowrap' }}>{g}</span>
      ))}
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 8, color: C.textSec }}>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2.2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
        <span style={{ color: C.text, fontWeight: 600 }}>Recent blog:</span> scaling payments infra
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 8, color: C.textSec }}>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2.2"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
        <span style={{ color: C.text, fontWeight: 600 }}>Values:</span> ownership, bias to ship
      </div>
    </div>
  </div>
);

const illoRewrite = (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, width: '100%' }}>
    <div style={{ ...cardSx, padding: '10px 12px', border: '1px solid #fca5a5' }}>
      <div style={{ fontSize: 7, fontWeight: 700, color: '#991b1b', fontFamily: MONO, marginBottom: 5, letterSpacing: '0.06em' }}>BEFORE</div>
      <div style={{ fontSize: 8.5, color: '#7f1d1d', lineHeight: 1.5 }}>Built backend APIs for a web app</div>
    </div>
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: 22, height: 22, borderRadius: '50%', background: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 10px rgba(19,91,236,.4)' }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M6 13l6 6 6-6"/></svg>
      </div>
    </div>
    <div style={{ ...cardSx, padding: '10px 12px', border: `1.5px solid ${C.primary}`, boxShadow: '0 6px 18px rgba(19,91,236,.16)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>{ck(C.primary)}<span style={{ fontSize: 7, fontWeight: 700, color: C.primary, fontFamily: MONO, letterSpacing: '0.06em' }}>AFTER — TUNED TO RAZORPAY</span></div>
      <div style={{ fontSize: 8.5, color: C.text, lineHeight: 1.5, fontWeight: 500 }}>
        Built <b style={{ color: C.primary }}>Fastify</b> APIs handling <b style={{ color: C.primary }}>p99 &lt; 80ms</b>, mirroring Razorpay&apos;s stack
      </div>
    </div>
  </div>
);

const illoPdf = (
  <div style={{ ...cardSx, padding: '13px 15px', position: 'relative' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
      <div style={{ width: 18, height: 22, borderRadius: 3, background: '#f8fafc', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={C.textSec} strokeWidth="2.2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
      </div>
      <span style={{ fontSize: 9, fontWeight: 700, color: C.text, fontFamily: MONO }}>resume_final.pdf</span>
      <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2.5px 8px', borderRadius: 999, background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
        {ck()}<span style={{ fontSize: 7.5, fontWeight: 700, color: C.success, fontFamily: MONO }}>ATS-SAFE</span>
      </span>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {['No tables', 'No text boxes', 'Single-column layout', 'Passes TCS · Razorpay · Swiggy'].map(t => (
        <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 8px', background: '#f8fafc', borderRadius: 6, border: `1px solid ${C.border}` }}>
          {ck()}<span style={{ fontSize: 8, color: C.text, fontWeight: 600 }}>{t}</span>
        </div>
      ))}
    </div>
  </div>
);

const illoLearn = (
  <div style={{ ...cardSx, padding: '13px 15px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 9, borderBottom: `1px solid ${C.border}`, marginBottom: 9 }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2.2" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3"/></svg>
      <span style={{ fontSize: 9, fontWeight: 700, color: C.text, fontFamily: MONO, letterSpacing: '0.04em' }}>YOUR LEARNING PLAN</span>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {([['Docker', '2 wks', 72], ['System Design', '3 wks', 40], ['Kafka', '1 wk', 15]] as Array<[string, string, number]>).map(([t, wk, pct]) => {
        const r = 7;
        const circ = 2 * Math.PI * r;
        return (
          <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 9px', background: '#f8fafc', borderRadius: 7, border: `1px solid ${C.border}` }}>
            <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}>
              <circle cx="9" cy="9" r={r} fill="none" stroke="#e2e8f0" strokeWidth="2.5" />
              <circle cx="9" cy="9" r={r} fill="none" stroke={C.primary} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${(circ * pct) / 100} ${circ}`} transform="rotate(-90 9 9)" />
            </svg>
            <span style={{ fontSize: 8.5, color: C.text, fontWeight: 700 }}>{t}</span>
            <span style={{ marginLeft: 'auto', fontSize: 7.5, color: C.textSec, fontFamily: MONO, fontWeight: 600 }}>{wk}</span>
          </div>
        );
      })}
    </div>
    <div style={{ marginTop: 9, textAlign: 'center', fontSize: 7.5, color: C.primary, fontFamily: MONO, fontWeight: 700, letterSpacing: '0.04em' }}>CALIBRATED TO THIS ROLE</div>
  </div>
);

type Step = {
  n: string;
  title: string;
  desc: string;
  illo: React.ReactElement;
  highlight: boolean;
};

const STEPS: Step[] = [
  { n: '01', title: 'Upload your resume',                              desc: 'Drop your PDF. We extract 50+ data points — skills, experience depth, project impact, education signals — in seconds.',                                                                            illo: illoUpload,   highlight: false },
  { n: '02', title: 'Match to real job listings',                      desc: "We scan thousands of live roles on Naukri, LinkedIn, and Instahyre. Each match shows your fit score — a clear number that tells you if it's worth applying.",                            illo: illoMatch,    highlight: false },
  { n: '03', title: 'See exactly where you fall short',                desc: "Your skill gap report shows the specific keywords, tools, and experience levels you're missing — ranked by how much they'll affect your chances.",                                       illo: illoGap,      highlight: false },
  { n: '04', title: 'We research the company — not just the JD',       desc: 'Before touching your resume, we study the target company: their live tech stack, recent engineering blog posts, team structure, what they value in candidates, and how their ATS is configured.', illo: illoResearch, highlight: true  },
  { n: '05', title: 'Your resume, rewritten for that company',         desc: 'Using the company research, we rewrite your bullets to speak their language — matching their stack, mirroring their values, hitting the keywords their ATS looks for.',                  illo: illoRewrite,  highlight: false },
  { n: '06', title: 'Download an ATS-safe PDF',                        desc: 'Export a clean, ATS-tested PDF. No tables, text boxes, or headers scanners choke on. Passes systems at TCS, Razorpay, and Swiggy.',                                                       illo: illoPdf,      highlight: false },
  { n: '07', title: 'Get your personalised learning plan',             desc: 'For every gap found, a focused plan: courses, projects, and timelines to close them — calibrated to this role and company.',                                                              illo: illoLearn,    highlight: false },
];

export default function Journey() {
  const [active, setActive] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const railRefs = useRef<Array<HTMLDivElement | null>>([]);
  const hoveringRef = useRef(false);

  const recompute = useCallback(() => {
    const mid = window.innerHeight / 2;
    let best = 0;
    let bestDist = Infinity;
    railRefs.current.forEach((el, i) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      const c = r.top + r.height / 2;
      const d = Math.abs(c - mid);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    const lastEl = railRefs.current[railRefs.current.length - 1];
    if (lastEl && lastEl.getBoundingClientRect().top <= mid) {
      best = railRefs.current.length - 1;
    }
    setActive(best);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(max-width:820px)');
    const u = () => setIsMobile(mq.matches);
    u();
    mq.addEventListener('change', u);
    return () => mq.removeEventListener('change', u);
  }, []);

  useEffect(() => {
    if (isMobile) return;
    let ticking = false;
    const onScroll = () => {
      if (hoveringRef.current) return;
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => { ticking = false; recompute(); });
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    recompute();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [isMobile, recompute]);

  return (
    <section id="how" style={{ background: 'linear-gradient(160deg, #1d4ed8 0%, #0ea5e9 100%)', padding: '88px 0 80px' }}>
      <div style={{ textAlign: 'center', marginBottom: 48, padding: '0 24px' }}>
        <h2 style={{ fontFamily: SANS, fontSize: 'clamp(1.875rem,4vw,2.875rem)', fontWeight: 800, letterSpacing: '-0.035em', color: 'white', lineHeight: 1.08, marginBottom: 12 }}>
          How JobScorer works
        </h2>
        <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.92)', maxWidth: 440, margin: '0 auto', lineHeight: 1.6 }}>
          A complete loop from upload to offer-ready — not a collection of disconnected tools.
        </p>
      </div>

      <div className="sn-wrap" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56, maxWidth: 1140, margin: '0 auto', padding: '0 40px', alignItems: 'start' }}>
        {/* LEFT rail */}
        <div className="sn-rail" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {STEPS.map((step, i) => {
            const isActive = isMobile || active === i;
            return (
              <div
                key={step.n}
                ref={el => { railRefs.current[i] = el; }}
                data-idx={i}
                onClick={() => { hoveringRef.current = false; setActive(i); }}
                onMouseEnter={() => { if (!isMobile) { hoveringRef.current = true; setActive(i); } }}
                onMouseLeave={() => { if (!isMobile) { hoveringRef.current = false; recompute(); } }}
                style={{
                  cursor: 'pointer',
                  position: 'relative',
                  borderRadius: 16,
                  padding: '20px 22px',
                  background: isActive ? 'white' : 'rgba(255,255,255,0.07)',
                  border: isActive ? `2px solid ${step.highlight ? C.primary : 'transparent'}` : '2px solid rgba(255,255,255,0.12)',
                  opacity: isActive ? 1 : 0.62,
                  boxShadow: isActive && !isMobile ? '0 18px 44px -14px rgba(15,23,42,.36)' : 'none',
                  transition: 'all .35s ease',
                }}
              >
                {isActive && !isMobile && (
                  <div style={{ position: 'absolute', left: -2, top: 16, bottom: 16, width: 4, borderRadius: 4, background: step.highlight ? C.primary : '#0ea5e9' }} />
                )}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                  <span style={{ fontFamily: MONO, fontSize: isActive ? 22 : 17, fontWeight: 800, lineHeight: 1, color: isActive ? C.primary : 'rgba(255,255,255,0.9)', transition: 'all .3s' }}>{step.n}</span>
                  <h3 style={{ fontFamily: SANS, fontWeight: 700, fontSize: isActive ? 18 : 16, color: isActive ? C.text : 'white', lineHeight: 1.3, margin: 0, transition: 'all .3s' }}>{step.title}</h3>
                </div>

                {/* Mobile-only inline visual */}
                <div className="sn-mobile-illo" style={{ display: 'none', margin: '14px 0 4px', minHeight: 130, background: '#f8fafc', borderRadius: 12, border: `1px solid ${C.border}`, padding: '18px', alignItems: 'center', justifyContent: 'center' }}>
                  {step.illo}
                </div>

                <p style={{ fontSize: 13.5, color: isActive ? C.textSec : 'rgba(255,255,255,0.82)', lineHeight: 1.6, margin: '8px 0 0', transition: 'all .3s' }}>{step.desc}</p>

                {step.highlight && isActive && (
                  <div style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999, background: C.primaryLight, border: `1px solid ${C.primary}40` }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" fill={C.primary}/></svg>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.primary, fontFamily: MONO, letterSpacing: '0.08em' }}>OUR DIFFERENTIATOR</span>
                  </div>
                )}
              </div>
            );
          })}
          <div className="sn-rail-spacer" style={{ height: '42vh', flexShrink: 0 }} aria-hidden="true" />
        </div>

        {/* RIGHT sticky visual — capped to the viewport (minus navbar + a 2rem gap)
            so the whole mockup stays visible and vertically centred while pinned,
            even on short (~720px) desktops. The card flex-shrinks rather than
            overflowing if height runs tight. */}
        <div className="sn-visual" style={{ position: 'sticky', top: 64, height: 'calc(100vh - 64px - 2rem)', maxHeight: 'calc(100vh - 64px - 2rem)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', alignSelf: 'start' }}>
          <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 24, border: '1px solid rgba(255,255,255,0.22)', flex: '0 1 440px', minHeight: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: '0 30px 70px -22px rgba(15,23,42,.42)', position: 'relative', padding: '28px 34px', boxSizing: 'border-box' }}>
            <span style={{ position: 'absolute', top: 18, right: 26, fontFamily: MONO, fontSize: 88, fontWeight: 800, color: 'rgba(255,255,255,0.14)', lineHeight: 1, userSelect: 'none', zIndex: 0 }}>{STEPS[active].n}</span>
            <div key={active} style={{ transform: 'scale(1.26)', transformOrigin: 'center', width: '74%', maxWidth: '74%', display: 'flex', justifyContent: 'center', animation: 'jsSnFade .18s ease', position: 'relative', zIndex: 1 }}>
              {STEPS[active].illo}
            </div>
          </div>
          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.85)' }}>STEP {STEPS[active].n} / 07</span>
          </div>
          <div style={{ display: 'flex', gap: 7, justifyContent: 'center', marginTop: 12 }}>
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => {
                  hoveringRef.current = false;
                  const el = railRefs.current[i];
                  if (el) {
                    window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - window.innerHeight / 2 + 80, behavior: 'smooth' });
                  }
                  setActive(i);
                }}
                aria-label={`Go to step ${i + 1}`}
                style={{
                  width: active === i ? 28 : 8,
                  height: 8,
                  borderRadius: 4,
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  background: active === i ? 'white' : 'rgba(255,255,255,0.4)',
                  transition: 'all .3s',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <p style={{ textAlign: 'center', marginTop: 48, fontSize: 14, color: 'rgba(255,255,255,0.90)', fontFamily: MONO, letterSpacing: '0.05em', padding: '0 24px' }}>
        Here&apos;s your personalised plan to close every gap — built for this role, this company.
      </p>
    </section>
  );
}
