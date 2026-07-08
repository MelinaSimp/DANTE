"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Radar,
  Calculator,
  ScrollText,
  BarChart3,
  FileText,
  Leaf,
  Scale,
  Loader2,
  AlertCircle,
  X,
  Check,
  ExternalLink,
  Play,
} from "lucide-react";
import { usePageContext } from "@/components/dante/PageContext";

type DocType =
  | "rent_roll"
  | "lease"
  | "operating_statement"
  | "offering_memo"
  | "environmental"
  | "appraisal"
  | "other";
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

const TYPE_META: Record<DocType, { label: string; plural: string; icon: typeof Calculator }> = {
  rent_roll: { label: "Spreadsheet", plural: "Spreadsheets", icon: Calculator },
  lease: { label: "Contract", plural: "Contracts", icon: ScrollText },
  operating_statement: { label: "Statement", plural: "Statements", icon: BarChart3 },
  offering_memo: { label: "Report", plural: "Reports", icon: FileText },
  environmental: { label: "Environmental", plural: "Environmental", icon: Leaf },
  appraisal: { label: "Appraisal", plural: "Appraisals", icon: Scale },
  other: { label: "Document", plural: "Documents", icon: FileText },
};

const TYPE_ORDER: DocType[] = [
  "lease",
  "rent_roll",
  "operating_statement",
  "environmental",
  "appraisal",
  "offering_memo",
  "other",
];

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

interface BatchState {
  running: boolean;
  done: number;
  total: number;
  failed: number;
  current: string | null;
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
  const [typeFilter, setTypeFilter] = useState<DocType | "all">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [abstracting, setAbstracting] = useState<Set<string>>(new Set());
  const [batch, setBatch] = useState<BatchState | null>(null);
  const cancelBatch = useRef(false);

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

  // Type counts for the chips, computed from the current status view.
  const typeCounts = useMemo(() => {
    const counts = new Map<DocType, number>();
    for (const a of analyses) counts.set(a.doc_type, (counts.get(a.doc_type) || 0) + 1);
    return counts;
  }, [analyses]);

  const visible = useMemo(
    () => (typeFilter === "all" ? analyses : analyses.filter((a) => a.doc_type === typeFilter)),
    [analyses, typeFilter],
  );

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

