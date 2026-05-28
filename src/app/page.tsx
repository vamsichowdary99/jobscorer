'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { getJobCount } from '@/lib/api'

export default function LandingPage() {
  const [jobCount, setJobCount] = useState(88)

  useEffect(() => {
    getJobCount().then(c => { if (c > 0) setJobCount(c) }).catch(() => { })
  }, [])

  return (
    <>
      <Navbar />

      <main style={{ paddingTop: 64 }}>
        {/* ── Hero Section ─────────────────────────────────── */}
        <section style={{
          position: 'relative',
          minHeight: '85vh',
          display: 'flex',
          alignItems: 'center',
          background: 'linear-gradient(160deg, #f8fafc 0%, #e8f0fe 50%, #f0f7ff 100%)',
          overflow: 'hidden',
        }}>
          {/* Decorative grid dots */}
          <div style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)',
            backgroundSize: '32px 32px',
            opacity: 0.3,
          }} />

          <div className="container-main hero-grid" style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }}>
            {/* Left: Content */}
            <div className="animate-fade-in-up">
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 14px',
                background: 'var(--color-primary-light)',
                borderRadius: 'var(--radius-full)',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'var(--color-primary)',
                marginBottom: 24,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-success)' }} />
                {jobCount}+ jobs indexed
              </div>

              <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 3.5rem)', lineHeight: 1.08, fontWeight: 800, marginBottom: 20, letterSpacing: '-0.03em' }}>
                Find jobs you should{' '}
                <span style={{ color: 'var(--color-primary)', position: 'relative' }}>
                  actually apply to
                  <svg viewBox="0 0 200 8" style={{ position: 'absolute', bottom: -4, left: 0, width: '100%', height: 8 }}>
                    <path d="M0 6 Q 50 0, 100 4 T 200 4" fill="none" stroke="var(--color-primary)" strokeWidth="3" strokeLinecap="round" opacity="0.4" />
                  </svg>
                </span>
              </h1>

              <p style={{ fontSize: '1.125rem', lineHeight: 1.7, color: 'var(--color-text-secondary)', maxWidth: 480, marginBottom: 32 }}>
                Stop shouting into the void. Use AI to scan thousands of listings and match your unique skills with the perfect role in seconds.
              </p>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Link href="/dashboard/upload" className="btn btn-primary" style={{ padding: '14px 28px', fontSize: '0.9375rem' }}>
                  Upload your resume →
                </Link>
                <Link href="/browse" className="btn btn-secondary" style={{ padding: '14px 28px', fontSize: '0.9375rem' }}>
                  Browse jobs
                </Link>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 40 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {['#10b981', '#10b981', '#10b981', '#10b981', '#e2e8f0'].map((c, i) => (
                    <svg key={i} width="16" height="16" viewBox="0 0 16 16">
                      <path d="M8 1l2.2 4.4 4.8.7-3.5 3.4.8 4.8L8 12l-4.3 2.3.8-4.8L1 6.1l4.8-.7z" fill={c} />
                    </svg>
                  ))}
                </div>
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>Trusted by 2,000+ job seekers</span>
              </div>
            </div>

            {/* Right: Visual */}
            <div className="animate-fade-in-up stagger-2" style={{ position: 'relative' }}>
              {/* Floating card mockup */}
              <div style={{
                background: 'var(--color-surface)',
                borderRadius: 'var(--radius-lg)',
                padding: 24,
                boxShadow: 'var(--shadow-xl)',
                border: '1px solid var(--color-border)',
                transform: 'rotate(-2deg)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 16 }}>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: '0.9375rem' }}>Senior Product Designer</p>
                    <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.8125rem' }}>Stripe • Remote</p>
                  </div>
                  <div style={{
                    background: 'var(--color-success)',
                    color: 'white',
                    borderRadius: 'var(--radius-full)',
                    padding: '4px 12px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                  }}>92%</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                  {['Figma', 'Design Systems', 'Prototyping', 'User Research'].map(skill => (
                    <span key={skill} style={{
                      background: 'var(--color-primary-light)',
                      color: 'var(--color-primary)',
                      padding: '3px 10px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: '0.6875rem',
                      fontWeight: 500,
                    }}>{skill}</span>
                  ))}
                </div>
                <div style={{ height: 6, background: 'var(--color-surface-alt)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: '92%', background: 'var(--color-success)', borderRadius: 3 }} />
                </div>
              </div>

              {/* Second floating card */}
              <div style={{
                position: 'absolute',
                bottom: -40,
                left: -20,
                background: 'var(--color-surface)',
                borderRadius: 'var(--radius-lg)',
                padding: 16,
                boxShadow: 'var(--shadow-lg)',
                border: '1px solid var(--color-border)',
                transform: 'rotate(3deg)',
                maxWidth: 220,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--color-primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--color-primary)"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Skills matched: 12/15</span>
                </div>
                <p style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)' }}>3 improvement suggestions ready</p>
              </div>
            </div>
          </div>

          <style>{`
            @media (max-width: 768px) {
              .hero-grid { grid-template-columns: 1fr !important; }
              .hero-grid > div:last-child { display: none; }
            }
          `}</style>
        </section>

        {/* ── How It Works ─────────────────────────────────── */}
        <section style={{ padding: '96px 0', background: 'var(--color-surface)' }}>
          <div className="container-main" style={{ textAlign: 'center', marginBottom: 64 }}>
            <h2 style={{ marginBottom: 12 }}>The smarter way to find work</h2>
            <p style={{ color: 'var(--color-text-secondary)', maxWidth: 520, margin: '0 auto', fontSize: '1.0625rem' }}>
              Three steps. From resume upload to optimized applications.
            </p>
          </div>

          <div className="container-main" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 32 }}>
            {[
              { step: '01', title: 'Upload', desc: 'Drop your resume or LinkedIn PDF. Our AI parses your experience across 50+ data points.', icon: '📄' },
              { step: '02', title: 'Analyze', desc: 'AI identifies your strengths, market gaps, and predicts role suitability with precision.', icon: '🔍' },
              { step: '03', title: 'Apply', desc: 'Receive a curated list of high-match jobs with AI-tailored optimization for each.', icon: '🚀' },
            ].map((item) => (
              <div key={item.step} className="card" style={{ textAlign: 'center', padding: '40px 32px', border: 'none', background: 'var(--color-bg)' }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 'var(--radius-lg)', background: 'var(--color-primary-light)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 20px',
                }}>{item.icon}</div>
                <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Step {item.step}</span>
                <h3 style={{ margin: '8px 0 12px', fontSize: '1.25rem' }}>{item.title}</h3>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', lineHeight: 1.7 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Features ─────────────────────────────────────── */}
        <section style={{ padding: '96px 0' }}>
          <div className="container-main">
            <div style={{ textAlign: 'center', marginBottom: 64 }}>
              <h2 style={{ marginBottom: 12 }}>Personalized matching that actually works</h2>
              <p style={{ color: 'var(--color-text-secondary)', maxWidth: 520, margin: '0 auto', fontSize: '1.0625rem' }}>
                Not just keyword matching — real AI understanding of your career trajectory.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
              {[
                { title: 'Two-Stage AI Matching', desc: 'Fast SQL filtering narrows 10,000+ jobs, then AI scores the best candidates for precision results.', accent: 'var(--color-primary)' },
                { title: 'Company Intelligence', desc: 'Firecrawl-powered research gives you insider knowledge about culture, tech stack, and hiring signals.', accent: 'var(--color-success)' },
                { title: 'Resume Optimization', desc: 'Get specific recommendations to tailor your resume for each role — keyword alignment, gap analysis, and more.', accent: 'var(--color-warning)' },
                { title: 'Skills Gap Analysis', desc: 'See exactly which skills match and which are missing, with actionable steps to close the gaps.', accent: 'var(--color-info)' },
                { title: 'Cost-Efficient AI', desc: '80% cost reduction through smart two-stage filtering. AI only scores pre-qualified candidates.', accent: 'var(--color-primary)' },
                { title: 'Explainable Scoring', desc: 'Every score comes with AI reasoning — understand exactly why you were matched, not just a number.', accent: 'var(--color-success)' },
              ].map((f) => (
                <div key={f.title} className="card" style={{ position: 'relative', overflow: 'hidden' }}>
                  <div style={{ width: 4, height: 40, background: f.accent, borderRadius: 2, position: 'absolute', left: 0, top: 24 }} />
                  <div style={{ paddingLeft: 12 }}>
                    <h4 style={{ marginBottom: 8 }}>{f.title}</h4>
                    <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.8125rem', lineHeight: 1.7 }}>{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA Section ──────────────────────────────────── */}
        <section style={{ padding: '80px 0', background: 'var(--color-text-primary)', color: 'white', textAlign: 'center' }}>
          <div className="container-main">
            <h2 style={{ color: 'white', marginBottom: 16, fontSize: '2.25rem' }}>
              Ready to stop searching and start applying?
            </h2>
            <p style={{ color: 'var(--color-text-tertiary)', maxWidth: 480, margin: '0 auto 32px', fontSize: '1.0625rem' }}>
              Upload your resume and let AI find the jobs worth your time.
            </p>
            <Link href="/dashboard/upload" className="btn btn-primary" style={{ padding: '16px 32px', fontSize: '1rem' }}>
              Get started — it&apos;s free
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </>
  )
}
