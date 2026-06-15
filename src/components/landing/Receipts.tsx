'use client';

import { useState } from 'react';
import { C, SANS, MONO } from './tokens';

// ─── Match Score Receipt ────────────────────────────────────────────────
export function MatchScoreReceipt() {
  const bullets = [
    { label: 'Match',   text: "Go + Node.js mirrors the JD's microservices focus. 6 of 9 core skills present.", color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
    { label: 'Gap',     text: "Kafka not on resume. 2-week Confluent cert covers exactly what's asked.",       color: '#a16207', bg: '#fefce8', border: '#fde68a' },
    { label: 'Verdict', text: 'Strong fit. Apply directly — score likely beats ~80% of applicants.',            color: '#1d4ed8', bg: '#dbeafe', border: '#bfdbfe' },
  ];
  return (
    <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`, boxShadow: '0 4px 24px rgba(15,23,42,0.07)', overflow: 'hidden', maxWidth: 420, width: '100%' }}>
      <div style={{ padding: '16px 18px 14px', borderBottom: `1px solid ${C.borderFaint}` }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ width: 40, height: 40, borderRadius: 9, background: '#1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.9)', fontSize: 16, fontWeight: 700, fontFamily: SANS, flexShrink: 0 }}>R</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: C.text, fontFamily: SANS }}>SDE-1 — Backend Platform</div>
            <div style={{ fontSize: '0.8rem', color: C.textSec, marginTop: 2 }}>Razorpay · Bengaluru, India</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
            <span style={{ fontFamily: MONO, fontSize: '0.625rem', fontWeight: 800, padding: '2px 7px', borderRadius: 5, color: '#15803d', background: '#dcfce7', letterSpacing: '0.04em' }}>84% MATCH</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px 2px 6px', borderRadius: 9999, background: 'linear-gradient(135deg,#ecfdf5,#d1fae5)', color: '#047857', border: '1px solid #6ee7b7', fontSize: '0.6875rem', fontWeight: 700, boxShadow: '0 0 0 3px #6ee7b755' }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.5 6.5L21 11l-6.5 2.5L12 20l-2.5-6.5L3 11l6.5-2.5L12 2z"/></svg>
              Strong Apply
            </span>
          </div>
        </div>
      </div>
      <div style={{ padding: '14px 18px 16px' }}>
        <div style={{ fontFamily: MONO, fontSize: '0.5625rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.textTer, marginBottom: 10 }}>AI Analysis</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {bullets.map(b => (
            <div key={b.label} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '2px 9px', borderRadius: 9999, background: b.bg, color: b.color, border: `1px solid ${b.border}`, fontSize: '0.5625rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', minWidth: 62, height: 20, fontFamily: MONO }}>
                {b.label}
              </span>
              <p style={{ margin: 0, fontSize: '0.78rem', lineHeight: 1.5, color: '#1f2937', paddingTop: 1 }}>{b.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── ATS Intelligence Receipt ───────────────────────────────────────────
export function ATSIntelReceipt() {
  const hits = [{ n: 'Java', c: 4 }, { n: 'Spring Boot', c: 3 }, { n: 'REST API', c: 5 }, { n: 'JUnit', c: 2 }, { n: 'Git', c: 4 }];
  const gaps = [{ n: 'Kafka' }, { n: 'Docker' }, { n: 'Kubernetes' }, { n: 'Redis' }];
  return (
    <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`, boxShadow: '0 4px 24px rgba(15,23,42,0.07)', padding: '18px 20px', maxWidth: 420, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 3 }}>
        <h3 style={{ fontFamily: SANS, fontSize: '1rem', fontWeight: 800, letterSpacing: '-0.02em', color: C.text }}>ATS Intelligence</h3>
        <span style={{ fontFamily: MONO, fontSize: '0.5625rem', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.textTer }}>Vol. 01</span>
      </div>
      <p style={{ fontSize: '0.75rem', color: C.textSec, lineHeight: 1.5, marginBottom: 14 }}>Keyword density, phrasing, and callback signal — read at a glance.</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 14, marginBottom: 14, borderBottom: `2px solid ${C.text}` }}>
        <span style={{ fontSize: '0.8rem', color: '#475569' }}>
          <span style={{ fontFamily: MONO, fontWeight: 800, color: C.primary, fontSize: '0.9rem' }}>5</span>{' '}of{' '}
          <span style={{ fontFamily: MONO, fontWeight: 600, color: '#475569', fontSize: '0.9rem' }}>9</span>{' '}keywords matched
        </span>
        <div style={{ flex: 1, height: 1, background: C.borderFaint }} />
        <span style={{ fontFamily: MONO, fontWeight: 800, color: C.primary, fontSize: '0.8125rem', letterSpacing: '-0.02em' }}>56%</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr', columnGap: 18, marginBottom: 14 }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${C.borderFaint}`, paddingBottom: 5, marginBottom: 7 }}>
            <span style={{ fontFamily: MONO, fontSize: '0.5625rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.primary }}>Hits</span>
            <span style={{ fontFamily: MONO, fontSize: '0.5rem', fontWeight: 600, color: C.textTer, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{hits.length} found</span>
          </div>
          {hits.map(kw => (
            <div key={kw.n} style={{ display: 'grid', gridTemplateColumns: '26px 1fr', columnGap: 8, padding: '4px 0', borderBottom: `1px dotted ${C.borderFaint}`, alignItems: 'baseline' }}>
              <span style={{ fontFamily: MONO, fontWeight: 800, color: C.primary, fontSize: '0.8125rem', textAlign: 'right' }}>{kw.c}<span style={{ color: C.textTer, fontWeight: 500 }}>×</span></span>
              <span style={{ fontSize: '0.75rem', color: C.text }}>{kw.n}</span>
            </div>
          ))}
        </div>
        <div style={{ background: C.borderFaint }} />
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${C.borderFaint}`, paddingBottom: 5, marginBottom: 7 }}>
            <span style={{ fontFamily: MONO, fontSize: '0.5625rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.textTer }}>Missing</span>
            <span style={{ fontFamily: MONO, fontSize: '0.5rem', fontWeight: 600, color: C.textTer, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{gaps.length} absent</span>
          </div>
          {gaps.map(kw => (
            <div key={kw.n} style={{ display: 'grid', gridTemplateColumns: '26px 1fr', columnGap: 8, padding: '4px 0', borderBottom: `1px dotted ${C.borderFaint}`, alignItems: 'baseline' }}>
              <span style={{ fontFamily: MONO, fontWeight: 700, color: '#b45309', fontSize: '0.875rem', textAlign: 'right' }}>—</span>
              <span style={{ fontSize: '0.75rem', color: '#1e293b', fontWeight: 500 }}>{kw.n}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden', background: C.bg }}>
        <div style={{ padding: '10px 14px', borderRight: `1px solid ${C.border}` }}>
          <div style={{ fontFamily: MONO, fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.textTer, marginBottom: 4 }}>Verdict</div>
          <div style={{ fontFamily: MONO, fontSize: '1.375rem', fontWeight: 800, color: '#b45309', lineHeight: 1 }}>MED</div>
        </div>
        <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center' }}>
          <p style={{ margin: 0, fontSize: '0.75rem', color: '#334155', lineHeight: 1.5 }}>Good Java stack coverage. Add Kafka + Docker to push to HIGH callback probability.</p>
        </div>
      </div>
    </div>
  );
}

// ─── Resume Optimization Receipt ────────────────────────────────────────
export function ResumeOptReceipt() {
  return (
    <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`, boxShadow: '0 4px 24px rgba(15,23,42,0.07)', padding: '18px 20px', maxWidth: 420, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2.5" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
          <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: '0.875rem', color: C.text }}>Resume Rewrite — Razorpay SDE-1</span>
        </div>
        <span style={{ fontFamily: MONO, fontSize: '0.5625rem', padding: '2px 7px', borderRadius: 4, background: C.successBg, color: C.success, border: `1px solid ${C.successBorder}`, fontWeight: 700 }}>+18 pts ATS</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ background: '#fef2f2', borderRadius: 8, padding: '10px 12px', border: '1px solid #fecaca' }}>
          <div style={{ fontFamily: MONO, fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#b91c1c', marginBottom: 6 }}>Before</div>
          <p style={{ fontSize: '0.78rem', color: '#1e293b', lineHeight: 1.55, margin: 0 }}>Worked on backend services for the payment platform and helped improve performance.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, height: 1, background: C.borderFaint }} />
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2.5"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
          <div style={{ flex: 1, height: 1, background: C.borderFaint }} />
        </div>
        <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '10px 12px', border: '1px solid #bbf7d0' }}>
          <div style={{ fontFamily: MONO, fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#047857', marginBottom: 6 }}>After</div>
          <p style={{ fontSize: '0.78rem', color: '#1e293b', lineHeight: 1.55, margin: 0 }}>
            Engineered 3 microservices handling{' '}
            <mark style={{ background: '#d1fae5', color: '#065f46', borderRadius: 3, padding: '1px 3px' }}>₹2Cr+ daily payment volume</mark>
            {' '}using Spring Boot, reducing P99 latency by{' '}
            <mark style={{ background: '#d1fae5', color: '#065f46', borderRadius: 3, padding: '1px 3px' }}>40%</mark>
            {' '}via Redis caching.
          </p>
        </div>
      </div>
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.borderFaint}`, display: 'flex', gap: 6, alignItems: 'center' }}>
        {['Classic', 'Modern', 'Minimal', 'Technical'].map(t => (
          <span key={t} style={{ fontSize: '0.6875rem', padding: '3px 10px', borderRadius: 6, background: t === 'Modern' ? C.primaryLight : C.surfaceAlt, color: t === 'Modern' ? C.primary : C.textSec, fontWeight: t === 'Modern' ? 600 : 400, border: t === 'Modern' ? `1px solid ${C.primary}30` : `1px solid ${C.border}` }}>{t}</span>
        ))}
        <span style={{ fontSize: '0.625rem', color: C.textTer, marginLeft: 'auto', fontFamily: MONO }}>4 templates</span>
      </div>
    </div>
  );
}

// ─── Application Tracker Kanban ─────────────────────────────────────────
export function KanbanReceipt() {
  const cols = [
    { s: 'Applied',   color: '#135bec', count: 8, cards: [{ L: 'T', name: 'TCS',      role: 'Systems Eng.',  bg: '#063670', d: '2d ago' }, { L: 'I', name: 'Infosys',   role: 'Sys. Eng.',     bg: '#0B5CAB', d: '4d ago' }], confetti: false },
    { s: 'Interview', color: '#16a34a', count: 3, cards: [{ L: 'R', name: 'Razorpay', role: 'SDE-1 Backend', bg: '#1e3a5f', d: '1d ago' }], confetti: false },
    { s: 'Offer',     color: '#d97706', count: 1, cards: [{ L: 'S', name: 'Swiggy',   role: 'SDE-1',         bg: '#C2410C', d: 'today'  }], confetti: true },
    { s: 'Rejected',  color: '#dc2626', count: 3, cards: [{ L: 'W', name: 'Wipro',    role: 'Software Dev',  bg: '#431407', d: '1w ago' }], confetti: false },
  ];
  const confColors = ['#135bec', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
  return (
    <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`, boxShadow: '0 4px 24px rgba(15,23,42,0.07)', padding: '14px 16px', maxWidth: 480, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: '0.875rem', color: C.text }}>Application Tracker</span>
        <span style={{ fontFamily: MONO, fontSize: '0.5625rem', fontWeight: 600, color: C.textTer, letterSpacing: '0.08em', textTransform: 'uppercase' }}>15 total</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
        {cols.map(col => (
          <div key={col.s} style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: col.color }} />
                <span style={{ fontSize: '0.625rem', fontWeight: 700, color: col.color, fontFamily: SANS }}>{col.s}</span>
              </div>
              <span style={{ fontFamily: MONO, fontSize: '0.5625rem', fontWeight: 700, color: C.textTer }}>{col.count}</span>
            </div>
            {col.confetti && (
              <div style={{ position: 'absolute', top: 20, left: 0, right: 0, height: 60, overflow: 'hidden', pointerEvents: 'none', zIndex: 5 }}>
                {confColors.map((c, i) => (
                  <div key={i} className="js-confetti" style={{ position: 'absolute', left: `${12 + i * 20}%`, top: 0, width: 4, height: 4, borderRadius: i % 2 ? '50%' : 1, background: c, animationDuration: `${0.9 + i * 0.18}s`, animationDelay: `${i * 0.12}s` }} />
                ))}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {col.cards.map((card, i) => (
                <div key={i} style={{ background: C.bg, borderRadius: 7, padding: '7px 9px', border: `1px solid ${C.border}` }}>
                  <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginBottom: 3 }}>
                    <div style={{ width: 18, height: 18, borderRadius: 4, background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.9)', fontSize: '0.5rem', fontWeight: 800, flexShrink: 0 }}>{card.L}</div>
                    <span style={{ fontSize: '0.625rem', fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.name}</span>
                  </div>
                  <div style={{ fontSize: '0.5625rem', color: C.textSec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.role}</div>
                  <div style={{ fontSize: '0.5rem', color: C.textTer, marginTop: 2, fontFamily: MONO }}>{card.d}</div>
                </div>
              ))}
              {col.count > col.cards.length && (
                <div style={{ fontSize: '0.5rem', color: C.textTer, textAlign: 'center', padding: 3, fontFamily: MONO }}>+{col.count - col.cards.length} more</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Company Intelligence Receipt ───────────────────────────────────────
export function CompanyIntelReceipt() {
  return (
    <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`, boxShadow: '0 4px 24px rgba(15,23,42,0.07)', padding: '18px 20px', maxWidth: 420, width: '100%' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', paddingBottom: 14, marginBottom: 14, borderBottom: `1px solid ${C.borderFaint}` }}>
        <div style={{ width: 40, height: 40, borderRadius: 9, background: '#C2410C', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.9)', fontSize: 16, fontWeight: 700, fontFamily: SANS, flexShrink: 0 }}>S</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: '0.9375rem', color: C.text }}>Swiggy</div>
          <div style={{ fontSize: '0.78rem', color: C.textSec }}>Company Research · Bengaluru, India</div>
        </div>
        <span style={{ fontFamily: MONO, fontSize: '0.5625rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: C.successBg, color: C.success, border: `1px solid ${C.successBorder}` }}>Live</span>
      </div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: MONO, fontSize: '0.5625rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.textTer, marginBottom: 7 }}>Tech Stack</div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {['Go', 'Java', 'Kafka', 'PostgreSQL', 'Redis', 'Kubernetes', 'AWS'].map(t => (
            <span key={t} style={{ fontSize: '0.6875rem', padding: '3px 10px', borderRadius: 6, background: C.primaryLight, color: C.primary, fontWeight: 500 }}>{t}</span>
          ))}
        </div>
      </div>
      <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${C.borderFaint}` }}>
        <div style={{ fontFamily: MONO, fontSize: '0.5625rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.textTer, marginBottom: 6 }}>Salary Band · SDE-1</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
          <span style={{ fontFamily: MONO, fontWeight: 800, fontSize: '1.125rem', color: C.text }}>₹14L–₹20L</span>
          <span style={{ fontSize: '0.75rem', color: C.textSec }}>+ ESOP + annual bonus</span>
        </div>
      </div>
      <div style={{ background: C.surfaceAlt, borderRadius: 8, padding: '10px 12px', border: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.success, flexShrink: 0, marginTop: 5 }} />
          <p style={{ margin: 0, fontSize: '0.75rem', color: C.textSec, lineHeight: 1.5 }}>
            <strong style={{ color: C.text }}>Hiring signal:</strong> Engineering blog posted 2 articles on Kafka and Go microservices in the last 30 days. Expanding payments infra team.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Paste Job Description Receipt ──────────────────────────────────────
export function PasteJobReceipt() {
  const [scored, setScored] = useState(false);
  return (
    <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`, boxShadow: '0 4px 24px rgba(15,23,42,0.07)', padding: '18px 20px', maxWidth: 420, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2.5" strokeLinecap="round"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>
        <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: '0.875rem', color: C.text }}>Paste Job Description</span>
      </div>
      {!scored ? (
        <>
          <div style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', marginBottom: 10, minHeight: 88 }}>
            <p style={{ fontSize: '0.75rem', color: C.textSec, lineHeight: 1.6, margin: 0 }}>
              <strong style={{ color: C.text }}>Senior Software Engineer — Swiggy</strong><br />
              Bengaluru · 2–5 yrs exp.<br /><br />
              Looking for a backend engineer to build payments infra. You will work with Go, Kafka, PostgreSQL, Redis, Kubernetes...
            </p>
          </div>
          <button onClick={() => setScored(true)} style={{ width: '100%', padding: '10px', background: C.primary, color: 'white', border: 'none', borderRadius: 8, fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', fontFamily: SANS, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            Score against my resume
          </button>
        </>
      ) : (
        <div style={{ animation: 'jsReceiptFadeUp 0.35s ease both' }}>
          <div style={{ background: 'linear-gradient(135deg,#ecfdf5,#d1fae5)', border: '1px solid #6ee7b7', borderRadius: 10, padding: '14px 16px', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontFamily: MONO, fontSize: '2rem', fontWeight: 800, color: '#047857', lineHeight: 1 }}>91%</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 9999, background: 'rgba(255,255,255,.6)', color: '#047857', fontSize: '0.6875rem', fontWeight: 700, border: '1px solid #6ee7b7' }}>
                <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.5 6.5L21 11l-6.5 2.5L12 20l-2.5-6.5L3 11l6.5-2.5L12 2z"/></svg>
                Strong Apply
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#047857', lineHeight: 1.5 }}>Your Go + Kafka background is an exceptional match. Apply without changes.</p>
          </div>
          <button onClick={() => setScored(false)} style={{ fontSize: '0.75rem', color: C.textTer, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: SANS }}>Try another job →</button>
        </div>
      )}
    </div>
  );
}

export type ReceiptKey = 'match' | 'ats' | 'resume' | 'kanban' | 'company' | 'paste';

export function getReceipt(key: ReceiptKey) {
  switch (key) {
    case 'match':   return <MatchScoreReceipt />;
    case 'ats':     return <ATSIntelReceipt />;
    case 'resume':  return <ResumeOptReceipt />;
    case 'kanban':  return <KanbanReceipt />;
    case 'company': return <CompanyIntelReceipt />;
    case 'paste':   return <PasteJobReceipt />;
  }
}
