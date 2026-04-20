export default function ScheduleLoading() {
  return (
    <div className="bg-[var(--canvas)] min-h-screen text-[var(--ink)]">
      <div className="max-w-6xl mx-auto px-4 py-8 animate-pulse">
        <div className="h-8 w-48 bg-[var(--canvas-subtle)] rounded-[6px] mb-6" />

        <div className="flex gap-6">
          {/* Sidebar skeleton */}
          <div className="w-56 shrink-0 space-y-4">
            <div className="h-48 rounded-[6px] bg-[var(--canvas-subtle)] border border-[var(--rule)]" />
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-8 rounded-[6px] bg-[var(--canvas-subtle)]" />
              ))}
            </div>
          </div>

          {/* Calendar grid skeleton */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-4">
              <div className="h-6 w-32 bg-[var(--canvas-subtle)] rounded-[6px]" />
              <div className="flex gap-2">
                <div className="h-8 w-8 rounded-[6px] bg-[var(--canvas-subtle)]" />
                <div className="h-8 w-20 rounded-[6px] bg-[var(--canvas-subtle)]" />
                <div className="h-8 w-8 rounded-[6px] bg-[var(--canvas-subtle)]" />
              </div>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 gap-px mb-1">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="h-14 rounded-t-[6px] bg-[var(--canvas-subtle)]" />
              ))}
            </div>

            {/* Time grid */}
            <div className="space-y-px">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="grid grid-cols-7 gap-px">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <div key={j} className="h-[60px] bg-[var(--canvas)] border-t border-[var(--rule)]" />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
