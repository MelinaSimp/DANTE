// Sentry server-side initialization.
// Runs in Node.js API routes and server components.
//
// PII filter is critical here — Drift handles client emails, call
// transcripts, calendar events, and memory entries that we cannot
// ship to a third-party logging vendor without consent. Errors that
// fire inside the Gmail sync, Outlook sync, or memory pipeline can
// otherwise carry message bodies and contact identifiers in their
// captured request payloads and breadcrumbs.
//
// The beforeSend hook scrubs known-sensitive fields and request
// bodies before transmission. False positives (over-scrubbing) are
// far cheaper than false negatives (a leaked client email).

import * as Sentry from "@sentry/nextjs";
import type { ErrorEvent, EventHint } from "@sentry/core";

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

// Field names whose values are always replaced with [scrubbed].
// Match is case-insensitive and substring-based, so e.g. "body_text"
// gets caught by "body" and "client_email" gets caught by "email".
const SENSITIVE_FIELDS = [
  "body",
  "body_text",
  "body_html",
  "snippet",
  "content",
  "subject",
  "embedding",
  "transcript",
  "summary",
  "from_addr",
  "to_addrs",
  "cc_addrs",
  "provider_email",
  "email",
  "phone",
  "access_token",
  "refresh_token",
  "auth",
  "api_key",
  "client_secret",
  "password",
  "token",
];

// Request URL paths whose query strings + bodies we strip entirely.
// These are the routes that touch raw client data.
const SENSITIVE_ROUTES = [
  "/api/integrations/gmail",
  "/api/integrations/outlook",
  "/api/integrations/calendar",
  "/api/integrations/microsoft",
  "/api/dante/ask",
  "/api/dante/skills/run",
  "/api/dante/refine",
  "/api/contacts",
  "/api/calls",
  "/api/notes",
];

function scrub(obj: unknown, depth = 0): unknown {
  if (depth > 8 || obj == null) return obj;
  if (Array.isArray(obj)) return obj.map((v) => scrub(v, depth + 1));
  if (typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const lower = k.toLowerCase();
      if (SENSITIVE_FIELDS.some((f) => lower.includes(f))) {
        out[k] = "[scrubbed]";
      } else {
        out[k] = scrub(v, depth + 1);
      }
    }
    return out;
  }
  return obj;
}

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
    tracesSampleRate: 0.1,

    // Strip request body / query for sensitive routes; scrub all
    // contexts and breadcrumb data for any event.
    beforeSend(event: ErrorEvent, _hint: EventHint) {
      // Wipe request body + query for sensitive routes.
      const url = event.request?.url || "";
      const isSensitiveRoute = SENSITIVE_ROUTES.some((r) => url.includes(r));
      if (event.request) {
        if (isSensitiveRoute) {
          event.request.data = "[scrubbed]";
          event.request.query_string = "[scrubbed]";
        } else if (event.request.data) {
          event.request.data = scrub(event.request.data);
        }
        // Always strip cookies + auth headers regardless of route.
        if (event.request.headers) {
          const h = event.request.headers as Record<string, string>;
          for (const k of Object.keys(h)) {
            const lower = k.toLowerCase();
            if (lower === "cookie" || lower === "authorization" || lower.includes("token")) {
              h[k] = "[scrubbed]";
            }
          }
        }
        if (event.request.cookies) delete event.request.cookies;
      }

      // Scrub all extra contexts.
      if (event.contexts) {
        event.contexts = scrub(event.contexts) as typeof event.contexts;
      }
      if (event.extra) {
        event.extra = scrub(event.extra) as typeof event.extra;
      }

      // Scrub breadcrumb data — these often carry SDK-captured
      // arguments to fetch/console calls.
      if (Array.isArray(event.breadcrumbs)) {
        event.breadcrumbs = event.breadcrumbs.map((b) => ({
          ...b,
          data: b.data ? (scrub(b.data) as Record<string, unknown>) : b.data,
        }));
      }

      // Strip user identity beyond a hashed id — we don't need to
      // tie errors to specific advisors in Sentry.
      if (event.user) {
        event.user = { id: event.user.id ? "[user]" : undefined };
      }

      return event;
    },
  });
}
