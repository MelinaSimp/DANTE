"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Radar,
  Calculator,
  ScrollText,
  BarChart3,
  FileText,
  Loader2,
  AlertCircle,
  X,
  Check,
  ArrowUpRight,
  ExternalLink,
} from "lucide-react";
import { usePageContext } from "@/components/dante/PageContext";

type DocType = "rent_roll" | "lease" | "operating_statement" | "offering_memo" | "other";
type Status = "pending" | "approved" | "dismissed";

interface Analysis {
  id: string;
  vault_item_id: string | null;
  doc_type: DocType;
  status: Status;
  title: string | null;
  headline: string | null;
  confidence: number | null;
  summary: Record<string, unknown>;
  created_at: string;
}

const TYPE_META: Record<DocType, { label: string; icon: typeof Calculator }> = {
  rent_roll: { label: "Rent roll", icon: Calculator },
  lease: { label: "Lease", icon: ScrollText },
  operating_statement: { label: "Operating statement", icon: BarChart3 },
  offering_memo: { label: "Offering memo", icon: FileText },
  other: { label: "Document", icon: FileText },
};

const FILTERS: { key: Status | "all"; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "dismissed", label: "Dismissed" },
  { key: "all", label: "All" },
];

const usd0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const num0 = (n: number) => n.toLocaleString("en-US");

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function actionFor(a: Analysis): { label: string; href: string } | null {
  switch (a.doc_type) {
    case "rent_roll":
      return { label: "Open in Underwriter", href: "/underwriter" };
    case "lease":
      return { label: "Abstract this lease", href: "/lease-abstractor" };
    default:
      return null;
  }
}

