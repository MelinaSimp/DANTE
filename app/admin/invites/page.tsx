"use client";

import { useEffect, useState } from "react";
import { UserPlus, Building2, Trash2, Loader2, Copy, Check, Mail } from "lucide-react";

interface Workspace {
  id: string;
  name: string;
  created_at: string;
  owner_id: string;
}

interface Invite {
  id: string;
  token: string;
  email: string;
  company_id: string;
  expires_at: string;
  created_at: string;
}

export default function InvitesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/workspace-features", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/admin/invites", { credentials: "include" }).then((r) => r.json()),
    ]).then(([wsData, invData]) => {
      setWorkspaces(wsData.workspaces || []);
      setInvites(invData.invites || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !workspaceId) return;
    setSending(true);
    try {
      const res = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, workspaceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send invite");
      setInvites((prev) => [data.invite, ...prev]);
      setEmail("");
      showToast("success", `Invite sent to ${email}`);
    } catch (err: any) {
      showToast("error", err.message);
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/invites?id=${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete");
      setInvites((prev) => prev.filter((inv) => inv.id !== id));
    } catch (err: any) {
      showToast("error", err.message);
    }
  };

  const handleCopy = (token: string, id: string) => {
    const appUrl = typeof window !== "undefined" ? window.location.origin : "";
    navigator.clipboard.writeText(`${appUrl}/auth/signup?token=${token}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date();

  const wsName = (companyId: string) => workspaces.find((w) => w.id === companyId)?.name || "Unknown";

  if (loading) {
    return (
      <div className="px-8 py-8 max-w-5xl mx-auto flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 text-purple-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-8 py-8 max-w-5xl mx-auto">
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-lg ${toast.type === "success" ? "bg-green-500/90 text-white" : "bg-red-500/90 text-white"}`}>
          {toast.msg}
        </div>
      )}

      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <UserPlus className="h-6 w-6 text-purple-500" />
          <h1 className="text-3xl font-bold text-white">Manage Invites</h1>
        </div>
        <p className="text-white/40 text-sm ml-9">Create and manage workspace invitations</p>
      </div>

      <div className="mb-8 rounded-2xl border border-purple-500/20 bg-black p-6">
        <h2 className="text-lg font-semibold text-white mb-5">Send Invitation</h2>
        <form onSubmit={handleSendInvite} className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-white/50 uppercase tracking-wider">
              Email Address
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-xl border border-purple-500/20 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500/40 transition"
              placeholder="user@example.com"
            />
          </div>
          <div>
            <label htmlFor="workspace" className="mb-1.5 block text-xs font-medium text-white/50 uppercase tracking-wider">
              Workspace
            </label>
            <select
              id="workspace"
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              required
              className="w-full rounded-xl border border-purple-500/20 bg-white/5 px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500/40 transition"
            >
              <option value="">Select a workspace</option>
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>{ws.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={sending}
              className="w-full rounded-xl bg-purple-500 px-6 py-2.5 text-sm font-semibold text-black hover:bg-purple-400 transition-all shadow-lg shadow-purple-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              {sending ? "Sending..." : "Send Invitation"}
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-2xl border border-purple-500/20 bg-black overflow-hidden">
        <div className="px-6 py-5 border-b border-purple-500/10">
          <h2 className="text-lg font-semibold text-white">Pending Invites</h2>
        </div>
        {invites.length === 0 ? (
          <div className="py-16 text-center">
            <Building2 className="h-8 w-8 text-white/10 mx-auto mb-3" />
            <p className="text-white/40 text-sm">No invites sent yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-purple-500/10">
                <tr className="text-left text-white/40 text-xs uppercase tracking-wider">
                  <th className="py-4 px-6 font-medium">Email</th>
                  <th className="py-4 px-4 font-medium">Workspace</th>
                  <th className="py-4 px-4 font-medium">Token</th>
                  <th className="py-4 px-4 font-medium">Status</th>
                  <th className="py-4 px-4 font-medium">Created</th>
                  <th className="py-4 px-4 font-medium w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-500/5">
                {invites.map((inv) => {
                  const expired = isExpired(inv.expires_at);
                  return (
                    <tr key={inv.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-4 px-6 font-medium text-white">{inv.email}</td>
                      <td className="py-4 px-4 text-white/50">{wsName(inv.company_id)}</td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <code className="text-xs text-purple-400/80 bg-purple-500/10 px-2 py-0.5 rounded">{inv.token}</code>
                          <button onClick={() => handleCopy(inv.token, inv.id)} className="text-white/30 hover:text-white transition-colors">
                            {copiedId === inv.id ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${expired ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"}`}>
                          {expired ? "Expired" : "Pending"}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-white/30 text-xs">{new Date(inv.created_at).toLocaleDateString()}</td>
                      <td className="py-4 px-4">
                        <button onClick={() => handleDelete(inv.id)} className="text-white/20 hover:text-red-400 transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
