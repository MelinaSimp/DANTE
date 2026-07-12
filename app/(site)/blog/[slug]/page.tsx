import PageHero from '@/components/site/PageHero'
import Link from 'next/link'

export default function Page({ params }: { params: { slug: string } }) {
  const posts: Record<
    string,
    {
      eyebrow: string
      title: string
      lede: string
      date: string
      readTime: string
      sections: { title: string; body: string }[]
    }
  > = {
    'why-workflows-are-the-bottleneck': {
      eyebrow: 'Agentic Workflows',
      title: 'Why workflows are the bottleneck for every AI team.',
      lede: 'A decade of stack expansion solved every problem except the one that mattered: people still spend days stitching context across tools.',
      date: 'April 28, 2026',
      readTime: '11 min',
      sections: [
        {
          title: 'The stack expanded. The work did not disappear.',
          body: 'Every new system added visibility into one slice of the workflow, but it also created another handoff. Someone still has to gather records, interpret context, draft the note, and queue the follow-up. The result is not a technology gap so much as a labor gap hidden inside the stack.',
        },
        {
          title: 'People became the integration layer.',
          body: 'When the CRM, document vault, ticketing queue, database, and email history all disagree about context, a person resolves it. That is expensive work being done by the highest-value person in the workflow.',
        },
        {
          title: 'The opportunity is operational, not theatrical.',
          body: 'The useful AI product is not the clever chat surface. It is the system that reads, drafts, cites, queues, publishes, and waits for approval before breakfast. That is where hours return to the team and where coverage scales without immediately adding headcount.',
        },
      ],
    },
    'retrieval-grounded-not-hallucinated': {
      eyebrow: 'AI',
      title: 'Retrieval-grounded, not hallucinated: how Dante cites every claim.',
      lede: 'The line between a confident answer and a usable answer is evidence. Dante is built to retrieve source records first, then generate from the evidence it found.',
      date: 'April 14, 2026',
      readTime: '7 min',
      sections: [
        {
          title: 'Grounding comes before generation.',
          body: 'We treat source retrieval as a prerequisite, not a nice-to-have. The system pulls the records, notes, docs, pages, and policies that matter before it drafts a sentence. That keeps the answer anchored to what the workspace actually knows.',
        },
        {
          title: 'Citation is part of product design.',
          body: 'If the reviewer cannot see where a claim came from, the answer is not ready. Evidence needs to be visible at the point of approval, not hidden in a debug console or left to the user to reconstruct after the fact.',
        },
        {
          title: 'Confidence without provenance is a liability.',
          body: 'In important work, a smooth answer that cannot be traced back to records is worse than no answer. Teams do not need better improvisation. They need better recall, traceability, and escalation when the record is incomplete.',
        },
      ],
    },
    'approval-log-at-the-moment-of-action': {
      eyebrow: 'Execution',
      title: 'The approval log, written at the moment of action.',
      lede: 'The log is most valuable when it is created alongside the action, while the evidence is still in view and the rationale has not drifted.',
      date: 'March 30, 2026',
      readTime: '6 min',
      sections: [
        {
          title: 'After-the-fact logs create drag.',
          body: 'When a team has to reconstruct why an agent acted after the fact, quality drops and the review burden rises. Writing the log at the same moment the action is queued keeps the reasoning aligned with the evidence.',
        },
        {
          title: 'Supervision gets easier when the trail is immediate.',
          body: 'A contemporaneous log links the action, workflow context, and supporting records before anything is lost in translation. That makes spot checks and escalations cleaner for reviewers.',
        },
        {
          title: 'The right workflow is draft first, approve second.',
          body: 'Automation is useful when it creates a review-ready first pass, not when it bypasses judgment. A good system drafts the action, cites the evidence, and waits for the person accountable to approve or edit it.',
        },
      ],
    },
    'what-soc2-actually-buys-you': {
      eyebrow: 'Security',
      title: 'What SOC 2 actually buys you (and what it doesn’t).',
      lede: 'SOC 2 is a useful signal about control maturity, but it is not a substitute for understanding how a system behaves in your actual workflow.',
      date: 'March 18, 2026',
      readTime: '9 min',
      sections: [
        {
          title: 'It shows process discipline.',
          body: 'A clean SOC 2 report tells a buyer that access, change management, incident response, and related controls exist and are operating. That matters. It reduces uncertainty about basic operational hygiene.',
        },
        {
          title: 'It does not answer workflow questions for you.',
          body: 'A team still needs to ask where data goes, who can approve actions, how outputs are grounded, and what the failure modes look like. Those product questions sit beside the report, not inside it.',
        },
        {
          title: 'Buyers should pair controls with product diligence.',
          body: 'The most effective diligence process uses both lenses: security maturity from the formal package and real operational understanding from product review. Neither is complete on its own.',
        },
      ],
    },
    'agents-in-the-quiet-hours': {
      eyebrow: 'Agents',
      title: 'Agents in the quiet hours: a study in timing.',
      lede: 'Some workflow work is valuable precisely because it can happen before anyone arrives. Document monitoring and queue preparation are clear examples.',
      date: 'March 4, 2026',
      readTime: '8 min',
      sections: [
        {
          title: 'Timing is part of the workflow.',
          body: 'The best workflow opportunities are not created by a dashboard alone. They depend on scanning consistently, checking source changes, comparing context, and surfacing the result before the team starts its day.',
        },
        {
          title: 'Agents are useful where vigilance matters.',
          body: 'An agent can do the repetitive early work: scan sources, flag candidate actions, gather policy context, and present a short approval queue. The human reviewer still decides whether the opportunity is real and worth acting on.',
        },
        {
          title: 'Quiet-hour work changes morning capacity.',
          body: 'When the prep is already assembled, people start with judgment instead of assembly. That changes how much work the team can cover without turning the day into triage.',
        },
      ],
    },
  }

  const fallbackTitle = params.slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
  const post = posts[params.slug] ?? {
    eyebrow: 'Writing',
    title: fallbackTitle || 'Post',
    lede: 'This note is part of the Dante writing archive. Full publication details will be added as the piece is finalized.',
    date: 'May 3, 2026',
    readTime: '5 min',
    sections: [
      {
        title: 'Draft in progress',
        body: 'This route now resolves to a readable article page instead of a placeholder. If the post has not been fully authored yet, we still preserve the structure, metadata, and reading flow so the page remains usable.',
      },
    ],
  }

  return (
    <main className="min-h-screen bg-black">
      <PageHero eyebrow={`Resources · ${post.eyebrow}`} headline={post.title} lede={post.lede} />

      <section className="px-6 pb-8">
        <div className="max-w-3xl mx-auto flex flex-wrap items-center gap-3 text-xs text-gray-500">
          <span>{post.date}</span>
          <span>&middot;</span>
          <span>{post.readTime}</span>
        </div>
      </section>

      <article className="px-6 py-12 border-t border-white/[0.06]">
        <div className="max-w-3xl mx-auto space-y-14">
          {post.sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-2xl md:text-3xl font-light tracking-tight text-white mb-5">
                {section.title}
              </h2>
              <p className="text-base md:text-lg text-[#E8E2D5]/78 font-light leading-relaxed">
                {section.body}
              </p>
            </section>
          ))}
        </div>
      </article>

      <section className="px-6 pb-32 pt-16 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-3">
              More writing
            </div>
            <h2 className="max-w-xl text-2xl md:text-3xl font-light tracking-tight text-white">
              Continue through the archive or subscribe for the next note.
            </h2>
          </div>
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 rounded-full bg-[#E8E2D5] px-6 py-3 text-sm font-semibold text-black whitespace-nowrap transition hover:bg-white"
          >
            Back to blog
            <span aria-hidden>→</span>
          </Link>
        </div>
      </section>
    </main>
  )
}
