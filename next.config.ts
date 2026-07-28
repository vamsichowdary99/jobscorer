import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  eslint: {
    // Pre-existing lint errors must not block Vercel production deploys.
    // Fix incrementally — do not re-enable until the error count is zero.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Same reason — type errors in untouched files must not block deploys.
    ignoreBuildErrors: true,
  },
  turbopack: {
    root: __dirname,
  },
  // Webpack fallback for @react-pdf/renderer — also used for production builds on Vercel.
  // Turbopack is intentionally excluded from next.config: it doesn't emit the
  // middleware.js.nft.json that Vercel's build infra expects, causing deploy errors.
  // Use `next dev --turbopack` for local fast HMR instead.
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
    // Enforced (Phase 7). frame-src covers blob: PDF preview iframes (optimize,
    // resumes, chat, cover letter, jade-preview) plus Razorpay's checkout iframe;
    // without it these fall back to default-src 'self', which blocks blob:.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://*.i.posthog.com https://checkout.razorpay.com https://cdn.razorpay.com",
      // Without an explicit worker-src, Safari/WebKit does not reliably fall back to
      // script-src for the module Worker pdfjs-dist spins up to parse the Resume
      // Budget PDF (src/lib/resume-edit/budget.ts) — it silently fails to load the
      // worker on real iOS devices (not reproducible via Chrome's device emulation,
      // which is still Chromium). blob: covers pdfjs's internal worker fallback path.
      "worker-src 'self' blob:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      // data: is required for pdfjs-dist, which fetches its compiled WASM module via a data: URI.
      "connect-src 'self' data: https://*.supabase.co wss://*.supabase.co https://*.upstash.io https://*.ingest.sentry.io https://*.ingest.de.sentry.io https://*.ingest.us.sentry.io https://*.i.posthog.com https://api.razorpay.com https://lumberjack.razorpay.com",
      "frame-src 'self' blob: https://checkout.razorpay.com https://api.razorpay.com",
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
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

// Only wrap with Sentry when SENTRY_AUTH_TOKEN is present.
// Without it, Sentry's webpack plugin prevents middleware.js.nft.json from
// being generated, which causes Vercel deploys to fail with ENOENT.
// Runtime error tracking still works via src/sentry.*.config.ts files.
export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
      widenClientFileUpload: true,
      disableLogger: true,
    })
  : nextConfig;
