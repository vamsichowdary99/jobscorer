'use client';

import Link from 'next/link';
import { C, SANS, MONO } from './tokens';
import TrustBar from './TrustBar';
import ResumeShowcase from './ResumeShowcase';

export default function Hero() {
  return (
    <section className="hero-section" style={{ padding: '128px 24px 64px', background: C.bg, overflow: 'hidden' }}>
      <div style={{ maxWidth: 680, margin: '0 auto', textAlign: 'center' }}>
        {/* Kicker badge */}
        <div
          className="fade-hero fh1"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '5px 14px',
            borderRadius: 999,
            background: C.primaryLight,
            border: `1px solid ${C.primary}22`,
            marginBottom: 24,
          }}
        >
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.success, flexShrink: 0 }} />
          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.primary }}>
            Built for Indian IT freshers
          </span>
        </div>

        {/* Headline */}
        <h1 className="fade-hero fh2" style={{ fontFamily: SANS, fontSize: 'clamp(2.25rem,6vw,3.75rem)', fontWeight: 800, letterSpacing: '-0.04em', color: C.text, lineHeight: 1.06, marginBottom: 20 }}>
          Land IT jobs in India with a resume tuned to each company you apply to.
        </h1>

        {/* Subhead */}
        <p className="fade-hero fh3" style={{ fontSize: 'clamp(1rem,2vw,1.125rem)', color: C.textSec, lineHeight: 1.7, maxWidth: 520, margin: '0 auto 36px' }}>
          JobScorer matches you to real listings, scores your fit, surfaces your skill gaps, researches the company — then rewrites your resume to that specific role and team.
        </p>

        {/* Primary CTA */}
        <div className="fade-hero fh4">
          <Link
            href="/signup"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: '16px 36px',
              background: C.primary,
              color: 'white',
              borderRadius: 10,
              fontSize: 16,
              fontWeight: 700,
              fontFamily: SANS,
              textDecoration: 'none',
              boxShadow: `0 8px 24px -6px rgba(19,91,236,0.45)`,
              transition: 'all .2s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = C.primaryHover; e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = C.primary; e.currentTarget.style.transform = 'none'; }}
          >
            Upload your resume — free
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </Link>

          {/* Microlines */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: C.textSec, display: 'flex', alignItems: 'center', gap: 5 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.success} strokeWidth="2.2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              We never share your resume
            </span>
            <span style={{ fontSize: 13, color: C.textTer }}>·</span>
            <span style={{ fontSize: 13, color: C.textSec }}>No credit card required</span>
          </div>

          {/* Quiet secondary */}
          <div style={{ marginTop: 16 }}>
            <a href="#demo" style={{ fontSize: 14, color: C.primary, textDecoration: 'underline', textUnderlineOffset: 3, fontWeight: 500, textDecorationColor: `${C.primary}55` }}>
              See a sample fit score report →
            </a>
          </div>
        </div>

        {/* Trust strip */}
        <div className="fade-hero fh5" style={{ marginTop: 48 }}>
          <TrustBar />
        </div>
      </div>

      {/* 3D Carousel */}
      <div className="fade-hero fh5" style={{ maxWidth: 1400, margin: '56px auto 0', width: '100%' }}>
        <ResumeShowcase />
      </div>
    </section>
  );
}
