'use client';

import Link from 'next/link';
import { C, SANS } from './tokens';

export default function CTABanner() {
  return (
    <section style={{ padding: '88px 24px', background: C.primary, textAlign: 'center' }}>
      <div style={{ maxWidth: 580, margin: '0 auto' }}>
        <h2 style={{ fontFamily: SANS, fontSize: 'clamp(1.875rem,4vw,2.75rem)', fontWeight: 800, letterSpacing: '-0.035em', color: 'white', lineHeight: 1.1, marginBottom: 16 }}>
          Ready to find jobs you&apos;ll actually get?
        </h2>
        <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.92)', marginBottom: 32, lineHeight: 1.65 }}>
          Join thousands of IT freshers who apply smarter with their fit score.
        </p>
        <Link
          href="/signup"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: '16px 36px',
            background: 'white',
            color: C.primary,
            borderRadius: 10,
            fontSize: 16,
            fontWeight: 700,
            fontFamily: SANS,
            textDecoration: 'none',
            boxShadow: '0 8px 24px rgba(0,0,0,.18)',
            transition: 'all .2s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.opacity = '.92'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.opacity = '1'; }}
        >
          Upload your resume — free
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </Link>
        <div style={{ marginTop: 12, fontSize: 13, color: 'rgba(255,255,255,0.90)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span>No credit card required</span>
          <span>·</span>
          <span>We never share your resume</span>
          <span>·</span>
          <span>Cancel anytime</span>
        </div>
      </div>
    </section>
  );
}
