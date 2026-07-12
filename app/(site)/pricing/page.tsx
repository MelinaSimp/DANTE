import PageHero from '@/components/site/PageHero'
import Link from 'next/link'

const TIERS = [
  {
    name: 'Independent',
    tag: 'Solo & emerging teams',
    range: 'Up to 10 users',
    price: '$495',
    cadence: 'per workspace / month',
    headline: 'The full Dante surface for builders who want agents, sites, and workflows in one place.',
    cta: { label: 'Meet Dante', href: '/auth' },
    features: [
      'Assistant, Vault, Agents, Compliance',
      'Up to 5 data-source connections',
      'Up to 10,000 documents indexed',
      '4 standard agents enabled',
      'Email support, 24-hour SLA',
      'SOC 2 Type II',
    ],
  },
  {
    name: 'Mid-market',
    tag: 'Most teams',
    range: '11–100 users',
    price: '$1,200',
    cadence: 'per workspace / month',
    headline: 'The plan for teams publishing agents, running workflows, and grounding answers across shared knowledge.',
    highlighted: true,
    cta: { label: 'Book a demo', href: '/demo' },
    features: [
      'Everything in Independent',
      'Unlimited data-source connections',
      'Up to 100,000 documents indexed',
      'Full agent catalog + 2 custom',
      'Slack channel + named CSM',
      'Quarterly business review',
      'SOC 2 + signed DPA',
    ],
  },
  {
    name: 'Enterprise',
    tag: 'Large teams & enterprises',
    range: '100+ users',
    price: 'Custom',
    cadence: 'volume pricing',
    headline: 'Workspace isolation, integration engineering, and procurement-ready security documentation.',
    cta: { label: 'Talk to sales', href: '/contact' },
    features: [
      'Everything in Mid-market',
      'Dedicated workspace infrastructure',
      'Unlimited documents indexed',
      'Unlimited custom agents',
      'Bespoke integrations',
      '24/7 on-call + 1-hour SLA',
      'Quarterly security review',
      'EU data residency available',
    ],
  },
]

const FAQ = [
  {
    q: 'Is there a per-seat minimum?',
    a: 'Three seats minimum on Independent and Team plans. Enterprise pricing scales with seats, workflow volume, and integration scope.',
  },
  {
    q: 'How long does implementation take?',
    a: 'Small teams are typically live in days. Team deployments usually take two to four weeks. Enterprise rollouts depend on integration and security scope.',
  },
  {
    q: 'Do you offer a trial?',
    a: 'You can open Dante directly. For larger teams, we also offer scoped pilots around one agent, site, or workflow.',
  },
  {
    q: 'What does the contract look like?',
    a: 'Monthly, annual, or multi-year depending on plan. Enterprise customers get a signed DPA, sub-processor list, and security documentation under NDA.',
  },
  {
    q: 'Can we start with one workflow first?',
    a: 'Yes. Most teams start with one agent, one embedded site, or one workflow before rolling Dante out more broadly.',
  },
  {
    q: 'Do you train models on our data?',
    a: 'No. Customer data never enters foundation model training sets, ours or our vendors\u2019. Inference runs against zero-retention endpoints.',
  },
  {
    q: 'What happens to our data if we churn?',
    // TODO: needs content from human — confirm export formats (CSV / Parquet / JSON),
    // retention window, and deletion SLA.
    a: '',
    pending: true,
  },
  {
    q: 'Who are your sub-processors?',
    // TODO: needs content from human — link to /security or a maintained
    // sub-processor list with the current vendor set + regions.
    a: '',
    pending: true,
  },
  {
    q: 'What\u2019s your incident response process?',
    // TODO: needs content from human — confirm severity tiers, customer
    // notification SLA, and on-call rotation cadence.
    a: '',
    pending: true,
  },
  {
    q: 'Which models does Dante use?',
    // TODO: needs content from human — name the foundation models and the
    // routing logic between them; flag any customer-configurable selection.
    a: '',
    pending: true,
  },
  {
    q: 'How do you handle hallucinations?',
    // TODO: needs content from human — describe the grounding / retrieval
    // discipline, confidence thresholds, and the human-approval surface.
    a: '',
    pending: true,
  },
  {
    q: 'Does Dante support self-hosting or VPC deployment?',
    // TODO: needs content from human — clarify whether tenant isolation in the
    // Enterprise tier covers VPC, and whether on-prem is on the roadmap.
    a: '',
    pending: true,
  },
]

