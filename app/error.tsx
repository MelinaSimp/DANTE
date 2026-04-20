"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

export default function RouteError({
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
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)] flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="heading-display text-5xl text-[var(--danger)] mb-4">!</div>
        <h1 className="heading-display text-3xl text-[var(--ink)] mb-3">Something went wrong</h1>
        <p className="text-sm text-[var(--ink-muted)] mb-2">
          We hit an unexpected error loading this page. Our team has been notified.
        </p>
        {error.digest && (
          <p className="mono text-xs text-[var(--ink-subtle)] mb-6">
            Reference: {error.digest}
          </p>
        )}
        <div className="flex gap-3 justify-center mt-6">
          <button
            onClick={reset}
            className="px-4 py-2 rounded-[4px] bg-[var(--ink)] hover:bg-[var(--ink)]/90 text-[var(--canvas)] text-sm font-medium transition"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="px-4 py-2 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] text-[var(--ink)] text-sm font-medium transition"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
