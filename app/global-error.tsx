"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-[var(--canvas)] text-[var(--ink)] min-h-screen flex items-center justify-center antialiased">
        <div className="max-w-md text-center px-6">
          <h2 className="heading-display text-3xl text-[var(--ink)] mb-3">Something went wrong</h2>
          <p className="text-sm text-[var(--ink-muted)] mb-6">
            An unexpected error occurred. Our team has been notified.
          </p>
          <button
            onClick={reset}
            className="px-4 py-2 rounded-[4px] bg-[var(--ink)] hover:bg-[var(--ink)]/90 text-[var(--canvas)] text-sm font-medium transition"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
