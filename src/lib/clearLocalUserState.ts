import { clearPendingUpload } from './pendingResumeUpload'

// Browser/device-level keys that are NOT tied to a specific logged-in
// account and should survive an account switch (consent flag, anonymous
// analytics/fraud-detection IDs). Every other localStorage key is treated
// as account-scoped and wiped — safe-by-default, so a new key added later
// doesn't silently leak between accounts sharing the same browser.
const KEEP_ACROSS_ACCOUNTS = new Set(['rs-consent', 'rzp_checkout_anon_id', 'rzp_device_id'])

/** Wipes all app-owned localStorage AND sessionStorage state that could leak
 *  between accounts sharing a browser tab (resume drafts, chat history,
 *  cached job searches, the primary-resume pointer, a pending landing-page
 *  upload) while preserving browser-level, non-PII keys. */
export function clearLocalUserState() {
  if (typeof window === 'undefined') return
  const toRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && !KEEP_ACROSS_ACCOUNTS.has(key)) toRemove.push(key)
  }
  toRemove.forEach((k) => localStorage.removeItem(k))
  // sessionStorage's ag_pending_upload_v1 is tab-scoped, not account-scoped —
  // see clearPendingUpload's doc comment for why it needs the same treatment.
  clearPendingUpload()
}
