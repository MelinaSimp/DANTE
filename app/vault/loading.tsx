export default function VaultLoading() {
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-24 rounded bg-[var(--rule)] animate-pulse" />
        <div className="h-9 w-36 rounded-[4px] bg-[var(--rule)] animate-pulse" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 rounded-[4px] border border-[var(--rule)] animate-pulse" />
        ))}
      </div>
    </div>
  );
}
