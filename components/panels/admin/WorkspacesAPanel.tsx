"use client";

import { useState, useEffect } from "react";
import { Building2, CheckCircle2, AlertCircle, XCircle, Trash2, UserPlus, Loader2, X, Check, DollarSign } from "lucide-react";

interface Workspace {
  id: string; name: string; created_at: string; owner_id: string; enabled_features: string[];
  plan_status: string; owner_name: string | null; owner_email: string | null; user_count: number;
  billing_amount: number | null; billing_cycle: string | null;
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
  const [editingBilling, setEditingBilling] = useState<string | null>(null);
  const [billingAmount, setBillingAmount] = useState("");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [savingBilling, setSavingBilling] = useState(false);

  useEffect(() => {
    fetch("/api/admin/workspaces", { credentials: "include" }).then(r => r.ok ? r.json() : []).then(d => setWorkspaces(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setLoading(false));
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

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-white/40" /></div>;

  return (
    <div className="p-4">
      {toast && <div className={`fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-xl text-sm font-medium shadow-lg border ${toast.type === "success" ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>{toast.message}</div>}
      {workspaces.length === 0 ? (
        <div className="text-center py-16"><Building2 className="h-8 w-8 text-white/10 mx-auto mb-3" /><p className="text-white/40 text-sm">No workspaces</p></div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-purple-500/20 bg-black/40">
          <table className="w-full text-sm">
            <thead className="border-b border-purple-500/10"><tr className="text-left text-white/40 text-xs uppercase tracking-wider">
              <th className="py-3 px-4 font-medium">Health</th><th className="py-3 px-4 font-medium">Workspace</th><th className="py-3 px-4 font-medium">Plan</th>
              <th className="py-3 px-4 font-medium">Billing</th><th className="py-3 px-4 font-medium">Users</th><th className="py-3 px-4 font-medium">Features</th><th className="py-3 px-4 font-medium">Created</th><th className="py-3 px-4 font-medium text-right">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-purple-500/5">
              {workspaces.map(ws => {
                const fc = (ws.enabled_features || []).length;
                const health = ws.user_count === 0 ? "error" : fc === 0 ? "warning" : "healthy";
                const sc = ws.plan_status === "active" ? "text-green-400 bg-green-400/10 border-green-400/30" : ws.plan_status === "trial" ? "text-blue-400 bg-blue-400/10 border-blue-400/30" : "text-red-400 bg-red-400/10 border-red-400/30";
                return (
                  <tr key={ws.id} className="hover:bg-white/[0.02] group">
                    <td className="py-3 px-4">{health === "healthy" ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : health === "warning" ? <AlertCircle className="h-4 w-4 text-yellow-500" /> : <XCircle className="h-4 w-4 text-red-500" />}</td>
                    <td className="py-3 px-4"><div className="text-sm font-medium text-white">{ws.name}</div><div className="text-[11px] text-white/30">{ws.owner_name || ws.owner_email || "Unknown"}</div></td>
                    <td className="py-3 px-4"><span className={`px-2 py-0.5 rounded-md text-[10px] font-medium border ${sc}`}>{ws.plan_status || "active"}</span></td>
                    <td className="py-3 px-4">
                      {editingBilling === ws.id ? (
                        <div className="flex items-center gap-1.5">
                          <div className="relative">
                            <DollarSign className="absolute left-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-white/30" />
                            <input type="number" value={billingAmount} onChange={e => setBillingAmount(e.target.value)} placeholder="0.00" min="0" step="0.01"
                              className="w-20 pl-5 pr-1 py-1 text-xs rounded-lg bg-white/5 border border-purple-500/20 text-white placeholder:text-white/30 focus:outline-none" autoFocus />
                          </div>
                          <select value={billingCycle} onChange={e => setBillingCycle(e.target.value as "monthly" | "yearly")}
                            className="px-1 py-1 text-[10px] rounded-lg bg-white/5 border border-purple-500/20 text-white focus:outline-none">
                            <option value="monthly">Mo</option>
                            <option value="yearly">Yr</option>
                          </select>
                          <button onClick={() => handleSaveBilling(ws.id)} disabled={savingBilling} className="p-1 text-green-400 hover:bg-green-400/10 rounded-lg disabled:opacity-50">
                            {savingBilling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                          </button>
                          <button onClick={() => setEditingBilling(null)} className="p-1 text-white/40 hover:bg-white/5 rounded-lg"><X className="h-3 w-3" /></button>
                        </div>
                      ) : (
                        <button onClick={() => {
                          setEditingBilling(ws.id);
                          setBillingAmount(ws.billing_amount ? (ws.billing_amount / 100).toFixed(2) : "");
                          setBillingCycle((ws.billing_cycle as "monthly" | "yearly") || "monthly");
                        }} className="text-xs text-white/50 hover:text-purple-400 transition">
                          {ws.billing_amount ? `$${(ws.billing_amount / 100).toFixed(2)}/${ws.billing_cycle === "yearly" ? "yr" : "mo"}` : "Set pricing"}
                        </button>
                      )}
                    </td>
                    <td className="py-3 px-4 text-white/60">{ws.user_count}</td>
                    <td className="py-3 px-4 text-purple-500/80 text-xs">{fc}/7</td>
                    <td className="py-3 px-4 text-white/30 text-xs">{new Date(ws.created_at).toLocaleDateString()}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        {addingUser === ws.id ? (
                          <div className="flex items-center gap-1"><input type="email" value={userEmail} onChange={e => setUserEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddUser(ws.id)} placeholder="email" className="px-2 py-1 text-xs rounded-lg bg-white/5 border border-purple-500/20 text-white placeholder:text-white/30 focus:outline-none w-36" autoFocus />
                            <button onClick={() => handleAddUser(ws.id)} disabled={submitting} className="p-1 text-green-400 hover:bg-green-400/10 rounded-lg disabled:opacity-50">{submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}</button>
                            <button onClick={() => { setAddingUser(null); setUserEmail(""); }} className="p-1 text-white/40 hover:bg-white/5 rounded-lg"><X className="h-3.5 w-3.5" /></button></div>
                        ) : <button onClick={() => setAddingUser(ws.id)} className="p-1.5 rounded-lg text-white/30 hover:text-purple-400 hover:bg-purple-500/10 opacity-0 group-hover:opacity-100"><UserPlus className="h-4 w-4" /></button>}
                        {confirmDelete === ws.id ? (
                          <div className="flex items-center gap-1"><span className="text-[10px] text-red-400">Delete?</span>
                            <button onClick={() => handleDelete(ws.id)} disabled={deleting === ws.id} className="p-1 text-red-400 hover:bg-red-400/10 rounded-lg disabled:opacity-50">{deleting === ws.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}</button>
                            <button onClick={() => setConfirmDelete(null)} className="p-1 text-white/40 hover:bg-white/5 rounded-lg"><X className="h-3.5 w-3.5" /></button></div>
                        ) : <button onClick={() => setConfirmDelete(ws.id)} className="p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100"><Trash2 className="h-4 w-4" /></button>}
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
  );
}
