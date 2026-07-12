import PolicyPage from '@/components/site/PolicyPage'

export default function Page() {
  return (
    <PolicyPage
      eyebrow="Legal"
      title="Cookie Policy"
      lede="What cookies we set, why we set them, and how to control them on the Dante website."
      callouts={[
        { label: 'Scope', value: 'Marketing site and first-party forms' },
        { label: 'Sensitive data', value: 'No customer workspace data stored in marketing cookies' },
        { label: 'Controls', value: 'Browser settings and consent preferences' },
      ]}
      sections={[
        {
          title: 'What we use',
          body: 'Dante uses a small set of first-party cookies and local storage keys to keep the site functional, remember simple preferences, and understand aggregate usage patterns.',
          bullets: [
            'Session cookies keep forms and navigation stable while you move through the site.',
            'Preference cookies may remember region, consent, or simple UI choices.',
            'Analytics cookies, when enabled, are used only for aggregate site measurement.',
          ],
        },
        {
          title: 'What we do not use',
          body: 'We do not use marketing-site cookies to store customer workspace data, source documents, account credentials, or private records.',
          bullets: [
            'No account credentials are stored in browser cookies on the public site.',
            'No customer document contents are written to client-side cookies.',
          ],
        },
        {
          title: 'How to control cookies',
          body: 'You can block or delete cookies through your browser settings. Doing so may affect form persistence and basic site preferences, but the site will remain readable.',
        },
      ]}
      cta={{
        title: 'Questions about data handling',
        body: 'If your team needs the full privacy or security package, we can send it directly.',
        label: 'Contact us',
        href: '/contact',
      }}
    />
  )
}
