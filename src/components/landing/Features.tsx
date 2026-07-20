'use client';

import { C, SANS, MONO } from './tokens';
import { getReceipt, type ReceiptKey } from './Receipts';
import { useScrollReveal } from './useScrollReveal';

type Feat = {
  n: string;
  label: string;
  title: string;
  desc: string;
  proof: string[];
  r: ReceiptKey;
  side: 'left' | 'right';
};

const FEATS: Feat[] = [
  { n: '01', label: 'Application Tracker',  title: 'Your entire job hunt in one kanban.', desc: 'Applied, Interview, Offer, Rejected — all in one board. Per-role interview prep checklists generated automatically. Confetti when you land an offer. You earned it.', proof: ['4-column kanban: Applied / Interview / Offer / Rejected', 'Per-role interview prep checklist auto-generated', 'Application timeline with status history and notes'], r: 'kanban', side: 'right' },
  { n: '02', label: 'Paste Any Job',        title: 'Score any JD in 10 seconds.',        desc: 'Found something on Naukri, LinkedIn, Instahyre, or a referral email? Paste the raw JD. Get an instant match score, full reasoning, and an optimization path.',       proof: ['Works with any job source — paste raw text, no formatting', 'Naukri, LinkedIn, Instahyre, Internshala, referrals all work', 'Score + reasoning + optimized resume path in under 10 s'], r: 'paste', side: 'left' },
];

export default function Features() {
  const ref = useScrollReveal<HTMLDivElement>([
    { selector: '.feat-right', from: { x: 40, y: 0 } },
    { selector: '.feat-left', from: { x: -40, y: 0 } },
    { selector: '.feat-proof', from: { y: 12 }, stagger: 0.08 },
  ]);

  return (
    <section style={{ padding: '80px 0', background: C.bg }}>
      <div ref={ref} style={{ maxWidth: 1200, margin: '0 auto', padding: '0 32px' }}>
        <div style={{ marginBottom: 64 }}>
          <div style={{ fontFamily: MONO, fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.primary, marginBottom: 12 }}>
            Also included
          </div>
          <h2 style={{ fontFamily: SANS, fontSize: 'clamp(1.75rem,3vw,2.5rem)', fontWeight: 800, letterSpacing: '-0.03em', color: C.text, lineHeight: 1.15, maxWidth: 520 }}>
            Two more things it does.
          </h2>
        </div>

        {FEATS.map((f, i) => (
          <div
            key={f.n}
            className={`feat-row ${f.side === 'right' ? 'feat-right' : 'feat-left'}`}
            style={{
              display: 'flex',
              flexDirection: f.side === 'right' ? 'row' : 'row-reverse',
              gap: 64,
              alignItems: 'center',
              padding: '60px 0',
              borderBottom: i < FEATS.length - 1 ? `1px solid ${C.border}` : 'none',
            }}
          >
            <div style={{ flex: '0 0 auto', width: '46%', display: 'flex', justifyContent: 'center' }}>
              {getReceipt(f.r)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <span style={{ fontFamily: MONO, fontWeight: 800, fontSize: '0.75rem', color: C.primary }}>{f.n}</span>
                <div style={{ flex: 1, height: 1, background: C.border }} />
                <span style={{ fontFamily: MONO, fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.textTer }}>{f.label}</span>
              </div>
              <h3 style={{ fontFamily: SANS, fontSize: 'clamp(1.25rem,2.5vw,1.75rem)', fontWeight: 800, letterSpacing: '-0.02em', color: C.text, lineHeight: 1.2, marginBottom: 12 }}>
                {f.title}
              </h3>
              <p style={{ fontSize: '0.9375rem', color: C.textSec, lineHeight: 1.75, marginBottom: 20 }}>{f.desc}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {f.proof.map((p, j) => (
                  <div key={j} className="feat-proof" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.success} strokeWidth="2.5" style={{ flexShrink: 0, marginTop: 3 }}><path d="M5 12l5 5L20 7"/></svg>
                    <span style={{ fontSize: '0.875rem', color: C.textSec, lineHeight: 1.6 }}>{p}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
