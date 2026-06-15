import { createClient } from '@supabase/supabase-js';

/**
 * Token-cost logging for AI calls → public.usage_events.
 *
 * Every OpenAI call in the app should record its token usage here so billing,
 * quota tuning, and per-user margin analysis run on REAL cost data instead of
 * estimates. n8n AI workflows write to the same table via Supabase REST.
 *
 * RLS on usage_events only allows users to SELECT their own rows, so inserts
 * MUST use the service-role client (below) — never the user-scoped client.
 */

// OpenAI list prices, USD per 1M tokens. Keep in sync with the provider.
// Mirror of plans/15 §0. Update when OpenAI changes pricing.
const PRICING: Record<string, { in: number; out: number }> = {
  'gpt-4.1-mini': { in: 0.40, out: 1.60 },
  'gpt-4.1': { in: 2.00, out: 8.00 },
  'gpt-4o': { in: 2.50, out: 10.00 },
  'gpt-4o-mini': { in: 0.15, out: 0.60 },
  'text-embedding-3-small': { in: 0.02, out: 0 },
};

// Rough INR conversion. A constant is fine — this is for internal cost
// tracking, not customer-facing billing.
const USD_TO_INR = 85;

const DEFAULT_MODEL = 'gpt-4.1-mini';

/** Estimate the INR cost of a single call from its token counts. */
export function estimateCostInr(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const p = PRICING[model] ?? PRICING[DEFAULT_MODEL];
  const usd = (promptTokens * p.in + completionTokens * p.out) / 1_000_000;
  return usd * USD_TO_INR;
}

let _svc: ReturnType<typeof createClient> | null = null;
function serviceClient() {
  if (_svc) return _svc;
  _svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  return _svc;
}

export interface UsageLogInput {
  userId: string | null;
  feature: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
}

// Representative token estimates for actions whose AI runs INSIDE n8n, where
// the LangChain Agent node hides OpenAI's real `usage` object. Figures mirror
// plans/15 §0. These are ESTIMATES — only the chat route logs real token counts.
const ACTION_ESTIMATE: Record<string, { model: string; prompt: number; completion: number }> = {
  score:            { model: 'gpt-4.1-mini', prompt: 1800, completion: 350 }, // per job
  optimize:         { model: 'gpt-4.1',      prompt: 3000, completion: 2000 },
  company_research: { model: 'gpt-4.1-mini', prompt: 8000, completion: 1500 },
  build_plan:       { model: 'gpt-4.1',      prompt: 4000, completion: 2000 },
  learning_path:    { model: 'gpt-4.1',      prompt: 3000, completion: 2500 },
};

/**
 * Log an ESTIMATED usage event for an n8n-mediated AI action (real token counts
 * aren't recoverable from the n8n Agent node). `units` multiplies the per-call
 * estimate — scoring passes the number of jobs sent. Never throws; fire-and-forget.
 */
export async function logEstimatedUsage(opts: {
  userId: string | null;
  feature: string;
  units?: number;
}): Promise<void> {
  const est = ACTION_ESTIMATE[opts.feature];
  if (!est) return;
  const units = opts.units && opts.units > 0 ? opts.units : 1;
  await logUsage({
    userId: opts.userId,
    feature: opts.feature,
    model: est.model,
    promptTokens: est.prompt * units,
    completionTokens: est.completion * units,
  });
}

/**
 * Insert one usage_events row. Never throws — logging must not break the
 * request it is measuring. Call with `void logUsage(...)` to fire-and-forget.
 */
export async function logUsage(input: UsageLogInput): Promise<void> {
  const { userId, feature, model, promptTokens, completionTokens } = input;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (serviceClient() as any)
      .from('usage_events')
      .insert({
        user_id: userId,
        feature,
        model,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        cost_inr: Number(
          estimateCostInr(model, promptTokens, completionTokens).toFixed(4),
        ),
      });
  } catch (err) {
    console.warn('[usage] failed to log usage event:', err);
  }
}
