'use client';

import Link from 'next/link';
import { C, SANS, MONO } from './tokens';

const COLS: Array<{ t: string; ls: Array<[string, string]> }> = [
  { t: 'Product', ls: [
    ['Browse Jobs',       '/browse'],
    ['Upload Resume',     '/signup'],
    ['AI Matching',       '#how'],
    ['ATS Intelligence',  '#how'],
    ['Resume Optimizer',  '#how'],
    ['App Tracker',       '#how'],
  ]},
  { t: 'Company', ls: [
    ['About',   '#'],
    ['Blog',    '#'],
    ['Careers', '#'],
    ['Contact', '#'],
  ]},
  { t: 'Legal', ls: [
    ['Privacy Policy',    '/legal/privacy'],
    ['Terms of Service',  '/legal/terms'],
    ['Cookie Policy',     '/legal/cookies'],
  ]},
];

export default function LandingFooter() {
  return (
    <footer style={{ background: C.bg, borderTop: `1px solid ${C.border}`, padding: '56px 32px 32px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div className="footer-grid" style={{ display: 'grid', gridTemplateColumns: '1.6fr repeat(3,1fr)', gap: 40, marginBottom: 40 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
              <div style={{ position: 'relative', width: 28, height: 28, borderRadius: 8, background: `linear-gradient(135deg, ${C.primary} 0%, #2563eb 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 3px 8px -1px ${C.primary}55`, flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 18 L9 12 L13 15 L20 6" />
                  <path d="M15 6 L20 6 L20 11" />
                </svg>
              </div>
              <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: '0.9375rem', letterSpacing: '-0.025em' }}><span style={{ color: C.text }}>Job</span><span style={{ color: C.primary }}>Scorer</span></span>
            </div>
            <p style={{ fontSize: '0.8125rem', lineHeight: 1.7, color: C.textSec, maxWidth: 200, marginBottom: 16 }}>
              AI-powered job matching for Indian IT freshers. Score, optimize, track.
            </p>
            <p style={{ fontSize: '0.75rem', color: C.textTer, display: 'flex', alignItems: 'center', gap: 5 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.textTer} strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              We never share your resume
            </p>
          </div>
          {COLS.map(col => (
            <div key={col.t}>
              <div style={{ fontFamily: MONO, fontSize: '0.5625rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.textTer, marginBottom: 14 }}>
                {col.t}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {col.ls.map(([label, href]) => {
                  const isHash = href.startsWith('#') || href === '#';
                  const linkStyle: React.CSSProperties = { fontSize: '0.8125rem', color: C.textSec, textDecoration: 'none', transition: 'color 0.15s' };
                  const onEnter = (e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.color = C.text; };
                  const onLeave = (e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.color = C.textSec; };
                  return isHash ? (
                    <a key={label} href={href} style={linkStyle} onMouseEnter={onEnter} onMouseLeave={onLeave}>{label}</a>
                  ) : (
                    <Link key={label} href={href} style={linkStyle} onMouseEnter={onEnter} onMouseLeave={onLeave}>{label}</Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <p style={{ fontSize: '0.75rem', color: C.textTer }}>© 2026 JobScorer. All rights reserved. Built in India 🇮🇳</p>
          <p style={{ fontFamily: MONO, fontSize: '0.5625rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: C.textTer }}>No credit card required · Cancel anytime</p>
        </div>
      </div>
      <style>{`
        @media (max-width: 760px) {
          .footer-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 480px) {
          .footer-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </footer>
  );
}
