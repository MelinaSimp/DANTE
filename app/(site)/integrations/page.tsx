'use client'

import PageHero from '@/components/site/PageHero'
import Link from 'next/link'
import { useMemo, useState } from 'react'

type Status = 'Native' | 'Beta' | 'Coming soon'

type Integration = {
  name: string
  status: Status
  popular?: boolean
  enterprise?: boolean
  newlyAdded?: boolean
}

type Category = {
  id: string
  label: string
  items: Integration[]
}

const CATEGORIES: Category[] = [
  {
    id: 'email-chat',
    label: 'Email & chat',
    items: [
      { name: 'Gmail', status: 'Native', popular: true },
      { name: 'Microsoft 365', status: 'Native', popular: true, enterprise: true },
      { name: 'Slack', status: 'Native', popular: true },
      { name: 'Teams', status: 'Beta', enterprise: true },
      { name: 'Twilio', status: 'Beta', newlyAdded: true },
      { name: 'Intercom', status: 'Native', popular: true },
      { name: 'Zendesk', status: 'Native', enterprise: true },
    ],
  },
  {
    id: 'crm',
    label: 'CRM & support',
    items: [
      { name: 'Salesforce', status: 'Native', popular: true, enterprise: true },
      { name: 'HubSpot', status: 'Native' },
      { name: 'Pipedrive', status: 'Native' },
      { name: 'Attio', status: 'Beta', newlyAdded: true },
      { name: 'Linear', status: 'Native', popular: true },
      { name: 'Microsoft Dynamics', status: 'Beta', enterprise: true },
    ],
  },
  {
    id: 'docs',
    label: 'Docs & knowledge',
    items: [
      { name: 'Google Drive', status: 'Native', popular: true },
      { name: 'Microsoft SharePoint', status: 'Native', popular: true, enterprise: true },
      { name: 'Notion', status: 'Native', popular: true },
      { name: 'Confluence', status: 'Beta', enterprise: true },
      { name: 'Box', status: 'Native', enterprise: true },
      { name: 'Dropbox', status: 'Native' },
      { name: 'GitBook', status: 'Beta', newlyAdded: true },
    ],
  },
  {
    id: 'data',
    label: 'Data & databases',
    items: [
      { name: 'Postgres', status: 'Native', popular: true },
      { name: 'Snowflake', status: 'Beta', enterprise: true },
      { name: 'BigQuery', status: 'Beta', enterprise: true },
      { name: 'Airtable', status: 'Native', popular: true },
      { name: 'Retool', status: 'Beta' },
    ],
  },
  {
    id: 'builders',
    label: 'Builders',
    items: [
      { name: 'GitHub', status: 'Native', popular: true },
      { name: 'Vercel', status: 'Beta', popular: true },
      { name: 'Webflow', status: 'Beta' },
      { name: 'Framer', status: 'Coming soon' },
      { name: 'Zapier', status: 'Native', popular: true },
      { name: 'Make', status: 'Beta' },
    ],
  },
  {
    id: 'meetings',
    label: 'Meetings & forms',
    items: [
      { name: 'Zoom', status: 'Native', popular: true },
      { name: 'Google Meet', status: 'Native', popular: true },
      { name: 'Calendly', status: 'Native' },
      { name: 'Typeform', status: 'Native' },
      { name: 'Tally', status: 'Beta', newlyAdded: true },
      { name: 'DocuSign', status: 'Native', enterprise: true },
    ],
  },
]

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'popular', label: 'Most popular' },
  { id: 'newlyAdded', label: 'Newly added' },
  { id: 'enterprise', label: 'Enterprise' },
] as const
type FilterId = (typeof FILTERS)[number]['id']

const STATUS_COLOR: Record<Status, string> = {
  Native: 'text-[#E8E2D5] bg-[#E8E2D5]/10 border-[#E8E2D5]/20',
  Beta: 'text-amber-200 bg-amber-200/10 border-amber-200/20',
  'Coming soon': 'text-gray-400 bg-white/[0.04] border-white/[0.08]',
}

