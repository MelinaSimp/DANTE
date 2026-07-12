import PolicyPage from '@/components/site/PolicyPage'

export default function Page() {
  return (
    <PolicyPage
      eyebrow="Legal"
      title="Acceptable Use Policy"
      lede="The rules of the road for using Dante safely, lawfully, and in a way that remains fit for grounded agentic work."
      callouts={[
        { label: 'Applies to', value: 'Customers, pilots, and internal users' },
        { label: 'Intent', value: 'Protect users, teams, and the platform' },
        { label: 'Escalation', value: 'Violations may suspend access' },
      ]}
      sections={[
        {
          title: 'Permitted use',
          body: 'Dante is designed for legitimate operational, support, sales, product, compliance, and customer-service workflows carried out by authorized users.',
          bullets: [
            'Use Dante only with data your team is allowed to access and process.',
            'Keep a human reviewer in the loop for sensitive, customer-facing, or regulated actions.',
            'Follow your own supervisory, privacy, and recordkeeping obligations while using the product.',
          ],
        },
        {
          title: 'Prohibited use',
          body: 'You may not use Dante to violate law, regulation, privacy obligations, or the rights of other parties.',
          bullets: [
            'No attempts to evade approval controls, audit logging, or permission boundaries.',
            'No uploads of malicious files, harmful prompts, or content intended to degrade service.',
            'No use of the system to generate deceptive communications or impersonate people without review.',
          ],
        },
        {
          title: 'Security expectations',
          body: 'Teams are expected to manage access, disable former-user credentials promptly, and notify Dante if they suspect compromise or misuse.',
        },
      ]}
      cta={{
        title: 'Need the full legal package',
        body: 'We can provide customer terms, the DPA, and supporting security documentation for review.',
        label: 'Request documents',
        href: '/contact',
      }}
    />
  )
}
