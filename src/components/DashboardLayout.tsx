'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState, Suspense } from 'react'
import PendingResearchToaster from './PendingResearchToaster'
import UpgradeToast from './billing/UpgradeToast'

/* Pages that manage their own full-height layout (no padding) */
const FULL_BLEED_PAGES = [
    '/dashboard/upload',
    '/dashboard/search',
    '/dashboard/matches',
    '/dashboard/optimize',
    '/dashboard/research',
    '/dashboard/chat',
    '/dashboard/learning',
    '/dashboard/resumes',
    '/dashboard/applications',
]

export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    const pathname = usePathname()
    const isFullBleed = FULL_BLEED_PAGES.includes(pathname)

    const [isMobile, setIsMobile] = useState(false)
    useEffect(() => {
        const mq = window.matchMedia('(max-width: 767px)')
        setIsMobile(mq.matches)
        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
        mq.addEventListener('change', handler)
        return () => mq.removeEventListener('change', handler)
    }, [])

    const sidePad = isFullBleed ? 0 : isMobile ? 16 : 40

    return (
        <main
            className={isFullBleed ? '' : 'dashboard-padded'}
            style={{
                minHeight: '100vh',
                paddingTop: 64,
                paddingRight: sidePad,
                paddingBottom: isFullBleed ? 0 : 40,
                paddingLeft: sidePad,
                // `auto` here creates a sticky containing block that breaks
                // position:sticky on descendants (e.g., Settings left nav).
                // `visible` lets the page/window be the scroller, which sticky
                // can correctly use as its scroll reference.
                overflowX: 'hidden',
                overflowY: isFullBleed && !isMobile ? 'hidden' : 'visible',
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--color-bg)',
            }}
        >
            {children}

            {/* Cross-page notifier for in-flight company-research jobs.
                Mounted at layout level so users get notified on whatever
                dashboard page they're on when a research run completes.
                Wrapped in Suspense because it uses useSearchParams(). */}
            <Suspense fallback={null}>
                <PendingResearchToaster />
            </Suspense>

            {/* Global upgrade prompt — fires on any 402 quota block or stored-cap hit. */}
            <UpgradeToast />
        </main>
    )
}
