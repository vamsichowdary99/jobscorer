import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Turbopack config (Next.js 16 default bundler)
  // Fix: explicitly set root to avoid Next.js picking up parent package-lock.json
  turbopack: {
    root: __dirname,
  },
  // Webpack fallback for @react-pdf/renderer (used when running with --webpack)
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        canvas: false,
        fs: false,
      };
    }
    return config;
  },
  async headers() {
    // CSP is Report-Only for now so a misconfigured directive can't break the
    // live app. Watch the console for violations, widen as needed, then rename
    // the key to "Content-Security-Policy" to enforce.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.upstash.io https://*.ingest.sentry.io https://*.ingest.de.sentry.io https://*.ingest.us.sentry.io",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy-Report-Only", value: csp },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Sentry org/project + auth token are read from env at build time. When
  // absent (e.g. local dev), source-map upload is skipped — the SDK still
  // captures errors at runtime via the instrumentation files.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  // Tree-shakes Sentry's internal logger from the client bundle.
  disableLogger: true,
});