export default function AutopilotClient() {
  usePageContext({
    title: "Autopilot",
    subtitle: "Documents analyzed automatically as they land in the vault",
  });

  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Status | "all">("pending");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = filter === "all" ? "" : `?status=${filter}`;
      const r = await fetch(`/api/autopilot/analyses${qs}`, { credentials: "include" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed to load");
      setAnalyses(Array.isArray(d.analyses) ? d.analyses : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (id: string, status: Status) => {
    setBusy(id);
    try {
      const r = await fetch(`/api/autopilot/analyses/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Update failed");
      // Drop from view if it no longer matches the active filter.
      if (filter !== "all" && filter !== status) {
        setAnalyses((prev) => prev.filter((a) => a.id !== id));
      } else {
        setAnalyses((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-full bg-[var(--canvas)] text-[var(--ink)]">
      <div className="max-w-4xl mx-auto px-6 md:px-10 py-8 md:py-10">
        {/* Hero */}
        <div className="mb-6">
          <div className="label-section mb-1.5 flex items-center gap-1.5">
            <Radar className="w-3.5 h-3.5" strokeWidth={1.5} />
            Autonomous pipeline
          </div>
          <h1 className="heading-display text-3xl md:text-4xl text-[var(--ink)] leading-[1.1]">
            Autopilot
          </h1>
          <p className="text-sm text-[var(--ink-muted)] mt-1.5 max-w-xl">
            When a document lands in the vault, Drift classifies it and runs the matching
            analysis with no prompt — rent rolls are underwritten automatically. Results
            queue here for your review; nothing is sent anywhere until you act.
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 mb-5 border-b border-[var(--rule)]">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition ${
                filter === f.key
                  ? "border-[var(--ink)] text-[var(--ink)]"
                  : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }`}
            >
              {f.label}
            </button>
          ))}
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

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--ink-subtle)]" strokeWidth={1.5} />
          </div>
        ) : analyses.length === 0 ? (
          <div className="card-flat p-10 text-center">
            <div className="rounded-full bg-[var(--canvas-subtle)] border border-[var(--rule)] p-3 mx-auto w-fit mb-4">
              <Radar className="w-5 h-5 text-[var(--ink-muted)]" strokeWidth={1.5} />
            </div>
            <p className="text-sm font-medium text-[var(--ink)]">
              {filter === "pending" ? "Nothing waiting for review" : "No analyses here yet"}
            </p>
            <p className="text-sm text-[var(--ink-muted)] mt-1 max-w-sm mx-auto">
              Add a rent roll, lease, or operating statement to the{" "}
              <Link href="/vault" className="text-[var(--accent)] hover:underline">vault</Link>{" "}
              and Autopilot will analyze it automatically.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {analyses.map((a) => {
              const meta = TYPE_META[a.doc_type] || TYPE_META.other;
              const Icon = meta.icon;
              const action = actionFor(a);
              const s = a.summary || {};
              const autoUw = s.auto_underwrite === true;
              return (
                <div key={a.id} className="card-flat p-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-[var(--r-input)] bg-[var(--canvas-subtle)] border border-[var(--rule)] p-2 shrink-0">
                      <Icon className="w-4 h-4 text-[var(--ink-muted)]" strokeWidth={1.5} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] uppercase tracking-wider font-medium text-[var(--ink-subtle)]">
                          {meta.label}
                        </span>
                        {a.status !== "pending" && (
                          <span
                            className={`text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded-[var(--r-chip)] ${
                              a.status === "approved"
                                ? "text-[var(--verified)] bg-[var(--verified-soft)]"
                                : "text-[var(--ink-subtle)] bg-[var(--canvas-subtle)]"
                            }`}
                          >
                            {a.status}
                          </span>
                        )}
                        <span className="mono text-[11px] text-[var(--ink-subtle)] ml-auto">
                          {relativeTime(a.created_at)}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-[var(--ink)] truncate mt-0.5">
                        {a.title || "Untitled document"}
                      </p>
                      {a.headline && (
                        <p className="text-sm text-[var(--ink-muted)] mt-0.5">{a.headline}</p>
                      )}

                      {autoUw && (
                        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {[
                            { label: "Indicated value", value: typeof s.indicated_value === "number" ? usd0(s.indicated_value) : "--" },
                            { label: "Year 1 NOI", value: typeof s.year1_noi === "number" ? usd0(s.year1_noi) : "--" },
                            { label: "Implied cap", value: typeof s.implied_cap === "number" ? `${(s.implied_cap * 100).toFixed(2)}%` : "--" },
                            { label: "Occupancy", value: typeof s.occupancy_pct === "number" ? `${(s.occupancy_pct * 100).toFixed(1)}%` : "--" },
                          ].map((m) => (
                            <div key={m.label} className="rounded-[var(--r-input)] border border-[var(--rule)] bg-[var(--canvas)] px-2.5 py-1.5">
                              <div className="text-[10px] uppercase tracking-wider text-[var(--ink-subtle)]">{m.label}</div>
                              <div className="text-sm font-semibold text-[var(--ink)] truncate" title={m.value}>{m.value}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {autoUw && (typeof s.total_sf === "number" || typeof s.gpr === "number") && (
                        <p className="mono text-[11px] text-[var(--ink-subtle)] mt-2">
                          {typeof s.total_sf === "number" ? `${num0(s.total_sf)} SF` : ""}
                          {typeof s.gpr === "number" ? ` · GPR ${usd0(s.gpr)}` : ""}
                          {typeof s.assumptions === "string" ? ` · ${s.assumptions}` : ""}
                        </p>
                      )}

                      {/* Actions */}
                      <div className="mt-3 flex items-center gap-2 flex-wrap">
                        {action && (
                          <Link
                            href={action.href}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--r-input)] bg-[var(--ink)] text-[var(--canvas)] text-xs font-medium hover:opacity-90 transition"
                          >
                            <ArrowUpRight className="w-3 h-3" strokeWidth={1.5} />
                            {action.label}
                          </Link>
                        )}
                        {a.vault_item_id && (
                          <Link
                            href={`/vault/${a.vault_item_id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--r-input)] border border-[var(--rule)] text-xs font-medium text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition"
                          >
                            <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
                            View source
                          </Link>
                        )}
                        <div className="flex-1" />
                        {a.status !== "approved" && (
                          <button
                            onClick={() => setStatus(a.id, "approved")}
                            disabled={busy === a.id}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--r-input)] border border-[var(--rule)] text-xs font-medium text-[var(--verified)] hover:bg-[var(--verified-soft)] disabled:opacity-50 transition"
                          >
                            <Check className="w-3 h-3" strokeWidth={1.5} />
                            Approve
                          </button>
                        )}
                        {a.status !== "dismissed" && (
                          <button
                            onClick={() => setStatus(a.id, "dismissed")}
                            disabled={busy === a.id}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--r-input)] border border-[var(--rule)] text-xs font-medium text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)] disabled:opacity-50 transition"
                          >
                            <X className="w-3 h-3" strokeWidth={1.5} />
                            Dismiss
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
