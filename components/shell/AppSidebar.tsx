"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import {
  PanelLeft,
  Mic,
  FolderClosed,
  Settings,
  LogOut,
  ShieldCheck,
  LayoutDashboard,
  ScrollText,
  Calculator,
  ChevronDown,
  ChevronsUpDown,
  User,
  Workflow,
  X,
  ClipboardCheck,
  FolderSync,
  FileSearch,
} from "lucide-react";
import { getIndustryConfig } from "@/lib/industry/config";
import DanteGateLink from "@/components/dante/DanteGateLink";

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

export default function AppSidebar({
  workspaceName,
  industry,
  features,
  isSuperadmin,
}: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(true);
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [recentChats, setRecentChats] = useState<
    Array<{ id: string; title: string }> | null
  >(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("drift-sidebar-open");
    if (stored !== null) setIsOpen(stored === "true");
  }, []);

  useEffect(() => {
    localStorage.setItem("drift-sidebar-open", String(isOpen));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) setShouldAnimate(true);
  }, [isOpen]);

  useEffect(() => {
    if (!pathname?.startsWith("/dante")) return;
    fetch("/api/dante/chats")
      .then((r) => r.json())
      .then((d) => setRecentChats((d.chats || []).slice(0, 20)))
      .catch(() => setRecentChats([]));
  }, [pathname]);

  useEffect(() => {
    if (!isDropdownOpen) return;
    const handler = () => setIsDropdownOpen(false);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [isDropdownOpen]);

  const assistantConfig = getIndustryConfig(industry);

  // Collapsed nav — core entries. CRM-era destinations (Properties,
  // Site Scan) removed as Drift focuses on AI-first workflows.
  const sections: { label?: string; items: NavItem[] }[] = [
    {
      items: [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      ],
    },
    {
      items: [
        { href: "/workflows", label: "Workflows", icon: Workflow },
        { href: "/lease-abstractor", label: "Lease Abstractor", icon: ScrollText },
        { href: "/underwriter", label: "Underwriter", icon: Calculator },
        { href: "/vault", label: "Vault", icon: FolderClosed },
        { href: "/watched-folders", label: "Watched Folders", icon: FolderSync },
        { href: "/agent", label: "Voice", icon: Mic },
        { href: "/review", label: "Review Queue", icon: ClipboardCheck },
        { href: "/audit", label: "Audit Log", icon: FileSearch },
      ],
    },
  ];

  const isActive = (href: string): boolean => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return !!(pathname && pathname.startsWith(href));
  };

  const initials = (() => {
    if (!workspaceName) return "?";
    const words = workspaceName.replace(/[^A-Za-z0-9 ]/g, "").trim().split(/\s+/);
    if (words.length === 0) return "?";
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  })();

  return (
    <aside
      className={`${
        isOpen ? "w-64" : "w-14"
      } glass-panel glass-sidebar hidden lg:flex flex-col h-full transition-all duration-300 overflow-visible`}
      aria-label="Primary navigation"
    >
      {/* macOS traffic-light drag region + collapse toggle */}
      <div className="flex items-center justify-between px-3 pt-8 pb-1 mb-1">
        {isOpen && (
          <div className="px-1">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <div className="w-[22px] h-[22px] rounded-[5px] bg-[var(--ink)] text-white flex items-center justify-center text-[9px] font-semibold">
                {initials}
              </div>
              <span
                className={`text-2xl font-light font-serif text-[var(--ink)] ${
                  shouldAnimate ? "sidebar-fade-in" : ""
                }`}
              >
                Drift
              </span>
            </Link>
          </div>
        )}
        <button
          onClick={() => setIsOpen((v) => !v)}
          className="h-8 w-8 flex items-center justify-center hover:bg-[var(--neu-hover)] rounded-lg transition-colors"
          title={isOpen ? "Close sidebar" : "Open sidebar"}
        >
          <PanelLeft className="h-3.5 w-3.5 text-[var(--ink-subtle)]" />
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex-1 flex flex-col min-h-0">
        <div className="space-y-0.5">
          {sections.map((section, si) => {
            const visibleItems = section.items.filter((item) => {
              if (item.feature && !features.includes(item.feature)) return false;
              if (item.industry && industry !== item.industry) return false;
              return true;
            });
            if (visibleItems.length === 0) return null;
            return (
              <div key={si}>
                {section.label && isOpen && (
                  <div className={`px-5 pt-4 pb-1 text-[10px] uppercase tracking-[0.08em] font-medium text-[var(--ink-subtle)] ${shouldAnimate ? "sidebar-fade-in" : ""}`}>
                    {section.label}
                  </div>
                )}
                {!isOpen && si > 0 && (
                  <div className="mx-3 my-1.5 border-t border-black/[0.06]" />
                )}
                {/* Tree connector for grouped sections */}
                <div className={isOpen && section.label ? "ml-[26px] pl-3 mr-2.5" : ""}>
                  {visibleItems.map((item, ii) => {
                    const active = isActive(item.href);
                    const Icon = item.icon;
                    const isLast = ii === visibleItems.length - 1;
                    const hasTree = !!(isOpen && section.label);
                    return (
                      <div key={item.href} className={hasTree ? "relative" : "px-2.5"}>
                        {hasTree && (
                          <>
                            <div
                              className="absolute left-0 border-l border-black/[0.06]"
                              style={isLast ? { top: 0, height: "50%" } : { top: 0, bottom: 0 }}
                            />
                            <div className="absolute left-0 top-1/2 w-3 border-t border-black/[0.06]" />
                          </>
                        )}
                        <Link
                          href={item.href}
                          title={!isOpen ? item.label : ""}
                          className={`w-full h-9 flex items-center gap-3 px-2.5 py-2 rounded-lg transition-colors text-left ${
                            active
                              ? "bg-[var(--neu-active)] shadow-[var(--neu-shadow-pressed)] text-[var(--ink)] font-medium border border-white/30 border-t-white/50"
                              : "hover:bg-[var(--neu-hover)] text-[var(--ink-muted)]"
                          }`}
                        >
                          <Icon
                            className={`h-4 w-4 flex-shrink-0 ${
                              active ? "text-[var(--ink)]" : "text-[var(--ink-subtle)]"
                            }`}
                            strokeWidth={active ? 1.75 : 1.5}
                          />
                          {isOpen && (
                            <span
                              className={`text-sm ${active ? "font-semibold" : "font-medium"} ${
                                shouldAnimate ? "sidebar-fade-in-2" : ""
                              }`}
                            >
                              {item.label}
                            </span>
                          )}
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {features.includes("dante") && (
            <>
              <div className="mx-4 my-2 border-t border-black/[0.06]" />
              <div className="px-2.5">
                <DanteGateLink
                  variant={isOpen ? "sidebar-full" : "icon-only"}
                  label={assistantConfig.assistantName}
                  iconSrc={assistantConfig.assistantIconPath}
                />
              </div>
            </>
          )}
        </div>

        {/* Chat History -- only on /dante routes when sidebar is open */}
        {isOpen && pathname?.startsWith("/dante") && (
          <div className="mt-4 flex-1 min-h-0 flex flex-col">
            <button
              onClick={() => setHistoryCollapsed((v) => !v)}
              className={`mb-2 px-5 flex items-center justify-between text-xs font-medium text-[var(--ink-subtle)] hover:text-[var(--ink-muted)] transition-colors ${
                shouldAnimate ? "sidebar-fade-in" : ""
              }`}
            >
              <span>Chat History</span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${
                  historyCollapsed ? "-rotate-90" : ""
                }`}
              />
            </button>
            <div
              className={`overflow-y-auto flex-1 ${
                historyCollapsed ? "hidden" : ""
              }`}
            >
              {recentChats === null ? (
                <div className="space-y-1 px-2.5">
                  {[40, 60, 50, 70, 45].map((w, i) => (
                    <div
                      key={i}
                      className="h-9 flex items-center px-3 rounded-lg"
                    >
                      <div
                        className="h-3 bg-black/[0.04] rounded animate-pulse"
                        style={{ width: `${w}%` }}
                      />
                    </div>
                  ))}
                </div>
              ) : recentChats.length === 0 ? (
                <div
                  className={`text-xs text-[var(--ink-subtle)] py-2 px-5 ${
                    shouldAnimate ? "sidebar-fade-in-2" : ""
                  }`}
                >
                  No chats yet
                </div>
              ) : (
                <div
                  className={`space-y-0.5 px-2.5 ${
                    shouldAnimate ? "sidebar-fade-in-2" : ""
                  }`}
                >
                  {recentChats.map((chat) => {
                    const chatActive = pathname === `/dante/chat/${chat.id}`;
                    return (
                      <div
                        key={chat.id}
                        className={`group relative w-full h-9 flex items-center rounded-lg text-sm transition-colors ${
                          chatActive
                            ? "bg-[var(--neu-active)] shadow-[var(--neu-shadow-pressed)] text-[var(--ink)] font-medium border border-white/30 border-t-white/50"
                            : "text-[var(--ink-muted)] hover:bg-[var(--neu-hover)] hover:text-[var(--ink)]"
                        }`}
                      >
                        <button
                          onClick={() => router.push(`/dante/chat/${chat.id}`)}
                          className="flex-1 h-full flex items-center px-2.5 truncate text-left"
                          title={chat.title}
                        >
                          {chat.title}
                        </button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const res = await fetch(`/api/dante/chats/${chat.id}`, { method: "DELETE" });
                              if (res.ok) {
                                setRecentChats((prev) => prev?.filter((c) => c.id !== chat.id) ?? []);
                                if (chatActive) router.push("/dante");
                              }
                            } catch {}
                          }}
                          className="hidden group-hover:flex items-center justify-center w-7 h-7 mr-1 rounded-md text-[var(--ink-subtle)] hover:text-[var(--ink)] hover:bg-black/[0.06] transition-colors shrink-0"
                          title="Delete chat"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* Footer -- user profile + settings */}
      <div className="mt-auto flex flex-col items-stretch gap-0.5 px-2 pt-2 border-t border-black/[0.06]">
        {isSuperadmin && isOpen && (
          <Link
            href="/admin"
            className="h-9 flex items-center gap-3 px-2.5 rounded-lg transition-colors text-[var(--ink-muted)] hover:bg-[var(--neu-hover)]"
          >
            <ShieldCheck className="h-4 w-4 flex-shrink-0 text-blue-600" strokeWidth={1.5} />
            <span className={`text-sm font-medium ${shouldAnimate ? "sidebar-fade-in-2" : ""}`}>
              Admin
            </span>
          </Link>
        )}

        {/* User profile section */}
        <div className="relative">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className={`flex items-center transition-colors w-full px-2.5 py-3 ${
              !isOpen ? "justify-center" : ""
            } ${
              isDropdownOpen ? "bg-white/25" : "hover:bg-black/[0.04]"
            } rounded-lg`}
            title={!isOpen ? workspaceName : undefined}
          >
            <div className="h-8 w-8 flex-shrink-0 rounded-full bg-[var(--ink)] flex items-center justify-center text-white text-sm font-medium font-serif">
              {initials}
            </div>
            {isOpen && (
              <div
                className={`text-left flex-1 min-w-0 pl-3 flex items-center justify-between gap-2 ${
                  shouldAnimate ? "sidebar-fade-in-2" : ""
                }`}
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="text-sm font-medium text-[var(--ink)] leading-none truncate">
                    {workspaceName}
                  </div>
                </div>
                <ChevronsUpDown className="h-4 w-4 flex-shrink-0 text-[var(--ink-subtle)]" />
              </div>
            )}
          </button>

          {isDropdownOpen && (
            <div className="absolute bottom-full left-0 m-1 glass-card p-1 z-50 w-56 whitespace-nowrap">
              <Link
                href="/settings"
                onClick={() => setIsDropdownOpen(false)}
                className="w-full px-4 py-2 text-left text-sm text-[var(--ink-muted)] hover:bg-[var(--neu-hover)] flex items-center gap-2 rounded-lg"
              >
                <User className="h-4 w-4" />
                Account Settings
              </Link>
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  router.push("/auth");
                }}
                className="w-full px-4 py-2 text-left text-sm text-[var(--ink-muted)] hover:bg-[var(--neu-hover)] flex items-center gap-2 rounded-lg"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
