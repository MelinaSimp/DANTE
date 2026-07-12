export type NavChild = {
  label: string
  href: string
  desc?: string
  visual?: string
}

export type NavItem = {
  label: string
  href: string
  children?: NavChild[]
  eyebrow?: string
  viewAllLabel?: string
  viewAllHref?: string
}

export const navConfig: NavItem[] = [
  { label: 'Home', href: '/' },
  { label: 'Pricing', href: '/pricing' },
  {
    label: 'Product',
    href: '/product',
    eyebrow: 'Product',
    viewAllLabel: 'View all products',
    viewAllHref: '/product',
    children: [
      {
        label: 'Assistant',
        href: '/product/assistant',
        desc: 'Grounded answers over your data',
        visual: 'assistant',
      },
      {
        label: 'Vault',
        href: '/product/vault',
        desc: 'Source-backed document understanding',
        visual: 'vault',
      },
      {
        label: 'Agents',
        href: '/product/agents',
        desc: 'Always-on workflows you can build',
        visual: 'agents',
      },
      {
        label: 'Execution',
        href: '/product/compliance',
        desc: 'Approvals, logs, and safe follow-through',
        visual: 'compliance',
      },
    ],
  },
  {
    label: 'Resources',
    href: '/resources',
    eyebrow: 'Resources',
    viewAllLabel: 'View all resources',
    viewAllHref: '/resources',
    children: [
      { label: 'Method', href: '/method', desc: 'How Dante works', visual: 'method' },
      { label: 'Customers', href: '/customers', desc: 'Case studies and stories', visual: 'customers' },
      { label: 'ROI Calculator', href: '/roi', desc: 'Estimate workflow value', visual: 'roi' },
      { label: 'Security', href: '/security', desc: 'SOC 2, encryption, data handling', visual: 'security' },
      { label: 'Integrations', href: '/integrations', desc: 'Apps, docs, CRMs, and databases', visual: 'integrations' },
      { label: 'Blog', href: '/blog', desc: 'Writing on agents and grounded AI', visual: 'blog' },
    ],
  },
  {
    label: 'Company',
    href: '/about',
    eyebrow: 'Company',
    viewAllLabel: 'About Dante',
    viewAllHref: '/about',
    children: [
      { label: 'About', href: '/about', desc: 'Who we are and why we built Dante', visual: 'about' },
      { label: 'Careers', href: '/careers', desc: 'Open roles across the team', visual: 'careers' },
      { label: 'Contact', href: '/contact', desc: 'Talk to sales or support', visual: 'contact' },
    ],
  },
]

export const footerConfig = {
  product: [
    { label: 'Assistant', href: '/product/assistant' },
    { label: 'Vault', href: '/product/vault' },
    { label: 'Agents', href: '/product/agents' },
    { label: 'Execution', href: '/product/compliance' },
    { label: 'Pricing', href: '/pricing' },
  ],
  company: [
    { label: 'About', href: '/about' },
    { label: 'Careers', href: '/careers' },
    { label: 'Contact', href: '/contact' },
  ],
  resources: [
    { label: 'Method', href: '/method' },
    { label: 'Customers', href: '/customers' },
    { label: 'ROI Calculator', href: '/roi' },
    { label: 'Security', href: '/security' },
    { label: 'Blog', href: '/blog' },
  ],
  legal: [
    { label: 'Terms of Use', href: '/terms' },
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Compliance', href: '/compliance' },
    { label: 'Cookie Policy', href: '/cookies' },
    { label: 'Acceptable Use', href: '/acceptable-use' },
    { label: 'Service Status', href: '/status' },
  ],
}
