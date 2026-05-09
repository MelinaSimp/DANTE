"use client";

import { Fragment, useState, useEffect } from "react";
import { Building2, CheckCircle2, AlertCircle, XCircle, Trash2, UserPlus, Users, ChevronDown, ChevronRight, Loader2, X, Check, DollarSign, Copy, KeyRound } from "lucide-react";
import { reportError } from "@/lib/report-error";

interface WorkspaceMember {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  phone_verified: boolean;
}

interface Workspace {
  id: string; name: string; created_at: string; owner_id: string; enabled_features: string[];
  plan_status: string; owner_name: string | null; owner_email: string | null; user_count: number;
  billing_amount: number | null; billing_cycle: string | null; invite_code: string | null;
  members?: WorkspaceMember[];
}

export default function WorkspacesAPanel() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [addingUser, setAddingUser] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const [editingBilling, setEditingBilling] = useState<string | null>(null);
  const [billingAmount, setBillingAmount] = useState("");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [savingBilling, setSavingBilling] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const r = await fetch("/api/admin/workspaces", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: newName.trim() }),
      });
      const d = await r.json();
      if (r.ok) {
        setWorkspaces(p => [{ ...d, owner_name: null, owner_email: null, user_count: 0, billing_amount: null, billing_cycle: null }, ...p]);
        setNewName("");
        setToast({ type: "success", message: `Created "${d.name}"` });
      } else {
        setToast({ type: "error", message: d.error || "Failed to create" });
      }
    } catch {
      setToast({ type: "error", message: "Error creating workspace" });
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    fetch("/api/admin/workspaces", { credentials: "include" }).then(r => r.ok ? r.json() : []).then(d => setWorkspaces(Array.isArray(d) ? d : [])).catch(reportError("WorkspacesAPanel: load")).finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }, [toast]);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try { const r = await fetch(`/api/admin/workspaces?id=${id}`, { method: "DELETE", credentials: "include" }); if (r.ok) { setWorkspaces(p => p.filter(w => w.id !== id)); setToast({ type: "success", message: "Deleted" }); } else { const d = await r.json(); setToast({ type: "error", message: d.error || "Failed" }); } }
    catch { setToast({ type: "error", message: "Error" }); } finally { setDeleting(null); setConfirmDelete(null); }
  };

  const handleAddUser = async (wsId: string) => {
    if (!userEmail.trim()) return; setSubmitting(true);
    try { const r = await fetch("/api/admin/workspaces", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ workspace_id: wsId, user_email: userEmail.trim() }) }); const d = await r.json();
      if (r.ok) { setToast({ type: "success", message: `Added ${userEmail}` }); setWorkspaces(p => p.map(w => w.id === wsId ? { ...w, user_count: w.user_count + 1 } : w)); setUserEmail(""); setAddingUser(null); }
      else setToast({ type: "error", message: d.error || "Failed" });
    } catch { setToast({ type: "error", message: "Error" }); } finally { setSubmitting(false); }
  };

  const handleSaveBilling = async (wsId: string) => {
    setSavingBilling(true);
    try {
      const amount = Math.round(parseFloat(billingAmount) * 100);
      if (isNaN(amount) || amount < 0) { setToast({ type: "error", message: "Invalid amount" }); return; }
      const r = await fetch("/api/admin/workspaces", { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ workspace_id: wsId, billing_amount: amount, billing_cycle: billingCycle }) });
      if (r.ok) {
        setWorkspaces(p => p.map(w => w.id === wsId ? { ...w, billing_amount: amount, billing_cycle: billingCycle } : w));
        setToast({ type: "success", message: "Billing updated" });
        setEditingBilling(null);
      } else { const d = await r.json(); setToast({ type: "error", message: d.error || "Failed" }); }
    } catch { setToast({ type: "error", message: "Error" }); } finally { setSavingBilling(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-[var(--ink-subtle)]" strokeWidth={1.5} /></div>;

  return (
    <div className="p-4">
      {toast && <div className={`fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-[6px] text-sm font-medium shadow-lg border ${toast.type === "success" ? "bg-[var(--canvas-subtle)] border-[var(--rule)] text-[var(--verified)]" : "bg-[var(--danger-soft)] border-[var(--rule)] text-[var(--danger)]"}`}>{toast.message}</div>}

      {/* Create workspace */}
      <div className="flex items-center gap-2 mb-4">
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleCreate(); }}
          placeholder="New workspace name..."
          className="flex-1 px-3 py-2 text-sm rounded-[4px] bg-[var(--canvas)] border border-[var(--rule)] text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none focus:border-[var(--rule-strong)]"
        />
        <button
          onClick={handleCreate}
          disabled={creating || !newName.trim()}
          className="px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-medium hover:opacity-90 transition disabled:opacity-40 flex items-center gap-1.5"
        >
          {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} /> : <Building2 className="h-3.5 w-3.5" strokeWidth={1.5} />}
          Create
        </button>
      </div>

      {workspaces.length === 0 ? (
        <div className="text-center py-16"><Building2 className="h-8 w-8 text-[var(--ink-subtle)] mx-auto mb-3" strokeWidth={1.5} /><p className="text-[var(--ink-subtle)] text-sm">No workspaces yet</p></div>
      ) : (
        <div className="overflow-x-auto rounded-[6px] border border-[var(--rule)] bg-[var(--canvas-subtle)]">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--rule)]"><tr className="text-left text-[var(--ink-subtle)] text-xs uppercase tracking-wider">
              <th className="py-3 px-4 font-medium">Health</th><th className="py-3 px-4 font-medium">Workspace</th><th className="py-3 px-4 font-medium">Invite Code</th><th className="py-3 px-4 font-medium">Plan</th>
              <th className="py-3 px-4 font-medium">Billing</th><th className="py-3 px-4 font-medium">Users</th><th className="py-3 px-4 font-medium">Features</th><th className="py-3 px-4 font-medium">Created</th><th className="py-3 px-4 font-medium text-right">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-[var(--rule)]">
              {workspaces.map(ws => {
                const fc = (ws.enabled_features || []).length;
                const health = ws.user_count === 0 ? "error" : fc === 0 ? "warning" : "healthy";
                const sc = ws.plan_status === "active" ? "text-[var(--verified)] bg-[var(--canvas)] border-[var(--rule)]" : ws.plan_status === "trial" ? "text-[var(--accent)] bg-[var(--canvas)] border-[var(--rule)]" : "text-[var(--danger)] bg-[var(--danger-soft)] border-[var(--rule)]";
                return (
                  <Fragment key={ws.id}>
                  <tr className="hover:bg-[var(--canvas-subtle)] group">
                    <td className="py-3 px-4">{health === "healthy" ? <CheckCircle2 className="h-4 w-4 text-[var(--verified)]" strokeWidth={1.5} /> : health === "warning" ? <AlertCircle className="h-4 w-4 text-yellow-500" strokeWidth={1.5} /> : <XCircle className="h-4 w-4 text-[var(--danger)]" strokeWidth={1.5} />}</td>
                    <td className="py-3 px-4"><div className="text-sm font-medium text-[var(--ink)]">{ws.name}</div><div className="text-[11px] text-[var(--ink-subtle)]">{ws.owner_name || ws.owner_email || "Unknown"}</div></td>
                    <td className="py-3 px-4">
                      {ws.invite_code ? (
                        <button
                          onClick={() => { navigator.clipboard.writeText(ws.invite_code!); setToast({ type: "success", message: "Code copied!" }); }}
                          className="flex items-center gap-1.5 px-2 py-1 rounded-[4px] bg-[var(--canvas)] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] transition group/code"
                          title="Click to copy"
                        >
                          <KeyRound className="h-3 w-3 text-[var(--accent)]" strokeWidth={1.5} />
                          <span className="text-[11px] font-mono text-[var(--accent)]">{ws.invite_code}</span>
                          <Copy className="h-3 w-3 text-[var(--ink-subtle)] group-hover/code:text-[var(--accent)] transition" strokeWidth={1.5} />
                        </button>
                      ) : (
                        <span className="text-[11px] text-[var(--ink-subtle)]">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4"><span className={`px-2 py-0.5 rounded-[4px] text-[10px] font-medium border ${sc}`}>{ws.plan_status || "active"}</span></td>
                    <td className="py-3 px-4">
                      {editingBilling === ws.id ? (
                        <div className="flex items-center gap-1.5">
                          <div className="relative">
                            <DollarSign className="absolute left-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--ink-subtle)]" strokeWidth={1.5} />
                            <input type="number" value={billingAmount} onChange={e => setBillingAmount(e.target.value)} placeholder="0.00" min="0" step="0.01"
                              className="w-20 pl-5 pr-1 py-1 text-xs rounded-[4px] bg-[var(--canvas)] border border-[var(--rule)] text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none" autoFocus />
                          </div>
                          <select value={billingCycle} onChange={e => setBillingCycle(e.target.value as "monthly" | "yearly")}
                            className="px-1 py-1 text-[10px] rounded-[4px] bg-[var(--canvas)] border border-[var(--rule)] text-[var(--ink)] focus:outline-none">
                            <option value="monthly">Mo</option>
                            <option value="yearly">Yr</option>
                          </select>
                          <button onClick={() => handleSaveBilling(ws.id)} disabled={savingBilling} className="p-1 text-[var(--verified)] hover:bg-[var(--canvas-subtle)] rounded-[4px] disabled:opacity-50">
                            {savingBilling ? <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} /> : <Check className="h-3 w-3" strokeWidth={1.5} />}
                          </button>
                          <button onClick={() => setEditingBilling(null)} className="p-1 text-[var(--ink-subtle)] hover:bg-[var(--canvas-subtle)] rounded-[4px]"><X className="h-3 w-3" strokeWidth={1.5} /></button>
                        </div>
                      ) : (
                        <button onClick={() => {
                          setEditingBilling(ws.id);
                          setBillingAmount(ws.billing_amount ? (ws.billing_amount / 100).toFixed(2) : "");
                          setBillingCycle((ws.billing_cycle as "monthly" | "yearly") || "monthly");
                        }} className="text-xs text-[var(--ink-muted)] hover:text-[var(--accent)] transition">
                          {ws.billing_amount ? `$${(ws.billing_amount / 100).toFixed(2)}/${ws.billing_cycle === "yearly" ? "yr" : "mo"}` : "Set pricing"}
                        </button>
                      )}
                    </td>
                    <td className="py-3 px-4 text-[var(--ink-muted)]">{ws.user_count}</td>
                    <td className="py-3 px-4 text-[var(--accent)] text-xs">{fc}/7</td>
                    <td className="py-3 px-4 text-[var(--ink-subtle)] text-xs">{new Date(ws.created_at).toLocaleDateString()}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(ws.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-[4px] border border-[var(--rule)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas)] transition"
                          title={expanded.has(ws.id) ? "Hide members" : "Show members"}
                        >
                          {expanded.has(ws.id) ? <ChevronDown className="h-3 w-3" strokeWidth={1.5} /> : <ChevronRight className="h-3 w-3" strokeWidth={1.5} />}
                          <Users className="h-3 w-3" strokeWidth={1.5} />
                          <span>Members</span>
                        </button>
                        {addingUser === ws.id ? (
                          <div className="flex items-center gap-1"><input type="email" value={userEmail} onChange={e => setUserEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddUser(ws.id)} placeholder="email" className="px-2 py-1 text-xs rounded-[4px] bg-[var(--canvas)] border border-[var(--rule)] text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none w-36" autoFocus />
                            <button onClick={() => handleAddUser(ws.id)} disabled={submitting} className="p-1 text-[var(--verified)] hover:bg-[var(--canvas-subtle)] rounded-[4px] disabled:opacity-50">{submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} /> : <Check className="h-3.5 w-3.5" strokeWidth={1.5} />}</button>
                            <button onClick={() => { setAddingUser(null); setUserEmail(""); }} className="p-1 text-[var(--ink-subtle)] hover:bg-[var(--canvas-subtle)] rounded-[4px]"><X className="h-3.5 w-3.5" strokeWidth={1.5} /></button></div>
                        ) : <button onClick={() => setAddingUser(ws.id)} className="p-1.5 rounded-[4px] text-[var(--ink-subtle)] hover:text-[var(--accent)] hover:bg-[var(--canvas-subtle)]" title="Add user by email"><UserPlus className="h-4 w-4" strokeWidth={1.5} /></button>}
                        {confirmDelete === ws.id ? (
                          <div className="flex items-center gap-1"><span className="text-[10px] text-[var(--danger)]">Delete?</span>
                            <button onClick={() => handleDelete(ws.id)} disabled={deleting === ws.id} className="p-1 text-[var(--danger)] hover:bg-[var(--danger-soft)] rounded-[4px] disabled:opacity-50">{deleting === ws.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} /> : <Check className="h-3.5 w-3.5" strokeWidth={1.5} />}</button>
                            <button onClick={() => setConfirmDelete(null)} className="p-1 text-[var(--ink-subtle)] hover:bg-[var(--canvas-subtle)] rounded-[4px]"><X className="h-3.5 w-3.5" strokeWidth={1.5} /></button></div>
                        ) : <button onClick={() => setConfirmDelete(ws.id)} className="p-1.5 rounded-[4px] text-[var(--ink-subtle)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)]" title="Delete workspace"><Trash2 className="h-4 w-4" strokeWidth={1.5} /></button>}
                      </div>
                    </td>
                  </tr>
                  {expanded.has(ws.id) && (
                    <tr className="bg-[var(--canvas)] border-t border-[var(--rule)]">
                      <td colSpan={9} className="py-3 px-6">
                        {!ws.members || ws.members.length === 0 ? (
                          <div className="text-xs text-[var(--ink-muted)] py-2">No members.</div>
                        ) : (
                          <ul className="divide-y divide-[var(--rule)]">
                            {ws.members.map((m) => (
                              <li key={m.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm text-[var(--ink)]">{m.name || m.email || m.id.slice(0, 8)}</span>
                                    <span className={`text-[10px] mono uppercase tracking-wider ${m.role === "owner" ? "text-[var(--accent)]" : "text-[var(--ink-muted)]"}`}>{m.role}</span>
                                    {m.phone_verified && <span className="text-[10px] text-[var(--verified)]" title="Phone enrolled">● Phone</span>}
                                  </div>
                                  {m.email && m.name && <div className="text-[11px] text-[var(--ink-muted)] mt-0.5">{m.email}</div>}
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
