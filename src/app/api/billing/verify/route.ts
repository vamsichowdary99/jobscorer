import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

/**
 * POST /api/billing/verify
 * Body: { razorpay_payment_id, razorpay_subscription_id, razorpay_signature }
 *
 * Verifies the checkout signature for a subscription:
 *   expected = HMAC_SHA256(razorpay_payment_id + "|" + razorpay_subscription_id, KEY_SECRET)
 *
 * On a valid signature we OPTIMISTICALLY activate the plan so the UI updates
 * instantly. The webhook (subscription.activated/charged) remains the source of
 * truth and will reconcile if anything differs.
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

  const paymentId = String(body.razorpay_payment_id ?? '')
  const subscriptionId = String(body.razorpay_subscription_id ?? '')
  const signature = String(body.razorpay_signature ?? '')
  if (!paymentId || !subscriptionId || !signature) {
    return NextResponse.json(
      { error: 'Missing razorpay_payment_id / razorpay_subscription_id / razorpay_signature' },
      { status: 400 },
    )
  }

  const secret = process.env.RAZORPAY_KEY_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Razorpay secret not configured' }, { status: 500 })
  }

  // For subscriptions the signature is HMAC over `payment_id|subscription_id`.
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${paymentId}|${subscriptionId}`)
    .digest('hex')

  const valid =
    expected.length === signature.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))

  if (!valid) {
    return NextResponse.json({ success: false, error: 'Signature verification failed' }, { status: 400 })
  }

  // Signature OK → look up which plan/cycle this subscription is for (the row we
  // wrote in /subscribe), then optimistically activate. Service role: the
  // subscription must belong to this user.
  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: sub } = await svc
    .from('subscriptions')
    .select('plan, cycle, user_id')
    .eq('razorpay_subscription_id', subscriptionId)
    .maybeSingle()

  if (!sub || sub.user_id !== user.id) {
    // Can't map it to this user — let the webhook handle activation instead.
    return NextResponse.json({ success: true, verified: true, activated: false })
  }

  await svc
    .from('subscriptions')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('razorpay_subscription_id', subscriptionId)

  await svc
    .from('profiles')
    .update({
      plan: sub.plan,
      plan_status: 'active',
      plan_cycle: sub.cycle,
    })
    .eq('id', user.id)

  return NextResponse.json({ success: true, verified: true, activated: true, plan: sub.plan, cycle: sub.cycle })
}
