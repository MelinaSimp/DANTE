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
      <body className="bg-[#242423] text-white min-h-screen flex items-center justify-center antialiased">
        <div className="max-w-md text-center px-6">
          <h2 className="text-2xl font-semibold mb-3">Something went wrong</h2>
          <p className="text-white/70 mb-6">
            An unexpected error occurred. Our team has been notified.
          </p>
          <button
            onClick={reset}
            className="px-4 py-2 rounded-xl bg-[#3351ff] hover:bg-[#4a64ff] text-white text-sm font-medium transition"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
