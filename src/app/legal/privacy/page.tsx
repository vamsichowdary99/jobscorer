import type { Metadata } from 'next'
import LegalPageLayout, { LegalSection } from '@/components/legal/LegalPageLayout'

export const metadata: Metadata = { title: 'Privacy Policy' }

export default function PrivacyPolicyPage() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="[DATE]">
      <p style={{ marginBottom: 24 }}>
        This Privacy Policy explains how <strong>[COMPANY LEGAL NAME]</strong> (&quot;JobScorer&quot;,
        &quot;we&quot;) collects, uses, shares, and protects your personal data when you use JobScorer.
        We process personal data as a Data Fiduciary under India&apos;s Digital Personal Data Protection
        Act, 2023 and the DPDP Rules, 2025.
      </p>

      <LegalSection heading="1. Data we collect and why">
        <ul>
          <li><strong>Account data</strong> (email, name) — to create and secure your account.</li>
          <li><strong>Resume data</strong> (name, contact details, work history, education, skills you upload) — to parse, score, and optimize your resume against jobs.</li>
          <li><strong>Job preferences</strong> (target roles, locations, experience level) — to surface relevant matches.</li>
          <li><strong>Usage data</strong> (actions in the app, device/log data) — for security and to operate the service.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="2. How we use your data">
        {/* PASTE GENERATOR BASELINE: purpose-of-processing prose from Termly/iubenda here, reconciled with section 1 above */}
        <p>We use your data only for the purposes listed above and do not sell it.</p>
      </LegalSection>

      <LegalSection heading="3. Where your data is processed (cross-border transfer)">
        <p>
          Our database, authentication, and file storage are hosted on Supabase in the European Union
          (eu-north-1). To provide AI features (resume scoring, optimization, chat), relevant data is
          sent to OpenAI (United States). Your use of JobScorer involves processing and storage of your
          personal data outside India, as permitted under the DPDP Act.
        </p>
      </LegalSection>

      <LegalSection heading="4. Service providers (sub-processors)">
        <ul>
          <li>Supabase — database, authentication, file storage (EU)</li>
          <li>OpenAI — AI scoring/optimization/chat (US)</li>
          <li>Vercel — application hosting</li>
          <li>Upstash — rate limiting / caching</li>
          <li>SerpAPI, JSearch (RapidAPI), Firecrawl — job data and company research</li>
          <li>Google — optional sign-in (OAuth)</li>
          <li>[EMAIL PROVIDER] — transactional email (verification, password reset)</li>
        </ul>
      </LegalSection>

      <LegalSection heading="5. Data retention and erasure">
        <p>
          We retain your personal data only as long as needed for the purposes above. We erase it when
          you withdraw consent, delete your account, or after a prolonged period of inactivity. You can
          delete all your data at any time from Settings → Danger Zone, which erases your account and
          associated data within 7 days (typically immediately).
        </p>
      </LegalSection>

      <LegalSection heading="6. Your rights as a Data Principal">
        <p>Under the DPDP Act you have the right to: access a summary of your data, correct or update it,
        request erasure, nominate another person to exercise your rights, and raise a grievance. You can
        delete your account directly in Settings, and to request a copy of your data simply contact us below.</p>
      </LegalSection>

      <LegalSection heading="7. Consent and withdrawal">
        <p>We process your personal data based on the consent you give at sign-up. You may withdraw
        consent at any time by deleting your account; withdrawal does not affect processing already
        carried out.</p>
      </LegalSection>

      <LegalSection heading="8. Children">
        <p>JobScorer is intended for users aged 18 and above. We do not knowingly process the personal
        data of children.</p>
      </LegalSection>

      <LegalSection heading="9. Data breach">
        <p>In the event of a personal data breach, we will notify the Data Protection Board of India and
        affected users in accordance with the DPDP Rules (within 72 hours where required).</p>
      </LegalSection>

      <LegalSection heading="10. Grievance Officer">
        <p>
          In accordance with the DPDP Act, our Grievance Officer is:<br />
          <strong>[GRIEVANCE OFFICER NAME]</strong><br />
          Email: <strong>[GRIEVANCE EMAIL]</strong><br />
          [COMPANY LEGAL NAME], [REGISTERED ADDRESS]
        </p>
      </LegalSection>
    </LegalPageLayout>
  )
}
