"use client";

// TeamClient — interactive roster + invite minter.
//
// Layout follows the rest of /settings: editorial heading, max-w-3xl,
// card-flat sections, label-section uppercase kickers. Two sections:
//
//   1. Members — name / email / role / phone-enrolled badge / Remove
//      (Remove only visible to owners + admins, never on self).
//   2. Pending invites — token preview, copy-link button, Cancel
//      (also owner/admin-only).
//
// Invite modal is a small inline form: optional email lock + expiry
// dropdown (1 / 7 / 30 days). On submit, returns the URL which we
// surface in a "Copy link" pill the owner sends out-of-band.

import { useEffect, useState } from "react";
import {
  Loader2,
  Mail,
  Phone,
  Trash2,
  Copy,
  CheckCircle2,
  UserPlus,
  ShieldCheck,
  X,
} from "lucide-react";

interface Member {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  phone_verified: boolean;
  created_at: string;
  last_seen_at: string | null;
}

interface Invite {
  id: string;
  email: string | null;
  token: string;
  expires_at: string | null;
  created_at: string;
}

interface MembersResponse {
  self_id: string;
  self_role: string;
  members: Member[];
  invites: Invite[];
}

const isOwnerOrAdmin = (role: string | null | undefined) =>
  role === "owner" || role === "admin";

