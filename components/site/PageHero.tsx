import type { ReactNode } from 'react'

export default function PageHero({
  eyebrow,
  headline,
  lede,
}: {
  eyebrow: string
  headline: ReactNode
  lede: string
}) {
  return (
    <section className="px-6 pt-40 pb-20 border-b border-white/[0.06]">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-2.5 mb-8 text-[10px] tracking-[0.3em] uppercase text-gray-500">
          <span className="w-1 h-1 rounded-full bg-[#E8E2D5]" />
          <span>{eyebrow}</span>
        </div>
        <h1 className="font-light text-white tracking-tight leading-[1.04] text-5xl md:text-[72px] mb-10 max-w-[820px]">
          {headline}
        </h1>
        <p className="text-lg md:text-xl text-[#E8E2D5]/70 max-w-[640px] leading-relaxed font-light">
          {lede}
        </p>
      </div>
    </section>
  )
}
