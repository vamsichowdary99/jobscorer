import * as Sentry from '@sentry/nextjs';

// No-ops when NEXT_PUBLIC_SENTRY_DSN is unset, so builds/dev work without a DSN.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    // 100% of traces in dev, 10% in prod — tune to traffic volume.
    tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
    enableLogs: true,
    // Privacy: do NOT attach IP/headers/PII. This app handles resumes (DPDP).
    sendDefaultPii: false,
    environment: process.env.NODE_ENV,
  });
}
