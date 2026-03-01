export default function ClientDetailsLoading() {
  return (
    <div className="min-h-screen bg-[#f5f5f7] animate-pulse">
      {/* Header bar */}
      <div className="bg-white border-b border-[#e5e7eb] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gray-200" />
            <div className="h-6 w-40 rounded bg-gray-200" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-24 rounded-xl bg-gray-200" />
            <div className="h-9 w-24 rounded-xl bg-gray-200" />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 flex gap-6">
        {/* Sidebar */}
        <div className="w-64 shrink-0 space-y-3">
          <div className="h-10 rounded-xl bg-gray-200" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-white border border-gray-100" />
          ))}
        </div>

        {/* Main content */}
        <div className="flex-1 space-y-6">
          {/* Overview card */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-3">
            <div className="h-6 w-48 rounded bg-gray-200" />
            <div className="h-4 w-full rounded bg-gray-100" />
            <div className="h-4 w-3/4 rounded bg-gray-100" />
          </div>

          {/* Document cards */}
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
                <div className="h-5 w-32 rounded bg-gray-200" />
                <div className="h-4 w-full rounded bg-gray-100" />
                <div className="h-4 w-2/3 rounded bg-gray-100" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
