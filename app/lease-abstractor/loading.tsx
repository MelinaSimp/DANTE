export default function LeaseAbstractorLoading() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="h-8 w-48 rounded bg-[var(--rule)] animate-pulse mb-6" />
      <div className="h-40 rounded-[4px] border-2 border-dashed border-[var(--rule)] animate-pulse" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-14 rounded-[4px] border border-[var(--rule)] animate-pulse" />
        ))}
      </div>
    </div>
  );
}
