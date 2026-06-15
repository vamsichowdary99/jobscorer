import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { razorpay } from '@/lib/razorpay'
import {
  resolvePlanId,
  TOTAL_COUNTS,
  isBillingPlan,
  isBillingCycle,
} from '@/lib/billing-plans'

/**
 * POST /api/billing/subscribe
 * Body: { plan: 'pro'|'max', cycle: 'monthly'|'annual' }
 *
 * Creates a Razorpay subscription, records it in `subscriptions` (status from
 * Razorpay, usually 'created'), and returns the subscription_id + public key_id
 * for the browser checkout. The user's plan is NOT flipped here — that happens
 * only after payment, via signature verify + the webhook (source of truth).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { plan, cycle } = body
  if (!isBillingPlan(plan) || !isBillingCycle(cycle)) {
    return NextResponse.json(
      { error: "plan must be 'pro'|'max' and cycle 'monthly'|'annual'" },
      { status: 400 },
    )
  }

  const planId = resolvePlanId(plan, cycle)

  let subscription
  try {
    subscription = await razorpay().subscriptions.create({
      plan_id: planId,
      total_count: TOTAL_COUNTS[cycle],
      customer_notify: 1,
      // user_id in notes lets the webhook map the subscription back to our user.
      notes: { user_id: user.id, plan, cycle },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/billing/subscribe] Razorpay create failed:', err)
    return NextResponse.json({ error: `Razorpay error: ${msg}` }, { status: 502 })
  }

  // Record the subscription (service role — RLS allows users to read their own).
  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { error: insertErr } = await svc.from('subscriptions').insert({
    user_id: user.id,
    razorpay_subscription_id: subscription.id,
    razorpay_plan_id: planId,
    plan,
    cycle,
    status: subscription.status ?? 'created',
  })
  if (insertErr) {
    // Don't fail the checkout over a logging insert — the webhook will reconcile.
    console.warn('[/api/billing/subscribe] subscriptions insert failed:', insertErr.message)
  }

  return NextResponse.json({
    subscription_id: subscription.id,
    key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    plan,
    cycle,
  })
}
