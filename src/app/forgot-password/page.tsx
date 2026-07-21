'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const origin = window.location.origin
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/callback?next=/reset-password`,
    })

    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    // Always show the same confirmation, whether or not the email exists —
    // telling the caller "no account found" would let anyone enumerate emails.
    setSent(true)
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(160deg, #f8fafc 0%, #e8f0fe 50%, #f0f7ff 100%)',
      padding: '24px',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: '16px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        padding: '48px',
        width: '100%',
        maxWidth: '440px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <span style={{ position: 'relative', width: 40, height: 40, borderRadius: 11, background: 'linear-gradient(135deg, #135bec 0%, #2563eb 100%)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 8px -1px rgba(19,91,236,0.4)', flexShrink: 0 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 18 L9 12 L13 15 L20 6" />
                <path d="M15 6 L20 6 L20 11" />
              </svg>
            </span>
            <span style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.025em' }}><span style={{ color: '#0f172a' }}>Job</span><span style={{ color: '#135bec' }}>Scorer</span></span>
          </Link>
        </div>

        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <span style={{
              width: 56, height: 56, borderRadius: '50%',
              background: '#f0fdf4', border: '1px solid #bbf7d0',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 20,
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7 L12 13 L21 7" />
                <path d="M3 7 L3 17 L21 17 L21 7" />
              </svg>
            </span>
            <h1 style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", fontSize: '1.375rem', fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>
              Check your inbox
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 28 }}>
              If an account exists for <strong style={{ color: '#334155' }}>{email}</strong>, we&apos;ve sent a link to reset your password. It expires in 1 hour.
            </p>
            <button
              onClick={() => { setSent(false); setEmail('') }}
              style={{
                width: '100%', padding: '12px', background: '#fff', color: '#374151',
                border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.95rem',
                fontWeight: 500, cursor: 'pointer', marginBottom: 12,
              }}
            >
              Use a different email
            </button>
            <Link href="/login" style={{ color: '#135bec', fontWeight: 600, fontSize: '0.875rem', textDecoration: 'none' }}>
              ← Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: '28px' }}>
              <h1 style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", fontSize: '1.375rem', fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>
                Reset your password
              </h1>
              <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
                Enter your email and we&apos;ll send you a link to get back in.
              </p>
            </div>

            {error && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px',
                padding: '12px 16px', marginBottom: '20px', color: '#dc2626', fontSize: '0.875rem',
              }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  style={{
                    width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0',
                    borderRadius: '8px', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box',
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#135bec'}
                  onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%', padding: '12px', background: loading ? '#93b4fa' : '#135bec',
                  color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.95rem',
                  fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', marginBottom: '20px',
                }}
              >
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>

            <p style={{ textAlign: 'center', fontSize: '0.875rem', color: '#64748b' }}>
              <Link href="/login" style={{ color: '#135bec', fontWeight: 600, textDecoration: 'none' }}>
                ← Back to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
