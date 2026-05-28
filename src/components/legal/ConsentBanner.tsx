'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function ConsentBanner() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('rs-consent')) setShow(true)
  }, [])
  if (!show) return null
  return (
    <div style={{ position: 'fixed', bottom: 16, left: 16, right: 16, maxWidth: 720, margin: '0 auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 8px 30px rgba(15,23,42,0.12)', padding: '16px 20px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', zIndex: 9999 }}>
      <span style={{ flex: 1, fontSize: '0.8125rem', color: '#475569', minWidth: 240 }}>
        We use essential cookies to keep you signed in. See our{' '}
        <Link href="/legal/cookies" style={{ color: '#135bec' }}>Cookie Policy</Link> and{' '}
        <Link href="/legal/privacy" style={{ color: '#135bec' }}>Privacy Policy</Link>.
      </span>
      <button onClick={() => { localStorage.setItem('rs-consent', '1'); setShow(false) }}
        style={{ background: '#135bec', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}>
        Got it
      </button>
    </div>
  )
}
