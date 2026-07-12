'use client'

import { useEffect, useRef, useState } from 'react'

type Segment = {
  text: string
  emphasis?: 'body' | 'key' | 'muted'
}

type Block = {
  segments: Segment[]
  variant: 'eyebrow' | 'lede' | 'note' | 'quote' | 'resolution' | 'closing'
}

const BLOCKS: Block[] = [
  {
    variant: 'eyebrow',
    segments: [{ text: 'WHAT IS DANTE', emphasis: 'muted' }],
  },
  {
    variant: 'lede',
    segments: [
      { text: 'Dante', emphasis: 'key' },
      { text: ' is an ', emphasis: 'body' },
      { text: 'all-in-one agentic platform', emphasis: 'key' },
      { text: ' for anyone building with AI.', emphasis: 'body' },
    ],
  },
  {
    variant: 'note',
    segments: [
      {
        text: 'Create agents, publish them as sites, connect workflows, and answer from your own source material.',
        emphasis: 'muted',
      },
    ],
  },
  {
    variant: 'quote',
    segments: [
      { text: 'Not another point tool. Not a generic chat tab. ', emphasis: 'body' },
      { text: 'A grounded operating layer for agents.', emphasis: 'key' },
    ],
  },
  {
    variant: 'resolution',
    segments: [
      { text: 'The result:', emphasis: 'key' },
      {
        text: ' agents that ship faster, workflows that run end to end, and answers that cite the record.',
        emphasis: 'body',
      },
    ],
  },
  {
    variant: 'closing',
    segments: [{ text: 'Agentic software is finally ready for everyone.', emphasis: 'muted' }],
  },
]

const BASE_SPEED = 12
const SPACE_SPEED = 0
const PUNCT_PAUSE = 110
const BLOCK_PAUSE = 180

function getStep(char: string): { delay: number; size: number } {
  if (/[.,;:—!?]/.test(char)) return { delay: PUNCT_PAUSE, size: 1 }
  if (char === ' ') return { delay: SPACE_SPEED, size: 1 }
  return { delay: BASE_SPEED, size: 2 }
}

export default function TypewriterReveal() {
  const [started, setStarted] = useState(false)
  const [revealed, setRevealed] = useState<string[][]>(
    BLOCKS.map((b) => b.segments.map(() => ''))
  )
  const [activeBlock, setActiveBlock] = useState(-1)
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!sectionRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true)
          observer.disconnect()
        }
      },
      { threshold: 0, rootMargin: '0px 0px -10% 0px' }
    )
    observer.observe(sectionRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!started) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setRevealed(BLOCKS.map((block) => block.segments.map((segment) => segment.text)))
      setActiveBlock(-1)
      return
    }

    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let blockIdx = 0
    let segIdx = 0
    let charIdx = 0

    const schedule = (delay: number) => {
      timeoutId = setTimeout(tick, delay)
    }

    const tick = () => {
      if (cancelled) return
      if (blockIdx >= BLOCKS.length) {
        setActiveBlock(-1)
        return
      }
      setActiveBlock(blockIdx)
      const block = BLOCKS[blockIdx]
      if (segIdx >= block.segments.length) {
        blockIdx++
        segIdx = 0
        charIdx = 0
        schedule(BLOCK_PAUSE)
        return
      }
      const segText = block.segments[segIdx].text
      if (charIdx >= segText.length) {
        segIdx++
        charIdx = 0
        schedule(0)
        return
      }
      const char = segText[charIdx]
      const { delay, size } = getStep(char)
      charIdx = Math.min(segText.length, charIdx + size)
      setRevealed((prev) => {
        const next = prev.map((row) => [...row])
        next[blockIdx][segIdx] = segText.slice(0, charIdx)
        return next
      })
      schedule(delay)
    }

    tick()
    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [started])

  const variantClass = (v: Block['variant']) => {
    switch (v) {
      case 'eyebrow':
        return 'text-xs tracking-[0.35em] font-medium'
      case 'lede':
        return 'text-3xl md:text-5xl leading-[1.2] font-light tracking-tight'
      case 'note':
        return 'text-base md:text-lg leading-relaxed font-light'
      case 'quote':
        return 'text-2xl md:text-4xl leading-[1.3] font-light italic'
      case 'resolution':
        return 'text-xl md:text-2xl leading-relaxed font-light'
      case 'closing':
        return 'text-sm md:text-base tracking-[0.15em] uppercase font-medium'
    }
  }

  return (
    <section
      ref={sectionRef}
      className="w-full bg-black px-6 pt-40 pb-40"
    >
      <div className="max-w-2xl mx-auto">
        {BLOCKS.map((block, bIdx) => {
          const isActive = activeBlock === bIdx

          // Spacing rhythm — generous gaps where the thought turns
          const wrapperClass =
            block.variant === 'eyebrow'
              ? 'mb-16'
              : block.variant === 'lede'
              ? 'mb-12'
              : block.variant === 'note'
              ? 'mb-20 pb-20 border-b border-white/10'
              : block.variant === 'quote'
              ? 'mb-20 pb-20 border-b border-white/10'
              : block.variant === 'resolution'
              ? 'mb-12'
              : ''

          return (
            <div key={bIdx} className={wrapperClass}>
              <div className={variantClass(block.variant)}>
                {block.segments.map((seg, sIdx) => {
                  const text = revealed[bIdx][sIdx] || ''
                  const colorClass =
                    seg.emphasis === 'key'
                      ? 'text-white'
                      : seg.emphasis === 'muted'
                      ? 'text-gray-500'
                      : 'text-[#E8E2D5]'
                  const cursorIdx = block.segments.findIndex(
                    (_, i) => (revealed[bIdx][i] || '').length < block.segments[i].text.length
                  )
                  return (
                    <span key={sIdx} className={colorClass}>
                      {text}
                      {isActive && sIdx === cursorIdx && (
                        <span className="inline-block w-[2px] h-[0.9em] bg-current align-middle ml-[1px] animate-pulse" />
                      )}
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
