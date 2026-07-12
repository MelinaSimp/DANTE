import PageHero from '@/components/site/PageHero'
import Link from 'next/link'

const QUEUE = [
  {
    tag: 'Support triage',
    head: 'Acme onboarding · stuck for 3 days',
    body: 'Three unanswered setup questions detected. Drafted a response with links to the cited onboarding docs.',
    cta: 'Approve reply',
    badge: 'Needs response',
  },
  {
    tag: 'Site update',
    head: 'Pricing page · source changed',
    body: 'Plan language changed in the approved pricing doc. Drafted a site update and queued review.',
    cta: 'Review page',
    badge: 'Ready',
  },
  {
    tag: 'Workflow',
    head: 'Lead form · enterprise request',
    body: 'New form submission matches enterprise criteria. Enriched CRM record and drafted handoff notes.',
    cta: 'Approve handoff',
    badge: 'High intent',
  },
  {
    tag: 'Docs',
    head: 'Security questionnaire · 18 new answers',
    body: 'Mapped questions to approved security sources and highlighted two answers needing human review.',
    cta: 'Review answers',
    badge: '2 uncertain',
  },
  {
    tag: 'Knowledge',
    head: 'Help center · stale article',
    body: 'Detected a mismatch between product docs and the public help article. Suggested replacement copy.',
    cta: 'Approve update',
    badge: 'Source drift',
  },
]

const CATALOG = [
  {
    h: 'Support triage',
    b: 'Continuously monitors tickets, inboxes, and chats. Drafts grounded replies and escalates low-confidence cases.',
  },
  {
    h: 'Site publishing',
    b: 'Turns approved agent output into draft web updates, embedded assistants, or shareable pages.',
  },
  {
    h: 'Lead routing',
    b: 'Enriches new leads, scores fit, drafts handoffs, and updates CRM fields for review.',
  },
  {
    h: 'Document Q&A',
    b: 'Answers recurring document questions with citations and flags missing or conflicting sources.',
  },
  {
    h: 'Knowledge sync',
    b: 'Detects stale docs, mismatched articles, and source drift across internal and public knowledge.',
  },
  {
    h: 'Approval queues',
    b: 'Routes sensitive actions to the right reviewer with source context and a diff of what changed.',
  },
  {
    h: 'Data sync',
    b: 'Watches connected systems for changes and keeps downstream workflows in sync.',
  },
  {
    h: 'Custom agents',
    b: 'Define your own. Triggered by data events; produce drafts that wait for human sign-off.',
  },
]

export default function Page() {
  return (
    <main className="min-h-screen bg-black">
      <PageHero
        eyebrow="Product · Agents"
        headline={
          <>
            Agents that run <em className="font-serif italic text-[#E8E2D5]">while you sleep.</em>
          </>
        }
        lede="Support triage, site updates, document Q&A, CRM handoffs, and custom workflows. Dante runs in the background; you approve what matters."
      />

      {/* Morning queue */}
      <section className="px-6 py-20">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-baseline justify-between mb-8 flex-wrap gap-4">
            <div>
              <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-3">
                The morning queue
              </div>
              <h2 className="text-3xl md:text-4xl font-light text-white tracking-tight max-w-2xl">
                Five things an agent queued today.
              </h2>
            </div>
            <div className="text-xs text-gray-500 tabular-nums">
              Generated 06:14 ET · 5 items · 0 critical
            </div>
          </div>

          <ul className="space-y-px bg-white/[0.06] border border-white/[0.06] rounded-2xl overflow-hidden">
            {QUEUE.map((q) => (
              <li key={q.head} className="bg-black hover:bg-white/[0.02] transition-colors">
                <div className="grid lg:grid-cols-12 gap-4 p-6 items-center">
                  <div className="lg:col-span-2">
                    <span className="text-[10px] tracking-[0.25em] uppercase text-gray-500">
                      {q.tag}
                    </span>
                  </div>
                  <div className="lg:col-span-7">
                    <div className="text-sm font-medium text-white mb-1">{q.head}</div>
                    <div className="text-sm text-[#E8E2D5]/70 font-light leading-snug">
                      {q.body}
                    </div>
                  </div>
                  <div className="lg:col-span-2">
                    <span className="text-xs text-[#E8E2D5] bg-[#E8E2D5]/10 border border-[#E8E2D5]/20 rounded-full px-2.5 py-1 inline-block">
                      {q.badge}
                    </span>
                  </div>
                  <div className="lg:col-span-1 lg:text-right">
                    <button className="text-xs text-gray-400 hover:text-white transition-colors whitespace-nowrap">
                      {q.cta} <span aria-hidden>→</span>
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Catalog */}
      <section className="px-6 py-20 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-4">
            The catalog
          </div>
          <h2 className="text-3xl md:text-4xl font-light text-white tracking-tight mb-12 max-w-2xl">
            Eight workflows ship with Dante. Build any number more.
          </h2>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-white/[0.06] border border-white/[0.06] rounded-2xl overflow-hidden">
            {CATALOG.map((c) => (
              <div key={c.h} className="bg-black p-6">
                <div className="text-sm font-medium text-white mb-2 tracking-tight">
                  {c.h}
                </div>
                <div className="text-xs text-[#E8E2D5]/70 font-light leading-relaxed">
                  {c.b}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Approval flow */}
      <section className="px-6 py-24 border-t border-white/[0.06]">
        <div className="max-w-5xl mx-auto">
          <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-4">
            How approval works
          </div>
          <h2 className="text-3xl md:text-4xl font-light text-white tracking-tight mb-12 max-w-2xl">
            Humans stay in the loop. Always.
          </h2>

          <ol className="grid sm:grid-cols-4 gap-px bg-white/[0.06] border border-white/[0.06] rounded-2xl overflow-hidden">
            {[
              ['Detect', 'Agent monitors data; trigger fires.'],
              ['Draft', 'Reply, page update, summary, or handoff prepared with sources.'],
              ['Queue', 'Item lands in the morning review with reasoning attached.'],
              ['Approve', 'Reviewer edits, approves, or rejects. Audit log captures everything.'],
            ].map(([h, b], i) => (
              <li key={h} className="bg-black p-6">
                <div className="text-[10px] text-gray-500 mb-3 tabular-nums tracking-[0.2em]">
                  0{i + 1}
                </div>
                <div className="text-base font-medium text-white mb-2">{h}</div>
                <div className="text-xs text-[#E8E2D5]/70 leading-relaxed">{b}</div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="px-6 pb-32 pt-16 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-3">
              Run agents on your work
            </div>
            <h2 className="text-2xl md:text-3xl font-light text-white tracking-tight max-w-md">
              Start with one agent on one high-friction workflow. We&rsquo;ll measure the lift.
            </h2>
          </div>
          <Link
            href="/auth"
            className="inline-flex items-center gap-2 bg-[#E8E2D5] text-black px-6 py-3 rounded-full text-sm font-semibold whitespace-nowrap hover:bg-white transition"
          >
            Open Dante
            <span aria-hidden>→</span>
          </Link>
        </div>
      </section>
    </main>
  )
}
