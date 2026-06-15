import Razorpay from 'razorpay';

/**
 * Server-side Razorpay client. Uses the secret key — never import this into
 * client components. The key_id is public (also used in the browser checkout),
 * but the secret must stay server-only.
 */
let _rzp: Razorpay | null = null;

export function razorpay(): Razorpay {
  if (_rzp) return _rzp;
  const key_id = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) {
    throw new Error('Razorpay keys not configured (NEXT_PUBLIC_RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)');
  }
  _rzp = new Razorpay({ key_id, key_secret });
  return _rzp;
}
