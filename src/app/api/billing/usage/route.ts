import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { PLAN_QUOTAS, getUserPlan, currentPeriodStart, type Feature } from '@/lib/plan'

/**
 * GET /api/billing/usage
 * Returns the signed-in user's plan + this month's usage vs quota per feature.
 * Powers the usage meters on /dashboard/billing.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const plan = await getUserPlan(user.id)
  const period = currentPeriodStart()

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data } = await svc
    .from('usage_counters')
    .select('feature, count')
    .eq('user_id', user.id)
    .eq('period_start', period)

  const used: Record<string, number> = {}
  for (const row of (data ?? []) as Array<{ feature: string; count: number }>) {
    used[row.feature] = row.count
  }

  const quotas = PLAN_QUOTAS[plan]
  const usage = (Object.keys(quotas) as Feature[]).map((feature) => ({
    feature,
    used: used[feature] ?? 0,
    limit: quotas[feature], // -1 means unlimited
  }))

  return NextResponse.json({ plan, period, usage })
}
