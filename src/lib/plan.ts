import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getRedis } from './rate-limit';
import { dailySpendKey } from './usage';

/**
 * Plan entitlement layer — monthly per-feature quotas for Free / Pro / Max.
 *
 * This is the BILLING quota layer (monthly counters that reset each period),
 * distinct from `rate-limit.ts` which is the per-minute ABUSE floor. A request
 * passes the abuse limiter first, then checkQuota() here.
 *
 * Quotas mirror plans/15 §1. -1 (UNLIMITED) = fair-use ceiling not enforced as
 * a hard monthly cap. Counting is atomic via the increment_usage_counter() RPC.
 */

export type Plan = 'free' | 'pro' | 'max';
export type Feature =
  | 'job_search'
  | 'score'
  | 'optimize'
  | 'company_research'
  | 'build_plan'
  | 'chat'
  | 'learning_path'
  | 'project_roadmap'
  | 'project_coach'
  | 'resume_edit'
  | 'cover_letter';

const UNLIMITED = -1;

// project_coach covers the 3 Project Coach actions (teach-me cache misses, stuck,
// review-work) combined — one monthly pool, not per-action. Cache hits on teach-me
// never reach checkQuota() so they stay free regardless of this limit.
export const PLAN_QUOTAS: Record<Plan, Record<Feature, number>> = {
  // chat/resume_edit cut 10→3 (2026-07-30): conversation history has no fixed
  // token cost (see docs/AI_COST_OPTIMIZATION_AUDIT.md §9), so these were the
  // least-bounded liability in the whole quota table.
  free: { job_search: 5,   score: 3,  optimize: 1,  company_research: 2,  build_plan: 1,  chat: 3,   learning_path: 1,  project_roadmap: 1,  project_coach: 10,  resume_edit: 3,   cover_letter: 1 },
  pro:  { job_search: 60,  score: 30, optimize: 20, company_research: 20, build_plan: 10, chat: 200, learning_path: 15, project_roadmap: 10, project_coach: 75,  resume_edit: 150, cover_letter: 15 },
  max:  { job_search: 200, score: 80, optimize: 40, company_research: 40, build_plan: 30, chat: 600, learning_path: 30, project_roadmap: 30, project_coach: 250, resume_edit: 500, cover_letter: 30 },
};

// Stored-resource caps (row counts, not monthly). -1 = unlimited. Mirrors plans/15 §1.
export const STORED_CAPS: Record<Plan, { resumes: number; applications: number }> = {
  free: { resumes: 1,  applications: 3 },
  pro:  { resumes: 5,  applications: -1 },
  max:  { resumes: 20, applications: -1 },
};

// Human-readable labels for user-facing quota messages (singular / plural).
const FEATURE_LABELS: Record<Feature, { one: string; many: string }> = {
  job_search:       { one: 'job search',              many: 'job searches' },
  score:            { one: 'job-match score',         many: 'job-match scores' },
  optimize:         { one: 'resume optimization',     many: 'resume optimizations' },
  company_research: { one: 'company research report', many: 'company research reports' },
  build_plan:       { one: 'build plan',              many: 'build plans' },
  chat:             { one: 'chat message',            many: 'chat messages' },
  learning_path:    { one: 'learning path',           many: 'learning paths' },
  project_roadmap:  { one: 'project roadmap',         many: 'project roadmaps' },
  project_coach:    { one: 'project coach action',    many: 'project coach actions' },
  resume_edit:      { one: 'resume edit message',     many: 'resume edit messages' },
  cover_letter:     { one: 'cover letter',             many: 'cover letters' },
};

let _svc: ReturnType<typeof createClient> | null = null;
function serviceClient() {
  if (_svc) return _svc;
  _svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  return _svc;
}

/** First day of the current month (UTC) as a YYYY-MM-DD string — the quota period key. */
export function currentPeriodStart(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

// Billing states (written by /api/billing/webhook) that must NOT keep paid
// quota — a past-due or paused subscription still has `profiles.plan` set to
// 'pro'/'max' until the next webhook event, which otherwise silently grants
// unlimited-duration paid AI quota to a non-paying user.
const NON_ENTITLED_STATUSES = new Set(['past_due', 'paused', 'cancelled']);

/** Read a user's plan from profiles. Defaults to 'free' if missing/unreadable,
 *  or if the subscription is past-due/paused/cancelled. */
export async function getUserPlan(userId: string): Promise<Plan> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (serviceClient() as any)
      .from('profiles')
      .select('plan, plan_status')
      .eq('id', userId)
      .maybeSingle();
    if (data?.plan_status && NON_ENTITLED_STATUSES.has(data.plan_status)) return 'free';
    const plan = data?.plan as Plan | undefined;
    return plan === 'pro' || plan === 'max' ? plan : 'free';
  } catch {
    return 'free';
  }
}

