"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Shield,
  Building2,
  UserPlus,
  BarChart3,
  CreditCard,
  ArrowLeft,
  Menu,
  X,
} from "lucide-react";

const adminNav = [
  { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { name: "Features", href: "/admin/features", icon: Shield },
  { name: "Workspaces", href: "/admin/workspaces", icon: Building2 },
  { name: "Billing", href: "/admin/billing", icon: CreditCard },
  { name: "Invites", href: "/admin/invites", icon: UserPlus },
  { name: "Analytics", href: "/admin/analytics", icon: BarChart3 },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isRoot = pathname === "/admin";

  if (isRoot) {
    return <div className="min-h-screen bg-black">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-black flex flex-col md:flex-row">
      {/* Mobile header */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-purple-500/20 bg-black">
        <Link href="/admin" className="flex items-center gap-2 text-white/60 hover:text-white transition">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back</span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white">Drift</span>
          <span className="text-[10px] text-purple-500 font-semibold uppercase">Admin</span>
        </div>
        <button onClick={() => setMobileOpen(!mobileOpen)} className="text-white/60 hover:text-white transition">
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile nav dropdown */}
      {mobileOpen && (
        <div className="md:hidden border-b border-purple-500/20 bg-black px-3 py-2 space-y-1">
          {adminNav.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? "bg-purple-500/15 text-purple-500"
                    : "text-white/50 hover:bg-white/5 hover:text-white/80"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden md:flex flex-col w-56 border-r border-purple-500/20 bg-black shrink-0">
        <div className="p-5 border-b border-purple-500/20">
          <Link
            href="/admin"
            className="flex items-center gap-2 text-white/40 hover:text-white/70 transition-colors mb-3 text-xs font-medium"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Admin</span>
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-500 flex items-center justify-center">
              <Shield className="w-4 h-4 text-black" />
            </div>
            <div>
              <span className="text-sm font-bold text-white">Drift</span>
              <span className="text-[10px] text-purple-500 ml-1.5 font-semibold uppercase tracking-wider">Admin</span>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {adminNav.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-purple-500/15 text-purple-500 border border-purple-500/30"
                    : "text-white/50 hover:bg-white/5 hover:text-white/80 border border-transparent"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Main */}
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
