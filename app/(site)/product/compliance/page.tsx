import PageHero from '@/components/site/PageHero'
import Link from 'next/link'

const COVERAGE = [
  {
    rule: 'Grounding',
    detail: 'Every claim links to source material. Unsupported answers are blocked, flagged, or routed for review.',
  },
  {
    rule: 'Permissions',
    detail: 'Role, workspace, and integration permissions checked before an agent reads or acts.',
  },
  {
    rule: 'Approval gates',
    detail: 'Sensitive actions wait for a reviewer before messages, site updates, or external writes ship.',
  },
  {
    rule: 'Action rationale',
    detail: 'Why this action, why now, and from which sources. Documented at the moment the agent queues work.',
  },
  {
    rule: 'Audit records',
    detail: 'Immutable, time-stamped, exportable logs for prompts, sources, actions, approvals, and changes.',
  },
  {
    rule: 'Publishing controls',
    detail: 'Site copy, public answers, and customer-facing messages can be reviewed against approved source sets before publish.',
  },
]

const AUDIT = [
  { ts: '06:14:02', actor: 'Dante', action: 'Detected source change · Pricing plan · Enterprise terms' },
  { ts: '06:14:03', actor: 'Dante', action: 'Drafted site update · sources [pricing-plan.md, launch-notes]' },
  { ts: '08:42:11', actor: 'C. Ahn', action: 'Reviewed memo · 2 edits · approved' },
  { ts: '08:42:48', actor: 'Dante', action: 'Published update to embedded site · receipt logged' },
  { ts: '08:42:49', actor: 'Dante', action: 'Recorded approval trail · v1.0 · hash f7c2...' },
]

export default function Page() {
  return (
    <main className="min-h-screen bg-black">
      <PageHero
        eyebrow="Product · Execution"
        headline={
          <>
            Every action, grounded before <em className="font-serif italic text-[#E8E2D5]">it runs.</em>
          </>
        }
        lede="Every agent action comes with sources, permissions, approvals, and an audit trail so teams can move fast without losing control."
      />

      {/* Sample memo */}
      <section className="px-6 py-20">
        <div className="max-w-5xl mx-auto">
          <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-4">
            Sample approval
          </div>
          <h2 className="text-3xl md:text-4xl font-light text-white tracking-tight mb-10 max-w-2xl">
            What lands in the log the moment you click approve.
          </h2>

          <article
            className="rounded-2xl border border-white/[0.08] p-8 md:p-10"
            style={{ background: 'linear-gradient(180deg, #0a0a0a 0%, #060606 100%)' }}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3 pb-5 mb-6 border-b border-white/[0.08]">
              <div className="text-sm font-medium text-white">
                Site Update Approval · Enterprise Pricing Page
              </div>
              <div className="text-xs text-gray-500 tabular-nums">
                Approval ID: PUB-2026-0429-0411 · Drafted 06:14 ET · Approved 08:42 ET
              </div>
            </div>

            <div className="space-y-5 text-[#E8E2D5]/85 font-light leading-relaxed text-[15px]">
              <p>
                <span className="text-white font-medium">Action.</span>{' '}
                Publish updated enterprise pricing copy to the embedded product site after approval.
              </p>
              <p>
                <span className="text-white font-medium">Grounding.</span>{' '}
                The pricing plan, last reviewed 04/2026, changed enterprise packaging language
                from "custom seats" to "volume and workflow pricing."{' '}
                <Cite>1</Cite>
              </p>
              <p>
                <span className="text-white font-medium">Permission check.</span>{' '}
                The publishing agent has draft access only. Final publish requires an approved
                reviewer in the Growth workspace.
              </p>
              <p>
                <span className="text-white font-medium">Change summary.</span>{' '}
                The update touches plan copy, CTA language, and one FAQ answer. No pricing
                numbers changed.{' '}
                <Cite>2</Cite>
              </p>
              <p>
                <span className="text-white font-medium">Rationale.</span>{' '}
                The public page should match the approved launch notes before the new agent site
                is shared. <Cite>3</Cite>
              </p>
            </div>

            <div className="mt-6 pt-5 border-t border-white/[0.06] flex flex-wrap gap-2">
              <Source n={1} label="Pricing plan · v12 · 04/2026" />
              <Source n={2} label="Launch note · 03/18/2026" />
              <Source n={3} label="Growth workspace policy" />
            </div>
          </article>
        </div>
      </section>

      {/* Coverage */}
      <section className="px-6 py-20 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-4">
            What it covers
          </div>
          <h2 className="text-3xl md:text-4xl font-light text-white tracking-tight mb-12 max-w-2xl">
            The controls a platform team would write into a checklist — automated against the work.
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-white/[0.06] border border-white/[0.06] rounded-2xl overflow-hidden">
            {COVERAGE.map((c) => (
              <div key={c.rule} className="bg-black p-6">
                <div className="text-sm font-medium text-white mb-2">{c.rule}</div>
                <div className="text-xs text-[#E8E2D5]/70 font-light leading-relaxed">
                  {c.detail}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Audit log */}
      <section className="px-6 py-20 border-t border-white/[0.06]">
        <div className="max-w-5xl mx-auto">
          <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-4">
            Audit trail
          </div>
          <h2 className="text-3xl md:text-4xl font-light text-white tracking-tight mb-10 max-w-2xl">
            Every action, with an actor and a timestamp.
          </h2>

          <div className="rounded-2xl border border-white/[0.08] overflow-hidden">
            <div className="grid grid-cols-12 gap-4 px-6 py-3 text-[10px] tracking-[0.25em] uppercase text-gray-500 bg-white/[0.02] border-b border-white/[0.06]">
              <div className="col-span-2">Time</div>
              <div className="col-span-2">Actor</div>
              <div className="col-span-8">Action</div>
            </div>
            <ul>
              {AUDIT.map((a, i) => (
                <li
                  key={i}
                  className="grid grid-cols-12 gap-4 px-6 py-3 border-b border-white/[0.04] last:border-0 text-sm font-mono"
                >
                  <div className="col-span-2 text-gray-500 tabular-nums">{a.ts}</div>
                  <div className="col-span-2 text-[#E8E2D5]">{a.actor}</div>
                  <div className="col-span-8 text-[#E8E2D5]/80 font-light">{a.action}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="px-6 pb-32 pt-16 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-3">
              Built for review
            </div>
            <h2 className="text-2xl md:text-3xl font-light text-white tracking-tight max-w-md">
              We&rsquo;ll walk through the audit log with your platform or security team.
            </h2>
          </div>
          <Link
            href="/demo"
            className="inline-flex items-center gap-2 bg-[#E8E2D5] text-black px-6 py-3 rounded-full text-sm font-semibold whitespace-nowrap hover:bg-white transition"
          >
            Schedule the walkthrough
            <span aria-hidden>→</span>
          </Link>
        </div>
      </section>
    </main>
  )
}

function Cite({ children }: { children: React.ReactNode }) {
  return (
    <sup className="text-[10px] text-[#E8E2D5]/60 ml-0.5 align-super">[{children}]</sup>
  )
}

function Source({ n, label }: { n: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-400 bg-white/[0.04] border border-white/[0.06] rounded-full px-2.5 py-1">
      <span className="text-[#E8E2D5]">[{n}]</span>
      {label}
    </span>
  )
}
