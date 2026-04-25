"use client";

// Generic Mailbox + Calendar settings card. Used for Google and
// Microsoft — the providers are isomorphic at this level (one OAuth
// grant, two sync surfaces, identical status shape) so we render
// them with one component parameterized by the provider key.

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

interface ProviderConfig {
  key: "google" | "microsoft";
  label: string;
  startUrl: string;
  statusUrl: string;
  emailSyncUrl: string;
  calendarSyncUrl: string;
  /** URL search-param the OAuth callback sets — used to read errors. */
  callbackParam: string;
  emailLabel: string;       // "Gmail" / "Outlook"
  calendarLabel: string;    // "Calendar" / "Outlook Calendar"
}

const PROVIDERS: Record<"google" | "microsoft", ProviderConfig> = {
  google: {
    key: "google",
    label: "Google",
    startUrl: "/api/oauth/google/start",
    statusUrl: "/api/integrations/google/status",
    emailSyncUrl: "/api/integrations/gmail/sync",
    calendarSyncUrl: "/api/integrations/calendar/sync",
    callbackParam: "google_oauth",
    emailLabel: "Gmail",
    calendarLabel: "Calendar",
  },
  microsoft: {
    key: "microsoft",
    label: "Microsoft",
    startUrl: "/api/oauth/microsoft/start",
    statusUrl: "/api/integrations/microsoft/status",
    emailSyncUrl: "/api/integrations/outlook/sync",
    calendarSyncUrl: "/api/integrations/microsoft-calendar/sync",
    callbackParam: "microsoft_oauth",
    emailLabel: "Outlook",
    calendarLabel: "Outlook Calendar",
  },
};

export default function MailboxCard({ provider }: { provider: "google" | "microsoft" }) {
  const cfg = PROVIDERS[provider];
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<"email" | "calendar" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(cfg.statusUrl);
      if (!res.ok) throw new Error(`status ${res.status}`);
      setStatus((await res.json()) as Status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "load_failed");
    } finally {
      setLoading(false);
    }
  }, [cfg.statusUrl]);

  useEffect(() => {
    refresh();
    const params = new URLSearchParams(window.location.search);
    const flag = params.get(cfg.callbackParam);
    if (flag === "error") setError(params.get("message") || "oauth_error");
  }, [refresh, cfg.callbackParam]);

  const onConnect = () => {
    window.location.href = cfg.startUrl;
  };

  const onDisconnect = async () => {
    if (!confirm(`Disconnect ${cfg.label}? Synced data stays in Drift; we just stop pulling new data.`)) return;
    await fetch(cfg.statusUrl, { method: "DELETE" });
    refresh();
  };

  const onSync = async (kind: "email" | "calendar") => {
    setSyncing(kind);
    setError(null);
    try {
      const url = kind === "email" ? cfg.emailSyncUrl : cfg.calendarSyncUrl;
      const res = await fetch(url, { method: "POST" });
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
          <h3 className="text-base text-[var(--ink)] mb-1">Connect your {cfg.label} account</h3>
          <p className="text-sm text-[var(--ink-muted)] mb-4">
            One consent grants {cfg.emailLabel} read-only and {cfg.calendarLabel} read-only access.
            Drift filters everything to messages and events with known clients before storing —
            your personal mail stays out.
          </p>
          <button
            onClick={onConnect}
            className="inline-flex items-center gap-2 rounded-[4px] bg-[var(--accent)] px-4 py-2 text-sm text-white hover:opacity-90"
          >
            <ExternalLink className="w-4 h-4" /> Connect {cfg.label}
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
              label={cfg.emailLabel}
              count={status.counts?.emails ?? 0}
              countLabel="messages synced"
              syncing={syncing === "email"}
              onSync={() => onSync("email")}
            />
            <SourcePanel
              icon={<Calendar className="w-4 h-4" />}
              label={cfg.calendarLabel}
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
            Disconnect {cfg.label}
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
