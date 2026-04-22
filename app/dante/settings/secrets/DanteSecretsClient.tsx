"use client";

// app/dante/settings/secrets/DanteSecretsClient.tsx
//
// Workspace secret vault UI. List + add + delete. The API never
// sends raw values back — rows show a masked preview (first 4 +
// bullets + last 4). The "value" input is write-only; existing
// secrets can only be rotated (upsert by key) or deleted.
//
// Use these in workflow step configs via `{{secrets.<key>}}` —
// the runner resolves the template against a workspace map loaded
// once per run. Raw values get redacted out of run logs before
// insert, so a `curl` step that prints the rendered URL won't leak.

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import DanteGateLink from "@/components/dante/DanteGateLink";
import {
  ArrowLeft, Plus, Trash2, Loader2, Key, ShieldCheck,
  AlertCircle, Check,
} from "lucide-react";

interface SecretRow {
  id: string;
  key: string;
  preview: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export default function DanteSecretsClient() {
  const [rows, setRows] = useState<SecretRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add/rotate form state
  const [formKey, setFormKey] = useState("");
  const [formValue, setFormValue] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [justSavedKey, setJustSavedKey] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dante/secrets", { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setRows(json.secrets || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const html = document.documentElement, body = document.body;
    html.style.setProperty("background", "var(--canvas)", "important");
    body.style.setProperty("background", "var(--canvas)", "important");
    body.style.setProperty("color", "var(--ink)", "important");
    return () => {
      html.style.removeProperty("background");
      body.style.removeProperty("background");
      body.style.removeProperty("color");
    };
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const key = formKey.trim();
    if (!key || !formValue) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/dante/secrets", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          value: formValue,
          description: formDescription.trim() || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to save");
      setJustSavedKey(key);
      setFormKey(""); setFormValue(""); setFormDescription("");
      await load();
      setTimeout(() => setJustSavedKey(null), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally { setSaving(false); }
  };

  const remove = async (row: SecretRow) => {
    if (!confirm(`Delete secret "${row.key}"? Any workflow referencing {{secrets.${row.key}}} will start failing.`)) return;
    setDeletingId(row.id); setError(null);
    try {
      const res = await fetch(`/api/dante/secrets/${row.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to delete");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    } finally { setDeletingId(null); }
  };

  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      {/* Top bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-6 md:px-8 py-4 bg-[var(--canvas)] border-b border-[var(--rule)]">
        <div className="flex items-center gap-3">
          <img src="/brand/logo-circle.png" alt="Drift" className="w-6 h-6 rounded-full object-cover" />
          <span className="text-sm font-semibold text-[var(--ink)]">Drift</span>
          <span className="text-xs text-[var(--ink-subtle)]">/</span>
          <Link href="/dashboard" className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] transition">Dashboard</Link>
          <span className="text-xs text-[var(--ink-subtle)]">/</span>
          <DanteGateLink variant="breadcrumb" />
          <span className="text-xs text-[var(--ink-subtle)]">/</span>
          <span className="text-xs text-[var(--ink)]">Secrets</span>
        </div>
        <Link href="/dante" className="flex items-center gap-1.5 px-3 py-2 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition text-sm font-medium">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
          <span className="hidden sm:inline">Dante</span>
        </Link>
      </div>

      <div className="px-6 md:px-8 py-10 max-w-[900px] mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="label-section mb-3">Dante · Settings</div>
          <h1 className="heading-display text-4xl text-[var(--ink)] mb-3">
            Secrets
          </h1>
          <p className="text-sm text-[var(--ink-muted)] max-w-2xl leading-relaxed">
            Store API keys, tokens, and other credentials here once, then
            reference them in workflow steps with
            {" "}<code className="text-[var(--ink)] bg-[var(--canvas-subtle)] px-1.5 py-0.5 rounded-[3px] text-[11px]">{"{{secrets.key}}"}</code>.
            Values are never shown in the UI after save and are stripped from
            run logs before they hit the database.
          </p>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 p-3 rounded-[4px] border border-[var(--danger-soft)] bg-[var(--danger-soft)]/20 text-xs text-[var(--danger)]">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
            <span>{error}</span>
          </div>
        )}

        {/* Add / rotate form */}
        <form onSubmit={save} className="card-flat p-5 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Plus className="w-4 h-4 text-[var(--ink)]" strokeWidth={1.5} />
            <h2 className="text-sm font-semibold text-[var(--ink)]">Add or rotate a secret</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-[11px] text-[var(--ink-muted)] mb-1.5">Key</label>
              <input
                value={formKey}
                onChange={(e) => setFormKey(e.target.value)}
                placeholder="stripe_api_key"
                pattern="[a-zA-Z_][a-zA-Z0-9_]*"
                title="Letters, digits, underscore; no leading digit"
                required
                className="w-full px-3 py-2 rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] text-sm text-[var(--ink)] font-mono placeholder:text-[var(--ink-subtle)] focus:outline-none focus:border-[var(--ink-muted)]"
              />
              <p className="text-[10px] text-[var(--ink-subtle)] mt-1">
                Used as {"{{secrets.KEY}}"}. Letters, digits, underscores only.
              </p>
            </div>
            <div>
              <label className="block text-[11px] text-[var(--ink-muted)] mb-1.5">Description <span className="text-[var(--ink-subtle)]">(optional)</span></label>
              <input
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Stripe live mode, rotated Feb 2026"
                className="w-full px-3 py-2 rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none focus:border-[var(--ink-muted)]"
              />
            </div>
          </div>
          <div className="mb-3">
            <label className="block text-[11px] text-[var(--ink-muted)] mb-1.5">Value</label>
            <input
              type="password"
              value={formValue}
              onChange={(e) => setFormValue(e.target.value)}
              placeholder="sk_live_…"
              required
              autoComplete="off"
              className="w-full px-3 py-2 rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] text-sm text-[var(--ink)] font-mono placeholder:text-[var(--ink-subtle)] focus:outline-none focus:border-[var(--ink-muted)]"
            />
            <p className="text-[10px] text-[var(--ink-subtle)] mt-1">
              Saving with an existing key overwrites the stored value. The raw value is never shown again after this.
            </p>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--ink-subtle)]">
              <ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.5} />
              <span>Encrypted at rest by Supabase; service-role only.</span>
            </div>
            <button
              type="submit"
              disabled={saving || !formKey.trim() || !formValue}
              className="flex items-center gap-1.5 px-3 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] hover:opacity-90 transition text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} /> : <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />}
              {saving ? "Saving…" : "Save secret"}
            </button>
          </div>
        </form>

        {/* List */}
        <div className="mb-3 flex items-center justify-between">
          <div className="label-section">Stored secrets</div>
          <span className="text-[11px] text-[var(--ink-subtle)]">
            {rows.length} {rows.length === 1 ? "entry" : "entries"}
          </span>
        </div>

        {loading ? (
          <div className="card-flat p-8 flex items-center justify-center text-[var(--ink-muted)]">
            <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
          </div>
        ) : rows.length === 0 ? (
          <div className="card-flat p-8 text-center">
            <Key className="w-6 h-6 text-[var(--ink-subtle)] mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-sm text-[var(--ink-muted)] mb-1">No secrets yet.</p>
            <p className="text-xs text-[var(--ink-subtle)]">
              Add your first one above — then reference it from any workflow step.
            </p>
          </div>
        ) : (
          <div className="card-flat divide-y divide-[var(--rule)]">
            {rows.map((row) => (
              <div key={row.id} className="p-4 flex items-center gap-4">
                <div className="border border-[var(--rule)] bg-[var(--canvas)] rounded-[4px] p-2">
                  <Key className="w-3.5 h-3.5 text-[var(--ink-muted)]" strokeWidth={1.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <code className="text-sm font-mono font-semibold text-[var(--ink)]">{row.key}</code>
                    {justSavedKey === row.key && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-[var(--verified)]">
                        <Check className="w-3 h-3" strokeWidth={2} />
                        just saved
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-[var(--ink-subtle)]">
                    <code className="font-mono">{row.preview}</code>
                    {row.description && (
                      <>
                        <span>·</span>
                        <span className="truncate">{row.description}</span>
                      </>
                    )}
                    <span>·</span>
                    <span>updated {new Date(row.updated_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <button
                  onClick={() => remove(row)}
                  disabled={deletingId === row.id}
                  aria-label={`Delete ${row.key}`}
                  className="p-2 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)]/30 transition disabled:opacity-40"
                >
                  {deletingId === row.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                    : <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Footer usage hint */}
        <div className="mt-8 card-flat p-5 bg-[var(--canvas-subtle)]">
          <div className="label-section mb-2">Usage</div>
          <p className="text-xs text-[var(--ink-muted)] leading-relaxed mb-2">
            In any HTTP step header, URL, body, or OpenAI API key field:
          </p>
          <pre className="text-[11px] text-[var(--ink)] font-mono bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] p-3 overflow-x-auto">
{`Authorization: Bearer {{secrets.stripe_api_key}}
X-Custom-Header: {{secrets.webhook_token}}`}
          </pre>
          <p className="text-[10px] text-[var(--ink-subtle)] mt-2">
            Secrets resolve once at run start. If the secret is missing, the
            template renders as empty and the step will likely fail with a
            401 — exactly what you want, not a silent success.
          </p>
        </div>
      </div>
    </div>
  );
}
