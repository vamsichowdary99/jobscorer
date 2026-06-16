'use client';

import Link from 'next/link';
import React, { useState } from 'react';
import { C, MONO, INTER } from './tokens';

type Plan = {
  id: 'free' | 'starter' | 'pro' | 'power';
  name: string;
  tagline: string;
  monthlyPrice: string;
  yearlyPrice: string;
  monthlyLabel: string;
  yearlyLabel: string;
  yearlySaving: string | null;
  badge: string | null;
  hero: boolean;
  cta: string;
  href: string;
  features: string[];
};

const PLANS: Plan[] = [
  {
    id: 'free', name: 'Free', tagline: 'Test the waters, no card needed',
    monthlyPrice: '₹0', yearlyPrice: '₹0',
    monthlyLabel: 'forever', yearlyLabel: 'forever',
    yearlySaving: null, badge: null, hero: false,
    cta: 'Get started free →', href: '/signup',
    features: ['5 job searches / month', '3 AI match runs / month', '1 tailored resume / month', '2 company researches / month', '10 AI chat messages / month', '3 applications tracked', '1 résumé template'],
  },
  {
    id: 'pro', name: 'Pro', tagline: 'Land interviews faster',
    monthlyPrice: '₹299', yearlyPrice: '₹2,499',
    monthlyLabel: '/month', yearlyLabel: '/year',
    yearlySaving: 'You save ₹1,089 vs monthly', badge: '⭐ RECOMMENDED', hero: true,
    cta: 'Start Pro Plan →', href: '/signup',
    features: ['60 job searches / month', '30 AI match runs / month', '20 tailored resumes / month', '20 company researches / month', '200 AI chat messages / month', '10 build plans + 15 learning paths', 'Unlimited application tracking', 'All 4 ATS résumé templates', 'Skill-gap analysis'],
  },
  {
    id: 'power', name: 'Max', tagline: 'Go all-in on your search',
    monthlyPrice: '₹599', yearlyPrice: '₹4,999',
    monthlyLabel: '/month', yearlyLabel: '/year',
    yearlySaving: 'You save ₹2,189 vs monthly', badge: null, hero: false,
    cta: 'Start Max Plan →', href: '/signup',
    features: ['200 job searches / month', '80 AI match runs / month', '40 tailored resumes / month', '40 company researches / month', '600 AI chat messages / month', '30 build plans + 30 learning paths', 'Everything in Pro', 'Priority support · 12h response'],
  },
];

type Row = { section?: string; label?: string; vals?: string[] };

const TABLE_ROWS: Row[] = [
  { section: 'Core Features' },
  { label: 'Job searches / month',     vals: ['5', '60', '200'] },
  { label: 'AI match runs / month',    vals: ['3', '30', '80'] },
  { label: 'Tailored resumes / month', vals: ['1', '20', '40'] },
  { label: 'Company researches / month', vals: ['2', '20', '40'] },
  { label: 'AI chat messages / month', vals: ['10', '200', '600'] },
  { label: 'Build plans / month',      vals: ['1', '10', '30'] },
  { label: 'Learning paths / month',   vals: ['1', '15', '30'] },
  { label: 'Application tracking',     vals: ['3', 'Unlimited', 'Unlimited'] },
  { section: 'AI Intelligence' },
  { label: 'Resume fit score',         vals: ['✅', '✅', '✅'] },
  { label: 'Skill-gap analysis',       vals: ['✅', '✅', '✅'] },
  { label: 'Company intelligence',     vals: ['Basic', 'Full', 'Full'] },
  { label: 'ATS résumé templates',     vals: ['1', 'All 4', 'All 4'] },
  { section: 'Support' },
  { label: 'Support channel',          vals: ['Community', 'Email', 'Priority email'] },
  { label: 'Response time',            vals: ['—', '24 hrs', '12 hrs'] },
];

