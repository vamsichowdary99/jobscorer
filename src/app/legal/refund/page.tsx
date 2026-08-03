import type { Metadata } from 'next'
import LegalPageLayout, { LegalSection } from '@/components/legal/LegalPageLayout'

export const metadata: Metadata = { title: 'Refund & Cancellation Policy' }

export default function RefundPolicyPage() {
  return (
    <LegalPageLayout title="Refund & Cancellation Policy" lastUpdated="[FILL-IN: DATE]">
      <p style={{ marginBottom: 24 }}>
        This policy explains how cancellation and refunds work for JobScorer&apos;s paid subscription
        plans, billed through Razorpay. It should be read together with our{' '}
        <a href="/legal/terms" style={{ color: '#135bec' }}>Terms of Service</a> §8.
      </p>

      <LegalSection heading="1. Cancelling your subscription">
        <p>
          You can cancel your subscription at any time from your account billing settings — no need to
          contact support. Cancellation stops future billing immediately: you will not be charged again
          on your next renewal date. You keep full access to your paid plan until the end of the billing
          period you already paid for.
        </p>
      </LegalSection>

      <LegalSection heading="2. Refund eligibility">
        <p>
          <strong>[FILL-IN: CONFIRM BUSINESS POLICY]</strong> — the section below is a common SaaS default
          for a first release; adjust to your actual refund stance before publishing:
        </p>
        <ul>
          <li><strong>Within 7 days of first payment</strong> — if you subscribed to a paid plan for the
            first time and are not satisfied, contact us within 7 days of the charge for a full refund of
            that payment, no questions asked.</li>
          <li><strong>After 7 days / on renewal charges</strong> — charges are non-refundable once the
            7-day window has passed. Since you can cancel at any time to stop future renewals, and you
            retain access through the period you already paid for, we do not offer pro-rated refunds for
            unused time within a billing period.</li>
          <li><strong>Billing errors or duplicate charges</strong> — always eligible for a full refund.
            Contact us with your payment reference and we will investigate within 5 business days.</li>
          <li><strong>Service failure</strong> — if a paid feature you were charged for was materially
            unavailable due to an error on our side for a significant portion of your billing period,
            contact us and we will review for a partial or full refund at our discretion.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="3. How to request a refund">
        <p>
          Email <strong>[FILL-IN: SUPPORT EMAIL]</strong> with your account email and the reason for your
          request. We aim to respond within 5 business days. Approved refunds are issued to your original
          payment method via Razorpay and typically appear within 5–10 business days, depending on your
          bank or card network.
        </p>
      </LegalSection>

      <LegalSection heading="4. What happens to your data after cancellation">
        <p>
          Cancelling a paid plan does not delete your account or data — you keep your free-tier access and
          all previously generated resumes, matches, and history. If you want your data fully deleted,
          use Settings → Danger Zone, which erases your account within 7 days (typically immediately), per
          our <a href="/legal/privacy" style={{ color: '#135bec' }}>Privacy Policy</a>.
        </p>
      </LegalSection>

      <LegalSection heading="5. Statutory rights">
        <p>
          Nothing in this policy limits any non-waivable consumer right you have under Indian law or the
          law of your country of residence. If you are located in the EU/EEA or UK, you may have a
          statutory right to withdraw from a digital service contract within 14 days of subscribing,
          separate from the policy above — contact us to exercise this right if applicable to you.
        </p>
      </LegalSection>

      <LegalSection heading="6. Changes to this policy">
        <p>We may update this policy from time to time. Material changes will be posted here with a new
        &quot;Last updated&quot; date and will not apply retroactively to charges already made.</p>
      </LegalSection>

      <LegalSection heading="7. Contact">
        <p>Questions about billing or refunds: <strong>[FILL-IN: SUPPORT EMAIL]</strong></p>
      </LegalSection>

      <p style={{ marginTop: 40, fontSize: '0.8125rem', color: '#94a3b8' }}>
        This page uses generated placeholder text for a legal document and has not been reviewed by a
        lawyer. The refund stance in §2 is a common SaaS default, not a business decision made on your
        behalf — confirm it matches your actual policy, replace all [FILL-IN: …] fields, and have this
        page reviewed before relying on it.
      </p>
    </LegalPageLayout>
  )
}
