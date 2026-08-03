'use client'

import { useEffect, useState } from 'react'

export type Plan = 'free' | 'pro' | 'max'

// Module-level session cache: the first successful lookup seeds every later
// usePlan() call in this page session, so reopening the same gated UI (e.g.
// closing and reopening the template picker) starts already-resolved instead
// of re-showing a loading state each time.
let cachedPlan: Plan | null = null

/**
 * Client-side plan lookup for gating UI (e.g. locked templates). `loading`
 * starts true and `plan` is not meaningful until it resolves — consumers
 * MUST treat `loading` as "unknown", not as "free". Defaulting the visible
 * plan to 'free' while loading briefly flashes a false paywall at paying
 * users; treating it as free for actual gating decisions is still correct
 * (safe-by-default), just don't render a "locked" state from it.
 */
export function usePlan(): { plan: Plan; loading: boolean } {
  const [plan, setPlan] = useState<Plan>(cachedPlan ?? 'free')
  const [loading, setLoading] = useState(cachedPlan === null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/billing/usage')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled) return
        const resolved: Plan = d?.plan === 'pro' || d?.plan === 'max' ? d.plan : 'free'
        cachedPlan = resolved
        setPlan(resolved)
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return { plan, loading }
}