export default function Page() {
  const [active, setActive] = useState(CATEGORIES[0].id)
  const [filter, setFilter] = useState<FilterId>('all')
  const [query, setQuery] = useState('')

  const category = CATEGORIES.find((c) => c.id === active)!

  const items = useMemo(() => {
    return category.items.filter((i) => {
      if (filter === 'popular' && !i.popular) return false
      if (filter === 'newlyAdded' && !i.newlyAdded) return false
      if (filter === 'enterprise' && !i.enterprise) return false
      if (query && !i.name.toLowerCase().includes(query.toLowerCase())) return false
      return true
    })
  }, [category, filter, query])

  return (
    <main className="min-h-screen bg-black">
      <PageHero
        eyebrow="Resources · Integrations"
        headline={
          <>
            Dante reads from where your <em className="font-serif italic text-[#E8E2D5]">data already lives.</em>
          </>
        }
        lede="Email, chat, docs, CRMs, databases, support queues, forms, and sites. Read-only by default; the system of record stays the system of record."
      />

      <section className="px-6 py-20">
        <div className="max-w-6xl mx-auto">
          {/* Search + filters */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-10">
            <div className="relative flex-1 max-w-md">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search integrations…"
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-full px-5 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-white/20 transition-colors"
              />
            </div>
            <div className="flex gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`text-xs tracking-wide px-3.5 py-1.5 rounded-full border transition-colors ${
                    filter === f.id
                      ? 'bg-[#E8E2D5] text-black border-[#E8E2D5]'
                      : 'bg-transparent text-[#E8E2D5]/70 border-white/[0.1] hover:border-white/25'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid lg:grid-cols-12 gap-10">
            {/* Category rail */}
            <aside className="lg:col-span-3">
              <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-4">
                Categories
              </div>
              <ul className="space-y-1">
                {CATEGORIES.map((c) => {
                  const isActive = c.id === active
                  return (
                    <li key={c.id}>
                      <button
                        onClick={() => setActive(c.id)}
                        className={`w-full flex items-center justify-between text-left text-sm px-3 py-2 rounded-lg transition-colors ${
                          isActive
                            ? 'bg-white/[0.05] text-white'
                            : 'text-[#E8E2D5]/70 hover:text-white hover:bg-white/[0.03]'
                        }`}
                      >
                        <span>{c.label}</span>
                        <span className="text-[10px] text-gray-500 tabular-nums">
                          {c.items.length}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </aside>

            {/* Grid */}
            <div className="lg:col-span-9">
              <div className="flex items-baseline justify-between mb-6">
                <h2 className="text-xl font-light text-white tracking-tight">
                  {category.label}
                </h2>
                <div className="text-xs text-gray-500 tabular-nums">
                  {items.length} {items.length === 1 ? 'integration' : 'integrations'}
                </div>
              </div>

              {items.length === 0 ? (
                <div className="border border-dashed border-white/[0.1] rounded-2xl p-12 text-center">
                  <div className="text-sm text-gray-500">
                    No integrations match those filters.
                  </div>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-white/[0.06] border border-white/[0.06] rounded-2xl overflow-hidden">
                  {items.map((i) => (
                    <div
                      key={i.name}
                      className="bg-black p-5 hover:bg-white/[0.02] transition-colors group flex flex-col"
                    >
                      <div className="flex items-start justify-between gap-2 mb-4">
                        <div className="w-10 h-10 rounded-lg border border-white/[0.08] bg-white/[0.02] flex items-center justify-center text-[#E8E2D5] text-sm font-medium">
                          {i.name
                            .split(' ')
                            .map((w) => w[0])
                            .slice(0, 2)
                            .join('')}
                        </div>
                        <span
                          className={`text-[10px] tracking-wide uppercase px-2 py-0.5 rounded-full border ${STATUS_COLOR[i.status]}`}
                        >
                          {i.status}
                        </span>
                      </div>
                      <div className="text-sm font-medium text-white mb-1 leading-tight">
                        {i.name}
                      </div>
                      <div className="text-xs text-gray-500 mt-auto pt-3">
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                          View setup guide →
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 pb-32">
        <div className="max-w-6xl mx-auto border-t border-white/[0.06] pt-16 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-3">
              Don&rsquo;t see your stack?
            </div>
            <h2 className="text-2xl md:text-3xl font-light text-white tracking-tight max-w-md">
              We build new connectors for enterprise customers.
            </h2>
          </div>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 bg-[#E8E2D5] text-black px-6 py-3 rounded-full text-sm font-semibold whitespace-nowrap hover:bg-white transition"
          >
            Request an integration
            <span aria-hidden>→</span>
          </Link>
        </div>
      </section>
    </main>
  )
}
