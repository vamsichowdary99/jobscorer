'use client';

import { useEffect } from 'react';

export default function GlobalError({
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
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '24px',
          background: '#ffffff',
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
          Something went wrong
        </h1>
        <p style={{ fontSize: 15, color: '#64748b', maxWidth: 440, margin: '0 0 32px', lineHeight: 1.6 }}>
          A critical error occurred while loading the app. Please try again.
        </p>
        <button
          onClick={reset}
          style={{
            padding: '11px 22px', borderRadius: 99, background: '#135bec', color: '#fff',
            fontWeight: 600, fontSize: 14, border: 'none', cursor: 'pointer',
          }}
        >
          Try again
        </button>
        {error?.digest && (
          <p style={{ marginTop: 28, fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>
            Error ID: {error.digest}
          </p>
        )}
      </body>
    </html>
  );
}
