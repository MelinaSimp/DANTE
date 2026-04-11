export default function Loading() {
  return (
    <div className="min-h-screen bg-[#242423] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-2 border-white/10" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#3351ff] animate-spin" />
        </div>
        <div className="text-white/40 text-sm">Loading…</div>
      </div>
    </div>
  );
}
