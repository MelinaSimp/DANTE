"use client";

// app/dante/workflows/DanteWorkflowsClient.tsx
//
// Workflow list view. Click "New workflow" to create a blank workflow
// then push into the editor. Each row shows last-run status + an
// Open button to edit/run it.

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Plus, Loader2, Play, Zap, AlertCircle,
  CheckCircle2, Circle, Trash2,
} from "lucide-react";

interface WorkflowRow {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  updated_at: string;
}

export default function DanteWorkflowsClient() {
  const router = useRouter();
  const [rows, setRows] = useState<WorkflowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dante/workflows", { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setRows(json.workflows || []);
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

  const create = async () => {
    setCreating(true); setError(null);
    try {
      const res = await fetch("/api/dante/workflows", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Untitled workflow", steps: [] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      router.push(`/dante/workflows/${json.workflow.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
      setCreating(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this workflow and all of its run history?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/dante/workflows/${id}`, {
        method: "DELETE", credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      setRows((p) => p.filter((r) => r.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
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
          <Link href="/dante" className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] transition">Dante</Link>
          <span className="text-xs text-[var(--ink-subtle)]">/</span>
          <span className="text-xs text-[var(--ink)]">Workflows</span>
        </div>
        <Link href="/dante" className="flex items-center gap-1.5 px-3 py-2 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition text-sm font-medium">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
          <span className="hidden sm:inline">Dante</span>
        </Link>
      </div>

      <div className="px-6 md:px-8 py-8 max-w-[1200px] mx-auto">
        <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
          <div>
            <div className="label-section mb-2">Dante · Workflows</div>
            <h1 className="heading-display text-4xl text-[var(--ink)] mb-2">Workflows</h1>
            <p className="text-sm text-[var(--ink-muted)] max-w-2xl">
              Chain HTTP calls, OpenAI prompts, and CRM actions into reusable
              automations. Run them manually from the editor — triggered
              workflows (cron + webhook) are on the phase-2 roadmap.
            </p>
          </div>
          <button onClick={create} disabled={creating}
            className="flex items-center gap-2 px-4 py-2.5 rounded-[4px] bg-[var(--ink)] hover:opacity-90 text-[var(--canvas)] text-sm font-semibold transition disabled:opacity-50">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} /> : <Plus className="h-4 w-4" strokeWidth={1.5} />}
            New workflow
          </button>
        </div>

        {error && (
          <div className="border border-[var(--rule)] bg-[var(--danger-soft)] rounded-[6px] p-4 mb-6 text-sm text-[var(--danger)]">
            {error}
          </div>
        )}

        {loading ? (
          <div className="card-flat p-12 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--ink-muted)] mx-auto" strokeWidth={1.5} />
          </div>
        ) : rows.length === 0 ? (
          <div className="card-flat p-12 text-center">
            <Zap className="h-10 w-10 text-[var(--ink-subtle)] mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-[var(--ink-muted)] mb-1">No workflows yet</p>
            <p className="text-xs text-[var(--ink-subtle)] mb-4">
              Create one to wire up HTTP calls, LLM prompts, and CRM actions.
            </p>
            <button onClick={create} disabled={creating}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[4px] bg-[var(--ink)] hover:opacity-90 text-[var(--canvas)] text-sm font-semibold transition disabled:opacity-50">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} /> : <Plus className="w-4 h-4" strokeWidth={1.5} />}
              New workflow
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="card-flat card-flat-hover flex items-center gap-4 px-5 py-4">
                <div className="border border-[var(--rule)] bg-[var(--canvas)] rounded-[4px] p-2 shrink-0">
                  <Zap className="h-4 w-4 text-[var(--ink)]" strokeWidth={1.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="text-sm font-semibold text-[var(--ink)] truncate">{r.name}</h3>
                    {r.enabled ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--verified)] bg-[var(--verified-soft)] border border-[var(--rule)] rounded-full px-2 py-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--verified)]" /> Enabled
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--ink-muted)] bg-[var(--canvas-subtle)] border border-[var(--rule)] rounded-full px-2 py-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--ink-subtle)]" /> Disabled
                      </span>
                    )}
                  </div>
                  {r.description && <p className="text-xs text-[var(--ink-muted)] line-clamp-1">{r.description}</p>}
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-[var(--ink-subtle)]">
                    {r.last_run_at ? (
                      <span className="flex items-center gap-1">
                        {r.last_run_status === "success" ? (
                          <CheckCircle2 className="w-3 h-3 text-[var(--verified)]" strokeWidth={1.5} />
                        ) : r.last_run_status === "error" ? (
                          <AlertCircle className="w-3 h-3 text-[var(--danger)]" strokeWidth={1.5} />
                        ) : (
                          <Circle className="w-3 h-3" strokeWidth={1.5} />
                        )}
                        Last run {new Date(r.last_run_at).toLocaleString()}
                      </span>
                    ) : (
                      <span>Never run</span>
                    )}
                  </div>
                </div>
                <Link href={`/dante/workflows/${r.id}`}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-[4px] border border-[var(--rule)] text-[var(--ink)] hover:bg-[var(--canvas-subtle)] text-xs font-medium transition">
                  <Play className="w-3 h-3" strokeWidth={1.5} /> Open
                </Link>
                <button onClick={() => remove(r.id)} disabled={deletingId === r.id}
                  className="p-2 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] transition disabled:opacity-50">
                  {deletingId === r.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                    : <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