// Global daily AI spend ceiling (₹), independent of any per-user quota — a
// last-resort circuit breaker for a runaway bug or abuse burst, not a normal
// operating limit. Override via env for a real launch; this default is sized
// for the pre-launch/dev-only phase (see CLAUDE.md).
const DAILY_SPEND_CAP_INR = Number(process.env.DAILY_AI_SPEND_CAP_INR ?? 3000);

/**
 * Hard-fail circuit breaker: blocks ALL metered AI calls once today's total
 * estimated spend (summed by usage.ts's logUsage into Redis) crosses
 * DAILY_SPEND_CAP_INR. Unlike checkQuota/requireUserLimit, this does NOT
 * degrade open on a Redis read error in the sense of "assume fine and
 * proceed forever" — but if Redis is unreachable there is no counter to
 * check at all, so it allows the request (same posture as the rest of the
 * app's rate-limit/quota layer during an outage — see
 * docs/AI_COST_OPTIMIZATION_AUDIT.md §7 for why a stricter posture there
 * would take down the whole app on a Redis blip instead of just capping
 * spend).
 */
async function checkDailySpendCap(): Promise<NextResponse | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const spent = Number((await redis.get(dailySpendKey())) ?? 0);
    if (spent >= DAILY_SPEND_CAP_INR) {
      return NextResponse.json(
        {
          success: false,
          error: 'AI features are temporarily paused — daily usage cap reached. Try again after midnight UTC.',
          spend_cap_tripped: true,
        },
        { status: 503 },
      );
    }
  } catch (err) {
    console.warn('[plan:spend-cap] check failed, allowing:', err);
  }
  return null;
}

/**
 * Reserve one unit of `feature` for `userId` against their plan's monthly quota.
 *
 * Returns `null` when the request is allowed (and the counter was incremented).
 * Returns a 402 NextResponse with upgrade context when the quota is exhausted.
 * Degrades OPEN if Redis/DB/RPC is unavailable — quota enforcement must never
 * hard-fail a paid action that already passed auth + abuse limiting.
 *
 * Call at the point where paid work is about to start (after cache-hit returns),
 * so cache hits don't consume quota.
 */
export async function checkQuota(
  userId: string,
  feature: Feature,
  amount = 1,
): Promise<NextResponse | null> {
  // Refund calls (amount < 0, e.g. cover-letter's failure refund) must never
  // be blocked by the spend cap — that would leak the quota unit permanently.
  if (amount > 0) {
    const capped = await checkDailySpendCap();
    if (capped) return capped;
  }

  const plan = await getUserPlan(userId);
  const limit = PLAN_QUOTAS[plan][feature];

  // Unlimited tiers still record usage (for cost tracking) but never block.
  const effectiveLimit = limit === UNLIMITED ? UNLIMITED : limit;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (serviceClient() as any).rpc('increment_usage_counter', {
      p_user: userId,
      p_feature: feature,
      p_period: currentPeriodStart(),
      p_limit: effectiveLimit,
      p_amount: amount,
    });
    if (error) {
      console.warn(`[plan:${feature}] quota RPC failed, allowing:`, error.message);
      return null; // degrade open
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row && row.allowed === false) {
      const label = limit === 1 ? FEATURE_LABELS[feature].one : FEATURE_LABELS[feature].many;
      const nextPlan = plan === 'pro' ? 'Max' : 'Pro';
      return NextResponse.json(
        {
          success: false,
          upgrade: true,
          error: `You've reached your ${plan} plan limit of ${limit} ${label} this month. Upgrade to ${nextPlan} for more.`,
          feature,
          plan,
          quota: limit,
          used: row.new_count ?? limit,
        },
        { status: 402 },
      );
    }
    return null;
  } catch (err) {
    console.warn(`[plan:${feature}] quota check threw, allowing:`, err);
    return null; // degrade open
  }
}

/**
 * Enforce a stored-resource cap (resumes / applications) by counting existing
 * rows for the user against their plan's cap. Returns null when allowed, or a
 * 402 NextResponse when at/over the cap. Degrades OPEN on error.
 */
export async function checkStoredLimit(
  userId: string,
  kind: 'resumes' | 'applications',
): Promise<NextResponse | null> {
  try {
    const plan = await getUserPlan(userId);
    const cap = STORED_CAPS[plan][kind];
    if (cap < 0) return null; // unlimited

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (serviceClient() as any)
      .from(kind)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    if ((count ?? 0) >= cap) {
      // Professional, grammatically-correct message (singular noun when cap is 1).
      const noun = cap === 1 ? kind.replace(/s$/, '') : kind;
      const nextPlan = plan === 'pro' ? 'Max' : 'Pro';
      return NextResponse.json(
        {
          success: false,
          upgrade: true,
          error: `You've reached your ${plan} plan limit of ${cap} ${noun}. Upgrade to ${nextPlan} to add more.`,
          feature: kind,
          plan,
          quota: cap,
          used: count ?? 0,
        },
        { status: 402 },
      );
    }
    return null;
  } catch (err) {
    console.warn(`[plan:stored:${kind}] check threw, allowing:`, err);
    return null;
  }
}
