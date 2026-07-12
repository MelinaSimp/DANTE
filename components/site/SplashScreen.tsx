'use client'

import { useEffect, useState } from 'react'

const SPLASH_DURATION_MS = 1800

export default function SplashScreen({ onDone }: { onDone?: () => void }) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(false)
      onDone?.()
      return
    }

    const doneTimer = setTimeout(() => {
      setVisible(false)
      onDone?.()
    }, SPLASH_DURATION_MS)

    return () => {
      clearTimeout(doneTimer)
    }
  }, [onDone])

  if (!visible) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black overflow-hidden"
      style={{
        animation: `driftSplashFade ${SPLASH_DURATION_MS}ms var(--ease-smooth) forwards`,
        pointerEvents: 'none',
      }}
    >
      <div
        className="relative rounded-full bg-black flex items-center justify-center"
        style={{
          width: '220px',
          height: '220px',
          animation: `driftSplashBloom ${SPLASH_DURATION_MS}ms var(--ease-snappy) forwards`,
          willChange: 'transform, opacity',
        }}
      >
        <span
          className="text-white font-semibold text-xl tracking-[0.4em] select-none"
          style={{
            animation: `driftSplashWordmark ${SPLASH_DURATION_MS}ms var(--ease-smooth) forwards`,
          }}
        >
          D A N T E
        </span>
      </div>

      <style>{`
        @keyframes driftSplashBloom {
          0%, 34% {
            transform: scale(1);
          }
          100% {
            transform: scale(16);
          }
        }

        @keyframes driftSplashWordmark {
          0%, 26% {
            opacity: 1;
          }
          52%, 100% {
            opacity: 0;
          }
        }

        @keyframes driftSplashFade {
          0%, 72% {
            opacity: 1;
          }
          100% {
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}
