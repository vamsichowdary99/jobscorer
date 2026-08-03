import type { Metadata } from 'next'
import LegalPageLayout, { LegalSection } from '@/components/legal/LegalPageLayout'

export const metadata: Metadata = { title: 'Cookie Policy' }

export default function CookiePolicyPage() {
  return (
    <LegalPageLayout title="Cookie Policy" lastUpdated="[FILL-IN: DATE]">
      <p style={{ marginBottom: 24 }}>
        Cookies are small text files (and similar technologies like local storage) that websites store on
        your device. This policy explains what JobScorer uses and how you can control them. When you first
        visit, our cookie banner lets you accept or decline optional analytics cookies — essential cookies
        are always active because the service cannot function without them.
      </p>

      <LegalSection heading="1. Essential cookies (always active)">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ padding: '8px 8px 8px 0' }}>Name</th>
              <th style={{ padding: '8px' }}>Purpose</th>
              <th style={{ padding: '8px' }}>Duration</th>
              <th style={{ padding: '8px 0 8px 8px' }}>Opt out</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '8px 8px 8px 0' }}>Supabase auth cookies</td>
              <td style={{ padding: 8 }}>Keep you signed in and secure your session</td>
              <td style={{ padding: 8 }}>Session / until sign-out</td>
              <td style={{ padding: '8px 0 8px 8px' }}>Required — signing out clears them</td>
            </tr>
            <tr>
              <td style={{ padding: '8px 8px 8px 0' }}><code>rs-consent</code> (local storage)</td>
              <td style={{ padding: 8 }}>Remembers your cookie banner choice</td>
              <td style={{ padding: 8 }}>Until cleared</td>
              <td style={{ padding: '8px 0 8px 8px' }}>Clear browser storage — you&apos;ll be re-prompted</td>
            </tr>
          </tbody>
        </table>
        <p style={{ marginTop: 12 }}>These are required for the service to function and cannot be
        disabled without preventing you from signing in.</p>
      </LegalSection>

      <LegalSection heading="2. Analytics cookies (only with your consent)">
        <p>
          If you click <strong>&quot;Accept analytics&quot;</strong> in our cookie banner, we load{' '}
          <strong>PostHog</strong> to understand how JobScorer is used (pages viewed, actions taken,
          device/browser type). PostHog is <strong>not loaded at all</strong> unless you opt in — if you
          choose &quot;Essential only,&quot; no analytics cookies are set.
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', marginTop: 12 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ padding: '8px 8px 8px 0' }}>Name</th>
              <th style={{ padding: '8px' }}>Purpose</th>
              <th style={{ padding: '8px' }}>Duration</th>
              <th style={{ padding: '8px 0 8px 8px' }}>Opt out</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '8px 8px 8px 0' }}><code>ph_*</code> (PostHog)</td>
              <td style={{ padding: 8 }}>Distinguishes users, measures aggregate product usage</td>
              <td style={{ padding: 8 }}>Up to 1 year</td>
              <td style={{ padding: '8px 0 8px 8px' }}>Choose &quot;Essential only&quot; in the cookie banner, or clear browser data</td>
            </tr>
          </tbody>
        </table>
        <p style={{ marginTop: 12 }}>
          You can change your choice at any time by clearing your browser&apos;s local storage for this
          site, which re-triggers the cookie banner.
        </p>
      </LegalSection>

      <LegalSection heading="3. Advertising / tracking cookies">
        <p>We do not currently use third-party advertising or retargeting cookies. If that changes, this
        policy and our consent banner will be updated accordingly, and such cookies will only be set with
        your consent.</p>
      </LegalSection>

      <LegalSection heading="4. Managing cookies">
        <p>You can clear or block cookies at any time in your browser settings; note that blocking
        essential cookies will prevent you from signing in. JobScorer does not currently respond to
        browser Do Not Track signals, as no uniform standard exists for interpreting them.</p>
      </LegalSection>

      <LegalSection heading="5. Contact">
        <p>Questions: <strong>[FILL-IN: SUPPORT EMAIL]</strong></p>
      </LegalSection>

      <p style={{ marginTop: 40, fontSize: '0.8125rem', color: '#94a3b8' }}>
        This page uses generated placeholder text for a legal document and has not been reviewed by a
        lawyer. Replace the [FILL-IN: …] field and have this policy reviewed before relying on it.
      </p>
    </LegalPageLayout>
  )
}
