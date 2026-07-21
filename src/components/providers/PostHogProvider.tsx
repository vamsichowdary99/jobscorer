'use client'
import { useEffect } from 'react'
import { CONSENT_KEY, CONSENT_EVENT } from '@/components/legal/ConsentBanner'

async function initPostHog() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST
  if (!key || !host) return

  const posthog = (await import('posthog-js')).default
  if (posthog.__loaded) return
  posthog.init(key, {
    api_host: host,
    person_profiles: 'identified_only',
    capture_pageview: true,
    capture_pageleave: true,
  })
}

export default function PostHogProvider() {
  useEffect(() => {
    if (localStorage.getItem(CONSENT_KEY) === 'all') initPostHog()

    const onConsentChange = (e: Event) => {
      const value = (e as CustomEvent<'all' | 'essential'>).detail
      if (value === 'all') initPostHog()
    }
    window.addEventListener(CONSENT_EVENT, onConsentChange)
    return () => window.removeEventListener(CONSENT_EVENT, onConsentChange)
  }, [])

  return null
}
