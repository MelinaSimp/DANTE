'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

const COLS = 40
const ROWS = 24
const ACCENT_RATIO = 0.06
const WAVE_DELAY_MS = 52
const PROMPT_INTERVAL = 3800

const PROMPTS = [
  'build an agent from our support docs...',
  'publish this assistant on our site...',
  'summarize these PDFs with citations...',
  'run a workflow when a lead submits a form...',
]

const FIRM_SIZES = ['1–10 people', '11–50 people', '51–200 people', '200+ people']
const USE_CASES = ['Support', 'Sales', 'Operations', 'Product', 'Other']

export default function DotFieldCTA() {
  const sectionRef = useRef<HTMLElement>(null)
  const [paused, setPaused] = useState(true)
  const [promptIdx, setPromptIdx] = useState(0)
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const [openMenu, setOpenMenu] = useState<'team' | 'useCase' | null>(null)
  const [teamSize, setTeamSize] = useState<string | null>(null)
  const [useCase, setUseCase] = useState<string | null>(null)

  const dots = useMemo(
    () =>
      Array.from({ length: COLS * ROWS }, (_, i) => ({
        col: i % COLS,
        row: Math.floor(i / COLS),
        accent: Math.random() < ACCENT_RATIO,
      })),
    []
  )

  useEffect(() => {
    if (!sectionRef.current) return
    const obs = new IntersectionObserver(
      ([entry]) => setPaused(!entry.isIntersecting),
      { threshold: 0 }
    )
    obs.observe(sectionRef.current)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    const t = setInterval(
      () => setPromptIdx((i) => (i + 1) % PROMPTS.length),
      PROMPT_INTERVAL
    )
    return () => clearInterval(t)
  }, [])

  const showPlaceholder = !value && !focused

  return (
    <section
      ref={sectionRef}
      className="relative w-full bg-black px-6 pt-40 pb-32 overflow-hidden border-t border-white/5"
    >
      {/* Dot field */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gridTemplateRows: `repeat(${ROWS}, 1fr)`,
          padding: '12px',
        }}
        aria-hidden
      >
        {dots.map((d, i) => {
          const cx = (COLS - 1) / 2
          const cy = (ROWS - 1) / 2
          const ring = Math.max(Math.abs(d.col - cx), Math.abs(d.row - cy))
          const delay = ring * WAVE_DELAY_MS
          return (
            <div key={i} className="flex items-center justify-center">
              <div
                className={d.accent ? 'drift-dot drift-dot-accent' : 'drift-dot'}
                style={{
                  animationDelay: `${delay}ms`,
                  animationPlayState: paused ? 'paused' : 'running',
                }}
              />
            </div>
          )
        })}
      </div>

      {/* Ghost wordmark */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
        aria-hidden
        style={{ top: '-8%' }}
      >
        <span
          className="font-semibold uppercase"
          style={{
            fontSize: 'clamp(140px, 24vw, 360px)',
            color: 'rgba(232, 226, 213, 0.045)',
            letterSpacing: '0.18em',
            lineHeight: 1,
          }}
        >
          dante
        </span>
      </div>

      {/* Content */}
      <div className="relative max-w-2xl mx-auto z-10">
        <div className="text-center mb-14">
          <div className="text-xs tracking-[0.35em] text-gray-500 mb-5">
            START NOW
          </div>
          <h2 className="text-3xl md:text-5xl font-light text-white leading-tight tracking-tight">
            See Dante on your work.
          </h2>
        </div>

        <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-3 text-center">
          Tell us what you want to build
        </div>

        <div className="rounded-2xl bg-black/70 backdrop-blur-xl border border-white/15 p-5 shadow-2xl">
          <div className="relative min-h-[96px] mb-3 px-2 pt-1">
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              rows={3}
              className="absolute inset-0 w-full h-full bg-transparent text-lg text-white outline-none resize-none px-2 pt-1"
            />
            {showPlaceholder && (
              <div
                key={promptIdx}
                className="pointer-events-none text-lg text-gray-500 leading-snug px-2 drift-prompt-fade"
              >
                {PROMPTS[promptIdx]}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between flex-wrap gap-3 pt-1">
            <div className="flex items-center gap-2 relative">
              <PillSelect
                label="Team size"
                value={teamSize}
                options={FIRM_SIZES}
                open={openMenu === 'team'}
                onToggle={() =>
                  setOpenMenu(openMenu === 'team' ? null : 'team')
                }
                onSelect={(v) => {
                  setTeamSize(v)
                  setOpenMenu(null)
                }}
              />
              <PillSelect
                label="Use case"
                value={useCase}
                options={USE_CASES}
                open={openMenu === 'useCase'}
                onToggle={() =>
                  setOpenMenu(openMenu === 'useCase' ? null : 'useCase')
                }
                onSelect={(v) => {
                  setUseCase(v)
                  setOpenMenu(null)
                }}
              />
            </div>
            <a href="/contact" className="bg-[#E8E2D5] hover:bg-white text-black px-5 py-2.5 rounded-full text-sm font-medium transition flex items-center gap-2">
              Talk to the team
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                />
              </svg>
            </a>
          </div>
        </div>

        <div className="text-center mt-4 text-[12px] text-gray-500 font-light">
          Want to start now? Press Meet Dante to sign in.
        </div>
        <div className="text-center mt-3 text-xs tracking-[0.2em] text-gray-600">
          OPEN PLATFORM · CITATION-GROUNDED · HUMAN APPROVAL
        </div>
      </div>


      <style>{`
        .drift-dot {
          width: 3px;
          height: 3px;
          border-radius: 9999px;
          background: rgba(232, 226, 213, 0.55);
          animation: driftDotPulse 4800ms ease-in-out infinite;
          will-change: opacity, transform;
          transform: translateZ(0);
        }
        .drift-dot-accent {
          animation-name: driftDotAccentPulse;
        }
        @keyframes driftDotPulse {
          0%, 70%, 100% { opacity: 0.45; transform: scale(1); }
          35% { opacity: 0.8; transform: scale(1); }
        }
        @keyframes driftDotAccentPulse {
          0%, 60%, 100% {
            opacity: 0.5;
            background: rgba(232, 226, 213, 0.7);
            transform: scale(1);
          }
          30% {
            opacity: 1;
            background: rgba(232, 226, 213, 1);
            transform: scale(1.35);
          }
        }
        .drift-prompt-fade {
          animation: driftPromptFade ${PROMPT_INTERVAL}ms ease-in-out;
        }
        @keyframes driftPromptFade {
          0% { opacity: 0; transform: translateY(4px); }
          12%, 88% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-4px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .drift-dot, .drift-dot-accent {
            animation: none;
            opacity: 0.2;
          }
          .drift-prompt-fade {
            animation: none;
            opacity: 1;
          }
        }
      `}</style>
    </section>
  )
}

function PillSelect({
  label,
  value,
  options,
  open,
  onToggle,
  onSelect,
}: {
  label: string
  value: string | null
  options: string[]
  open: boolean
  onToggle: () => void
  onSelect: (v: string) => void
}) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className={`text-xs px-4 py-2 rounded-full border border-dashed transition flex items-center gap-1.5 ${
          value
            ? 'border-white/40 text-white'
            : 'border-white/20 text-gray-300 hover:border-white/50 hover:text-white'
        }`}
      >
        <span className="opacity-60">+</span> {value || label}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-2 min-w-[180px] rounded-xl bg-[#0a0a0a] border border-white/15 shadow-2xl py-1 z-20">
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => onSelect(opt)}
              className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition"
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
