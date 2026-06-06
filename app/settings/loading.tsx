export default function SettingsLoading() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="h-8 w-28 rounded bg-[var(--rule)] animate-pulse mb-6" />
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card-flat p-5">
            <div className="h-5 w-40 rounded bg-[var(--rule)] animate-pulse mb-3" />
            <div className="h-4 w-64 rounded bg-[var(--rule)] animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
