"use client";

import { useState, useEffect } from "react";
import {
  FEATURE_DEFINITIONS,
  ALL_FEATURE_IDS,
  BASE_PLAN_PRICE_USD,
  computeMonthlyBillUsd,
  type FeatureId,
} from "@/lib/features";
import { Check, X, Loader2, Shield, ChevronDown, ChevronUp, CreditCard, ExternalLink, Copy } from "lucide-react";
import { reportError } from "@/lib/report-error";

interface Workspace {
  id: string;
  name: string;
  enabled_features: FeatureId[];
  plan_status: string;
  created_at: string;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
}

const PLAN_STATUS_OPTIONS = [
  { value: "active", label: "Active", color: "text-[var(--verified)] bg-[var(--canvas-subtle)] border-[var(--rule)]" },
  { value: "trial", label: "Trial", color: "text-[var(--accent)] bg-[var(--canvas-subtle)] border-[var(--rule)]" },
  { value: "inactive", label: "Inactive", color: "text-[var(--danger)] bg-[var(--danger-soft)] border-[var(--rule)]" },
  { value: "past_due", label: "Past Due", color: "text-[var(--ink-muted)] bg-[var(--canvas-subtle)] border-[var(--rule)]" },
];

export default function WorkspaceFeatureManager() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/workspace-features", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setWorkspaces(Array.isArray(data) ? data : []))
      .catch(reportError("WorkspaceFeatureManager: load"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const toggleFeature = async (workspaceId: string, featureId: FeatureId) => {
    const ws = workspaces.find((w) => w.id === workspaceId);
    if (!ws) return;

    const current = ws.enabled_features || [];
    const updated = current.includes(featureId)
      ? current.filter((f) => f !== featureId)
      : [...current, featureId];

    setSaving(workspaceId);
    try {
      const res = await fetch("/api/admin/workspace-features", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ workspace_id: workspaceId, enabled_features: updated }),
      });
      if (res.ok) {
        const data = await res.json();
        setWorkspaces((prev) =>
          prev.map((w) => (w.id === workspaceId ? { ...w, enabled_features: data.enabled_features } : w))
        );
        setToast({ type: "success", message: `Updated features for ${ws.name}` });
      } else {
        setToast({ type: "error", message: "Failed to update features" });
      }
    } catch {
      setToast({ type: "error", message: "Network error" });
    } finally {
      setSaving(null);
    }
  };

  const updatePlanStatus = async (workspaceId: string, status: string) => {
    const ws = workspaces.find((w) => w.id === workspaceId);
    if (!ws) return;

    setSaving(workspaceId);
    try {
      const res = await fetch("/api/admin/workspace-features", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ workspace_id: workspaceId, plan_status: status }),
      });
      if (res.ok) {
        const data = await res.json();
        setWorkspaces((prev) =>
          prev.map((w) => (w.id === workspaceId ? { ...w, plan_status: data.plan_status } : w))
        );
        setToast({ type: "success", message: `Plan status updated for ${ws.name}` });
      }
    } catch {
      setToast({ type: "error", message: "Network error" });
    } finally {
      setSaving(null);
    }
  };

  const toggleAll = async (workspaceId: string, enable: boolean) => {
    const ws = workspaces.find((w) => w.id === workspaceId);
    if (!ws) return;

    const updated = enable ? [...ALL_FEATURE_IDS] : [];
    setSaving(workspaceId);
    try {
      const res = await fetch("/api/admin/workspace-features", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ workspace_id: workspaceId, enabled_features: updated }),
      });
      if (res.ok) {
        const data = await res.json();
        setWorkspaces((prev) =>
          prev.map((w) => (w.id === workspaceId ? { ...w, enabled_features: data.enabled_features } : w))
        );
        setToast({ type: "success", message: `${enable ? "Enabled" : "Disabled"} all features for ${ws.name}` });
      }
    } catch {
      setToast({ type: "error", message: "Network error" });
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 strokeWidth={1.5} className="h-6 w-6 animate-spin text-[var(--ink-subtle)]" />
      </div>
    );
  }

  if (workspaces.length === 0) {
    return (
      <div className="py-12 text-center">
        <Shield strokeWidth={1.5} className="mx-auto mb-3 h-10 w-10 text-[var(--ink-subtle)]" />
        <p className="text-[var(--ink-muted)]">No workspaces found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {workspaces.map((ws) => {
        const isExpanded = expandedId === ws.id;
        const enabled = (ws.enabled_features || []) as FeatureId[];
        const enabledCount = enabled.length;
        const totalCount = ALL_FEATURE_IDS.length;
        const statusOption = PLAN_STATUS_OPTIONS.find((o) => o.value === ws.plan_status) || PLAN_STATUS_OPTIONS[0];
        const monthlyBill = computeMonthlyBillUsd(enabled);
        const enabledAddonCount = enabled.filter(
          (id) => FEATURE_DEFINITIONS[id].tier === "addon",
        ).length;

        return (
          <div key={ws.id} className="rounded-[6px] border border-[var(--rule)] bg-[var(--canvas)] overflow-hidden transition-all">
            {/* Header row */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : ws.id)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[var(--canvas-subtle)] transition"
            >
              <div className="flex items-center gap-4">
                <div>
                  <div className="font-medium text-[var(--ink)]">{ws.name}</div>
                  <div className="text-xs text-[var(--ink-subtle)] mt-0.5">
                    {enabledCount}/{totalCount} features
                    {enabledAddonCount > 0 && (
                      <>
                        {" · "}
                        <span className="text-[var(--ink-muted)]">
                          {enabledAddonCount} add-on
                          {enabledAddonCount === 1 ? "" : "s"}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-[var(--ink)] mono">
                  ${monthlyBill}/mo
                </span>
                <span className={`px-2.5 py-1 rounded-[4px] text-xs font-medium border ${statusOption.color}`}>
                  {statusOption.label}
                </span>
                {saving === ws.id ? (
                  <Loader2 strokeWidth={1.5} className="h-4 w-4 animate-spin text-[var(--ink-subtle)]" />
                ) : isExpanded ? (
                  <ChevronUp strokeWidth={1.5} className="h-4 w-4 text-[var(--ink-subtle)]" />
                ) : (
                  <ChevronDown strokeWidth={1.5} className="h-4 w-4 text-[var(--ink-subtle)]" />
                )}
              </div>
            </button>

            {/* Expanded content */}
            {isExpanded && (
              <div className="px-5 pb-5 border-t border-[var(--rule)]">
                {/* Plan Status + Billing row */}
                <div className="pt-4 pb-3 flex flex-wrap items-start gap-x-10 gap-y-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--ink-muted)] uppercase tracking-wide mb-2">
                      Plan Status
                    </label>
                    <div className="flex gap-2">
                      {PLAN_STATUS_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => updatePlanStatus(ws.id, opt.value)}
                          className={`px-3 py-1.5 rounded-[4px] text-xs font-medium border transition-all ${
                            ws.plan_status === opt.value
                              ? opt.color + " ring-1 ring-[var(--rule)]"
                              : "border-[var(--rule)] text-[var(--ink-subtle)] hover:border-[var(--rule-strong)] hover:text-[var(--ink-muted)]"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--ink-muted)] uppercase tracking-wide mb-2">
                      Billing
                    </label>
                    {ws.stripe_customer_id ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs">
                          <CreditCard strokeWidth={1.5} className="h-3.5 w-3.5 text-[var(--accent)]" />
                          <code className="text-[var(--ink-muted)] bg-[var(--canvas-subtle)] px-1.5 py-0.5 rounded text-[11px]">{ws.stripe_customer_id}</code>
                          <button
                            onClick={() => { navigator.clipboard.writeText(ws.stripe_customer_id!); setToast({ type: "success", message: "Copied customer ID" }); }}
                            className="text-[var(--ink-subtle)] hover:text-[var(--ink-muted)] transition"
                          >
                            <Copy strokeWidth={1.5} className="h-3 w-3" />
                          </button>
                          <a
                            href={`https://dashboard.stripe.com/customers/${ws.stripe_customer_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[var(--accent)] hover:opacity-90 transition"
                          >
                            <ExternalLink strokeWidth={1.5} className="h-3 w-3" />
                          </a>
                        </div>
                        {ws.stripe_subscription_id && (
                          <div className="flex items-center gap-2 text-xs">
                            <ExternalLink strokeWidth={1.5} className="h-3.5 w-3.5 text-[var(--accent)]" />
                            <code className="text-[var(--ink-muted)] bg-[var(--canvas-subtle)] px-1.5 py-0.5 rounded text-[11px]">{ws.stripe_subscription_id}</code>
                            <button
                              onClick={() => { navigator.clipboard.writeText(ws.stripe_subscription_id!); setToast({ type: "success", message: "Copied subscription ID" }); }}
                              className="text-[var(--ink-subtle)] hover:text-[var(--ink-muted)] transition"
                            >
                              <Copy strokeWidth={1.5} className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-[var(--ink-subtle)] flex items-center gap-2">
                        <CreditCard strokeWidth={1.5} className="h-3.5 w-3.5 text-[var(--ink-subtle)]" />
                        No Stripe customer linked
                      </div>
                    )}
                  </div>
                </div>

                {/* Features */}
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-medium text-[var(--ink-muted)] uppercase tracking-wide">
                      Enabled Features
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => toggleAll(ws.id, true)}
                        className="text-[10px] text-[var(--verified)] hover:opacity-90 transition"
                      >
                        Enable All
                      </button>
                      <span className="text-[var(--ink-subtle)]">·</span>
                      <button
                        onClick={() => toggleAll(ws.id, false)}
                        className="text-[10px] text-[var(--danger)] hover:text-[var(--danger)] transition"
                      >
                        Disable All
                      </button>
                    </div>
                  </div>

                  {/* Feature toggles, grouped by tier. Base features are
                      bundled into the $400/mo plan (toggling them off is
                      meant for trial/demo only); add-ons surcharge on
                      top with the monthly_price shown. */}
                  {(() => {
                    const baseIds = ALL_FEATURE_IDS.filter(
                      (id) => FEATURE_DEFINITIONS[id].tier === "base",
                    );
                    const addonIds = ALL_FEATURE_IDS.filter(
                      (id) => FEATURE_DEFINITIONS[id].tier === "addon",
                    );

                    const renderToggle = (featureId: FeatureId) => {
                      const feature = FEATURE_DEFINITIONS[featureId];
                      const isEnabled = (ws.enabled_features || []).includes(featureId);
                      const price = feature.monthly_price;

                      return (
                        <button
                          key={featureId}
                          onClick={() => toggleFeature(ws.id, featureId)}
                          disabled={saving === ws.id}
                          className={`flex items-center gap-3 px-4 py-3 rounded-[4px] border text-left transition-all ${
                            isEnabled
                              ? "border-[var(--rule-strong)] bg-[var(--canvas-subtle)] hover:bg-[var(--canvas-subtle)]"
                              : "border-[var(--rule)] bg-[var(--canvas)] hover:bg-[var(--canvas-subtle)]"
                          }`}
                        >
                          <div
                            className={`w-5 h-5 rounded-[4px] flex items-center justify-center border transition-all shrink-0 ${
                              isEnabled
                                ? "bg-[var(--ink)] border-[var(--ink)]"
                                : "border-[var(--rule)] bg-transparent"
                            }`}
                          >
                            {isEnabled && (
                              <Check strokeWidth={1.5} className="h-3 w-3 text-[var(--canvas)]" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                              <div
                                className={`text-sm font-medium ${
                                  isEnabled ? "text-[var(--ink)]" : "text-[var(--ink-muted)]"
                                }`}
                              >
                                {feature.name}
                              </div>
                              {price > 0 && (
                                <div
                                  className={`text-[11px] mono ${
                                    isEnabled ? "text-[var(--ink-muted)]" : "text-[var(--ink-subtle)]"
                                  }`}
                                >
                                  +${price}/mo
                                </div>
                              )}
                            </div>
                            <div className="text-[11px] text-[var(--ink-subtle)]">
                              {feature.description}
                            </div>
                          </div>
                        </button>
                      );
                    };

                    return (
                      <div className="space-y-5">
                        <div>
                          <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-2 flex items-center gap-2">
                            <span>Included with Drift core</span>
                            <span className="text-[var(--ink-subtle)]">·</span>
                            <span className="mono">${BASE_PLAN_PRICE_USD}/mo</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {baseIds.map(renderToggle)}
                          </div>
                        </div>

                        <div>
                          <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-2">
                            Add-ons (à la carte)
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {addonIds.map(renderToggle)}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

              </div>
            )}
          </div>
        );
      })}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 fade-in duration-200">
          <div
            className={`flex items-center gap-2 px-4 py-3 rounded-[4px] text-sm font-medium shadow-lg border ${
              toast.type === "success"
                ? "bg-[var(--canvas-subtle)] border-[var(--rule)] text-[var(--verified)]"
                : "bg-[var(--danger-soft)] border-[var(--rule)] text-[var(--danger)]"
            }`}
          >
            {toast.type === "success" ? <Check strokeWidth={1.5} className="h-4 w-4" /> : <X strokeWidth={1.5} className="h-4 w-4" />}
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
