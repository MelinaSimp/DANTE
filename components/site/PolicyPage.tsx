import Link from 'next/link'
import PageHero from '@/components/site/PageHero'

type Section = {
  title: string
  body: string
  bullets?: string[]
}

type Callout = {
  label: string
  value: string
}

export default function PolicyPage({
  eyebrow,
  title,
  lede,
  sections,
  callouts,
  cta,
}: {
  eyebrow: string
  title: string
  lede: string
  sections: Section[]
  callouts?: Callout[]
  cta?: { label: string; href: string; title: string; body: string }
}) {
  return (
    <main className="min-h-screen bg-black">
      <PageHero eyebrow={eyebrow} headline={title} lede={lede} />

      {callouts?.length ? (
        <section className="px-6 pb-8">
          <div className="max-w-6xl mx-auto grid gap-px rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.06] md:grid-cols-3">
            {callouts.map((callout) => (
              <div key={callout.label} className="bg-black p-6">
                <div className="text-[10px] tracking-[0.28em] uppercase text-gray-500 mb-3">
                  {callout.label}
                </div>
                <div className="text-base md:text-lg text-[#E8E2D5] font-light leading-relaxed">
                  {callout.value}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="px-6 py-16 md:py-20 border-t border-white/[0.06]">
        <div className="max-w-5xl mx-auto space-y-0 divide-y divide-white/[0.06] border-y border-white/[0.06]">
          {sections.map((section) => (
            <div key={section.title} className="grid gap-5 py-8 md:grid-cols-12 md:gap-8">
              <div className="md:col-span-4">
                <h2 className="text-xl md:text-2xl font-light tracking-tight text-white">
                  {section.title}
                </h2>
              </div>
              <div className="md:col-span-8">
                <p className="text-sm md:text-base text-[#E8E2D5]/75 font-light leading-relaxed">
                  {section.body}
                </p>
                {section.bullets?.length ? (
                  <ul className="mt-5 space-y-3">
                    {section.bullets.map((bullet) => (
                      <li
                        key={bullet}
                        className="flex items-start gap-3 text-sm text-[#E8E2D5]/75 font-light leading-relaxed"
                      >
                        <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#E8E2D5]/45 shrink-0" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      {cta ? (
        <section className="px-6 pb-32 pt-4 border-t border-white/[0.06]">
          <div className="max-w-6xl mx-auto flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-3">
                {cta.title}
              </div>
              <p className="max-w-xl text-lg md:text-2xl font-light tracking-tight text-white">
                {cta.body}
              </p>
            </div>
            <Link
              href={cta.href}
              className="inline-flex items-center gap-2 rounded-full bg-[#E8E2D5] px-6 py-3 text-sm font-semibold text-black whitespace-nowrap transition hover:bg-white"
            >
              {cta.label}
              <span aria-hidden>→</span>
            </Link>
          </div>
        </section>
      ) : null}
    </main>
  )
}
