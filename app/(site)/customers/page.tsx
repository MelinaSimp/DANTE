import PageHero from '@/components/site/PageHero'
import Link from 'next/link'

const FEATURED = {
  firm: 'Northbridge Studio',
  geography: 'Boston, MA',
  size: '28-person operations team',
  since: 'Customer since 2025',
  problem:
    'Support and product teams were answering the same implementation questions across tickets, docs, and calls. Senior operators spent evenings stitching sources together before every customer review.',
  outcome:
    'Dante now drafts grounded customer briefs from docs, tickets, and product notes overnight. The team reviews, approves, and publishes updates in the morning.',
  metric: { value: '34h', label: 'recovered per team / week' },
  quote:
    "We expected an LLM. Dante became the layer that reads everything, cites it, and turns it into work.",
  attribution: 'Catherine Ahn, Managing Partner',
}

const CASES = [
  {
    firm: 'Aldrich Labs',
    geography: 'New York, NY',
    size: '9-person product team',
    surface: 'Vault',
    problem: 'Years of specs, support notes, and launch docs — almost none of it indexed.',
    outcome:
      'Indexed 14,000 documents in the first month. Product and policy questions now return cited answers in under a minute.',
    metric: { value: '14,000', label: 'documents indexed' },
  },
  {
    firm: 'Continental Support',
    geography: 'Chicago, IL',
    size: '80-person support org',
    surface: 'Execution',
    problem: 'Every high-risk reply needed review. The approval backlog was always two weeks behind.',
    outcome:
      'Dante drafts the response with sources and routes it to the right reviewer immediately. Review happens in line, not in arrears.',
    metric: { value: '0 days', label: 'approval backlog' },
  },
  {
    firm: 'Vance Systems',
    geography: 'Austin, TX',
    size: '7-person operations team',
    surface: 'Agents',
    problem:
      'Lead routing and onboarding follow-ups were tracked in spreadsheets — and missed often enough to matter.',
    outcome:
      'Always-on agents surface every open follow-up in the morning queue. The team decides; Dante handles the surfacing.',
    metric: { value: '2.1k', label: 'manual handoffs removed, year one' },
  },
]

export default function Page() {
  return (
    <main className="min-h-screen bg-black">
      <PageHero
        eyebrow="Resources · Customers"
        headline={
          <>
            The teams that <em className="font-serif italic text-[#E8E2D5]">already run</em> on Dante.
          </>
        }
        lede="Startups, operators, agencies, and enterprise teams building agents, sites, and workflows on grounded AI."
      />

      {/* Featured */}
      <section className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-8">
            Featured
          </div>
          <div className="grid lg:grid-cols-12 gap-10 items-start">
            <div className="lg:col-span-7">
              <div className="text-2xl md:text-3xl font-light text-white tracking-tight mb-2">
                {FEATURED.firm}
              </div>
              <div className="text-sm text-gray-500 mb-8">
                {FEATURED.geography} &middot; {FEATURED.size} &middot; {FEATURED.since}
              </div>
              <div className="space-y-6">
                <div>
                  <div className="text-[10px] tracking-[0.3em] uppercase text-gray-600 mb-2">
                    The problem
                  </div>
                  <p className="text-[#E8E2D5]/80 text-lg font-light leading-relaxed">
                    {FEATURED.problem}
                  </p>
                </div>
                <div>
                  <div className="text-[10px] tracking-[0.3em] uppercase text-gray-600 mb-2">
                    With Dante
                  </div>
                  <p className="text-[#E8E2D5]/80 text-lg font-light leading-relaxed">
                    {FEATURED.outcome}
                  </p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="border border-white/[0.08] rounded-2xl p-8 bg-white/[0.015]">
                <div className="text-[64px] md:text-[88px] font-light text-[#E8E2D5] tracking-tight leading-none mb-2">
                  {FEATURED.metric.value}
                </div>
                <div className="text-sm text-gray-500 mb-10 max-w-[200px]">
                  {FEATURED.metric.label}
                </div>
                <p className="text-[#E8E2D5] text-base font-serif italic leading-relaxed mb-4">
                  &ldquo;{FEATURED.quote}&rdquo;
                </p>
                <div className="text-xs text-gray-500 tracking-wide">
                  {FEATURED.attribution}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Case grid */}
      <section className="px-6 pb-24">
        <div className="max-w-6xl mx-auto">
          <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-8 border-t border-white/[0.06] pt-12">
            More from the field
          </div>
          <div className="grid md:grid-cols-3 gap-px bg-white/[0.06] border border-white/[0.06] rounded-2xl overflow-hidden">
            {CASES.map((c) => (
              <article key={c.firm} className="bg-black p-8 flex flex-col">
                <div className="text-[10px] tracking-[0.3em] uppercase text-gray-600 mb-3">
                  {c.surface}
                </div>
                <div className="text-xl font-light text-white tracking-tight mb-1">
                  {c.firm}
                </div>
                <div className="text-xs text-gray-500 mb-6">
                  {c.geography} &middot; {c.size}
                </div>
                <p className="text-[#E8E2D5]/70 text-sm leading-relaxed font-light mb-4 flex-1">
                  {c.problem}
                </p>
                <p className="text-[#E8E2D5]/85 text-sm leading-relaxed mb-6">
                  {c.outcome}
                </p>
                <div className="border-t border-white/[0.06] pt-5 mt-auto">
                  <div className="text-3xl font-light text-[#E8E2D5] tracking-tight leading-none mb-1">
                    {c.metric.value}
                  </div>
                  <div className="text-xs text-gray-500">{c.metric.label}</div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 pb-32">
        <div className="max-w-6xl mx-auto border-t border-white/[0.06] pt-16">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-3">
                Talk to one of these teams
              </div>
              <h2 className="text-2xl md:text-3xl font-light text-white tracking-tight max-w-md">
                We&rsquo;ll connect you with a customer building similar workflows.
              </h2>
            </div>
            <Link
              href="/demo"
              className="inline-flex items-center gap-2 bg-[#E8E2D5] text-black px-6 py-3 rounded-full text-sm font-semibold whitespace-nowrap hover:bg-white transition"
            >
              Request a reference
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
