'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { C, SANS, MONO } from '@/components/landing/tokens';

/* ── Razorpay checkout types (minimal) ───────────────────────────── */
interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
}
interface RazorpayInstance {
  open(): void;
  on(event: string, handler: (resp: { error?: { description?: string } }) => void): void;
}
declare global {
  interface Window { Razorpay: new (options: Record<string, unknown>) => RazorpayInstance }
}

type Plan = 'pro' | 'max';
type Cycle = 'monthly' | 'annual';

const PRICES: Record<Plan, Record<Cycle, number>> = {
  pro: { monthly: 299, annual: 2499 },
  max: { monthly: 599, annual: 4999 },
};

const PLAN_META: Record<Plan, { name: string; tagline: string; features: string[] }> = {
  pro: {
    name: 'Pro',
    tagline: 'For an active job hunt',
    features: ['60 job searches / mo', '30 AI match runs / mo', '20 tailored resumes / mo', '200 AI chat messages / mo', 'Company research + build plans', 'Unlimited application tracking'],
  },
  max: {
    name: 'Max',
    tagline: 'Go all-in on your search',
    features: ['200 job searches / mo', '80 AI match runs / mo', '40 tailored resumes / mo', '600 AI chat messages / mo', 'Everything in Pro', 'Priority support · 12h'],
  },
};

