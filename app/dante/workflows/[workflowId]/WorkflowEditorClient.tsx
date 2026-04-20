"use client";

// app/dante/workflows/[workflowId]/WorkflowEditorClient.tsx
//
// The Dante workflow editor. Three panes stacked vertically:
//
//   1. Identity (name + description + enabled toggle)
//   2. Steps (ordered list, add / remove / reorder, typed form per step)
//   3. Run pane (Run button + last run log + status)
//
// The step editor renders a per-type form — HTTP, OpenAI, query
// clients, update contact, send email, condition, delay. Each
// config field is free text so users can paste in {{steps.x.y}}
// template refs the runner will resolve. Phase 2 layers a visual
// node canvas on top of the same backing store.

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Save, Loader2, Play, Plus, Trash2, GripVertical,
  AlertCircle, CheckCircle2, Globe, Sparkles, Users, Mail,
  Pencil, GitBranch, Clock, Zap, Power, ChevronDown, ChevronUp,
} from "lucide-react";

// ── Step type metadata ────────────────────────────────────────

const STEP_TYPES = [
  { type: "http",           label: "HTTP request",     icon: Globe,     hint: "Fetch any URL" },
  { type: "openai",         label: "OpenAI prompt",    icon: Sparkles,  hint: "Chat completion → text" },
  { type: "query_clients",  label: "Query clients",    icon: Users,     hint: "Select rows from contacts" },
  { type: "update_contact", label: "Update contact",   icon: Pencil,    hint: "Patch a single contact row" },
  { type: "send_email",     label: "Send email",       icon: Mail,      hint: "Resend transactional send" },
  { type: "condition",      label: "Condition",        icon: GitBranch, hint: "Stop or continue on expr" },
  { type: "delay",          label: "Delay",            icon: Clock,     hint: "Pause up to 60s" },
] as const;

type StepType = typeof STEP_TYPES[number]["type"];

interface Step {
  id: string;
  type: StepType;
  name?: string;
  config: Record<string, unknown>;
  on_error?: "stop" | "continue";
}

interface WorkflowRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  trigger: unknown;
  steps: Step[];
  last_run_at: string | null;
  last_run_status: string | null;
}

interface StepLog {
  step_id: string;
  step_type: string;
  step_name: string;
  status: "success" | "error" | "skipped";
  started_at: string;
  finished_at: string;
  output?: unknown;
  error?: string;
}

// ── Default configs per step type ─────────────────────────────

function defaultConfig(type: StepType): Record<string, unknown> {
  switch (type) {
    case "http":           return { url: "https://", method: "GET", headers: {}, body: null };
    case "openai":         return { model: "gpt-4o-mini", system: "", prompt: "", max_tokens: 800 };
    case "query_clients":  return { filter: {}, limit: 25 };
    case "update_contact": return { contact_id: "", patch: {} };
    case "send_email":     return { to: "", subject: "", html: "", text: "" };
    case "condition":      return { expression: "", on_false: "stop" };
    case "delay":          return { seconds: 5 };
  }
}

function makeStep(type: StepType): Step {
  return {
    id: `step_${Math.random().toString(36).slice(2, 9)}`,
    type,
    name: STEP_TYPES.find((t) => t.type === type)?.label,
    config: defaultConfig(type),
  };
}

// ── Main component ────────────────────────────────────────────

