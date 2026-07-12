import Link from 'next/link'
import PageHero from '@/components/site/PageHero'

type Card = {
  title: string
  body: string
  href: string
  label: string
}

type Section = {
  label: string
  title: string
  body: string
  points: string[]
}

export default function MarketingOverviewPage({
  eyebrow,
  headline,
  lede,
  cards,
  sections,
  cta,
}: {
  eyebrow: string
  headline: React.ReactNode
  lede: string
  cards: Card[]
  sections: Section[]
  cta: { eyebrow: string; title: string; label: string; href: string }
}) {
  return (
    <main className="min-h-screen bg-black">
      <PageHero eyebrow={eyebrow} headline={headline} lede={lede} />

      <section className="px-6 py-20">
        <div className="max-w-6xl mx-auto grid gap-px rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.06] md:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <article key={card.title} className="bg-black p-8 md:p-9">
              <h2 className="text-2xl font-light tracking-tight text-white mb-4">
                {card.title}
              </h2>
              <p className="text-sm text-[#E8E2D5]/75 font-light leading-relaxed mb-6">
                {card.body}
              </p>
              <Link
                href={card.href}
                className="inline-flex items-center gap-2 text-sm text-[#E8E2D5] transition-colors hover:text-white"
              >
                {card.label}
                <span aria-hidden>→</span>
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="px-6 py-20 border-t border-white/[0.06]">
        <div className="max-w-5xl mx-auto space-y-16">
          {sections.map((section) => (
            <div key={section.title} className="grid gap-8 md:grid-cols-12 md:gap-12">
              <div className="md:col-span-4">
                <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-4">
                  {section.label}
                </div>
                <h2 className="text-2xl md:text-3xl font-light tracking-tight text-white">
                  {section.title}
                </h2>
              </div>
              <div className="md:col-span-8">
                <p className="text-base md:text-lg text-[#E8E2D5]/75 font-light leading-relaxed mb-6">
                  {section.body}
                </p>
                <ul className="space-y-3">
                  {section.points.map((point) => (
                    <li
                      key={point}
                      className="flex items-start gap-3 text-sm md:text-base text-[#E8E2D5]/72 font-light leading-relaxed"
                    >
                      <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#E8E2D5]/45 shrink-0" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 pb-32 pt-16 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-3">
              {cta.eyebrow}
            </div>
            <h2 className="max-w-xl text-2xl md:text-3xl font-light tracking-tight text-white">
              {cta.title}
            </h2>
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
    </main>
  )
}
