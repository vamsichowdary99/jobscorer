'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { C, SANS, MONO } from './tokens';
import { fileToBase64 } from '@/lib/api';
import { setPendingUpload } from '@/lib/pendingResumeUpload';

const BADGES = ['ATS Analysis', 'AI Career Assessment', 'Skill Gap Detection', 'Real Job Matching', 'Project Roadmaps'];

const MAX_BYTES = 10 * 1024 * 1024;

function isResumeFile(f: File) {
  return f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf') || f.name.toLowerCase().endsWith('.docx');
}

const iconSx = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: C.primary, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const PROCESS: Array<{ label: string; icon: React.ReactElement }> = [
  { label: 'Upload Resume', icon: <svg {...iconSx}><path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 21h14" /></svg> },
  { label: 'AI Analysis', icon: <svg {...iconSx}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg> },
  { label: 'Find Skill Gaps', icon: <svg {...iconSx}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg> },
  { label: 'Build Projects', icon: <svg {...iconSx}><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" /></svg> },
  { label: 'Improve Resume', icon: <svg {...iconSx}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></svg> },
  { label: 'Apply With Confidence', icon: <svg {...iconSx}><circle cx="12" cy="12" r="10" /><path d="M9 12l2 2 4-4" /></svg> },
];

export default function Hero() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const acceptFile = (f: File | undefined | null) => {
    if (!f) return;
    if (!isResumeFile(f)) { setError('Please upload a PDF or DOCX file.'); return; }
    if (f.size > MAX_BYTES) { setError('That file is over 10MB — try a smaller export.'); return; }
    setError('');
    setFile(f);
  };

  const handleAnalyse = async () => {
    if (!file) return;
    setSubmitting(true);
    setError('');
    try {
      const base64 = await fileToBase64(file);
      setPendingUpload({ filename: file.name, mimeType: file.type || 'application/pdf', base64 });
      router.push('/signup');
    } catch {
      setError('Could not read that file — please try again.');
      setSubmitting(false);
    }
  };

  return (
    <section className="hero-section" style={{ padding: '128px 24px 72px', background: C.bg, overflow: 'hidden' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
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
          Stop applying blindly. Build the skills that get you hired.
        </h1>

        {/* Subhead */}
        <p className="fade-hero fh3" style={{ fontSize: 'clamp(1rem,2vw,1.125rem)', color: C.textSec, lineHeight: 1.7, maxWidth: 560, margin: '0 auto 36px' }}>
          Upload your resume. We&apos;ll find your skill gaps, hand you real portfolio projects to close them, rewrite your resume with the proof, and match you to jobs where you actually stand a chance.
        </p>

        {/* Upload dropzone */}
        <div className="fade-hero fh4" style={{ maxWidth: 560, margin: '0 auto' }}>
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); acceptFile(e.dataTransfer.files[0]); }}
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            role="button"
            tabIndex={0}
            aria-label="Upload your resume — PDF or DOCX"
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
            style={{
              border: `1.5px dashed ${dragging || hovering ? C.primary : C.border}`,
              borderRadius: 20,
              padding: file ? '20px 24px' : '44px 24px',
              textAlign: 'center',
              cursor: 'pointer',
              background: dragging ? C.primaryLight : 'white',
              boxShadow: dragging || hovering
                ? '0 12px 32px -10px rgba(19,91,236,0.22)'
                : '0 1px 2px rgba(15,23,42,0.04), 0 8px 20px -12px rgba(15,23,42,0.08)',
              transform: dragging || hovering ? 'translateY(-1px)' : 'none',
              transition: 'border-color .2s ease, background .2s ease, box-shadow .25s ease, transform .25s ease',
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx"
              onChange={e => acceptFile(e.target.files?.[0])}
              style={{ display: 'none' }}
            />
            {file ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: C.primaryLight, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></svg>
                </div>
                <div style={{ textAlign: 'left', minWidth: 0 }}>
                  <p style={{ fontWeight: 700, color: C.text, margin: 0, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</p>
                  <p style={{ fontSize: 12.5, color: C.success, margin: '2px 0 0', fontWeight: 600 }}>{(file.size / 1024 / 1024).toFixed(2)} MB · ready to analyse</p>
                </div>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setFile(null); setError(''); }}
                  aria-label="Remove file"
                  style={{ marginLeft: 4, width: 26, height: 26, borderRadius: '50%', border: 'none', background: C.surfaceAlt, color: C.textSec, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </div>
            ) : (
              <>
                <div style={{
                  width: 52, height: 52, borderRadius: 14, margin: '0 auto 16px',
                  background: dragging || hovering ? C.primary : C.primaryLight,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background .2s ease',
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={dragging || hovering ? 'white' : C.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 21h14" />
                  </svg>
                </div>
                <p style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: '0 0 4px' }}>
                  Drop your resume here
                </p>
                <p style={{ fontSize: 13.5, color: C.textSec, margin: 0 }}>
                  or <span style={{ color: C.primary, fontWeight: 600 }}>choose a file</span> · PDF or DOCX, up to 10MB
                </p>
              </>
            )}
          </div>
          {error && <p style={{ color: '#ef4444', fontSize: 13, marginTop: 10, textAlign: 'center' }}>{error}</p>}
        </div>

        {/* CTA */}
        <div className="fade-hero" style={{ maxWidth: 560, margin: '20px auto 0' }}>
          <button
            type="button"
            onClick={() => { if (!file) { inputRef.current?.click(); } else { handleAnalyse(); } }}
            disabled={submitting}
            style={{
              display: 'flex',
              width: '100%',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: '16px 32px',
              background: C.primary,
              color: 'white',
              border: 'none',
              borderRadius: 10,
              fontSize: 16,
              fontWeight: 700,
              fontFamily: SANS,
              cursor: submitting ? 'default' : 'pointer',
              opacity: submitting ? 0.75 : 1,
              boxShadow: `0 8px 24px -6px rgba(19,91,236,0.45)`,
              transition: 'all .2s ease',
            }}
            onMouseEnter={e => { if (!submitting) e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}
          >
            {submitting ? 'Preparing your analysis…' : 'Analyse my resume — free'}
            {!submitting && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>}
          </button>

          {/* Microlines */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: C.textSec, display: 'flex', alignItems: 'center', gap: 5 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.success} strokeWidth="2.2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              We never share your resume
            </span>
            <span style={{ fontSize: 13, color: C.textTer }}>·</span>
            <span style={{ fontSize: 13, color: C.textSec }}>No credit card required</span>
          </div>

          {/* Quiet secondary */}
          <div style={{ marginTop: 14, textAlign: 'center' }}>
            <a href="#demo" style={{ fontSize: 14, color: C.primary, textDecoration: 'underline', textUnderlineOffset: 3, fontWeight: 500, textDecorationColor: `${C.primary}55` }}>
              See a sample analysis →
            </a>
          </div>
        </div>

        {/* Feature badges */}
        <div className="fade-hero fh5 hero-badges" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 28 }}>
          {BADGES.map(b => (
            <span
              key={b}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                borderRadius: 999,
                background: 'white',
                border: `1px solid ${C.border}`,
                fontSize: 13.5,
                fontWeight: 500,
                color: C.textSec,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.success} strokeWidth="2.5" strokeLinecap="round"><path d="M5 13l4 4L19 7" /></svg>
              {b}
            </span>
          ))}
        </div>
      </div>

      {/* Process strip */}
      <div className="fade-hero fh5" style={{ maxWidth: 1040, margin: '40px auto 0' }}>
        <div
          className="hero-process-strip"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            flexWrap: 'wrap',
            rowGap: 24,
            background: 'white',
            borderRadius: 20,
            border: `1px solid ${C.border}`,
            boxShadow: '0 4px 24px rgba(15,23,42,0.05)',
            padding: '28px 24px',
          }}
        >
          {PROCESS.map((step, i) => (
            <div key={step.label} className="hero-process-step-wrap" style={{ display: 'flex', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: 108, textAlign: 'center' }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: C.primaryLight, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {step.icon}
                </div>
                <span style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>{step.label}</span>
              </div>
              {i < PROCESS.length - 1 && (
                <div className="hero-process-arrow" style={{ width: 24, marginTop: 18, flexShrink: 0 }}>
                  <svg width="24" height="14" viewBox="0 0 24 14" fill="none" stroke={C.textTer} strokeWidth="1.8" strokeLinecap="round"><path d="M2 7h19M15 1l6 6-6 6" /></svg>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
