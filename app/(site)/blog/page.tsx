import PageHero from '@/components/site/PageHero'
import Link from 'next/link'

const FEATURED = {
  slug: 'why-workflows-are-the-bottleneck',
  tag: 'Agentic Workflows',
  title: 'Why workflows are the bottleneck for every AI team.',
  lede: 'A decade of SaaS expansion solved every problem except the one that mattered: people still spend days stitching context across tools. Here is what we learned building grounded agents for real teams.',
  author: 'Catherine Ahn',
  role: 'Co-founder & CEO',
  date: 'April 28, 2026',
  readTime: '11 min',
}

const RECENT = [
  {
    slug: 'retrieval-grounded-not-hallucinated',
    tag: 'AI',
    title: 'Retrieval-grounded, not hallucinated: how Dante cites every claim.',
    date: 'April 14, 2026',
    readTime: '7 min',
  },
  {
    slug: 'approval-log-at-the-moment-of-action',
    tag: 'Execution',
    title: 'The approval log, written at the moment of action.',
    date: 'March 30, 2026',
    readTime: '6 min',
  },
  {
    slug: 'what-soc2-actually-buys-you',
    tag: 'AI',
    title: 'What SOC 2 actually buys you (and what it doesn\u2019t).',
    date: 'March 18, 2026',
    readTime: '9 min',
  },
  {
    slug: 'agents-in-the-quiet-hours',
    tag: 'Agents',
    title: 'Agents in the quiet hours: a study in timing.',
    date: 'March 4, 2026',
    readTime: '8 min',
  },
]

const ARCHIVE = [
  { tag: 'AI', count: 14 },
  { tag: 'Execution', count: 9 },
  { tag: 'Agents', count: 7 },
  { tag: 'Workflows', count: 12 },
  { tag: 'Product', count: 6 },
]

export default function Page() {
  return (
    <main className="min-h-screen bg-black">
      <PageHero
        eyebrow="Resources · Writing"
        headline={
          <>
            Notes from <em className="font-serif italic text-[#E8E2D5]">the field.</em>
          </>
        }
        lede="Long-form writing on agents, grounded AI, sites, workflows, and the slow work of replacing manual handoffs with software."
      />

      <section className="px-6 py-20">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-12 gap-12">
          {/* Featured */}
          <article className="lg:col-span-7">
            <Link
              href={`/blog/${FEATURED.slug}`}
              className="block group"
            >
              <div
                className="aspect-[4/3] rounded-2xl mb-8 border border-white/[0.06] relative overflow-hidden"
                style={{
                  background:
                    'radial-gradient(ellipse at 30% 30%, rgba(232,226,213,0.08), transparent 60%), linear-gradient(135deg, #0c0c0c 0%, #050505 100%)',
                }}
              >
                <div className="absolute inset-0 opacity-40">
                  {Array.from({ length: 14 }).map((_, i) => (
                    <div
                      key={i}
                      className="absolute h-px bg-[#E8E2D5]/15"
                      style={{
                        top: `${(i + 1) * 6}%`,
                        left: '8%',
                        right: `${10 + (i % 3) * 12}%`,
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-4">
                Featured &middot; {FEATURED.tag}
              </div>
              <h2 className="text-3xl md:text-4xl font-light text-white tracking-tight leading-[1.1] mb-5 group-hover:text-[#E8E2D5] transition-colors">
                {FEATURED.title}
              </h2>
              <p className="text-base md:text-lg text-[#E8E2D5]/70 font-light leading-relaxed mb-6 max-w-[600px]">
                {FEATURED.lede}
              </p>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span className="text-[#E8E2D5]/80">{FEATURED.author}</span>
                <span>&middot;</span>
                <span>{FEATURED.role}</span>
                <span>&middot;</span>
                <span>{FEATURED.date}</span>
                <span>&middot;</span>
                <span>{FEATURED.readTime}</span>
              </div>
            </Link>
          </article>

          {/* Recent list */}
          <aside className="lg:col-span-5">
            <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-6">
              Recent
            </div>
            <ul className="space-y-px bg-white/[0.06] border border-white/[0.06] rounded-2xl overflow-hidden">
              {RECENT.map((p) => (
                <li key={p.slug} className="bg-black">
                  <Link
                    href={`/blog/${p.slug}`}
                    className="block p-5 hover:bg-white/[0.02] transition-colors group"
                  >
                    <div className="flex items-baseline gap-3 mb-2">
                      <span className="text-[10px] tracking-[0.25em] uppercase text-gray-500">
                        {p.tag}
                      </span>
                      <span className="text-[10px] text-gray-600">{p.date}</span>
                    </div>
                    <div className="text-sm font-medium text-white leading-snug mb-1 group-hover:text-[#E8E2D5] transition-colors">
                      {p.title}
                    </div>
                    <div className="text-[11px] text-gray-500">{p.readTime}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>

      {/* Archive */}
      <section className="px-6 pb-24 border-t border-white/[0.06] pt-16">
        <div className="max-w-6xl mx-auto">
          <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-8">
            Browse by topic
          </div>
          <div className="flex flex-wrap gap-2">
            {ARCHIVE.map((a) => (
              <button
                key={a.tag}
                className="text-sm text-[#E8E2D5]/85 border border-white/[0.1] hover:border-white/30 hover:bg-white/[0.03] px-4 py-2 rounded-full transition-colors"
              >
                {a.tag} <span className="text-gray-500 ml-1.5 tabular-nums">{a.count}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 pb-32">
        <div className="max-w-6xl mx-auto border-t border-white/[0.06] pt-16 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-3">
              Subscribe
            </div>
            <h2 className="text-2xl md:text-3xl font-light text-white tracking-tight max-w-md">
              Get new writing in your inbox. About once a month.
            </h2>
          </div>
          <form className="flex gap-2 w-full md:w-auto">
            <input
              type="email"
              placeholder="you@company.com"
              className="flex-1 md:w-64 bg-white/[0.03] border border-white/[0.08] rounded-full px-5 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-white/20 transition-colors"
            />
            <button
              type="submit"
              className="bg-[#E8E2D5] text-black px-6 py-3 rounded-full text-sm font-semibold whitespace-nowrap hover:bg-white transition"
            >
              Subscribe
            </button>
          </form>
        </div>
      </section>
    </main>
  )
}
