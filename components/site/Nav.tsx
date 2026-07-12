'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { navConfig, type NavItem } from '@/lib/site/nav-config'
import NavVisual from './NavVisual'

const HOVER_OPEN_DELAY = 120
const HOVER_CLOSE_DELAY = 250

export default function Nav() {
  const pathname = usePathname()
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileExpanded, setMobileExpanded] = useState<number | null>(null)
  const navRef = useRef<HTMLElement>(null)
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isActive = (href: string) =>
    pathname === href || (href !== '/' && (pathname?.startsWith(href) ?? false))

  useEffect(() => {
    setOpenIdx(null)
    setMobileOpen(false)
    setMobileExpanded(null)
  }, [pathname])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenIdx(null)
        setMobileOpen(false)
        setMobileExpanded(null)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpenIdx(null)
        setMobileOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  const clearTimers = () => {
    if (openTimer.current) clearTimeout(openTimer.current)
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }

  const handleEnter = (idx: number, hasChildren: boolean) => {
    if (!hasChildren) return
    clearTimers()
    openTimer.current = setTimeout(() => setOpenIdx(idx), HOVER_OPEN_DELAY)
  }

  const handleLeave = () => {
    clearTimers()
    closeTimer.current = setTimeout(() => setOpenIdx(null), HOVER_CLOSE_DELAY)
  }

  return (
    <header
      ref={navRef}
      className="fixed top-4 left-4 right-4 z-50 md:top-6 md:left-1/2 md:right-auto md:-translate-x-1/2"
    >
      {/* Desktop pill */}
      <nav
        className="hidden md:flex items-center gap-7 pl-8 pr-1.5 py-1.5 rounded-full"
        style={{
          background: 'rgba(15, 15, 15, 0.78)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '0.5px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <Link
          href="/"
          className="text-white font-semibold tracking-[0.25em] text-sm select-none whitespace-nowrap mr-2"
        >
          D A N T E
        </Link>

        {navConfig.map((item, idx) => (
          <NavItemDesktop
            key={item.label}
            item={item}
            isOpen={openIdx === idx}
            isActive={isActive(item.href)}
            onEnter={() => handleEnter(idx, !!item.children)}
            onLeave={handleLeave}
            onCancelClose={clearTimers}
            onToggle={() =>
              setOpenIdx(openIdx === idx ? null : item.children ? idx : null)
            }
          />
        ))}

        <Link
          href="/auth"
          className="ml-2 bg-white text-black px-5 py-2.5 rounded-full text-sm font-semibold whitespace-nowrap hover:bg-[#E8E2D5] transition"
        >
          Open Dante
        </Link>
      </nav>

      {/* Mobile pill */}
      <nav
        className="flex md:hidden w-full items-center justify-between gap-3 pl-6 pr-1.5 py-1.5 rounded-full"
        style={{
          background: 'rgba(15, 15, 15, 0.78)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '0.5px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <Link
          href="/"
          className="text-white font-semibold tracking-[0.25em] text-sm select-none whitespace-nowrap"
          onClick={() => setMobileOpen(false)}
        >
          D A N T E
        </Link>
        <button
          aria-label="Open menu"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(!mobileOpen)}
          className="ml-3 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition"
        >
          <svg
            className="w-4 h-4 text-white"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            {mobileOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </nav>

      {/* Mobile slide-in panel */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-[60] bg-black/95 backdrop-blur-xl px-6 pt-28 overflow-y-auto"
          style={{ animation: 'driftMobileFade 200ms ease-out' }}
        >
          <ul className="space-y-1">
            {navConfig.map((item, idx) => (
              <li key={item.label}>
                {item.children ? (
                  <>
                    <button
                      onClick={() =>
                        setMobileExpanded(mobileExpanded === idx ? null : idx)
                      }
                      className="w-full flex items-center justify-between text-left text-2xl font-light text-white py-3 border-b border-white/10"
                    >
                      <span>{item.label}</span>
                      <svg
                        className={`w-4 h-4 text-gray-400 transition-transform ${
                          mobileExpanded === idx ? 'rotate-180' : ''
                        }`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {mobileExpanded === idx && (
                      <ul className="pl-4 py-2 space-y-1">
                        {item.children.map((c) => (
                          <li key={c.href}>
                            <Link
                              href={c.href}
                              onClick={() => {
                                setMobileOpen(false)
                                setMobileExpanded(null)
                              }}
                              className="block py-2 text-base text-[#E8E2D5]"
                            >
                              {c.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <Link
                    href={item.href}
                    onClick={() => {
                      setMobileOpen(false)
                      setMobileExpanded(null)
                    }}
                    className="block text-2xl font-light text-white py-3 border-b border-white/10"
                  >
                    {item.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <Link
            href="/auth"
            onClick={() => {
              setMobileOpen(false)
              setMobileExpanded(null)
            }}
            className="mt-8 inline-block bg-white text-black px-8 py-3 rounded-full text-base font-semibold w-full text-center"
          >
            Open Dante
          </Link>
        </div>
      )}

      <style>{`
        @keyframes driftMobileFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes driftDropdownIn {
          from { opacity: 0; transform: translate(-50%, -4px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        .nav-row:hover .nav-vis-shell {
          border-color: rgba(255, 255, 255, 0.18) !important;
          background: rgba(255, 255, 255, 0.04) !important;
        }
        .nav-row .nav-arrow {
          opacity: 0;
          transform: translateX(-4px);
          transition: opacity 200ms ease, transform 200ms ease;
        }
        .nav-row:hover .nav-arrow {
          opacity: 1;
          transform: translateX(0);
        }
      `}</style>
    </header>
  )
}

function NavItemDesktop({
  item,
  isOpen,
  isActive,
  onEnter,
  onLeave,
  onCancelClose,
  onToggle,
}: {
  item: NavItem
  isOpen: boolean
  isActive: boolean
  onEnter: () => void
  onLeave: () => void
  onCancelClose: () => void
  onToggle: () => void
}) {
  const hasChildren = !!item.children

  return (
    <div
      className="relative"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <Link
        href={item.href}
        onKeyDown={(e) => {
          if (hasChildren && e.key === ' ') {
            e.preventDefault()
            onToggle()
          }
        }}
        aria-haspopup={hasChildren}
        aria-expanded={isOpen}
        className={`text-sm font-medium tracking-[-0.1px] transition-colors flex items-center gap-1 py-2 ${
          isActive ? 'text-white' : 'text-[#E8E2D5] hover:text-white'
        }`}
      >
        {item.label}
        {hasChildren && (
          <svg
            className={`w-3 h-3 opacity-60 transition-transform ${
              isOpen ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </Link>

      {hasChildren && isOpen && (
        <div
          onMouseEnter={onCancelClose}
          onMouseLeave={onLeave}
          className="absolute left-1/2 top-full pt-3 z-50"
          style={{
            animation: 'driftDropdownIn 180ms cubic-bezier(0.2, 0, 0.1, 1) forwards',
          }}
          data-open="true"
        >
          <div
            className="rounded-2xl p-2 w-[440px] shadow-2xl"
            style={{
              background: 'rgba(15, 15, 15, 0.95)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '0.5px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            {item.eyebrow && (
              <div className="px-3 pt-2 pb-2 text-[10px] tracking-[0.28em] uppercase text-gray-500">
                {item.eyebrow}
              </div>
            )}

            <ul role="menu" className="space-y-0.5">
              {item.children!.map((child) => (
                <li key={child.href} role="none">
                  <Link
                    href={child.href}
                    role="menuitem"
                    className="nav-row group flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.045] transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13.5px] font-medium text-white">
                          {child.label}
                        </span>
                        <svg
                          className="nav-arrow w-3 h-3 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          viewBox="0 0 24 24"
                          aria-hidden
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                      {child.desc && (
                        <div className="text-[11.5px] text-gray-500 mt-0.5 leading-snug">
                          {child.desc}
                        </div>
                      )}
                    </div>
                    <NavVisual variant={child.visual} />
                  </Link>
                </li>
              ))}
            </ul>

            {item.viewAllHref && (
              <div className="mt-1 pt-2 border-t border-white/[0.06]">
                <Link
                  href={item.viewAllHref}
                  className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-colors group/all"
                >
                  <span className="text-[11.5px] tracking-wide text-gray-400 group-hover/all:text-white transition-colors">
                    {item.viewAllLabel ?? 'View all'}
                  </span>
                  <svg
                    className="w-3 h-3 text-gray-500 group-hover/all:text-white group-hover/all:translate-x-0.5 transition-all"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
