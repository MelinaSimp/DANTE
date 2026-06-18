"use client";

// AnalysesFeed — dashboard widget. Two real, data-driven panels:
//   1. Recent analyses — the autonomous pipeline's latest output
//   2. Portfolio signals — lease-expiry clusters + elevated vacancy
// Self-contained: fetches its own data so it can drop into the
// dashboard without touching the main dashboard query. Hides itself
// when there is nothing to show.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Radar, Bell, ArrowUpRight } from "lucide-react";

interface RecentAnalysis {
  id: string;
  vault_item_id: string | null;
  doc_type: string;
  status: string;
  title: string | null;
  headline: string | null;
  created_at: string;
}

interface Signal {
  id: string;
  kind: string;
  severity: "act" | "watch" | "info";
  title: string;
  detail: string;
  href: string;
}

const TYPE_LABEL: Record<string, string> = {
  rent_roll: "Rent roll",
  lease: "Lease",
  operating_statement: "Operating statement",
  offering_memo: "Offering memo",
  other: "Document",
};

const SEV_COLOR: Record<Signal["severity"], string> = {
  act: "var(--danger)",
  watch: "var(--flag)",
  info: "var(--ink-subtle)",
};

function relativeTime(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function AnalysesFeed() {
  const [recent, setRecent] = useState<RecentAnalysis[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/analyses", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { recent: [], signals: [] }))
      .then((d) => {
        if (cancelled) return;
        setRecent(Array.isArray(d.recent) ? d.recent : []);
        setSignals(Array.isArray(d.signals) ? d.signals : []);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Nothing to show yet — stay invisible so a fresh dashboard isn't cluttered.
  if (!loaded || (recent.length === 0 && signals.length === 0)) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
      {/* Recent analyses */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-medium text-[var(--ink-subtle)]">
            <Radar className="w-3.5 h-3.5" strokeWidth={1.5} />
            Recent analyses
          </div>
          <Link href="/autopilot" className="text-[11px] text-[var(--ink-muted)] hover:text-[var(--ink)] inline-flex items-center gap-0.5">
            Autopilot <ArrowUpRight className="w-3 h-3" strokeWidth={1.5} />
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-xs text-[var(--ink-subtle)] py-4 text-center">
            No analyses yet. Add a document to the vault.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {recent.map((a) => (
              <li key={a.id}>
                <Link
                  href={a.vault_item_id ? `/vault/${a.vault_item_id}` : "/autopilot"}
                  className="block rounded-[var(--r-input)] px-2.5 py-2 -mx-1 hover:bg-[var(--neu-hover)] transition"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-[var(--ink-subtle)] shrink-0">
                      {TYPE_LABEL[a.doc_type] || "Document"}
                    </span>
                    <span className="text-sm text-[var(--ink)] truncate">{a.title || "Untitled"}</span>
                    <span className="mono text-[10px] text-[var(--ink-subtle)] ml-auto shrink-0">
                      {relativeTime(a.created_at)}
                    </span>
                  </div>
                  {a.headline && (
                    <p className="text-[11px] text-[var(--ink-muted)] truncate mt-0.5">{a.headline}</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Portfolio signals */}
      <div className="glass-card p-4">
        <div className="flex items-center gap-1.5 mb-3 text-[10px] uppercase tracking-wider font-medium text-[var(--ink-subtle)]">
          <Bell className="w-3.5 h-3.5" strokeWidth={1.5} />
          Portfolio signals
        </div>
        {signals.length === 0 ? (
          <p className="text-xs text-[var(--ink-subtle)] py-4 text-center">
            No active signals. Lease expirations and vacancy will surface here.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {signals.map((s) => (
              <li key={s.id}>
                <Link
                  href={s.href}
                  className="flex items-start gap-2.5 rounded-[var(--r-input)] px-2.5 py-2 -mx-1 hover:bg-[var(--neu-hover)] transition"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                    style={{ background: SEV_COLOR[s.severity] }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm text-[var(--ink)] truncate">{s.title}</p>
                    <p className="text-[11px] text-[var(--ink-muted)]">{s.detail}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