const EASE = 'cubic-bezier(0.22,0.65,0.28,1)';

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && window.Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function BillingPanel() {
  const [cycle, setCycle] = useState<Cycle>('monthly');
  const [email, setEmail] = useState('');
  const [currentPlan, setCurrentPlan] = useState<'free' | Plan>('free');
  const [renewsAt, setRenewsAt] = useState<string | null>(null);
  const [busy, setBusy] = useState<Plan | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState<Plan | null>(null);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const mounted = useRef(false);

  async function refreshPlan() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setEmail(user.email ?? '');
    const { data } = await supabase
      .from('profiles')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select('plan, plan_renews_at' as any)
      .eq('id', user.id)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (data as any)?.plan;
    if (mounted.current) {
      setCurrentPlan(p === 'pro' || p === 'max' ? p : 'free');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setRenewsAt((data as any)?.plan_renews_at ?? null);
    }
  }

  useEffect(() => {
    mounted.current = true;
    void refreshPlan();
    void loadRazorpay();
    fetch('/logo.png')
      .then((r) => r.blob())
      .then((blob) => new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result as string);
        fr.onerror = reject;
        fr.readAsDataURL(blob);
      }))
      .then((d) => { if (mounted.current) setLogoDataUrl(d); })
      .catch(() => {});
    return () => { mounted.current = false; };
  }, []);

  async function startCheckout(plan: Plan) {
    setError(null);
    setBusy(plan);
    try {
      const ok = await loadRazorpay();
      if (!ok) throw new Error('Could not load the secure checkout. Check your connection and retry.');
      const subRes = await fetch('/api/billing/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, cycle }),
      });
      const sub = await subRes.json();
      if (!subRes.ok) throw new Error(sub.error || 'Could not start checkout.');
      const rzp = new window.Razorpay({
        key: sub.key_id,
        subscription_id: sub.subscription_id,
        name: 'JobScorer',
        description: `${PLAN_META[plan].name} plan · ${cycle === 'annual' ? 'billed annually' : 'billed monthly'}`,
        image: logoDataUrl ?? `${window.location.origin}/logo.png`,
        prefill: { email },
        theme: { color: C.primary },
        modal: { ondismiss: () => { if (mounted.current) setBusy(null); } },
        handler: async (resp: RazorpaySuccess) => {
          try {
            const vRes = await fetch('/api/billing/verify', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_payment_id: resp.razorpay_payment_id,
                razorpay_subscription_id: resp.razorpay_subscription_id,
                razorpay_signature: resp.razorpay_signature,
              }),
            });
            const v = await vRes.json();
            if (!vRes.ok || !v.success) throw new Error(v.error || 'Payment verification failed.');
            if (!mounted.current) return;
            setCelebrate(plan);
            void refreshPlan();
          } catch (e) {
            if (mounted.current) setError(e instanceof Error ? e.message : 'Verification failed.');
          } finally {
            if (mounted.current) setBusy(null);
          }
        },
      });
      rzp.on('payment.failed', (r) => {
        if (mounted.current) { setError(r?.error?.description || 'Payment failed. No money was charged — please try again.'); setBusy(null); }
      });
      rzp.open();
    } catch (e) {
      if (mounted.current) { setError(e instanceof Error ? e.message : 'Something went wrong.'); setBusy(null); }
    }
  }

  async function cancelPlan() {
    if (!confirm('Cancel your subscription? You will move to the Free plan and lose your higher limits.')) return;
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/cancel', { method: 'POST' });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || 'Could not cancel.');
      await refreshPlan();
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : 'Could not cancel.');
    } finally {
      if (mounted.current) setCancelling(false);
    }
  }

  const savings: Record<Plan, number> = {
    pro: PRICES.pro.monthly * 12 - PRICES.pro.annual,
    max: PRICES.max.monthly * 12 - PRICES.max.annual,
  };

  return (
    <div style={{ fontFamily: SANS }}>
      <style>{`@keyframes bpx-pop{0%{opacity:0;transform:scale(.92)}60%{transform:scale(1.03)}100%{opacity:1;transform:scale(1)}}@keyframes bpx-spin{to{transform:rotate(360deg)}}.bpx-spin{animation:bpx-spin .7s linear infinite}`}</style>

      {/* Current plan banner */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
        padding: '16px 18px', borderRadius: 14, marginBottom: 22,
        background: currentPlan === 'free' ? C.surfaceAlt : C.primaryLight,
        border: `1px solid ${currentPlan === 'free' ? C.border : '#bdd0fa'}`,
      }}>
        <div>
          <div style={{ fontSize: 13, color: C.textSec, marginBottom: 2 }}>Current plan</div>
          <div style={{ fontSize: 19, fontWeight: 700, color: currentPlan === 'free' ? C.text : C.primary }}>
            {currentPlan === 'free' ? 'Free' : PLAN_META[currentPlan].name}
            {currentPlan !== 'free' && renewsAt && (
              <span style={{ fontSize: 13, fontWeight: 500, color: C.textSec, marginLeft: 10 }}>
                renews {fmtDate(renewsAt)}
              </span>
            )}
          </div>
        </div>
        {currentPlan !== 'free' && (
          <button onClick={cancelPlan} disabled={cancelling}
            style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.textSec, borderRadius: 999, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: cancelling ? 'default' : 'pointer', fontFamily: SANS }}>
            {cancelling ? 'Cancelling…' : 'Cancel plan'}
          </button>
        )}
      </div>

      {/* Cycle toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <span style={{ fontSize: 13.5, fontWeight: cycle === 'monthly' ? 700 : 500, color: cycle === 'monthly' ? C.primary : C.textSec }}>Monthly</span>
        <button role="switch" aria-checked={cycle === 'annual'} aria-label="Toggle annual billing"
          onClick={() => setCycle((v) => (v === 'monthly' ? 'annual' : 'monthly'))}
          style={{ position: 'relative', width: 44, height: 24, borderRadius: 999, border: 'none', cursor: 'pointer', background: cycle === 'annual' ? C.primary : C.border, transition: `background .25s ${EASE}`, padding: 0 }}>
          <span style={{ position: 'absolute', top: 3, left: cycle === 'annual' ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.2)', transition: `left .25s ${EASE}` }} />
        </button>
        <span style={{ fontSize: 13.5, fontWeight: cycle === 'annual' ? 700 : 500, color: cycle === 'annual' ? C.primary : C.textSec }}>Annual</span>
        <span style={{ marginLeft: 4, padding: '3px 10px', borderRadius: 999, fontFamily: MONO, fontSize: 10.5, fontWeight: 700, background: C.successBg, color: C.success, border: `1px solid ${C.successBorder}` }}>Save up to 30%</span>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13, marginBottom: 16 }}>{error}</div>
      )}

      {/* Plan cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        {(['pro', 'max'] as Plan[]).map((plan) => {
          const meta = PLAN_META[plan];
          const isCurrent = currentPlan === plan;
          const hero = plan === 'pro';
          const price = PRICES[plan][cycle];
          return (
            <div key={plan} style={{
              position: 'relative', borderRadius: 16, padding: '22px 20px', display: 'flex', flexDirection: 'column',
              background: hero ? C.primary : C.surface, color: hero ? '#fff' : C.text,
              border: hero ? 'none' : `1px solid ${C.border}`,
              boxShadow: hero ? '0 16px 40px -16px rgba(19,91,236,.45)' : '0 2px 8px rgba(15,23,42,.05)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <h3 style={{ margin: 0, fontSize: 19, fontWeight: 700 }}>{meta.name}</h3>
                {isCurrent
                  ? <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: hero ? 'rgba(255,255,255,.18)' : C.successBg, color: hero ? '#fff' : C.success, border: hero ? '1px solid rgba(255,255,255,.3)' : `1px solid ${C.successBorder}` }}>CURRENT</span>
                  : hero && <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: 'rgba(255,255,255,.16)', border: '1px solid rgba(255,255,255,.28)' }}>POPULAR</span>}
              </div>
              <p style={{ margin: '0 0 14px', fontSize: 12.5, color: hero ? 'rgba(255,255,255,.75)' : C.textSec }}>{meta.tagline}</p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 2 }}>
                <span style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>₹{price.toLocaleString('en-IN')}</span>
                <span style={{ fontSize: 13, color: hero ? 'rgba(255,255,255,.65)' : C.textSec }}>/{cycle === 'annual' ? 'yr' : 'mo'}</span>
              </div>
              <div style={{ height: 16, marginBottom: 16 }}>
                {cycle === 'annual' && <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: hero ? 'rgba(255,255,255,.8)' : C.success }}>save ₹{savings[plan].toLocaleString('en-IN')}/yr</span>}
              </div>
              <button onClick={() => !isCurrent && startCheckout(plan)} disabled={isCurrent || busy !== null}
                style={{
                  height: 44, borderRadius: 999, border: 'none', marginBottom: 16, fontFamily: SANS, fontSize: 14, fontWeight: 700,
                  cursor: isCurrent ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  background: isCurrent ? (hero ? 'rgba(255,255,255,.16)' : C.surfaceAlt) : (hero ? '#fff' : C.text),
                  color: isCurrent ? (hero ? '#fff' : C.textTer) : (hero ? C.primary : '#fff'),
                  opacity: busy !== null && busy !== plan ? 0.55 : 1,
                }}>
                {busy === plan ? (<><svg className="bpx-spin" width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={hero ? C.primary : '#fff'} strokeWidth="2.5" strokeOpacity=".25" /><path d="M21 12a9 9 0 0 0-9-9" stroke={hero ? C.primary : '#fff'} strokeWidth="2.5" strokeLinecap="round" /></svg>Opening…</>)
                  : isCurrent ? 'Current plan' : `Choose ${meta.name}`}
              </button>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
                {meta.features.map((f, i) => (
                  <li key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.4, color: hero ? 'rgba(255,255,255,.9)' : C.textSec }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1.5 }}><path d="M5 13l4 4L19 7" stroke={hero ? '#fff' : C.success} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <p style={{ marginTop: 16, fontSize: 12, color: C.textTer, fontFamily: MONO }}>🔒 Secured by Razorpay · UPI, cards, netbanking · cancel anytime</p>

      {/* Celebrate */}
      {celebrate && (
        <div onClick={() => setCelebrate(null)} style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,.42)', backdropFilter: 'blur(3px)', padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ animation: `bpx-pop .5s ${EASE} both`, background: C.surface, borderRadius: 22, padding: '36px 32px', maxWidth: 380, width: '100%', textAlign: 'center', boxShadow: '0 40px 90px -20px rgba(15,23,42,.4)' }}>
            <div style={{ width: 64, height: 64, margin: '0 auto 18px', borderRadius: '50%', background: C.primaryLight, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke={C.primary} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700, color: C.text }}>Welcome to {PLAN_META[celebrate].name}</h3>
            <p style={{ margin: '0 0 22px', fontSize: 14, color: C.textSec, lineHeight: 1.6 }}>Your plan is active and your higher limits are live right now.</p>
            <button onClick={() => setCelebrate(null)} style={{ height: 44, padding: '0 26px', borderRadius: 999, border: 'none', cursor: 'pointer', background: C.primary, color: '#fff', fontFamily: SANS, fontSize: 14, fontWeight: 700 }}>Start using it</button>
          </div>
        </div>
      )}
    </div>
  );
}
