"use client";

// app/dante/workflows/DanteWorkflowsClient.tsx
//
// Workflow list view. The primary creation path is "Generate with
// Dante" — a prompt box that POSTs to /api/dante/workflows/generate
// and pushes the user straight into the editor with the generated
// canvas already loaded. "Start blank" is the secondary option.
//
// Each row below shows last-run status + an Open button.

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DanteGateLink from "@/components/dante/DanteGateLink";
import { DriftMark } from "@/components/dante/DriftMark";
import {
  ArrowLeft, Plus, Loader2, Play, Zap, AlertCircle,
  CheckCircle2, Circle, Trash2, ArrowRight,
  Clock, Webhook, MousePointerClick, Users, TrendingUp,
  ChevronRight, Copy, Tag, Activity,
} from "lucide-react";
import { useAssistantBrand } from "@/components/dante/AssistantNameProvider";

interface WorkflowRow {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  updated_at: string;
  tags?: string[];
}

// Proposal types mirror lib/dante/workflow-proposals.ts — kept local
// to avoid a server-only import trail.
interface WorkflowProposal {
  id: string;
  title: string;
  description: string;
  trigger: {
    type: "manual" | "cron" | "webhook";
    detail: string;
  };
  projected_volume: {
    estimate: number | null;
    unit: string;
    reasoning: string;
  };
  expected_impact: string;
  node_sketch: string[];
  rationale: string;
  enriched_prompt: string;
}

interface BookSummary {
  workspace_id: string;
  counts: { contacts: number };
  segments: { stale_60d: number; new_30d: number; active_30d: number };
  [key: string]: unknown;
}

// Tiny starter-pack of prompts — click one to prefill the box. Helps
// users who stare at the empty textarea not knowing what to ask for.
const EXAMPLE_PROMPTS = [
  "Every morning at 9am, query all contacts added in the last 24h and email me a summary.",
  "When a webhook fires, use GPT-4o-mini to classify the message as urgent or not, then email me only if it's urgent.",
  "Daily at 8am, find contacts with no recent activity and draft a re-engagement email for each.",
];

