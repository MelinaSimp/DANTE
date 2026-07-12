import './site.css'
import SiteShell from '@/components/site/SiteShell'

export const metadata = {
  title: 'Dante — All-in-one agentic platform',
  description:
    'Build agents, sites, and workflows on an almost hallucination-free LLM. For anyone — grounded in your data, cited every time.',
}

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell>{children}</SiteShell>
}
