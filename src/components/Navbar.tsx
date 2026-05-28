'use client'

import Link from 'next/link'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/components/providers/AuthProvider'

const navLinks = [
    {
        href: '/dashboard',
        label: 'Dashboard',
        icon: (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="3" y="3" width="7" height="7" rx="1.5"/>
                <rect x="14" y="3" width="7" height="7" rx="1.5"/>
                <rect x="3" y="14" width="7" height="7" rx="1.5"/>
                <rect x="14" y="14" width="7" height="7" rx="1.5"/>
            </svg>
        ),
    },
    {
        href: '/dashboard/upload',
        label: 'Upload',
        icon: (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="12" y1="18" x2="12" y2="12"/>
                <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
        ),
    },
    {
        href: '/dashboard/search',
        label: 'Search Jobs',
        icon: (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
        ),
    },
    {
        href: '/dashboard/matches',
        label: 'AI Matches',
        icon: (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="12" cy="12" r="10"/>
                <circle cx="12" cy="12" r="6"/>
                <circle cx="12" cy="12" r="2"/>
            </svg>
        ),
    },
    {
        href: '/dashboard/chat',
        label: 'AI Chat',
        icon: (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>
            </svg>
        ),
    },
    {
        href: '/dashboard/research',
        label: 'Company Intel',
        icon: (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M3 21h18M3 7v14M21 7v14M9 3h6v4H9z"/>
            </svg>
        ),
    },
    {
        href: '/dashboard/optimize',
        label: 'Optimize',
        icon: (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
        ),
    },
    {
        href: '/dashboard/resumes',
        label: 'Resumes',
        icon: (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <line x1="10" y1="9" x2="8" y2="9"/>
            </svg>
        ),
    },
    {
        href: '/dashboard/learning',
        label: 'Learning Paths',
        icon: (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
        ),
    },
    {
        href: '/dashboard/applications',
        label: 'Tracker',
        icon: (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M3 10h18M9 4v16" />
            </svg>
        ),
    },
]

