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
          <Link href="/" style={{ fontSize: '1.25rem', fontWeight: 800, color: '#135bec', textDecoration: 'none' }}>ResuScore</Link>
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