export default function TeamClient() {
  const [data, setData] = useState<MembersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite modal state
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteExpiry, setInviteExpiry] = useState<1 | 7 | 30>(7);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ link: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  async function load() {
    try {
      const r = await fetch("/api/workspace/members", {
        credentials: "include",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData((await r.json()) as MembersResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load team");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteSubmitting(true);
    setError(null);
    try {
      const r = await fetch("/api/workspace/members/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: inviteEmail.trim() || null,
          expires_in_days: inviteExpiry,
        }),
      });
      const json = (await r.json()) as { link?: string; error?: string };
      if (!r.ok || !json.link) throw new Error(json.error || `HTTP ${r.status}`);
      setInviteResult({ link: json.link });
      // Refresh roster so the new pending-invite row appears.
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create invite");
    } finally {
      setInviteSubmitting(false);
    }
  }

  function resetInviteModal() {
    setShowInvite(false);
    setInviteEmail("");
    setInviteExpiry(7);
    setInviteResult(null);
    setCopied(false);
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy. Select and copy manually.");
    }
  }

  async function removeMember(id: string, name: string | null) {
    const ok = confirm(
      `Remove ${name || "this member"} from the workspace? They'll lose access immediately.`,
    );
    if (!ok) return;
    try {
      const r = await fetch(`/api/workspace/members/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `HTTP ${r.status}`);
      }
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove member");
    }
  }

  async function cancelInvite(id: string) {
    try {
      const r = await fetch(`/api/workspace/invites/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `HTTP ${r.status}`);
      }
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to cancel invite");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2
          className="w-5 h-5 animate-spin text-[var(--ink-subtle)]"
          strokeWidth={1.5}
        />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen p-10 text-sm text-[var(--ink-muted)]">
        {error || "Couldn't load the team."}
      </div>
    );
  }

  const canManage = isOwnerOrAdmin(data.self_role);

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <div className="max-w-3xl mx-auto px-6 md:px-10 py-10 space-y-8">
        <div>
          <div className="label-section mb-1">Settings</div>
          <h1 className="heading-display text-3xl">Team</h1>
          <p className="prose-body text-[var(--ink-muted)] mt-1.5 max-w-prose">
            Invite teammates to share this workspace. Each member enrolls
            their own phone in <span className="mono">Settings → SMS</span>{" "}
            so workflows can text everyone on the team.
          </p>
        </div>

        {error && (
          <div className="text-xs px-3 py-2 rounded-[4px] flex items-center gap-2 bg-[var(--danger-soft)] text-[var(--danger)]">
            {error}
            <button
              type="button"
              onClick={() => setError(null)}
              className="ml-auto opacity-50 hover:opacity-100"
              aria-label="Dismiss"
            >
              <X className="w-3 h-3" strokeWidth={1.5} />
            </button>
          </div>
        )}

        {/* Members */}
        <section className="card-flat p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="label-section mb-1">Members</div>
              <h2 className="text-lg font-medium">
                {data.members.length}{" "}
                {data.members.length === 1 ? "person" : "people"} in this
                workspace
              </h2>
            </div>
            {canManage && (
              <button
                type="button"
                onClick={() => setShowInvite(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] hover:opacity-90"
              >
                <UserPlus className="w-3.5 h-3.5" strokeWidth={1.5} />
                Invite teammate
              </button>
            )}
          </div>

          <ul className="divide-y divide-[var(--rule)]">
            {data.members.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {m.name || m.email || m.id.slice(0, 8)}
                    </span>
                    {m.role === "owner" && (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] mono uppercase tracking-wider text-[var(--accent)]"
                        title="Workspace owner"
                      >
                        <ShieldCheck
                          className="w-3 h-3"
                          strokeWidth={1.5}
                        />
                        Owner
                      </span>
                    )}
                    {m.role === "admin" && (
                      <span className="text-[10px] mono uppercase tracking-wider text-[var(--ink-muted)]">
                        Admin
                      </span>
                    )}
                    {m.id === data.self_id && (
                      <span className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)]">
                        You
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-[11px] text-[var(--ink-muted)]">
                    {m.email && (
                      <span className="inline-flex items-center gap-1">
                        <Mail className="w-3 h-3" strokeWidth={1.5} />
                        {m.email}
                      </span>
                    )}
                    <span
                      className={`inline-flex items-center gap-1 ${m.phone_verified ? "" : "opacity-60"}`}
                      title={
                        m.phone_verified
                          ? "Phone enrolled — workflows can text this member"
                          : "No phone enrolled yet"
                      }
                    >
                      <Phone className="w-3 h-3" strokeWidth={1.5} />
                      {m.phone_verified ? "Phone enrolled" : "No phone"}
                    </span>
                  </div>
                </div>
                {canManage && m.id !== data.self_id && (
                  <button
                    type="button"
                    onClick={() => removeMember(m.id, m.name)}
                    className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] transition"
                    aria-label={`Remove ${m.name || "member"}`}
                    title="Remove from workspace"
                  >
                    <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>

        {/* Pending invites */}
        {(data.invites.length > 0 || canManage) && (
          <section className="card-flat p-6 space-y-3">
            <div className="label-section">Pending invites</div>
            {data.invites.length === 0 ? (
              <p className="text-xs text-[var(--ink-muted)]">
                No outstanding invites. Generate one by clicking{" "}
                <span className="mono">Invite teammate</span> above.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--rule)]">
                {data.invites.map((inv) => {
                  const link = `${window.location.origin}/auth/signup?token=${inv.token}`;
                  return (
                    <li
                      key={inv.id}
                      className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium mono">
                          {inv.token}
                        </div>
                        <div className="text-[11px] text-[var(--ink-muted)] mt-0.5">
                          {inv.email
                            ? `Locked to ${inv.email} · `
                            : "Open to anyone with the link · "}
                          {inv.expires_at
                            ? `expires ${new Date(inv.expires_at).toLocaleDateString()}`
                            : "no expiry"}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void copyLink(link)}
                        className="text-[11px] px-2 py-1 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] inline-flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" strokeWidth={1.5} />
                        Copy link
                      </button>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => cancelInvite(inv.id)}
                          className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] transition"
                          aria-label="Cancel invite"
                          title="Cancel invite"
                        >
                          <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </div>

      {/* Invite modal */}
      {showInvite && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => !inviteSubmitting && resetInviteModal()}
        >
          <div
            className="w-full max-w-md card-flat p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--canvas)" }}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="label-section mb-1">Invite</div>
                <h3 className="heading-display text-xl">
                  {inviteResult ? "Invite ready" : "Add a teammate"}
                </h3>
              </div>
              <button
                type="button"
                onClick={resetInviteModal}
                className="p-1 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                aria-label="Close"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            {!inviteResult ? (
              <form onSubmit={submitInvite} className="space-y-3">
                <p className="text-xs text-[var(--ink-muted)]">
                  Copy the generated link and send it to your teammate. They'll
                  redeem it to join this workspace.
                </p>
                <div>
                  <label className="label-section mb-1.5 block text-[var(--ink-muted)]">
                    Lock to email (optional)
                  </label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="teammate@example.com"
                    className="w-full px-3 py-2 text-sm rounded-[4px] outline-none"
                    style={{
                      border: "1px solid var(--rule)",
                      background: "var(--canvas)",
                      color: "var(--ink)",
                    }}
                  />
                  <p className="text-[10px] text-[var(--ink-subtle)] mt-1">
                    Leave blank to make the link redeemable from any email.
                  </p>
                </div>
                <div>
                  <label className="label-section mb-1.5 block text-[var(--ink-muted)]">
                    Expires in
                  </label>
                  <select
                    value={inviteExpiry}
                    onChange={(e) =>
                      setInviteExpiry(Number(e.target.value) as 1 | 7 | 30)
                    }
                    className="w-full px-3 py-2 text-sm rounded-[4px] outline-none"
                    style={{
                      border: "1px solid var(--rule)",
                      background: "var(--canvas)",
                      color: "var(--ink)",
                    }}
                  >
                    <option value={1}>24 hours</option>
                    <option value={7}>7 days</option>
                    <option value={30}>30 days</option>
                  </select>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={resetInviteModal}
                    className="px-3 py-2 text-xs rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={inviteSubmitting}
                    className="px-3 py-2 text-xs rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    {inviteSubmitting ? (
                      <Loader2
                        className="w-3 h-3 animate-spin"
                        strokeWidth={1.5}
                      />
                    ) : null}
                    Generate link
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-[var(--ink-muted)]">
                  Send this link to your teammate. They'll create their account
                  and land in this workspace.
                </p>
                <div
                  className="text-xs mono break-all p-3 rounded-[4px]"
                  style={{
                    background: "var(--canvas-subtle)",
                    border: "1px solid var(--rule)",
                  }}
                >
                  {inviteResult.link}
                </div>
                <div className="flex justify-between items-center pt-1">
                  <button
                    type="button"
                    onClick={() => void copyLink(inviteResult.link)}
                    className="px-3 py-2 text-xs rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] hover:opacity-90 inline-flex items-center gap-1.5"
                  >
                    {copied ? (
                      <>
                        <CheckCircle2
                          className="w-3 h-3"
                          strokeWidth={1.5}
                        />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" strokeWidth={1.5} />
                        Copy link
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={resetInviteModal}
                    className="px-3 py-2 text-xs rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
