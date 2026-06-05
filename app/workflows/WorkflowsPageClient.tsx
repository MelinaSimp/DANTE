"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DriftMark } from "@/components/dante/DriftMark";
import {
  Plus, Loader2, Play, Zap, AlertCircle,
  CheckCircle2, Circle, Trash2, ArrowRight,
  Clock, Webhook, MousePointerClick, TrendingUp,
  ChevronRight, Copy,
  Archive as ArchiveIcon, ArrowUpRight,
  ClipboardList, MailCheck, CalendarClock, Eye, Cake, Coins,
  TrendingDown, CalendarDays, FileSpreadsheet, UserCheck, BookOpen,
  UserPlus, Calculator, Share2, Landmark, RefreshCw, CalendarCheck,
  ScrollText, PiggyBank, Sparkles, Building2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from "@/lib/dante/templates";

const ICONS: Record<string, LucideIcon> = {
  ClipboardList, MailCheck, CalendarClock, Eye, Cake, Coins,
  TrendingDown, CalendarDays, FileSpreadsheet, UserCheck, BookOpen,
  UserPlus, Calculator, Share2, Landmark, RefreshCw, CalendarCheck,
  ScrollText, PiggyBank, Sparkles, Zap,
};

function accentClasses(accent: WorkflowTemplate["accent"]): { iconWrap: string; dot: string } {
  switch (accent) {
    case "verified": return { iconWrap: "bg-[var(--verified-soft)] text-[var(--verified)]", dot: "bg-[var(--verified)]" };
    case "accent":   return { iconWrap: "bg-[var(--accent-soft)] text-[var(--accent)]", dot: "bg-[var(--accent)]" };
    case "flag":     return { iconWrap: "bg-[var(--flag-soft)] text-[var(--flag)]", dot: "bg-[var(--flag)]" };
    case "ink": default: return { iconWrap: "bg-[var(--canvas-subtle)] text-[var(--ink)]", dot: "bg-[var(--ink)]" };
  }
}

const CATEGORY_ORDER: WorkflowTemplate["category"][] = [
  "Site intelligence", "Deal pipeline", "Lease management",
  "Operations", "Prospecting", "Client communication",
];

interface WorkflowRow {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  updated_at: string;
  proposal_state?: string | null;
}

interface StepLogEntry {
  step_id: string;
  step_name?: string;
  status: "success" | "error" | "skipped";
  output?: unknown;
  error?: string;
}

interface RunFeedItem {
  id: string;
  workflow_id: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  output: unknown;
  log: StepLogEntry[] | null;
}

interface WorkflowProposal {
  id: string;
  title: string;
  description: string;
  trigger: { type: "manual" | "cron" | "webhook"; detail: string };
  projected_volume: { estimate: number | null; unit: string; reasoning: string };
  expected_impact: string;
  node_sketch: string[];
  rationale: string;
  enriched_prompt: string;
}

interface BookSummary {
  workspace_id: string;
  counts: { contacts: number };
  segments: { stale_60d: number; new_30d: number; active_30d: number };
  pipeline?: {
    properties_total: number;
    active_listings: number;
    pending_offers: number;
    lease_abstractions_completed: number;
  };
  [key: string]: unknown;
}

const EXAMPLE_PROMPTS = [
  "Every morning, find leases expiring in 90 days and email me a summary with tenant details.",
  "When a new offer is submitted, classify it as strong or weak and notify me if it's strong.",
  "Run a corridor void analysis on the I-71 corridor between downtown Cleveland and Akron every Monday.",
];

interface Props {
  vaultReady: number;
  canManageVault: boolean;
}

export default function WorkflowsPageClient({ vaultReady, canManageVault }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<WorkflowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cloningSlug, setCloningSlug] = useState<string | null>(null);

  const [runFeed, setRunFeed] = useState<RunFeedItem[]>([]);
  const [runFeedLoading, setRunFeedLoading] = useState(true);
  const [runFeedError, setRunFeedError] = useState<string | null>(null);

  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [proposals, setProposals] = useState<WorkflowProposal[] | null>(null);
  const [bookSummary, setBookSummary] = useState<BookSummary | null>(null);
  const [proposalPrompt, setProposalPrompt] = useState<string>("");
  const [materializingId, setMaterializingId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<WorkflowTemplate["category"], WorkflowTemplate[]>();
    for (const t of WORKFLOW_TEMPLATES) {
      const bucket = map.get(t.category) || [];
      bucket.push(t);
      map.set(t.category, bucket);
    }
    return map;
  }, []);

  const vaultAwareCount = WORKFLOW_TEMPLATES.filter((t) => t.requiresVault).length;

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

  const loadRunFeed = useCallback(async () => {
    try {
      const res = await fetch("/api/dante/workflows/runs", { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load runs (${res.status})`);
      const json = await res.json();
      setRunFeed(json.runs || []);
      setRunFeedError(null);
    } catch (e) {
      setRunFeedError(e instanceof Error ? e.message : "Failed to load runs");
    } finally { setRunFeedLoading(false); }
  }, []);

  useEffect(() => { loadRunFeed(); }, [loadRunFeed]);

  const pendingProposals = rows.filter((r) => r.proposal_state === "pending");
  const activeWorkflows = rows.filter((r) => r.proposal_state !== "pending");

  const acceptProposal = async (id: string) => {
    try {
      await fetch(`/api/dante/workflows/${id}/proposal`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept" }),
      });
      setRows((prev) => prev.map((r) => r.id === id ? { ...r, proposal_state: null, enabled: true } : r));
    } catch { /* silent */ }
  };

  const declineProposal = async (id: string) => {
    try {
      await fetch(`/api/dante/workflows/${id}/proposal`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "decline" }),
      });
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch { /* silent */ }
  };

  const createBlank = async () => {
    setCreating(true); setError(null);
    try {
      const res = await fetch("/api/dante/workflows", {
        method: "POST", credentials: "include",
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
    setGenerating(true); setError(null); setProposals(null);
    try {
      const res = await fetch("/api/dante/workflows/propose", {
        method: "POST", credentials: "include",
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
    } finally { setGenerating(false); }
  };

  const materialize = async (proposal: WorkflowProposal) => {
    if (materializingId) return;
    setMaterializingId(proposal.id); setError(null);
    try {
      const res = await fetch("/api/dante/workflows/materialize", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: proposalPrompt, proposal, book_summary: bookSummary }),
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
    setProposals(null); setBookSummary(null); setProposalPrompt("");
  };

  const cloneTemplate = async (slug: string) => {
    setError(null); setCloningSlug(slug);
    try {
      const res = await fetch(`/api/dante/templates/${slug}/clone`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Clone failed (${res.status})`);
      const id: string | undefined = json?.workflow?.id;
      if (!id) throw new Error("Clone succeeded but no workflow id returned");
      // Stay on the workflows page so the user can clone more without
      // navigating back each time.
      setCloningSlug(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setCloningSlug(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this workflow and all of its run history?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/dante/workflows/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      setRows((p) => p.filter((r) => r.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally { setDeletingId(null); }
  };

  return (
    <div className="px-6 md:px-8 py-8 max-w-[1100px] mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="heading-display text-3xl text-[var(--ink)] mb-2">Workflows</h1>
        <p className="text-sm text-[var(--ink-muted)] max-w-2xl leading-relaxed">
          Chain LLM prompts, site intelligence, CRM queries, and actions into
          reusable automations. Triggered by schedule, webhook, or manual run.
        </p>
        <div className="mt-3 flex items-center gap-4 text-xs text-[var(--ink-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" strokeWidth={1.5} />
            <strong className="font-semibold text-[var(--ink)]">{rows.length}</strong> workflow{rows.length === 1 ? "" : "s"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <DriftMark className="w-3.5 h-3.5" />
            <strong className="font-semibold text-[var(--ink)]">{WORKFLOW_TEMPLATES.length}</strong> templates
          </span>
          {vaultAwareCount > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <ArchiveIcon className="w-3.5 h-3.5" strokeWidth={1.5} />
              <strong className="font-semibold text-[var(--ink)]">{vaultAwareCount}</strong> vault-aware
            </span>
          )}
          <Link
            href="/dante/workflows/health"
            className="inline-flex items-center gap-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
          >
            <TrendingUp className="w-3.5 h-3.5" strokeWidth={1.5} />
            Run health
            <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {error && (
        <div className="border border-[var(--rule)] bg-[var(--danger-soft)] rounded-[6px] p-4 mb-6 text-sm text-[var(--danger)] flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.5} />
          <span>{error}</span>
        </div>
      )}

      {/* Generate */}
      <section className="card-flat p-6 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <div className="border border-[var(--rule)] bg-[var(--canvas)] rounded-[4px] p-1.5">
            <DriftMark className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-[var(--ink)]">Generate a workflow</div>
            <div className="text-[11px] text-[var(--ink-subtle)]">
              Describe what you want and Drift builds the workflow from your book. Tweak it on the canvas after.
            </div>
          </div>
        </div>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="Every morning, find leases expiring in 90 days and email me a summary with tenant details."
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
              {ex.slice(0, 52)}{ex.length > 52 ? "..." : ""}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] text-[var(--ink-subtle)]">
            <kbd className="mono border border-[var(--rule)] rounded px-1 py-0.5">Cmd</kbd>
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

      {/* Proposals */}
      {proposals && proposals.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="label-section mb-1">Pick one -- grounded in your workspace data</div>
              <div className="text-[11px] text-[var(--ink-subtle)]">
                {bookSummary ? (
                  <>
                    Based on {bookSummary.counts.contacts} contact{bookSummary.counts.contacts === 1 ? "" : "s"}
                    {bookSummary.pipeline && (
                      <> · {bookSummary.pipeline.properties_total} properties · {bookSummary.pipeline.active_listings} active listings</>
                    )}
                  </>
                ) : null}
              </div>
            </div>
            <button onClick={discardProposals} className="text-[11px] text-[var(--ink-muted)] hover:text-[var(--ink)] underline underline-offset-2">
              Discard and start over
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {proposals.map((p) => {
              const isMat = materializingId === p.id;
              const anyMat = materializingId !== null;
              const TriggerIcon = p.trigger.type === "cron" ? Clock : p.trigger.type === "webhook" ? Webhook : MousePointerClick;
              return (
                <div key={p.id} className="card-flat p-5 flex flex-col gap-3 hover:border-[var(--rule-strong)] transition">
                  <div className="flex items-start gap-2">
                    <div className="border border-[var(--rule)] bg-[var(--canvas)] rounded-[4px] p-1.5 shrink-0">
                      <TriggerIcon className="w-3.5 h-3.5 text-[var(--ink)]" strokeWidth={1.5} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-[var(--ink)] leading-tight mb-1">{p.title}</h3>
                      <div className="text-[11px] text-[var(--ink-subtle)] truncate">{p.trigger.detail || p.trigger.type}</div>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--ink-muted)] leading-relaxed">{p.description}</p>
                  <div className="border-t border-[var(--rule)] pt-3 space-y-2">
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <Building2 className="w-3 h-3 text-[var(--ink-subtle)]" strokeWidth={1.5} />
                      <span className="text-[var(--ink)] font-medium">
                        {p.projected_volume.estimate === null ? "Volume unknown" : `~${p.projected_volume.estimate} ${p.projected_volume.unit}`}
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--ink-subtle)] leading-relaxed pl-[18px]">{p.projected_volume.reasoning}</div>
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
                        <span key={i} className="mono text-[10px] text-[var(--ink-muted)] bg-[var(--canvas-subtle)] border border-[var(--rule)] rounded-full px-2 py-0.5">{n}</span>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => materialize(p)}
                    disabled={anyMat}
                    className="mt-auto flex items-center justify-center gap-1.5 px-3 py-2 rounded-[4px] bg-[var(--ink)] hover:opacity-90 text-[var(--canvas)] text-xs font-semibold transition disabled:opacity-50"
                  >
                    {isMat ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} /> : <DriftMark className="h-3.5 w-3.5" />}
                    {isMat ? "Building..." : "Build this"}
                    {!isMat && <ChevronRight className="w-3 h-3 opacity-70" strokeWidth={1.5} />}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Pending proposals from Dante */}
      {pendingProposals.length > 0 && (
        <section className="mb-8">
          <div className="label-section mb-3">Pending proposals</div>
          <p className="text-xs text-[var(--ink-muted)] mb-3 -mt-1">
            Dante drafted these workflows for you. Review and accept to activate, or decline to discard.
          </p>
          <div className="space-y-2">
            {pendingProposals.map((r) => (
              <div key={r.id} className="card-flat flex items-center gap-4 px-5 py-4 border-l-2 border-l-[var(--accent)]">
                <div className="border border-[var(--rule)] bg-[var(--accent-soft)] rounded-[4px] p-2 shrink-0">
                  <DriftMark className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-[var(--ink)] truncate">{r.name}</h3>
                  {r.description && <p className="text-xs text-[var(--ink-muted)] line-clamp-1 mt-0.5">{r.description}</p>}
                </div>
                <Link href={`/dante/workflows/${r.id}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] border border-[var(--rule)] text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)] text-xs font-medium transition">
                  Review
                </Link>
                <button onClick={() => acceptProposal(r.id)}
                  className="px-3 py-1.5 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-xs font-medium hover:opacity-90 transition">
                  Accept
                </button>
                <button onClick={() => declineProposal(r.id)}
                  className="px-3 py-1.5 rounded-[4px] border border-[var(--rule)] text-[var(--ink-muted)] hover:text-[var(--danger)] hover:border-[var(--danger)] text-xs font-medium transition">
                  Decline
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent run results */}
      {!runFeedLoading && runFeedError && (
        <section className="mb-8">
          <div className="label-section mb-3">Recent results</div>
          <p className="text-sm text-[var(--flag)]">{runFeedError}</p>
        </section>
      )}
      {!runFeedLoading && !runFeedError && runFeed.length > 0 && (
        <section className="mb-8">
          <div className="label-section mb-3">Recent results</div>
          <div className="space-y-2">
            {runFeed.slice(0, 8).map((run) => {
              const wf = rows.find((r) => r.id === run.workflow_id);
              const isSuccess = run.status === "success";
              const summary = extractRunSummary(run);
              return (
                <div key={run.id} className="card-flat px-5 py-4">
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 mt-0.5">
                      {isSuccess
                        ? <CheckCircle2 className="w-4 h-4 text-[var(--verified)]" strokeWidth={1.5} />
                        : <AlertCircle className="w-4 h-4 text-[var(--danger)]" strokeWidth={1.5} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-[var(--ink)] truncate">
                          {wf?.name || "Workflow"}
                        </span>
                        <span className="text-[11px] text-[var(--ink-subtle)]">
                          {run.finished_at ? timeAgo(run.finished_at) : ""}
                        </span>
                      </div>
                      {run.error ? (
                        <p className="text-xs text-[var(--danger)] line-clamp-2 mono">{run.error}</p>
                      ) : summary ? (
                        <p className="text-xs text-[var(--ink-muted)] leading-relaxed line-clamp-3">{summary}</p>
                      ) : null}
                      {run.log && run.log.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {run.log.map((entry, i) => (
                            <span key={i} className={`text-[10px] mono rounded-full px-2 py-0.5 border border-[var(--rule)] ${
                              entry.status === "success" ? "text-[var(--verified)] bg-[var(--verified-soft)]"
                                : entry.status === "error" ? "text-[var(--danger)] bg-[var(--danger-soft)]"
                                : "text-[var(--ink-subtle)] bg-[var(--canvas-subtle)]"
                            }`}>
                              {entry.step_name || entry.step_id}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {wf && (
                      <Link href={`/dante/workflows/${wf.id}`}
                        className="shrink-0 text-[11px] text-[var(--ink-muted)] hover:text-[var(--ink)] underline underline-offset-2">
                        Details
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Your workflows */}
      <div className="label-section mb-3">Your workflows</div>

      {loading ? (
        <div className="card-flat p-12 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--ink-muted)] mx-auto" strokeWidth={1.5} />
        </div>
      ) : activeWorkflows.length === 0 ? (
        <div className="card-flat p-12 text-center mb-10">
          <Zap className="h-10 w-10 text-[var(--ink-subtle)] mx-auto mb-3" strokeWidth={1.5} />
          <p className="text-[var(--ink-muted)] mb-1">No workflows yet</p>
          <p className="text-xs text-[var(--ink-subtle)]">Generate one above, clone a template below, or start from a blank canvas.</p>
        </div>
      ) : (
        <div className="space-y-2 mb-10">
          {activeWorkflows.map((r) => (
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

      {/* Vault empty warning */}
      {vaultReady === 0 && (
        <div className="mb-8 card-flat p-4 flex items-start gap-3 border-[var(--flag-soft)] bg-[var(--flag-soft)]/50">
          <AlertCircle className="w-4 h-4 text-[var(--flag)] mt-0.5 shrink-0" strokeWidth={1.5} />
          <div className="flex-1 text-sm">
            <div className="font-semibold text-[var(--ink)] mb-0.5">
              {canManageVault ? "Your vault is empty." : "The firm vault is empty."}
            </div>
            <p className="text-[var(--ink-muted)] leading-relaxed">
              Templates marked <em>needs vault</em> will still run, but
              their document-search steps will return empty context.{" "}
              {canManageVault
                ? "Upload documents first and those templates become far more useful."
                : "Ask your workspace owner to upload core documents before running these."}
            </p>
            {canManageVault && (
              <Link href="/vault"
                className="mt-2 inline-flex items-center gap-1 text-[var(--accent)] hover:underline">
                Go to vault
                <ArrowUpRight className="w-3 h-3" strokeWidth={1.5} />
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Template gallery */}
      <div className="label-section mb-1">Starter templates</div>
      <p className="text-xs text-[var(--ink-muted)] mb-6">
        Pre-built workflows tuned for CRE brokers and developers. Clone one into your workspace and tweak it on the canvas.
      </p>

      <div className="space-y-10 pb-12">
        {CATEGORY_ORDER.map((cat) => {
          const templates = grouped.get(cat);
          if (!templates || templates.length === 0) return null;
          return (
            <section key={cat}>
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="text-sm font-semibold text-[var(--ink)] uppercase tracking-wider">{cat}</h2>
                <span className="text-xs text-[var(--ink-subtle)]">
                  {templates.length} template{templates.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                {templates.map((t) => {
                  const Icon = ICONS[t.icon] ?? Zap;
                  const a = accentClasses(t.accent);
                  const isCloning = cloningSlug === t.slug;
                  const disabled = cloningSlug !== null;
                  return (
                    <div key={t.slug} className="card-flat p-5 flex flex-col">
                      <div className="flex items-start gap-3 mb-3">
                        <div className={`${a.iconWrap} rounded-[4px] p-2.5 shrink-0`}>
                          <Icon className="w-5 h-5" strokeWidth={1.5} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <h3 className="text-[15px] font-semibold text-[var(--ink)]">{t.name}</h3>
                            {t.requiresVault && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[3px] bg-[var(--accent-soft)] text-[var(--accent)] text-[10px] font-medium">
                                <ArchiveIcon className="w-2.5 h-2.5" strokeWidth={1.5} />
                                needs vault
                              </span>
                            )}
                          </div>
                          <div className="inline-flex items-center gap-1 text-[11px] text-[var(--ink-muted)]">
                            <span className={`w-1.5 h-1.5 rounded-full ${a.dot}`} />
                            {t.triggerLabel}
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-[var(--ink-muted)] leading-relaxed mb-4">{t.description}</p>
                      <div className="mt-auto flex items-center justify-between gap-3">
                        <div className="text-[11px] text-[var(--ink-subtle)]">
                          {t.graph.nodes.length} step{t.graph.nodes.length === 1 ? "" : "s"}
                        </div>
                        <button
                          onClick={() => cloneTemplate(t.slug)}
                          disabled={disabled}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-xs font-medium hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {isCloning ? (
                            <><Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} /> Cloning...</>
                          ) : (
                            <><Copy className="w-3.5 h-3.5" strokeWidth={1.5} /> Clone to my workspace</>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function extractOutputText(o: Record<string, unknown>): string | null {
  if (typeof o.text === "string" && o.text.trim()) return o.text.trim().slice(0, 300);
  if (typeof o.answer === "string" && o.answer.trim()) return o.answer.trim().slice(0, 300);
  if (typeof o.context === "string" && o.context.trim()) return o.context.trim().slice(0, 300);
  if (typeof o.count === "number") return `${o.count} result${o.count === 1 ? "" : "s"} returned`;
  if (Array.isArray(o.delivered) && o.delivered.length > 0) return `${o.delivered.length} message${o.delivered.length === 1 ? "" : "s"} sent`;
  if (Array.isArray(o.hits) && o.hits.length > 0) return `${o.hits.length} hit${o.hits.length === 1 ? "" : "s"} found`;
  if (Array.isArray(o.results) && o.results.length > 0) return `${o.results.length} result${o.results.length === 1 ? "" : "s"} returned`;
  if (Array.isArray(o.abstracts) && o.abstracts.length > 0) return `${o.abstracts.length} lease${o.abstracts.length === 1 ? "" : "s"} found`;
  if (o.contact && typeof o.contact === "object") return "contact updated";
  if (typeof o.email_id === "string") return `email sent (${o.to || "recipient"})`;
  return null;
}

function extractRunSummary(run: RunFeedItem): string | null {
  if (run.output && typeof run.output === "object") {
    const out = run.output as Record<string, unknown>;
    const t = extractOutputText(out);
    if (t) return t;
  }
  if (run.log && run.log.length > 0) {
    for (let i = run.log.length - 1; i >= 0; i--) {
      const entry = run.log[i];
      if (entry.status === "success" && entry.output && typeof entry.output === "object") {
        const t = extractOutputText(entry.output as Record<string, unknown>);
        if (t) return t;
      }
    }
  }
  return null;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
