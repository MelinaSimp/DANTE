import PageHero from '@/components/site/PageHero'
import Link from 'next/link'

const VALUES = [
  {
    title: 'We optimize for useful work, not empty engagement.',
    body: 'The right metric is hours of manual stitching replaced by reviewed, cited output. Engagement is a vanity number; recovered time is the real one.',
  },
  {
    title: 'Sources, not summaries.',
    body: 'Every claim Dante makes ties back to the document, record, or policy it came from. If we can\u2019t cite it, we don\u2019t say it.',
  },
  {
    title: 'The boring part is the product.',
    body: 'Permissions, retention, audit logs, sub-processor lists. The work that nobody demos is the work that earns the seat.',
  },
  {
    title: 'Slow software, fast cycles.',
    body: 'We ship every day to a small number of customers and listen carefully. Pace of learning is what matters, not pace of release notes.',
  },
  {
    title: 'Hire on judgment.',
    body: 'Anyone we hire could be running their own thing in five years. Most of us have. The bar is high because the customers are.',
  },
  {
    title: 'Write things down.',
    body: 'Decisions are documents. Documents survive. Slack threads do not. Grounded agents live by the written record; so do we.',
  },
]

const ROLES = {
  Engineering: [
    { title: 'Staff Engineer, Retrieval', loc: 'New York / Remote-US' },
    { title: 'Senior Frontend Engineer, App Surfaces', loc: 'New York / Remote-US' },
    { title: 'Engineering Manager, Integrations', loc: 'New York / Remote-US' },
    { title: 'Senior SRE, Workspace Infrastructure', loc: 'Remote-US' },
  ],
  Design: [
    { title: 'Senior Product Designer, Vault', loc: 'New York / Remote-US' },
    { title: 'Brand Designer', loc: 'New York' },
  ],
  'Sales & GTM': [
    { title: 'Account Executive, Agentic Platform', loc: 'New York / Charlotte / Chicago' },
    { title: 'Account Executive, Enterprise', loc: 'New York / Remote-US' },
    { title: 'Sales Engineer', loc: 'New York / Remote-US' },
  ],
  'Customer Success': [
    { title: 'Implementation Lead', loc: 'New York / Remote-US' },
    { title: 'Customer Success Manager', loc: 'Remote-US' },
  ],
  Compliance: [
    { title: 'Compliance Engineer', loc: 'New York / Remote-US' },
  ],
}

export default function Page() {
  return (
    <main className="min-h-screen bg-black">
      <PageHero
        eyebrow="Company · Careers"
        headline={
          <>
            Work on the slow, <em className="font-serif italic text-[#E8E2D5]">hard problem.</em>
          </>
        }
        lede="Agentic software needs trust, grounding, permissions, and careful product judgment. We're hiring engineers and operators who see that as the interesting part."
      />

      {/* Hiring philosophy */}
      <section className="px-6 py-16 border-b border-white/[0.06]">
        <div className="max-w-3xl mx-auto">
          <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-5">
            How we hire
          </div>
          <p className="text-xl md:text-2xl font-light text-white tracking-tight leading-snug">
            We hire slowly. <em className="font-serif italic text-[#E8E2D5]">Five rounds.</em> We
            talk to references. The bar is high because the customers are.
          </p>
        </div>
      </section>

      <section className="px-6 py-20">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-12 gap-12">
          {/* Values */}
          <div className="lg:col-span-5">
            <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-8">
              How we work
            </div>
            <ul className="space-y-10">
              {VALUES.map((v) => (
                <li key={v.title}>
                  <div className="text-base font-medium text-white tracking-tight mb-2 leading-snug">
                    {v.title}
                  </div>
                  <p className="text-sm text-[#E8E2D5]/70 font-light leading-relaxed">
                    {v.body}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          {/* Roles */}
          <div className="lg:col-span-7">
            <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-8">
              Open positions
            </div>
            <div className="space-y-12">
              {Object.entries(ROLES).map(([dept, roles]) => (
                <div key={dept}>
                  <h3 className="text-sm font-medium text-white mb-4 pb-3 border-b border-white/[0.08] tracking-wide">
                    {dept}
                  </h3>
                  <ul className="space-y-px bg-white/[0.06] border border-white/[0.06] rounded-xl overflow-hidden">
                    {roles.map((r) => (
                      <li key={r.title} className="bg-black">
                        <Link
                          href="/contact"
                          className="flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors group"
                        >
                          <div>
                            <div className="text-sm text-white font-medium mb-0.5">
                              {r.title}
                            </div>
                            <div className="text-xs text-gray-500">{r.loc}</div>
                          </div>
                          <span className="text-xs text-gray-500 group-hover:text-white transition-colors flex items-center gap-1">
                            Apply <span aria-hidden>→</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="mt-10 p-5 border border-dashed border-white/[0.1] rounded-xl text-sm text-[#E8E2D5]/70">
              Don&rsquo;t see your role?{' '}
              <a href="mailto:hello@dante.ai" className="text-white hover:underline">
                hello@dante.ai
              </a>{' '}
              <span aria-hidden>→</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
