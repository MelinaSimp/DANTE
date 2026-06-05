"use client";

// McpServersCard — Dante's external workflow connectors.
//
// Today this surfaces a single tile: n8n. The shape generalizes if
// we add more MCP servers later (Linear, Notion, custom). Each tile
// posts to /api/dante/mcp/<name>/connect; the route verifies the
// credentials via tools/list before persisting so a bad API key is
// surfaced as an inline error instead of a silent dead row.

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Plug,
  X,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Workflow,
  Trash2,
} from "lucide-react";

interface McpServerRow {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  approval_status: "pending" | "approved" | "rejected";
  tool_count: number;
  catalog_fetched_at: string | null;
  created_at: string;
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

export default function McpServersCard() {
  const [servers, setServers] = useState<McpServerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConnect, setShowConnect] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [form, setForm] = useState({ url: "", api_key: "" });
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/dante/mcp", { credentials: "include" });
      const j = await r.json().catch(() => ({}));
      setServers((j.servers as McpServerRow[]) || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const n8n = servers.find((s) => s.name === "n8n") || null;

  const connectN8n = async () => {
    setWorking("n8n");
    setMessage(null);
    try {
      const r = await fetch("/api/dante/mcp/n8n/connect", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMessage({
          kind: "error",
          text: j?.message || j?.error || "Connect failed",
        });
        return;
      }
      setMessage({
        kind: "ok",
        text: `Connected n8n — ${j.tool_count ?? 0} tools available to Dante.`,
      });
      setShowConnect(null);
      setForm({ url: "", api_key: "" });
      await load();
    } finally {
      setWorking(null);
    }
  };

  const disconnect = async (serverId: string) => {
    if (!confirm("Disconnect n8n? Dante will stop being able to build n8n workflows.")) return;
    setWorking(serverId);
    setMessage(null);
    try {
      const r = await fetch(`/api/dante/mcp/${serverId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMessage({ kind: "error", text: j?.message || j?.error || "Disconnect failed" });
        return;
      }
      setMessage({ kind: "ok", text: "Disconnected." });
      await load();
    } finally {
      setWorking(null);
    }
  };

  return (
    <section className="space-y-3">
      <div>
        <div className="text-base font-semibold">Dante workflow connectors</div>
        <p className="text-xs text-[var(--ink-muted)]">
          Connect external workflow platforms so Dante can build automations directly in your account
          instead of describing them in chat.
        </p>
      </div>

      {message && (
        <div
          className="text-xs px-3 py-2 rounded-[4px] flex items-center gap-2"
          style={{
            color: message.kind === "ok" ? "var(--verified)" : "var(--danger)",
            border: `1px solid ${message.kind === "ok" ? "var(--verified)" : "var(--danger)"}`,
            background: "var(--canvas-subtle)",
          }}
        >
          {message.kind === "ok" ? (
            <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} />
          ) : (
            <AlertCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
          )}
          {message.text}
          <button
            onClick={() => setMessage(null)}
            className="ml-auto opacity-50 hover:opacity-100"
          >
            <X className="w-3 h-3" strokeWidth={1.5} />
          </button>
        </div>
      )}

      <div className="border border-[var(--rule)] rounded-[4px] divide-y divide-[var(--rule)]">
        <div className="px-4 py-3 flex items-start gap-3">
          <Workflow
            className="w-4 h-4 text-[var(--ink-muted)] mt-0.5 flex-shrink-0"
            strokeWidth={1.5}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-[var(--ink)]">n8n</span>
              <span className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)]">
                workflow automation
              </span>
              {loading ? null : n8n ? (
                <span
                  className="text-[10px] mono uppercase tracking-wider px-1.5 py-0.5 rounded-[2px]"
                  style={{
                    color: "var(--verified)",
                    border: "1px solid var(--verified)",
                  }}
                >
                  connected
                </span>
              ) : (
                <span className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)]">
                  not connected
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--ink-muted)] mt-1">
              Lets Dante create, validate, and publish n8n workflows on your instance. When connected,
              asking Dante to &ldquo;make a workflow&rdquo; builds it in your n8n canvas instead of
              returning JSON in chat.
            </p>
            {n8n && (
              <div className="flex items-center gap-3 mt-2 text-[11px] text-[var(--ink-subtle)] mono flex-wrap">
                <span>{n8n.tool_count} tools cached</span>
                <span>·</span>
                <span>Last refresh: {fmtRelative(n8n.catalog_fetched_at)}</span>
                <span>·</span>
                <span className="truncate max-w-[280px]" title={n8n.url}>
                  {n8n.url}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--ink-muted)]" strokeWidth={1.5} />
            ) : n8n ? (
              <button
                onClick={() => disconnect(n8n.id)}
                disabled={working === n8n.id}
                className="text-xs inline-flex items-center gap-1.5 px-2 py-1.5 rounded-[4px] border border-[var(--rule)] text-[var(--danger)] hover:bg-[var(--danger-soft,var(--canvas-subtle))] disabled:opacity-50"
              >
                {working === n8n.id ? (
                  <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                ) : (
                  <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                )}
                Disconnect
              </button>
            ) : (
              <button
                onClick={() => {
                  setShowConnect("n8n");
                  setForm({ url: "", api_key: "" });
                  setMessage(null);
                }}
                disabled={working === "n8n"}
                className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] disabled:opacity-50"
              >
                {working === "n8n" ? (
                  <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                ) : (
                  <Plug className="w-3 h-3" strokeWidth={1.5} />
                )}
                Connect
              </button>
            )}
          </div>
        </div>
      </div>

      {showConnect === "n8n" && (
        <div className="fixed inset-0 bg-[var(--ink)]/30 z-50 flex items-center justify-center px-4">
          <div className="bg-[var(--canvas)] border border-[var(--rule)] rounded-[6px] p-6 max-w-md w-full space-y-4 shadow-lg">
            <div className="flex items-baseline justify-between">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[var(--ink-muted)]" strokeWidth={1.5} />
                Connect n8n
              </h3>
              <button
                onClick={() => setShowConnect(null)}
                className="text-[var(--ink-muted)] hover:text-[var(--ink)]"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>
            <p className="text-xs text-[var(--ink-muted)]">
              Paste your n8n MCP server URL and API key. We&rsquo;ll verify the credentials by listing
              the tools your instance exposes before saving the connection.
            </p>
            <div className="space-y-2">
              <label className="text-[11px] mono uppercase tracking-wider text-[var(--ink-subtle)]">
                MCP endpoint URL
              </label>
              <input
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://your-n8n.example.com/mcp"
                className="w-full text-xs px-2 py-1.5 border border-[var(--rule)] rounded-[4px] bg-[var(--canvas)]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] mono uppercase tracking-wider text-[var(--ink-subtle)]">
                API key
              </label>
              <input
                value={form.api_key}
                onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                placeholder="n8n_api_…"
                type="password"
                className="w-full text-xs px-2 py-1.5 border border-[var(--rule)] rounded-[4px] bg-[var(--canvas)]"
              />
              <p className="text-[11px] text-[var(--ink-subtle)]">
                Find this in n8n under Settings → API. The key is sent as a bearer token on every
                tools/call.
              </p>
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setShowConnect(null)}
                className="text-xs px-3 py-1.5 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)]"
              >
                Cancel
              </button>
              <button
                onClick={connectN8n}
                disabled={!form.url || !form.api_key || working === "n8n"}
                className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] disabled:opacity-50"
              >
                {working === "n8n" ? (
                  <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                ) : null}
                Connect
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
