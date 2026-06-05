import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },
  redirects: async () => [
    // /dashboard/legacy was the old dark-theme analytics page. The
    // Harvey-styled /dashboard now covers the same ground; this 301
    // keeps any lingering external bookmarks alive while we kill the
    // dual-implementation surface for good. (Phase 0, W0.2.)
    { source: "/dashboard/legacy", destination: "/dashboard", permanent: true },

    // Phase 3+ panel fix #12 — soft-rename `/api/dante/*` →
    // `/api/assistant/*`. We keep the old paths working as 308
    // redirects so external integrations and the desktop client
    // (which may have older URLs cached) survive. Both sets of URLs
    // resolve while consumers migrate; ADR 0003 owns the kill date.
    //
    // 308 (not 301) preserves the request method on POST routes —
    // 301 downgrades POST to GET in some clients, which would break
    // the streaming /ask endpoint.
    {
      source: "/api/assistant/:path*",
      destination: "/api/dante/:path*",
      permanent: false, // 307 — preserve method
    },

    // Phase 1 surface reduction — CRM-era routes removed from nav.
    // 301 redirects keep bookmarks and Electron deep-links alive.
    { source: "/client-details-overview", destination: "/dashboard", permanent: true },
    { source: "/contacts", destination: "/dashboard", permanent: true },
    { source: "/calendar", destination: "/dashboard", permanent: true },
    { source: "/appointments", destination: "/dashboard", permanent: true },
    { source: "/schedule", destination: "/dashboard", permanent: true },
    { source: "/inbox", destination: "/dashboard", permanent: true },
    { source: "/email", destination: "/dashboard", permanent: true },
    { source: "/reminders", destination: "/dashboard", permanent: true },
    { source: "/properties", destination: "/dashboard", permanent: true },
    { source: "/review-tables", destination: "/dashboard", permanent: true },
    { source: "/audit", destination: "/dashboard", permanent: true },
    { source: "/library", destination: "/dashboard", permanent: true },
    { source: "/watched-folders", destination: "/dashboard", permanent: true },
    { source: "/fiduciary-bench", destination: "/dashboard", permanent: true },
  ],
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=()" },
        {
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://vercel.live https://*.vercel-scripts.com",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: https:",
            "font-src 'self' data:",
            "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openai.com https://api.vapi.ai https://*.vercel-insights.com https://*.sentry.io",
            "frame-src 'self' https://www.google.com https://maps.google.com",
            "frame-ancestors 'none'",
          ].join("; "),
        },
      ],
    },
  ],
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
