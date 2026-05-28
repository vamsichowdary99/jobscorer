'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

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
      <span
        style={{
          width: 36, height: 36, borderRadius: 9, background: '#135bec',
          display: 'grid', placeItems: 'center', color: '#fff',
          fontWeight: 800, fontSize: 16, marginBottom: 40,
          boxShadow: '0 1px 3px rgba(19,91,236,0.22)',
        }}
      >
        R
      </span>

      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
        Something went wrong
      </h1>
      <p style={{ fontSize: 15, color: '#64748b', maxWidth: 440, margin: '0 0 32px', lineHeight: 1.6 }}>
        An unexpected error occurred. You can try again, or head back home if the problem persists.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          onClick={reset}
          style={{
            padding: '11px 22px', borderRadius: 99, background: '#135bec', color: '#fff',
            fontWeight: 600, fontSize: 14, border: 'none', cursor: 'pointer',
            boxShadow: '0 4px 14px -4px rgba(19,91,236,0.55)',
          }}
        >
          Try again
        </button>
        <Link
          href="/"
          style={{
            padding: '11px 22px', borderRadius: 99, background: '#f1f5f9', color: '#0f172a',
            fontWeight: 600, fontSize: 14, textDecoration: 'none', border: '1px solid #e2e8f0',
          }}
        >
          Back to home
        </Link>
      </div>

      {error?.digest && (
        <p style={{ marginTop: 28, fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>
          Error ID: {error.digest}
        </p>
      )}
    </main>
  );
}
