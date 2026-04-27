"use client";

import { useState, useEffect } from "react";
import {
  Building2,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Trash2,
  UserPlus,
  Loader2,
  X,
  Check,
  DollarSign,
} from "lucide-react";
import { reportError } from "@/lib/report-error";

interface Workspace {
  id: string;
  name: string;
  created_at: string;
  owner_id: string;
  enabled_features: string[];
  plan_status: string;
  owner_name: string | null;
  owner_email: string | null;
  user_count: number;
  /** Negotiated monthly base price, stored in cents. */
  billing_amount: number | null;
  /** Vertical the workspace was created for. */
  industry: string | null;
}

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [addingUser, setAddingUser] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [editingPrice, setEditingPrice] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState("");
  const [savingPrice, setSavingPrice] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/workspaces", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setWorkspaces(Array.isArray(data) ? data : []))
      .catch(reportError("admin/workspaces: load"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/workspaces?id=${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        setWorkspaces((prev) => prev.filter((w) => w.id !== id));
        setToast({ type: "success", message: "Workspace deleted" });
      } else {
        const data = await res.json();
        setToast({ type: "error", message: data.error || "Failed to delete" });
      }
    } catch {
      setToast({ type: "error", message: "Network error" });
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  };

  const handleSavePrice = async (workspaceId: string) => {
    const dollars = parseFloat(priceDraft);
    if (!Number.isFinite(dollars) || dollars < 0) {
      setToast({ type: "error", message: "Enter a valid dollar amount" });
      return;
    }
    const cents = Math.round(dollars * 100);
    setSavingPrice(true);
    try {
      const res = await fetch("/api/admin/workspaces", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          workspace_id: workspaceId,
          billing_amount: cents,
          billing_cycle: "monthly",
        }),
      });
      if (res.ok) {
        setWorkspaces((prev) =>
          prev.map((w) =>
            w.id === workspaceId ? { ...w, billing_amount: cents } : w
          )
        );
        setToast({ type: "success", message: `Price set to $${dollars.toFixed(2)}/mo` });
        setEditingPrice(null);
        setPriceDraft("");
      } else {
        const data = await res.json();
        setToast({ type: "error", message: data.error || "Failed to save price" });
      }
    } catch {
      setToast({ type: "error", message: "Network error" });
    } finally {
      setSavingPrice(false);
    }
  };

  const handleAddUser = async (workspaceId: string) => {
    if (!userEmail.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ workspace_id: workspaceId, user_email: userEmail.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setToast({ type: "success", message: `Added ${userEmail} to workspace` });
        setWorkspaces((prev) =>
          prev.map((w) =>
            w.id === workspaceId ? { ...w, user_count: w.user_count + 1 } : w
          )
        );
        setUserEmail("");
        setAddingUser(null);
      } else {
        setToast({ type: "error", message: data.error || "Failed to add user" });
      }
    } catch {
      setToast({ type: "error", message: "Network error" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--ink-subtle)]" strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <div className="px-8 py-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="border border-[var(--rule)] bg-[var(--canvas)] rounded-[4px] p-2">
            <Building2 className="h-5 w-5 text-[var(--ink)]" strokeWidth={1.5} />
          </div>
          <h1 className="heading-display text-4xl text-[var(--ink)]">All workspaces</h1>
        </div>
        <p className="text-sm text-[var(--ink-muted)] ml-[52px]">
          {workspaces.length} workspace{workspaces.length !== 1 ? "s" : ""} registered
        </p>
      </div>

      <div className="card-flat overflow-hidden">
        {workspaces.length === 0 ? (
          <div className="py-16 text-center">
            <Building2
              className="h-8 w-8 text-[var(--ink-subtle)] mx-auto mb-3"
              strokeWidth={1.5}
            />
            <p className="text-[var(--ink-muted)] text-sm">No workspaces yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--rule)] bg-[var(--canvas-subtle)]">
                <tr>
                  <th className="label-section text-left py-4 px-6">Health</th>
                  <th className="label-section text-left py-4 px-4">Workspace</th>
                  <th className="label-section text-left py-4 px-4">Industry</th>
                  <th className="label-section text-left py-4 px-4">Plan</th>
                  <th className="label-section text-left py-4 px-4">Price / mo</th>
                  <th className="label-section text-left py-4 px-4">Users</th>
                  <th className="label-section text-left py-4 px-4">Features</th>
                  <th className="label-section text-left py-4 px-4">Created</th>
                  <th className="label-section text-right py-4 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {workspaces.map((ws) => {
                  const featureCount = (ws.enabled_features || []).length;
                  const health =
                    ws.user_count === 0
                      ? "error"
                      : featureCount === 0
                      ? "warning"
                      : "healthy";

                  const statusClass =
                    ws.plan_status === "active"
                      ? "text-[var(--verified)] bg-[var(--verified-soft)] border-[var(--verified)]/30"
                      : ws.plan_status === "trial"
                      ? "text-[var(--accent)] bg-[var(--accent-soft)] border-[var(--accent)]/30"
                      : ws.plan_status === "past_due"
                      ? "text-[var(--flag)] bg-[var(--flag-soft)] border-[var(--flag)]/30"
                      : "text-[var(--danger)] bg-[var(--danger-soft)] border-[var(--danger)]/30";

                  return (
                    <tr
                      key={ws.id}
                      className="border-b border-[var(--rule)] hover:bg-[var(--canvas-subtle)] transition-colors group"
                    >
                      <td className="py-4 px-6">
                        {health === "healthy" ? (
                          <CheckCircle2
                            className="h-4 w-4 text-[var(--verified)]"
                            strokeWidth={1.5}
                          />
                        ) : health === "warning" ? (
                          <AlertCircle
                            className="h-4 w-4 text-[var(--flag)]"
                            strokeWidth={1.5}
                          />
                        ) : (
                          <XCircle
                            className="h-4 w-4 text-[var(--danger)]"
                            strokeWidth={1.5}
                          />
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <div className="text-sm font-medium text-[var(--ink)]">{ws.name}</div>
                        <div className="text-[11px] text-[var(--ink-subtle)]">
                          {ws.owner_name || ws.owner_email || "Unknown"}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-xs text-[var(--ink-muted)]">
                        {ws.industry === "real_estate"
                          ? "Real estate"
                          : ws.industry === "financial_advisor"
                          ? "Financial advisor"
                          : "—"}
                      </td>
                      <td className="py-4 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${statusClass}`}
                        >
                          {ws.plan_status || "active"}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        {editingPrice === ws.id ? (
                          <div className="flex items-center gap-1.5">
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--ink-subtle)]">
                                $
                              </span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={priceDraft}
                                onChange={(e) => setPriceDraft(e.target.value)}
                                onKeyDown={(e) =>
                                  e.key === "Enter" && handleSavePrice(ws.id)
                                }
                                placeholder="699.00"
                                className="pl-5 pr-2 py-1 text-xs rounded-[4px] bg-[var(--canvas)] border border-[var(--rule)] text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none focus:border-[var(--accent)] w-24 mono"
                                autoFocus
                              />
                            </div>
                            <button
                              onClick={() => handleSavePrice(ws.id)}
                              disabled={savingPrice}
                              className="p-1 rounded-[4px] text-[var(--verified)] hover:bg-[var(--verified-soft)] transition disabled:opacity-50"
                            >
                              {savingPrice ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
                              ) : (
                                <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
                              )}
                            </button>
                            <button
                              onClick={() => {
                                setEditingPrice(null);
                                setPriceDraft("");
                              }}
                              className="p-1 rounded-[4px] text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)] transition"
                            >
                              <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingPrice(ws.id);
                              setPriceDraft(
                                ws.billing_amount
                                  ? (ws.billing_amount / 100).toFixed(2)
                                  : ""
                              );
                            }}
                            className="text-xs mono text-[var(--ink)] hover:text-[var(--accent)] transition flex items-center gap-1"
                            title="Click to edit"
                          >
                            <DollarSign
                              className="h-3 w-3 text-[var(--ink-subtle)]"
                              strokeWidth={1.5}
                            />
                            {ws.billing_amount
                              ? (ws.billing_amount / 100).toFixed(2)
                              : <span className="text-[var(--ink-subtle)]">set</span>}
                          </button>
                        )}
                      </td>
                      <td className="py-4 px-4 mono text-[var(--ink-muted)]">{ws.user_count}</td>
                      <td className="py-4 px-4">
                        <span className="mono text-[var(--accent)] text-xs">
                          {featureCount}/7
                        </span>
                      </td>
                      <td className="py-4 px-4 mono text-[var(--ink-subtle)] text-xs">
                        {new Date(ws.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center justify-end gap-2">
                          {/* Add User */}
                          {addingUser === ws.id ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="email"
                                value={userEmail}
                                onChange={(e) => setUserEmail(e.target.value)}
                                onKeyDown={(e) =>
                                  e.key === "Enter" && handleAddUser(ws.id)
                                }
                                placeholder="user@email.com"
                                className="px-2 py-1 text-xs rounded-[4px] bg-[var(--canvas)] border border-[var(--rule)] text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none focus:border-[var(--accent)] w-44"
                                autoFocus
                              />
                              <button
                                onClick={() => handleAddUser(ws.id)}
                                disabled={submitting}
                                className="p-1 rounded-[4px] text-[var(--verified)] hover:bg-[var(--verified-soft)] transition disabled:opacity-50"
                              >
                                {submitting ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
                                ) : (
                                  <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
                                )}
                              </button>
                              <button
                                onClick={() => {
                                  setAddingUser(null);
                                  setUserEmail("");
                                }}
                                className="p-1 rounded-[4px] text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)] transition"
                              >
                                <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setAddingUser(ws.id)}
                              className="p-1.5 rounded-[4px] text-[var(--ink-subtle)] hover:text-[var(--accent)] hover:bg-[var(--accent-soft)] transition opacity-0 group-hover:opacity-100"
                              title="Add user to workspace"
                            >
                              <UserPlus className="h-4 w-4" strokeWidth={1.5} />
                            </button>
                          )}

                          {/* Delete */}
                          {confirmDelete === ws.id ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-[var(--danger)]">Delete?</span>
                              <button
                                onClick={() => handleDelete(ws.id)}
                                disabled={deleting === ws.id}
                                className="p-1 rounded-[4px] text-[var(--danger)] hover:bg-[var(--danger-soft)] transition disabled:opacity-50"
                              >
                                {deleting === ws.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
                                ) : (
                                  <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
                                )}
                              </button>
                              <button
                                onClick={() => setConfirmDelete(null)}
                                className="p-1 rounded-[4px] text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)] transition"
                              >
                                <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDelete(ws.id)}
                              className="p-1.5 rounded-[4px] text-[var(--ink-subtle)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] transition opacity-0 group-hover:opacity-100"
                              title="Delete workspace"
                            >
                              <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <div
            className={`flex items-center gap-2 px-4 py-3 rounded-[6px] text-sm font-medium border ${
              toast.type === "success"
                ? "bg-[var(--verified-soft)] border-[var(--verified)]/30 text-[var(--verified)]"
                : "bg-[var(--danger-soft)] border-[var(--danger)]/30 text-[var(--danger)]"
            }`}
          >
            {toast.type === "success" ? (
              <Check className="h-4 w-4" strokeWidth={1.5} />
            ) : (
              <X className="h-4 w-4" strokeWidth={1.5} />
            )}
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