export default function Page() {
  return (
    <main className="min-h-screen bg-black">
      <PageHero
        eyebrow="Pricing"
        headline={
          <>
            Built for the <em className="font-serif italic text-[#E8E2D5]">size of your team.</em>
          </>
        }
        lede="Three plans for building agents, publishing sites, and running grounded workflows without stitching together point tools."
      />

      {/* Tiers */}
      <section className="px-6 py-20">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-3 gap-px bg-white/[0.06] border border-white/[0.06] rounded-2xl overflow-hidden">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className={`p-8 md:p-10 flex flex-col ${
                t.highlighted ? 'bg-[#0d0d0d]' : 'bg-black'
              } relative`}
            >
              {t.highlighted && (
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#E8E2D5]/60 to-transparent" />
              )}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <div className="text-xl font-medium text-white tracking-tight">
                    {t.name}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{t.tag}</div>
                </div>
                {t.highlighted && (
                  <span className="text-[10px] tracking-[0.25em] uppercase text-[#E8E2D5] bg-[#E8E2D5]/10 border border-[#E8E2D5]/20 rounded-full px-2.5 py-1">
                    Most common
                  </span>
                )}
              </div>

              <div className="text-xs text-gray-500 tracking-wide mb-2">{t.range}</div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-5xl font-light text-white tracking-tight tabular-nums">
                  {t.price}
                </span>
              </div>
              <div className="text-xs text-gray-500 mb-6">{t.cadence}</div>

              <p className="text-sm text-[#E8E2D5]/75 font-light leading-relaxed mb-8">
                {t.headline}
              </p>

              <Link
                href={t.cta.href}
                className={`mb-10 inline-flex items-center justify-center gap-2 rounded-full text-sm font-semibold whitespace-nowrap transition py-3 px-6 ${
                  t.highlighted
                    ? 'bg-[#E8E2D5] text-black hover:bg-white'
                    : 'border border-white/[0.15] text-white hover:bg-white/[0.05]'
                }`}
              >
                {t.cta.label}
                <span aria-hidden>→</span>
              </Link>

              <ul className="space-y-3 mt-auto">
                {t.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-3 text-sm text-[#E8E2D5]/80 font-light leading-snug"
                  >
                    <svg
                      className="w-3.5 h-3.5 mt-1 text-[#E8E2D5]/60 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                      aria-hidden
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ROI nudge */}
      <section className="px-6 pb-12">
        <div className="max-w-6xl mx-auto border border-white/[0.06] rounded-2xl p-8 md:p-10 bg-white/[0.015] flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-2">
              Not sure which plan?
            </div>
            <div className="text-xl md:text-2xl font-light text-white tracking-tight">
              Model the value of automated workflows in 60 seconds.
            </div>
          </div>
          <Link
            href="/roi"
            className="inline-flex items-center gap-2 text-sm text-[#E8E2D5] hover:text-white transition-colors whitespace-nowrap"
          >
            Open the ROI calculator
            <span aria-hidden>→</span>
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 py-20 border-t border-white/[0.06]">
        <div className="max-w-4xl mx-auto">
          <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-4">
            Frequently asked
          </div>
          <h2 className="text-3xl md:text-4xl font-light text-white tracking-tight mb-12">
            What teams ask before they buy.
          </h2>

          <dl className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
            {FAQ.filter((f) => !('pending' in f) || !f.pending).map((f) => (
              <div key={f.q} className="grid sm:grid-cols-12 gap-3 sm:gap-8 py-7">
                <dt className="sm:col-span-5 text-base font-medium text-white tracking-tight leading-snug">
                  {f.q}
                </dt>
                <dd className="sm:col-span-7 text-sm text-[#E8E2D5]/75 font-light leading-relaxed">
                  {f.a}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="px-6 pb-32 pt-16 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-3">
              Talk to sales
            </div>
            <h2 className="text-2xl md:text-3xl font-light text-white tracking-tight max-w-md">
              We&rsquo;ll quote the actual number for your team in one call.
            </h2>
          </div>
          <Link
            href="/demo"
            className="inline-flex items-center gap-2 bg-[#E8E2D5] text-black px-6 py-3 rounded-full text-sm font-semibold whitespace-nowrap hover:bg-white transition"
          >
            Book the call
            <span aria-hidden>→</span>
          </Link>
        </div>
      </section>
    </main>
  )
}
