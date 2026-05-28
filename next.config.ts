import type { NextConfig } from "next";

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
};

export default nextConfig;