export default function DanteWorkflowsClient() {
  const brand = useAssistantBrand();
  const router = useRouter();
  const [rows, setRows] = useState<WorkflowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Two-phase generator state.
  // Phase 1: user types prompt → POST /propose → proposals show up
  // Phase 2: user clicks a proposal card → POST /materialize → editor
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [proposals, setProposals] = useState<WorkflowProposal[] | null>(null);
  const [bookSummary, setBookSummary] = useState<BookSummary | null>(null);
  const [proposalPrompt, setProposalPrompt] = useState<string>("");
  const [materializingId, setMaterializingId] = useState<string | null>(null);

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

  const createBlank = async () => {
    setCreating(true); setError(null);
    try {
      const res = await fetch("/api/dante/workflows", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Untitled workflow" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      router.push(`/dante/workflows/${json.workflow.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
      setCreating(false);
    }
  };

  const generate = async () => {
    if (!prompt.trim()) return;
    setGenerating(true); setError(null);
    setProposals(null);
    try {
      const res = await fetch("/api/dante/workflows/propose", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Proposal generation failed");
      setProposals(json.proposals || []);
      setBookSummary(json.book_summary || null);
      setProposalPrompt(json.prompt || prompt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const materialize = async (proposal: WorkflowProposal) => {
    if (materializingId) return;
    setMaterializingId(proposal.id); setError(null);
    try {
      const res = await fetch("/api/dante/workflows/materialize", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: proposalPrompt,
          proposal,
          book_summary: bookSummary,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Materialize failed");
      router.push(`/dante/workflows/${json.workflow.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Materialize failed");
      setMaterializingId(null);
    }
  };

  const discardProposals = () => {
    setProposals(null);
    setBookSummary(null);
    setProposalPrompt("");
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

  const duplicate = async (id: string) => {
    setDuplicatingId(id);
    try {
      const res = await fetch(`/api/dante/workflows/${id}/duplicate`, {
        method: "POST", credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      router.push(`/dante/workflows/${json.workflow.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Duplicate failed");
    } finally { setDuplicatingId(null); }
  };

  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      {/* Top bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-6 md:px-8 py-4 bg-[var(--canvas)] border-b border-[var(--rule)]">
        <div className="flex items-center gap-3">
          <img src="/brand/logo-circle.png" alt="Drift" className="w-6 h-6 rounded-full object-cover" />
          <span className="text-sm font-semibold text-[var(--ink)]">Drift</span>
          <span className="text-xs text-[var(--ink-subtle)]">/</span>
          <DanteGateLink variant="breadcrumb" />
          <span className="text-xs text-[var(--ink-subtle)]">/</span>
          <span className="text-xs text-[var(--ink)]">Workflows</span>
        </div>
        <Link href="/dante" className="flex items-center gap-1.5 px-3 py-2 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition text-sm font-medium">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
          <span className="hidden sm:inline">{brand.name}</span>
        </Link>
      </div>

      <div className="px-6 md:px-8 py-8 max-w-[1100px] mx-auto">
        <div className="mb-8">
          <div className="label-section mb-2">Dante · Workflows</div>
          <div className="flex items-center justify-between">
            <h1 className="heading-display text-4xl text-[var(--ink)] mb-2">Workflows</h1>
            <Link href="/dante/workflows/health"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border border-[var(--rule)] text-xs font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition">
              <Activity className="w-3.5 h-3.5" strokeWidth={1.5} />
              Operations
            </Link>
          </div>
          <p className="text-sm text-[var(--ink-muted)] max-w-2xl">
            Chain HTTP calls, LLM prompts, and CRM actions into reusable
            automations. Triggered by schedule, webhook, or manual run.
          </p>
        </div>

        {error && (
          <div className="border border-[var(--rule)] bg-[var(--danger-soft)] rounded-[6px] p-4 mb-6 text-sm text-[var(--danger)]">
            {error}
          </div>
        )}

        {/* ── Generate with Dante ───────────────────────────── */}
        <section className="card-flat p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="border border-[var(--rule)] bg-[var(--canvas)] rounded-[4px] p-1.5">
              <DriftMark className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-[var(--ink)]">Generate with Dante</div>
              <div className="text-[11px] text-[var(--ink-subtle)]">
                Describe what you want and Dante builds the workflow. Tweak it on the canvas after.
              </div>
            </div>
          </div>

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="Every morning at 9am, query all new contacts from the last day and email me a summary."
            className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-3 py-2.5 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)] resize-y mb-3"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); generate(); }
            }}
          />

          <div className="flex flex-wrap items-center gap-2 mb-3">
            {EXAMPLE_PROMPTS.map((ex, i) => (
              <button
                key={i}
                onClick={() => setPrompt(ex)}
                className="text-[11px] text-[var(--ink-muted)] bg-[var(--canvas-subtle)] border border-[var(--rule)] rounded-full px-2.5 py-1 hover:bg-[var(--canvas)] hover:text-[var(--ink)] transition"
              >
                {ex.slice(0, 52)}{ex.length > 52 ? "…" : ""}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] text-[var(--ink-subtle)]">
              <kbd className="mono border border-[var(--rule)] rounded px-1 py-0.5">⌘</kbd>
              {" + "}
              <kbd className="mono border border-[var(--rule)] rounded px-1 py-0.5">Enter</kbd>
              {" to generate"}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={createBlank}
                disabled={creating || generating}
                className="flex items-center gap-1.5 px-3 py-2 rounded-[4px] border border-[var(--rule)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] text-sm font-medium transition disabled:opacity-50"
              >
                {creating
                  ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
                  : <Plus className="h-4 w-4" strokeWidth={1.5} />}
                Start blank
              </button>
              <button
                onClick={generate}
                disabled={generating || !prompt.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-[4px] bg-[var(--ink)] hover:opacity-90 text-[var(--canvas)] text-sm font-semibold transition disabled:opacity-50"
              >
                {generating
                  ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
                  : <DriftMark className="h-4 w-4" />}
                Generate
                {!generating && <ArrowRight className="w-3.5 h-3.5 opacity-60" strokeWidth={1.5} />}
              </button>
            </div>
          </div>
        </section>

        {/* ── Proposals ────────────────────────────────────── */}
        {proposals && proposals.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="label-section mb-1">Pick one — Dante grounded these in your book</div>
                <div className="text-[11px] text-[var(--ink-subtle)]">
                  {bookSummary ? (
                    <>
                      Based on {bookSummary.counts.contacts} contact{bookSummary.counts.contacts === 1 ? "" : "s"}
                      {typeof bookSummary.segments?.stale_60d === "number" && (
                        <> · {bookSummary.segments.stale_60d} stale · {bookSummary.segments.active_30d} active</>
                      )}
                    </>
                  ) : null}
                </div>
              </div>
              <button
                onClick={discardProposals}
                className="text-[11px] text-[var(--ink-muted)] hover:text-[var(--ink)] underline underline-offset-2"
              >
                Discard and start over
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {proposals.map((p) => {
                const isMaterializing = materializingId === p.id;
                const anyMaterializing = materializingId !== null;
                const TriggerIcon =
                  p.trigger.type === "cron" ? Clock
                    : p.trigger.type === "webhook" ? Webhook
                    : MousePointerClick;
                return (
                  <div
                    key={p.id}
                    className="card-flat p-5 flex flex-col gap-3 hover:border-[var(--rule-strong)] transition"
                  >
                    <div className="flex items-start gap-2">
                      <div className="border border-[var(--rule)] bg-[var(--canvas)] rounded-[4px] p-1.5 shrink-0">
                        <TriggerIcon className="w-3.5 h-3.5 text-[var(--ink)]" strokeWidth={1.5} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-[var(--ink)] leading-tight mb-1">
                          {p.title}
                        </h3>
                        <div className="text-[11px] text-[var(--ink-subtle)] truncate">
                          {p.trigger.detail || p.trigger.type}
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
                      {p.description}
                    </p>

                    <div className="border-t border-[var(--rule)] pt-3 space-y-2">
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <Users className="w-3 h-3 text-[var(--ink-subtle)]" strokeWidth={1.5} />
                        <span className="text-[var(--ink)] font-medium">
                          {p.projected_volume.estimate === null
                            ? "Volume unknown"
                            : `~${p.projected_volume.estimate} ${p.projected_volume.unit}`}
                        </span>
                      </div>
                      <div className="text-[11px] text-[var(--ink-subtle)] leading-relaxed pl-[18px]">
                        {p.projected_volume.reasoning}
                      </div>
                    </div>

                    {p.expected_impact && (
                      <div className="flex items-start gap-1.5 text-[11px] text-[var(--ink-muted)]">
                        <TrendingUp className="w-3 h-3 text-[var(--ink-subtle)] mt-0.5 shrink-0" strokeWidth={1.5} />
                        <span>{p.expected_impact}</span>
                      </div>
                    )}

                    {p.node_sketch.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {p.node_sketch.map((n, i) => (
                          <span
                            key={i}
                            className="mono text-[10px] text-[var(--ink-muted)] bg-[var(--canvas-subtle)] border border-[var(--rule)] rounded-full px-2 py-0.5"
                          >
                            {n}
                          </span>
                        ))}
                      </div>
                    )}

                    <button
                      onClick={() => materialize(p)}
                      disabled={anyMaterializing}
                      className="mt-auto flex items-center justify-center gap-1.5 px-3 py-2 rounded-[4px] bg-[var(--ink)] hover:opacity-90 text-[var(--canvas)] text-xs font-semibold transition disabled:opacity-50"
                    >
                      {isMaterializing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
                      ) : (
                        <DriftMark className="h-3.5 w-3.5" />
                      )}
                      {isMaterializing ? "Building…" : "Build this"}
                      {!isMaterializing && <ChevronRight className="w-3 h-3 opacity-70" strokeWidth={1.5} />}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── List ──────────────────────────────────────────── */}
        <div className="label-section mb-3">Your workflows</div>

        {loading ? (
          <div className="card-flat p-12 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--ink-muted)] mx-auto" strokeWidth={1.5} />
          </div>
        ) : rows.length === 0 ? (
          <div className="card-flat p-12 text-center">
            <Zap className="h-10 w-10 text-[var(--ink-subtle)] mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-[var(--ink-muted)] mb-1">No workflows yet</p>
            <p className="text-xs text-[var(--ink-subtle)]">
              Describe one above, or start from a blank canvas.
            </p>
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
                  {r.tags && r.tags.length > 0 && (
                    <div className="flex items-center gap-1 mt-1">
                      {r.tags.map((tag) => (
                        <span key={tag} className="inline-flex items-center gap-0.5 text-[10px] font-medium text-[var(--ink-muted)] bg-[var(--canvas-subtle)] border border-[var(--rule)] rounded-full px-2 py-0.5">
                          <Tag className="w-2.5 h-2.5" strokeWidth={1.5} />
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
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
                <button onClick={() => duplicate(r.id)} disabled={duplicatingId === r.id}
                  title="Duplicate"
                  className="p-2 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition disabled:opacity-50">
                  {duplicatingId === r.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                    : <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />}
                </button>
                <button onClick={() => remove(r.id)} disabled={deletingId === r.id}
                  title="Delete"
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