const FAQS = [
  { q: 'Is my resume data private?', a: 'Yes. Your resume is encrypted at rest, never shared with third parties, and never used to train AI models. We process it only to generate your fit scores and optimizations. You can delete your data any time from account settings.' },
  { q: 'Will the AI-rewritten resume actually pass real ATS systems?', a: 'Yes — we test every output against the ATS patterns used by Naukri, LinkedIn, Workday, and Greenhouse. No tables, no text boxes, no headers that scanners choke on. Single-column, clean, machine-readable PDF.' },
  { q: 'Can I switch plans anytime?', a: 'Yes. Upgrade or downgrade anytime. Upgrades take effect immediately. Downgrades apply at the next billing cycle.' },
  { q: 'Is there a free trial for paid plans?', a: 'Our Free plan is a permanent free tier — no time limit. It gives you enough to experience the value. Upgrade when you need more fit scores.' },
  { q: 'How does the 7-day refund work?', a: 'Not satisfied within 7 days of upgrading? Email hello@jobscorer.in for a full refund. No questions asked.' },
  { q: 'Do unused searches carry over monthly?', a: 'Searches and generations reset each month. Unused credits do not carry over to the next cycle.' },
  { q: 'What payment methods do you accept?', a: 'All UPI apps (GPay, PhonePe, Paytm), credit cards, debit cards, and net banking via Razorpay. 256-bit SSL secured.' },
];

const DARK = '#0f172a';
const DARK2 = '#f1f5f9';
const DIM = '#64748b';
const WHITE = '#ffffff';
const EASE = 'cubic-bezier(0.22,0.65,0.28,1)';

