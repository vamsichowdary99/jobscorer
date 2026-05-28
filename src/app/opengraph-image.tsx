import { ImageResponse } from 'next/og';

export const alt = 'ResuScore — AI-Powered Job Matching & Resume Optimization';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background: '#ffffff',
          backgroundImage:
            'radial-gradient(circle at 90% 10%, rgba(19,91,236,0.10), transparent 45%)',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 48 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background: '#135bec',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 40,
              fontWeight: 800,
            }}
          >
            R
          </div>
          <div style={{ fontSize: 38, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' }}>
            ResuScore
          </div>
        </div>

        <div
          style={{
            fontSize: 64,
            fontWeight: 800,
            color: '#0f172a',
            lineHeight: 1.1,
            letterSpacing: '-0.03em',
            maxWidth: 900,
          }}
        >
          AI-Powered Job Matching &amp; Resume Optimization
        </div>

        <div style={{ fontSize: 30, color: '#64748b', marginTop: 28, maxWidth: 820, lineHeight: 1.4 }}>
          Upload your resume, discover jobs, and get AI-scored matches. Stop searching, start matching.
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 'auto',
            paddingTop: 40,
            fontSize: 24,
            fontWeight: 600,
            color: '#135bec',
          }}
        >
          resuscore.app
        </div>
      </div>
    ),
    { ...size },
  );
}
