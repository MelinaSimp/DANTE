"use client";

// app/dante/workflows/[workflowId]/WorkflowEditorClient.tsx
//
// The Dante workflow canvas. Phase-2 editor — replaces the linear
// step list with a React Flow DAG.
//
// Layout:
//   ┌──────────────────────────────────────────────────────────────┐
//   │ Top bar: breadcrumbs · identity · Save · Run · Back          │
//   ├────────────────────────┬─────────────────────────────────────┤
//   │ Palette (icon strip)   │ ReactFlow canvas                    │
//   │                        │                                     │
//   │                        │  [trigger]                          │
//   │                        │     │                               │
//   │                        │  [step]  …                          │
//   │                        │                                     │
//   │                        ├─────────────────────────────────────┤
//   │                        │ Run log (collapsible)               │
//   └────────────────────────┴─────────────────────────────────────┘
//
// Selecting a node opens the right-hand drawer with a per-type
// config form. New nodes are created by clicking a palette item
// or dragging from it onto the canvas.

import {
  useState, useCallback, useMemo, useEffect,
} from "react";
import Link from "next/link";
import DanteGateLink from "@/components/dante/DanteGateLink";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  ReactFlowProvider,
  type Node as RFNode,
  type Edge as RFEdge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  ArrowLeft, Save, Loader2, Play, Trash2, AlertCircle,
  CheckCircle2, Power, X, Plus, Copy, ChevronDown, ChevronUp,
  Sparkles, History, Clock, FlaskConical, BarChart3,
} from "lucide-react";

import type {
  StepType,
  WorkflowStep,
  WorkflowGraph,
  GraphNode,
  GraphEdge,
  StepLogEntry,
} from "@/lib/dante/workflow-types";
import { definitionFromRow } from "@/lib/dante/workflow-types";

import DanteNode, { type DanteNodeData } from "./canvas/DanteNode";
import StepConfigForm, { type StepPatch } from "./canvas/StepConfigForm";
import { NODE_TYPES, getMeta, isTriggerType } from "./canvas/nodeTypes";

// ── Types ─────────────────────────────────────────────────────

interface WorkflowRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  trigger: unknown;
  steps: unknown;
  graph: unknown;
  last_run_at: string | null;
  last_run_status: string | null;
}

// React Flow speaks generic Node<TData>; ours always carries DanteNodeData.
type DanteRFNode = RFNode<DanteNodeData>;

// Run history types. The list endpoint returns lightweight rows; the
// per-run GET fills in log + output when a row is expanded.
interface RunHistoryRow {
  id: string;
  status: "success" | "error" | "running" | string;
  started_at: string;
  finished_at: string | null;
  error: string | null;
}
interface RunDetail extends RunHistoryRow {
  input: unknown;
  output: unknown;
  log: StepLogEntry[] | null;
}

// ── Helpers ───────────────────────────────────────────────────

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

function graphToFlow(graph: WorkflowGraph): { nodes: DanteRFNode[]; edges: RFEdge[] } {
  const nodes: DanteRFNode[] = graph.nodes.map((n) => ({
    id: n.id,
    // Single React Flow node type — the StepType is carried in data.step.type.
    type: "dante",
    position: n.position,
    data: { step: n.data.step },
  }));
  const edges: RFEdge[] = graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    // Use a labeled edge for condition branches so you can see which
    // handle each edge came from at a glance.
    label: e.sourceHandle ? e.sourceHandle : undefined,
    labelStyle: e.sourceHandle === "true"
      ? { fill: "var(--verified)", fontSize: 10, fontFamily: "ui-monospace, monospace" }
      : e.sourceHandle === "false"
      ? { fill: "var(--danger)", fontSize: 10, fontFamily: "ui-monospace, monospace" }
      : undefined,
    style: { stroke: "var(--ink-muted)", strokeWidth: 1.5 },
  }));
  return { nodes, edges };
}

function flowToGraph(nodes: DanteRFNode[], edges: RFEdge[]): WorkflowGraph {
  const gNodes: GraphNode[] = nodes.map((n) => ({
    id: n.id,
    type: n.data.step.type,
    position: n.position,
    data: { step: n.data.step },
  }));
  const gEdges: GraphEdge[] = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: (e.sourceHandle === "true" || e.sourceHandle === "false")
      ? e.sourceHandle
      : undefined,
  }));
  return { nodes: gNodes, edges: gEdges };
}

// ── Component ─────────────────────────────────────────────────

