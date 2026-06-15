'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { C, SANS } from './tokens';

export default function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [stickyCta, setStickyCta] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const fn = () => {
      setScrolled(window.scrollY > 80);
      setStickyCta(window.scrollY > 600);
    };
    window.addEventListener('scroll', fn, { passive: true });
    fn();
    return () => window.removeEventListener('scroll', fn);
  }, []);

  // Close mobile menu on any scroll (user navigating via hash link)
  useEffect(() => {
    if (!mobileOpen) return;
    const close = () => setMobileOpen(false);
    window.addEventListener('scroll', close, { once: true, passive: true });
    return () => window.removeEventListener('scroll', close);
  }, [mobileOpen]);

  const navLinks: Array<[string, string]> = [
    ['Browse Jobs', '/browse'],
    ['How it works', '#how'],
    ['Pricing', '#pricing'],
  ];

  const linkStyle: React.CSSProperties = {
    padding: '7px 13px',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: C.textSec,
    textDecoration: 'none',
    borderRadius: 7,
    transition: 'all 0.15s',
  };

  const onEnter = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.currentTarget.style.color = C.text;
    e.currentTarget.style.background = 'rgba(15,23,42,.05)';
  };
  const onLeave = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.currentTarget.style.color = C.textSec;
    e.currentTarget.style.background = 'transparent';
  };

  return (
    <>
      <style>{`
        .ln-center { display: flex; align-items: center; gap: 2px; }
        .ln-right  { display: flex; align-items: center; gap: 8px; margin-left: auto; }
        .ln-hamburger {
          display: none;
          margin-left: auto;
          background: none; border: none; cursor: pointer;
          padding: 8px; color: #475569; border-radius: 8px;
          transition: background 0.12s ease;
          align-items: center;
        }
        .ln-hamburger:hover { background: rgba(15,23,42,0.06); }
        .ln-mobile-menu {
          display: none;
          position: fixed; top: 64px; left: 0; right: 0; z-index: 199;
          background: #fff; border-bottom: 1px solid #e2e8f0;
          padding: 10px 16px 16px;
          flex-direction: column; gap: 3px;
          box-shadow: 0 12px 32px rgba(15,23,42,0.10);
        }
        .ln-mobile-menu.open { display: flex; }
        .ln-mobile-link {
          display: flex; align-items: center;
          padding: 11px 14px; border-radius: 10px;
          font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
          font-size: 15px; font-weight: 500;
          color: #475569; text-decoration: none;
          transition: background 0.12s, color 0.12s;
        }
        .ln-mobile-link:hover { background: #f1f5f9; color: #0f172a; }
        .ln-mobile-divider { height: 1px; background: #e2e8f0; margin: 8px 0; }
        .ln-mobile-cta {
          display: flex; align-items: center; justify-content: center;
          margin-top: 4px; padding: 13px 14px; border-radius: 10px;
          font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
          font-size: 15px; font-weight: 700;
          background: #135bec; color: #fff; text-decoration: none;
          transition: background 0.15s;
        }
        .ln-mobile-cta:hover { background: #0f4cc7; }
        @media (max-width: 768px) {
          .ln-center    { display: none !important; }
          .ln-right     { display: none !important; }
          .ln-hamburger { display: flex !important; }
        }
      `}</style>

      <nav
        style={{
          position: 'fixed',
          top: 0, left: 0, right: 0,
          zIndex: 200,
          height: 64,
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          background: scrolled ? 'rgba(248,250,252,.9)' : 'transparent',
          backdropFilter: scrolled ? 'blur(12px)' : 'none',
          WebkitBackdropFilter: scrolled ? 'blur(12px)' : 'none',
          borderBottom: `1px solid ${scrolled ? C.border : 'transparent'}`,
          transition: 'all 0.25s ease',
        }}
      >
        <div style={{ maxWidth: 1200, width: '100%', margin: '0 auto', display: 'flex', alignItems: 'center' }}>
          {/* Logo */}
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', marginRight: 40, flexShrink: 0 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: `linear-gradient(135deg, ${C.primary} 0%, #2563eb 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 3px 8px -1px ${C.primary}55` }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 18 L9 12 L13 15 L20 6" />
                <path d="M15 6 L20 6 L20 11" />
              </svg>
            </div>
            <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: '1.1875rem', letterSpacing: '-0.025em' }}>
              <span style={{ color: C.text }}>Job</span>
              <span style={{ color: C.primary }}>Scorer</span>
            </span>
          </Link>

          {/* Desktop center nav */}
          <div className="ln-center">
            {navLinks.map(([label, href]) =>
              href.startsWith('#') ? (
                <a key={label} href={href} style={linkStyle} onMouseEnter={onEnter} onMouseLeave={onLeave}>{label}</a>
              ) : (
                <Link key={label} href={href} style={linkStyle} onMouseEnter={onEnter} onMouseLeave={onLeave}>{label}</Link>
              )
            )}
          </div>

          {/* Desktop right */}
          <div className="ln-right">
            {stickyCta && (
              <Link href="/signup" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: C.primary, color: 'white', borderRadius: 7, fontSize: '0.8125rem', fontWeight: 600, textDecoration: 'none', animation: 'jsFadeUp 0.3s ease both' }}>
                Upload resume
              </Link>
            )}
            <Link href="/login" style={{ padding: '8px 13px', fontSize: '0.875rem', fontWeight: 500, color: C.textSec, textDecoration: 'none', borderRadius: 7 }}>
              Sign in
            </Link>
            {!stickyCta && (
              <Link
                href="/signup"
                style={{ display: 'inline-flex', alignItems: 'center', padding: '9px 18px', background: C.primary, color: 'white', borderRadius: 7, fontSize: '0.875rem', fontWeight: 600, textDecoration: 'none', transition: 'background 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = C.primaryHover; }}
                onMouseLeave={e => { e.currentTarget.style.background = C.primary; }}
              >
                Upload resume
              </Link>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="ln-hamburger"
            aria-label="Toggle navigation"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(o => !o)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              {mobileOpen
                ? <path d="M6 18L18 6M6 6l12 12" />
                : <path d="M3 12h18M3 6h18M3 18h18" />}
            </svg>
          </button>
        </div>
      </nav>

      {/* Mobile dropdown */}
      <div className={`ln-mobile-menu${mobileOpen ? ' open' : ''}`} role="navigation" aria-label="Mobile navigation">
        {navLinks.map(([label, href]) =>
          href.startsWith('#') ? (
            <a key={label} href={href} className="ln-mobile-link" onClick={() => setMobileOpen(false)}>{label}</a>
          ) : (
            <Link key={label} href={href} className="ln-mobile-link" onClick={() => setMobileOpen(false)}>{label}</Link>
          )
        )}
        <div className="ln-mobile-divider" />
        <Link href="/login" className="ln-mobile-link" onClick={() => setMobileOpen(false)}>Sign in</Link>
        <Link href="/signup" className="ln-mobile-cta" onClick={() => setMobileOpen(false)}>
          Upload resume — free
        </Link>
      </div>
    </>
  );
}
