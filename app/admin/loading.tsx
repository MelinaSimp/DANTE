export default function AdminLoading() {
  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="h-9 w-48 rounded bg-[var(--rule)] animate-pulse mb-2" />
        <div className="h-4 w-72 rounded bg-[var(--rule)] animate-pulse mb-8" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[6px] border border-[var(--rule)] bg-[var(--canvas)] p-6 space-y-3"
            >
              <div className="h-5 w-32 rounded bg-[var(--rule)] animate-pulse" />
              <div className="h-4 w-full rounded bg-[var(--rule)] animate-pulse" />
              <div className="h-4 w-3/4 rounded bg-[var(--rule)] animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
