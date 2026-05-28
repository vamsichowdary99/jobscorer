import Navbar from '@/components/Navbar'
import DashboardLayout from '@/components/DashboardLayout'

// Dashboard routes are authenticated and user-specific — never statically
// prerendered. This also satisfies Next's useSearchParams() CSR-bailout rule
// for the client pages in this subtree.
export const dynamic = 'force-dynamic'

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <>
            <Navbar />
            <DashboardLayout>{children}</DashboardLayout>
        </>
    )
}
