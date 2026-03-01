export default function ScheduleLoading() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 animate-pulse">
      <div className="h-8 w-48 bg-white/10 rounded-lg mb-6" />

      <div className="flex gap-6">
        {/* Sidebar skeleton */}
        <div className="w-56 shrink-0 space-y-4">
          <div className="h-48 rounded-xl bg-white/5 border border-white/10" />
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-8 rounded-lg bg-white/5" />
            ))}
          </div>
        </div>

        {/* Calendar grid skeleton */}
        <div className="flex-1">
          <div className="flex items-center justify-between mb-4">
            <div className="h-6 w-32 bg-white/10 rounded" />
            <div className="flex gap-2">
              <div className="h-8 w-8 rounded-lg bg-white/5" />
              <div className="h-8 w-20 rounded-lg bg-white/5" />
              <div className="h-8 w-8 rounded-lg bg-white/5" />
            </div>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-px mb-1">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-14 rounded-t-lg bg-white/5" />
            ))}
          </div>

          {/* Time grid */}
          <div className="space-y-px">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="grid grid-cols-7 gap-px">
                {Array.from({ length: 7 }).map((_, j) => (
                  <div key={j} className="h-[60px] bg-white/[0.02] border-t border-white/5" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
