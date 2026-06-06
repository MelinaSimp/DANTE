export default function HomeLoading() {
  return (
    <div className="relative isolate min-h-[calc(100vh-64px)] overflow-hidden text-[var(--ink)]">
      <div className="relative mx-auto w-full max-w-5xl px-6 py-24">
        <div className="flex flex-col items-center gap-10">
          <div className="flex w-full max-w-3xl flex-col items-center text-center">
            <div className="space-y-4">
              <div className="h-3 w-40 mx-auto rounded bg-[var(--rule)] animate-pulse" />
              <div className="h-10 w-80 mx-auto rounded bg-[var(--rule)] animate-pulse" />
              <div className="h-4 w-64 mx-auto rounded bg-[var(--rule)] animate-pulse" />
            </div>
            <div className="mt-8 w-full max-w-2xl h-12 rounded-[4px] border border-[var(--rule)] animate-pulse" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full max-w-3xl">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 rounded-[4px] bg-[var(--canvas-subtle)] animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
