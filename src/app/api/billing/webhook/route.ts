import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createClient as createServiceClient } from '@supabase/supabase-js'

/**
 * POST /api/billing/webhook  — Razorpay subscription webhook (source of truth).
 *
 * Razorpay signs each delivery with X-Razorpay-Signature = HMAC_SHA256(rawBody,
 * RAZORPAY_WEBHOOK_SECRET). We verify that, then reconcile our DB:
 *   - active/charged  → profiles.plan = <plan>, status active, renews_at = current_end
 *   - cancelled/completed → profiles.plan = free
 *   - paused          → plan_status = paused
 *   - halted / payment.failed → plan_status = past_due
 *
 * The user/plan/cycle come from the `subscriptions` row we wrote in /subscribe
 * (looked up by razorpay_subscription_id), with the subscription `notes` as a
 * fallback. Must read the RAW body for signature verification — do not parse first.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret) {
    console.error('[billing/webhook] RAZORPAY_WEBHOOK_SECRET not configured')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  const raw = await req.text()
  const signature = req.headers.get('x-razorpay-signature') ?? ''

  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex')
  const sigOk =
    signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  if (!sigOk) {
    console.warn('[billing/webhook] signature mismatch')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  let event: {
    event?: string
    payload?: { subscription?: { entity?: Record<string, unknown> } }
  }
  try {
    event = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const type = event.event ?? ''
  const sub = event.payload?.subscription?.entity as
    | { id?: string; status?: string; current_end?: number; notes?: Record<string, string> }
    | undefined

  // Only subscription events carry the subscription entity we key on.
  if (!sub?.id) {
    return NextResponse.json({ received: true, ignored: type })
  }

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Map the subscription back to our user/plan/cycle.
  const { data: row } = await svc
    .from('subscriptions')
    .select('user_id, plan, cycle')
    .eq('razorpay_subscription_id', sub.id)
    .maybeSingle()

  const userId = row?.user_id ?? sub.notes?.user_id
  const plan = (row?.plan ?? sub.notes?.plan) as 'pro' | 'max' | undefined
  const cycle = (row?.cycle ?? sub.notes?.cycle) as 'monthly' | 'annual' | undefined
  if (!userId) {
    console.warn('[billing/webhook] no user mapping for', sub.id, type)
    return NextResponse.json({ received: true, unmapped: true })
  }

  // Decide the resulting state from the event.
  let subStatus: string | null = null
  let profilePlan: 'free' | 'pro' | 'max' | null = null
  let profileStatus: 'active' | 'past_due' | 'cancelled' | 'paused' | null = null

  switch (type) {
    case 'subscription.activated':
    case 'subscription.authenticated':
    case 'subscription.charged':
    case 'subscription.resumed':
      subStatus = 'active'
      profilePlan = plan ?? null
      profileStatus = 'active'
      break
    case 'subscription.pending': // a charge failed; Razorpay will retry
      subStatus = 'pending'
      profileStatus = 'past_due'
      break
    case 'subscription.halted': // retries exhausted
      subStatus = 'halted'
      profileStatus = 'past_due'
      break
    case 'subscription.paused':
      subStatus = 'paused'
      profileStatus = 'paused'
      break
    case 'subscription.cancelled':
    case 'subscription.completed':
    case 'subscription.expired':
      subStatus = type.split('.')[1]
      profilePlan = 'free'
      profileStatus = 'cancelled'
      break
    default:
      return NextResponse.json({ received: true, ignored: type })
  }

  const renewsAt =
    typeof sub.current_end === 'number'
      ? new Date(sub.current_end * 1000).toISOString()
      : null

  if (subStatus) {
    await svc
      .from('subscriptions')
      .update({
        status: subStatus,
        ...(renewsAt ? { current_period_end: renewsAt } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('razorpay_subscription_id', sub.id)
  }

  const profileUpdate: Record<string, unknown> = {}
  if (profilePlan !== null) profileUpdate.plan = profilePlan
  if (profileStatus !== null) profileUpdate.plan_status = profileStatus
  if (profilePlan === 'free') {
    profileUpdate.plan_cycle = null
    profileUpdate.plan_renews_at = null
  } else {
    if (cycle) profileUpdate.plan_cycle = cycle
    if (renewsAt) profileUpdate.plan_renews_at = renewsAt
  }
  if (Object.keys(profileUpdate).length > 0) {
    await svc.from('profiles').update(profileUpdate).eq('id', userId)
  }

  console.log(`[billing/webhook] ${type} → sub=${sub.id} user=${userId} plan=${profilePlan ?? '(unchanged)'} status=${profileStatus ?? '(unchanged)'}`)
  return NextResponse.json({ received: true, event: type, applied: true })
}
