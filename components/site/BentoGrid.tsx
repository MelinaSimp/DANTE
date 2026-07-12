'use client'

import { useEffect, useRef, useState } from 'react'

type Cell = {
  tag: string
  title: string
  body: string
  span: string
  visual: 'compliance' | 'vault' | 'meetings' | 'sites' | 'schedule' | 'integrations' | 'audit'
}

const CELLS: Cell[] = [
  {
    tag: 'CITED ANSWERS',
    title: 'Answers cite themselves.',
    body: 'Every response links back to the source document, page, record, or message it used.',
    span: 'md:col-span-2 md:row-span-2',
    visual: 'compliance',
  },
  {
    tag: 'KNOWLEDGE',
    title: 'Search every source.',
    body: 'Docs, tickets, notes, transcripts, and pages — semantic search across the work that matters.',
    span: 'md:col-span-1',
    visual: 'vault',
  },
  {
    tag: 'MEETINGS',
    title: 'Calls become workflows.',
    body: 'Every conversation can be summarized, routed, and turned into the next set of agent actions.',
    span: 'md:col-span-1',
    visual: 'meetings',
  },
  {
    tag: 'SITES',
    title: 'Agents go live on the web.',
    body: 'Publish interactive agents as shareable pages or embedded assistants backed by your knowledge.',
    span: 'md:col-span-1',
    visual: 'sites',
  },
  {
    tag: 'SCHEDULES',
    title: 'Never miss a follow-up.',
    body: 'Deadlines, reminders, and recurring workflows are queued and tracked on schedule.',
    span: 'md:col-span-1',
    visual: 'schedule',
  },
  {
    tag: 'INTEGRATIONS',
    title: 'Live across every tool.',
    body: 'Apps, docs, CRM, inboxes, and databases connected and reconciled in real time. No spreadsheet bridge.',
    span: 'md:col-span-2',
    visual: 'integrations',
  },
  {
    tag: 'AUDIT',
    title: 'Every action sourced.',
    body: 'Who saw what, when, and why. Immutable log, exportable on demand.',
    span: 'md:col-span-1',
    visual: 'audit',
  },
]

export default function BentoGrid() {
  const sectionRef = useRef<HTMLElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!sectionRef.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !visible) setVisible(true)
        })
      },
      { threshold: 0.1 }
    )
    observer.observe(sectionRef.current)
    return () => observer.disconnect()
  }, [visible])

  return (
    <section
      ref={sectionRef}
      className="w-full bg-black px-6 py-32 border-t border-white/5"
    >
      <div className="max-w-6xl mx-auto">
        <div className="text-xs tracking-[0.3em] text-gray-500 mb-6">
          EVERY SURFACE
        </div>
        <h2 className="text-3xl md:text-5xl font-light text-white mb-20 leading-tight max-w-3xl">
          One platform. Every agentic surface.
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-[minmax(220px,auto)]">
          {CELLS.map((cell, idx) => (
            <div
              key={cell.title}
              className={`group relative ${cell.span} rounded-2xl bg-[#0a0a0a] border border-white/10 hover:border-white/25 p-7 overflow-hidden transition-colors duration-500`}
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0)' : 'translateY(20px)',
                transition: `opacity 700ms cubic-bezier(0.19, 1, 0.22, 1) ${
                  idx * 80
                }ms, transform 700ms cubic-bezier(0.19, 1, 0.22, 1) ${
                  idx * 80
                }ms, border-color 500ms ease`,
              }}
            >
              <div className="relative z-10 flex flex-col h-full">
                <div className="text-[10px] tracking-[0.25em] text-gray-500 mb-3 font-mono">
                  {cell.tag}
                </div>
                <h3 className="text-xl md:text-2xl text-white font-light mb-3 leading-tight">
                  {cell.title}
                </h3>
                <p className="text-sm md:text-base text-[#E8E2D5]/60 leading-relaxed font-light max-w-md">
                  {cell.body}
                </p>
                <div className="mt-auto pt-6">
                  <Visual kind={cell.visual} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Visual({ kind }: { kind: Cell['visual'] }) {
  if (kind === 'compliance') {
    return (
      <div className="rounded-md bg-black/60 border border-white/5 p-4 font-mono text-[11px] space-y-1.5">
        <div className="flex justify-between text-gray-600">
          <span>MEMO-2026-0481</span>
          <span>SIGNED</span>
        </div>
        <div className="text-[#E8E2D5]/70 leading-relaxed">
          Answer: pricing changed from team-only to seat-plus-usage.
        </div>
        <div className="text-gray-600 pt-1">
          cite: pricing-plan.md §4.2, launch-notes #118
        </div>
        <div className="flex items-center gap-2 pt-2 text-gray-500">
          <div className="w-1 h-1 rounded-full bg-white/60" />
          <span>queued for approval</span>
        </div>
      </div>
    )
  }
  if (kind === 'vault') {
    return (
      <div className="space-y-1.5 font-mono text-[11px] text-gray-500">
        <div className="flex justify-between"><span>pricing-plan.md</span><span className="text-white/60">match</span></div>
        <div className="flex justify-between"><span>support-handbook.pdf</span><span>—</span></div>
        <div className="flex justify-between"><span>launch-notes.docx</span><span>—</span></div>
      </div>
    )
  }
  if (kind === 'meetings') {
    return (
      <div className="font-mono text-[11px] text-gray-500 leading-relaxed">
        <div className="text-[#E8E2D5]/70">42 min · Product sync</div>
        <div>→ update onboarding checklist</div>
        <div>→ draft customer announcement</div>
      </div>
    )
  }
  if (kind === 'sites') {
    return (
      <div className="flex items-end gap-1 h-10">
        {[0.3, 0.45, 0.4, 0.6, 0.55, 0.7, 0.85, 0.65, 0.5, 0.75, 0.9, 0.8].map((h, i) => (
          <div key={i} className="flex-1 bg-white/30 rounded-sm" style={{ height: `${h * 100}%` }} />
        ))}
      </div>
    )
  }
  if (kind === 'schedule') {
    return (
      <div className="font-mono text-[11px]">
        <div className="text-[#E8E2D5]/70">Q4 · 7 follow-ups queued</div>
        <div className="text-gray-500">next: Dec 15 · onboarding email</div>
      </div>
    )
  }
  if (kind === 'integrations') {
    return (
      <div className="flex flex-wrap gap-2 font-mono text-[10px] tracking-[0.15em]">
        {['GMAIL', 'SLACK', 'DRIVE', 'NOTION', 'HUBSPOT', 'POSTGRES'].map((c) => (
          <div key={c} className="px-3 py-1.5 rounded-full border border-white/10 text-gray-400">
            {c} · LIVE
          </div>
        ))}
      </div>
    )
  }
  // audit
  return (
    <div className="font-mono text-[11px] text-gray-500 space-y-1">
      <div>03:14 · scan complete</div>
      <div>09:02 · draft approved · jdoe</div>
      <div>09:14 · site published · jdoe</div>
    </div>
  )
}
