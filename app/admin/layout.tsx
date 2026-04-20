"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Shield,
  Building2,
  UserPlus,
  BarChart3,
  CreditCard,
  Gauge,
  ArrowLeft,
  Menu,
  X,
} from "lucide-react";

const adminNav = [
  { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { name: "Features", href: "/admin/features", icon: Shield },
  { name: "Workspaces", href: "/admin/workspaces", icon: Building2 },
  { name: "Billing", href: "/admin/billing", icon: CreditCard },
  { name: "Usage", href: "/admin/usage", icon: Gauge },
  { name: "Invites", href: "/admin/invites", icon: UserPlus },
  { name: "Analytics", href: "/admin/analytics", icon: BarChart3 },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Force Harvey canvas background (override any dark theme)
  useEffect(() => {
    const prevHtml = document.documentElement.style.background;
    const prevBody = document.body.style.background;
    document.documentElement.style.background = "var(--canvas)";
    document.body.style.background = "var(--canvas)";
    return () => {
      document.documentElement.style.background = prevHtml;
      document.body.style.background = prevBody;
    };
  }, []);

  const isRoot = pathname === "/admin";

  if (isRoot) {
    return <div className="min-h-screen bg-[var(--canvas)]">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-[var(--canvas)] flex flex-col md:flex-row">
      {/* Mobile header */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-[var(--rule)] bg-[var(--canvas)]">
        <Link
          href="/admin"
          className="flex items-center gap-2 text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
          <span className="text-sm">Back</span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[var(--ink)]">Drift</span>
          <span className="label-section">Admin</span>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
        >
          {mobileOpen ? (
            <X className="w-5 h-5" strokeWidth={1.5} />
          ) : (
            <Menu className="w-5 h-5" strokeWidth={1.5} />
          )}
        </button>
      </div>

      {/* Mobile nav dropdown */}
      {mobileOpen && (
        <div className="md:hidden border-b border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 space-y-1">
          {adminNav.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-[4px] text-sm ${
                  isActive
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)]"
                }`}
              >
                <Icon className="w-4 h-4" strokeWidth={1.5} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden md:flex flex-col w-60 border-r border-[var(--rule)] bg-[var(--canvas)] shrink-0">
        <div className="p-5 border-b border-[var(--rule)]">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-[var(--ink-subtle)] hover:text-[var(--ink)] transition-colors mb-3 text-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span>Back to dashboard</span>
          </Link>
          <div className="flex items-baseline gap-2">
            <span className="text-base font-semibold text-[var(--ink)]">Drift</span>
            <span className="label-section">Admin</span>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          <div className="label-section px-3 pt-2 pb-1">Navigation</div>
          {adminNav.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-[4px] text-sm ${
                  isActive
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)]"
                }`}
              >
                <Icon className="w-4 h-4" strokeWidth={1.5} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Main */}
      <div className="flex-1 overflow-y-auto bg-[var(--canvas)]">{children}</div>
    </div>
  );
}
