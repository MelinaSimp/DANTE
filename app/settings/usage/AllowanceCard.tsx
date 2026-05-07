"use client";

// AllowanceCard — slot at the top of /settings/usage that shows
// the customer their plan allowance vs MTD AI spend, with threshold
// status. Reads from /api/dante/usage/current (ledger-backed).
//
// Self-fetches; safe to drop in anywhere. Renders nothing while
// loading rather than shifting layout.

import { useEffect, useState } from "react";

interface UsageStatus {
  mtd_cents: number;
  limit_cents: number;
  pct: number;
  tier_breached: 100 | 125 | 150 | 200 | null;
  overage_markup_pct: number;
}

function fmtCents(c: number): string {
  return `$${(c / 100).toFixed(2)}`;
}

export default function AllowanceCard() {
  const [s, setS] = useState<UsageStatus | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/dante/usage/current", { cache: "no-store" });
        if (!r.ok) return;
        setS(await r.json());
      } catch {
        // Silent — header is optional, not load-bearing.
      }
    })();
  }, []);

  if (!s) return null;

  const overCents = Math.max(0, s.mtd_cents - s.limit_cents);
  const billedOverCents = Math.round(overCents * (1 + s.overage_markup_pct / 100));
  const barWidth = Math.min(100, s.pct);
  const barColor = s.pct >= 150 ? "bg-red-500" : s.pct >= 100 ? "bg-amber-500" : "bg-[var(--accent,#2563eb)]";

  return (
    <section className="border border-[var(--rule)] rounded-md p-5">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-[11px] mono uppercase tracking-wider text-[var(--ink-subtle)]">This month's AI allowance</div>
        <div className="text-[12px] text-[var(--ink-muted)]">
          Resets on the 1st
        </div>
      </div>
      <div className="flex items-baseline gap-3 mb-2">
        <div className="text-2xl font-semibold tabular-nums">{fmtCents(s.mtd_cents)}</div>
        <div className="text-sm text-[var(--ink-muted)]">/ {fmtCents(s.limit_cents)} included</div>
        <div className="text-sm tabular-nums text-[var(--ink-muted)]">({s.pct}%)</div>
      </div>
      <div className="h-2 rounded-full bg-[var(--canvas-subtle)] overflow-hidden">
        <div className={`h-full ${barColor} transition-all`} style={{ width: `${barWidth}%` }} />
      </div>
      {overCents > 0 && (
        <div className="mt-3 text-[13px] text-[var(--ink-muted)]">
          You're {fmtCents(overCents)} over allowance.
          With a {s.overage_markup_pct}% markup, the next invoice will include
          {" "}<span className="font-medium text-[var(--ink)]">{fmtCents(billedOverCents)}</span>{" "}
          in overage.
        </div>
      )}
    </section>
  );
}
