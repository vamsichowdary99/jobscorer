import Link from 'next/link'

export default function Footer() {
    return (
        <footer style={{
            background: 'var(--color-text-primary)',
            color: 'var(--color-text-tertiary)',
            padding: '64px 0 32px',
        }}>
            <div className="container-main">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 48, marginBottom: 48 }}>
                    {/* Brand */}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 16 }}>
                            <div style={{
                                position: 'relative',
                                width: 28,
                                height: 28,
                                borderRadius: 8,
                                background: 'linear-gradient(135deg, #135bec 0%, #2563eb 100%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: '0 3px 8px -1px rgba(19,91,236,0.4)',
                                flexShrink: 0,
                            }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M4 18 L9 12 L13 15 L20 6" />
                                    <path d="M15 6 L20 6 L20 11" />
                                </svg>
                            </div>
                            <span style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", fontSize: '1rem', fontWeight: 800, letterSpacing: '-0.025em' }}><span style={{ color: '#ffffff' }}>Job</span><span style={{ color: '#93b8ff' }}>Scorer</span></span>
                        </div>
                        <p style={{ fontSize: '0.8125rem', lineHeight: 1.7, maxWidth: 260 }}>
                            AI-powered job matching and resume optimization. Find the roles that fit you best.
                        </p>
                    </div>

                    {/* Product */}
                    <div>
                        <h4 style={{ color: 'white', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Product</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <Link href="/browse" style={{ color: 'var(--color-text-tertiary)', textDecoration: 'none', fontSize: '0.8125rem', transition: 'color 0.2s' }}>Browse Jobs</Link>
                            <Link href="/dashboard/upload" style={{ color: 'var(--color-text-tertiary)', textDecoration: 'none', fontSize: '0.8125rem', transition: 'color 0.2s' }}>Upload Resume</Link>
                            <Link href="/dashboard/matches" style={{ color: 'var(--color-text-tertiary)', textDecoration: 'none', fontSize: '0.8125rem', transition: 'color 0.2s' }}>AI Matching</Link>
                            <Link href="/dashboard/optimize" style={{ color: 'var(--color-text-tertiary)', textDecoration: 'none', fontSize: '0.8125rem', transition: 'color 0.2s' }}>Resume Optimizer</Link>
                        </div>
                    </div>

                    {/* Company */}
                    <div>
                        <h4 style={{ color: 'white', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Company</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <Link href="/legal/privacy" style={{ color: 'var(--color-text-tertiary)', textDecoration: 'none', fontSize: '0.8125rem' }}>Privacy Policy</Link>
                            <Link href="/legal/terms" style={{ color: 'var(--color-text-tertiary)', textDecoration: 'none', fontSize: '0.8125rem' }}>Terms of Service</Link>
                            <Link href="/legal/cookies" style={{ color: 'var(--color-text-tertiary)', textDecoration: 'none', fontSize: '0.8125rem' }}>Cookie Policy</Link>
                        </div>
                    </div>
                </div>

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <p style={{ fontSize: '0.75rem' }}>© 2026 JobScorer. All rights reserved.</p>
                    <p style={{ fontSize: '0.75rem' }}>Powered by AI • Built with Next.js</p>
                </div>
            </div>
        </footer>
    )
}
