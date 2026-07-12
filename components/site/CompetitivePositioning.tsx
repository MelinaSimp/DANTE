const COLUMNS = [
  {
    eyebrow: 'Point tools',
    title: 'One job, done well.',
    body: 'Useful for one narrow job, but context and handoffs still live somewhere else. Each tool becomes another place to stitch work together.',
    accent: false,
  },
  {
    eyebrow: 'Dante',
    title: 'The agentic layer.',
    body: 'One grounded context layer for agents, sites, workflows, and citations. The work compounds because every surface shares the same source-backed memory.',
    accent: true,
  },
  {
    eyebrow: 'Generic AI assistants',
    title: 'Smart, but ungrounded.',
    body: 'Powerful general models with no durable read on your source material or workflow state — so answers are plausible, not reliably grounded.',
    accent: false,
  },
]

export default function CompetitivePositioning() {
  return (
    <section className="w-full bg-black px-6 py-32 border-t border-white/5">
      <div className="max-w-6xl mx-auto">
        <div className="text-xs tracking-[0.3em] text-gray-500 mb-6">
          DIFFERENT FROM POINT TOOLS
        </div>
        <h2 className="text-3xl md:text-5xl font-light text-white leading-[1.06] tracking-tight max-w-3xl">
          One grounded model, every agentic surface.
        </h2>
        <p className="mt-6 text-base md:text-lg text-[#E8E2D5]/65 max-w-2xl font-light leading-relaxed">
          Most AI tools stop at chat or one automation. Dante connects agents,
          sites, workflows, and source-grounded answers so teams can build once
          and reuse the same context everywhere.
        </p>

        <div className="mt-14 grid md:grid-cols-3 gap-px bg-white/[0.06] border border-white/[0.06] rounded-2xl overflow-hidden">
          {COLUMNS.map((c) => (
            <div
              key={c.eyebrow}
              className={`p-8 md:p-10 flex flex-col ${
                c.accent ? 'bg-[#0d0d0d]' : 'bg-black'
              }`}
            >
              <div
                className={`text-[10px] tracking-[0.3em] uppercase mb-4 ${
                  c.accent ? 'text-[#E8E2D5]' : 'text-gray-500'
                }`}
              >
                {c.eyebrow}
              </div>
              <div className="text-xl font-medium text-white tracking-tight mb-3">
                {c.title}
              </div>
              <p className="text-sm text-[#E8E2D5]/70 font-light leading-relaxed">
                {c.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