export default function WorkflowEditorClient({ workflow }: { workflow: WorkflowRow }) {
  const router = useRouter();

  const [name, setName] = useState(workflow.name);
  const [description, setDescription] = useState(workflow.description ?? "");
  const [enabled, setEnabled] = useState(workflow.enabled);
  const [steps, setSteps] = useState<Step[]>(
    Array.isArray(workflow.steps) ? workflow.steps : []
  );
  const [expanded, setExpanded] = useState<string | null>(steps[0]?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [runLog, setRunLog] = useState<StepLog[] | null>(null);
  const [runStatus, setRunStatus] = useState<"success" | "error" | null>(null);

  // ── Save ──────────────────────────────────────────────────

  const save = useCallback(async () => {
    setSaving(true); setSaveStatus("idle"); setError(null);
    try {
      const res = await fetch(`/api/dante/workflows/${workflow.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, enabled, steps }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSaveStatus("error");
    } finally { setSaving(false); }
  }, [workflow.id, name, description, enabled, steps]);

  // ── Run ───────────────────────────────────────────────────
  // We save first so the run uses the current step list.

  const run = useCallback(async () => {
    setRunning(true); setError(null); setRunLog(null); setRunStatus(null);
    try {
      await fetch(`/api/dante/workflows/${workflow.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, enabled, steps }),
      });
      const res = await fetch(`/api/dante/workflows/${workflow.id}/run`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: {} }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Run failed");
      setRunLog(json.log);
      setRunStatus(json.status);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Run failed");
      setRunStatus("error");
    } finally { setRunning(false); }
  }, [workflow.id, name, description, enabled, steps]);

  // ── Step mutations ────────────────────────────────────────

  const addStep = (type: StepType) => {
    const s = makeStep(type);
    setSteps((p) => [...p, s]);
    setExpanded(s.id);
  };
  const removeStep = (id: string) => {
    setSteps((p) => p.filter((s) => s.id !== id));
    if (expanded === id) setExpanded(null);
  };
  const moveStep = (id: string, dir: -1 | 1) => {
    setSteps((p) => {
      const i = p.findIndex((s) => s.id === id);
      if (i < 0) return p;
      const j = i + dir;
      if (j < 0 || j >= p.length) return p;
      const copy = [...p];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  };
  const updateStep = (id: string, patch: Partial<Step>) => {
    setSteps((p) => p.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };
  const updateConfig = (id: string, key: string, value: unknown) => {
    setSteps((p) => p.map((s) => (s.id === id ? { ...s, config: { ...s.config, [key]: value } } : s)));
  };

  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      {/* Top bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-6 md:px-8 py-4 bg-[var(--canvas)] border-b border-[var(--rule)]">
        <div className="flex items-center gap-3 min-w-0">
          <img src="/brand/logo-circle.png" alt="Drift" className="w-6 h-6 rounded-full object-cover" />
          <span className="text-sm font-semibold text-[var(--ink)]">Drift</span>
          <span className="text-xs text-[var(--ink-subtle)]">/</span>
          <Link href="/dante" className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)]">Dante</Link>
          <span className="text-xs text-[var(--ink-subtle)]">/</span>
          <Link href="/dante/workflows" className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)]">Workflows</Link>
          <span className="text-xs text-[var(--ink-subtle)]">/</span>
          <span className="text-xs text-[var(--ink)] truncate">{name}</span>
        </div>
        <div className="flex items-center gap-2">
          {saveStatus === "saved" && (
            <span className="text-xs text-[var(--verified)] flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} /> Saved
            </span>
          )}
          <button onClick={save} disabled={saving}
            className="flex items-center gap-1.5 px-3 py-2 rounded-[4px] border border-[var(--rule)] text-[var(--ink)] hover:bg-[var(--canvas-subtle)] text-sm font-medium transition disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} /> : <Save className="w-4 h-4" strokeWidth={1.5} />}
            Save
          </button>
          <button onClick={run} disabled={running || steps.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-[4px] bg-[var(--ink)] hover:opacity-90 text-[var(--canvas)] text-sm font-semibold transition disabled:opacity-50">
            {running ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} /> : <Play className="w-4 h-4" strokeWidth={1.5} />}
            Run
          </button>
          <Link href="/dante/workflows"
            className="flex items-center gap-1.5 px-3 py-2 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition text-sm font-medium">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
            <span className="hidden sm:inline">Workflows</span>
          </Link>
        </div>
      </div>

      <div className="px-6 md:px-8 py-8 max-w-[1200px] mx-auto">
        {error && (
          <div className="border border-[var(--rule)] bg-[var(--danger-soft)] rounded-[6px] p-4 mb-6 text-sm text-[var(--danger)]">
            {error}
          </div>
        )}

        {/* Identity */}
        <section className="card-flat p-6 mb-6">
          <div className="label-section mb-4">Identity</div>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-[var(--ink-muted)] mb-1.5 block">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]" />
            </div>
            <div>
              <label className="text-xs text-[var(--ink-muted)] mb-1.5 block">Description</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this workflow do?"
                className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]" />
            </div>
            <label className="flex items-center gap-2 text-sm text-[var(--ink)] cursor-pointer">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)}
                className="accent-[var(--ink)]" />
              <Power className="w-3.5 h-3.5" strokeWidth={1.5} />
              Enabled
            </label>
          </div>
        </section>

        {/* Steps */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="label-section">Steps</div>
              <p className="text-xs text-[var(--ink-subtle)] mt-1">
                Runs top-to-bottom. Use <code className="mono bg-[var(--canvas-subtle)] px-1 rounded">{"{{steps.<id>.<field>}}"}</code> to reference a prior step&apos;s output.
              </p>
            </div>
          </div>

          <div className="space-y-2 mb-4">
            {steps.map((s, idx) => {
              const meta = STEP_TYPES.find((t) => t.type === s.type);
              const Icon = meta?.icon || Zap;
              const isOpen = expanded === s.id;
              return (
                <div key={s.id} className="card-flat overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="flex flex-col gap-0.5 text-[var(--ink-subtle)]">
                      <button onClick={() => moveStep(s.id, -1)} disabled={idx === 0}
                        className="hover:text-[var(--ink)] disabled:opacity-30">
                        <ChevronUp className="w-3 h-3" strokeWidth={1.5} />
                      </button>
                      <button onClick={() => moveStep(s.id, 1)} disabled={idx === steps.length - 1}
                        className="hover:text-[var(--ink)] disabled:opacity-30">
                        <ChevronDown className="w-3 h-3" strokeWidth={1.5} />
                      </button>
                    </div>
                    <GripVertical className="w-3.5 h-3.5 text-[var(--ink-subtle)]" strokeWidth={1.5} />
                    <div className="border border-[var(--rule)] bg-[var(--canvas)] rounded-[4px] p-1.5 shrink-0">
                      <Icon className="w-3.5 h-3.5 text-[var(--ink)]" strokeWidth={1.5} />
                    </div>
                    <button onClick={() => setExpanded(isOpen ? null : s.id)}
                      className="flex-1 min-w-0 text-left">
                      <div className="text-sm font-medium text-[var(--ink)] truncate">
                        {s.name || meta?.label}
                      </div>
                      <div className="text-[11px] text-[var(--ink-subtle)] mono truncate">
                        {s.id} · {meta?.hint}
                      </div>
                    </button>
                    <button onClick={() => removeStep(s.id)}
                      className="p-1.5 text-[var(--ink-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] rounded-[4px] transition">
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                  </div>

                  {isOpen && (
                    <div className="border-t border-[var(--rule)] bg-[var(--canvas-subtle)] px-4 py-4">
                      <div className="mb-3">
                        <label className="text-xs text-[var(--ink-muted)] mb-1.5 block">Step name</label>
                        <input value={s.name || ""} onChange={(e) => updateStep(s.id, { name: e.target.value })}
                          className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]" />
                      </div>
                      <StepConfig step={s} onChange={(key, value) => updateConfig(s.id, key, value)} />
                      <div className="mt-3 flex items-center gap-2">
                        <label className="text-xs text-[var(--ink-muted)]">On error</label>
                        <select value={s.on_error || "stop"}
                          onChange={(e) => updateStep(s.id, { on_error: e.target.value as "stop" | "continue" })}
                          className="text-xs bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-2 py-1 text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]">
                          <option value="stop">Stop workflow</option>
                          <option value="continue">Continue to next step</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {steps.length === 0 && (
              <div className="card-flat p-8 text-center">
                <Zap className="h-8 w-8 text-[var(--ink-subtle)] mx-auto mb-2" strokeWidth={1.5} />
                <p className="text-sm text-[var(--ink-muted)]">No steps yet. Add one below.</p>
              </div>
            )}
          </div>

          {/* Add-step menu */}
          <div className="card-flat p-4">
            <div className="label-section mb-3">Add step</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {STEP_TYPES.map(({ type, label, icon: Icon, hint }) => (
                <button key={type} onClick={() => addStep(type)}
                  className="flex items-start gap-2 px-3 py-2.5 rounded-[4px] border border-[var(--rule)] hover:border-[var(--rule-strong)] hover:bg-[var(--canvas-subtle)] text-left transition">
                  <div className="border border-[var(--rule)] bg-[var(--canvas)] rounded-[4px] p-1 shrink-0">
                    <Icon className="w-3 h-3 text-[var(--ink)]" strokeWidth={1.5} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-[var(--ink)]">{label}</div>
                    <div className="text-[10px] text-[var(--ink-subtle)] truncate">{hint}</div>
                  </div>
                  <Plus className="w-3 h-3 text-[var(--ink-subtle)] ml-auto shrink-0" strokeWidth={1.5} />
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Run log */}
        {runLog && (
          <section className="card-flat p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="label-section">Last run</div>
              {runStatus && (
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border border-[var(--rule)] ${
                  runStatus === "success"
                    ? "text-[var(--verified)] bg-[var(--verified-soft)]"
                    : "text-[var(--danger)] bg-[var(--danger-soft)]"
                }`}>
                  {runStatus === "success"
                    ? <CheckCircle2 className="w-3 h-3" strokeWidth={1.5} />
                    : <AlertCircle className="w-3 h-3" strokeWidth={1.5} />}
                  {runStatus}
                </span>
              )}
            </div>
            <div className="space-y-3">
              {runLog.map((entry) => (
                <div key={entry.step_id} className="border border-[var(--rule)] rounded-[4px] p-3 bg-[var(--canvas-subtle)]">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      {entry.status === "success"
                        ? <CheckCircle2 className="w-3 h-3 text-[var(--verified)]" strokeWidth={1.5} />
                        : <AlertCircle className="w-3 h-3 text-[var(--danger)]" strokeWidth={1.5} />}
                      <span className="text-xs font-medium text-[var(--ink)]">{entry.step_name}</span>
                      <span className="text-[10px] text-[var(--ink-subtle)] mono">{entry.step_type}</span>
                    </div>
                    <span className="text-[10px] text-[var(--ink-subtle)]">
                      {durationMs(entry.started_at, entry.finished_at)}ms
                    </span>
                  </div>
                  {entry.error && (
                    <pre className="mono text-[10px] text-[var(--danger)] bg-[var(--danger-soft)] rounded-[4px] p-2 whitespace-pre-wrap break-words">
                      {entry.error}
                    </pre>
                  )}
                  {entry.output !== undefined && entry.status === "success" && (
                    <pre className="mono text-[10px] text-[var(--ink)] bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] p-2 whitespace-pre-wrap break-words max-h-40 overflow-auto">
                      {JSON.stringify(entry.output, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function durationMs(start: string, end: string): number {
  return Math.max(0, new Date(end).getTime() - new Date(start).getTime());
}

// ── Per-step config form ──────────────────────────────────────
// Each branch is a straightforward <input>/<textarea> shape mapped
// to the fields the runner expects. Kept in this file to avoid a
// fanout of tiny components — if it gets bigger we'll split later.

function StepConfig({
  step,
  onChange,
}: {
  step: Step;
  onChange: (key: string, value: unknown) => void;
}) {
  const cfg = step.config;
  const Input = ({ k, label, placeholder }: { k: string; label: string; placeholder?: string }) => (
    <div className="mb-3">
      <label className="text-xs text-[var(--ink-muted)] mb-1.5 block">{label}</label>
      <input value={(cfg[k] as string) ?? ""} placeholder={placeholder}
        onChange={(e) => onChange(k, e.target.value)}
        className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-3 py-2 text-sm text-[var(--ink)] mono focus:outline-none focus:border-[var(--rule-strong)]" />
    </div>
  );
  const Textarea = ({ k, label, placeholder, rows = 4 }: { k: string; label: string; placeholder?: string; rows?: number }) => (
    <div className="mb-3">
      <label className="text-xs text-[var(--ink-muted)] mb-1.5 block">{label}</label>
      <textarea value={(cfg[k] as string) ?? ""} placeholder={placeholder} rows={rows}
        onChange={(e) => onChange(k, e.target.value)}
        className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-3 py-2 text-sm text-[var(--ink)] mono focus:outline-none focus:border-[var(--rule-strong)] resize-y" />
    </div>
  );
  const Json = ({ k, label, placeholder, rows = 4 }: { k: string; label: string; placeholder?: string; rows?: number }) => {
    const current = typeof cfg[k] === "string" ? (cfg[k] as string) : JSON.stringify(cfg[k] ?? {}, null, 2);
    return (
      <div className="mb-3">
        <label className="text-xs text-[var(--ink-muted)] mb-1.5 block">{label} <span className="text-[var(--ink-subtle)]">(JSON)</span></label>
        <textarea defaultValue={current} placeholder={placeholder} rows={rows}
          onBlur={(e) => {
            try { onChange(k, JSON.parse(e.target.value || "{}")); }
            catch { /* leave as-is; user will correct */ }
          }}
          className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-3 py-2 text-sm text-[var(--ink)] mono focus:outline-none focus:border-[var(--rule-strong)] resize-y" />
      </div>
    );
  };

  switch (step.type) {
    case "http":
      return (
        <>
          <Input k="url" label="URL" placeholder="https://api.example.com/endpoint" />
          <div className="mb-3">
            <label className="text-xs text-[var(--ink-muted)] mb-1.5 block">Method</label>
            <select value={(cfg.method as string) || "GET"}
              onChange={(e) => onChange("method", e.target.value)}
              className="bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]">
              {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <Json k="headers" label="Headers" placeholder='{"Authorization": "Bearer ..."}' rows={3} />
          <Json k="body" label="Body" placeholder='{"key": "value"}' rows={4} />
        </>
      );
    case "openai":
      return (
        <>
          <Input k="model" label="Model" placeholder="gpt-4o-mini" />
          <Textarea k="system" label="System" placeholder="You are a helpful assistant." rows={2} />
          <Textarea k="prompt" label="Prompt" placeholder="Use {{steps.<id>.<field>}} to reference prior output." rows={6} />
          <Input k="max_tokens" label="Max tokens" placeholder="800" />
        </>
      );
    case "query_clients":
      return (
        <>
          <Json k="filter" label="Filter" placeholder='{"email": "alice@example.com"}' rows={3} />
          <Input k="limit" label="Limit" placeholder="25" />
        </>
      );
    case "update_contact":
      return (
        <>
          <Input k="contact_id" label="Contact ID" placeholder="{{steps.find.contacts.0.id}}" />
          <Json k="patch" label="Patch" placeholder='{"phone": "+1555..."}' rows={4} />
        </>
      );
    case "send_email":
      return (
        <>
          <Input k="to" label="To" placeholder="alice@example.com" />
          <Input k="subject" label="Subject" placeholder="Follow-up from Drift" />
          <Textarea k="html" label="HTML body" rows={4} />
          <Textarea k="text" label="Text body" rows={3} />
        </>
      );
    case "condition":
      return (
        <>
          <Input k="expression" label="Expression"
            placeholder={'{{steps.classify.text}} contains "yes"'} />
          <div className="mb-3">
            <label className="text-xs text-[var(--ink-muted)] mb-1.5 block">If false</label>
            <select value={(cfg.on_false as string) || "stop"}
              onChange={(e) => onChange("on_false", e.target.value)}
              className="bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]">
              <option value="stop">Stop workflow</option>
              <option value="continue">Continue to next step</option>
            </select>
          </div>
        </>
      );
    case "delay":
      return <Input k="seconds" label="Seconds (max 60)" placeholder="5" />;
    default:
      return null;
  }
}
