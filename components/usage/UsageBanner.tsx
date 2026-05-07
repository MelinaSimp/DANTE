"use client";

// components/usage/UsageBanner.tsx
//
// Soft-warning strip that appears across the top of Dante/Vergil
// surfaces when the workspace has crossed an AI-allowance threshold.
//
// Behavior:
//   • Polls /api/dante/usage/current on mount and every 60s while
//     the page is open.
//   • Renders nothing if status.tier_breached is null.
//   • Each threshold gets escalating copy. Dismiss hides for the
//     session; the banner re-appears when the next threshold tier
//     is crossed (e.g. user dismisses 100%, then crosses 125% an
//     hour later, banner returns with the harder copy).
//
// Sticky-top so it floats above the chat shell without consuming
// layout space when absent. Yellow/amber palette to read as
// "attention" without screaming "error".

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

interface UsageStatus {
  mtd_cents: number;
  limit_cents: number;
  pct: number;
  tier_breached: 100 | 125 | 150 | 200 | null;
  overage_markup_pct: number;
}

const POLL_INTERVAL_MS = 60_000;

function fmtCents(c: number): string {
  return `$${(c / 100).toFixed(2)}`;
}

function copyForTier(s: UsageStatus): { headline: string; sub: string; tone: "amber" | "red" } {
  const tier = s.tier_breached!;
  const overageCents = Math.max(0, s.mtd_cents - s.limit_cents);
  const billedCents = Math.round(overageCents * (1 + s.overage_markup_pct / 100));

  if (tier >= 200) {
    return {
      headline: `You're 2× over this month's AI allowance (${fmtCents(s.mtd_cents)} / ${fmtCents(s.limit_cents)}).`,
      sub: `Substantial overage — your account manager will reach out. Reply to this banner if you'd like to discuss a higher allowance.`,
      tone: "red",
    };
  }
  if (tier >= 150) {
    return {
      headline: `You're 50% over allowance (${fmtCents(s.mtd_cents)} / ${fmtCents(s.limit_cents)}).`,
      sub: `If this is your new normal, reach out and we'll adjust your plan. Otherwise your invoice will include ~${fmtCents(billedCents)} in overage.`,
      tone: "red",
    };
  }
  if (tier >= 125) {
    return {
      headline: `You're 25% over allowance (${fmtCents(s.mtd_cents)} / ${fmtCents(s.limit_cents)}).`,
      sub: `Your next invoice will include ~${fmtCents(billedCents)} in overage at cost + ${s.overage_markup_pct}%.`,
      tone: "amber",
    };
  }
  return {
    headline: `You've crossed this month's AI allowance (${fmtCents(s.mtd_cents)} / ${fmtCents(s.limit_cents)}).`,
    sub: `Continued use is billed at cost + ${s.overage_markup_pct}%. Your next invoice will reflect the overage.`,
    tone: "amber",
  };
}

export default function UsageBanner() {
  const [status, setStatus] = useState<UsageStatus | null>(null);
  // Dismissal is keyed by tier so dismissing 100% doesn't suppress
  // the 125% banner that appears later in the same session.
  const [dismissedTier, setDismissedTier] = useState<number | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/dante/usage/current", { cache: "no-store" });
      if (!r.ok) return;
      const j: UsageStatus = await r.json();
      setStatus(j);
    } catch {
      // Network blip; next poll will retry.
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
    const id = setInterval(() => void fetchStatus(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchStatus]);

  if (!status || status.tier_breached === null) return null;
  if (dismissedTier !== null && dismissedTier === status.tier_breached) return null;

  const { headline, sub, tone } = copyForTier(status);
  const palette = tone === "red"
    ? "bg-red-50 border-red-200 text-red-900"
    : "bg-amber-50 border-amber-200 text-amber-900";

  return (
    <div className={`sticky top-0 z-40 border-b ${palette}`}>
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-2.5 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={2} />
        <div className="flex-1 min-w-0 text-[13px] leading-relaxed">
          <span className="font-semibold">{headline}</span>{" "}
          <span className="opacity-80">{sub}</span>
        </div>
        <a
          href="/settings/usage"
          className="text-[12px] underline underline-offset-2 hover:no-underline whitespace-nowrap"
        >
          See usage
        </a>
        <button
          type="button"
          onClick={() => setDismissedTier(status.tier_breached)}
          aria-label="Dismiss until next threshold"
          className="p-1 rounded hover:bg-black/5 transition shrink-0"
        >
          <X className="w-3.5 h-3.5" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
