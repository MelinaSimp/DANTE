export default function WorkflowsLoading() {
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-32 rounded bg-[var(--rule)] animate-pulse" />
        <div className="h-9 w-40 rounded-[4px] bg-[var(--rule)] animate-pulse" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-[4px] border border-[var(--rule)] animate-pulse" />
        ))}
      </div>
    </div>
  );
}
