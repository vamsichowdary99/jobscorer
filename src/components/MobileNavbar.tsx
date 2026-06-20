'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/components/providers/AuthProvider'

// ── Nav link definitions (mirrors desktop Navbar, with full labels) ──
const NAV_LINKS = [
    {
        href: '/dashboard',
        label: 'Dashboard',
        icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <rect x="3" y="3" width="7" height="7" rx="1.5"/>
                <rect x="14" y="3" width="7" height="7" rx="1.5"/>
                <rect x="3" y="14" width="7" height="7" rx="1.5"/>
                <rect x="14" y="14" width="7" height="7" rx="1.5"/>
            </svg>
        ),
    },
    {
        href: '/dashboard/upload',
        label: 'Upload Resume',
        icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
        ),
    },
    {
        href: '/dashboard/matches',
        label: 'AI Matches',
        icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
        ),
    },
    {
        href: '/dashboard/research',
        label: 'Company Intel',
        icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M3 21h18M3 7v14M21 7v14M9 3h6v4H9z"/>
            </svg>
        ),
    },
    {
        href: '/dashboard/optimize',
        label: 'Optimize Resume',
        icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
        ),
    },
    {
        href: '/dashboard/resumes',
        label: 'Resumes',
        icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
        ),
    },
    {
        href: '/dashboard/learning',
        label: 'Learning Paths',
        icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/>
                <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>
            </svg>
        ),
    },
    {
        href: '/dashboard/applications',
        label: 'App Tracker',
        icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <rect x="3" y="4" width="18" height="16" rx="2"/>
                <path d="M3 10h18M9 4v16"/>
            </svg>
        ),
    },
    {
        href: '/dashboard/settings',
        label: 'Settings',
        icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
        ),
    },
]

function isActive(pathname: string | null, href: string): boolean {
    if (!pathname) return false
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname === href || pathname.startsWith(href + '/')
}

// ── Logo mark SVG (chart/trend icon) ──
function LogoMark() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 18L9 12L13 15L20 6"/>
            <path d="M15 6L20 6L20 11"/>
        </svg>
    )
}

export default function MobileNavbar() {
    const [open, setOpen] = useState(false)
    const { user, signOut } = useAuth()
    const pathname = usePathname()

    const initial = (user?.email ?? 'U')[0].toUpperCase()
    const name = user?.email?.split('@')[0] ?? 'User'
    const email = user?.email ?? ''

    const close = () => setOpen(false)

    // Lock body scroll when drawer is open; close on ESC
    useEffect(() => {
        if (!open) return
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
        document.addEventListener('keydown', onKey)
        return () => {
            document.body.style.overflow = prev
            document.removeEventListener('keydown', onKey)
        }
    }, [open])

    return (
        <>
            {/* ── Dark overlay ── */}
            <div
                aria-hidden="true"
                onClick={close}
                style={{
                    ...S.overlay,
                    opacity: open ? 1 : 0,
                    pointerEvents: open ? 'auto' : 'none',
                }}
            />

            {/* ── Right-side drawer (280px) ── */}
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Navigation menu"
                style={{
                    ...S.drawer,
                    right: open ? 0 : -290,
                }}
            >
                {/* Drawer header */}
                <div style={S.drawerHead}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={S.logoMark}><LogoMark /></div>
                        <span style={S.wordmark}>
                            Job<b style={{ color: '#135bec', fontWeight: 800 }}>Scorer</b>
                        </span>
                    </div>
                    <button onClick={close} style={S.closeBtn} aria-label="Close menu">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    </button>
                </div>

                {/* Nav links */}
                <nav style={S.drawerLinks}>
                    {NAV_LINKS.map(link => {
                        const active = isActive(pathname, link.href)
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                onClick={close}
                                style={{
                                    ...S.dlink,
                                    ...(active ? S.dlinkActive : {}),
                                }}
                            >
                                <div style={{
                                    ...S.dicon,
                                    ...(active ? S.diconActive : {}),
                                }}>
                                    {link.icon}
                                </div>
                                {link.label}
                            </Link>
                        )
                    })}
                </nav>

                {/* Drawer footer: user info + sign out */}
                <div style={S.drawerFoot}>
                    <div style={S.drawerUser}>
                        <div style={{ ...S.avatar, width: 34, height: 34, fontSize: 13 }}>{initial}</div>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {name}
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {email}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={() => { close(); signOut() }}
                        style={S.signOutBtn}
                    >
                        Sign Out
                    </button>
                </div>
            </div>

            {/* ── Sticky top navbar (64px — matches DashboardLayout paddingTop) ── */}
            <nav style={S.navbar}>
                <Link href="/dashboard" style={S.navLogo} onClick={close}>
                    <div style={S.logoMark}><LogoMark /></div>
                    <span style={S.wordmark}>
                        Job<b style={{ color: '#135bec', fontWeight: 800 }}>Scorer</b>
                    </span>
                </Link>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
                    <div style={S.avatar}>{initial}</div>
                    <button
                        onClick={() => setOpen(o => !o)}
                        style={S.hamburger}
                        aria-label="Open navigation menu"
                        aria-expanded={open}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="3" y1="6" x2="21" y2="6" />
                            <line x1="3" y1="12" x2="21" y2="12" />
                            <line x1="3" y1="18" x2="21" y2="18" />
                        </svg>
                    </button>
                </div>
            </nav>
        </>
    )
}

