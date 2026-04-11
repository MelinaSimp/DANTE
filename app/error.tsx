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
    <div className="min-h-screen bg-[#242423] text-white flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="text-[#3351ff] text-5xl font-bold mb-4">!</div>
        <h1 className="text-2xl font-semibold mb-3">Something went wrong</h1>
        <p className="text-white/60 mb-2">
          We hit an unexpected error loading this page. Our team has been notified.
        </p>
        {error.digest && (
          <p className="text-white/30 text-xs mb-6 font-mono">
            Reference: {error.digest}
          </p>
        )}
        <div className="flex gap-3 justify-center mt-6">
          <button
            onClick={reset}
            className="px-4 py-2 rounded-xl bg-[#3351ff] hover:bg-[#4a64ff] text-white text-sm font-medium transition"
          >
            Try again
          </button>
          <Link
            href="/home"
            className="px-4 py-2 rounded-xl border border-white/15 hover:bg-white/5 text-white text-sm font-medium transition"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
