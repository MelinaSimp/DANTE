import PolicyPage from '@/components/site/PolicyPage'

export default function Page() {
  return (
    <PolicyPage
      eyebrow="Legal · Compliance"
      title="Regulatory disclosures."
      lede="A concise summary of the controls, review points, and operating assumptions teams ask about during diligence."
      callouts={[
        { label: 'Controls', value: 'SOC 2 Type II and role-based access control' },
        { label: 'Auditability', value: 'Action trails, citations, and approval records' },
        { label: 'Model stance', value: 'Grounded outputs with human sign-off' },
      ]}
      sections={[
        {
          title: 'Operational controls',
          body: 'Dante is designed so that workflows can be supervised, reviewed, and documented inside the team’s normal operating process.',
          bullets: [
            'Permissioned access by role and environment.',
            'Centralized audit logging of actions, approvals, and key workflow events.',
            'Documented incident response, change management, and access review processes.',
          ],
        },
        {
          title: 'Agentic and supervisory posture',
          body: 'Dante supports the creation of drafts, analyses, sites, and review queues. The system is not a substitute for supervision, suitability review, or final human approval.',
          bullets: [
            'Agent outputs should be reviewed against source context and team policy.',
            'Customer-facing communications remain subject to the customer’s approval process.',
          ],
        },
        {
          title: 'Due diligence requests',
          body: 'Security questionnaires, legal review, and control-package requests can be handled directly with the Dante team under the normal NDA and procurement workflow.',
        },
      ]}
      cta={{
        title: 'Need the compliance package',
        body: 'We can share supporting documentation for security, controls, and data handling with your review team.',
        label: 'Contact us',
        href: '/contact',
      }}
    />
  )
}
