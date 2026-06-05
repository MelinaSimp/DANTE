"use client";

// app/dante/DDChecklistBlock.tsx
//
// Renders a structured due-diligence checklist inline in the Dante
// chat. The agent emits a ```dd_checklist fenced block containing
// JSON with categories, line items, and statuses. This component
// turns that into a scannable visual with color-coded status pills,
// a progress summary bar, and collapsible category sections.
//
// Schema (what the agent emits):
// {
//   "property": "123 Main St, Dallas TX",
//   "deal_type": "Acquisition" | "Lease" | "Development" | ...,
//   "categories": [
//     {
//       "name": "Environmental",
//       "items": [
//         { "item": "Phase I ESA", "status": "complete" | "pending" | "flagged" | "na", "note": "..." },
//         ...
//       ]
//     },
//     ...
//   ]
// }

import { useState, useMemo } from "react";

export interface DDItem {
  item: string;
  status: "complete" | "pending" | "flagged" | "na";
  note?: string;
}

export interface DDCategory {
  name: string;
  items: DDItem[];
}

export interface DDChecklistData {
  property?: string;
  deal_type?: string;
  categories: DDCategory[];
}

export function parseDDChecklistBlock(raw: string): DDChecklistData | null {
  try {
    const data = JSON.parse(raw);
    if (!data.categories || !Array.isArray(data.categories)) return null;
    // Validate at least one category with items
    const valid = data.categories.every(
      (c: DDCategory) => c.name && Array.isArray(c.items),
    );
    if (!valid) return null;
    return data as DDChecklistData;
  } catch {
    return null;
  }
}

const STATUS_CONFIG: Record<
  DDItem["status"],
  { label: string; bg: string; text: string; dot: string }
> = {
  complete: {
    label: "Done",
    bg: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  pending: {
    label: "Pending",
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  flagged: {
    label: "Flagged",
    bg: "bg-red-500/10",
    text: "text-red-600 dark:text-red-400",
    dot: "bg-red-500",
  },
  na: {
    label: "N/A",
    bg: "bg-zinc-500/10",
    text: "text-zinc-500",
    dot: "bg-zinc-400",
  },
};

function StatusPill({ status }: { status: DDItem["status"] }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${cfg.bg} ${cfg.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function ProgressBar({ categories }: { categories: DDCategory[] }) {
  const allItems = categories.flatMap((c) => c.items);
  const total = allItems.length;
  if (total === 0) return null;

  const counts = {
    complete: allItems.filter((i) => i.status === "complete").length,
    pending: allItems.filter((i) => i.status === "pending").length,
    flagged: allItems.filter((i) => i.status === "flagged").length,
    na: allItems.filter((i) => i.status === "na").length,
  };

  const pct = (n: number) => Math.round((n / total) * 100);

  return (
    <div className="space-y-2">
      <div className="flex h-2 rounded-full overflow-hidden bg-zinc-200 dark:bg-zinc-700">
        {counts.complete > 0 && (
          <div
            className="bg-emerald-500 transition-all"
            style={{ width: `${pct(counts.complete)}%` }}
          />
        )}
        {counts.pending > 0 && (
          <div
            className="bg-amber-500 transition-all"
            style={{ width: `${pct(counts.pending)}%` }}
          />
        )}
        {counts.flagged > 0 && (
          <div
            className="bg-red-500 transition-all"
            style={{ width: `${pct(counts.flagged)}%` }}
          />
        )}
        {counts.na > 0 && (
          <div
            className="bg-zinc-400 transition-all"
            style={{ width: `${pct(counts.na)}%` }}
          />
        )}
      </div>
      <div className="flex gap-4 text-[10px] text-[var(--ink-muted)]">
        <span>{counts.complete} done</span>
        <span>{counts.pending} pending</span>
        {counts.flagged > 0 && (
          <span className="text-red-600 dark:text-red-400 font-medium">
            {counts.flagged} flagged
          </span>
        )}
        {counts.na > 0 && <span>{counts.na} n/a</span>}
      </div>
    </div>
  );
}

function CategorySection({ category }: { category: DDCategory }) {
  const [open, setOpen] = useState(true);
  const flaggedCount = category.items.filter(
    (i) => i.status === "flagged",
  ).length;

  return (
    <div className="border border-[var(--rule)] rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 bg-[var(--canvas-subtle)] hover:bg-[var(--canvas-subtle)]/80 transition text-left"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-3 h-3 text-[var(--ink-muted)] transition-transform ${open ? "rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-xs font-semibold text-[var(--ink)]">
            {category.name}
          </span>
          <span className="text-[10px] text-[var(--ink-muted)]">
            {category.items.length} items
          </span>
        </div>
        {flaggedCount > 0 && (
          <span className="text-[10px] font-medium text-red-600 dark:text-red-400">
            {flaggedCount} flagged
          </span>
        )}
      </button>
      {open && (
        <div className="divide-y divide-[var(--rule)]/50">
          {category.items.map((item, j) => (
            <div
              key={j}
              className="flex items-start justify-between gap-3 px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <div className="text-xs text-[var(--ink)]">{item.item}</div>
                {item.note && (
                  <div className="text-[10px] text-[var(--ink-muted)] mt-0.5 leading-tight">
                    {item.note}
                  </div>
                )}
              </div>
              <StatusPill status={item.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DDChecklistBlock({
  data,
}: {
  data: DDChecklistData;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-[var(--rule)] bg-[var(--canvas)] p-4">
      {/* Header */}
      <div className="space-y-1">
        <div className="text-xs font-semibold text-[var(--ink)] tracking-wide uppercase">
          Due Diligence Checklist
        </div>
        {(data.property || data.deal_type) && (
          <div className="flex items-center gap-2 text-[11px] text-[var(--ink-muted)]">
            {data.property && <span>{data.property}</span>}
            {data.property && data.deal_type && <span>--</span>}
            {data.deal_type && <span>{data.deal_type}</span>}
          </div>
        )}
      </div>

      {/* Progress */}
      <ProgressBar categories={data.categories} />

      {/* Categories */}
      <div className="space-y-2">
        {data.categories.map((cat, i) => (
          <CategorySection key={i} category={cat} />
        ))}
      </div>

      {/* Footer */}
      <div className="text-[10px] text-[var(--ink-muted)] pt-1">
        Status reflects information available to Dante. Verify all items
        independently before closing.
      </div>
    </div>
  );
}
