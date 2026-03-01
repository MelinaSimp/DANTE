"use client";

import { useState, useEffect } from "react";
import { FEATURE_DEFINITIONS, ALL_FEATURE_IDS, type FeatureId } from "@/lib/features";
import { Check, X, Loader2, Shield, ChevronDown, ChevronUp, CreditCard, ExternalLink, Copy } from "lucide-react";

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
  { value: "active", label: "Active", color: "text-green-400 bg-green-400/10 border-green-400/20" },
  { value: "trial", label: "Trial", color: "text-blue-400 bg-blue-400/10 border-blue-400/20" },
  { value: "inactive", label: "Inactive", color: "text-red-400 bg-red-400/10 border-red-400/20" },
  { value: "past_due", label: "Past Due", color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20" },
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
      .catch(() => {})
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
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  if (workspaces.length === 0) {
    return (
      <div className="py-12 text-center">
        <Shield className="mx-auto mb-3 h-10 w-10 text-white/20" />
        <p className="text-white/60">No workspaces found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {workspaces.map((ws) => {
        const isExpanded = expandedId === ws.id;
        const enabledCount = (ws.enabled_features || []).length;
        const totalCount = ALL_FEATURE_IDS.length;
        const statusOption = PLAN_STATUS_OPTIONS.find((o) => o.value === ws.plan_status) || PLAN_STATUS_OPTIONS[0];

        return (
          <div key={ws.id} className="rounded-xl border border-orange-500/20 bg-black overflow-hidden transition-all">
            {/* Header row */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : ws.id)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-orange-500/5 transition"
            >
              <div className="flex items-center gap-4">
                <div>
                  <div className="font-medium text-white">{ws.name}</div>
                  <div className="text-xs text-white/40 mt-0.5">
                    {enabledCount}/{totalCount} features enabled
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${statusOption.color}`}>
                  {statusOption.label}
                </span>
                {saving === ws.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-white/40" />
                ) : isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-white/40" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-white/40" />
                )}
              </div>
            </button>

            {/* Expanded content */}
            {isExpanded && (
              <div className="px-5 pb-5 border-t border-orange-500/10">
                {/* Plan Status + Billing row */}
                <div className="pt-4 pb-3 flex flex-wrap items-start gap-x-10 gap-y-3">
                  <div>
                    <label className="block text-xs font-medium text-white/50 uppercase tracking-wide mb-2">
                      Plan Status
                    </label>
                    <div className="flex gap-2">
                      {PLAN_STATUS_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => updatePlanStatus(ws.id, opt.value)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                            ws.plan_status === opt.value
                              ? opt.color + " ring-1 ring-orange-500/20"
                              : "border-orange-500/10 text-white/40 hover:border-orange-500/30 hover:text-white/60"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-white/50 uppercase tracking-wide mb-2">
                      Billing
                    </label>
                    {ws.stripe_customer_id ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs">
                          <CreditCard className="h-3.5 w-3.5 text-orange-500/60" />
                          <code className="text-white/70 bg-white/5 px-1.5 py-0.5 rounded text-[11px]">{ws.stripe_customer_id}</code>
                          <button
                            onClick={() => { navigator.clipboard.writeText(ws.stripe_customer_id!); setToast({ type: "success", message: "Copied customer ID" }); }}
                            className="text-white/30 hover:text-white/60 transition"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                          <a
                            href={`https://dashboard.stripe.com/customers/${ws.stripe_customer_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-orange-500 hover:text-orange-400 transition"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                        {ws.stripe_subscription_id && (
                          <div className="flex items-center gap-2 text-xs">
                            <ExternalLink className="h-3.5 w-3.5 text-orange-500/60" />
                            <code className="text-white/70 bg-white/5 px-1.5 py-0.5 rounded text-[11px]">{ws.stripe_subscription_id}</code>
                            <button
                              onClick={() => { navigator.clipboard.writeText(ws.stripe_subscription_id!); setToast({ type: "success", message: "Copied subscription ID" }); }}
                              className="text-white/30 hover:text-white/60 transition"
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-white/30 flex items-center gap-2">
                        <CreditCard className="h-3.5 w-3.5 text-white/20" />
                        No Stripe customer linked
                      </div>
                    )}
                  </div>
                </div>

                {/* Features */}
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-medium text-white/50 uppercase tracking-wide">
                      Enabled Features
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => toggleAll(ws.id, true)}
                        className="text-[10px] text-green-400 hover:text-green-300 transition"
                      >
                        Enable All
                      </button>
                      <span className="text-white/20">·</span>
                      <button
                        onClick={() => toggleAll(ws.id, false)}
                        className="text-[10px] text-red-400 hover:text-red-300 transition"
                      >
                        Disable All
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {ALL_FEATURE_IDS.map((featureId) => {
                      const feature = FEATURE_DEFINITIONS[featureId];
                      const enabled = (ws.enabled_features || []).includes(featureId);

                      return (
                        <button
                          key={featureId}
                          onClick={() => toggleFeature(ws.id, featureId)}
                          disabled={saving === ws.id}
                          className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                            enabled
                              ? "border-orange-500/30 bg-orange-500/10 hover:bg-orange-500/15"
                              : "border-orange-500/10 bg-black hover:bg-white/5"
                          }`}
                        >
                          <div
                            className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all shrink-0 ${
                              enabled
                                ? "bg-orange-500 border-orange-500"
                                : "border-white/20 bg-transparent"
                            }`}
                          >
                            {enabled && <Check className="h-3 w-3 text-white" />}
                          </div>
                          <div className="min-w-0">
                            <div className={`text-sm font-medium ${enabled ? "text-white" : "text-white/50"}`}>
                              {feature.name}
                            </div>
                            <div className="text-[11px] text-white/30 truncate">{feature.description}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
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
