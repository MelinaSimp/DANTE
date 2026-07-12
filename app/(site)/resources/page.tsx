import MarketingOverviewPage from '@/components/site/MarketingOverviewPage'

export default function Page() {
  return (
    <MarketingOverviewPage
      eyebrow="Resources"
      headline={<>How Dante works, and why it matters.</>}
      lede="The method, customer stories, controls, and integration footprint for teams building agents, sites, and grounded workflows."
      cards={[
        {
          title: 'Method',
          body: 'A plain-language walkthrough of how Dante connects to your stack and where approvals stay human.',
          href: '/method',
          label: 'Read the method',
        },
        {
          title: 'Customers',
          body: 'How teams use Dante to compress prep time, publish agents, and automate workflows.',
          href: '/customers',
          label: 'Read customer stories',
        },
        {
          title: 'Security',
          body: 'SOC 2 posture, data handling, encryption, and operational controls.',
          href: '/security',
          label: 'Review security',
        },
        {
          title: 'Blog',
          body: 'Long-form writing on agents, AI systems, and retrieval-grounded workflows.',
          href: '/blog',
          label: 'Read the blog',
        },
      ]}
      sections={[
        {
          label: 'Evaluation',
          title: 'Built for real diligence, not hand-waving.',
          body: 'Teams evaluating Dante usually need more than a landing page. They need concrete answers about controls, implementation, and where the system stops.',
          points: [
            'Clear separation between drafting, agent action, and final human approval.',
            'Integration pages that show where Dante connects without forcing a migration.',
            'Resources written for builders, operators, security teams, and workflow owners.',
          ],
        },
        {
          label: 'Next steps',
          title: 'Start with the angle that matters to your team.',
          body: 'If the buyer is operations-led, begin with method and integrations. If the buyer is risk-led, start with security and execution controls. If the buyer is product-led, go straight to agents and sites.',
          points: [
            'Operations teams usually begin with `/method` and `/integrations`.',
            'Risk and legal teams usually begin with `/security` and `/compliance`.',
            'Builders usually begin with `/product/agents`, `/product/vault`, and `/auth`.',
          ],
        },
      ]}
      cta={{
        eyebrow: 'Need the walkthrough',
        title: 'We can tailor the resource tour around operations, security, or agent workflows.',
        label: 'Talk to the team',
        href: '/contact',
      }}
    />
  )
}
