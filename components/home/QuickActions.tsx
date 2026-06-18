"use client";

import React from "react";
import Link from "next/link";
import {
  FileSearch,
  Workflow,
  ChevronRight,
  MessageSquare,
  FolderClosed,
} from "lucide-react";

const quickActions = [
  {
    href: "/dante",
    title: "Ask Dante AI",
    description: "Search deals, leases, and market data",
    iconName: "MessageSquare" as const,
  },
  {
    href: "/lease-abstractor",
    title: "Abstract a lease",
    description: "Upload and extract key lease terms",
    iconName: "FileSearch" as const,
  },
  {
    href: "/vault",
    title: "Open the vault",
    description: "Browse and manage uploaded documents",
    iconName: "FolderClosed" as const,
  },
  {
    href: "/workflows",
    title: "Run a workflow",
    description: "Automate CRE tasks and reports",
    iconName: "Workflow" as const,
  },
];

const ICONS = {
  MessageSquare,
  FileSearch,
  FolderClosed,
  Workflow,
} as const;

export default function QuickActions() {
  return (
    <aside className="mt-6 w-full max-w-xl rounded-3xl border border-[var(--rule)] bg-[var(--surface)] p-6 text-center shadow-sm">
      <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">QUICK ACTIONS</p>
      <h2 className="mt-2 text-lg font-semibold text-[var(--ink)]">Jump back into work</h2>
      <div className="mt-5 space-y-3">
        {quickActions.map(({ href, title, description, iconName }) => {
          const Icon = ICONS[iconName];
          return (
            <Link
              key={href}
              href={href}
              className="group flex items-center justify-between rounded-2xl border border-[var(--rule)] bg-[var(--surface)] px-4 py-4 transition hover:border-[var(--accent)]/40 hover:bg-[var(--canvas-muted)]"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--rule)] bg-[var(--canvas-muted)] text-[var(--accent)]">
                  <Icon size={20} strokeWidth={1.5} />
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
