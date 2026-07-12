import MarketingOverviewPage from '@/components/site/MarketingOverviewPage'

export default function Page() {
  return (
    <MarketingOverviewPage
      eyebrow="Product"
      headline={<>The platform, end to end.</>}
      lede="Assistant, Vault, Agents, and Execution are four surfaces of one agentic platform. Start anywhere. Context, citations, and workflows compound across the whole team."
      cards={[
        {
          title: 'Assistant',
          body: 'A grounded interface for answers, drafts, and follow-through across your live knowledge and tools.',
          href: '/product/assistant',
          label: 'See Assistant',
        },
        {
          title: 'Vault',
          body: 'Document understanding across PDFs, docs, tickets, pages, transcripts, and records.',
          href: '/product/vault',
          label: 'See Vault',
        },
        {
          title: 'Agents',
          body: 'Always-on workflows that scan, draft, queue, publish, and notify before the team asks.',
          href: '/product/agents',
          label: 'See Agents',
        },
        {
          title: 'Execution',
          body: 'Review trails, approvals, and audit-ready logs built into every agent action.',
          href: '/product/compliance',
          label: 'See Execution',
        },
      ]}
      sections={[
        {
          label: 'How it fits',
          title: 'One model, four working surfaces.',
          body: 'Teams do not need another app for every task. Dante connects to the current stack, builds a living context model, and exposes that model in the right place for the job.',
          points: [
            'Shared memory across meetings, messages, documents, tickets, databases, and sites.',
            'Grounded retrieval so every answer can cite source records and timestamps.',
            'Human approval gates before anything reaches a customer, teammate, database, or public site.',
          ],
        },
        {
          label: 'What changes',
          title: 'The team spends less time stitching systems together.',
          body: 'Instead of making people act as the integration layer, Dante prepares the work before the conversation starts and leaves a clean trail after it ends.',
          points: [
            'Briefs assembled from CRM, docs, tickets, messages, and database changes.',
            'Drafted replies and summaries tied to the exact sources they reference.',
            'A single review queue for agent actions, approvals, and exceptions.',
          ],
        },
      ]}
      cta={{
        eyebrow: 'See the full flow',
        title: 'We can walk through the product on a sandbox that matches your workflow.',
        label: 'Book a demo',
        href: '/demo',
      }}
    />
  )
}
