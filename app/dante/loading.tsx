export default function DanteLoading() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 rounded-full border-2 border-[var(--rule)] border-t-[var(--accent)] animate-spin" />
        <p className="text-sm text-[var(--ink-muted)]">Loading Dante...</p>
      </div>
    </div>
  );
}
