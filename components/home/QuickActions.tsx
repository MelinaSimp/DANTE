"use client";

import React from "react";
import Link from "next/link";
import { CalendarCheck, UserRound, ClipboardList, ChevronRight, FileText } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface QuickAction {
  href: string;
  title: string;
  description: string;
  icon: React.ElementType;
}

const quickActions: QuickAction[] = [
  {
    href: "/appointments",
    title: "Check upcoming schedule",
    description: "Manage bookings and confirmations",
    icon: CalendarCheck,
  },
  {
    href: "/contacts",
    title: "Update a contact",
    description: "Edit notes and interaction history",
    icon: UserRound,
  },
  {
    href: "/schedule",
    title: "Review tasks",
    description: "Stay on top of follow-ups",
    icon: ClipboardList,
  },
  {
    href: "/client-details-overview",
    title: "Client Details and Overview",
    description: "Prepare reports for household or client",
    icon: FileText,
  },
];

export default function QuickActions() {
  return (
    <aside className="mt-6 w-full max-w-xl rounded-3xl border border-[var(--rule)] bg-[var(--surface)] p-6 text-center shadow-sm">
      <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">QUICK ACTIONS</p>
      <h2 className="mt-2 text-lg font-semibold text-[var(--ink)]">Jump back into work</h2>
      <div className="mt-5 space-y-3">
        {quickActions.map(({ href, title, description, icon: IconComponent }) => {
          // Ensure IconComponent is a valid React component
          const Icon = typeof IconComponent === 'function' ? IconComponent : null;
          return (
            <Link
              key={href}
              href={href}
              className="group flex items-center justify-between rounded-2xl border border-[var(--rule)] bg-[var(--surface)] px-4 py-4 transition hover:border-[var(--accent)]/40 hover:bg-[var(--canvas-muted)]"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--rule)] bg-[var(--canvas-muted)] text-[var(--accent)]">
                  {Icon ? <Icon size={20} /> : <span className="w-5 h-5" />}
                </span>
                <div className="text-left">
                  <p className="text-sm font-semibold text-[var(--ink)] whitespace-nowrap">{title}</p>
                  <p className="text-xs text-[var(--ink-muted)]">{description}</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-[var(--ink-subtle)] transition group-hover:text-[var(--ink)]" />
            </Link>
          );
        })}
      </div>
    </aside>
  );
}

