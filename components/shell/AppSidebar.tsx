"use client";

// AppSidebar — persistent left navigation. Replaces the top horizontal
// nav. Modeled on Harvey's pattern: workspace identity at top, search,
// module list with icons, Vergil/Dante gate as the distinct first-class
// entry, then settings + sign out at the bottom. Recent activity slot
// at the bottom is wired in a follow-up commit.
//
// Props are pulled from whichever data fetch the page already runs
// (dashboard already has them); other pages import them via a small
// hook in a follow-up. For now, every page that mounts AppShell passes
// these explicitly so we don't add a new server-fetch on every route.

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import {
  Users,
  Calendar as CalendarIcon,
  Mail,
  Mic,
  FolderClosed,
  BookOpen,
  Bell,
  Home,
  Table2,
  Settings,
  LogOut,
  Search,
  ShieldCheck,
  LayoutDashboard,
} from "lucide-react";
import DanteGateLink from "@/components/dante/DanteGateLink";
import { getIndustryConfig } from "@/lib/industry/config";

export interface AppSidebarProps {
  workspaceName: string;
  industry: string | null | undefined;
  features: string[];
  isSuperadmin?: boolean;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  /** When set, only render if the workspace's enabled_features array
   *  contains this feature id. */
  feature?: string;
  /** When set, only render for workspaces of the matching industry. */
  industry?: string;
}

export default function AppSidebar({
  workspaceName,
  industry,
  features,
  isSuperadmin,
}: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);

  // ⌘K opens the (yet-to-be-built) global search modal. For now the
  // shortcut is wired so the muscle memory is right; the modal lands
  // in a follow-up commit. Pressing it currently focuses the input
  // visually so the user knows the shortcut works.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const items: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/client-details-overview", label: "Clients", icon: Users },
    { href: "/calendar", label: "Calendar", icon: CalendarIcon },
    { href: "/inbox", label: "Email", icon: Mail },
    { href: "/agent", label: "Agent", icon: Mic },
    { href: "/vault", label: "Vault", icon: FolderClosed },
    { href: "/review-tables", label: "Review tables", icon: Table2 },
    { href: "/library", label: "Library", icon: BookOpen },
    { href: "/reminders", label: "Reminders", icon: Bell },
    { href: "/properties", label: "Properties", icon: Home, industry: "real_estate" },
  ];

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname?.startsWith(href);
  };

  const assistantConfig = getIndustryConfig(industry);

  return (
    <aside
      className="hidden lg:flex flex-col w-[240px] shrink-0 sticky top-0 h-screen bg-[var(--canvas-subtle)] border-r border-[var(--rule)]"
      aria-label="Primary navigation"
    >
      {/* Workspace identity */}
      <div className="px-4 py-4 border-b border-[var(--rule)]">
        <Link href="/dashboard" className="flex items-center gap-2.5 mb-0.5">
          <img
            src="/brand/logo-circle.png"
            alt=""
            className="w-6 h-6 rounded-full object-cover shrink-0"
          />
          <span className="text-sm font-semibold tracking-tight text-[var(--ink)]">
            Drift
          </span>
        </Link>
        <div className="text-[11px] mono text-[var(--ink-muted)] truncate ml-[34px]">
          {workspaceName}
        </div>
      </div>

      {/* Search trigger — Cmd+K. The modal lands in a later commit; for
          now clicking just opens a placeholder state. */}
      <div className="px-3 py-3">
        <button
          onClick={() => setSearchOpen(true)}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[6px] bg-[var(--canvas)] border border-[var(--rule)] hover:border-[var(--rule-strong)] text-left text-xs text-[var(--ink-muted)] transition"
        >
          <Search className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
          <span className="flex-1">Search</span>
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--canvas-subtle)] text-[var(--ink-subtle)] border border-[var(--rule)]">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Modules */}
      <nav className="flex-1 overflow-y-auto px-3 pb-3 space-y-0.5">
        {items.map((item) => {
          if (item.feature && !features.includes(item.feature)) return null;
          if (item.industry && industry !== item.industry) return null;
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-[6px] text-sm transition"
              style={{
                background: active ? "var(--canvas)" : "transparent",
                color: active ? "var(--ink)" : "var(--ink-muted)",
                fontWeight: active ? 600 : 400,
                boxShadow: active ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
              }}
            >
              <Icon
                className="w-4 h-4 shrink-0"
                strokeWidth={active ? 1.75 : 1.5}
              />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}

        {/* Vergil/Dante gate — distinct visual treatment. The icon
            and label come from IndustryConfig so RE workspaces see
            the echo + "Vergil", FA workspaces see the gate + "Dante". */}
        {features.includes("dante") && (
          <div className="pt-2 mt-2 border-t border-[var(--rule)]">
            <Link
              href="/dante"
              className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-[6px] text-sm transition"
              style={{
                background: pathname?.startsWith("/dante")
                  ? "var(--canvas)"
                  : "transparent",
                color: "var(--ink)",
                fontWeight: pathname?.startsWith("/dante") ? 600 : 500,
                boxShadow: pathname?.startsWith("/dante")
                  ? "0 1px 2px rgba(0,0,0,0.04)"
                  : "none",
              }}
            >
              <img
                src={assistantConfig.assistantIconPath}
                alt=""
                className="w-4 h-4 shrink-0 object-contain"
              />
              <span className="truncate">{assistantConfig.assistantName}</span>
            </Link>
          </div>
        )}
      </nav>

      {/* Footer — settings + sign out */}
      <div className="px-3 py-3 border-t border-[var(--rule)] space-y-0.5">
        {isSuperadmin && (
          <Link
            href="/admin"
            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-[6px] text-sm text-[var(--accent)] hover:bg-[var(--canvas)] transition"
          >
            <ShieldCheck className="w-4 h-4 shrink-0" strokeWidth={1.5} />
            Admin
          </Link>
        )}
        <Link
          href="/settings"
          className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-[6px] text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas)] transition"
          style={{
            background: pathname?.startsWith("/settings")
              ? "var(--canvas)"
              : "transparent",
            color: pathname?.startsWith("/settings")
              ? "var(--ink)"
              : "var(--ink-muted)",
          }}
        >
          <Settings className="w-4 h-4 shrink-0" strokeWidth={1.5} />
          Settings
        </Link>
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            router.push("/auth");
          }}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[6px] text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas)] transition text-left"
        >
          <LogOut className="w-4 h-4 shrink-0" strokeWidth={1.5} />
          Sign out
        </button>
      </div>

      {/* Placeholder for the global search modal — the real one lands
          next commit. For now we render a tiny notice so users see the
          ⌘K wiring is alive. */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-[var(--ink)]/30 backdrop-blur-sm pt-32 px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSearchOpen(false);
          }}
        >
          <div className="bg-[var(--canvas)] border border-[var(--rule)] rounded-[8px] shadow-xl w-full max-w-xl">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--rule)]">
              <Search
                className="w-4 h-4 text-[var(--ink-muted)]"
                strokeWidth={1.5}
              />
              <input
                placeholder="Search across vault, contacts, properties…"
                className="flex-1 bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none"
                autoFocus
              />
              <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--canvas-subtle)] text-[var(--ink-subtle)] border border-[var(--rule)]">
                Esc
              </kbd>
            </div>
            <div className="px-4 py-8 text-center text-sm text-[var(--ink-subtle)]">
              Global search lands in the next deploy. The shortcut is
              wired so your muscle memory will be right when it ships.
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
