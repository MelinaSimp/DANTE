"use client";

export default function AppointmentsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <h2 className="heading-display text-2xl text-[var(--ink)] mb-3">
          Something went wrong
        </h2>
        <p className="text-sm text-[var(--ink-muted)] mb-6">
          We couldn't load appointments. This is usually temporary.
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-medium hover:opacity-90 transition"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
