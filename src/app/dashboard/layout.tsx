import Navbar from '@/components/Navbar'
import MobileNavbar from '@/components/MobileNavbar'
import DashboardLayout from '@/components/DashboardLayout'

// Dashboard routes are authenticated and user-specific — never statically
// prerendered. This also satisfies Next's useSearchParams() CSR-bailout rule
// for the client pages in this subtree.
export const dynamic = 'force-dynamic'

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <>
            {/* desktop-nav-wrapper: visible at ≥768px, hidden on mobile */}
            <div className="desktop-nav-wrapper"><Navbar /></div>
            {/* mobile-nav-wrapper: visible at ≤767px, hidden on desktop */}
            <div className="mobile-nav-wrapper"><MobileNavbar /></div>
            <DashboardLayout>{children}</DashboardLayout>
        </>
    )
}
