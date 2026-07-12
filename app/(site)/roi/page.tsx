'use client'

import PageHero from '@/components/site/PageHero'
import Link from 'next/link'
import { useEffect, useState } from 'react'

const HOURS_RECOVERED_PER_USER_PER_WEEK = 12
const USER_HOURLY_VALUE = 285
const WORKING_WEEKS = 48
const DANTE_SEAT_ANNUAL = 14400

function fmtUSD(n: number) {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return '$' + Math.round(n / 1000).toLocaleString() + 'k'
  return '$' + Math.round(n).toLocaleString()
}

function useAnimated(value: number, duration = 600) {
  const [display, setDisplay] = useState(value)
  useEffect(() => {
    const start = display
    const delta = value - start
    const t0 = performance.now()
    let raf = 0
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(start + delta * eased)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return display
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  format: (v: number) => string
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-[11px] tracking-[0.25em] uppercase text-gray-500">{label}</span>
        <span className="text-2xl font-light text-white tabular-nums">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="drift-slider w-full"
        style={{
          background: `linear-gradient(to right, #E8E2D5 0%, #E8E2D5 ${pct}%, rgba(255,255,255,0.08) ${pct}%, rgba(255,255,255,0.08) 100%)`,
        }}
      />
    </div>
  )
}

export default function Page() {
  const [monthlyTasks, setMonthlyTasks] = useState(1500)
  const [users, setUsers] = useState(12)
  const [automationRate, setAutomationRate] = useState(85)
  const [techSpend, setTechSpend] = useState(180000)

  const hoursRecovered = users * HOURS_RECOVERED_PER_USER_PER_WEEK * WORKING_WEEKS
  const timeValue = hoursRecovered * USER_HOURLY_VALUE
  const annualValue = timeValue + techSpend * 0.25
  const danteCost = users * DANTE_SEAT_ANNUAL
  const netValue = annualValue - danteCost
  const roiMultiple = annualValue / danteCost
  const paybackMonths = Math.max(1, Math.round((danteCost / annualValue) * 12))

  const animValue = useAnimated(annualValue)
  const animMultiple = useAnimated(roiMultiple)
  const animPayback = useAnimated(paybackMonths)
  const animHours = useAnimated(hoursRecovered)
  const animNet = useAnimated(netValue)

  return (
    <main className="min-h-screen bg-black">
      <PageHero
        eyebrow="Resources · ROI"
        headline={
          <>
            Hours back, per person, <em className="font-serif italic text-[#E8E2D5]">per week.</em>
          </>
        }
        lede="The Dante value model: time recovered on document analysis, workflow triage, publishing, and customer communications — measured against your seat cost."
      />

      <section className="px-6 py-20">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-px bg-white/[0.06] border border-white/[0.06] rounded-2xl overflow-hidden">
            {/* Inputs */}
            <div className="bg-black p-10 md:p-12">
              <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-2">
                Your team
              </div>
              <div className="text-xl font-light text-white tracking-tight mb-10">
                Tell us a few things.
              </div>

              <div className="space-y-10">
                <Slider
                  label="Monthly workflow volume"
                  value={monthlyTasks}
                  min={100}
                  max={10000}
                  step={50}
                  onChange={setMonthlyTasks}
                  format={(v) => v.toLocaleString()}
                />
                <Slider
                  label="Active users"
                  value={users}
                  min={1}
                  max={120}
                  step={1}
                  onChange={setUsers}
                  format={(v) => v.toString()}
                />
                <Slider
                  label="Automation coverage"
                  value={automationRate}
                  min={40}
                  max={150}
                  step={1}
                  onChange={setAutomationRate}
                  format={(v) => v + '%'}
                />
                <Slider
                  label="Current tech spend / yr"
                  value={techSpend}
                  min={20000}
                  max={1500000}
                  step={5000}
                  onChange={setTechSpend}
                  format={(v) => fmtUSD(v)}
                />
              </div>
            </div>

            {/* Outputs */}
            <div className="bg-[#0a0a0a] p-10 md:p-12">
              <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-2">
                Estimated annual value
              </div>
              <div className="text-[64px] md:text-[88px] font-light text-[#E8E2D5] tracking-tight leading-[1] tabular-nums mb-3">
                {fmtUSD(animValue)}
              </div>
              <div className="text-sm text-gray-500 mb-12 max-w-xs">
                Time recovered + tech consolidation, net of any retained tools.
              </div>

              <dl className="grid grid-cols-2 gap-px bg-white/[0.06] border border-white/[0.06] rounded-xl overflow-hidden">
                <Stat label="ROI multiple" value={animMultiple.toFixed(1) + 'x'} />
                <Stat label="Payback" value={Math.round(animPayback) + ' mo'} />
                <Stat label="Hours recovered / yr" value={Math.round(animHours).toLocaleString()} />
                <Stat label="Net value / yr" value={fmtUSD(animNet)} />
              </dl>

              <p className="text-xs text-gray-600 leading-relaxed mt-8 max-w-md">
                Assumptions: {HOURS_RECOVERED_PER_USER_PER_WEEK}h recovered per user per week, ${USER_HOURLY_VALUE.toLocaleString()}/hr blended fully loaded cost, {WORKING_WEEKS} working weeks, ${(DANTE_SEAT_ANNUAL / 1000).toFixed(1)}k Dante seat per user per year. Calibrated on teams running support, docs, and workflow agents.
              </p>
            </div>
          </div>

          {/* CTA */}
          <div className="mt-16 border-t border-white/[0.06] pt-12 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-3">
                Want this tailored to your team?
              </div>
              <h2 className="text-2xl md:text-3xl font-light text-white tracking-tight max-w-md">
                Book a 20-minute call. We&rsquo;ll model the actual numbers.
              </h2>
            </div>
            <Link
              href="/demo"
              className="inline-flex items-center gap-2 bg-[#E8E2D5] text-black px-6 py-3 rounded-full text-sm font-semibold whitespace-nowrap hover:bg-white transition"
            >
              Book the call
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </section>

      <style>{`
        .drift-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 2px;
          border-radius: 2px;
          outline: none;
          cursor: pointer;
        }
        .drift-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #E8E2D5;
          cursor: pointer;
          border: 2px solid #000;
          box-shadow: 0 0 0 1px rgba(232,226,213,0.6);
          transition: transform 120ms ease;
        }
        .drift-slider::-webkit-slider-thumb:hover {
          transform: scale(1.1);
        }
        .drift-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #E8E2D5;
          cursor: pointer;
          border: 2px solid #000;
          box-shadow: 0 0 0 1px rgba(232,226,213,0.6);
        }
      `}</style>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#0a0a0a] p-5">
      <div className="text-[10px] tracking-[0.25em] uppercase text-gray-600 mb-2">{label}</div>
      <div className="text-2xl font-light text-white tabular-nums tracking-tight">{value}</div>
    </div>
  )
}
