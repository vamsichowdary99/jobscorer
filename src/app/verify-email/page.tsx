'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { EmailOtpType } from '@supabase/supabase-js'

const HEADING_FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

function IconBadge({ tone, children }: { tone: 'blue' | 'green' | 'red'; children: React.ReactNode }) {
  const palette = {
    blue: { bg: '#eff6ff', border: '#bfdbfe', stroke: '#135bec' },
    green: { bg: '#f0fdf4', border: '#bbf7d0', stroke: '#16a34a' },
    red: { bg: '#fef2f2', border: '#fecaca', stroke: '#dc2626' },
  }[tone]
  return (
    <span style={{
      width: 56, height: 56, borderRadius: '50%',
      background: palette.bg, border: `1px solid ${palette.border}`,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      marginBottom: 20, color: palette.stroke,
    }}>
      {children}
    </span>
  )
}

const MailIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7 L12 13 L21 7" />
    <path d="M3 7 L3 17 L21 17 L21 7" />
  </svg>
)

const ShieldIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3 L20 6.5 V11 C20 16 16.5 19.5 12 21 C7.5 19.5 4 16 4 11 V6.5 Z" />
  </svg>
)

const CheckIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 L9 17 L4 12" />
  </svg>
)

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  )
}

function VerifyEmailContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tokenHash = searchParams.get('token_hash')
  const otpType = searchParams.get('type') as EmailOtpType | null

  const [email, setEmail] = useState<string | null>(null)
  // 'loading' (checking session) | 'pending' (has session, not confirmed) |
  // 'confirm' (has a token_hash link to confirm on click) | 'confirming' | 'confirmed'
  const [status, setStatus] = useState<'loading' | 'pending' | 'confirm' | 'confirming' | 'confirmed'>('loading')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    if (tokenHash && otpType) {
      setStatus('confirm')
      return
    }
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.push('/login')
        return
      }
      if (data.user.email_confirmed_at) {
        router.push('/dashboard')
        return
      }
      setEmail(data.user.email ?? null)
      setStatus('pending')
    })
  }, [router, supabase, tokenHash, otpType])

  const handleConfirmClick = async () => {
    if (!tokenHash || !otpType) return
    setStatus('confirming')
    setError(null)
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: otpType })
    if (error) {
      setError(error.message)
      setStatus('confirm')
      return
    }
    setStatus('confirmed')
    router.push('/dashboard')
  }

  const handleResend = async () => {
    if (!email) return
    setSending(true)
    setError(null)
    setMessage(null)
    const { error } = await supabase.auth.resend({ type: 'signup', email })
    if (error) {
      setError(error.message)
    } else {
      setMessage('Confirmation email sent. Check your inbox (and spam folder).')
    }
    setSending(false)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (status === 'loading') return null

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
        textAlign: 'center',
      }}>
        <div style={{ marginBottom: '28px' }}>
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <span style={{ position: 'relative', width: 40, height: 40, borderRadius: 11, background: 'linear-gradient(135deg, #135bec 0%, #2563eb 100%)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 8px -1px rgba(19,91,236,0.4)', flexShrink: 0 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 18 L9 12 L13 15 L20 6" />
                <path d="M15 6 L20 6 L20 11" />
              </svg>
            </span>
            <span style={{ fontFamily: HEADING_FONT, fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.025em' }}><span style={{ color: '#0f172a' }}>Job</span><span style={{ color: '#135bec' }}>Scorer</span></span>
          </Link>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', color: '#dc2626', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}
        {message && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', color: '#16a34a', fontSize: '0.875rem' }}>
            {message}
          </div>
        )}

        {(status === 'confirm' || status === 'confirming') ? (
          <>
            <IconBadge tone="blue"><ShieldIcon /></IconBadge>
            <h1 style={{ fontFamily: HEADING_FONT, fontSize: '1.375rem', fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>
              Confirm your email
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 28 }}>
              Tap below to finish activating your account.
            </p>
            <button
              onClick={handleConfirmClick}
              disabled={status === 'confirming'}
              style={{
                width: '100%',
                padding: '12px',
                background: status === 'confirming' ? '#93b4fa' : '#135bec',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.95rem',
                fontWeight: 600,
                cursor: status === 'confirming' ? 'not-allowed' : 'pointer',
              }}
            >
              {status === 'confirming' ? 'Confirming…' : 'Confirm my email'}
            </button>
          </>
        ) : status === 'confirmed' ? (
          <>
            <IconBadge tone="green"><CheckIcon /></IconBadge>
            <h1 style={{ fontFamily: HEADING_FONT, fontSize: '1.375rem', fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>
              Email confirmed
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: 1.6 }}>
              Taking you to your dashboard…
            </p>
          </>
        ) : (
          <>
            <IconBadge tone="blue"><MailIcon /></IconBadge>
            <h1 style={{ fontFamily: HEADING_FONT, fontSize: '1.375rem', fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>
              Check your inbox
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 28 }}>
              We sent a confirmation link to{email ? <> <strong style={{ color: '#334155' }}>{email}</strong></> : ' your email address'}.
              Open it and tap the confirm button to activate your account.
            </p>

            <button
              onClick={handleResend}
              disabled={sending}
              style={{
                width: '100%',
                padding: '12px',
                background: sending ? '#93b4fa' : '#135bec',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.95rem',
                fontWeight: 600,
                cursor: sending ? 'not-allowed' : 'pointer',
                marginBottom: '12px',
              }}
            >
              {sending ? 'Sending…' : 'Resend confirmation email'}
            </button>

            <button
              onClick={handleSignOut}
              style={{
                width: '100%',
                padding: '12px',
                background: '#fff',
                color: '#374151',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                fontSize: '0.95rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Sign out
            </button>
          </>
        )}
      </div>
    </div>
  )
}
