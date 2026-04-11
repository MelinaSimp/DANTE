/**
 * Centralized error reporter.
 *
 * Replaces anonymous silent `.catch(() => {})` handlers so failures are
 * visible in dev logs (and, once Sentry is wired up, in production too).
 *
 * Usage:
 *   fetch(url).catch(reportError("loading workspaces"))
 *   try { ... } catch (e) { reportError("saving contact")(e) }
 */

export function reportError(context: string) {
  return (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(`[${context}]`, message, err);
    // When Sentry is added, forward here:
    //   Sentry.captureException(err, { tags: { context } });
  };
}

/** Imperative variant for try/catch blocks. */
export function report(context: string, err: unknown) {
  reportError(context)(err);
}
