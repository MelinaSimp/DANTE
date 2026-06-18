"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  ScrollText,
  FolderClosed,
  Workflow,
  Mic,
  Settings,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", icon: Home, label: "Dashboard" },
  { href: "/lease-abstractor", icon: ScrollText, label: "Lease Abstractor" },
  { href: "/workflows", icon: Workflow, label: "Workflows" },
  { href: "/vault", icon: FolderClosed, label: "Vault" },
  { href: "/agent", icon: Mic, label: "Voice" },
] as const;

interface IconRailProps {
  initials: string;
}

export default function IconRail({ initials }: IconRailProps) {
  const pathname = usePathname();

  const isActive = (href: string): boolean => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return !!(pathname && pathname.startsWith(href));
  };

  return (
    <nav
      className="glass-rail flex flex-col items-center w-14 py-4 shrink-0"
      aria-label="Quick navigation"
    >
      {/* Logo mark */}
      <Link
        href="/home"
        className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center text-[10px] font-semibold text-white/90 hover:bg-white/25 transition-colors mb-1"
      >
        {initials}
      </Link>

      {/* Divider */}
      <div className="w-5 border-t border-white/[0.08] my-3" />

      {/* Nav icons */}
      <div className="flex flex-col gap-1.5 flex-1">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${
                active
                  ? "bg-white/12 text-white/90 shadow-[inset_2px_2px_6px_rgba(0,0,0,0.30),inset_-1px_-1px_3px_rgba(255,255,255,0.06)]"
                  : "text-white/40 hover:text-white/70 hover:bg-white/8"
              }`}
            >
              <Icon size={20} strokeWidth={active ? 1.75 : 1.5} />
            </Link>
          );
        })}
      </div>

      {/* Settings at bottom */}
      <Link
        href="/settings"
        title="Settings"
        className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${
          pathname?.startsWith("/settings")
            ? "bg-white/12 text-white/90 shadow-[inset_2px_2px_6px_rgba(0,0,0,0.30),inset_-1px_-1px_3px_rgba(255,255,255,0.06)]"
            : "text-white/40 hover:text-white/70 hover:bg-white/8"
        }`}
      >
        <Settings size={20} strokeWidth={1.5} />
      </Link>
    </nav>
  );
}
