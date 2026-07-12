import PageHero from '@/components/site/PageHero'
import Link from 'next/link'

const TEAM = [
  {
    initials: 'LO',
    name: 'Luca Oravecz',
    role: 'Co-founder & CEO',
    bio: 'Spent the last several years placing AI and agentic systems inside more than 100 mid-market and enterprise businesses. Dante is the same playbook turned into a platform anyone can use to build agents, sites, and workflows.',
  },
  {
    initials: 'AN',
    name: 'Adharsh Narendrakumar',
    role: 'Co-founder & CTO',
    bio: 'Machine learning engineer. Built production ML systems for the Cleveland Clinic and other regulated environments — training and deploying models on clinical data under HIPAA. Now applying the same retrieval-and-grounding discipline to agentic software.',
  },
]

const BACKERS = [
  { kind: 'Investors', items: ['Sequoia Capital', 'Founders Fund', 'Conversion Capital', 'BoxGroup'] },
  { kind: 'Strategic operators', items: ['Joe Duran', 'Marty Bicknell', 'Liz Nesvold', 'Penny Phillips'] },
  { kind: 'Notable customers', items: ['Northbridge Studio', 'Aldrich Labs', 'Continental Support', 'Vance Systems'] },
]

export default function Page() {
  return (
    <main className="min-h-screen bg-black">
      <PageHero
        eyebrow="Company · About"
        headline={
          <>
            We started Dante because building useful AI should not mean accepting{' '}
            <em className="font-serif italic text-[#E8E2D5]">ungrounded answers.</em>
          </>
        }
        lede="Built by operators from applied AI and production software. We work for the builder — not the model vendor, not the point tool, not the hype cycle."
      />

      {/* Narrative */}
      <section className="px-6 py-20">
        <div className="max-w-3xl mx-auto space-y-8 text-lg md:text-xl text-[#E8E2D5]/80 font-light leading-relaxed">
          <p>
            For years, teams have bought AI and automation the same way: one tool for chat,
            one for workflows, one for docs, one for websites, one for support, one for internal
            data. People became the integration layer. The source of truth lived in everyone&rsquo;s head.
          </p>
          <p>
            That was tolerable when the alternative was nothing. It is no longer the alternative.
          </p>
          <p>
            Dante exists to give anyone the building blocks for useful agentic software — agents,
            sites, workflows, grounded answers, and approval queues — without forcing the team to
            abandon the systems they already configured. We sit on top. We read. We propose. The
            team decides.
          </p>
          <p>
            We&rsquo;re a small team. We&rsquo;re hiring carefully. We talk to customers every week
            because the product gets better one conversation at a time.
          </p>
        </div>
      </section>

      {/* Leadership */}
      <section className="px-6 py-24 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-10">
            Founders
          </div>
          <div className="grid md:grid-cols-2 gap-px bg-white/[0.06] border border-white/[0.06] rounded-2xl overflow-hidden">
            {TEAM.map((p) => (
              <div key={p.name} className="bg-black p-10">
                <div
                  className="w-20 h-20 rounded-full mb-7 flex items-center justify-center text-[#E8E2D5] text-base tracking-[0.15em]"
                  style={{
                    background:
                      'radial-gradient(circle at 30% 30%, rgba(232,226,213,0.18), rgba(232,226,213,0.04))',
                    border: '0.5px solid rgba(232,226,213,0.22)',
                  }}
                >
                  {p.initials}
                </div>
                <div className="text-2xl font-light text-white tracking-tight mb-1">
                  {p.name}
                </div>
                <div className="text-xs text-gray-500 mb-5 tracking-wide">{p.role}</div>
                <p className="text-base text-[#E8E2D5]/75 font-light leading-relaxed">
                  {p.bio}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Backers */}
      <section className="px-6 py-24 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-10">
            Backed by &amp; built with
          </div>
          <div className="grid md:grid-cols-3 gap-12">
            {BACKERS.map((b) => (
              <div key={b.kind}>
                <div className="text-xs tracking-wide text-gray-500 mb-4 uppercase">
                  {b.kind}
                </div>
                <ul className="space-y-2.5">
                  {b.items.map((i) => (
                    <li key={i} className="text-base text-[#E8E2D5] font-light">
                      {i}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 pb-32 border-t border-white/[0.06] pt-16">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-3">
              Work with us
            </div>
            <h2 className="text-2xl md:text-3xl font-light text-white tracking-tight max-w-md">
              Open roles in engineering, design, and customer success.
            </h2>
          </div>
          <Link
            href="/careers"
            className="inline-flex items-center gap-2 bg-[#E8E2D5] text-black px-6 py-3 rounded-full text-sm font-semibold whitespace-nowrap hover:bg-white transition"
          >
            See open roles
            <span aria-hidden>→</span>
          </Link>
        </div>
      </section>
    </main>
  )
}
