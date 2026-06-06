"use client";

// Settings → Zoom integration panel.
//
// Admin-only — writes go through /api/zoom/credentials which rejects
// non-admins. We still hide the write path behind `isAdmin` to avoid
// showing a form that'll 403 on submit.
//
// Two modes:
//   Not connected: show setup form (Account ID / Client ID / Client
//     Secret / Webhook Secret Token) with a link to Zoom Marketplace.
//   Connected: show which Zoom account is linked, the per-workspace
//     webhook URL for the advisor to paste into Zoom, and a disconnect
//     button.

import { useCallback, useEffect, useState } from "react";
import {
  Video,
  CheckCircle2,
  AlertCircle,
  Copy,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm-dialog";

type Status = {
  connected: boolean;
  account_id?: string;
  zoom_user_email?: string | null;
  zoom_account_type?: string | null;
  updated_at?: string;
};

interface Props {
  isAdmin: boolean;
  workspaceId: string;
}

export default function ZoomCard({ isAdmin, workspaceId }: Props) {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/zoom/credentials", { cache: "no-store" });
      if (res.ok) setStatus(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/zoom/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: accountId.trim(),
          client_id: clientId.trim(),
          client_secret: clientSecret.trim(),
          webhook_secret: webhookSecret.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't save credentials");
        return;
      }
      toast.success(`Connected to Zoom as ${data.zoom_user_email || "your account"}`);
      setAccountId("");
      setClientId("");
      setClientSecret("");
      setWebhookSecret("");
      await refresh();
    } catch (err: any) {
      setError(err?.message || "Network error");
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    const ok = await confirmDialog({
      title: "Disconnect Zoom?",
      message:
        "New client meetings won't be able to launch Zoom calls. Your past recordings stay intact.",
      confirmText: "Disconnect",
    });
    if (!ok) return;
    const res = await fetch("/api/zoom/credentials", { method: "DELETE" });
    if (res.ok) {
      toast.success("Zoom disconnected");
      await refresh();
    } else {
      toast.error("Couldn't disconnect — try again");
    }
  };

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/zoom/webhook/${workspaceId}`
      : `/api/zoom/webhook/${workspaceId}`;

  const copyWebhookUrl = async () => {
    await navigator.clipboard.writeText(webhookUrl);
    toast.success("Webhook URL copied");
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
        <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
        Loading Zoom status…
      </div>
    );
  }

  if (status?.connected) {
    return (
      <div className="space-y-6">
        <div className="border border-[var(--rule)] rounded-[4px] p-4 bg-[var(--canvas-subtle)]">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5" strokeWidth={1.5} />
            <div className="flex-1">
              <div className="text-sm font-medium text-[var(--ink)]">
                Connected to Zoom
              </div>
              <div className="text-sm text-[var(--ink-muted)] mt-0.5">
                {status.zoom_user_email || "Zoom account"}
                {status.zoom_account_type ? ` · ${status.zoom_account_type}` : ""}
              </div>
            </div>
            {isAdmin && (
              <button
                onClick={disconnect}
                className="text-sm text-[var(--ink-muted)] hover:text-red-600 transition"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>

        <div className="border border-[var(--rule)] rounded-[4px] p-4">
          <div className="label-section mb-2">Webhook URL</div>
          <p className="text-sm text-[var(--ink-muted)] mb-3">
            In your Zoom app's <span className="font-medium">Feature</span> tab, turn on
            Event Subscriptions and paste this URL. Subscribe to{" "}
            <code className="text-xs bg-[var(--canvas-subtle)] px-1 py-0.5 rounded">
              recording.completed
            </code>
            .
          </p>
          <div className="flex gap-2">
            <code className="flex-1 text-xs bg-[var(--canvas-subtle)] px-3 py-2 rounded-[4px] overflow-x-auto">
              {webhookUrl}
            </code>
            <button
              onClick={copyWebhookUrl}
              className="inline-flex items-center gap-1 px-3 py-2 text-sm border border-[var(--rule)] rounded-[4px] hover:bg-[var(--canvas-subtle)]"
            >
              <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />
              Copy
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="border border-[var(--rule)] rounded-[4px] p-4">
        <div className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
          <AlertCircle className="w-4 h-4" strokeWidth={1.5} />
          Ask a workspace admin to connect Zoom.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="border border-[var(--rule)] rounded-[4px] p-4 bg-[var(--canvas-subtle)]">
        <div className="flex items-start gap-3">
          <Video className="w-5 h-5 text-[var(--ink-muted)] mt-0.5" strokeWidth={1.5} />
          <div className="text-sm text-[var(--ink-muted)]">
            <p>
              Connect a <span className="font-medium text-[var(--ink)]">Zoom Pro</span> (or higher) account to
              launch cloud-recorded meetings directly from Drift. Recordings
              auto-transcribe into the contact timeline once the meeting ends.
            </p>
            <p className="mt-2">
              You'll need to create a{" "}
              <span className="font-medium">Server-to-Server OAuth app</span> in
              Zoom Marketplace.{" "}
              <a
                href="https://marketplace.zoom.us/develop/create"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-[var(--accent)] hover:underline"
              >
                Open Zoom Marketplace
                <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
              </a>
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Account ID"
          help="App Credentials → Account ID"
          value={accountId}
          onChange={setAccountId}
          placeholder="e.g. Ab12CdEfGhIjKlMnOpQrSt"
        />
        <Field
          label="Client ID"
          help="App Credentials → Client ID"
          value={clientId}
          onChange={setClientId}
          placeholder="e.g. AbCdEfGhIjKlMnOpQr"
        />
        <Field
          label="Client Secret"
          help="App Credentials → Client Secret"
          value={clientSecret}
          onChange={setClientSecret}
          placeholder="32-character secret"
          isSecret
        />
        <Field
          label="Webhook Secret Token"
          help="Feature → Event Subscriptions → Secret Token"
          value={webhookSecret}
          onChange={setWebhookSecret}
          placeholder="Paste the secret token from Event Subscriptions"
          isSecret
        />

        <div className="border border-[var(--rule)] rounded-[4px] p-3 bg-[var(--canvas-subtle)]">
          <div className="label-section mb-1">Required app scopes</div>
          <code className="text-xs block">
            meeting:write:admin · recording:read:admin · user:read:admin
          </code>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 border border-red-300 bg-red-50 rounded-[4px] text-sm text-red-700">
            <AlertCircle className="w-4 h-4 mt-0.5" strokeWidth={1.5} />
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent)] text-white text-sm rounded-[4px] hover:opacity-90 disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
              Verifying…
            </>
          ) : (
            <>Connect Zoom</>
          )}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  help,
  value,
  onChange,
  placeholder,
  isSecret,
}: {
  label: string;
  help: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  isSecret?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-[var(--ink)] mb-1">
        {label}
      </label>
      <div className="text-xs text-[var(--ink-muted)] mb-1.5">{help}</div>
      <input
        type={isSecret ? "password" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required
        className="w-full px-3 py-2 text-sm border border-[var(--rule)] rounded-[4px] bg-[var(--canvas)] focus:outline-none focus:border-[var(--accent)]"
      />
    </div>
  );
}