export default function Pricing() {
  const [isYearly, setIsYearly] = useState(false);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  return (
    <section id="pricing" style={{ background: WHITE, fontFamily: INTER }}>
      {/* ① HEADER + CARDS */}
      <div style={{ padding: '96px 0 72px' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 32px' }}>
          {/* Badge + headline */}
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <span style={{ display: 'inline-block', padding: '5px 16px', borderRadius: 999, background: C.primaryLight, color: C.primary, fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 16 }}>
              Simple Pricing
            </span>
            <h2 style={{ fontFamily: INTER, fontSize: 'clamp(2rem,4vw,2.75rem)', fontWeight: 700, letterSpacing: '-0.03em', color: DARK, marginBottom: 14, lineHeight: 1.1 }}>
              Choose your JobScorer plan
            </h2>
            <p style={{ fontSize: 16, color: DIM, maxWidth: 440, margin: '0 auto 32px', lineHeight: 1.65 }}>
              Start free. Upgrade when you&apos;re ready.<br />No hidden fees. Cancel anytime.
            </p>
            {/* Toggle */}
            <div className="pricing-toggle" style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '8px 8px 8px 20px', background: DARK2, borderRadius: 999, border: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 14, fontWeight: isYearly ? 500 : 700, color: isYearly ? DIM : C.primary, transition: 'color .2s, font-weight .2s' }}>Monthly</span>
              <div
                role="switch"
                aria-checked={isYearly}
                tabIndex={0}
                onClick={() => setIsYearly(v => !v)}
                onKeyDown={e => { if (e.key === ' ') setIsYearly(v => !v); }}
                style={{ position: 'relative', width: 44, height: 24, borderRadius: 999, background: isYearly ? C.primary : C.border, cursor: 'pointer', transition: `background .2s ${EASE}`, flexShrink: 0 }}
              >
                <div style={{ position: 'absolute', top: 3, left: isYearly ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: WHITE, boxShadow: '0 1px 4px rgba(0,0,0,.18)', transition: `left .2s ${EASE}` }} />
              </div>
              <span style={{ fontSize: 14, fontWeight: isYearly ? 700 : 500, color: isYearly ? C.primary : DIM, transition: 'color .2s, font-weight .2s' }}>Annual</span>
              <span className="pricing-save-badge" style={{ padding: '4px 12px', background: '#ecfdf5', color: C.success, border: '1px solid #a7f3d0', borderRadius: 999, fontSize: 11, fontWeight: 700, fontFamily: MONO }}>Save up to 30%</span>
            </div>
          </div>

          {/* 4 Cards */}
          <div className="pricing-cards" style={{ display: 'grid', gap: 16, alignItems: 'stretch' }}>
            {PLANS.map(plan => (
              <div
                key={plan.id}
                data-pricing-hero={plan.hero ? 'true' : 'false'}
                style={{
                  background: plan.hero ? C.primary : WHITE,
                  border: plan.hero ? 'none' : `1px solid ${C.border}`,
                  borderRadius: 20,
                  padding: '32px 28px',
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: plan.hero ? '0 20px 60px -12px rgba(19,91,236,0.45)' : '0 2px 8px rgba(15,23,42,0.06)',
                  position: 'relative',
                  transform: plan.hero ? 'translateY(-12px) scale(1.02)' : 'none',
                  zIndex: plan.hero ? 2 : 1,
                  transition: `box-shadow .25s ${EASE}, transform .25s ${EASE}, border-color .25s ${EASE}`,
                  cursor: 'default',
                }}
                onMouseEnter={e => {
                  if (plan.hero) {
                    e.currentTarget.style.transform = 'translateY(-18px) scale(1.03)';
                    e.currentTarget.style.boxShadow = '0 32px 80px -12px rgba(19,91,236,0.60)';
                  } else {
                    e.currentTarget.style.transform = 'translateY(-6px)';
                    e.currentTarget.style.boxShadow = '0 16px 40px -8px rgba(15,23,42,0.16)';
                    e.currentTarget.style.borderColor = C.primary;
                  }
                }}
                onMouseLeave={e => {
                  if (plan.hero) {
                    e.currentTarget.style.transform = 'translateY(-12px) scale(1.02)';
                    e.currentTarget.style.boxShadow = '0 20px 60px -12px rgba(19,91,236,0.45)';
                  } else {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(15,23,42,0.06)';
                    e.currentTarget.style.borderColor = C.border;
                  }
                }}
              >
                <div style={{ marginBottom: 14, minHeight: 26 }}>
                  {plan.badge && (
                    <span style={{
                      padding: '3px 12px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 700,
                      fontFamily: MONO,
                      letterSpacing: '0.06em',
                      background: plan.hero ? 'rgba(255,255,255,.15)' : C.primaryLight,
                      color: plan.hero ? WHITE : C.primary,
                      border: plan.hero ? '1px solid rgba(255,255,255,.25)' : '1px solid #bdd0fa',
                    }}>{plan.badge}</span>
                  )}
                </div>
                <h3 style={{ fontFamily: INTER, fontWeight: 700, fontSize: 24, color: plan.hero ? WHITE : DARK, letterSpacing: '-0.02em', marginBottom: 4 }}>
                  {plan.name}
                </h3>
                <p style={{ fontSize: 13, color: plan.hero ? 'rgba(255,255,255,.72)' : DIM, marginBottom: 0, lineHeight: '20px', height: 20, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {plan.tagline}
                </p>

                <div style={{ height: 96, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', marginBottom: 20, marginTop: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
                    <span style={{ fontFamily: INTER, fontWeight: 700, fontSize: 48, letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: plan.hero ? WHITE : DARK }}>
                      {isYearly ? plan.yearlyPrice : plan.monthlyPrice}
                    </span>
                    {plan.id !== 'free' && (
                      <span style={{ fontSize: 14, color: plan.hero ? 'rgba(255,255,255,.6)' : DIM, fontWeight: 400 }}>
                        {isYearly ? plan.yearlyLabel : plan.monthlyLabel}
                      </span>
                    )}
                  </div>
                  {isYearly && plan.yearlySaving && (
                    <p style={{ fontSize: 12, fontWeight: 600, fontFamily: MONO, letterSpacing: '0.03em', margin: '8px 0 0', color: plan.hero ? 'rgba(255,255,255,0.75)' : C.success }}>
                      {plan.yearlySaving}
                    </p>
                  )}
                </div>

                <Link href={plan.href} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: 48,
                  borderRadius: 999,
                  marginBottom: 28,
                  background: plan.hero ? WHITE : DARK,
                  color: plan.hero ? C.primary : WHITE,
                  fontSize: 14,
                  fontWeight: 700,
                  fontFamily: INTER,
                  whiteSpace: 'nowrap',
                  textDecoration: 'none',
                  transition: `all .2s ${EASE}`,
                  boxShadow: plan.hero ? '0 2px 8px rgba(0,0,0,.10)' : 'none',
                }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '.88'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'none'; }}
                >
                  {plan.cta}
                </Link>

                <div style={{ height: 1, background: plan.hero ? 'rgba(255,255,255,.18)' : C.border, marginBottom: 20 }} />

                <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 0, listStyle: 'none', flex: 1 }}>
                  {plan.features.map((f, fi) => (
                    <li key={fi} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: plan.hero ? 'rgba(255,255,255,.85)' : C.textSec, lineHeight: 1.4 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                        <path d="M5 13l4 4L19 7" stroke={plan.hero ? WHITE : C.success} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p style={{ textAlign: 'center', fontSize: 13, color: C.textTer, marginTop: 40, fontFamily: INTER }}>
            No credit card required · Cancel anytime · Built in India 🇮🇳
          </p>
        </div>
      </div>

      {/* ② COMPARISON TABLE */}
      <div style={{ background: C.bg, padding: '80px 0' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 32px' }}>
          <h3 style={{ fontFamily: INTER, fontSize: 'clamp(1.5rem,3vw,2rem)', fontWeight: 700, letterSpacing: '-0.03em', color: DARK, textAlign: 'center', marginBottom: 48 }}>
            See everything that&apos;s included
          </h3>
          <div className="cmp-table-wrap" style={{ overflowX: 'visible', background: WHITE, borderRadius: 18, border: `1px solid ${C.border}`, boxShadow: '0 4px 24px rgba(15,23,42,0.05)', padding: '8px 8px 16px' }}>
            <table className="cmp-table" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: INTER }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '14px 16px', fontSize: 13, fontWeight: 700, color: DARK, width: '28%', position: 'sticky', top: 64, zIndex: 5, background: WHITE, borderBottom: `2px solid ${C.border}` }}>
                    Feature
                  </th>
                  {PLANS.map(p => (
                    <th
                      key={p.id}
                      style={{
                        textAlign: 'center',
                        padding: '14px 16px',
                        fontSize: 13,
                        fontWeight: 700,
                        color: p.hero ? C.primary : DARK,
                        width: '24%',
                        position: 'sticky',
                        top: 64,
                        zIndex: 5,
                        background: p.hero ? '#eef4ff' : WHITE,
                        borderBottom: `2px solid ${p.hero ? C.primary : C.border}`,
                        borderTopLeftRadius: p.hero ? 10 : 0,
                        borderTopRightRadius: p.hero ? 10 : 0,
                      }}
                    >
                      {p.name}
                      {p.hero && <span style={{ display: 'block', fontSize: 10, fontFamily: MONO, color: C.primary, letterSpacing: '0.08em' }}>★ RECOMMENDED</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TABLE_ROWS.map((row, ri) =>
                  row.section ? (
                    <tr key={ri}>
                      <td style={{ padding: '20px 16px 8px', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.primary, fontFamily: MONO }}>
                        {row.section}
                      </td>
                      {PLANS.map(p => (
                        <td key={p.id} style={{ background: p.hero ? '#eef4ff' : 'transparent' }} />
                      ))}
                    </tr>
                  ) : (
                    <tr key={ri} style={{ borderBottom: `1px solid ${C.borderFaint}` }}>
                      <td style={{ padding: '12px 16px', fontSize: 14, color: DIM, background: ri % 2 === 0 ? 'transparent' : 'rgba(248,250,252,.5)' }}>
                        {row.label}
                      </td>
                      {row.vals!.map((v, vi) => (
                        <td
                          key={vi}
                          style={{
                            textAlign: 'center',
                            padding: '12px 16px',
                            fontSize: 14,
                            fontWeight: (v === '✅' || v === '❌') ? 400 : 500,
                            color: v === '✅' ? C.success : v === '❌' ? C.textTer : PLANS[vi].hero ? C.primary : DARK,
                            background: PLANS[vi].hero ? '#eef4ff' : ri % 2 === 0 ? 'transparent' : 'rgba(248,250,252,.5)',
                          }}
                        >
                          {v === '✅' ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', background: '#dcfce7', border: '1.5px solid #86efac' }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                                <path d="M5 13l4 4L19 7" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </span>
                          ) : v === '❌' ? (
                            <span style={{ display: 'inline-block', width: 14, height: 2.5, borderRadius: 2, background: '#cbd5e1' }} />
                          ) : v}
                        </td>
                      ))}
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
          <p style={{ textAlign: 'center', fontSize: 12.5, color: C.textTer, marginTop: 28, fontFamily: MONO, letterSpacing: '0.02em' }}>
            🚧 Coming soon: real-time job alerts · interview prep &amp; STAR stories · ghost-job detection
          </p>
        </div>
      </div>

      {/* ③ TRUST BADGES */}
      <div style={{ background: C.bg, padding: '56px 0', borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div className="trust-grid" style={{ maxWidth: 920, margin: '0 auto', padding: '0 32px', display: 'flex', alignItems: 'stretch', justifyContent: 'center', gap: 0, flexWrap: 'wrap' }}>
          {[
            { icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>, title: 'Secure Payments', sub: 'Powered by Razorpay · 256-bit SSL' },
            { icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>, title: '7-Day Money Back', sub: 'No questions asked · Full refund' },
            { icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>, title: 'Cancel Anytime', sub: 'No lock-ins · Pause instantly' },
          ].map((b, i) => (
            <React.Fragment key={i}>
              {i > 0 && <div className="trust-divider" style={{ width: 1, alignSelf: 'center', height: 48, background: C.border }} />}
              <div className="trust-badge" style={{ flex: '1 1 240px', display: 'flex', alignItems: 'center', gap: 14, padding: '12px 28px', justifyContent: 'center' }}>
                <div style={{ width: 44, height: 44, borderRadius: 11, background: C.primaryLight, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {b.icon}
                </div>
                <div>
                  <div style={{ fontFamily: INTER, fontWeight: 700, fontSize: 14.5, color: DARK, marginBottom: 3 }}>{b.title}</div>
                  <div style={{ fontSize: 12.5, color: DIM, lineHeight: 1.4 }}>{b.sub}</div>
                </div>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ④ FAQ */}
      <div style={{ background: C.bg, padding: '80px 0' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 32px' }}>
          <h3 style={{ fontFamily: INTER, fontSize: 'clamp(1.5rem,3vw,2rem)', fontWeight: 700, letterSpacing: '-0.03em', color: DARK, textAlign: 'center', marginBottom: 40 }}>
            Frequently Asked Questions
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {FAQS.map((faq, fi) => (
              <div
                key={fi}
                style={{ background: WHITE, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden', transition: `box-shadow .2s ${EASE}` }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 12px rgba(15,23,42,0.08)'; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
              >
                <button
                  onClick={() => setFaqOpen(faqOpen === fi ? null : fi)}
                  className="faq-btn"
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 28px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: INTER, fontSize: 18.5, fontWeight: 600, color: DARK, textAlign: 'left', gap: 18 }}
                >
                  {faq.q}
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, transition: `transform .25s ${EASE}`, transform: faqOpen === fi ? 'rotate(180deg)' : 'none' }}>
                    <path d="M6 9l6 6 6-6" stroke={C.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {faqOpen === fi && (
                  <div style={{ padding: '0 28px 24px', fontSize: 15.5, color: DIM, lineHeight: 1.75 }}>{faq.a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
