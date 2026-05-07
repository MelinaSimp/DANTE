"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, ArrowUpRight, TrendingUp, TrendingDown } from "lucide-react";

interface Stat {
  customers_total: number;
  total_mrr_cents: number;
  total_ai_mtd_cents: number;
  total_ai_last_month_cents: number;
  gross_margin_pct: number | null;
  mom_delta_pct: number | null;
  top_by_spend: { id: string; name: string; mtd_cents: number }[];
  top_by_pct: { id: string; name: string; mtd_cents: number; pct: number }[];
}

function fmtCents(c: number): string {
  return `$${(c / 100).toFixed(2)}`;
}

export default function GlobalUsageClient() {
  const [data, setData] = useState<Stat | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/admin/usage/global", { cache: "no-store" });
        if (!r.ok) {
          setError(`Failed to load (${r.status})`);
          return;
        }
        setData(await r.json());
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  if (error) return <div className="text-sm text-[var(--danger)]">{error}</div>;
  if (!data) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }

  const Delta = ({ pct }: { pct: number | null }) => {
    if (pct === null) return null;
    const Icon = pct >= 0 ? TrendingUp : TrendingDown;
    const cls = pct >= 0 ? "text-amber-700" : "text-green-700";
    return (
      <span className={`inline-flex items-center gap-1 text-[12px] ${cls}`}>
        <Icon className="w-3 h-3" strokeWidth={2} />{Math.abs(pct)}% vs last
      </span>
    );
  };

  return (
    <div className="space-y-8">
      {/* Headline stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Customers" value={String(data.customers_total)} />
        <Stat label="Monthly recurring" value={fmtCents(data.total_mrr_cents)} />
        <Stat label="AI cost MTD" value={fmtCents(data.total_ai_mtd_cents)} sub={<Delta pct={data.mom_delta_pct} />} />
        <Stat label="Gross margin (AI only)" value={data.gross_margin_pct === null ? "—" : `${data.gross_margin_pct}%`} />
      </div>

      {/* Two top-N tables */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <TopList title="Top by absolute spend (MTD)" rows={data.top_by_spend.map(r => ({ id: r.id, name: r.name, right: fmtCents(r.mtd_cents) }))} />
        <TopList title="Top by % of allowance (MTD)" rows={data.top_by_pct.map(r => ({ id: r.id, name: r.name, right: `${r.pct}%` }))} />
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="border border-[var(--rule)] rounded-md p-4">
      <div className="text-[11px] mono uppercase tracking-wider text-[var(--ink-subtle)]">{label}</div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{value}</div>
      {sub && <div className="mt-1">{sub}</div>}
    </div>
  );
}

function TopList({ title, rows }: { title: string; rows: { id: string; name: string; right: string }[] }) {
  return (
    <div className="border border-[var(--rule)] rounded-md p-4">
      <div className="text-[11px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-3">{title}</div>
      {rows.length === 0 ? (
        <div className="text-sm text-[var(--ink-muted)]">No data yet.</div>
      ) : (
        <ul className="divide-y divide-[var(--rule)]/60">
          {rows.map((r) => (
            <li key={r.id} className="py-2 flex items-center justify-between">
              <Link href={`/admin/customers/${r.id}`} className="text-sm text-[var(--ink)] hover:underline">
                {r.name}
              </Link>
              <div className="flex items-center gap-3">
                <span className="text-sm tabular-nums text-[var(--ink)]">{r.right}</span>
                <Link href={`/admin/customers/${r.id}`} className="text-[var(--ink-subtle)] hover:text-[var(--accent)]">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