export default function WorkflowEditorClient({ workflow }: { workflow: WorkflowRow }) {
  // Normalize the DB row into a WorkflowDefinition — this tolerates
  // both the legacy `steps` linear shape and the new `graph` shape.
  const initial = useMemo(() => definitionFromRow({
    id: workflow.id,
    workspace_id: workflow.workspace_id,
    name: workflow.name,
    description: workflow.description,
    enabled: workflow.enabled,
    trigger: workflow.trigger,
    graph: workflow.graph,
    steps: workflow.steps,
  }), [workflow]);

  // If the workflow somehow has no nodes (new blank), seed a manual trigger.
  const seeded: WorkflowGraph = initial.graph.nodes.length > 0
    ? initial.graph
    : { nodes: [{
        id: "trigger",
        type: "trigger_manual",
        position: { x: 80, y: 80 },
        data: { step: { id: "trigger", type: "trigger_manual", name: "Manual trigger", config: {} } },
      }], edges: [] };

  const initialFlow = useMemo(() => graphToFlow(seeded), [seeded]);

  const [name, setName]       = useState(initial.name);
  const [description, setDesc] = useState(initial.description ?? "");
  const [enabled, setEnabled] = useState(initial.enabled);

  const [nodes, setNodes] = useState<DanteRFNode[]>(initialFlow.nodes);
  const [edges, setEdges] = useState<RFEdge[]>(initialFlow.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [dryRunning, setDryRunning] = useState(false);
  const [isDryRun, setIsDryRun] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [runLog, setRunLog] = useState<StepLogEntry[] | null>(null);
  // Status covers transient queue states too so the pill in the log
  // header reflects live progress during polling.
  const [runStatus, setRunStatus] = useState<"queued" | "running" | "success" | "error" | null>(null);
  const [logOpen, setLogOpen] = useState(true);
  const [webhookToken, setWebhookToken] = useState<string | null>(null);
  const [mintingToken, setMintingToken] = useState(false);

  // Run history drawer state. Opens from the toolbar; rows show
  // status + when, expand to load the full log.
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState<RunHistoryRow[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<RunDetail | null>(null);
  const [runDetailLoading, setRunDetailLoading] = useState(false);

  // ── React Flow callbacks ──────────────────────────────────

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((ns) => applyNodeChanges(changes, ns) as DanteRFNode[]),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((es) => applyEdgeChanges(changes, es)),
    [],
  );
  const onConnect = useCallback(
    (conn: Connection) => {
      const handle = conn.sourceHandle === "true" || conn.sourceHandle === "false"
        ? conn.sourceHandle : undefined;
      setEdges((es) => addEdge({
        ...conn,
        id: `${conn.source}->${conn.target}${handle ? `:${handle}` : ""}_${Math.random().toString(36).slice(2,5)}`,
        label: handle,
        labelStyle: handle === "true"
          ? { fill: "var(--verified)", fontSize: 10, fontFamily: "ui-monospace, monospace" }
          : handle === "false"
          ? { fill: "var(--danger)", fontSize: 10, fontFamily: "ui-monospace, monospace" }
          : undefined,
        style: { stroke: "var(--ink-muted)", strokeWidth: 1.5 },
      }, es));
    },
    [],
  );

  // ── Node ops ──────────────────────────────────────────────

  const addNode = useCallback((type: StepType) => {
    const meta = getMeta(type);
    if (!meta) return;

    // If this is a trigger and we already have one, don't stack them —
    // swap it out so the user always has exactly one entry point.
    if (isTriggerType(type)) {
      const existingTrigger = nodes.find((n) => isTriggerType(n.data.step.type));
      if (existingTrigger) {
        const step = meta.default(existingTrigger.id);
        setNodes((ns) => ns.map((n) => n.id === existingTrigger.id
          ? { ...n, data: { ...n.data, step } }
          : n));
        setSelectedId(existingTrigger.id);
        return;
      }
    }

    // Place the new node below the lowest existing node so they don't
    // overlap on first drop.
    const maxY = nodes.reduce((m, n) => Math.max(m, n.position.y), 0);
    const pos = { x: 80 + Math.random() * 40, y: maxY + 160 };

    const id = isTriggerType(type) ? "trigger" : newId(type.split("_")[0]);
    const step = meta.default(id);
    const newNode: DanteRFNode = {
      id,
      type: "dante",
      position: pos,
      data: { step },
    };
    setNodes((ns) => [...ns, newNode]);
    setSelectedId(id);
  }, [nodes]);

  const deleteNode = useCallback((id: string) => {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
    if (selectedId === id) setSelectedId(null);
  }, [selectedId]);

  const updateSelectedStep = useCallback((patch: StepPatch) => {
    if (!selectedId) return;
    setNodes((ns) => ns.map((n) => {
      if (n.id !== selectedId) return n;
      const nextStep = { ...n.data.step, ...patch } as WorkflowStep;
      return { ...n, data: { ...n.data, step: nextStep } };
    }));
  }, [selectedId]);

  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;

  // ── Save / run ────────────────────────────────────────────

  const save = useCallback(async () => {
    setSaving(true); setSaveStatus("idle"); setError(null);
    try {
      const graph = flowToGraph(nodes, edges);
      // Derive the top-level trigger tag from the graph's trigger.
      const triggerNode = graph.nodes.find((n) => isTriggerType(n.type));
      const triggerTag = triggerNode?.type === "trigger_cron"    ? { type: "cron" }
                       : triggerNode?.type === "trigger_webhook" ? { type: "webhook" }
                       : { type: "manual" };
      const res = await fetch(`/api/dante/workflows/${workflow.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, enabled, trigger: triggerTag, graph }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSaveStatus("error");
    } finally { setSaving(false); }
  }, [workflow.id, name, description, enabled, nodes, edges]);

  const run = useCallback(async () => {
    setRunning(true); setError(null); setRunLog(null); setRunStatus(null);
    try {
      // Save first so the run uses the current canvas.
      const graph = flowToGraph(nodes, edges);
      const triggerNode = graph.nodes.find((n) => isTriggerType(n.type));
      const triggerTag = triggerNode?.type === "trigger_cron"    ? { type: "cron" }
                       : triggerNode?.type === "trigger_webhook" ? { type: "webhook" }
                       : { type: "manual" };
      await fetch(`/api/dante/workflows/${workflow.id}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, enabled, trigger: triggerTag, graph }),
      });

      // Queue mode — enqueue then poll the run detail endpoint until
      // we reach a terminal state. Unlocks workflows that exceed the
      // 60s synchronous route budget (long OpenAI calls, chained HTTP).
      const enqueueRes = await fetch(`/api/dante/workflows/${workflow.id}/run`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: {}, mode: "queue" }),
      });
      const enqueueJson = await enqueueRes.json();
      if (!enqueueRes.ok) throw new Error(enqueueJson.error || "Enqueue failed");

      const runId: string = enqueueJson.run_id;
      setLogOpen(true);
      setRunStatus("queued");

      // Poll. Cap at ~5 minutes to avoid a client tab spinning forever
      // if something wedged; the DB row is the source of truth either
      // way. We back off slightly after the first few ticks so a slow
      // run doesn't hammer the endpoint.
      const started = Date.now();
      const MAX_MS = 5 * 60 * 1000;
      let delay = 1200;
      let terminal = false;
      while (!terminal && Date.now() - started < MAX_MS) {
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(3000, delay + 200);
        const detailRes = await fetch(
          `/api/dante/workflows/runs/${runId}`,
          { credentials: "include" },
        );
        if (!detailRes.ok) continue; // transient — keep polling
        const detailJson = await detailRes.json();
        const rd = detailJson.run;
        if (!rd) continue;
        if (rd.status === "success" || rd.status === "error") {
          setRunLog(rd.log ?? []);
          setRunStatus(rd.status);
          if (rd.status === "error" && rd.error) setError(rd.error);
          terminal = true;
        } else {
          // Keep showing the "queued"/"running" ghost state; rely on
          // the next poll to update.
          setRunStatus(rd.status as "queued" | "running");
        }
      }
      if (!terminal) {
        setError("Run is still executing — check the history drawer.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Run failed");
      setRunStatus("error");
      setLogOpen(true);
    } finally { setRunning(false); setIsDryRun(false); }
  }, [workflow.id, name, description, enabled, nodes, edges]);

  // Test run — simulate=true. Save the canvas first (so the server
  // evaluates what you see), then hit /dry-run. Destructive nodes
  // return a "would_have" stub; read-only ones produce real numbers.
  // No run row is persisted.
  const dryRun = useCallback(async () => {
    setDryRunning(true);
    setError(null);
    setRunLog(null);
    setRunStatus(null);
    setIsDryRun(true);
    try {
      const graph = flowToGraph(nodes, edges);
      const triggerNode = graph.nodes.find((n) => isTriggerType(n.type));
      const triggerTag =
        triggerNode?.type === "trigger_cron"    ? { type: "cron" }
        : triggerNode?.type === "trigger_webhook" ? { type: "webhook" }
        : { type: "manual" };
      await fetch(`/api/dante/workflows/${workflow.id}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, enabled, trigger: triggerTag, graph }),
      });

      setLogOpen(true);
      setRunStatus("running");
      const res = await fetch(`/api/dante/workflows/${workflow.id}/dry-run`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: {} }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Dry-run failed");
      setRunLog(json.log || []);
      setRunStatus(json.status === "error" ? "error" : "success");
      if (json.status === "error" && json.error) setError(json.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dry-run failed");
      setRunStatus("error");
      setLogOpen(true);
    } finally {
      setDryRunning(false);
    }
  }, [workflow.id, name, description, enabled, nodes, edges]);

  // ── Run history ───────────────────────────────────────────
  // Reuses the workflow detail GET, which already returns the last 20
  // runs with just id/status/timestamps/error. Expanding a row fetches
  // the single-run detail endpoint for the full log.

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/dante/workflows/${workflow.id}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setHistoryRows(json.runs || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load history");
    } finally { setHistoryLoading(false); }
  }, [workflow.id]);

  const toggleHistory = useCallback(() => {
    setHistoryOpen((v) => {
      const next = !v;
      if (next && historyRows === null) loadHistory();
      return next;
    });
  }, [historyRows, loadHistory]);

  const loadRunDetail = useCallback(async (runId: string) => {
    if (expandedRunId === runId) {
      // Clicked the same row again → collapse
      setExpandedRunId(null);
      setRunDetail(null);
      return;
    }
    setExpandedRunId(runId);
    setRunDetail(null);
    setRunDetailLoading(true);
    try {
      const res = await fetch(`/api/dante/workflows/runs/${runId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setRunDetail(json.run);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load run");
      setExpandedRunId(null);
    } finally { setRunDetailLoading(false); }
  }, [workflow.id, expandedRunId]);

  // After a fresh run finishes, invalidate the history cache so the
  // next open reflects the just-finished row at the top.
  useEffect(() => {
    if (!runStatus) return;
    setHistoryRows(null);
  }, [runStatus]);

  // Paint run status on each node after a run finishes.
  useEffect(() => {
    if (!runLog) return;
    const byId = new Map(runLog.map((e) => [e.step_id, e.status]));
    setNodes((ns) => ns.map((n) => ({
      ...n,
      data: {
        ...n.data,
        runStatus: (byId.get(n.id) as "success" | "error" | undefined) ?? null,
      },
    })));
  }, [runLog]);

  // ── Webhook token ─────────────────────────────────────────
  // Loaded lazily when a webhook trigger is selected. Mint on demand.

  useEffect(() => {
    let cancelled = false;
    if (selectedNode?.data.step.type === "trigger_webhook" && webhookToken === null) {
      fetch(`/api/dante/workflows/${workflow.id}/webhook-token`, { credentials: "include" })
        .then((r) => r.ok ? r.json() : null)
        .then((j) => { if (!cancelled && j?.token) setWebhookToken(j.token); })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, [selectedNode?.data.step.type, workflow.id, webhookToken]);

  const mintWebhookToken = useCallback(async () => {
    setMintingToken(true);
    try {
      const res = await fetch(`/api/dante/workflows/${workflow.id}/webhook-token`, {
        method: "POST", credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Token mint failed");
      setWebhookToken(json.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Token mint failed");
    } finally { setMintingToken(false); }
  }, [workflow.id]);

  // ── Render ────────────────────────────────────────────────

  const nodeTypes: NodeTypes = useMemo(() => ({ dante: DanteNode }), []);

  const triggers = NODE_TYPES.filter((t) => t.group === "trigger");
  const actions  = NODE_TYPES.filter((t) => t.group === "action");

  return (
    <div className="min-h-screen flex flex-col bg-[var(--canvas)]">
      {/* Top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between px-6 md:px-8 py-3 bg-[var(--canvas)] border-b border-[var(--rule)]">
        <div className="flex items-center gap-3 min-w-0">
          <img src="/brand/logo-circle.png" alt="Drift" className="w-6 h-6 rounded-full object-cover" />
          <span className="text-sm font-semibold text-[var(--ink)]">Drift</span>
          <span className="text-xs text-[var(--ink-subtle)]">/</span>
          <DanteGateLink variant="breadcrumb" />
          <span className="text-xs text-[var(--ink-subtle)]">/</span>
          <Link href="/dante/workflows" className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)]">Workflows</Link>
          <span className="text-xs text-[var(--ink-subtle)]">/</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-sm text-[var(--ink)] bg-transparent border-none focus:outline-none focus:bg-[var(--canvas-subtle)] rounded-[4px] px-1.5 py-0.5 max-w-[240px]"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-[var(--ink-muted)] mr-2 cursor-pointer">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)}
              className="accent-[var(--ink)]" />
            <Power className="w-3 h-3" strokeWidth={1.5} />
            Enabled
          </label>
          {saveStatus === "saved" && (
            <span className="text-xs text-[var(--verified)] flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} /> Saved
            </span>
          )}
          <button onClick={toggleHistory}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-[4px] border text-sm font-medium transition ${
              historyOpen
                ? "border-[var(--rule-strong)] bg-[var(--canvas-subtle)] text-[var(--ink)]"
                : "border-[var(--rule)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)]"
            }`}>
            <History className="w-4 h-4" strokeWidth={1.5} />
            <span className="hidden sm:inline">History</span>
          </button>
          <Link
            href={`/dante/workflows/${workflow.id}/impact`}
            title="See what this workflow has touched"
            className="flex items-center gap-1.5 px-3 py-2 rounded-[4px] border border-[var(--rule)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] text-sm font-medium transition"
          >
            <BarChart3 className="w-4 h-4" strokeWidth={1.5} />
            <span className="hidden sm:inline">Impact</span>
          </Link>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-1.5 px-3 py-2 rounded-[4px] border border-[var(--rule)] text-[var(--ink)] hover:bg-[var(--canvas-subtle)] text-sm font-medium transition disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} /> : <Save className="w-4 h-4" strokeWidth={1.5} />}
            Save
          </button>
          <button
            onClick={dryRun}
            disabled={dryRunning || running || nodes.length === 0}
            title="Run with side effects mocked — no emails sent, no records changed"
            className="flex items-center gap-1.5 px-3 py-2 rounded-[4px] border border-[var(--rule)] text-[var(--ink)] hover:bg-[var(--canvas-subtle)] text-sm font-medium transition disabled:opacity-50"
          >
            {dryRunning
              ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
              : <FlaskConical className="w-4 h-4" strokeWidth={1.5} />}
            Test
          </button>
          <button onClick={run} disabled={running || dryRunning || nodes.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-[4px] bg-[var(--ink)] hover:opacity-90 text-[var(--canvas)] text-sm font-semibold transition disabled:opacity-50">
            {running ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} /> : <Play className="w-4 h-4" strokeWidth={1.5} />}
            Run
          </button>
          <Link href="/dante/workflows"
            className="flex items-center gap-1.5 px-3 py-2 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition text-sm font-medium">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
            <span className="hidden sm:inline">Back</span>
          </Link>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-6 py-2 bg-[var(--danger-soft)] border-b border-[var(--rule)] text-sm text-[var(--danger)] flex items-center gap-2">
          <AlertCircle className="w-4 h-4" strokeWidth={1.5} />
          {error}
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex min-h-0">
        {/* Palette */}
        <aside className="w-[220px] shrink-0 border-r border-[var(--rule)] bg-[var(--canvas)] overflow-y-auto">
          <div className="p-4">
            <div className="label-section mb-3">Triggers</div>
            <div className="space-y-1 mb-6">
              {triggers.map((t) => <PaletteItem key={t.type} meta={t} onAdd={() => addNode(t.type)} />)}
            </div>
            <div className="label-section mb-3">Actions</div>
            <div className="space-y-1">
              {actions.map((t) => <PaletteItem key={t.type} meta={t} onAdd={() => addNode(t.type)} />)}
            </div>
          </div>
        </aside>

        {/* Canvas + log column */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 relative min-h-0">
            <ReactFlowProvider>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={(_, n) => setSelectedId(n.id)}
                onPaneClick={() => setSelectedId(null)}
                fitView
                fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
                defaultEdgeOptions={{
                  style: { stroke: "var(--ink-muted)", strokeWidth: 1.5 },
                }}
              >
                <Background color="var(--rule)" gap={16} size={1} />
                <Controls
                  showInteractive={false}
                  className="!bg-[var(--canvas)] !border-[var(--rule)] !rounded-[4px]"
                />
                <MiniMap
                  className="!bg-[var(--canvas-subtle)] !border !border-[var(--rule)] !rounded-[4px]"
                  nodeColor="var(--rule-strong)"
                  maskColor="rgba(21,21,21,0.05)"
                  pannable
                />
              </ReactFlow>
            </ReactFlowProvider>
          </div>

          {/* Run log — renders while a run is queued/running too so the
              user sees live status, even before steps have been logged. */}
          {(runLog || (runStatus && runStatus !== null)) && (
            <div className="border-t border-[var(--rule)] bg-[var(--canvas)] max-h-[40vh] flex flex-col">
              <button
                onClick={() => setLogOpen((v) => !v)}
                className="flex items-center justify-between px-5 py-2.5 border-b border-[var(--rule)] hover:bg-[var(--canvas-subtle)]"
              >
                <div className="flex items-center gap-2">
                  <span className="label-section">{isDryRun ? "Test run" : "Last run"}</span>
                  {isDryRun && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-[var(--rule)] text-[var(--ink-muted)] bg-[var(--canvas-subtle)]">
                      <FlaskConical className="w-2.5 h-2.5" strokeWidth={1.5} />
                      simulated
                    </span>
                  )}
                  {runStatus && (
                    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border border-[var(--rule)] ${
                      runStatus === "success" ? "text-[var(--verified)] bg-[var(--verified-soft)]"
                      : runStatus === "error" ? "text-[var(--danger)] bg-[var(--danger-soft)]"
                      : "text-[var(--ink-muted)] bg-[var(--canvas-subtle)]"
                    }`}>
                      {runStatus === "success" ? <CheckCircle2 className="w-3 h-3" strokeWidth={1.5} />
                        : runStatus === "error" ? <AlertCircle  className="w-3 h-3" strokeWidth={1.5} />
                        : <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />}
                      {runStatus}
                    </span>
                  )}
                </div>
                {logOpen
                  ? <ChevronDown className="w-4 h-4 text-[var(--ink-muted)]" strokeWidth={1.5} />
                  : <ChevronUp   className="w-4 h-4 text-[var(--ink-muted)]" strokeWidth={1.5} />}
              </button>
              {logOpen && (
                <div className="overflow-y-auto px-5 py-3 space-y-2.5">
                  {!runLog && runStatus && runStatus !== "success" && runStatus !== "error" && (
                    <div className="text-xs text-[var(--ink-muted)] flex items-center gap-2 py-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                      {runStatus === "queued" ? "Queued — waiting for a worker." : "Executing steps…"}
                    </div>
                  )}
                  {(runLog ?? []).map((entry) => (
                    <div key={entry.step_id} className="border border-[var(--rule)] rounded-[4px] p-2.5 bg-[var(--canvas-subtle)]">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          {entry.status === "success"
                            ? <CheckCircle2 className="w-3 h-3 text-[var(--verified)]" strokeWidth={1.5} />
                            : <AlertCircle  className="w-3 h-3 text-[var(--danger)]"   strokeWidth={1.5} />}
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
                        <pre className="mono text-[10px] text-[var(--ink)] bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] p-2 whitespace-pre-wrap break-words max-h-32 overflow-auto">
                          {JSON.stringify(entry.output, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* History drawer — opens over the config drawer when both would
            be visible, since it's an explicit user toggle from the toolbar. */}
        {historyOpen && (
          <aside className="w-[420px] shrink-0 border-l border-[var(--rule)] bg-[var(--canvas)] overflow-y-auto flex flex-col">
            <div className="sticky top-0 bg-[var(--canvas)] border-b border-[var(--rule)] px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-[var(--ink)]" strokeWidth={1.5} />
                <div className="label-section">Run history</div>
                {historyRows && (
                  <span className="text-[10px] text-[var(--ink-subtle)]">
                    last {historyRows.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { setHistoryRows(null); loadHistory(); }}
                  disabled={historyLoading}
                  title="Refresh"
                  className="p-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] rounded-[4px] disabled:opacity-40"
                >
                  {historyLoading
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                    : <Clock className="w-3.5 h-3.5" strokeWidth={1.5} />}
                </button>
                <button
                  onClick={() => setHistoryOpen(false)}
                  className="p-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] rounded-[4px]"
                >
                  <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {historyLoading && !historyRows ? (
                <div className="p-8 flex items-center justify-center text-[var(--ink-muted)]">
                  <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                </div>
              ) : !historyRows || historyRows.length === 0 ? (
                <div className="p-8 text-center">
                  <History className="w-5 h-5 text-[var(--ink-subtle)] mx-auto mb-2" strokeWidth={1.5} />
                  <p className="text-xs text-[var(--ink-muted)] mb-1">No runs yet.</p>
                  <p className="text-[10px] text-[var(--ink-subtle)]">Hit Run to create the first one.</p>
                </div>
              ) : (
                <div className="divide-y divide-[var(--rule)]">
                  {historyRows.map((row) => {
                    const expanded = expandedRunId === row.id;
                    const duration = row.finished_at
                      ? Math.max(0, new Date(row.finished_at).getTime() - new Date(row.started_at).getTime())
                      : null;
                    return (
                      <div key={row.id}>
                        <button
                          onClick={() => loadRunDetail(row.id)}
                          className={`w-full px-5 py-3 text-left hover:bg-[var(--canvas-subtle)] transition ${
                            expanded ? "bg-[var(--canvas-subtle)]" : ""
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            {row.status === "success" && <CheckCircle2 className="w-3.5 h-3.5 text-[var(--verified)]" strokeWidth={1.5} />}
                            {row.status === "error"   && <AlertCircle  className="w-3.5 h-3.5 text-[var(--danger)]"   strokeWidth={1.5} />}
                            {row.status === "running" && <Loader2      className="w-3.5 h-3.5 text-[var(--ink-muted)] animate-spin" strokeWidth={1.5} />}
                            <span className="text-xs font-medium text-[var(--ink)]">
                              {new Date(row.started_at).toLocaleString(undefined, {
                                month: "short", day: "numeric",
                                hour: "2-digit", minute: "2-digit",
                              })}
                            </span>
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-[3px] ${
                              row.status === "success" ? "text-[var(--verified)] bg-[var(--verified-soft)]"
                              : row.status === "error" ? "text-[var(--danger)] bg-[var(--danger-soft)]"
                              : "text-[var(--ink-muted)] bg-[var(--canvas-subtle)]"
                            }`}>
                              {row.status}
                            </span>
                            {duration !== null && (
                              <span className="text-[10px] text-[var(--ink-subtle)] ml-auto mono">
                                {duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(1)}s`}
                              </span>
                            )}
                          </div>
                          {row.error && !expanded && (
                            <div className="text-[10px] text-[var(--danger)] truncate mono">
                              {row.error}
                            </div>
                          )}
                        </button>
                        {expanded && (
                          <div className="px-5 pb-4 bg-[var(--canvas-subtle)]">
                            {runDetailLoading ? (
                              <div className="py-4 flex items-center justify-center text-[var(--ink-muted)]">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                              </div>
                            ) : runDetail ? (
                              <div className="space-y-2">
                                {runDetail.error && (
                                  <pre className="mono text-[10px] text-[var(--danger)] bg-[var(--danger-soft)] rounded-[4px] p-2 whitespace-pre-wrap break-words">
                                    {runDetail.error}
                                  </pre>
                                )}
                                {runDetail.log && runDetail.log.length > 0 ? (
                                  runDetail.log.map((entry) => (
                                    <div key={entry.step_id} className="border border-[var(--rule)] rounded-[4px] p-2 bg-[var(--canvas)]">
                                      <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          {entry.status === "success"
                                            ? <CheckCircle2 className="w-3 h-3 text-[var(--verified)] shrink-0" strokeWidth={1.5} />
                                            : <AlertCircle  className="w-3 h-3 text-[var(--danger)] shrink-0"   strokeWidth={1.5} />}
                                          <span className="text-[11px] font-medium text-[var(--ink)] truncate">{entry.step_name}</span>
                                          <span className="text-[9px] text-[var(--ink-subtle)] mono shrink-0">{entry.step_type}</span>
                                        </div>
                                        <span className="text-[9px] text-[var(--ink-subtle)] shrink-0 ml-2">
                                          {durationMs(entry.started_at, entry.finished_at)}ms
                                        </span>
                                      </div>
                                      {entry.error && (
                                        <pre className="mono text-[9px] text-[var(--danger)] bg-[var(--danger-soft)] rounded-[3px] p-1.5 whitespace-pre-wrap break-words">
                                          {entry.error}
                                        </pre>
                                      )}
                                      {entry.output !== undefined && entry.status === "success" && (
                                        <pre className="mono text-[9px] text-[var(--ink)] bg-[var(--canvas-subtle)] border border-[var(--rule)] rounded-[3px] p-1.5 whitespace-pre-wrap break-words max-h-32 overflow-auto">
                                          {JSON.stringify(entry.output, null, 2)}
                                        </pre>
                                      )}
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-[10px] text-[var(--ink-subtle)] italic">
                                    No step log recorded for this run.
                                  </p>
                                )}
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Right drawer */}
        {selectedNode && !historyOpen && (
          <aside className="w-[380px] shrink-0 border-l border-[var(--rule)] bg-[var(--canvas)] overflow-y-auto">
            <div className="sticky top-0 bg-[var(--canvas)] border-b border-[var(--rule)] px-5 py-3 flex items-center justify-between">
              <div className="min-w-0">
                <div className="label-section">
                  {getMeta(selectedNode.data.step.type)?.label ?? selectedNode.data.step.type}
                </div>
                <div className="text-[11px] text-[var(--ink-subtle)] mono truncate">
                  id: {selectedNode.id}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {!isTriggerType(selectedNode.data.step.type) && (
                  <button
                    onClick={() => deleteNode(selectedNode.id)}
                    className="p-1.5 text-[var(--ink-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] rounded-[4px]"
                  >
                    <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </button>
                )}
                <button
                  onClick={() => setSelectedId(null)}
                  className="p-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] rounded-[4px]"
                >
                  <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
              </div>
            </div>

            <div className="p-5">
              <StepConfigForm
                key={selectedNode.id}
                step={selectedNode.data.step}
                onChange={updateSelectedStep}
              />

              {/* Webhook token panel — only for trigger_webhook */}
              {selectedNode.data.step.type === "trigger_webhook" && (
                <div className="mt-5 pt-5 border-t border-[var(--rule)]">
                  <div className="label-section mb-2">Webhook URL</div>
                  {webhookToken ? (
                    <>
                      <div className="flex items-center gap-2 bg-[var(--canvas-subtle)] border border-[var(--rule)] rounded-[4px] px-2 py-1.5">
                        <code className="mono text-[10px] text-[var(--ink)] truncate flex-1">
                          {typeof window !== "undefined" ? window.location.origin : ""}/api/dante/hooks/{webhookToken}
                        </code>
                        <button
                          onClick={() => {
                            const url = `${window.location.origin}/api/dante/hooks/${webhookToken}`;
                            navigator.clipboard.writeText(url).catch(() => {});
                          }}
                          className="p-1 text-[var(--ink-muted)] hover:text-[var(--ink)] shrink-0"
                        >
                          <Copy className="w-3 h-3" strokeWidth={1.5} />
                        </button>
                      </div>
                      <p className="text-[10px] text-[var(--ink-subtle)] mt-2">
                        POST any JSON body here to fire the workflow. The payload
                        is exposed at <code className="mono">{"{{steps."}{selectedNode.id}{".input.<field>}}"}</code>.
                      </p>
                    </>
                  ) : (
                    <button
                      onClick={mintWebhookToken}
                      disabled={mintingToken}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-[4px] border border-[var(--rule)] text-[var(--ink)] hover:bg-[var(--canvas-subtle)] text-sm font-medium transition disabled:opacity-50"
                    >
                      {mintingToken
                        ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                        : <Sparkles className="w-4 h-4" strokeWidth={1.5} />}
                      Mint webhook URL
                    </button>
                  )}
                </div>
              )}

              {/* Description field folded into the drawer for the trigger node
                  since there's no dedicated "workflow settings" pane */}
              {isTriggerType(selectedNode.data.step.type) && (
                <div className="mt-5 pt-5 border-t border-[var(--rule)]">
                  <div className="label-section mb-2">Workflow description</div>
                  <textarea
                    value={description}
                    onChange={(e) => setDesc(e.target.value)}
                    rows={3}
                    placeholder="What does this workflow do?"
                    className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)] resize-y"
                  />
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

function PaletteItem({
  meta, onAdd,
}: {
  meta: typeof NODE_TYPES[number];
  onAdd: () => void;
}) {
  const Icon = meta.icon;
  return (
    <button
      onClick={onAdd}
      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-[4px] border border-[var(--rule)] hover:border-[var(--rule-strong)] hover:bg-[var(--canvas-subtle)] text-left transition group"
    >
      <div className="border border-[var(--rule)] bg-[var(--canvas)] rounded-[4px] p-1 shrink-0">
        <Icon className="w-3 h-3 text-[var(--ink)]" strokeWidth={1.5} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-[var(--ink)]">{meta.label}</div>
        <div className="text-[10px] text-[var(--ink-subtle)] truncate">{meta.hint}</div>
      </div>
      <Plus className="w-3 h-3 text-[var(--ink-subtle)] shrink-0 opacity-0 group-hover:opacity-100 transition" strokeWidth={1.5} />
    </button>
  );
}

function durationMs(start: string, end: string): number {
  return Math.max(0, new Date(end).getTime() - new Date(start).getTime());
}
