export default function ClientDetailsLoading() {
  return (
    <div className="min-h-screen bg-[var(--canvas)] animate-pulse">
      {/* Header bar */}
      <div className="bg-[var(--canvas)] border-b border-[var(--rule)] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-[4px] bg-[var(--canvas-subtle)]" />
            <div className="h-6 w-40 rounded-[4px] bg-[var(--canvas-subtle)]" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-24 rounded-[4px] bg-[var(--canvas-subtle)]" />
            <div className="h-9 w-24 rounded-[4px] bg-[var(--canvas-subtle)]" />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 flex gap-6">
        {/* Sidebar */}
        <div className="w-64 shrink-0 space-y-3">
          <div className="h-10 rounded-[6px] bg-[var(--canvas-subtle)]" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 rounded-[6px] bg-[var(--canvas)] border border-[var(--rule)]" />
          ))}
        </div>

        {/* Main content */}
        <div className="flex-1 space-y-6">
          {/* Overview card */}
          <div className="bg-[var(--canvas)] rounded-[6px] border border-[var(--rule)] p-6 space-y-3">
            <div className="h-6 w-48 rounded-[4px] bg-[var(--canvas-subtle)]" />
            <div className="h-4 w-full rounded-[4px] bg-[var(--canvas-subtle)]" />
            <div className="h-4 w-3/4 rounded-[4px] bg-[var(--canvas-subtle)]" />
          </div>

          {/* Document cards */}
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-[var(--canvas)] rounded-[6px] border border-[var(--rule)] p-5 space-y-3">
                <div className="h-5 w-32 rounded-[4px] bg-[var(--canvas-subtle)]" />
                <div className="h-4 w-full rounded-[4px] bg-[var(--canvas-subtle)]" />
                <div className="h-4 w-2/3 rounded-[4px] bg-[var(--canvas-subtle)]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
