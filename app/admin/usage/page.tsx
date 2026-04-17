"use client";

import { useEffect, useState, useMemo } from "react";
import { Gauge, Loader2, AlertTriangle, Save, X, Check } from "lucide-react";
import { reportError } from "@/lib/report-error";

interface UsageSummary {
  workspace_id: string;
  workspace_name: string;
  llm_tokens: number;
  emails_sent: number;
  sms_sent: number;
  voice_minutes: number;
  total_cost_cents: number;
  event_count: number;
}

interface Quota {
  workspace_id: string;
  plan_name: string;
  llm_tokens_monthly: number;
  emails_monthly: number;
  sms_monthly: number;
  voice_minutes_monthly: number;
  overage_llm_cents_per_1k: number;
  overage_email_cents: number;
  overage_sms_cents: number;
  overage_voice_cents_per_min: number;
  stripe_subscription_item_id: string | null;
  hard_cap: boolean;
}

interface Overage {
  llm_over: number;
  emails_over: number;
  sms_over: number;
  voice_over: number;
  overage_cents: number;
  any_over: boolean;
}

interface Row {
  usage: UsageSummary;
  quota: Quota;
  overage: Overage;
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function UsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(200, (used / limit) * 100) : 0;
  const color = pct > 100 ? "bg-red-500" : pct > 80 ? "bg-yellow-500" : "bg-purple-500";
  return (
    <div className="h-1 w-full rounded-full bg-white/10 overflow-hidden">
      <div className={`h-full ${color} transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

export default function AdminUsagePage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Quota>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/admin/usage", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => setRows(data.rows))
      .catch(reportError("admin/usage: load"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const totals = useMemo(() => {
    if (!rows) return null;
    return rows.reduce(
      (acc, r) => ({
        llm_tokens: acc.llm_tokens + r.usage.llm_tokens,
        emails: acc.emails + r.usage.emails_sent,
        sms: acc.sms + r.usage.sms_sent,
        voice_minutes: acc.voice_minutes + r.usage.voice_minutes,
        cost_cents: acc.cost_cents + r.usage.total_cost_cents,
        overage_cents: acc.overage_cents + r.overage.overage_cents,
        over_count: acc.over_count + (r.overage.any_over ? 1 : 0),
      }),
      { llm_tokens: 0, emails: 0, sms: 0, voice_minutes: 0, cost_cents: 0, overage_cents: 0, over_count: 0 }
    );
  }, [rows]);

  const startEdit = (row: Row) => {
    setEditing(row.usage.workspace_id);
    setDraft({ ...row.quota });
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/quotas/${editing}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setToast({ type: "error", message: data.error || "Failed to save" });
        return;
      }
      setToast({ type: "success", message: "Quota updated" });
      setEditing(null);
      setDraft({});
      load();
    } catch {
      setToast({ type: "error", message: "Network error" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  if (!rows) {
    return <div className="p-8 text-white/60">Failed to load usage data.</div>;
  }

  return (
    <div className="px-8 py-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <Gauge className="h-6 w-6 text-purple-500" />
          <h1 className="text-3xl font-bold text-white">Usage & Billing Meters</h1>
        </div>
        <p className="text-white/40 text-sm ml-9">Per-workspace usage for the current calendar month</p>
      </div>

      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
          <StatCard label="LLM tokens" value={formatNumber(totals.llm_tokens)} />
          <StatCard label="Emails" value={formatNumber(totals.emails)} />
          <StatCard label="SMS" value={formatNumber(totals.sms)} />
          <StatCard label="Voice min." value={formatNumber(totals.voice_minutes)} />
          <StatCard label="Raw cost" value={formatCost(totals.cost_cents)} />
          <StatCard
            label="Overage"
            value={formatCost(totals.overage_cents)}
            accent={totals.overage_cents > 0 ? "text-red-400" : undefined}
          />
        </div>
      )}

      {totals && totals.over_count > 0 && (
        <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/5 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="text-red-400 font-medium">
              {totals.over_count} workspace{totals.over_count === 1 ? "" : "s"} over quota this month
            </p>
            <p className="text-white/50 text-xs mt-1">
              Total overage billable: {formatCost(totals.overage_cents)}
            </p>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-purple-500/20 bg-black overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-[11px] uppercase tracking-wide text-white/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Workspace</th>
                <th className="px-4 py-3 text-left font-medium">Plan</th>
                <th className="px-4 py-3 text-left font-medium">LLM tokens</th>
                <th className="px-4 py-3 text-left font-medium">Emails</th>
                <th className="px-4 py-3 text-left font-medium">SMS</th>
                <th className="px-4 py-3 text-left font-medium">Voice min.</th>
                <th className="px-4 py-3 text-left font-medium">Cost</th>
                <th className="px-4 py-3 text-left font-medium">Overage</th>
                <th className="px-4 py-3 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-white/40">
                    No workspaces yet.
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const isEditing = editing === r.usage.workspace_id;
                return (
                  <tr
                    key={r.usage.workspace_id}
                    className={`border-t border-white/5 ${r.overage.any_over ? "bg-red-500/5" : ""}`}
                  >
                    <td className="px-4 py-3 text-white font-medium">
                      {r.usage.workspace_name}
                      {r.quota.hard_cap && (
                        <span className="ml-2 text-[10px] text-yellow-400 bg-yellow-500/10 px-1.5 py-0.5 rounded">
                          HARD CAP
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          className="w-24 px-2 py-1 rounded bg-white/5 border border-white/10 text-white text-xs"
                          value={draft.plan_name ?? ""}
                          onChange={(e) => setDraft({ ...draft, plan_name: e.target.value })}
                        />
                      ) : (
                        <span className="text-white/70 capitalize">{r.quota.plan_name}</span>
                      )}
                    </td>
                    <MeterCell
                      used={r.usage.llm_tokens}
                      limit={r.quota.llm_tokens_monthly}
                      editing={isEditing}
                      onChange={(v) => setDraft({ ...draft, llm_tokens_monthly: v })}
                      draftValue={draft.llm_tokens_monthly}
                    />
                    <MeterCell
                      used={r.usage.emails_sent}
                      limit={r.quota.emails_monthly}
                      editing={isEditing}
                      onChange={(v) => setDraft({ ...draft, emails_monthly: v })}
                      draftValue={draft.emails_monthly}
                    />
                    <MeterCell
                      used={r.usage.sms_sent}
                      limit={r.quota.sms_monthly}
                      editing={isEditing}
                      onChange={(v) => setDraft({ ...draft, sms_monthly: v })}
                      draftValue={draft.sms_monthly}
                    />
                    <MeterCell
                      used={r.usage.voice_minutes}
                      limit={r.quota.voice_minutes_monthly}
                      editing={isEditing}
                      onChange={(v) => setDraft({ ...draft, voice_minutes_monthly: v })}
                      draftValue={draft.voice_minutes_monthly}
                    />
                    <td className="px-4 py-3 text-white/70">{formatCost(r.usage.total_cost_cents)}</td>
                    <td className="px-4 py-3">
                      {r.overage.any_over ? (
                        <span className="text-red-400 font-medium">{formatCost(r.overage.overage_cents)}</span>
                      ) : (
                        <span className="text-white/30">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {isEditing ? (
                        <div className="flex items-center gap-2 justify-end">
                          <label className="flex items-center gap-1 text-[11px] text-white/60">
                            <input
                              type="checkbox"
                              checked={!!draft.hard_cap}
                              onChange={(e) => setDraft({ ...draft, hard_cap: e.target.checked })}
                            />
                            Hard cap
                          </label>
                          <button
                            onClick={saveEdit}
                            disabled={saving}
                            className="p-1.5 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 disabled:opacity-40"
                          >
                            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                          </button>
                          <button
                            onClick={() => {
                              setEditing(null);
                              setDraft({});
                            }}
                            className="p-1.5 rounded-lg bg-white/5 text-white/60 hover:bg-white/10"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(r)}
                          className="text-xs text-purple-400 hover:text-purple-300"
                        >
                          Edit quotas
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-white/30 mt-4">
        Counters reset on the 1st of each month (UTC). Overage is calculated at the configured rate per unit above each quota.
        Set <code className="bg-white/5 px-1.5 py-0.5 rounded text-white/50">Hard cap</code> to block further billable actions once a workspace exceeds its plan.
      </p>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <div
            className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium shadow-lg border ${
              toast.type === "success"
                ? "bg-green-500/10 border-green-500/30 text-green-400"
                : "bg-red-500/10 border-red-500/30 text-red-400"
            }`}
          >
            {toast.type === "success" ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-purple-500/20 bg-black px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-white/40">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${accent ?? "text-white"}`}>{value}</div>
    </div>
  );
}

function MeterCell({
  used,
  limit,
  editing,
  onChange,
  draftValue,
}: {
  used: number;
  limit: number;
  editing: boolean;
  onChange: (v: number) => void;
  draftValue: number | undefined;
}) {
  return (
    <td className="px-4 py-3 min-w-[140px]">
      <div className="text-white/80 text-xs mb-1">
        {formatNumber(used)} <span className="text-white/40">/</span>{" "}
        {editing ? (
          <input
            type="number"
            className="w-20 px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white text-xs"
            value={draftValue ?? limit}
            onChange={(e) => onChange(Number(e.target.value))}
          />
        ) : (
          <span className="text-white/50">{formatNumber(limit)}</span>
        )}
      </div>
      <UsageBar used={used} limit={limit} />
    </td>
  );
}
