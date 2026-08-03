'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

export const CONSENT_KEY = 'rs-consent'
export const CONSENT_EVENT = 'rs-consent-change'

export default function ConsentBanner() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem(CONSENT_KEY)) setShow(true)
  }, [])
  if (!show) return null

  const choose = (value: 'all' | 'essential') => {
    localStorage.setItem(CONSENT_KEY, value)
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: value }))
    setShow(false)
  }

  return (
    <div role="region" aria-label="Cookie consent" style={{ position: 'fixed', bottom: 16, left: 16, right: 16, maxWidth: 720, margin: '0 auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 8px 30px rgba(15,23,42,0.12)', padding: '16px 20px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', zIndex: 9999 }}>
      <span style={{ flex: 1, fontSize: '0.8125rem', color: '#475569', minWidth: 240 }}>
        We use essential cookies to keep you signed in, and optional analytics cookies to understand how JobScorer is used. See our{' '}
        <Link href="/legal/cookies" style={{ color: '#135bec', textDecoration: 'underline' }}>Cookie Policy</Link> and{' '}
        <Link href="/legal/privacy" style={{ color: '#135bec', textDecoration: 'underline' }}>Privacy Policy</Link>.
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => choose('essential')}
          style={{ background: '#fff', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 16px', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}>
          Essential only
        </button>
        <button onClick={() => choose('all')}
          style={{ background: '#135bec', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}>
          Accept analytics
        </button>
      </div>
    </div>
  )
}