export default function Navbar() {
    const [mobileOpen, setMobileOpen] = useState(false)
    const { user, signOut } = useAuth()
    const pathname = usePathname()

    const isDashboard = pathname?.startsWith('/dashboard')

    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

                /* ── Shell ── */
                .rs-nav {
                    position: fixed;
                    top: 0; left: 0; right: 0;
                    z-index: 50;
                    height: 64px;
                    background: #fff;
                    border-bottom: 1px solid #e2e8f0;
                    display: flex;
                    align-items: center;
                    padding: 0 28px;
                    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
                }

                /* ── Logo ── */
                .rs-logo {
                    display: flex;
                    align-items: center;
                    text-decoration: none;
                    flex-shrink: 0;
                }
                .rs-logo-mark {
                    width: 32px; height: 32px;
                    border-radius: 8px;
                    background: #135bec;
                    display: grid; place-items: center;
                    color: #fff;
                    font-family: 'Plus Jakarta Sans', sans-serif;
                    font-weight: 800;
                    font-size: 14px;
                    box-shadow: 0 1px 3px rgba(19,91,236,0.22);
                    flex-shrink: 0;
                    user-select: none;
                }
                .rs-logo-text {
                    margin-left: 10px;
                    font-family: 'Plus Jakarta Sans', sans-serif;
                    font-weight: 700;
                    font-size: 16px;
                    color: #0f172a;
                    letter-spacing: -0.02em;
                    white-space: nowrap;
                }

                /* ── Centre nav (text-only, underline-on-active) ── */
                .rs-nav-center {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 4px;
                }

                .rs-nav-item {
                    position: relative;
                    display: inline-flex;
                    align-items: center;
                    padding: 8px 12px;
                    border-radius: 8px;
                    font-family: 'Plus Jakarta Sans', sans-serif;
                    font-size: 13.5px;
                    font-weight: 500;
                    text-decoration: none;
                    color: #475569;
                    background: none;
                    border: none;
                    cursor: pointer;
                    white-space: nowrap;
                    letter-spacing: -0.005em;
                    transition: color 0.14s ease, background 0.14s ease;
                }
                /* Icons in nav items are decorative noise at this density; hide them */
                .rs-nav-item svg { display: none; }
                .rs-nav-item:hover {
                    color: #0f172a;
                    background: #f1f5f9;
                }
                .rs-nav-item.active {
                    color: #135bec;
                    font-weight: 600;
                    background: transparent;
                }
                .rs-nav-item.active::after {
                    content: '';
                    position: absolute;
                    left: 12px; right: 12px; bottom: -16px;
                    height: 2px;
                    background: #135bec;
                    border-radius: 2px;
                }
                .rs-nav-item.active:hover {
                    background: #f1f5f9;
                }
                .rs-nav-item:focus-visible {
                    outline: 2px solid #135bec;
                    outline-offset: 2px;
                }
                /* Compress slightly on narrower viewports — keeps everything visible without scroll */
                @media (max-width: 1380px) {
                    .rs-nav-item { padding: 8px 9px; font-size: 13px; }
                }

                /* ── Right side (inline avatar + email + divider + sign out) ── */
                .rs-nav-right {
                    display: flex;
                    align-items: center;
                    gap: 3px;
                    flex-shrink: 0;
                }
                .rs-user {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 4px 8px 4px 4px;
                    border-radius: 99px;
                    text-decoration: none;
                    transition: background 0.13s ease;
                    cursor: pointer;
                }
                .rs-user:hover { background: #f1f5f9; }
                .rs-user-avatar {
                    width: 28px; height: 28px;
                    border-radius: 50%;
                    background: #135bec;
                    display: grid; place-items: center;
                    color: #fff;
                    font-family: 'Plus Jakarta Sans', sans-serif;
                    font-size: 11px;
                    font-weight: 700;
                    flex-shrink: 0;
                }
                .rs-user-email {
                    font-family: 'Plus Jakarta Sans', sans-serif;
                    font-size: 13px;
                    font-weight: 500;
                    color: #0f172a;
                    letter-spacing: -0.01em;
                    white-space: nowrap;
                    max-width: 180px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                /* Hide the email at narrower widths — the avatar alone is enough identification */
                @media (max-width: 1380px) {
                    .rs-user-email { display: none; }
                    .rs-user { padding: 4px; }
                }
                .rs-divider {
                    width: 1px;
                    height: 22px;
                    background: #e2e8f0;
                    flex-shrink: 0;
                    margin: 0 12px;
                }
                @media (max-width: 1380px) {
                    .rs-divider { margin: 0 8px; }
                }
                .rs-signout-btn {
                    font-family: 'Plus Jakarta Sans', sans-serif;
                    font-size: 13px;
                    font-weight: 500;
                    color: #64748b;
                    background: none;
                    border: none;
                    cursor: pointer;
                    padding: 0;
                    transition: color 0.12s ease;
                }
                .rs-signout-btn:hover {
                    color: #dc2626;
                }

                /* ── Public nav ── */
                .rs-nav-public {
                    display: flex; align-items: center; gap: 4px;
                }
                .rs-nav-public a {
                    font-family: 'Plus Jakarta Sans', sans-serif;
                    font-size: 13.5px; font-weight: 500;
                    color: #64748b; text-decoration: none;
                    padding: 7px 14px;
                    border-radius: 99px;
                    transition: background 0.13s ease, color 0.12s ease;
                }
                .rs-nav-public a:hover {
                    color: #0f172a;
                    background: #f1f5f9;
                }

                /* ── Signup CTA ── */
                .rs-cta-btn {
                    font-family: 'Plus Jakarta Sans', sans-serif;
                    font-size: 13px;
                    font-weight: 600;
                    padding: 7px 16px;
                    border-radius: 99px;
                    background: #135bec;
                    color: #fff;
                    text-decoration: none;
                    display: inline-flex;
                    align-items: center;
                    gap: 5px;
                    box-shadow: 0 4px 14px -4px rgba(19,91,236,0.55);
                    transition: background 0.13s ease, box-shadow 0.13s ease;
                    letter-spacing: -0.01em;
                }
                .rs-cta-btn:hover {
                    background: #0f4cc7;
                    box-shadow: 0 6px 18px -4px rgba(19,91,236,0.65);
                }
                .rs-cta-btn svg { opacity: 0.9; }

                /* ── Mobile toggle ── */
                .rs-mobile-toggle {
                    display: none;
                    background: none; border: none; cursor: pointer;
                    padding: 7px; color: #475569;
                    border-radius: 8px;
                    transition: background 0.12s ease;
                }
                .rs-mobile-toggle:hover { background: #f1f5f9; }

                /* ── Mobile menu ── */
                .rs-mobile-menu {
                    position: fixed; top: 64px; left: 0; right: 0; z-index: 49;
                    background: #fff;
                    border-bottom: 1px solid #e2e8f0;
                    padding: 10px 14px 14px;
                    display: flex; flex-direction: column; gap: 2px;
                    box-shadow: 0 12px 32px rgba(15,23,42,0.08);
                }
                .rs-mobile-link {
                    display: flex; align-items: center; gap: 10px;
                    padding: 10px 14px; border-radius: 10px;
                    font-family: 'Plus Jakarta Sans', sans-serif;
                    font-size: 14px; font-weight: 500;
                    color: #475569; text-decoration: none;
                    transition: background 0.12s ease, color 0.12s ease;
                }
                .rs-mobile-link:hover { background: #f1f5f9; color: #0f172a; }
                .rs-mobile-link.active {
                    background: #135bec;
                    color: #fff;
                    font-weight: 600;
                }
                .rs-mobile-link.active svg { color: #fff; opacity: 1; }

                @media (max-width: 1024px) {
                    .rs-nav-center { display: none; }
                    .rs-mobile-toggle { display: flex !important; align-items: center; }
                }
                @media (max-width: 640px) {
                    .rs-user-email { display: none; }
                    .rs-divider { display: none; }
                }
            `}</style>

            <nav className="rs-nav">
                {/* Logo */}
                <Link href="/" className="rs-logo">
                    <div className="rs-logo-mark">R</div>
                    <span className="rs-logo-text">ResuScore</span>
                </Link>

                {/* Centre: individual nav items (Antler-style) */}
                <div className="rs-nav-center">
                    {isDashboard ? (
                        navLinks.map((link) => {
                            const active = pathname === link.href
                            return (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className={`rs-nav-item${active ? ' active' : ''}`}
                                >
                                    {link.icon}
                                    {link.label}
                                </Link>
                            )
                        })
                    ) : (
                        <nav className="rs-nav-public">
                            <Link href="/browse">Browse Jobs</Link>
                            <Link href="/login">Login</Link>
                        </nav>
                    )}
                </div>

                {/* Right: auth */}
                <div className="rs-nav-right">
                    {user ? (
                        <>
                            <Link href="/dashboard/settings" className="rs-user" title="Settings">
                                <div className="rs-user-avatar">
                                    {user.email?.[0]?.toUpperCase() ?? 'U'}
                                </div>
                                <span className="rs-user-email">{user.email}</span>
                            </Link>
                            <div className="rs-divider" />
                            <button className="rs-signout-btn" onClick={signOut}>Sign Out</button>
                        </>
                    ) : (
                        <>
                            <Link href="/login" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 13, fontWeight: 500, color: '#64748b', textDecoration: 'none', padding: '7px 14px', borderRadius: 99 }}>Login</Link>
                            <Link href="/signup" className="rs-cta-btn">
                                Sign Up
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M7 17L17 7M7 7h10v10"/>
                                </svg>
                            </Link>
                        </>
                    )}

                    {/* Mobile hamburger */}
                    <button
                        className="rs-mobile-toggle"
                        onClick={() => setMobileOpen(!mobileOpen)}
                        aria-label="Toggle navigation"
                    >
                        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            {mobileOpen
                                ? <path d="M6 18L18 6M6 6l12 12"/>
                                : <path d="M3 12h18M3 6h18M3 18h18"/>}
                        </svg>
                    </button>
                </div>
            </nav>

            {/* Mobile dropdown */}
            {mobileOpen && (
                <div className="rs-mobile-menu">
                    {(isDashboard ? navLinks : [
                        { href: '/browse', label: 'Browse Jobs', icon: null },
                        { href: '/login', label: 'Login', icon: null },
                    ]).map((link) => {
                        const active = pathname === link.href
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`rs-mobile-link${active ? ' active' : ''}`}
                                onClick={() => setMobileOpen(false)}
                            >
                                {link.icon}
                                {link.label}
                            </Link>
                        )
                    })}
                    {user && (
                        <div style={{ marginTop: 8, paddingTop: 10, borderTop: '1px solid #e2e8f0' }}>
                            <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 12, color: '#94a3b8', paddingLeft: 14 }}>{user.email}</span>
                            <button
                                onClick={signOut}
                                style={{ display: 'block', width: '100%', textAlign: 'left', marginTop: 4, padding: '10px 14px', fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 14, fontWeight: 600, color: '#dc2626', background: 'none', border: 'none', borderRadius: 10, cursor: 'pointer' }}
                            >
                                Sign Out
                            </button>
                        </div>
                    )}
                </div>
            )}
        </>
    )
}
