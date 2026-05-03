"use client";

// components/notifications/NotificationCenter.tsx
//
// Phase 5 W5.7 — top-bar notification center.
//
// Backed by /api/unread (Phase 3+). Renders a bell icon with a
// badge count; clicking opens a dropdown grouped by category.
//
// Categories are vertical-aware via use-industry. Adding a category
// is one entry in CATEGORIES + a corresponding resource_type in
// /api/unread.

import { useQuery } from "@tanstack/react-query";
import { Bell, ClipboardCheck, Brain, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

interface UnreadCounts {
  review_queue: number;
  memory_review: number;
  total: number;
}

interface CategorySpec {
  key: keyof UnreadCounts;
  label: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}

const CATEGORIES: CategorySpec[] = [
  {
    key: "review_queue",
    label: "Outputs awaiting review",
    description: "Autonomous agent outputs ready for supervisor approval.",
    href: "/admin/review-queue",
    icon: ClipboardCheck,
  },
  {
    key: "memory_review",
    label: "AI-written memories",
    description: "Pending facts the agent learned, awaiting human approval.",
    href: "/admin/memory-review",
    icon: Brain,
  },
];

async function fetchUnread(): Promise<UnreadCounts> {
  const res = await fetch("/api/unread", { credentials: "include" });
  if (!res.ok) {
    return { review_queue: 0, memory_review: 0, total: 0 };
  }
  return (await res.json()) as UnreadCounts;
}

export default function NotificationCenter() {
  const { data } = useQuery<UnreadCounts>({
    queryKey: ["unread"],
    queryFn: fetchUnread,
    refetchInterval: 60 * 1000, // poll every minute
  });
  const [open, setOpen] = useState(false);

  const total = data?.total ?? 0;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-[4px] hover:bg-[var(--canvas-subtle)] transition"
        title={`${total} unread`}
      >
        <Bell className="w-4 h-4 text-[var(--ink-muted)]" strokeWidth={1.5} />
        {total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-[var(--accent)] text-white text-[10px] font-bold flex items-center justify-center">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full mt-2 w-96 z-50 bg-[var(--canvas)] border border-[var(--rule)] rounded-[6px] shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--rule)]">
              <span className="text-xs font-semibold tracking-wider uppercase text-[var(--ink-muted)]">
                Notifications
              </span>
              <button
                onClick={() => setOpen(false)}
                className="text-[var(--ink-subtle)] hover:text-[var(--ink)]"
              >
                <X className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {CATEGORIES.map((c) => {
                const count = (data?.[c.key] ?? 0) as number;
                const Icon = c.icon;
                return (
                  <Link
                    key={c.key}
                    href={c.href}
                    onClick={() => setOpen(false)}
                    className="block px-4 py-3 hover:bg-[var(--canvas-subtle)] border-b border-[var(--rule)] last:border-0 transition"
                  >
                    <div className="flex items-start gap-3">
                      <Icon
                        className="w-4 h-4 text-[var(--ink-muted)] mt-0.5 flex-shrink-0"
                        strokeWidth={1.5}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-[var(--ink)]">{c.label}</span>
                          {count > 0 && (
                            <span className="text-xs font-mono text-[var(--accent)]">{count}</span>
                          )}
                        </div>
                        <div className="text-xs text-[var(--ink-muted)] mt-0.5">{c.description}</div>
                      </div>
                    </div>
                  </Link>
                );
              })}
              {total === 0 && (
                <div className="px-4 py-8 text-center text-xs text-[var(--ink-subtle)]">
                  All caught up.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
