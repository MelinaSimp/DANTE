'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Phone, UserRound, Settings } from 'lucide-react';

type NavItem = {
  name: string;
  href: string;
  icon: React.ElementType;
};

const NAV: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Calls', href: '/calls', icon: Phone },
  { name: 'Contacts', href: '/contacts', icon: UserRound },
  { name: 'Settings', href: '/settings', icon: Settings },
];

function classNames(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  const current = NAV.find((n) => pathname === n.href) ?? NAV[0];
  const pageTitle = current?.name || 'Dashboard';

  return (
    <div className="min-h-dvh bg-gray-50 text-gray-900">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-3">
          {/* Mobile menu button */}
          <button
            aria-label="Open sidebar"
            onClick={() => setOpen(true)}
            className="md:hidden inline-flex items-center justify-center rounded-lg border px-2.5 py-1.5"
          >
            ☰
          </button>

          {/* Brand */}
          <Link href="/" className="font-semibold tracking-tight">
            drift<span className="text-blue-600">CRM</span>
          </Link>

          {/* Page title */}
          <div className="ml-2 text-sm text-gray-500 hidden sm:block">/ {pageTitle}</div>

          {/* Spacer */}
          <div className="ml-auto" />

          {/* Search (stub) */}
          <div className="hidden md:block">
            <input
              placeholder="Search…"
              className="w-64 rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Avatar stub */}
          <div className="ml-3 h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 text-white grid place-items-center text-sm">
            A
          </div>
        </div>
      </header>

      {/* Shell with sidebar */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex gap-6 py-6">
        {/* Sidebar */}
        <aside
          className={classNames(
            'fixed inset-y-0 left-0 z-40 w-64 border-r bg-white p-4 md:static md:block',
            open ? 'block' : 'hidden md:block'
          )}
        >
          <div className="mb-4 flex items-center justify-between md:hidden">
            <span className="font-semibold">Navigation</span>
            <button
              aria-label="Close sidebar"
              onClick={() => setOpen(false)}
              className="inline-flex items-center justify-center rounded-lg border px-2.5 py-1.5"
            >
              ✕
            </button>
          </div>

          <nav className="space-y-1">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={classNames(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition',
                    active
                      ? 'bg-[#3166bf] text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                  )}
                  onClick={() => setOpen(false)}
                >
                  <item.icon size={16} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-6 rounded-lg border bg-gray-50 p-3 text-xs text-gray-600">
            <div className="font-medium mb-1">Workspace</div>
            <div>Demo workspace</div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
