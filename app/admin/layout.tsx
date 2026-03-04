"use client";

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

  return (
    <div className="min-h-screen bg-black flex">
      {/* Sidebar */}
      <div className="hidden md:flex flex-col w-56 border-r border-purple-500/20 bg-black shrink-0">
        <div className="p-5 border-b border-purple-500/20">
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
        <div className="p-3 border-t border-purple-500/20">
          <Link
            href="/select"
            className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-white/40 hover:text-white/70 hover:bg-white/5 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to App</span>
          </Link>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
