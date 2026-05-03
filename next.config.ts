import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },
  // The desktop chat agent reads its system prompt from prompts/*.md
  // at runtime via lib/dante/system-prompt.ts (readFileSync). Next.js's
  // serverless bundler doesn't trace those reads automatically because
  // the path is constructed at runtime — without this hint the file is
  // missing from /var/task on Vercel and the agent silently falls back
  // to a minimal stub (which then misbehaves and the function returns
  // status -1 mid-stream). Ship the prompts dir alongside any route
  // that touches the agent loop.
  outputFileTracingIncludes: {
    "/api/dante/ask/route": ["./prompts/**/*.md"],
    "/api/evals/nightly/route": ["./prompts/**/*.md"],
    "/api/sms/webhook/sendblue/route": ["./prompts/**/*.md"],
    "/api/sms/cron/briefing/route": ["./prompts/**/*.md"],
    "/api/dante/cron/tick/route": ["./prompts/**/*.md"],
    "/api/dante/queue/tick/route": ["./prompts/**/*.md"],
  },
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
