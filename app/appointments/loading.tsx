export default function AppointmentsLoading() {
  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="h-9 w-56 rounded bg-[var(--rule)] animate-pulse mb-2" />
        <div className="h-4 w-72 rounded bg-[var(--rule)] animate-pulse mb-8" />

        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-[6px] border border-[var(--rule)] bg-[var(--canvas)] px-5 py-4"
            >
              <div className="h-10 w-10 rounded bg-[var(--rule)] animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-44 rounded bg-[var(--rule)] animate-pulse" />
                <div className="h-3 w-28 rounded bg-[var(--rule)] animate-pulse" />
              </div>
              <div className="h-6 w-16 rounded bg-[var(--rule)] animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
