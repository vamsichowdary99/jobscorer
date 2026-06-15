import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '24px',
        background: '#ffffff',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      <Link
        href="/"
        style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: 40 }}
      >
        <span
          style={{
            position: 'relative',
            width: 36, height: 36, borderRadius: 9,
            background: 'linear-gradient(135deg, #135bec 0%, #2563eb 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 3px 8px -1px rgba(19,91,236,0.34)', flexShrink: 0,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 18 L9 12 L13 15 L20 6" />
            <path d="M15 6 L20 6 L20 11" />
          </svg>
        </span>
        <span style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", fontWeight: 800, fontSize: 18, letterSpacing: '-0.025em' }}>
          <span style={{ color: '#0f172a' }}>Job</span><span style={{ color: '#135bec' }}>Scorer</span>
        </span>
      </Link>

      <p
        style={{
          fontSize: 80, fontWeight: 800, lineHeight: 1, margin: 0,
          color: '#135bec', letterSpacing: '-0.04em',
        }}
      >
        404
      </p>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: '20px 0 8px' }}>
        This page wandered off
      </h1>
      <p style={{ fontSize: 15, color: '#64748b', maxWidth: 420, margin: '0 0 32px', lineHeight: 1.6 }}>
        The page you&apos;re looking for doesn&apos;t exist or may have moved. Let&apos;s get you back on track.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link
          href="/"
          style={{
            padding: '11px 22px', borderRadius: 99, background: '#135bec', color: '#fff',
            fontWeight: 600, fontSize: 14, textDecoration: 'none',
            boxShadow: '0 4px 14px -4px rgba(19,91,236,0.55)',
          }}
        >
          Back to home
        </Link>
        <Link
          href="/browse"
          style={{
            padding: '11px 22px', borderRadius: 99, background: '#f1f5f9', color: '#0f172a',
            fontWeight: 600, fontSize: 14, textDecoration: 'none', border: '1px solid #e2e8f0',
          }}
        >
          Browse jobs
        </Link>
      </div>
    </main>
  );
}
