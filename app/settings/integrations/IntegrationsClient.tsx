"use client";

// IntegrationsClient — connect / sync / disconnect for every
// integration in the registry.

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Plug,
  PlugZap,
  X,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  KeyRound,
  Building2,
} from "lucide-react";
import McpServersCard from "./McpServersCard";

interface ProviderRow {
  id: string;
  name: string;
  kind: string;
  description: string;
  auth_method: "oauth" | "api_key" | "partner_oauth" | "partner_api";
  status: "live" | "scaffolded" | "partner_pending";
  phase: 6;
  capabilities: string[];
  docs_url?: string;
  api_key_help?: string;
  connection: {
    id: string;
    status: "pending" | "connected" | "error" | "revoked" | "expired";
    external_account_name: string | null;
    last_sync_at: string | null;
    last_sync_status: string | null;
    last_sync_error: string | null;
    connected_at: string | null;
  } | null;
}

const KIND_LABEL: Record<string, string> = {
  crm: "CRM",
  property_mgmt: "Property management",
  accounting: "Accounting",
  market_data: "Market data",
  deal_mgmt: "Deal management",
  esignature: "E-signature",
  networking: "Networking",
  listings: "Listings",
  parcel_data: "Parcel data",
  geocoding: "Geocoding",
  entity_data: "Entity data",
};

function StatusChip({ status }: { status: string | null }) {
  if (!status)
    return (
      <span className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)]">
        not connected
      </span>
    );
  const map: Record<string, { color: string; label: string }> = {
    pending: { color: "var(--ink-muted)", label: "pending" },
    connected: { color: "var(--verified)", label: "connected" },
    error: { color: "var(--danger)", label: "error" },
    revoked: { color: "var(--ink-subtle)", label: "revoked" },
    expired: { color: "var(--flag, var(--accent))", label: "expired" },
  };
  const m = map[status] || { color: "var(--ink-muted)", label: status };
  return (
    <span
      className="text-[10px] mono uppercase tracking-wider px-1.5 py-0.5 rounded-[2px]"
      style={{ color: m.color, border: `1px solid ${m.color}` }}
    >
      {m.label}
    </span>
  );
}

