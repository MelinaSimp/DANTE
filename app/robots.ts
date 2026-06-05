// app/robots.ts
// Robots.txt directives. Allow public marketing pages, block all
// auth-gated routes, API endpoints, and admin areas.

import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/features", "/download", "/fiduciary-bench", "/status", "/terms", "/privacy", "/security"],
        disallow: [
          "/api/",
          "/dashboard/",
          "/dante/",
          "/contacts/",
          "/settings/",
          "/onboarding/",
          "/join/",
          "/admin/",
        ],
      },
    ],
    sitemap: "https://driftai.studio/sitemap.xml",
  };
}
