'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { C, SANS } from './tokens';

export default function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [stickyCta, setStickyCta] = useState(false);

  useEffect(() => {
    const fn = () => {
      setScrolled(window.scrollY > 80);
      setStickyCta(window.scrollY > 600);
    };
    window.addEventListener('scroll', fn, { passive: true });
    fn();
    return () => window.removeEventListener('scroll', fn);
  }, []);

  const navLinks: Array<[string, string]> = [
    ['Browse Jobs', '/browse'],
    ['How it works', '#how'],
    ['Pricing', '#pricing'],
  ];

  return (
    <nav
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 200,
        height: 64,
        display: 'flex',
        alignItems: 'center',
        padding: '0 32px',
        background: scrolled ? 'rgba(248,250,252,.9)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: `1px solid ${scrolled ? C.border : 'transparent'}`,
        transition: 'all 0.25s ease',
      }}
    >
      <div style={{ maxWidth: 1200, width: '100%', margin: '0 auto', display: 'flex', alignItems: 'center' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', marginRight: 40 }}>
          <div style={{ position: 'relative', width: 32, height: 32, borderRadius: 9, background: `linear-gradient(135deg, ${C.primary} 0%, #2563eb 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 3px 8px -1px ${C.primary}55` }}>
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {navLinks.map(([label, href]) => {
            const isHash = href.startsWith('#');
            const linkStyle: React.CSSProperties = {
              padding: '7px 13px',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: C.textSec,
              textDecoration: 'none',
              borderRadius: 7,
              transition: 'all 0.15s',
            };
            const onMouseEnter = (e: React.MouseEvent<HTMLAnchorElement>) => {
              e.currentTarget.style.color = C.text;
              e.currentTarget.style.background = 'rgba(15,23,42,.05)';
            };
            const onMouseLeave = (e: React.MouseEvent<HTMLAnchorElement>) => {
              e.currentTarget.style.color = C.textSec;
              e.currentTarget.style.background = 'transparent';
            };
            return isHash ? (
              <a key={label} href={href} style={linkStyle} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>{label}</a>
            ) : (
              <Link key={label} href={href} style={linkStyle} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>{label}</Link>
            );
          })}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {stickyCta && (
            <Link
              href="/signup"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                background: C.primary,
                color: 'white',
                borderRadius: 7,
                fontSize: '0.8125rem',
                fontWeight: 600,
                textDecoration: 'none',
                animation: 'jsFadeUp 0.3s ease both',
              }}
            >
              Upload resume
            </Link>
          )}
          <Link href="/login" style={{ padding: '8px 13px', fontSize: '0.875rem', fontWeight: 500, color: C.textSec, textDecoration: 'none', borderRadius: 7 }}>
            Sign in
          </Link>
          {!stickyCta && (
            <Link
              href="/signup"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '9px 18px',
                background: C.primary,
                color: 'white',
                borderRadius: 7,
                fontSize: '0.875rem',
                fontWeight: 600,
                textDecoration: 'none',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = C.primaryHover; }}
              onMouseLeave={e => { e.currentTarget.style.background = C.primary; }}
            >
              Upload resume
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
