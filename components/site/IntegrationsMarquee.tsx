'use client'

import { useEffect, useRef, useState } from 'react'

// TODO: needs content from human — confirm which integrations are actually
// production-live versus aspirational. Until then, every name below is treated
// as ROADMAP. Move items into LIVE_* once the connector is shipping in prod.
const LIVE_ROW_ONE: string[] = []
const LIVE_ROW_TWO: string[] = []

const ROADMAP_ROW_ONE = [
  'Gmail',
  'Slack',
  'Google Drive',
  'Notion',
  'Airtable',
  'HubSpot',
  'Salesforce',
  'Linear',
  'GitHub',
  'Postgres',
]

const ROADMAP_ROW_TWO = [
  'Microsoft 365',
  'SharePoint',
  'Box',
  'Dropbox',
  'Zendesk',
  'Intercom',
  'Stripe',
  'Twilio',
  'Calendly',
  'Zoom',
]

const ROADMAP_ROW_THREE = [
  'DocuSign',
  'Box',
  'Dropbox',
  'Google Workspace',
  'Microsoft 365',
  'Slack',
  'Zoom',
  'Calendly',
  'HubSpot',
  'Notion',
]

export default function IntegrationsMarquee() {
  const sectionRef = useRef<HTMLElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!sectionRef.current) return
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setVisible(true)
      },
      { threshold: 0.1 }
    )
    obs.observe(sectionRef.current)
    return () => obs.disconnect()
  }, [])

  const hasLive = LIVE_ROW_ONE.length > 0 || LIVE_ROW_TWO.length > 0

  return (
    <section
      ref={sectionRef}
      className="w-full bg-black px-6 py-32 border-t border-white/5 overflow-hidden"
    >
      <div className="max-w-6xl mx-auto mb-16">
        <div className="text-xs tracking-[0.3em] text-gray-500 mb-6">
          INTEGRATES WITH
        </div>
        <h2 className="text-3xl md:text-5xl font-light text-white leading-tight max-w-3xl">
          Already in your stack.
        </h2>
        <p className="mt-6 text-base md:text-lg text-[#E8E2D5]/60 max-w-xl font-light leading-relaxed">
          Dante sits on top of the tools you already run — email, chat, docs,
          databases, CRMs, ticketing queues, and the calendar.
        </p>
      </div>

      <div
        className="relative"
        style={{
          opacity: visible ? 1 : 0,
          transition: 'opacity 800ms ease-out',
        }}
      >
        {/* edge fades */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-32 z-10 bg-gradient-to-r from-black to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-32 z-10 bg-gradient-to-l from-black to-transparent" />

        {hasLive && (
          <div className="mb-12">
            <TierLabel eyebrow="LIVE" sub="Production integrations" />
            <div className="space-y-5">
              {LIVE_ROW_ONE.length > 0 && (
                <MarqueeRow
                  items={LIVE_ROW_ONE}
                  duration={48}
                  direction="left"
                  tier="live"
                />
              )}
              {LIVE_ROW_TWO.length > 0 && (
                <MarqueeRow
                  items={LIVE_ROW_TWO}
                  duration={56}
                  direction="right"
                  tier="live"
                />
              )}
            </div>
          </div>
        )}

        <div>
          <TierLabel eyebrow="COMING 2026" sub="Roadmap" />
          <div className="space-y-5">
            <MarqueeRow
              items={ROADMAP_ROW_ONE}
              duration={48}
              direction="left"
              tier="roadmap"
            />
            <MarqueeRow
              items={ROADMAP_ROW_TWO}
              duration={56}
              direction="right"
              tier="roadmap"
            />
            <MarqueeRow
              items={ROADMAP_ROW_THREE}
              duration={52}
              direction="left"
              tier="roadmap"
            />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes drift-marquee-left {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @keyframes drift-marquee-right {
          from { transform: translateX(-50%); }
          to { transform: translateX(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .drift-marquee-track { animation: none !important; }
        }
      `}</style>
    </section>
  )
}

function TierLabel({ eyebrow, sub }: { eyebrow: string; sub: string }) {
  return (
    <div className="max-w-6xl mx-auto mb-5 flex items-baseline gap-3">
      <span className="text-[10px] tracking-[0.3em] uppercase text-[#E8E2D5]/80 font-medium">
        {eyebrow}
      </span>
      <span className="text-[11px] text-gray-500 font-light">{sub}</span>
    </div>
  )
}

function MarqueeRow({
  items,
  duration,
  direction,
  tier,
}: {
  items: string[]
  duration: number
  direction: 'left' | 'right'
  tier: 'live' | 'roadmap'
}) {
  const doubled = [...items, ...items]
  const opacity = tier === 'roadmap' ? 0.6 : 1
  const sizing =
    tier === 'roadmap' ? 'px-4 py-2 text-xs' : 'px-5 py-3 text-sm'
  return (
    <div className="overflow-hidden" style={{ opacity }}>
      <div
        className="drift-marquee-track flex gap-3 w-max"
        style={{
          animation: `drift-marquee-${direction} ${duration}s linear infinite`,
        }}
      >
        {doubled.map((name, i) => (
          <div
            key={`${name}-${i}`}
            className={`flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.05] transition-colors duration-300 ${sizing}`}
          >
            <LogoMark name={name} size={tier === 'roadmap' ? 'sm' : 'md'} />
            <span className="text-[#E8E2D5] whitespace-nowrap font-light">
              {name}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function LogoMark({ name, size }: { name: string; size: 'sm' | 'md' }) {
  const letter = name[0]
  const dim = size === 'sm' ? 'w-5 h-5 text-[10px]' : 'w-6 h-6 text-[11px]'
  return (
    <div
      className={`rounded-md bg-white/[0.06] border border-white/10 flex items-center justify-center font-semibold text-[#E8E2D5]/80 ${dim}`}
    >
      {letter}
    </div>
  )
}
