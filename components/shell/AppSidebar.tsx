"use client";

// AppSidebar — Harvey-style icon-only left rail. Just under 64px
// wide, no text labels except in tooltips on hover. Workspace badge
// at the top (workspace initials in a small dark square), then the
// "+ Create" primary action, then the module stack, then settings +
// sign out at the bottom. Vergil/Dante gate is its own slot above
// the footer so it stands apart.

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
  Plus,
} from "lucide-react";
import { getIndustryConfig } from "@/lib/industry/config";
import GlobalSearchModal from "./GlobalSearchModal";
import DanteGateLink from "@/components/dante/DanteGateLink";

// SidebarTip — small CSS-only tooltip that floats to the right of an
// icon button on hover. Replaces the native `title` attribute so the
// design is consistent (no random delay, no OS chrome). Children
// must render the icon button itself; we wrap it in a positioning
// container.
function SidebarTip({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="group relative flex items-center justify-center">
      {children}
      <span
        className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-[11px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-md"
        role="tooltip"
      >
        {label}
      </span>
    </div>
  );
}

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
  feature?: string;
  industry?: string;
}

function workspaceInitials(name: string): string {
  if (!name) return "?";
  // First letters of the first two words; e.g. "Loretta's Workspace" → "LW"
  const words = name.replace(/[^A-Za-z0-9 ]/g, "").trim().split(/\s+/);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
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

  // ⌘K opens the global search modal — currently a placeholder; the
  // real cross-surface search lands in a follow-up commit. Wiring
  // the shortcut now sets muscle memory.
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
    {
      href: "/properties",
      label: "Properties",
      icon: Home,
      industry: "real_estate",
    },
  ];

  const isActive = (href: string): boolean => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return !!(pathname && pathname.startsWith(href));
  };

  const assistantConfig = getIndustryConfig(industry);
  const initials = workspaceInitials(workspaceName);

  // Reusable icon-button class. Active state gets an inset light
  // surface; idle state stays muted but lifts on hover.
  const iconBtn = (active: boolean) =>
    "w-9 h-9 flex items-center justify-center rounded-[6px] transition";
  const iconBtnStyle = (active: boolean): React.CSSProperties => ({
    background: active ? "var(--canvas)" : "transparent",
    color: active ? "var(--ink)" : "var(--ink-muted)",
    boxShadow: active ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
  });

  return (
    <aside
      className="hidden lg:flex flex-col w-[60px] shrink-0 sticky top-0 h-screen bg-[var(--canvas-subtle)] border-r border-[var(--rule)] py-3"
      aria-label="Primary navigation"
    >
      {/* Workspace badge — small dark square with initials. Click goes
          to dashboard; we keep this as the home affordance instead of
          a separate Drift logo. */}
      <div className="self-center mb-2">
        <SidebarTip label={workspaceName}>
          <Link
            href="/dashboard"
            className="w-9 h-9 rounded-[6px] bg-[var(--ink)] text-[var(--canvas)] flex items-center justify-center text-[11px] font-semibold tracking-tight"
          >
            {initials}
          </Link>
        </SidebarTip>
      </div>

      {/* Search — Cmd+K affordance. */}
      <div className="self-center mb-1">
        <SidebarTip label="Search · ⌘K">
          <button
            onClick={() => setSearchOpen(true)}
            className={`${iconBtn(false)} hover:bg-[var(--canvas)]`}
            style={iconBtnStyle(false)}
          >
            <Search className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </SidebarTip>
      </div>

      {/* Create — primary CTA. Opens search modal as a placeholder
          target until a dedicated "what do you want to make?" picker
          ships. */}
      <div className="self-center mb-3">
        <SidebarTip label="Create">
          <button
            onClick={() => setSearchOpen(true)}
            className="w-9 h-9 rounded-[6px] bg-[var(--ink)] text-[var(--canvas)] flex items-center justify-center hover:opacity-90 transition"
          >
            <Plus className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </SidebarTip>
      </div>

      {/* Module stack */}
      <nav className="flex-1 overflow-y-auto flex flex-col items-center gap-0.5 px-2">
        {items.map((item) => {
          if (item.feature && !features.includes(item.feature)) return null;
          if (item.industry && industry !== item.industry) return null;
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <SidebarTip key={item.href} label={item.label}>
              <Link
                href={item.href}
                className={`${iconBtn(active)} hover:bg-[var(--canvas)]`}
                style={iconBtnStyle(active)}
              >
              <Icon className="w-4 h-4" strokeWidth={active ? 1.75 : 1.5} />
              </Link>
            </SidebarTip>
          );
        })}

        {features.includes("dante") && (
          <>
            <div className="w-6 my-1.5 border-t border-[var(--rule)]" />
            {/* Vergil/Dante uses DanteGateLink so the ceremonial
                "passing through" overlay animation fires when the
                user clicks. Plain Link wouldn't trigger it. */}
            <SidebarTip label={assistantConfig.assistantName}>
              <DanteGateLink
                variant="icon-only"
                label={assistantConfig.assistantName}
                iconSrc={assistantConfig.assistantIconPath}
              />
            </SidebarTip>
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="flex flex-col items-center gap-0.5 px-2 mt-2 pt-2 border-t border-[var(--rule)]">
        {isSuperadmin && (
          <SidebarTip label="Admin">
            <Link
              href="/admin"
              className={`${iconBtn(false)} hover:bg-[var(--canvas)]`}
              style={{ ...iconBtnStyle(false), color: "var(--accent)" }}
            >
              <ShieldCheck className="w-4 h-4" strokeWidth={1.5} />
            </Link>
          </SidebarTip>
        )}
        <SidebarTip label="Settings">
          <Link
            href="/settings"
            className={`${iconBtn(!!(pathname && pathname.startsWith("/settings")))} hover:bg-[var(--canvas)]`}
            style={iconBtnStyle(!!(pathname && pathname.startsWith("/settings")))}
          >
            <Settings className="w-4 h-4" strokeWidth={1.5} />
          </Link>
        </SidebarTip>
        <SidebarTip label="Sign out">
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              router.push("/auth");
            }}
            className={`${iconBtn(false)} hover:bg-[var(--canvas)]`}
            style={iconBtnStyle(false)}
          >
            <LogOut className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </SidebarTip>
      </div>

      {/* Real global search — keyboard-driven, debounced, paged
          across vault / projects / contacts / properties / prompts /
          tables / reminders. */}
      <GlobalSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />

    </aside>
  );
}
