export default function ContactsLoading() {
  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Header skeleton */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <div className="h-4 w-24 rounded bg-[var(--rule)] animate-pulse mb-2" />
            <div className="h-9 w-48 rounded bg-[var(--rule)] animate-pulse" />
          </div>
          <div className="h-10 w-32 rounded-[6px] bg-[var(--rule)] animate-pulse" />
        </div>

        {/* Search bar skeleton */}
        <div className="h-12 w-full rounded-[6px] bg-[var(--rule)] animate-pulse mb-6" />

        {/* List skeletons */}
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-[6px] border border-[var(--rule)] bg-[var(--canvas)] px-5 py-4"
            >
              <div className="h-10 w-10 rounded-full bg-[var(--rule)] animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 rounded bg-[var(--rule)] animate-pulse" />
                <div className="h-3 w-56 rounded bg-[var(--rule)] animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
