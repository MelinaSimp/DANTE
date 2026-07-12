'use client'

import Link from 'next/link'
import { footerConfig } from '@/lib/site/nav-config'

const COLUMNS = [
  { heading: 'Product', links: footerConfig.product },
  { heading: 'Company', links: footerConfig.company },
  { heading: 'Resources', links: footerConfig.resources },
  { heading: 'Legal', links: footerConfig.legal },
] as const

export default function Footer() {
  return (
    <footer className="w-full bg-black border-t border-white/5 px-6 pt-20 pb-0 overflow-hidden">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-16">
          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <div className="text-[10px] tracking-[0.3em] text-gray-500 mb-4 uppercase font-medium">
                {col.heading}
              </div>
              <ul className="space-y-3">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-sm text-[#E8E2D5]/70 hover:text-white transition"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <Link
            href="/"
            className="text-white font-semibold tracking-[0.25em] text-sm select-none"
          >
            D A N T E
          </Link>
          <div className="text-[11px] text-gray-600 tracking-[0.2em]">
            © 2026 Dante
          </div>
          <div className="flex items-center gap-4">
            <a
              href="#"
              aria-label="LinkedIn"
              className="text-gray-500 hover:text-white transition"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 3a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h14zM8.34 9.5H5.67v8.83h2.67V9.5zM7 5.83a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm11 12.5v-4.83c0-2.5-1.34-3.67-3.13-3.67-1.45 0-2.1.8-2.46 1.36V9.5h-2.66v8.83h2.66v-4.91c0-1.31.71-2 1.65-2 .92 0 1.62.66 1.62 2.03v4.88H18z" />
              </svg>
            </a>
            <a
              href="#"
              aria-label="X / Twitter"
              className="text-gray-500 hover:text-white transition"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
              </svg>
            </a>
            <a
              href="https://github.com"
              aria-label="GitHub"
              className="text-gray-500 hover:text-white transition"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.75 1.18 1.75 1.18 1.02 1.75 2.68 1.25 3.34.95.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.17.92-.25 1.9-.38 2.88-.39.98 0 1.96.13 2.88.39 2.19-1.48 3.15-1.17 3.15-1.17.62 1.58.23 2.75.11 3.04.74.8 1.18 1.82 1.18 3.08 0 4.42-2.7 5.39-5.27 5.68.41.36.78 1.07.78 2.16v3.21c0 .31.21.67.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
              </svg>
            </a>
          </div>
        </div>

        <div
          className="w-full text-right font-semibold uppercase select-none leading-[0.78] mt-16"
          style={{
            fontSize: 'clamp(120px, 22vw, 380px)',
            letterSpacing: '0.04em',
            color: 'rgba(120, 120, 120, 0.55)',
            paddingRight: 'clamp(16px, 5vw, 96px)',
            transform: 'translateY(22%)',
          }}
          aria-hidden
        >
          DANTE
        </div>
      </div>
    </footer>
  )
}
