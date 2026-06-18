"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Upload,
  Loader2,
  AlertCircle,
  X,
  ShieldCheck,
  Trash2,
  Building2,
} from "lucide-react";
import { usePageContext } from "@/components/dante/PageContext";

interface Comp {
  id: string;
  source: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  property_type: string | null;
  sf: number | null;
  sale_price: number | null;
  price_per_sf: number | null;
  cap_rate: number | null;
  sale_date: string | null;
}

interface Totals {
  count: number;
  avgPricePerSf: number | null;
  avgCapRate: number | null;
  avgSalePrice: number | null;
}

const usd0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const usd2 = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
const num0 = (n: number) => n.toLocaleString("en-US");

export default function MarketClient() {
  usePageContext({ title: "Market Comps", subtitle: "Comparable sales from your licensed data" });

  const [comps, setComps] = useState<Comp[]>([]);
  const [totals, setTotals] = useState<Totals>({ count: 0, avgPricePerSf: null, avgCapRate: null, avgSalePrice: null });
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/market/comps", { credentials: "include" });
      const d = await r.json();
      if (r.ok) {
        setComps(Array.isArray(d.comps) ? d.comps : []);
        setTotals(d.totals || { count: 0, avgPricePerSf: null, avgCapRate: null, avgSalePrice: null });
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleFile = async (file: File) => {
    setImporting(true);
    setError(null);
    setWarnings([]);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/market/comps/import", { method: "POST", credentials: "include", body: fd });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || "Import failed");
      setWarnings(Array.isArray(d.warnings) ? d.warnings : []);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  };

  const clearAll = async () => {
    if (!confirm("Clear all imported comps for this workspace?")) return;
    try {
      const r = await fetch("/api/market/comps", { method: "DELETE", credentials: "include" });
      if (r.ok) await load();
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="min-h-full bg-[var(--canvas)] text-[var(--ink)]">
      <div className="max-w-6xl mx-auto px-6 md:px-10 py-8 md:py-10">
        {/* Hero */}
        <div className="mb-6">
          <div className="label-section mb-1.5">Commercial real estate</div>
          <h1 className="heading-display text-3xl md:text-4xl text-[var(--ink)] leading-[1.1]">Market Comps</h1>
          <p className="text-sm text-[var(--ink-muted)] mt-1.5 max-w-xl">
            Import comparable sales from an export you are licensed to use — CoStar, county records, or any CSV.
            Drift parses it locally into structured comps. We never scrape or redistribute third-party data.
          </p>
        </div>

        {error && (
          <div className="mb-5 px-3 py-2 text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger)]/30 rounded-[var(--r-input)] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" strokeWidth={1.5} />
            {error}
            <button onClick={() => setError(null)} className="ml-auto p-0.5 hover:opacity-70">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Upload */}
        <div
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileInputRef.current?.click()}
          className={`rounded-[var(--r-card)] border-2 border-dashed p-8 text-center cursor-pointer transition mb-5 ${
            dragOver
              ? "border-[var(--accent)] bg-[var(--accent-soft)]"
              : "border-[var(--rule)] hover:border-[var(--rule-strong)] hover:bg-[var(--canvas-subtle)]"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          {importing ? (
            <div className="flex items-center justify-center gap-2 text-[var(--ink-muted)]">
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
              <span className="text-sm">Parsing comps…</span>
            </div>
          ) : (
            <>
              <div className="rounded-full bg-[var(--canvas-subtle)] border border-[var(--rule)] p-2.5 mx-auto w-fit mb-3">
                <Upload className="w-4 h-4 text-[var(--ink-muted)]" strokeWidth={1.5} />
              </div>
              <p className="text-sm font-medium text-[var(--ink)]">Drop a comps export here</p>
              <p className="text-xs text-[var(--ink-subtle)] mt-0.5">
                Excel or CSV — we detect Address, Sale Price, SF, and Cap Rate columns automatically
              </p>
            </>
          )}
        </div>

        {warnings.length > 0 && (
          <div className="mb-5 rounded-[var(--r-card)] border border-[var(--flag)]/30 bg-[var(--flag-soft)] px-4 py-3">
            <p className="label-section mb-1.5 text-[var(--flag)]">Import notes</p>
            <ul className="space-y-1">
              {warnings.map((w, i) => (
                <li key={i} className="text-xs text-[var(--ink)] flex items-start gap-2">
                  <span className="text-[var(--flag)] shrink-0 mt-0.5">-</span>
                  {w}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Aggregates */}
        {totals.count > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            {[
              { label: "Comps", value: num0(totals.count) },
              { label: "Avg price / SF", value: totals.avgPricePerSf != null ? usd2(totals.avgPricePerSf) : "--" },
              { label: "Avg cap rate", value: totals.avgCapRate != null ? pct(totals.avgCapRate) : "--" },
              { label: "Avg sale price", value: totals.avgSalePrice != null ? usd0(totals.avgSalePrice) : "--" },
            ].map((m) => (
              <div key={m.label} className="card-flat px-4 py-3">
                <div className="text-[10px] uppercase tracking-wider text-[var(--ink-subtle)] mb-1">{m.label}</div>
                <div className="heading-display text-2xl text-[var(--ink)] truncate" title={m.value}>{m.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Comps table */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--ink-subtle)]" strokeWidth={1.5} />
          </div>
        ) : comps.length === 0 ? (
          <div className="card-flat p-10 text-center">
            <div className="rounded-full bg-[var(--canvas-subtle)] border border-[var(--rule)] p-3 mx-auto w-fit mb-4">
              <Building2 className="w-5 h-5 text-[var(--ink-muted)]" strokeWidth={1.5} />
            </div>
            <p className="text-sm font-medium text-[var(--ink)]">No comps imported yet</p>
            <p className="text-sm text-[var(--ink-muted)] mt-1 max-w-sm mx-auto">
              Drop a CoStar, county, or CSV export above and Drift will structure the comparables.
            </p>
          </div>
        ) : (
          <div className="card-flat overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--rule)]">
              <div className="label-section">Comparables ({comps.length})</div>
              <button
                onClick={clearAll}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--r-input)] border border-[var(--rule)] text-xs font-medium text-[var(--ink-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] transition"
              >
                <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                Clear all
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--rule)] bg-[var(--canvas-subtle)]">
                    <th className="text-left py-2 px-3 label-section">Address</th>
                    <th className="text-left py-2 px-3 label-section w-[120px]">Type</th>
                    <th className="text-right py-2 px-3 label-section w-[90px]">SF</th>
                    <th className="text-right py-2 px-3 label-section w-[120px]">Sale price</th>
                    <th className="text-right py-2 px-3 label-section w-[90px]">$/SF</th>
                    <th className="text-right py-2 px-3 label-section w-[80px]">Cap</th>
                    <th className="text-left py-2 px-3 label-section w-[110px]">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--rule)]">
                  {comps.map((c) => (
                    <tr key={c.id} className="hover:bg-[var(--canvas-subtle)]/50 transition">
                      <td className="py-2 px-3 text-[var(--ink)]">
                        {c.address || "--"}
                        {(c.city || c.state) && (
                          <span className="text-[var(--ink-subtle)]">
                            {" "}· {[c.city, c.state].filter(Boolean).join(", ")}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-[var(--ink-muted)]">{c.property_type || "--"}</td>
                      <td className="py-2 px-3 text-right text-[var(--ink-muted)] mono text-xs">{c.sf != null ? num0(c.sf) : "--"}</td>
                      <td className="py-2 px-3 text-right text-[var(--ink)] mono text-xs">{c.sale_price != null ? usd0(c.sale_price) : "--"}</td>
                      <td className="py-2 px-3 text-right text-[var(--ink-muted)] mono text-xs">{c.price_per_sf != null ? usd2(c.price_per_sf) : "--"}</td>
                      <td className="py-2 px-3 text-right text-[var(--ink-muted)] mono text-xs">{c.cap_rate != null ? pct(c.cap_rate) : "--"}</td>
                      <td className="py-2 px-3 text-[var(--ink-muted)] mono text-xs">{c.sale_date || "--"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Compliance note */}
        <div className="mt-5 rounded-[var(--r-card)] border border-[var(--rule)] bg-[var(--canvas-subtle)] px-4 py-3 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-[var(--verified)] shrink-0 mt-0.5" strokeWidth={1.5} />
          <p className="text-[11px] text-[var(--ink-muted)] leading-relaxed">
            Bring your own licensed data. Drift parses exports you are entitled to use and keeps them in your
            workspace. It does not scrape, bypass, or redistribute third-party data services — verify your data
            provider&apos;s terms before importing.
          </p>
        </div>
      </div>
    </div>
  );
}
