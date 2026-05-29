import * as Sentry from '@sentry/nextjs';

// Session Replay is intentionally NOT enabled: this app renders resume content
// on screen, and replay could capture sensitive PII even with masking. Add
// Sentry.replayIntegration() here later only if you accept that trade-off.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
    enableLogs: true,
    sendDefaultPii: false,
    environment: process.env.NODE_ENV,
  });
}

// Instruments client-side router navigations for tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
