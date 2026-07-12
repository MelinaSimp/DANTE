'use client'

import { useEffect, useRef, useState } from 'react'

type Demo = {
  tag: string
  title: string
  body: string
}

const DEMOS: Demo[] = [
  {
    tag: 'GROUNDED ANSWERS',
    title: 'Ask your workspace a question.',
    body: 'Dante reads your docs, apps, and knowledge base in real time. Every answer is sourced, traceable, and ready to verify.',
  },
  {
    tag: 'SITES',
    title: 'Publish an agent anywhere.',
    body: 'Turn an agent into a web experience for customers, teammates, or the public. Embed it, share it, and keep it grounded in the same source layer.',
  },
  {
    tag: 'WORKFLOWS',
    title: 'Let agents run the routine work.',
    body: 'Agents watch for triggers, summarize changes, draft next steps, and queue approvals before the team asks.',
  },
]

export default function ProductDemos() {
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
      { threshold: 0.15 }
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
          WHAT IT DOES
        </div>
        <h2 className="text-3xl md:text-5xl font-light text-white mb-24 leading-tight max-w-3xl">
          See it work.
        </h2>

        <div className="space-y-32">
          {DEMOS.map((demo, idx) => {
            const reverse = idx % 2 === 1
            return (
              <div
                key={demo.title}
                className={`grid md:grid-cols-2 gap-12 md:gap-20 items-center ${
                  reverse ? 'md:[&>*:first-child]:order-2' : ''
                }`}
                style={{
                  opacity: visible ? 1 : 0,
                  transform: visible ? 'translateY(0)' : 'translateY(24px)',
                  transition: `opacity 800ms cubic-bezier(0.19, 1, 0.22, 1) ${
                    idx * 120
                  }ms, transform 800ms cubic-bezier(0.19, 1, 0.22, 1) ${
                    idx * 120
                  }ms`,
                }}
              >
                <div>
                  <div className="text-[11px] tracking-[0.25em] text-gray-500 mb-4 font-mono">
                    {demo.tag}
                  </div>
                  <h3 className="text-2xl md:text-4xl text-white font-light mb-5 leading-tight">
                    {demo.title}
                  </h3>
                  <p className="text-base md:text-lg text-[#E8E2D5]/70 leading-relaxed font-light max-w-md">
                    {demo.body}
                  </p>
                </div>

                <div>
                  {idx === 0 && <DanteQueryDemo />}
                  {idx === 1 && <SmsThreadDemo />}
                  {idx === 2 && <TlhDashboardDemo />}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function DanteQueryDemo() {
  return (
    <div className="rounded-2xl bg-[#0a0a0a] border border-white/10 p-6 font-mono text-sm shadow-2xl">
      <div className="flex items-center gap-2 mb-5 pb-3 border-b border-white/5">
        <div className="w-2 h-2 rounded-full bg-white/20" />
        <div className="w-2 h-2 rounded-full bg-white/20" />
        <div className="w-2 h-2 rounded-full bg-white/20" />
        <div className="ml-auto text-[10px] tracking-[0.2em] text-gray-600">
          DANTE · SESSION 1.4M
        </div>
      </div>

      <div className="text-[#E8E2D5]/90 mb-5 leading-relaxed">
        <span className="text-gray-600">{'> '}</span>
        What changed in the launch plan since Friday?
      </div>

      <div className="space-y-2 mb-5">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <div className="w-1 h-1 rounded-full bg-white/40" />
          <span>read</span>
          <span className="text-gray-600">docs.launch_plan.v12</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <div className="w-1 h-1 rounded-full bg-white/40" />
          <span>compare</span>
          <span className="text-gray-600">docs.launch_plan.v11</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <div className="w-1 h-1 rounded-full bg-white/40" />
          <span>cross-ref</span>
          <span className="text-gray-600">slack.#launch-updates</span>
        </div>
      </div>

      <div className="text-[#E8E2D5] leading-relaxed text-sm">
        The launch plan is <span className="text-white font-semibold">on track</span>{' '}
        — pricing is locked, onboarding moved up two days, and legal review is the only open blocker.
        <br />
        <br />
        Key decision signals:
        <div className="mt-2 space-y-1 text-xs text-gray-400">
          <div className="flex justify-between">
            <span>STATUS</span>
            <span className="text-white">ON TRACK</span>
          </div>
          <div className="flex justify-between">
            <span>BLOCKERS</span>
            <span className="text-white">1 open</span>
          </div>
          <div className="flex justify-between">
            <span>SOURCES</span>
            <span className="text-white">4 cited</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function SmsThreadDemo() {
  return (
    <div className="rounded-2xl bg-[#0a0a0a] border border-white/10 p-5 shadow-2xl">
      <div className="flex items-center justify-between mb-5 pb-3 border-b border-white/5">
        <div>
          <div className="text-sm text-white font-medium">Support Agent</div>
          <div className="text-[10px] tracking-[0.2em] text-gray-500 mt-0.5">
            EMBEDDED SITE · 11:42 AM
          </div>
        </div>
        <div className="text-[10px] tracking-[0.2em] text-gray-600">WEB</div>
      </div>

      <div className="space-y-3">
        <div className="flex">
          <div className="bg-white/5 border border-white/5 rounded-2xl rounded-tl-md px-4 py-2.5 max-w-[85%] text-sm text-[#E8E2D5]">
            Can this agent answer questions from our help center?
          </div>
        </div>

        <div className="text-[10px] tracking-[0.2em] text-gray-600 pt-3 pb-1">
          DANTE DRAFTED · PENDING APPROVAL
        </div>

        <div className="flex justify-end">
          <div className="bg-white/[0.07] border border-white/15 rounded-2xl rounded-tr-md px-4 py-2.5 max-w-[85%] text-sm text-white">
            Yes. I can answer from approved help-center articles, cite each source,
            and hand off to support when confidence is low.
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3">
          <button className="text-xs px-3 py-1.5 rounded-full border border-white/10 text-gray-400 hover:bg-white/5 transition">
            Edit
          </button>
          <button className="text-xs px-3 py-1.5 rounded-full bg-white text-black font-medium hover:bg-gray-100 transition">
            Approve & Send
          </button>
        </div>
      </div>
    </div>
  )
}

function TlhDashboardDemo() {
  const ops = [
    { ticker: 'DOC-14', loss: '92% ready', replacement: 'Publish' },
    { ticker: 'TASK-08', loss: '87% ready', replacement: 'Review' },
    { ticker: 'QA-21', loss: '81% ready', replacement: 'Review' },
    { ticker: 'SYNC-03', loss: '64% ready', replacement: 'Hold' },
  ]
  return (
    <div className="rounded-2xl bg-[#0a0a0a] border border-white/10 p-6 shadow-2xl">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/5">
        <div>
          <div className="text-[10px] tracking-[0.25em] text-gray-500 mb-1">
            WORKFLOW RUN · COMPLETE
          </div>
          <div className="text-sm text-white">3:14 AM · May 2</div>
        </div>
        <div className="w-2 h-2 rounded-full bg-white/80 animate-pulse" />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div>
          <div className="text-2xl text-white font-light">12</div>
          <div className="text-[10px] tracking-[0.2em] text-gray-500 mt-1">
            STEPS
          </div>
        </div>
        <div>
          <div className="text-2xl text-white font-light">4</div>
          <div className="text-[10px] tracking-[0.2em] text-gray-500 mt-1">
            SHORTLISTED
          </div>
        </div>
        <div>
          <div className="text-2xl text-white font-light">92</div>
          <div className="text-[10px] tracking-[0.2em] text-gray-500 mt-1">
            TOP SCORE
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {ops.map((op) => (
          <div
            key={op.ticker}
            className="flex items-center justify-between text-xs py-2 px-3 rounded-md bg-white/[0.02] border border-white/5"
          >
            <div className="font-mono text-[#E8E2D5]">{op.ticker}</div>
            <div className="text-gray-500">
              → <span className="text-gray-300">{op.replacement}</span>
            </div>
            <div className="text-white font-medium">{op.loss}</div>
          </div>
        ))}
      </div>

      <button className="w-full mt-5 text-xs tracking-[0.2em] py-3 rounded-md bg-white text-black font-medium hover:bg-gray-100 transition">
        REVIEW & APPROVE
      </button>
    </div>
  )
}
