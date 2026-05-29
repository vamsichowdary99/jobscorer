import type { Metadata } from 'next'
import LegalPageLayout, { LegalSection } from '@/components/legal/LegalPageLayout'

export const metadata: Metadata = { title: 'Cookie Policy' }

export default function CookiePolicyPage() {
  return (
    <LegalPageLayout title="Cookie Policy" lastUpdated="[DATE]">
      <p style={{ marginBottom: 24 }}>
        This policy explains the cookies and similar technologies ResuScore uses.
      </p>

      <LegalSection heading="1. Essential cookies">
        <p>We use strictly necessary cookies set by our authentication provider (Supabase) to keep you
        signed in and to secure your session. These are required for the service to function and cannot
        be disabled.</p>
      </LegalSection>

      <LegalSection heading="2. Analytics & other cookies">
        <p>We do not currently use third-party advertising or tracking cookies. If we add analytics in
        the future, this policy and our consent banner will be updated, and non-essential cookies will be
        set only with your consent.</p>
      </LegalSection>

      <LegalSection heading="3. Managing cookies">
        <p>You can clear or block cookies in your browser settings; note that blocking essential cookies
        will prevent you from signing in.</p>
      </LegalSection>

      <LegalSection heading="4. Contact">
        <p>Questions: <strong>[SUPPORT EMAIL]</strong></p>
      </LegalSection>
    </LegalPageLayout>
  )
}
