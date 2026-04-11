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
      setWorkspaces(Array.isArray(wsList) ? wsList.map((w: any) => ({ id: w.id, name: w.name })) : []);
      setInvites(Array.isArray(invList) ? invList : []);
      if (Array.isArray(wsList) && wsList.length > 0) setWsId(wsList[0].id);
    }).catch(reportError("InvitesAPanel: load")).finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }, [toast]);

  const handleSend = async () => {
    if (!email.trim() || !wsId) return; setSending(true);
    try {
      const r = await fetch("/api/admin/invites", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ email: email.trim(), workspace_id: wsId }) });
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

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin text-white/40" /></div>;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {toast && <div className={`fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-xl text-sm font-medium shadow-lg border ${toast.type === "success" ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>{toast.msg}</div>}

      {/* Send form */}
      <div className="rounded-2xl border border-purple-500/20 bg-black/40 p-5 mb-6">
        <p className="text-sm font-medium text-white mb-3">Send Invite</p>
        <div className="flex gap-2">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@email.com"
            className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-purple-500/20 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-purple-500/50" />
          <select value={wsId} onChange={e => setWsId(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white/5 border border-purple-500/20 text-white text-sm focus:outline-none">
            {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <button onClick={handleSend} disabled={sending || !email.trim()}
            className="px-4 py-2 rounded-xl bg-purple-500 text-white text-sm font-medium hover:bg-purple-600 disabled:opacity-40 flex items-center gap-1.5">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send
          </button>
        </div>
      </div>

      {/* List */}
      {invites.length === 0 ? (
        <div className="text-center py-12 text-white/30 text-sm">No invites yet</div>
      ) : (
        <div className="space-y-2">
          {invites.map(inv => {
            const expired = new Date(inv.expires_at) < new Date();
            return (
              <div key={inv.id} className="flex items-center justify-between rounded-xl border border-purple-500/10 bg-black/30 px-4 py-3">
                <div>
                  <div className="text-sm text-white font-medium">{inv.email}</div>
                  <div className="text-[11px] text-white/30">{inv.workspace_name || "—"} · {expired ? <span className="text-red-400">Expired</span> : <span className="text-green-400">Pending</span>}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => copyLink(inv.token)} className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/5">
                    {copied === inv.token ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                  <button onClick={() => handleDelete(inv.id)} className="p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-400/10"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
