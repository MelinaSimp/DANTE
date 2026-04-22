"use client";

import { useState, useEffect } from "react";
import { Loader2, Trash2, Copy, Check, Send } from "lucide-react";
import { reportError } from "@/lib/report-error";

interface Invite { id: string; email: string; workspace_id: string; workspace_name?: string; token: string; expires_at: string; used: boolean }
interface WsOption { id: string; name: string }

export default function InvitesAPanel() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [workspaces, setWorkspaces] = useState<WsOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [wsId, setWsId] = useState("");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/workspace-features", { credentials: "include" }).then(r => r.json()),
      fetch("/api/admin/invites", { credentials: "include" }).then(r => r.json()),
    ]).then(([wsList, invList]) => {
      const ws = Array.isArray(wsList) ? wsList.map((w: any) => ({ id: w.id, name: w.name })) : [];
      setWorkspaces(ws);
      const invs = Array.isArray(invList?.invites) ? invList.invites : [];
      setInvites(invs);
      if (ws.length > 0) setWsId(ws[0].id);
    }).catch(reportError("InvitesAPanel: load")).finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }, [toast]);

  const handleSend = async () => {
    if (!email.trim() || !wsId) return; setSending(true);
    try {
      const r = await fetch("/api/admin/invites", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ email: email.trim(), workspaceId: wsId }) });
      const d = await r.json();
      if (r.ok && d.invite) { setInvites(p => [d.invite, ...p]); setEmail(""); setToast({ type: "success", msg: "Invite sent" }); }
      else setToast({ type: "error", msg: d.error || "Failed" });
    } catch { setToast({ type: "error", msg: "Error" }); } finally { setSending(false); }
  };

  const handleDelete = async (id: string) => {
    try { const r = await fetch(`/api/admin/invites?id=${id}`, { method: "DELETE", credentials: "include" }); if (r.ok) setInvites(p => p.filter(i => i.id !== id)); }
    catch {}
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/auth?invite=${token}`;
    navigator.clipboard.writeText(url);
    setCopied(token); setTimeout(() => setCopied(null), 1500);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-[var(--ink-subtle)]" strokeWidth={1.5} /></div>;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {toast && <div className={`fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-[6px] text-sm font-medium shadow-lg border ${toast.type === "success" ? "bg-[var(--canvas-subtle)] border-[var(--rule)] text-[var(--verified)]" : "bg-[var(--danger-soft)] border-[var(--rule)] text-[var(--danger)]"}`}>{toast.msg}</div>}

      {/* Send form */}
      <div className="rounded-[6px] border border-[var(--rule)] bg-[var(--canvas-subtle)] p-5 mb-6">
        <p className="text-sm font-medium text-[var(--ink)] mb-3">Send Invite</p>
        <div className="flex gap-2">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@email.com"
            className="flex-1 px-3 py-2 rounded-[4px] bg-[var(--canvas)] border border-[var(--rule)] text-[var(--ink)] text-sm placeholder:text-[var(--ink-subtle)] focus:outline-none focus:border-[var(--rule-strong)]" />
          <select value={wsId} onChange={e => setWsId(e.target.value)}
            className="px-3 py-2 rounded-[4px] bg-[var(--canvas)] border border-[var(--rule)] text-[var(--ink)] text-sm focus:outline-none">
            {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <button onClick={handleSend} disabled={sending || !email.trim()}
            className="px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-medium hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} /> : <Send className="h-4 w-4" strokeWidth={1.5} />}Send
          </button>
        </div>
      </div>

      {/* List */}
      {invites.length === 0 ? (
        <div className="text-center py-12 text-[var(--ink-subtle)] text-sm">No invites yet</div>
      ) : (
        <div className="space-y-2">
          {invites.map(inv => {
            const expired = new Date(inv.expires_at) < new Date();
            return (
              <div key={inv.id} className="flex items-center justify-between rounded-[6px] border border-[var(--rule)] bg-[var(--canvas-subtle)] px-4 py-3">
                <div>
                  <div className="text-sm text-[var(--ink)] font-medium">{inv.email}</div>
                  <div className="text-[11px] text-[var(--ink-subtle)]">{inv.workspace_name || "—"} · {expired ? <span className="text-[var(--danger)]">Expired</span> : <span className="text-[var(--verified)]">Pending</span>}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => copyLink(inv.token)} className="p-1.5 rounded-[4px] text-[var(--ink-subtle)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)]">
                    {copied === inv.token ? <Check className="h-3.5 w-3.5 text-[var(--verified)]" strokeWidth={1.5} /> : <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />}
                  </button>
                  <button onClick={() => handleDelete(inv.id)} className="p-1.5 rounded-[4px] text-[var(--ink-subtle)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)]"><Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
