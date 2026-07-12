import PageHero from '@/components/site/PageHero'
import Link from 'next/link'

const STEPS = [
  {
    n: '01',
    title: 'Connect',
    body: 'Read-only links to your docs, apps, CRM, inboxes, databases, and knowledge stores. Dante never asks for write access until you explicitly authorize a workflow.',
    detail: 'Gmail · Slack · Drive · Notion · HubSpot · Salesforce · Zendesk · Linear · GitHub · Postgres · DocuSign · Microsoft',
  },
  {
    n: '02',
    title: 'Index',
    body: 'A semantic graph of the work — records, docs, tickets, decisions, pages, workflows, and the source material that backs each one.',
    detail: 'Updated continuously. Versioned. Diffable. Every edge in the graph traceable to a source document and timestamp.',
  },
  {
    n: '03',
    title: 'Reason',
    body: 'Retrieval-grounded answers over your data — not the model\u2019s imagination. Every claim links back to the record, document, page, or policy it came from.',
    detail: 'No hallucinated facts. No "the model thinks." Each output cites its sources by document ID, page, and line.',
  },
  {
    n: '04',
    title: 'Act',
    body: 'Drafted replies, site updates, document answers, approval queues, and CRM handoffs. Always-on workflows that bring work to the right person.',
    detail: 'Outputs are drafts. Drafts wait for a human signature.',
  },
  {
    n: '05',
    title: 'Approve',
    body: 'Nothing sensitive leaves the workspace without the right approval. The queue is the interface; everything in it can be reviewed, edited, and signed before it ships.',
    detail: 'Sign-off is logged. Edits are diffed. The reasoning is preserved next to the final.',
  },
  {
    n: '06',
    title: 'Audit',
    body: 'Every action, every source, every approval — recorded, dated, and queryable. The operational trail is created while the work happens.',
    detail: 'SOC 2 Type II posture. Workspace-isolated. Customer data never trains models.',
  },
]

export default function Page() {
  return (
    <main className="min-h-screen bg-black">
      <PageHero
        eyebrow="Resources · Method"
        headline={
          <>
            How Dante <em className="font-serif italic text-[#E8E2D5]">thinks.</em>
          </>
        }
        lede="Six steps from your data to a human signing off on the work. Nothing improvised. Nothing unsourced."
      />

      <section className="px-6 py-24">
        <div className="max-w-4xl mx-auto">
          <ol className="relative">
            <span
              aria-hidden
              className="absolute left-[14px] top-2 bottom-2 w-px bg-gradient-to-b from-white/15 via-white/10 to-transparent"
            />
            {STEPS.map((s) => (
              <li key={s.n} className="relative pl-16 pb-20 last:pb-0">
                <div className="absolute left-0 top-0 w-7 h-7 rounded-full bg-black border border-white/15 flex items-center justify-center">
                  <span className="text-[10px] tracking-[0.15em] text-[#E8E2D5]/80 font-medium">
                    {s.n}
                  </span>
                </div>
                <div className="text-3xl md:text-4xl font-light text-white tracking-tight mb-4">
                  {s.title}
                </div>
                <p className="text-[#E8E2D5]/75 text-base md:text-lg leading-relaxed font-light max-w-[640px] mb-4">
                  {s.body}
                </p>
                <p className="text-gray-500 text-sm leading-relaxed max-w-[640px]">
                  {s.detail}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="px-6 pb-32">
        <div className="max-w-4xl mx-auto border-t border-white/[0.06] pt-16">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-3">
                See it on your work
              </div>
              <h2 className="text-2xl md:text-3xl font-light text-white tracking-tight max-w-md">
                Meet Dante or book a walkthrough on your own data.
              </h2>
            </div>
            <Link
              href="/auth"
              className="inline-flex items-center gap-2 bg-[#E8E2D5] text-black px-6 py-3 rounded-full text-sm font-semibold whitespace-nowrap hover:bg-white transition"
            >
              Meet Dante
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
