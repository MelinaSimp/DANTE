'use client'

import SplashScreen from '@/components/site/SplashScreen'
import TypewriterReveal from '@/components/site/TypewriterReveal'
import MethodSteps from '@/components/site/MethodSteps'
import ProductDemos from '@/components/site/ProductDemos'
import BentoGrid from '@/components/site/BentoGrid'
import IntegrationsMarquee from '@/components/site/IntegrationsMarquee'
import DotFieldCTA from '@/components/site/DotFieldCTA'
import CompetitivePositioning from '@/components/site/CompetitivePositioning'
import { useState, useEffect, useRef } from 'react'

export default function MarketingHome() {
  const [typedText, setTypedText] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [hasSent, setHasSent] = useState(false)
  const [splashDone, setSplashDone] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (hasSent || !splashDone) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTypedText('what is dante?')
      setHasSent(true)
      return
    }

    const startDelay = setTimeout(() => setIsTyping(true), 180)
    return () => clearTimeout(startDelay)
  }, [hasSent, splashDone])

  useEffect(() => {
    if (!isTyping || hasSent) return
    const fullText = 'what is dante?'
    let currentIndex = 0

    const typeInterval = setInterval(() => {
      if (currentIndex < fullText.length) {
        currentIndex = Math.min(fullText.length, currentIndex + 2)
        setTypedText(fullText.slice(0, currentIndex))
      } else {
        setIsTyping(false)
        setTimeout(() => handleSend(), 260)
        clearInterval(typeInterval)
      }
    }, 46)

    return () => clearInterval(typeInterval)
  }, [isTyping, hasSent])

  const handleSend = () => {
    setHasSent(true)
    setIsTyping(false)
    setTimeout(() => {
      if (contentRef.current) {
        contentRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 220)
  }

  const chips = [
    {
      label: 'Build an agent',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 16l4-6 4 4 6-8" />
        </svg>
      ),
    },
    {
      label: 'Publish a site',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      label: 'Run a workflow',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l6-6 4 4 8-8m0 0h-5m5 0v5" />
        </svg>
      ),
    },
    {
      label: 'Summarize docs',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      label: 'Cite every answer',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2z" />
        </svg>
      ),
    },
  ]

  return (
    <main>
      <SplashScreen onDone={() => setSplashDone(true)} />
      {/* Hero Section with Video */}
      <section className="relative w-full h-screen overflow-hidden bg-black">
        {/* TODO: needs content from human — add a poster image (e.g. /hero-poster.jpg)
            and pass it as poster={...}. Today the section's bg-black is the only
            fallback before the video buffers, on mobile data-saver, or where autoplay
            is blocked. */}
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover bg-black"
        >
          <source src="/hero.mp4" type="video/mp4" />
        </video>

        <div className="absolute inset-0 bg-black/50" />

        <div className="relative z-10 flex flex-col items-center justify-center h-full px-6">
          <div className="w-full max-w-3xl">
            <div className="text-center mb-10">
              <h1 className="text-3xl md:text-5xl font-bold text-white tracking-tight">
                DANTE
              </h1>
              <p className="text-[10px] tracking-[0.3em] text-gray-400 mt-2 uppercase">
                all-in-one agentic platform
              </p>
              <p
                className="mt-6 mx-auto text-[16px] md:text-[17px] leading-relaxed font-light"
                style={{ color: '#8b8780', maxWidth: '540px' }}
              >
                Build agents, publish them on the web, automate workflows, and{' '}
                <em className="italic text-[#E8E2D5]/85">
                  ground every answer in citations
                </em>
                .
              </p>
            </div>

            {/* v0-style input card */}
            <div className="bg-black/60 backdrop-blur-xl rounded-3xl border border-white/15 p-5 mb-6">
              <div className="min-h-[88px] text-lg text-gray-200 px-2 pt-1 pb-4">
                {typedText ? (
                  <span>
                    {typedText}
                    {isTyping && <span className="animate-pulse text-white">|</span>}
                  </span>
                ) : (
                  <span className="text-gray-500">Ask DANTE a question...</span>
                )}
              </div>

              <div className="flex items-center justify-between">
                <button className="text-gray-400 hover:text-white transition p-2 rounded-full">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 10-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                </button>
                <div className="flex items-center gap-2">
                  <button className="text-gray-300 hover:text-white border border-dashed border-gray-600 rounded-full px-4 py-1.5 text-sm flex items-center gap-1.5 transition">
                    <span className="text-base">+</span> Project
                  </button>
                  <button
                    onClick={handleSend}
                    className="bg-white/10 hover:bg-white/20 border border-white/20 rounded-full p-2 transition"
                  >
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Quick action chips */}
            <div className="flex flex-wrap items-center justify-center gap-3">
              {chips.map((chip) => (
                <button
                  key={chip.label}
                  className="bg-black/40 backdrop-blur-sm hover:bg-black/60 border border-white/10 hover:border-white/30 rounded-full px-5 py-2.5 text-sm text-white/90 transition flex items-center gap-2"
                >
                  {chip.icon}
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* What Is — Typewriter Reveal */}
      <div ref={contentRef}>
        <TypewriterReveal />
      </div>

      {/* The Method — 4-step cascade */}
      <MethodSteps />

      {/* Different from the point tools */}
      <CompetitivePositioning />

      {/* Product Demos */}
      <ProductDemos />

      {/* Bento Grid */}
      <BentoGrid />

      {/* Integrations marquee */}
      <IntegrationsMarquee />

      {/* CTA + Footer */}
      <DotFieldCTA />
    </main>
  )
}
