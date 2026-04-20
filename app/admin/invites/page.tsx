"use client";

import { useEffect, useState } from "react";
import { Building2, Trash2, Loader2, Copy, Check, Mail } from "lucide-react";

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
    ])
      .then(([wsData, invData]) => {
        setWorkspaces(wsData.workspaces || []);
        setInvites(invData.invites || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
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
      const res = await fetch(`/api/admin/invites?id=${id}`, {
        method: "DELETE",
        credentials: "include",
      });
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

  const wsName = (companyId: string) =>
    workspaces.find((w) => w.id === companyId)?.name || "Unknown";

  const inputClass =
    "w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none focus:border-[var(--accent)] transition";

  if (loading) {
    return (
      <div className="px-8 py-8 max-w-5xl mx-auto flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 text-[var(--ink-subtle)] animate-spin" strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <div className="px-8 py-8 max-w-5xl mx-auto">
      {toast && (
        <div
          className="fixed top-6 right-6 z-50 px-4 py-3 rounded-[4px] text-sm font-medium card-flat"
          style={{
            background:
              toast.type === "success" ? "var(--verified-soft)" : "var(--danger-soft)",
            borderColor: toast.type === "success" ? "var(--verified)" : "var(--danger)",
            color: toast.type === "success" ? "var(--verified)" : "var(--danger)",
          }}
        >
          {toast.msg}
        </div>
      )}

      <div className="mb-8">
        <div className="label-section mb-2">Admin</div>
        <h1 className="heading-display text-4xl text-[var(--ink)] mb-1">Manage invites</h1>
        <p className="text-[var(--ink-muted)] text-sm">
          Create and manage workspace invitations.
        </p>
      </div>

      <div className="mb-8 card-flat p-5">
        <h2 className="text-base font-medium text-[var(--ink)] mb-5">Send invitation</h2>
        <form onSubmit={handleSendInvite} className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <div>
            <label htmlFor="email" className="label-section mb-1.5 block">
              Email address
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={inputClass}
              placeholder="user@example.com"
            />
          </div>
          <div>
            <label htmlFor="workspace" className="label-section mb-1.5 block">
              Workspace
            </label>
            <select
              id="workspace"
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              required
              className={inputClass}
            >
              <option value="">Select a workspace</option>
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={sending}
              className="w-full rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-40 transition flex items-center justify-center gap-2"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
              ) : (
                <Mail className="h-4 w-4" strokeWidth={1.5} />
              )}
              {sending ? "Sending..." : "Send invitation"}
            </button>
          </div>
        </form>
      </div>

      <div className="card-flat overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--rule)]">
          <h2 className="text-base font-medium text-[var(--ink)]">Pending invites</h2>
        </div>
        {invites.length === 0 ? (
          <div className="py-16 text-center">
            <Building2
              className="h-8 w-8 text-[var(--ink-subtle)] mx-auto mb-3"
              strokeWidth={1.5}
            />
            <p className="text-[var(--ink-muted)] text-sm">No invites sent yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--rule)]">
                <tr>
                  <th className="label-section text-left px-4 py-2">Email</th>
                  <th className="label-section text-left px-4 py-2">Workspace</th>
                  <th className="label-section text-left px-4 py-2">Token</th>
                  <th className="label-section text-left px-4 py-2">Status</th>
                  <th className="label-section text-left px-4 py-2">Created</th>
                  <th className="label-section text-left px-4 py-2 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {invites.map((inv) => {
                  const expired = isExpired(inv.expires_at);
                  return (
                    <tr
                      key={inv.id}
                      className="border-b border-[var(--rule)] hover:bg-[var(--canvas-subtle)] transition-colors"
                    >
                      <td className="py-3 px-4 font-medium text-[var(--ink)]">{inv.email}</td>
                      <td className="py-3 px-4 text-[var(--ink-muted)]">
                        {wsName(inv.company_id)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <code className="text-xs text-[var(--accent)] bg-[var(--accent-soft)] px-2 py-0.5 rounded-[4px] mono">
                            {inv.token}
                          </code>
                          <button
                            onClick={() => handleCopy(inv.token, inv.id)}
                            className="text-[var(--ink-subtle)] hover:text-[var(--ink)] transition-colors"
                          >
                            {copiedId === inv.id ? (
                              <Check
                                className="h-3.5 w-3.5"
                                strokeWidth={1.5}
                                style={{ color: "var(--verified)" }}
                              />
                            ) : (
                              <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className="inline-block px-2 py-0.5 rounded-[4px] text-xs font-medium"
                          style={{
                            background: expired ? "var(--danger-soft)" : "var(--verified-soft)",
                            color: expired ? "var(--danger)" : "var(--verified)",
                          }}
                        >
                          {expired ? "Expired" : "Pending"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[var(--ink-subtle)] text-xs mono">
                        {new Date(inv.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => handleDelete(inv.id)}
                          className="text-[var(--ink-subtle)] hover:text-[var(--danger)] transition-colors"
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={1.5} />
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
