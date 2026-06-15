// Client-side helpers for surfacing quota/upgrade prompts.
// The metered API routes return HTTP 402 { upgrade:true, feature, plan, quota, used }
// when a plan limit is hit; handleQuota() turns that into a global upgrade toast
// (rendered by <UpgradeToast/> mounted in the dashboard layout).

export interface QuotaPrompt {
  feature?: string;
  plan?: string;
  quota?: number;
  used?: number;
  message?: string;
}

export const QUOTA_EVENT = 'jobscorer:quota';

/** Fire the global upgrade prompt. Safe to call from anywhere client-side. */
export function showUpgradePrompt(info: QuotaPrompt): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<QuotaPrompt>(QUOTA_EVENT, { detail: info }));
}

/**
 * Inspect a fetch Response: if it's a 402 quota block, fire the upgrade prompt
 * and return true (caller should stop). Otherwise return false. Clones the
 * response so the caller can still read the body if needed.
 */
export async function handleQuota(res: Response): Promise<boolean> {
  if (res.status !== 402) return false;
  try {
    const body = await res.clone().json();
    if (body?.upgrade) {
      showUpgradePrompt({
        feature: body.feature,
        plan: body.plan,
        quota: body.quota,
        used: body.used,
        message: body.error,
      });
      return true;
    }
  } catch {
    /* not a quota body */
  }
  return false;
}