function fmtRelative(d: string | null): string {
  if (!d) return "never";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export default function IntegrationsClient() {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState({
    api_key: "",
    username: "",
    password: "",
  });
  const [topMessage, setTopMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/integrations", { credentials: "include" });
    const j = await r.json().catch(() => ({}));
    setProviders((j.providers as ProviderRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    // Surface ?connected=… / ?error=… from OAuth callback redirects.
    const url = new URL(window.location.href);
    const connected = url.searchParams.get("connected");
    const error = url.searchParams.get("error");
    if (connected) {
      setTopMessage({
        kind: "ok",
        text: `Connected ${connected}`,
      });
    } else if (error) {
      setTopMessage({ kind: "error", text: error });
    }
  }, [load]);

  const connectOauth = async (providerId: string) => {
    setWorking(providerId);
    try {
      const r = await fetch(`/api/integrations/${providerId}/connect`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const j = await r.json();
      if (!r.ok) {
        setTopMessage({ kind: "error", text: j?.error || "Connect failed" });
        return;
      }
      if (j.url) {
        window.location.href = j.url;
        return;
      }
      await load();
    } finally {
      setWorking(null);
    }
  };

  const connectApiKey = async () => {
    if (!showApiKey) return;
    setWorking(showApiKey);
    try {
      const r = await fetch(`/api/integrations/${showApiKey}/connect`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiKeyInput),
      });
      const j = await r.json();
      if (!r.ok) {
        setTopMessage({ kind: "error", text: j?.error || "Connect failed" });
        return;
      }
      setTopMessage({ kind: "ok", text: `Connected ${showApiKey}` });
      setShowApiKey(null);
      setApiKeyInput({ api_key: "", username: "", password: "" });
      await load();
    } finally {
      setWorking(null);
    }
  };

  const sync = async (providerId: string) => {
    setWorking(providerId);
    try {
      const r = await fetch(`/api/integrations/${providerId}/sync`, {
        method: "POST",
        credentials: "include",
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setTopMessage({
          kind: "error",
          text: j?.error || "Sync failed",
        });
      } else {
        setTopMessage({ kind: "ok", text: `${providerId}: sync queued` });
      }
      await load();
    } finally {
      setWorking(null);
    }
  };

  const disconnect = async (providerId: string) => {
    if (!confirm(`Disconnect ${providerId}? Credentials will be cleared.`)) return;
    setWorking(providerId);
    try {
      const r = await fetch(`/api/integrations/${providerId}/disconnect`, {
        method: "POST",
        credentials: "include",
      });
      if (r.ok) await load();
    } finally {
      setWorking(null);
    }
  };

  const connected = providers.filter(
    (p) => p.status !== "partner_pending"
  );
  const pending = providers.filter(
    (p) => p.status === "partner_pending"
  );

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <div className="max-w-5xl mx-auto px-6 md:px-10 py-10 space-y-8">
        <div>
          <div className="label-section mb-1">Settings</div>
          <h1 className="heading-display text-3xl text-[var(--ink)]">
            Integrations
          </h1>
          <p className="prose-body text-[var(--ink-muted)] mt-1.5 max-w-prose">
            Connect Drift to your tools -- CRM, property management,
            accounting, market data, and more. Connected integrations
            sync nightly, or on demand from the row's Sync button.
          </p>
        </div>

        {topMessage && (
          <div
            className="text-xs px-3 py-2 rounded-[4px] flex items-center gap-2"
            style={{
              color:
                topMessage.kind === "ok"
                  ? "var(--verified)"
                  : "var(--danger)",
              border: `1px solid ${topMessage.kind === "ok" ? "var(--verified)" : "var(--danger)"}`,
              background:
                topMessage.kind === "ok"
                  ? "var(--canvas-subtle)"
                  : "var(--danger-soft, var(--canvas-subtle))",
            }}
          >
            {topMessage.kind === "ok" ? (
              <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} />
            ) : (
              <AlertCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
            )}
            {topMessage.text}
            <button
              onClick={() => setTopMessage(null)}
              className="ml-auto opacity-50 hover:opacity-100"
            >
              <X className="w-3 h-3" strokeWidth={1.5} />
            </button>
          </div>
        )}

        {loading ? (
          <div className="text-xs text-[var(--ink-subtle)] flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
            Loading integrations…
          </div>
        ) : (
          <>
            {connected.length > 0 && (
              <ProviderSection
                title="Commercial real estate"
                subtitle="Connect your PM, accounting, CRM, market data, and deal tools. Paste your API key or sign in with OAuth."
                rows={connected}
                working={working}
                onOAuth={connectOauth}
                onApiKey={(p) => {
                  setShowApiKey(p);
                  setApiKeyInput({ api_key: "", username: "", password: "" });
                }}
                onSync={sync}
                onDisconnect={disconnect}
              />
            )}
            {pending.length > 0 && (
              <ProviderSection
                title="Coming soon"
                subtitle="Partner approval or contract required before wiring."
                rows={pending}
                working={working}
                onOAuth={connectOauth}
                onApiKey={(p) => {
                  setShowApiKey(p);
                  setApiKeyInput({ api_key: "", username: "", password: "" });
                }}
                onSync={sync}
                onDisconnect={disconnect}
              />
            )}
            <McpServersCard />
          </>
        )}

        {/* API-key dialog */}
        {showApiKey && (
          <div className="fixed inset-0 bg-[var(--ink)]/30 z-50 flex items-center justify-center px-4">
            <div className="bg-[var(--canvas)] border border-[var(--rule)] rounded-[6px] p-6 max-w-md w-full space-y-4 shadow-lg">
              <div className="flex items-baseline justify-between">
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-[var(--ink-muted)]" strokeWidth={1.5} />
                  Connect {providers.find((p) => p.id === showApiKey)?.name}
                </h3>
                <button
                  onClick={() => setShowApiKey(null)}
                  className="text-[var(--ink-muted)] hover:text-[var(--ink)]"
                >
                  <X className="w-4 h-4" strokeWidth={1.5} />
                </button>
              </div>
              <p className="text-xs text-[var(--ink-muted)]">
                {providers.find((p) => p.id === showApiKey)?.api_key_help ||
                  "Paste your API credentials below."}
              </p>
              <input
                value={apiKeyInput.api_key}
                onChange={(e) =>
                  setApiKeyInput({ ...apiKeyInput, api_key: e.target.value })
                }
                placeholder="API key"
                className="w-full text-xs px-2 py-1.5 border border-[var(--rule)] rounded-[4px] bg-[var(--canvas)]"
              />
              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={() => setShowApiKey(null)}
                  className="text-xs px-3 py-1.5 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)]"
                >
                  Cancel
                </button>
                <button
                  onClick={connectApiKey}
                  disabled={!apiKeyInput.api_key || working === showApiKey}
                  className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] disabled:opacity-50"
                >
                  {working === showApiKey ? (
                    <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                  ) : null}
                  Connect
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProviderSection({
  title,
  subtitle,
  rows,
  working,
  onOAuth,
  onApiKey,
  onSync,
  onDisconnect,
}: {
  title: string;
  subtitle: string;
  rows: ProviderRow[];
  working: string | null;
  onOAuth: (id: string) => void;
  onApiKey: (id: string) => void;
  onSync: (id: string) => void;
  onDisconnect: (id: string) => void;
}) {
  return (
    <section className="space-y-3">
      <div>
        <div className="text-base font-semibold">{title}</div>
        <p className="text-xs text-[var(--ink-muted)]">{subtitle}</p>
      </div>
      <div className="border border-[var(--rule)] rounded-[4px] divide-y divide-[var(--rule)]">
        {rows.map((p) => {
          const conn = p.connection;
          const isPartnerPending = p.status === "partner_pending";
          const busy = working === p.id;
          return (
            <div key={p.id} className="px-4 py-3 flex items-start gap-3">
              <Building2
                className="w-4 h-4 text-[var(--ink-muted)] mt-0.5 flex-shrink-0"
                strokeWidth={1.5}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-[var(--ink)]">
                    {p.name}
                  </span>
                  <span className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)]">
                    {KIND_LABEL[p.kind] || p.kind}
                  </span>
                  <StatusChip status={conn?.status ?? null} />
                  {p.status === "scaffolded" && (
                    <span className="text-[10px] mono uppercase tracking-wider text-[var(--flag, var(--accent))]">
                      scaffolded
                    </span>
                  )}
                  {isPartnerPending && (
                    <span className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] inline-flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      partner approval required
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--ink-muted)] mt-1">
                  {p.description}
                </p>
                <div className="flex items-center gap-3 mt-2 text-[11px] text-[var(--ink-subtle)] mono flex-wrap">
                  <span>Pulls: {p.capabilities.join(", ")}</span>
                  {conn?.external_account_name && (
                    <>
                      <span>·</span>
                      <span>Account: {conn.external_account_name}</span>
                    </>
                  )}
                  {conn?.last_sync_at && (
                    <>
                      <span>·</span>
                      <span>Last sync: {fmtRelative(conn.last_sync_at)}</span>
                    </>
                  )}
                  {p.docs_url && (
                    <>
                      <span>·</span>
                      <a
                        href={p.docs_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--ink-muted)] hover:text-[var(--ink)] underline underline-offset-2"
                      >
                        docs
                      </a>
                    </>
                  )}
                </div>
                {conn?.last_sync_error && (
                  <div className="text-[11px] text-[var(--danger)] mt-1.5 flex items-start gap-1">
                    <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" strokeWidth={1.5} />
                    {conn.last_sync_error}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {conn?.status === "connected" ? (
                  <>
                    <button
                      onClick={() => onSync(p.id)}
                      disabled={busy}
                      className="text-xs inline-flex items-center gap-1 px-2 py-1.5 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] disabled:opacity-50"
                      title="Sync now"
                    >
                      {busy ? (
                        <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                      ) : (
                        <RefreshCw className="w-3 h-3" strokeWidth={1.5} />
                      )}
                      Sync
                    </button>
                    <button
                      onClick={() => onDisconnect(p.id)}
                      disabled={busy}
                      className="text-xs px-2 py-1.5 rounded-[4px] border border-[var(--rule)] text-[var(--danger)] hover:bg-[var(--danger-soft)] disabled:opacity-50"
                    >
                      Disconnect
                    </button>
                  </>
                ) : isPartnerPending ? (
                  <span className="text-[11px] text-[var(--ink-subtle)] italic px-2">
                    Coming soon
                  </span>
                ) : p.auth_method === "api_key" ? (
                  <button
                    onClick={() => onApiKey(p.id)}
                    disabled={busy}
                    className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                    ) : (
                      <Plug className="w-3 h-3" strokeWidth={1.5} />
                    )}
                    Connect
                  </button>
                ) : (
                  <button
                    onClick={() => onOAuth(p.id)}
                    disabled={busy}
                    className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                    ) : (
                      <PlugZap className="w-3 h-3" strokeWidth={1.5} />
                    )}
                    Connect with OAuth
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
