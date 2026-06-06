"use client";

export default function WorkflowsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4">
      <h2 className="text-lg font-semibold text-[var(--ink)]">
        Something went wrong
      </h2>
      <p className="max-w-md text-center text-sm text-[var(--ink-muted)]">
        {error.message || "An unexpected error occurred. Please try again."}
      </p>
      <button
        onClick={reset}
        className="rounded-[4px] bg-[var(--ink)] px-4 py-2 text-sm font-medium text-[var(--canvas)] hover:opacity-90 transition"
      >
        Try again
      </button>
    </div>
  );
}
