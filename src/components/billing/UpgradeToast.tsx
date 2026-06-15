'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { QUOTA_EVENT, type QuotaPrompt } from '@/lib/quota';

const PRIMARY = '#135bec';
const EASE = 'cubic-bezier(0.22,0.65,0.28,1)';

const FEATURE_LABELS: Record<string, string> = {
  job_search: 'job searches',
  score: 'AI match runs',
  optimize: 'resume optimizations',
  company_research: 'company researches',
  build_plan: 'build plans',
  chat: 'AI chat messages',
  learning_path: 'learning paths',
  resumes: 'résumé slots',
  applications: 'tracked applications',
};

/**
 * Global listener for quota/upgrade events (fired by lib/quota showUpgradePrompt).
 * Renders a dismissible bottom-center toast with an Upgrade CTA. Mount once,
 * high in the tree (dashboard layout).
 */
export default function UpgradeToast() {
  const [prompt, setPrompt] = useState<QuotaPrompt | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    function onQuota(e: Event) {
      const detail = (e as CustomEvent<QuotaPrompt>).detail;
      setPrompt(detail ?? {});
    }
    window.addEventListener(QUOTA_EVENT, onQuota as EventListener);
    return () => window.removeEventListener(QUOTA_EVENT, onQuota as EventListener);
  }, []);

  // Auto-dismiss after 9s.
  useEffect(() => {
    if (!prompt) return;
    const t = setTimeout(() => setPrompt(null), 9000);
    return () => clearTimeout(t);
  }, [prompt]);

  // Don't show on the billing page itself — they're already there.
  if (!prompt || pathname === '/dashboard/billing') return null;

  const label = prompt.feature ? FEATURE_LABELS[prompt.feature] ?? prompt.feature : 'this feature';
  const planName = prompt.plan ? prompt.plan.charAt(0).toUpperCase() + prompt.plan.slice(1) : 'your';

  return (
    <div
      style={{
        position: 'fixed', left: '50%', bottom: 28, transform: 'translateX(-50%)', zIndex: 1000,
        width: 'min(460px, calc(100vw - 32px))',
        background: '#0f172a', color: '#fff', borderRadius: 16, padding: '16px 18px',
        boxShadow: '0 20px 50px -12px rgba(15,23,42,.5)', display: 'flex', alignItems: 'flex-start', gap: 14,
        animation: `ut-rise .35s ${EASE} both`,
      }}
      role="status"
    >
      <style>{`@keyframes ut-rise { from { opacity:0; transform: translate(-50%, 14px);} to {opacity:1; transform: translate(-50%,0);} }`}</style>
      <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={PRIMARY} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 3 }}>
          You&apos;ve hit your {planName} plan limit
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,.7)', lineHeight: 1.45 }}>
          {prompt.message || `You're out of ${label} for this month. Upgrade for higher limits.`}
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
          <Link
            href="/dashboard/billing"
            onClick={() => setPrompt(null)}
            style={{
              background: PRIMARY, color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none',
              padding: '8px 16px', borderRadius: 999,
            }}
          >
            See plans
          </Link>
          <button
            onClick={() => setPrompt(null)}
            style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,.6)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
