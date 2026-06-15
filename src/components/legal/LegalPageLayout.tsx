import Link from 'next/link'
import type { ReactNode } from 'react'

export default function LegalPageLayout({
  title,
  lastUpdated,
  children,
}: {
  title: string
  lastUpdated: string
  children: ReactNode
}) {
  return (
    <main style={{ minHeight: '100vh', background: '#fff', color: '#0f172a' }}>
      <header style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
            <span style={{ position: 'relative', width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg, #135bec 0%, #2563eb 100%)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 8px -1px rgba(19,91,236,0.34)', flexShrink: 0 }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 18 L9 12 L13 15 L20 6" />
                <path d="M15 6 L20 6 L20 11" />
              </svg>
            </span>
            <span style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.025em' }}><span style={{ color: '#0f172a' }}>Job</span><span style={{ color: '#135bec' }}>Scorer</span></span>
          </Link>
          <nav style={{ display: 'flex', gap: 18, fontSize: '0.875rem' }}>
            <Link href="/legal/terms" style={{ color: '#475569', textDecoration: 'none' }}>Terms</Link>
            <Link href="/legal/privacy" style={{ color: '#475569', textDecoration: 'none' }}>Privacy</Link>
            <Link href="/legal/cookies" style={{ color: '#475569', textDecoration: 'none' }}>Cookies</Link>
          </nav>
        </div>
      </header>
      <article style={{ maxWidth: 820, margin: '0 auto', padding: '48px 24px 96px', lineHeight: 1.7 }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 8 }}>{title}</h1>
        <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: 40 }}>Last updated: {lastUpdated}</p>
        <div style={{ fontSize: '0.95rem', color: '#334155' }}>{children}</div>
      </article>
    </main>
  )
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>{heading}</h2>
      <div>{children}</div>
    </section>
  )
}
