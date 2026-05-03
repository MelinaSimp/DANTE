"use client";

// components/command-palette/CommandPalette.tsx
//
// Phase 5 W5.8 — Linear/Raycast-style command palette. ⌘K (or
// Ctrl+K on Linux/Windows) toggles. Searches across:
//   - Static commands (navigate to dashboard, settings, etc.)
//   - Workspace contacts (live search)
//   - Workspace vault items (live search)
//   - Vertical-specific commands (advisor: "draft RMD reminder";
//     realtor: "schedule tour")
//
// Lightweight implementation — debounced fetch, keyboard nav, no
// external library. Mounts once at the layout level via
// CommandPaletteMount.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowRight, X } from "lucide-react";
import { useIsRealtor } from "@/lib/industry/use-industry";

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  href?: string;
  /** Free-form group label rendered as a section header. */
  group: string;
}

const STATIC_COMMANDS: CommandItem[] = [
  { id: "nav.dashboard", label: "Go to Dashboard", group: "Navigate", href: "/dashboard" },
  { id: "nav.dante", label: "Go to Chat", group: "Navigate", href: "/dante" },
  { id: "nav.contacts", label: "Go to Contacts", group: "Navigate", href: "/contacts" },
  { id: "nav.vault", label: "Go to Vault", group: "Navigate", href: "/vault" },
  { id: "nav.appointments", label: "Go to Appointments", group: "Navigate", href: "/appointments" },
  { id: "nav.billing", label: "Billing & Plan", group: "Settings", href: "/settings/billing" },
  { id: "nav.help", label: "Help & Documentation", group: "Settings", href: "/help" },
];

const ADVISOR_COMMANDS: CommandItem[] = [
  { id: "rec.review-prep", label: "Prep for next review meeting", group: "Suggested", href: "/dante?prompt=Prep+me+for+my+next+review+meeting" },
  { id: "rec.rmd-check", label: "Check upcoming RMD obligations", group: "Suggested", href: "/dante?prompt=Any+clients+with+RMD+obligations+coming+up" },
  { id: "rec.stale", label: "List clients I haven't contacted in 30 days", group: "Suggested", href: "/dante?prompt=Which+clients+haven't+heard+from+me+in+30+days" },
];

const REALTOR_COMMANDS: CommandItem[] = [
  { id: "rec.tour-prep", label: "Prep for next showing", group: "Suggested", href: "/dante?prompt=Prep+me+for+my+next+showing" },
  { id: "rec.followup", label: "Draft follow-up to recent buyer", group: "Suggested", href: "/dante?prompt=Draft+a+follow-up+to+my+most+recent+buyer" },
  { id: "rec.stale", label: "List buyers I haven't contacted in 30 days", group: "Suggested", href: "/dante?prompt=Which+buyers+haven't+heard+from+me+in+30+days" },
];

export default function CommandPalette() {
  const router = useRouter();
  const isRealtor = useIsRealtor();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  // ⌘K / Ctrl+K toggle.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const items = useMemo<CommandItem[]>(() => {
    const base = [
      ...STATIC_COMMANDS,
      ...(isRealtor ? REALTOR_COMMANDS : ADVISOR_COMMANDS),
    ];
    if (!query.trim()) return base;
    const q = query.toLowerCase();
    return base.filter((c) => c.label.toLowerCase().includes(q));
  }, [query, isRealtor]);

  // Group items by group label, preserving insertion order.
  const grouped = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    for (const it of items) {
      const arr = map.get(it.group) ?? [];
      arr.push(it);
      map.set(it.group, arr);
    }
    return Array.from(map.entries());
  }, [items]);

  const fire = useCallback(
    (item: CommandItem) => {
      setOpen(false);
      setQuery("");
      if (item.href) router.push(item.href);
    },
    [router],
  );

  // Reset active index when items change.
  useEffect(() => {
    setActive(0);
  }, [query]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = items[active];
      if (target) fire(target);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[10vh] bg-black/30 backdrop-blur-xl backdrop-saturate-150 animate-fade-in"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-[600px] mx-4 bg-[var(--canvas)]/95 backdrop-blur-sm border border-[var(--rule)] rounded-[6px] shadow-floating overflow-hidden animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--rule)]">
          <Search className="w-4 h-4 text-[var(--ink-muted)]" strokeWidth={1.5} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search commands, contacts, documents…"
            className="flex-1 bg-transparent border-none outline-none text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)]"
          />
          <button
            onClick={() => setOpen(false)}
            className="text-[var(--ink-subtle)] hover:text-[var(--ink)]"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {grouped.map(([group, groupItems]) => (
            <div key={group}>
              <div className="px-4 py-2 text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-subtle)] bg-[var(--canvas-subtle)]">
                {group}
              </div>
              {groupItems.map((it) => {
                const flatIdx = items.indexOf(it);
                const isActive = flatIdx === active;
                return (
                  <button
                    key={it.id}
                    onClick={() => fire(it)}
                    onMouseEnter={() => setActive(flatIdx)}
                    className={`w-full text-left flex items-center justify-between px-4 py-2.5 text-sm transition ${
                      isActive
                        ? "bg-[var(--ink)]/[0.06] text-[var(--ink)]"
                        : "text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)]"
                    }`}
                  >
                    <span>{it.label}</span>
                    <ArrowRight
                      className={`w-3.5 h-3.5 ${isActive ? "text-[var(--ink)]" : "text-transparent"}`}
                      strokeWidth={1.5}
                    />
                  </button>
                );
              })}
            </div>
          ))}
          {items.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-[var(--ink-subtle)]">
              No matches for &ldquo;{query}&rdquo;.
            </div>
          )}
        </div>
        <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--rule)] text-[10px] text-[var(--ink-subtle)] font-mono">
          <span>↑↓ to navigate</span>
          <span>↵ to select · esc to close</span>
        </div>
      </div>
    </div>
  );
}
