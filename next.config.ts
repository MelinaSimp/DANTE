import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: false },
  // ~65 pre-existing TS errors remain (mostly in UI components, not API routes).
  // API route async-params migration is complete. Fix remaining errors in Phase 2.
  typescript: { ignoreBuildErrors: true },
};

// Wrap with Sentry only if the org/project are configured. This keeps local
// builds working for contributors who haven't set up Sentry yet.
const sentryEnabled = !!process.env.SENTRY_ORG && !!process.env.SENTRY_PROJECT;

export default sentryEnabled
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: true,
      widenClientFileUpload: true,
      tunnelRoute: "/monitoring",
      disableLogger: true,
    })
  : nextConfig;
