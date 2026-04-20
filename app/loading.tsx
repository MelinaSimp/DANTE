export default function Loading() {
  return (
    <div className="min-h-screen bg-[var(--canvas)] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border border-[var(--rule)]" />
          <div className="absolute inset-0 rounded-full border border-transparent border-t-[var(--accent)] animate-spin" />
        </div>
        <div className="text-xs mono text-[var(--ink-subtle)]">Loading…</div>
      </div>
    </div>
  );
}
