"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, ArrowUpRight } from "lucide-react";

interface Row {
  id: string;
  name: string;
  industry: string | null;
  monthly_price_cents: number;
  usage_allowance_cents: number;
  overage_markup_pct: number;
  mtd_cents: number;
  pct_of_allowance: number;
  ytd_overage_cents: number;
  created_at: string;
}

function fmtCents(c: number): string {
  return `$${(c / 100).toFixed(2)}`;
}

function healthPill(pct: number): { label: string; cls: string } {
  if (pct >= 200) return { label: "2× over", cls: "bg-red-100 text-red-800 border-red-200" };
  if (pct >= 150) return { label: "Over", cls: "bg-red-50 text-red-800 border-red-200" };
  if (pct >= 125) return { label: "Over", cls: "bg-amber-50 text-amber-800 border-amber-200" };
  if (pct >= 100) return { label: "At limit", cls: "bg-amber-50 text-amber-800 border-amber-200" };
  if (pct >= 80) return { label: "Heavy", cls: "bg-yellow-50 text-yellow-800 border-yellow-200" };
  return { label: "Healthy", cls: "bg-green-50 text-green-800 border-green-200" };
}

export default function CustomersTable() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/admin/customers", { cache: "no-store" });
        if (!r.ok) {
          setError(`Failed to load (${r.status})`);
          return;
        }
        const j = await r.json();
        setRows(j.rows);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  if (error) {
    return <div className="text-sm text-[var(--danger)]">{error}</div>;
  }
  if (!rows) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (rows.length === 0) {
    return <div className="text-sm text-[var(--ink-muted)]">No workspaces yet.</div>;
  }

  return (
    <div className="border border-[var(--rule)] rounded-md overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-[var(--canvas-subtle)]">
          <tr>
            <Th>Workspace</Th>
            <Th align="right">MRR</Th>
            <Th align="right">Allowance</Th>
            <Th align="right">MTD</Th>
            <Th align="right">% used</Th>
            <Th align="right">YTD overage</Th>
            <Th>Health</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const pill = healthPill(r.pct_of_allowance);
            return (
              <tr key={r.id} className="border-t border-[var(--rule)] hover:bg-[var(--canvas-subtle)]/50 transition">
                <Td>
                  <div className="font-medium text-[var(--ink)]">{r.name}</div>
                  {r.industry && (
                    <div className="text-[11px] mono text-[var(--ink-subtle)] uppercase tracking-wider">
                      Workspace
                    </div>
                  )}
                </Td>
                <Td align="right">{fmtCents(r.monthly_price_cents)}</Td>
                <Td align="right">{fmtCents(r.usage_allowance_cents)}</Td>
                <Td align="right">{fmtCents(r.mtd_cents)}</Td>
                <Td align="right" className="tabular-nums">{r.pct_of_allowance}%</Td>
                <Td align="right">{fmtCents(r.ytd_overage_cents)}</Td>
                <Td>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] ${pill.cls}`}>
                    {pill.label}
                  </span>
                </Td>
                <Td>
                  <Link
                    href={`/admin/customers/${r.id}`}
                    className="inline-flex items-center gap-1 text-[12px] text-[var(--accent)] hover:underline"
                  >
                    Open <ArrowUpRight className="w-3 h-3" strokeWidth={1.5} />
                  </Link>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, align = "left" }: { children?: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th className={`px-3 py-2 text-[11px] mono uppercase tracking-wider text-[var(--ink-subtle)] ${align === "right" ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}
function Td({ children, align = "left", className = "" }: { children?: React.ReactNode; align?: "left" | "right"; className?: string }) {
  return (
    <td className={`px-3 py-2 ${align === "right" ? "text-right" : "text-left"} ${className}`}>
      {children}
    </td>
  );
}
