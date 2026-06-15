'use client';

import { C, MONO, SANS } from './tokens';

type Logo = {
  name: string;
  color: string;
  weight?: string;
  spacing?: string;
  font?: string;
  accent?: string;
  parts?: [string, string];
};

const LOGOS: Logo[] = [
  { name: 'TCS',           color: '#1e2a78', weight: '800', spacing: '1px' },
  { name: 'Infosys',       color: '#0b5caa', weight: '700' },
  { name: 'Wipro',         color: '#341f6b', weight: '800' },
  { name: 'HCLTech',       color: '#0075c9', accent: '#1a1a1a', parts: ['HCL', 'Tech'] },
  { name: 'Tech Mahindra', color: '#e31837', weight: '700' },
  { name: 'Cognizant',     color: '#1a3ca6', weight: '700' },
  { name: 'Capgemini',     color: '#0070ad', weight: '700' },
  { name: 'Accenture',     color: '#a100ff', weight: '800' },
  { name: 'Deloitte',      color: '#1a1a1a', accent: '#86bc25', parts: ['Deloitte', '.'] },
  { name: 'HSBC',          color: '#db0011', weight: '800', spacing: '1px' },
  { name: 'Dell',          color: '#007db8', weight: '800', spacing: '1px' },
  { name: 'Wells Fargo',   color: '#d71e28', weight: '700' },
  { name: 'Amazon',        color: '#232f3e', accent: '#ff9900', parts: ['amaz', 'on'] },
  { name: 'Microsoft',     color: '#5e5e5e', weight: '600' },
  { name: 'Salesforce',    color: '#00a1e0', weight: '700', font: 'Georgia,serif' },
  { name: 'Flipkart',      color: '#2874f0', weight: '800' },
  { name: 'Razorpay',      color: '#0f172a', accent: '#2563eb', parts: ['razor', 'pay'] },
  { name: 'Zoho',          color: '#e42527', weight: '700' },
];

function LogoMark({ co }: { co: Logo }) {
  return (
    <span
      style={{
        fontFamily: co.font || SANS,
        fontWeight: co.weight || '700',
        fontSize: 20,
        color: co.color,
        letterSpacing: co.spacing || '-0.01em',
        opacity: 0.9,
        lineHeight: 1.5,
        padding: '2px 0',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {co.parts ? (
        <>
          <span>{co.parts[0]}</span>
          <span style={{ color: co.accent }}>{co.parts[1]}</span>
        </>
      ) : (
        co.name
      )}
    </span>
  );
}

export default function TrustBar() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32, paddingTop: 40, borderTop: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, width: '100%' }}>
        <span style={{ fontFamily: MONO, fontSize: '0.6875rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: C.textTer, fontWeight: 600 }}>
          Land interviews at companies like
        </span>
        <div
          style={{
            width: '100%',
            overflow: 'hidden',
            WebkitMaskImage: 'linear-gradient(90deg,transparent 0,black 8%,black 92%,transparent 100%)',
            maskImage: 'linear-gradient(90deg,transparent 0,black 8%,black 92%,transparent 100%)',
          }}
        >
          <div className="logo-marquee" style={{ display: 'flex', gap: 48, alignItems: 'center', width: 'max-content', padding: '4px 0' }}>
            {LOGOS.map((co, i) => <LogoMark key={`a${i}`} co={co} />)}
            {LOGOS.map((co, i) => <LogoMark key={`b${i}`} co={co} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
