import MarketingOverviewPage from '@/components/site/MarketingOverviewPage'

export default function Page() {
  return (
    <MarketingOverviewPage
      eyebrow="Demo"
      headline={<>Talk to the Dante team.</>}
      lede="A 30-minute walkthrough focused on the agent, site, or workflow you want to build. If you are ready to try the product now, you can open Dante directly."
      cards={[
        {
          title: 'Before the call',
          body: 'We gather your team size, core systems, source data, and the agentic workflow you want to pressure-test.',
          href: '/contact',
          label: 'Share team details',
        },
        {
          title: 'During the demo',
          body: 'We show grounded answers, web-published agents, workflow triggers, and approvals running from one shared context layer.',
          href: '/product',
          label: 'Preview the product',
        },
        {
          title: 'Security review',
          body: 'If needed, we can cover retention, permissions, and the compliance package in the same meeting.',
          href: '/security',
          label: 'Review controls',
        },
        {
          title: 'Pilot design',
          body: 'Most teams leave with a practical first agent or workflow and an implementation path sized to their stack.',
          href: '/pricing',
          label: 'See pilot fit',
        },
      ]}
      sections={[
        {
          label: 'Agenda',
          title: 'What we cover in the first 30 minutes.',
          body: 'The goal is not a polished product tour. It is to see whether Dante can remove the handoffs in the workflows your team already carries.',
          points: [
            'How Dante reads docs, apps, CRM, tickets, and knowledge bases without a re-platform.',
            'How a human approves, edits, or rejects agent output before it ships.',
            'Where teams usually start: support agents, embedded sites, document Q&A, or workflow triage.',
          ],
        },
        {
          label: 'Best fit',
          title: 'The most useful demos are anchored in one specific workflow.',
          body: 'Bring one high-friction process and one real operating constraint. That is enough to see whether Dante is a fit.',
          points: [
            'Examples: build an agent, publish it to a site, summarize docs with citations, or route support workflows.',
            'We can adapt for startups, internal teams, agencies, operations groups, and enterprise buyers.',
            'A strong first pilot is usually narrow, measurable, and easy to approve internally.',
          ],
        },
      ]}
      cta={{
        eyebrow: 'Ready to book',
        title: 'If you want, the next step can simply be a call focused on one workflow.',
        label: 'Contact Dante',
        href: '/contact',
      }}
    />
  )
}
