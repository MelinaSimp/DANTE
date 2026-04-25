"use client";

// Settings → Google integration panel.
//
// One OAuth grant, two surfaces:
//   - Gmail (read-only) feeds dante_memory with client correspondence
//   - Calendar (read-only) feeds dashboard briefs and churn signals
//
// Per-user (not per-workspace) because refresh tokens are personal.
// An advisor connecting their inbox doesn't expose it to coworkers
// even if they share a workspace — RLS on oauth_credentials is
// scoped to user_id.

import { useCallback, useEffect, useState } from "react";
import {
  Mail,
  Calendar,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ExternalLink,
} from "lucide-react";

interface Status {
  connected: boolean;
  email?: string;
  scopes?: string[];
  counts?: { emails: number; calendar_events: number };
}

export default function GoogleCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<"gmail" | "calendar" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/google/status");
      if (!res.ok) throw new Error(`status ${res.status}`);
      setStatus((await res.json()) as Status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "load_failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();

    // Pick up the redirect-back param from the OAuth callback so the
    // user sees confirmation without having to manually refetch.
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("google_oauth");
    if (flag === "error") {
      setError(params.get("message") || "oauth_error");
    }
  }, [refresh]);

  const onConnect = () => {
    window.location.href = "/api/oauth/google/start";
  };

  const onDisconnect = async () => {
    if (!confirm("Disconnect Google? Your synced mail and calendar stay in Drift; we just stop pulling new data.")) return;
    await fetch("/api/integrations/google/status", { method: "DELETE" });
    refresh();
  };

  const onSync = async (kind: "gmail" | "calendar") => {
    setSyncing(kind);
    setError(null);
    try {
      const res = await fetch(`/api/integrations/${kind}/sync`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "sync_failed");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "sync_failed");
    } finally {
      setSyncing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--ink-subtle)]">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-[4px] border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {!status?.connected ? (
        <div className="rounded-[4px] border border-[var(--rule)] bg-[var(--canvas-subtle)] p-5">
          <h3 className="text-base text-[var(--ink)] mb-1">Connect your Google account</h3>
          <p className="text-sm text-[var(--ink-muted)] mb-4">
            One consent grants Gmail read-only and Calendar read-only access. Drift filters everything to
            messages and events with known clients before storing — your personal mail stays out.
          </p>
          <button
            onClick={onConnect}
            className="inline-flex items-center gap-2 rounded-[4px] bg-[var(--accent)] px-4 py-2 text-sm text-white hover:opacity-90"
          >
            <ExternalLink className="w-4 h-4" /> Connect Google
          </button>
        </div>
      ) : (
        <>
          <div className="rounded-[4px] border border-emerald-500/30 bg-emerald-500/5 p-4">
            <div className="flex items-center gap-2 text-sm text-emerald-300">
              <CheckCircle2 className="w-4 h-4" />
              Connected as <span className="font-medium">{status.email}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <SourcePanel
              icon={<Mail className="w-4 h-4" />}
              label="Gmail"
              count={status.counts?.emails ?? 0}
              countLabel="messages synced"
              syncing={syncing === "gmail"}
              onSync={() => onSync("gmail")}
            />
            <SourcePanel
              icon={<Calendar className="w-4 h-4" />}
              label="Calendar"
              count={status.counts?.calendar_events ?? 0}
              countLabel="events synced"
              syncing={syncing === "calendar"}
              onSync={() => onSync("calendar")}
            />
          </div>

          <button
            onClick={onDisconnect}
            className="text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] underline"
          >
            Disconnect Google
          </button>
        </>
      )}
    </div>
  );
}

function SourcePanel(props: {
  icon: React.ReactNode;
  label: string;
  count: number;
  countLabel: string;
  syncing: boolean;
  onSync: () => void;
}) {
  return (
    <div className="rounded-[4px] border border-[var(--rule)] bg-[var(--canvas-subtle)] p-4">
      <div className="flex items-center gap-2 text-sm text-[var(--ink)] mb-1">
        {props.icon}
        {props.label}
      </div>
      <div className="text-2xl text-[var(--ink)] mb-1">{props.count.toLocaleString()}</div>
      <div className="text-xs text-[var(--ink-subtle)] mb-3">{props.countLabel}</div>
      <button
        onClick={props.onSync}
        disabled={props.syncing}
        className="inline-flex items-center gap-1.5 rounded-[4px] border border-[var(--rule)] px-2.5 py-1 text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] disabled:opacity-50"
      >
        {props.syncing ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <RefreshCw className="w-3 h-3" />
        )}
        {props.syncing ? "Syncing…" : "Sync now"}
      </button>
    </div>
  );
}
