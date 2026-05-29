import * as Sentry from '@sentry/nextjs';

// Runs in the edge runtime (middleware, edge routes).
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
    enableLogs: true,
    sendDefaultPii: false,
    environment: process.env.NODE_ENV,
  });
}