  // Bulk approve / dismiss everything in the current view (status +
  // type filters both respected — the ids are explicit).
  const bulkSetStatus = async (status: "approved" | "dismissed") => {
    const targets = visible.filter((a) => a.status === "pending");
    if (targets.length === 0) return;
    const noun = typeFilter === "all" ? "items" : TYPE_META[typeFilter].plural.toLowerCase();
    if (!window.confirm(`${status === "approved" ? "Approve" : "Dismiss"} ${targets.length} pending ${noun}?`)) return;
    setBulkBusy(true);
    try {
      const r = await fetch(`/api/autopilot/analyses/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status, ids: targets.map((a) => a.id) }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Bulk update failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBulkBusy(false);
    }
  };

  // Run a real abstraction for one lease analysis. Multi-minute call —
  // the API streams no progress, so we just hold a spinner per item.
  const abstractOne = async (a: Analysis): Promise<boolean> => {
    if (!a.vault_item_id) return false;
    setAbstracting((prev) => new Set(prev).add(a.id));
    try {
      const r = await fetch(`/api/lease-abstractor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ vault_item_id: a.vault_item_id }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.status === "failed") {
        throw new Error(d.error_message || d.error || "Abstraction failed");
      }
      // Mark reviewed and reflect the result inline.
      await fetch(`/api/autopilot/analyses/${a.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "approved" }),
      });
      setAnalyses((prev) =>
        prev.map((x) =>
          x.id === a.id
            ? {
                ...x,
                status: "approved" as Status,
                headline: `Abstracted — ${d.tenant_name || "terms extracted"}${d.expiration_date ? `, expires ${d.expiration_date}` : ""}`,
              }
            : x,
        ),
      );
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setAbstracting((prev) => {
        const next = new Set(prev);
        next.delete(a.id);
        return next;
      });
    }
  };

  // Batch abstraction over every pending lease in view. Runs 2 at a
  // time from this window — each lease takes several minutes of LLM
  // extraction, so the progress bar and a cancel affordance matter.
  const abstractAllLeases = async () => {
    const targets = visible.filter((a) => a.status === "pending" && a.doc_type === "lease" && a.vault_item_id);
    if (targets.length === 0) return;

    // Skip leases that already have a completed abstract.
    let existing = new Set<string>();
    try {
      const r = await fetch(`/api/lease-abstractor`, { credentials: "include" });
      const d = await r.json();
      existing = new Set(
        (Array.isArray(d.abstracts) ? d.abstracts : [])
          .filter((x: { status?: string }) => x.status === "completed")
          .map((x: { vault_item_id?: string }) => x.vault_item_id),
      );
    } catch { /* best effort — worst case we re-abstract */ }
    const queue = targets.filter((a) => !existing.has(a.vault_item_id!));
    const skipped = targets.length - queue.length;

    const est = Math.ceil((queue.length * 4) / 2); // ~4 min each, 2 in parallel
    const msg =
      `Abstract ${queue.length} lease${queue.length === 1 ? "" : "s"}?` +
      (skipped ? ` (${skipped} already abstracted — skipped.)` : "") +
      `\n\nThis runs AI extraction on each document — roughly ${est} minute${est === 1 ? "" : "s"} total. ` +
      `Keep this window open; you can cancel anytime.`;
    if (queue.length === 0) {
      window.alert("Every pending lease in view already has a completed abstract.");
      return;
    }
    if (!window.confirm(msg)) return;

    cancelBatch.current = false;
    setBatch({ running: true, done: 0, total: queue.length, failed: 0, current: null });

    const work = [...queue];
    await Promise.all(
      Array.from({ length: 2 }, async () => {
        for (;;) {
          if (cancelBatch.current) return;
          const item = work.shift();
          if (!item) return;
          setBatch((b) => (b ? { ...b, current: item.title || "document" } : b));
          const ok = await abstractOne(item);
          setBatch((b) =>
            b ? { ...b, done: b.done + 1, failed: b.failed + (ok ? 0 : 1) } : b,
          );
        }
      }),
    );
    setBatch((b) => (b ? { ...b, running: false, current: null } : b));
  };

  const pendingInView = visible.filter((a) => a.status === "pending").length;
  const pendingLeases = visible.filter((a) => a.status === "pending" && a.doc_type === "lease").length;

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
            analysis with no prompt — documents are analyzed automatically. Results
            queue here for your review; nothing is sent anywhere until you act.
          </p>
        </div>

        {/* Status tabs */}
        <div className="flex items-center gap-1 mb-3 border-b border-[var(--rule)]">
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

        {/* Doc-type chips */}
        <div className="flex items-center gap-1.5 mb-4 flex-wrap">
          <button
            onClick={() => setTypeFilter("all")}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
              typeFilter === "all"
                ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--canvas)]"
                : "border-[var(--rule)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:border-[var(--rule-strong)]"
            }`}
          >
            All types {analyses.length > 0 ? `(${analyses.length})` : ""}
          </button>
          {TYPE_ORDER.filter((t) => (typeCounts.get(t) || 0) > 0).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(typeFilter === t ? "all" : t)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                typeFilter === t
                  ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--canvas)]"
                  : "border-[var(--rule)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:border-[var(--rule-strong)]"
              }`}
            >
              {TYPE_META[t].plural} ({typeCounts.get(t)})
            </button>
          ))}
        </div>

        {/* Bulk actions — appear when the view has pending items */}
        {pendingInView > 1 && !batch?.running && (
          <div className="mb-4 flex items-center gap-2 flex-wrap card-flat px-3 py-2">
            <span className="text-xs text-[var(--ink-muted)]">
              {pendingInView} pending in view
            </span>
            <div className="flex-1" />
            {pendingLeases > 1 && (typeFilter === "lease" || typeFilter === "all") && (
              <button
                onClick={abstractAllLeases}
                disabled={bulkBusy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--r-input)] bg-[var(--ink)] text-[var(--canvas)] text-xs font-medium hover:opacity-90 disabled:opacity-50 transition"
              >
                <Play className="w-3 h-3" strokeWidth={1.5} />
                Abstract all leases ({pendingLeases})
              </button>
            )}
            <button
              onClick={() => bulkSetStatus("approved")}
              disabled={bulkBusy}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--r-input)] border border-[var(--rule)] text-xs font-medium text-[var(--verified)] hover:bg-[var(--verified-soft)] disabled:opacity-50 transition"
            >
              <Check className="w-3 h-3" strokeWidth={1.5} />
              Approve all
            </button>
            <button
              onClick={() => bulkSetStatus("dismissed")}
              disabled={bulkBusy}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--r-input)] border border-[var(--rule)] text-xs font-medium text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)] disabled:opacity-50 transition"
            >
              <X className="w-3 h-3" strokeWidth={1.5} />
              Dismiss all
            </button>
          </div>
        )}

        {/* Batch progress */}
        {batch && (
          <div className="mb-4 card-flat px-3 py-2.5">
            <div className="flex items-center gap-2">
              {batch.running ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--ink-muted)]" strokeWidth={1.5} />
              ) : (
                <Check className="w-3.5 h-3.5 text-[var(--verified)]" strokeWidth={1.5} />
              )}
              <span className="text-xs font-medium text-[var(--ink)]">
                {batch.running
                  ? `Abstracting ${batch.done + 1} of ${batch.total}${batch.current ? ` — ${batch.current}` : ""}`
                  : `Batch finished: ${batch.done - batch.failed} abstracted${batch.failed ? `, ${batch.failed} failed` : ""}`}
              </span>
              <div className="flex-1" />
              {batch.running ? (
                <button
                  onClick={() => { cancelBatch.current = true; }}
                  className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] underline"
                >
                  Cancel after current
                </button>
              ) : (
                <button
                  onClick={() => setBatch(null)}
                  className="p-0.5 text-[var(--ink-muted)] hover:text-[var(--ink)]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-[var(--canvas-muted)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
                style={{ width: `${batch.total ? Math.round((batch.done / batch.total) * 100) : 0}%` }}
              />
            </div>
          </div>
        )}

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
        ) : visible.length === 0 ? (
          <div className="card-flat p-10 text-center">
            <div className="rounded-full bg-[var(--canvas-subtle)] border border-[var(--rule)] p-3 mx-auto w-fit mb-4">
              <Radar className="w-5 h-5 text-[var(--ink-muted)]" strokeWidth={1.5} />
            </div>
            <p className="text-sm font-medium text-[var(--ink)]">
              {filter === "pending" ? "Nothing waiting for review" : "No analyses here yet"}
            </p>
            <p className="text-sm text-[var(--ink-muted)] mt-1 max-w-sm mx-auto">
              Add a spreadsheet, contract, or statement to the{" "}
              <Link href="/vault" className="text-[var(--accent)] hover:underline">vault</Link>{" "}
              and Autopilot will analyze it automatically.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((a) => {
              const meta = TYPE_META[a.doc_type] || TYPE_META.other;
              const Icon = meta.icon;
              const s = a.summary || {};
              const autoUw = s.auto_underwrite === true;
              const isAbstracting = abstracting.has(a.id);
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
                        {a.doc_type === "lease" && a.vault_item_id && a.status === "pending" && (
                          <button
                            onClick={() => abstractOne(a)}
                            disabled={isAbstracting || batch?.running}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--r-input)] bg-[var(--ink)] text-[var(--canvas)] text-xs font-medium hover:opacity-90 disabled:opacity-50 transition"
                          >
                            {isAbstracting ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                                Abstracting (3-6 min)...
                              </>
                            ) : (
                              <>
                                <Play className="w-3 h-3" strokeWidth={1.5} />
                                Abstract now
                              </>
                            )}
                          </button>
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
