'use client'

import { useEffect, useRef, useState } from 'react'

type Step = {
  number: string
  title: string
  body: string
}

const STEPS: Step[] = [
  {
    number: '01',
    title: 'Connect your context.',
    body: 'Dante connects to docs, apps, messages, databases, and APIs without making you migrate first. Your existing stack becomes the source layer for agents.',
  },
  {
    number: '02',
    title: 'Ground the model.',
    body: 'Files, pages, records, and conversations become retrievable context. Dante answers from evidence first, with citations that make the work easy to verify.',
  },
  {
    number: '03',
    title: 'Agents do the work.',
    body: 'Build agents that draft, triage, summarize, route, and publish. Run them in the background or embed them on a site where users can interact directly.',
  },
  {
    number: '04',
    title: 'Every decision is yours.',
    body: 'Dante drafts and executes only within the boundaries you set. Every action is logged, sourced, and auditable, with human approval where it matters.',
  },
]

const HEADLINE = 'How Dante works.'

export default function MethodSteps() {
  const sectionRef = useRef<HTMLElement>(null)
  const [started, setStarted] = useState(false)
  const [typed, setTyped] = useState('')
  const [headlineDone, setHeadlineDone] = useState(false)
  const [revealedSteps, setRevealedSteps] = useState<number>(0)

  useEffect(() => {
    if (!sectionRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true)
          observer.disconnect()
        }
      },
      { threshold: 0.2 }
    )
    observer.observe(sectionRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!started) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTyped(HEADLINE)
      setHeadlineDone(true)
      return
    }

    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let i = 0

    const schedule = (delay: number) => {
      timeoutId = setTimeout(tick, delay)
    }

    const tick = () => {
      if (cancelled) return
      if (i >= HEADLINE.length) {
        setHeadlineDone(true)
        return
      }
      const ch = HEADLINE[i]
      i = Math.min(HEADLINE.length, i + (ch === ' ' ? 1 : 2))
      setTyped(HEADLINE.slice(0, i))
      const delay = /[.,;:]/.test(ch) ? 180 : ch === ' ' ? 10 : 24
      schedule(delay)
    }

    schedule(160)
    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [started])

  useEffect(() => {
    if (!headlineDone) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setRevealedSteps(STEPS.length)
      return
    }

    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const reveal = (idx: number) => {
      if (cancelled || idx > STEPS.length) return
      setRevealedSteps(idx)
      if (idx < STEPS.length) {
        timeoutId = setTimeout(() => reveal(idx + 1), 150)
      }
    }
    timeoutId = setTimeout(() => reveal(1), 240)
    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [headlineDone])

  return (
    <section
      ref={sectionRef}
      className="w-full bg-black px-6 py-32 border-t border-white/5"
    >
      <div className="max-w-3xl mx-auto">
        {/* Eyebrow */}
        <div className="text-xs tracking-[0.3em] text-gray-500 mb-8">
          THE METHOD
        </div>

        {/* Typewriter headline */}
        <h2 className="text-3xl md:text-5xl font-light text-white mb-20 leading-tight">
          {typed}
          {!headlineDone && started && (
            <span className="inline-block w-[2px] h-[0.9em] bg-white align-middle ml-[1px] animate-pulse" />
          )}
        </h2>

        {/* Steps with connecting line */}
        <div className="relative">
          {/* Vertical line — connects first three only */}
          <div
            className="absolute left-[7px] top-2 w-px bg-white/15"
            style={{
              height:
                revealedSteps >= 3
                  ? 'calc(66% - 12px)'
                  : revealedSteps === 2
                  ? 'calc(33% - 12px)'
                  : revealedSteps === 1
                  ? '0%'
                  : '0%',
              transition: 'height 560ms var(--ease-smooth)',
            }}
          />

          {STEPS.map((step, idx) => {
            const isRevealed = revealedSteps > idx
            const isLast = idx === STEPS.length - 1
            return (
              <div
                key={step.number}
                className="relative pl-8 pb-12 last:pb-0"
                style={{
                  opacity: isRevealed ? 1 : 0,
                  transform: isRevealed ? 'translateY(0)' : 'translateY(12px)',
                  transition: 'opacity 520ms var(--ease-smooth), transform 520ms var(--ease-smooth)',
                }}
              >
                {/* Dot — only on first three */}
                {!isLast && (
                  <div className="absolute left-0 top-2 w-[15px] h-[15px] rounded-full bg-black border border-white/40 flex items-center justify-center">
                    <div className="w-[5px] h-[5px] rounded-full bg-white/80" />
                  </div>
                )}
                {/* Final step marker — slightly larger, no dot inside */}
                {isLast && (
                  <div className="absolute left-0 top-2 w-[15px] h-[15px] rounded-full bg-white" />
                )}

                <div className="text-xs tracking-[0.2em] text-gray-500 mb-2 font-mono">
                  {step.number}
                </div>
                <div className="text-2xl md:text-3xl text-white font-light mb-3">
                  {step.title}
                </div>
                <div className="text-base md:text-lg text-[#E8E2D5]/70 leading-relaxed font-light max-w-xl">
                  {step.body}
                </div>
              </div>
            )
          })}
        </div>

        {/* Hairline rule + closing thesis */}
        <div
          className="mt-16 pt-12 border-t border-white/10"
          style={{
            opacity: revealedSteps >= STEPS.length ? 1 : 0,
            transition: 'opacity 520ms var(--ease-smooth)',
          }}
        >
          <p className="text-xl md:text-2xl text-[#E8E2D5] font-light leading-relaxed italic">
            Every agent, site, and workflow gets sharper from the same grounded context.
          </p>
        </div>
      </div>
    </section>
  )
}
