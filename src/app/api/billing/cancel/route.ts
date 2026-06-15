import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { razorpay } from '@/lib/razorpay'

/**
 * POST /api/billing/cancel
 * Cancels the user's active Razorpay subscription immediately and downgrades to
 * free. The webhook (subscription.cancelled) will also fire and reconcile — this
 * just makes the UI reflect it instantly. Cancels the user's OWN sub only.
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: sub } = await svc
    .from('subscriptions')
    .select('razorpay_subscription_id')
    .eq('user_id', user.id)
    .in('status', ['active', 'created', 'authenticated', 'pending'])
    .order('created_at', { ascending: false })
    .maybeSingle()

  if (!sub?.razorpay_subscription_id) {
    return NextResponse.json({ error: 'No active subscription to cancel.' }, { status: 400 })
  }

  try {
    // false = cancel immediately (not at cycle end).
    await razorpay().subscriptions.cancel(sub.razorpay_subscription_id, false)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/billing/cancel] Razorpay cancel failed:', err)
    return NextResponse.json({ error: `Razorpay error: ${msg}` }, { status: 502 })
  }

  await svc
    .from('subscriptions')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('razorpay_subscription_id', sub.razorpay_subscription_id)

  await svc
    .from('profiles')
    .update({ plan: 'free', plan_status: 'cancelled', plan_cycle: null, plan_renews_at: null })
    .eq('id', user.id)

  return NextResponse.json({ success: true })
}
