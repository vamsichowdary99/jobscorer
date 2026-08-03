import type { Metadata } from 'next'
import LegalPageLayout, { LegalSection } from '@/components/legal/LegalPageLayout'

export const metadata: Metadata = { title: 'Privacy Policy' }

export default function PrivacyPolicyPage() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="[FILL-IN: DATE]">
      <p style={{ marginBottom: 24 }}>
        This Privacy Policy explains how <strong>[FILL-IN: COMPANY LEGAL NAME]</strong> (&quot;JobScorer&quot;,
        &quot;we&quot;) collects, uses, shares, and protects your personal data when you use JobScorer, an
        AI-powered job matching and resume optimization service. We process personal data as a Data
        Fiduciary under India&apos;s Digital Personal Data Protection Act, 2023 and the DPDP Rules, 2025.
      </p>

      <LegalSection heading="1. Data we collect and why">
        <ul>
          <li><strong>Account data</strong> (email, name) — to create and secure your account.</li>
          <li><strong>Resume data</strong> (name, contact details, work history, education, skills you upload) — to parse, score, and optimize your resume against jobs.</li>
          <li><strong>Job preferences</strong> (target roles, locations, experience level) — to surface relevant matches.</li>
          <li><strong>Payment data</strong> (plan tier, billing status) — if you subscribe to a paid plan. Card and UPI details are collected and processed directly by our payment processor, Razorpay; we never see or store your full payment credentials.</li>
          <li><strong>Usage data</strong> (actions in the app, device/log data, and — only if you accept analytics cookies in our cookie banner — product analytics events) — for security, service operation, and to understand how JobScorer is used.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="2. How we use your data">
        <p>We use your data only for the purposes listed above: to operate and secure the service, to
        generate AI-powered matches and resume feedback, to process payments for paid plans, to communicate
        service and billing updates, and — only with your consent — to understand product usage through
        analytics. We do not sell your personal data.</p>
        <p style={{ marginTop: 12 }}>
          <strong>AI processing:</strong> Resume and job data you submit is sent to OpenAI (gpt-4.1-mini,
          GPT-4o, gpt-4.1, and text-embedding-3-small models) to generate match scores, optimized resumes,
          cover letters, company research summaries, and chat responses. OpenAI processes this data via its
          API, which — per OpenAI&apos;s API data usage policy — is <strong>not used to train OpenAI&apos;s
          models</strong>. Generated output (scores, suggestions, optimized resumes) is probabilistic and
          may contain inaccuracies; always review AI-generated content before relying on it.
        </p>
      </LegalSection>

      <LegalSection heading="3. Where your data is processed (cross-border transfer)">
        <p>
          Our database, authentication, and file storage are hosted on Supabase in the European Union
          (eu-north-1). Application hosting runs on Vercel. AI features (resume scoring, optimization,
          chat) send relevant data to OpenAI (United States); background scoring jobs run on Trigger.dev
          (United States). Your use of JobScorer involves processing and storage of your personal data
          outside India, as permitted under the DPDP Act.
        </p>
      </LegalSection>

      <LegalSection heading="4. Service providers (sub-processors)">
        <ul>
          <li>Supabase — database, authentication, file storage (EU)</li>
          <li>OpenAI — AI scoring, optimization, chat, embeddings (US) — not used for model training</li>
          <li>Trigger.dev — background job-scoring execution (US)</li>
          <li>Vercel — application hosting</li>
          <li>Upstash — rate limiting / caching</li>
          <li>Razorpay — payment processing for paid subscriptions (India)</li>
          <li>SerpAPI, JSearch (RapidAPI), Apify — job listing data</li>
          <li>Firecrawl — company research web scraping</li>
          <li>PostHog — product analytics, loaded only if you accept analytics cookies</li>
          <li>Google — optional sign-in (OAuth)</li>
          <li>[FILL-IN: EMAIL PROVIDER] — transactional email (verification, password reset)</li>
        </ul>
      </LegalSection>

      <LegalSection heading="5. Data retention and erasure">
        <p>
          We retain your personal data only as long as needed for the purposes above:
        </p>
        <ul>
          <li><strong>Account and resume data</strong> — retained while your account is active.</li>
          <li><strong>Payment records</strong> — retained as required by Indian tax and accounting law after a subscription ends.</li>
          <li><strong>Server access logs</strong> — retained for 30 days for security and debugging.</li>
          <li><strong>Analytics events</strong> (if you opted in) — retained per PostHog&apos;s default retention window.</li>
        </ul>
        <p style={{ marginTop: 12 }}>
          You can delete all your data at any time from Settings → Danger Zone, which erases your account
          and associated data within 7 days (typically immediately).
        </p>
      </LegalSection>

      <LegalSection heading="6. Your rights as a Data Principal">
        <p>Under the DPDP Act you have the right to: access a summary of your data, correct or update it,
        request erasure, nominate another person to exercise your rights, and raise a grievance. You can
        delete your account directly in Settings, and to request a copy of your data simply contact us
        below. We aim to respond within 30 days.</p>
      </LegalSection>

      <LegalSection heading="7. Consent and withdrawal">
        <p>We process your account, resume, and job data based on the consent you give at sign-up, and
        process analytics cookies only based on the consent you give in our cookie banner (see our{' '}
        <a href="/legal/cookies" style={{ color: '#135bec' }}>Cookie Policy</a>). You may withdraw account
        consent at any time by deleting your account; you may withdraw analytics consent at any time by
        changing your cookie choice. Withdrawal does not affect processing already carried out.</p>
      </LegalSection>

      <LegalSection heading="8. Children">
        <p>JobScorer is intended for users aged 18 and above. We do not knowingly process the personal
        data of children.</p>
      </LegalSection>

      <LegalSection heading="9. Security">
        <p>We use TLS/HTTPS for data in transit and provider-managed encryption at rest (Supabase). Payment
        credentials are never stored on our servers — they are handled entirely by Razorpay. In the event
        of a personal data breach, we will notify the Data Protection Board of India and affected users in
        accordance with the DPDP Rules (within 72 hours where required).</p>
      </LegalSection>

      <LegalSection heading="10. Changes to this policy">
        <p>We may update this Privacy Policy from time to time. Material changes will be posted here with
        a new &quot;Last updated&quot; date; where changes are significant, we will also notify you by
        email or in-app notice.</p>
      </LegalSection>

      <LegalSection heading="11. Grievance Officer">
        <p>
          In accordance with the DPDP Act, our Grievance Officer is:<br />
          <strong>[FILL-IN: GRIEVANCE OFFICER NAME]</strong><br />
          Email: <strong>[FILL-IN: GRIEVANCE EMAIL]</strong><br />
          [FILL-IN: COMPANY LEGAL NAME], [FILL-IN: REGISTERED ADDRESS]
        </p>
      </LegalSection>

      <p style={{ marginTop: 40, fontSize: '0.8125rem', color: '#94a3b8' }}>
        This page uses generated placeholder text for a legal document and has not been reviewed by a
        lawyer. Replace all [FILL-IN: …] fields and have this policy reviewed before relying on it.
      </p>
    </LegalPageLayout>
  )
}
