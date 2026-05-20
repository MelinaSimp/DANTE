"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import {
  PanelLeft,
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
  ShieldCheck,
  LayoutDashboard,
  ScrollText,
  FolderSync,
  ChevronDown,
  ChevronsUpDown,
  User,
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

  const sections: { label?: string; items: NavItem[] }[] = [
    {
      items: [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      ],
    },
    {
      label: "Workspace",
      items: [
        { href: "/client-details-overview", label: "Clients", icon: Users },
        { href: "/calendar", label: "Calendar", icon: CalendarIcon },
        { href: "/inbox", label: "Email", icon: Mail },
        { href: "/reminders", label: "Reminders", icon: Bell },
      ],
    },
    {
      label: "Documents",
      items: [
        { href: "/vault", label: "Vault", icon: FolderClosed },
        { href: "/watched-folders", label: "Watched Folders", icon: FolderSync },
        { href: "/library", label: "Library", icon: BookOpen },
      ],
    },
    {
      label: "Tools",
      items: [
        { href: "/agent", label: "Agent", icon: Mic },
        { href: "/properties", label: "Properties", icon: Home, industry: "real_estate" },
        { href: "/review-tables", label: "Review tables", icon: Table2, industry: "financial_advisor" },
        { href: "/audit", label: "Audit log", icon: ScrollText },
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
      } bg-[var(--canvas-subtle)]/60 backdrop-blur-xl border-r border-[var(--glass-border)] hidden lg:flex flex-col sticky top-0 h-screen transition-all duration-300 overflow-visible`}
      aria-label="Primary navigation"
    >
      {/* Toggle + Logo */}
      <div className="flex items-center justify-between px-2.5 py-2 mb-3">
        {isOpen && (
          <div className="px-2.5">
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
            >
              <div className="w-[22px] h-[22px] rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] flex items-center justify-center text-[9px] font-semibold">
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
          className="h-9 w-9 p-2.5 items-center flex hover:bg-[var(--glass-hover)] rounded-md transition-colors text-[var(--ink-muted)]"
          title={isOpen ? "Close sidebar" : "Open sidebar"}
        >
          <PanelLeft className="h-4 w-4" />
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
                  <div className={`px-5 pt-4 pb-1 text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-subtle)] ${shouldAnimate ? "sidebar-fade-in" : ""}`}>
                    {section.label}
                  </div>
                )}
                {!isOpen && si > 0 && (
                  <div className="mx-3 my-1.5 border-t border-[var(--glass-border)]" />
                )}
                {/* Tree connector for grouped items */}
                <div className={isOpen && section.label ? "ml-[26px] pl-3" : ""}>
                  {visibleItems.map((item, ii) => {
                    const active = isActive(item.href);
                    const Icon = item.icon;
                    const isLast = ii === visibleItems.length - 1;
                    const hasTree = !!(isOpen && section.label);
                    return (
                      <div key={item.href} className={hasTree ? "relative" : "px-2.5"}>
                        {hasTree && (
                          <>
                            {/* Vertical trunk: full height except last item stops at center */}
                            <div
                              className="absolute left-0 border-l border-[var(--glass-border)]"
                              style={isLast ? { top: 0, height: "50%" } : { top: 0, bottom: 0 }}
                            />
                            {/* Horizontal branch at vertical center */}
                            <div className="absolute left-0 top-1/2 w-3 border-t border-[var(--glass-border)]" />
                          </>
                        )}
                        <Link
                          href={item.href}
                          title={!isOpen ? item.label : ""}
                          className={`w-full h-9 flex items-center gap-3 px-2.5 py-2 rounded-md transition-colors text-left ${
                            active
                              ? "bg-[var(--glass-active)] text-[var(--ink)]"
                              : "hover:bg-[var(--glass-hover)] text-[var(--ink-muted)]"
                          }`}
                        >
                          <Icon
                            className={`h-4 w-4 flex-shrink-0 ${
                              active ? "text-[var(--accent)]" : "text-[var(--ink-subtle)]"
                            }`}
                            strokeWidth={active ? 1.75 : 1.5}
                          />
                          {isOpen && (
                            <span
                              className={`text-sm font-medium ${
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
              <div className="mx-4 my-2 border-t border-[var(--glass-border)]" />
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
              className={`mb-2 px-5 flex items-center justify-between text-xs font-semibold text-[var(--ink-subtle)] hover:text-[var(--ink-muted)] transition-colors ${
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
                      className="h-9 flex items-center px-3 rounded-md"
                    >
                      <div
                        className="h-3 bg-[var(--glass)] rounded animate-pulse"
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
                      <button
                        key={chat.id}
                        onClick={() => router.push(`/dante/chat/${chat.id}`)}
                        className={`w-full h-9 flex items-center px-2.5 rounded-md text-sm truncate transition-colors ${
                          chatActive
                            ? "bg-[var(--glass-active)] text-[var(--ink)] font-medium"
                            : "text-[var(--ink-muted)] hover:bg-[var(--glass-hover)] hover:text-[var(--ink)]"
                        }`}
                        title={chat.title}
                      >
                        {chat.title}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* Footer -- user profile + settings */}
      <div className="mt-auto flex flex-col items-stretch gap-0.5 px-2 pt-2 border-t border-[var(--glass-border)]">
        {isSuperadmin && (
          <Link
            href="/admin"
            title={!isOpen ? "Admin" : ""}
            className={`h-9 flex items-center gap-3 px-2.5 rounded-md transition-colors text-[var(--ink-muted)] hover:bg-[var(--glass-hover)] ${
              !isOpen ? "justify-center" : ""
            }`}
          >
            <ShieldCheck className="h-4 w-4 flex-shrink-0 text-[var(--accent)]" strokeWidth={1.5} />
            {isOpen && (
              <span className={`text-sm font-medium ${shouldAnimate ? "sidebar-fade-in-2" : ""}`}>
                Admin
              </span>
            )}
          </Link>
        )}
        <Link
          href="/settings"
          title={!isOpen ? "Settings" : ""}
          className={`h-9 flex items-center gap-3 px-2.5 rounded-md transition-colors ${
            pathname?.startsWith("/settings")
              ? "bg-[var(--glass-active)] text-[var(--ink)]"
              : "text-[var(--ink-muted)] hover:bg-[var(--glass-hover)]"
          } ${!isOpen ? "justify-center" : ""}`}
        >
          <Settings className="h-4 w-4 flex-shrink-0" strokeWidth={1.5} />
          {isOpen && (
            <span className={`text-sm font-medium ${shouldAnimate ? "sidebar-fade-in-2" : ""}`}>
              Settings
            </span>
          )}
        </Link>

        {/* User profile section */}
        <div className="relative">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className={`flex items-center transition-colors w-full px-2.5 py-3 ${
              !isOpen ? "justify-center" : ""
            } ${
              isDropdownOpen ? "bg-[var(--glass-active)]" : "hover:bg-[var(--glass-hover)]"
            } rounded-md`}
            title={!isOpen ? workspaceName : undefined}
          >
            <div className="h-7 w-7 flex-shrink-0 rounded-full bg-[var(--accent)] flex items-center justify-center text-white text-sm font-medium font-serif">
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
            <div className="absolute bottom-full left-0 m-1 bg-[var(--canvas-muted)] backdrop-blur-xl rounded-lg shadow-lg border border-[var(--glass-border)] p-1 z-50 w-56 whitespace-nowrap">
              <Link
                href="/settings"
                onClick={() => setIsDropdownOpen(false)}
                className="w-full px-4 py-2 text-left text-sm text-[var(--ink-muted)] hover:bg-[var(--glass-hover)] hover:text-[var(--ink)] flex items-center gap-2 rounded-md"
              >
                <User className="h-4 w-4" />
                Account Settings
              </Link>
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  router.push("/auth");
                }}
                className="w-full px-4 py-2 text-left text-sm text-[var(--ink-muted)] hover:bg-[var(--glass-hover)] hover:text-[var(--ink)] flex items-center gap-2 rounded-md"
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
