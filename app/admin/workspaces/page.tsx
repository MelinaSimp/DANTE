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
  Plus,
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
}

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [addingUser, setAddingUser] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

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

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/admin/workspaces", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setWorkspaces((prev) => [{ ...data, owner_name: null, owner_email: null, user_count: 0 }, ...prev]);
        setToast({ type: "success", message: `Created workspace "${data.name}"` });
        setNewName("");
        setShowCreate(false);
      } else {
        setToast({ type: "error", message: data.error || "Failed to create" });
      }
    } catch {
      setToast({ type: "error", message: "Network error" });
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  return (
    <div className="px-8 py-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <Building2 className="h-6 w-6 text-purple-500" />
          <h1 className="text-3xl font-bold text-white">All Workspaces</h1>
        </div>
        <p className="text-white/40 text-sm ml-9">
          {workspaces.length} workspace{workspaces.length !== 1 ? "s" : ""} registered
        </p>
      </div>

      <div className="rounded-2xl border border-purple-500/20 bg-black overflow-hidden">
        {workspaces.length === 0 ? (
          <div className="py-16 text-center">
            <Building2 className="h-8 w-8 text-white/10 mx-auto mb-3" />
            <p className="text-white/40 text-sm">No workspaces yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-purple-500/10">
                <tr className="text-left text-white/40 text-xs uppercase tracking-wider">
                  <th className="py-4 px-6 font-medium">Health</th>
                  <th className="py-4 px-4 font-medium">Workspace</th>
                  <th className="py-4 px-4 font-medium">Plan</th>
                  <th className="py-4 px-4 font-medium">Users</th>
                  <th className="py-4 px-4 font-medium">Features</th>
                  <th className="py-4 px-4 font-medium">Created</th>
                  <th className="py-4 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-500/5">
                {workspaces.map((ws) => {
                  const featureCount = (ws.enabled_features || []).length;
                  const health =
                    ws.user_count === 0 ? "error" : featureCount === 0 ? "warning" : "healthy";

                  const statusColor =
                    ws.plan_status === "active"
                      ? "text-green-400 bg-green-400/10 border-green-400/30"
                      : ws.plan_status === "trial"
                      ? "text-blue-400 bg-blue-400/10 border-blue-400/30"
                      : ws.plan_status === "past_due"
                      ? "text-yellow-400 bg-yellow-400/10 border-yellow-400/30"
                      : "text-red-400 bg-red-400/10 border-red-400/30";

                  return (
                    <tr key={ws.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="py-4 px-6">
                        {health === "healthy" ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : health === "warning" ? (
                          <AlertCircle className="h-4 w-4 text-yellow-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <div className="text-sm font-medium text-white">{ws.name}</div>
                        <div className="text-[11px] text-white/30">
                          {ws.owner_name || ws.owner_email || "Unknown"}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-medium border ${statusColor}`}
                        >
                          {ws.plan_status || "active"}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-white/60">{ws.user_count}</td>
                      <td className="py-4 px-4">
                        <span className="text-purple-500/80 text-xs">{featureCount}/7</span>
                      </td>
                      <td className="py-4 px-4 text-white/30 text-xs">
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
                                className="px-2 py-1 text-xs rounded-lg bg-white/5 border border-purple-500/20 text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/50 w-44"
                                autoFocus
                              />
                              <button
                                onClick={() => handleAddUser(ws.id)}
                                disabled={submitting}
                                className="p-1 rounded-lg text-green-400 hover:bg-green-400/10 transition disabled:opacity-50"
                              >
                                {submitting ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Check className="h-3.5 w-3.5" />
                                )}
                              </button>
                              <button
                                onClick={() => {
                                  setAddingUser(null);
                                  setUserEmail("");
                                }}
                                className="p-1 rounded-lg text-white/40 hover:bg-white/5 transition"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setAddingUser(ws.id)}
                              className="p-1.5 rounded-lg text-white/30 hover:text-purple-400 hover:bg-purple-500/10 transition opacity-0 group-hover:opacity-100"
                              title="Add user to workspace"
                            >
                              <UserPlus className="h-4 w-4" />
                            </button>
                          )}

                          {/* Delete */}
                          {confirmDelete === ws.id ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-red-400">Delete?</span>
                              <button
                                onClick={() => handleDelete(ws.id)}
                                disabled={deleting === ws.id}
                                className="p-1 rounded-lg text-red-400 hover:bg-red-400/10 transition disabled:opacity-50"
                              >
                                {deleting === ws.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Check className="h-3.5 w-3.5" />
                                )}
                              </button>
                              <button
                                onClick={() => setConfirmDelete(null)}
                                className="p-1 rounded-lg text-white/40 hover:bg-white/5 transition"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDelete(ws.id)}
                              className="p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-400/10 transition opacity-0 group-hover:opacity-100"
                              title="Delete workspace"
                            >
                              <Trash2 className="h-4 w-4" />
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
