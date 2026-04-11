/**
 * Centralized error reporter.
 *
 * Replaces anonymous silent `.catch(() => {})` handlers so failures are
 * visible in dev logs and forwarded to Sentry in production (when
 * NEXT_PUBLIC_SENTRY_DSN / SENTRY_DSN is set).
 *
 * Usage:
 *   fetch(url).catch(reportError("loading workspaces"))
 *   try { ... } catch (e) { report("saving contact", e) }
 */

// Lazy-load Sentry so this module works in environments that don't have it.
let sentry: typeof import("@sentry/nextjs") | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  sentry = require("@sentry/nextjs");
} catch {
  sentry = null;
}

export function reportError(context: string) {
  return (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(`[${context}]`, message, err);
    if (sentry) {
      try {
        sentry.captureException(err, { tags: { context } });
      } catch {
        // never let Sentry failures break the app
      }
    }
  };
}

/** Imperative variant for try/catch blocks. */
export function report(context: string, err: unknown) {
  reportError(context)(err);
}
