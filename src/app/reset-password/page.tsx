'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type SessionState = 'checking' | 'valid' | 'invalid'

function EyeToggle({ visible, onToggle, style }: { visible: boolean; onToggle: () => void; style?: React.CSSProperties }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={visible ? 'Hide password' : 'Show password'}
      style={{
        position: 'absolute', top: '50%', transform: 'translateY(-50%)',
        background: 'none', border: 'none', padding: 4, cursor: 'pointer',
        display: 'flex', alignItems: 'center', color: '#94a3b8', ...style,
      }}
    >
      {visible ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  )
}

export default function ResetPasswordPage() {
  const router = useRouter()
  const [sessionState, setSessionState] = useState<SessionState>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const supabase = createClient()

  // The recovery link exchanges its code for a session via /auth/callback
  // before landing here. No session at this point means the link was
  // missing, already used, or expired.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessionState(data.session ? 'valid' : 'invalid')
    })
  }, [supabase])

  const matches = confirm.length > 0 && password === confirm
  const mismatch = confirm.length > 0 && password !== confirm

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords don’t match.')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setDone(true)
    setTimeout(() => router.push('/dashboard'), 1800)
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

        {sessionState === 'checking' && (
          <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>Verifying your link…</p>
        )}

        {sessionState === 'invalid' && (
          <div style={{ textAlign: 'center' }}>
            <span style={{
              width: 56, height: 56, borderRadius: '50%',
              background: '#fef2f2', border: '1px solid #fecaca',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 20,
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 9v4M12 17h.01" />
                <circle cx="12" cy="12" r="9" />
              </svg>
            </span>
            <h1 style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", fontSize: '1.375rem', fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>
              This link has expired
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 28 }}>
              Password reset links only work once and expire after an hour. Request a new one to continue.
            </p>
            <Link href="/forgot-password" style={{
              display: 'block', width: '100%', padding: '12px', background: '#135bec',
              color: '#fff', borderRadius: '8px', fontSize: '0.95rem', fontWeight: 600,
              textDecoration: 'none', boxSizing: 'border-box',
            }}>
              Request a new link
            </Link>
          </div>
        )}

        {sessionState === 'valid' && done && (
          <div style={{ textAlign: 'center' }}>
            <span style={{
              width: 56, height: 56, borderRadius: '50%',
              background: '#f0fdf4', border: '1px solid #bbf7d0',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 20,
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12 L9 17 L20 6" />
              </svg>
            </span>
            <h1 style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", fontSize: '1.375rem', fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>
              Password updated
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Taking you to your dashboard…</p>
          </div>
        )}

        {sessionState === 'valid' && !done && (
          <>
            <div style={{ textAlign: 'center', marginBottom: '28px' }}>
              <h1 style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", fontSize: '1.375rem', fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>
                Choose a new password
              </h1>
              <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
                Make it something you haven&apos;t used here before.
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
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                  New password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    placeholder="Min 6 characters"
                    style={{
                      width: '100%', padding: '10px 44px 10px 14px', border: '1px solid #e2e8f0',
                      borderRadius: '8px', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box',
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#135bec'}
                    onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                  />
                  <EyeToggle visible={showPassword} onToggle={() => setShowPassword(v => !v)} style={{ right: 12 }} />
                </div>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                  Confirm new password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    autoComplete="new-password"
                    placeholder="Re-enter password"
                    style={{
                      width: '100%', padding: matches ? '10px 72px 10px 14px' : '10px 44px 10px 14px',
                      border: `1px solid ${mismatch ? '#fca5a5' : '#e2e8f0'}`,
                      borderRadius: '8px', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box',
                    }}
                    onFocus={(e) => e.target.style.borderColor = mismatch ? '#fca5a5' : '#135bec'}
                    onBlur={(e) => e.target.style.borderColor = mismatch ? '#fca5a5' : '#e2e8f0'}
                  />
                  {matches && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                      style={{ position: 'absolute', right: 42, top: '50%', transform: 'translateY(-50%)' }}>
                      <path d="M4 12 L9 17 L20 6" />
                    </svg>
                  )}
                  <EyeToggle visible={showPassword} onToggle={() => setShowPassword(v => !v)} style={{ right: 12 }} />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%', padding: '12px', background: loading ? '#93b4fa' : '#135bec',
                  color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.95rem',
                  fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? 'Updating…' : 'Update password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