/* ── Styles ── */
const S: Record<string, CSSProperties> = {
    navbar: {
        position: 'fixed',
        top: 0, left: 0, right: 0,
        zIndex: 40,
        height: 64,
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 10,
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        boxSizing: 'border-box',
    },
    navLogo: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        textDecoration: 'none',
        flex: 1,
    },
    logoMark: {
        width: 30,
        height: 30,
        borderRadius: 9,
        background: 'linear-gradient(135deg, #135bec, #2563eb)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 3px 8px -1px rgba(19,91,236,0.33)',
        flexShrink: 0,
    },
    wordmark: {
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        fontWeight: 800,
        fontSize: 16,
        letterSpacing: '-0.025em',
        color: '#0f172a',
    },
    avatar: {
        width: 30,
        height: 30,
        borderRadius: '50%',
        background: '#135bec',
        color: '#ffffff',
        fontSize: 13,
        fontWeight: 800,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        lineHeight: 1,
        userSelect: 'none',
    },
    hamburger: {
        width: 36,
        height: 36,
        borderRadius: 10,
        background: '#f1f5f9',
        border: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#0f172a',
        cursor: 'pointer',
        flexShrink: 0,
        padding: 0,
    },
    overlay: {
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(15,23,42,0.5)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        transition: 'opacity 0.28s ease',
    },
    drawer: {
        position: 'fixed',
        top: 0,
        zIndex: 70,
        width: 280,
        height: '100%',
        background: '#fff',
        boxShadow: '-8px 0 40px rgba(15,23,42,0.2)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'right 0.28s cubic-bezier(0.32, 0.72, 0.2, 1)',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    },
    drawerHead: {
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #e2e8f0',
        flexShrink: 0,
    },
    closeBtn: {
        width: 32,
        height: 32,
        borderRadius: 9,
        background: '#f1f5f9',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#64748b',
        padding: 0,
    },
    drawerLinks: {
        flex: 1,
        overflowY: 'auto',
        padding: '8px 10px',
    },
    dlink: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 12px',
        borderRadius: 10,
        textDecoration: 'none',
        fontSize: 13.5,
        fontWeight: 500,
        color: '#64748b',
        transition: 'background 0.12s',
        marginBottom: 1,
    },
    dlinkActive: {
        background: '#eff6ff',
        color: '#135bec',
        fontWeight: 600,
    },
    dicon: {
        width: 30,
        height: 30,
        borderRadius: 8,
        background: '#f1f5f9',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    diconActive: {
        background: 'rgba(19,91,236,0.12)',
    },
    drawerFoot: {
        padding: '12px 14px 28px',
        borderTop: '1px solid #e2e8f0',
        flexShrink: 0,
    },
    drawerUser: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: 10,
        background: '#f1f5f9',
        borderRadius: 10,
        marginBottom: 8,
        minWidth: 0,
    },
    signOutBtn: {
        width: '100%',
        padding: 9,
        borderRadius: 10,
        border: 'none',
        background: 'none',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        fontSize: 13,
        fontWeight: 600,
        color: '#dc2626',
        cursor: 'pointer',
        textAlign: 'center',
    },
}
