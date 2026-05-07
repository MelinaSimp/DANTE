"use client";

// Per-customer pricing detail page. Editable fields:
//   • monthly_price_cents
//   • usage_allowance_cents
//   • overage_markup_pct
//   • model_overrides.{routing, bulk, hard}
//
// Read-only: 12-month usage history bar chart.
//
// Saves via PATCH /api/admin/customers/[id]. Optimistic; revert on
// error.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Save, ArrowLeft } from "lucide-react";

interface Workspace {
  id: string;
  name: string;
  industry: string | null;
  monthly_price_cents: number;
  usage_allowance_cents: number;
  overage_markup_pct: number;
  model_overrides: { routing?: string; bulk?: string; hard?: string };
  created_at: string;
}

interface HistoryRow { year_month: string; cost_cents: number }

const MODEL_OPTIONS = {
  routing: [
    { value: "claude-haiku-4-5", label: "Haiku 4.5 (fast, cheapest)" },
    { value: "claude-sonnet-4-6", label: "Sonnet 4.6 (richer routing)" },
  ],
  bulk: [
    { value: "claude-haiku-4-5", label: "Haiku 4.5 (cheapest, smaller)" },
    { value: "claude-sonnet-4-6", label: "Sonnet 4.6 (default)" },
    { value: "claude-opus-4-7", label: "Opus 4 (premium)" },
  ],
  hard: [
    { value: "claude-sonnet-4-6", label: "Sonnet 4.6 (cost-conscious)" },
    { value: "claude-opus-4-7", label: "Opus 4 (default for hard reasoning)" },
  ],
};

const DEFAULTS = {
  routing: "claude-haiku-4-5",
  bulk: "claude-sonnet-4-6",
  hard: "claude-opus-4-7",
};

export default function CustomerDetailClient({ workspaceId }: { workspaceId: string }) {
  const [ws, setWs] = useState<Workspace | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Editable form state, mirrors ws fields.
  const [priceDollars, setPriceDollars] = useState("");
  const [allowanceDollars, setAllowanceDollars] = useState("");
  const [markupPct, setMarkupPct] = useState("");
  const [routingModel, setRoutingModel] = useState(DEFAULTS.routing);
  const [bulkModel, setBulkModel] = useState(DEFAULTS.bulk);
  const [hardModel, setHardModel] = useState(DEFAULTS.hard);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/admin/customers/${workspaceId}`, { cache: "no-store" });
        if (!r.ok) {
          setError(`Failed to load (${r.status})`);
          return;
        }
        const j = await r.json();
        const w: Workspace = j.workspace;
        setWs(w);
        setHistory(j.history || []);
        setPriceDollars(((w.monthly_price_cents ?? 0) / 100).toFixed(2));
        setAllowanceDollars(((w.usage_allowance_cents ?? 0) / 100).toFixed(2));
        setMarkupPct(String(w.overage_markup_pct ?? 30));
        setRoutingModel(w.model_overrides?.routing || DEFAULTS.routing);
        setBulkModel(w.model_overrides?.bulk || DEFAULTS.bulk);
        setHardModel(w.model_overrides?.hard || DEFAULTS.hard);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, [workspaceId]);

  async function save() {
    setSaving(true);
    setError(null);
    const body = {
      monthly_price_cents: Math.round(parseFloat(priceDollars || "0") * 100),
      usage_allowance_cents: Math.round(parseFloat(allowanceDollars || "0") * 100),
      overage_markup_pct: parseInt(markupPct || "0", 10),
      model_overrides: {
        routing: routingModel,
        bulk: bulkModel,
        hard: hardModel,
      },
    };
    try {
      const r = await fetch(`/api/admin/customers/${workspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j?.error || `Save failed (${r.status})`);
      } else {
        setSavedAt(Date.now());
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  if (error && !ws) return <div className="text-sm text-[var(--danger)]">{error}</div>;
  if (!ws) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }

  const maxHistory = Math.max(1, ...history.map((h) => h.cost_cents));

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/customers" className="inline-flex items-center gap-1 text-[12px] text-[var(--ink-muted)] hover:text-[var(--ink)] mb-3">
          <ArrowLeft className="w-3 h-3" /> All customers
        </Link>
        <h1 className="heading-display text-3xl">{ws.name}</h1>
        <div className="text-xs mono uppercase tracking-wider text-[var(--ink-subtle)] mt-1">
          {ws.industry === "financial_advisor" ? "RIA" : ws.industry === "real_estate" ? "Realtor" : "—"} · created {new Date(ws.created_at).toLocaleDateString()}
        </div>
      </div>

      {/* Pricing */}
      <section className="border border-[var(--rule)] rounded-md p-5">
        <div className="text-[11px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-3">Pricing</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Monthly price (USD)">
            <input
              type="number" step="0.01" min="0"
              value={priceDollars}
              onChange={(e) => setPriceDollars(e.target.value)}
              className="w-full rounded-[6px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
            />
          </Field>
          <Field label="Included AI allowance (USD/mo)">
            <input
              type="number" step="0.01" min="0"
              value={allowanceDollars}
              onChange={(e) => setAllowanceDollars(e.target.value)}
              className="w-full rounded-[6px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
            />
          </Field>
          <Field label="Overage markup (%)">
            <input
              type="number" step="1" min="0" max="500"
              value={markupPct}
              onChange={(e) => setMarkupPct(e.target.value)}
              className="w-full rounded-[6px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
            />
          </Field>
        </div>
      </section>

      {/* Model routing */}
      <section className="border border-[var(--rule)] rounded-md p-5">
        <div className="text-[11px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-3">Model routing</div>
        <p className="text-[12px] text-[var(--ink-muted)] mb-4">
          Hybrid default routes intent → Haiku, bulk Q&A → Sonnet, hard reasoning → Opus.
          Override per customer below; this customer's plan takes precedence over defaults.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Routing / classification">
            <select value={routingModel} onChange={(e) => setRoutingModel(e.target.value)} className="w-full rounded-[6px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]">
              {MODEL_OPTIONS.routing.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Standard answers (bulk)">
            <select value={bulkModel} onChange={(e) => setBulkModel(e.target.value)} className="w-full rounded-[6px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]">
              {MODEL_OPTIONS.bulk.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Hard reasoning">
            <select value={hardModel} onChange={(e) => setHardModel(e.target.value)} className="w-full rounded-[6px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]">
              {MODEL_OPTIONS.hard.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
        </div>
      </section>

      {/* Usage history */}
      <section className="border border-[var(--rule)] rounded-md p-5">
        <div className="text-[11px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-3">Last 12 months — AI cost</div>
        <div className="flex items-end gap-1 h-32">
          {history.map((h) => {
            const heightPct = (h.cost_cents / maxHistory) * 100;
            return (
              <div key={h.year_month} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full bg-[var(--accent,#2563eb)] opacity-80 rounded-t" style={{ height: `${heightPct}%`, minHeight: h.cost_cents > 0 ? 2 : 0 }} title={`${h.year_month}: $${(h.cost_cents/100).toFixed(2)}`} />
                <div className="text-[10px] mono text-[var(--ink-subtle)]">{h.year_month.slice(5)}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Save bar */}
      <div className="flex items-center justify-between sticky bottom-4">
        <div className="text-[12px]">
          {error && <span className="text-[var(--danger)]">{error}</span>}
          {!error && savedAt && <span className="text-green-700">Saved.</span>}
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-[6px] bg-black text-white px-4 py-2 text-sm hover:bg-black/85 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save changes
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[11px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-1">{label}</div>
      {children}
    </label>
  );
}
