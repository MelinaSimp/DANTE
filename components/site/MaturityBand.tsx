// TODO: needs content from human — confirm which data points are accurate
// to ship. Keep this band plain text and low-key. Suggested fields:
//   - Founded year
//   - SOC 2 status (e.g., "SOC 2 Type II in progress, expected Q3 2026")
//   - HQ city
//   - Team size or funding stage (only if announced)
const POINTS = [
  'Founded 2026',
  'SOC 2 Type II in progress',
  'Built in San Francisco',
]

export default function MaturityBand() {
  return (
    <div className="w-full bg-black border-t border-white/[0.04] px-6 py-5">
      <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-[11px] tracking-[0.18em] uppercase text-gray-500">
        {POINTS.map((p, i) => (
          <span key={p} className="flex items-center gap-8">
            <span>{p}</span>
            {i < POINTS.length - 1 && (
              <span className="text-gray-700" aria-hidden>
                ·
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  )
}
