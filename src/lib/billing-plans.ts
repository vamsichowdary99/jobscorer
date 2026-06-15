// Razorpay subscription plan mapping for JobScorer.
// Plan IDs were created in TEST mode via scripts/razorpay-create-plans.mjs.
// When going live, regenerate plans with live keys and swap these IDs.

export type BillingPlan = 'pro' | 'max';
export type BillingCycle = 'monthly' | 'annual';
export type PlanKey = `${BillingPlan}_${BillingCycle}`;

export const RAZORPAY_PLAN_IDS: Record<PlanKey, string> = {
  pro_monthly: 'plan_Sw28t1uIcYU3lb',
  pro_annual:  'plan_Sw28tJPksVJ5v5',
  max_monthly: 'plan_Sw28tbrHfpxoxE',
  max_annual:  'plan_Sw28tu8xV7mPVV',
};

// Amounts in paise — for display/reference only; the source of truth is the
// amount baked into each Razorpay plan above. Mirrors plans/15 §1.
export const PLAN_AMOUNTS_PAISE: Record<PlanKey, number> = {
  pro_monthly: 29900,
  pro_annual: 249900,
  max_monthly: 59900,
  max_annual: 499900,
};

// Razorpay subscriptions require a finite total_count of billing cycles. Use a
// long horizon so the subscription effectively runs until the user cancels.
export const TOTAL_COUNTS: Record<BillingCycle, number> = {
  monthly: 120, // ~10 years
  annual: 10,   // ~10 years
};

export function isBillingPlan(v: unknown): v is BillingPlan {
  return v === 'pro' || v === 'max';
}
export function isBillingCycle(v: unknown): v is BillingCycle {
  return v === 'monthly' || v === 'annual';
}

export function resolvePlanId(plan: BillingPlan, cycle: BillingCycle): string {
  return RAZORPAY_PLAN_IDS[`${plan}_${cycle}`];
}
