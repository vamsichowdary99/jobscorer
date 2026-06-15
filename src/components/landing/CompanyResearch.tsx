'use client';

import { C, SANS, MONO } from './tokens';

const BEFORE = [
  'Built REST APIs using Node.js and Express',
  'Worked on payment integration features',
  'Wrote unit tests to improve code coverage',
  'Collaborated with cross-functional teams',
];

const AFTER = [
  "Designed and shipped 3 REST APIs on Node.js + Fastify, handling 40k req/s with p99 < 80ms — matching the company's scale and latency bar",
  "Integrated the company's own payment SDK in a side project, validating webhooks and handling edge cases in refund flows",
  "Raised test coverage from 54% to 88% using Jest + Supertest — aligned with the company's engineering culture of high-confidence deploys",
  "Led sprint planning across BE, FE, and QA — mirrors the company's cross-pod ownership model",
];

const RESEARCH = ['Fastify over Express', 'p99 latency obsession', 'High test-coverage culture', 'Cross-pod ownership model', 'Own SDK dogfooding'];

export default function CompanyResearch() {
  return (
    <section style={{ background: 'white', padding: '96px 24px', borderTop: `1px solid ${C.border}` }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 999, background: '#f1f5f9', border: `1px solid ${C.border}`, marginBottom: 12 }}>
            <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.textSec }}>Illustrative Example</span>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 999, background: C.primaryLight, border: `1px solid ${C.primary}22`, marginBottom: 16, marginLeft: 8 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" fill={C.primary}/></svg>
            <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.primary }}>What makes us different</span>
          </div>
          <h2 style={{ fontFamily: SANS, fontSize: 'clamp(1.75rem,3.5vw,2.5rem)', fontWeight: 800, letterSpacing: '-0.03em', color: C.text, lineHeight: 1.1, marginBottom: 14, maxWidth: 640, margin: '0 auto 14px' }}>
            Most tools rewrite to the job description.<br />We rewrite to the company.
          </h2>
          <p style={{ fontSize: 16, color: C.textSec, maxWidth: 520, margin: '0 auto', lineHeight: 1.65 }}>
            Before touching your resume, we research the target company — their tech stack, engineering culture, team structure, and ATS configuration. Here&apos;s what that looks like for a real fast-growing fintech application.
          </p>
        </div>

        {/* Company research card */}
        <div style={{ background: C.bg, borderRadius: 16, border: `1px solid ${C.border}`, padding: '24px', marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: 14 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-3"/><path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01"/></svg>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>Fast-growing fintech — Backend Engineer</div>
              <div style={{ fontSize: 12, color: C.textSec }}>Research completed in 12 seconds</div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 999, background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.success }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: C.success, fontFamily: MONO }}>Research complete</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {RESEARCH.map(r => (
              <span key={r} style={{ padding: '4px 12px', borderRadius: 999, background: C.primaryLight, border: `1px solid ${C.primary}30`, fontSize: 12, color: C.primary, fontFamily: MONO, fontWeight: 600 }}>{r}</span>
            ))}
          </div>
        </div>

        {/* Before / After */}
        <div className="ba-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {/* Before */}
          <div style={{ background: C.bg, borderRadius: 16, border: '1px solid #fca5a5', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <div style={{ width: 24, height: 24, borderRadius: 6, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round"/></svg>
              </div>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#991b1b' }}>Before — Generic JD rewrite</span>
            </div>
            {BEFORE.map((b, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderBottom: i < BEFORE.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fee2e2', border: '1px solid #fca5a5', flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 13.5, color: C.textSec, lineHeight: 1.5, margin: 0 }}>{b}</p>
              </div>
            ))}
          </div>

          {/* After */}
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #135bec40', padding: '24px', boxShadow: '0 8px 32px -8px rgba(19,91,236,0.12)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <div style={{ width: 24, height: 24, borderRadius: 6, background: C.primaryLight, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke={C.primary} strokeWidth="2.2" strokeLinecap="round"/></svg>
              </div>
              <span style={{ fontWeight: 700, fontSize: 14, color: C.primary }}>After — Tuned to the company</span>
            </div>
            {AFTER.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderBottom: i < AFTER.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: C.primaryLight, border: '1px solid #bdd0fa', flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 13.5, color: C.text, lineHeight: 1.55, margin: 0 }}>{a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ATS / privacy reassurance */}
        <div style={{ display: 'flex', gap: 24, marginTop: 32, justifyContent: 'center', flexWrap: 'wrap' }}>
          {[
            { icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.success} strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>, text: 'ATS-tested output — passes Naukri, LinkedIn, and Workday scanners' },
            { icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>, text: 'Your resume is never shared, sold, or used to train models' },
          ].map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.textSec }}>
              {r.icon} {r.text}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
