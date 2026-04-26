// Sentry client-side initialization.
// Runs in every browser context. No-ops silently if DSN is not configured.
//
// Same PII-scrubbing principle as the server config — client-side
// errors can carry form values, fetch payloads, and rendered DOM
// snippets in their captured context. We strip the same set of
// sensitive field names, plus sample replays only on error (never
// on the happy path) so we don't ship continuous user-session video
// to a third-party vendor.

import * as Sentry from "@sentry/nextjs";
import type { ErrorEvent, EventHint } from "@sentry/core";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

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
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "Non-Error promise rejection captured",
    ],
    beforeSend(event: ErrorEvent, _hint: EventHint) {
      if (event.request) {
        if (event.request.data) event.request.data = scrub(event.request.data);
        if (event.request.cookies) delete event.request.cookies;
        if (event.request.headers) {
          const h = event.request.headers as Record<string, string>;
          for (const k of Object.keys(h)) {
            const lower = k.toLowerCase();
            if (lower === "cookie" || lower === "authorization" || lower.includes("token")) {
              h[k] = "[scrubbed]";
            }
          }
        }
      }
      if (event.contexts) {
        event.contexts = scrub(event.contexts) as typeof event.contexts;
      }
      if (event.extra) {
        event.extra = scrub(event.extra) as typeof event.extra;
      }
      if (Array.isArray(event.breadcrumbs)) {
        event.breadcrumbs = event.breadcrumbs.map((b) => ({
          ...b,
          data: b.data ? (scrub(b.data) as Record<string, unknown>) : b.data,
        }));
      }
      if (event.user) {
        event.user = { id: event.user.id ? "[user]" : undefined };
      }
      return event;
    },
  });
}
