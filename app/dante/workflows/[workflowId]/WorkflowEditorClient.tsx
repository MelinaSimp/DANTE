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
  useState, useCallback, useMemo, useEffect, useRef,
} from "react";
import Link from "next/link";
import {
  ReactFlow,
  Background,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  type Node as RFNode,
  type Edge as RFEdge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type NodeTypes,
  type EdgeTypes,
  type OnConnectEnd,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  ArrowLeft, Save, Loader2, Play, Trash2, AlertCircle,
  CheckCircle2, X, Copy, ChevronDown, ChevronUp,
  Sparkles, History, Clock, FlaskConical, BarChart3,
  Undo2, Redo2, Search, ChevronRight, RotateCcw,
  EyeOff, Clipboard, AlignVerticalJustifyCenter, Pin, PinOff,
  Keyboard, Command, Download, Upload, Square, Palette, StickyNote,
  Maximize, MapPin, StopCircle, RefreshCw, Tag, Key, GitBranch,
  RotateCw, Eye, Spline, LayoutGrid, ZoomIn, ZoomOut,
} from "lucide-react";

import type {
  StepType,
  WorkflowStep,
  WorkflowGraph,
  GraphNode,
  GraphEdge,
  StepLogEntry,
  TriggerInputField,
} from "@/lib/dante/workflow-types";
import { definitionFromRow } from "@/lib/dante/workflow-types";

import DanteNode, { type DanteNodeData, getItemCount, NODE_COLORS } from "./canvas/DanteNode";
import StepConfigForm, { type StepPatch } from "./canvas/StepConfigForm";
import { NODE_TYPES, getMeta, isTriggerType, resolveStepType, CATEGORY_LABELS, CATEGORY_ORDER, accentClasses, type NodeCategory } from "./canvas/nodeTypes";
import SmoothEdge, { SteppedEdgeContext } from "./canvas/SmoothEdge";
import CitationRenderer, { type CitationReport } from "../../CitationRenderer";
import { autoLayout } from "./canvas/autoLayout";

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

// Short relative timestamp for the header subtitle ("2m ago", "3h ago").
function timeAgoShort(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days}d ago` : `${Math.floor(days / 30)}mo ago`;
}

function graphToFlow(graph: WorkflowGraph): {
  nodes: DanteRFNode[];
  edges: RFEdge[];
  colors: Record<string, string>;
  notes: Record<string, string>;
} {
  const colors: Record<string, string> = {};
  const notes: Record<string, string> = {};
  const nodes: DanteRFNode[] = graph.nodes.map((n) => {
    const d = n.data ?? {} as Record<string, unknown>;
    if (d.color) colors[n.id] = d.color;
    if (d.notes) notes[n.id] = d.notes;
    // n8n-native nodes store config in `parameters` instead of `data.step`.
    // Synthesize a minimal step so the canvas can render them.
    const step = d.step ?? {
      id: n.id,
      type: n.type ?? "unknown",
      name: (n as unknown as Record<string, unknown>).name as string ?? n.id,
      config: (n as unknown as Record<string, unknown>).parameters ?? {},
    };
    return {
      id: n.id,
      type: "dante",
      position: n.position,
      data: { step },
    };
  });
  const edges: RFEdge[] = graph.edges.map((e) => {
    const isSub = !!(e.connectionType && e.connectionType !== "main");
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: isSub ? e.connectionType : e.targetHandle,
      type: "smooth",
      label: e.sourceHandle ? e.sourceHandle : undefined,
      data: {},
      animated: false,
      // Sub-node edges read as dashed accent lanes; main edges are solid
      // ink. (--rule-strong is translucent white — invisible on the light
      // canvas — so main edges use --ink-subtle.)
      style: isSub
        ? { stroke: "var(--ink-subtle)", strokeWidth: 1.5, strokeDasharray: "5 6", opacity: 0.7 }
        : { stroke: "var(--ink-subtle)", strokeWidth: 2 },
    };
  });
  return { nodes, edges, colors, notes };
}

function flowToGraph(
  nodes: DanteRFNode[],
  edges: RFEdge[],
  colors?: Record<string, string>,
  notes?: Record<string, string>,
): WorkflowGraph {
  const gNodes: GraphNode[] = nodes.map((n) => ({
    id: n.id,
    type: n.data.step.type,
    position: n.position,
    data: {
      step: n.data.step,
      ...(colors?.[n.id] ? { color: colors[n.id] } : {}),
      ...(notes?.[n.id] ? { notes: notes[n.id] } : {}),
    },
  }));
  const gEdges: GraphEdge[] = edges.map((e) => {
    const th = e.targetHandle || undefined;
    const isSub = th === "ai_model" || th === "ai_memory" || th === "ai_tool";
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle || undefined,
      targetHandle: th,
      ...(isSub ? { connectionType: th as GraphEdge["connectionType"] } : {}),
    };
  });
  return { nodes: gNodes, edges: gEdges };
}

// Neumorphic zoom controls (bottom-left), replacing React Flow's stock
// <Controls>. Rendered inside <ReactFlowProvider> so it can drive the viewport.
function CanvasZoomControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  const btn =
    "w-8 h-8 flex items-center justify-center rounded-[7px] text-[var(--ink-muted)] hover:bg-[var(--neu-hover)] hover:text-[var(--ink)] transition-colors";
  return (
    <div
      className="absolute left-4 bottom-4 z-10 flex items-center gap-0.5 p-1 rounded-[10px]"
      style={{ background: "var(--neu-card)", boxShadow: "var(--neu-shadow-card), 0 2px 8px rgba(0,0,0,0.10)" }}
    >
      <button onClick={() => zoomOut()} title="Zoom out" className={btn}>
        <ZoomOut className="w-4 h-4" strokeWidth={1.7} />
      </button>
      <span className="mono min-w-[44px] text-center text-xs text-[var(--ink-muted)] select-none">
        {Math.round((zoom ?? 1) * 100)}%
      </span>
      <button onClick={() => zoomIn()} title="Zoom in" className={btn}>
        <ZoomIn className="w-4 h-4" strokeWidth={1.7} />
      </button>
      <div className="w-px h-4 bg-[rgba(0,0,0,0.08)] mx-1" />
      <button onClick={() => fitView({ padding: 0.2, maxZoom: 1 })} title="Fit to view" className={btn}>
        <Maximize className="w-4 h-4" strokeWidth={1.7} />
      </button>
    </div>
  );
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

  const initialFlow = useMemo(() => {
    const flow = graphToFlow(seeded);
    // Migrate legacy vertical (top-down) layouts to the horizontal flow on
    // load. Positions saved under the old orientation otherwise render as a
    // broken, side-wired vertical stack. Already-horizontal graphs (wider
    // than tall) are left untouched.
    if (flow.nodes.length >= 2) {
      const xs = flow.nodes.map((n) => n.position.x);
      const ys = flow.nodes.map((n) => n.position.y);
      const w = Math.max(...xs) - Math.min(...xs);
      const h = Math.max(...ys) - Math.min(...ys);
      if (h > w) flow.nodes = autoLayout(flow.nodes, flow.edges, "LR");
    }
    return flow;
  }, [seeded]);

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

  // Run input dialog state. When a manual trigger has input_fields,
  // clicking Run opens this dialog instead of executing immediately.
  const [runInputOpen, setRunInputOpen] = useState(false);
  const [runInputValues, setRunInputValues] = useState<Record<string, string>>({});

  // Helper: extract input_fields from trigger node regardless of format.
  // Drift-native stores them in config.input_fields, n8n-native in parameters.input_fields.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getTriggerInputFields = (step: any): TriggerInputField[] => {
    const fromConfig = step?.config?.input_fields as TriggerInputField[] | undefined;
    if (fromConfig && fromConfig.length > 0) return fromConfig;
    const fromParams = step?.parameters?.input_fields as TriggerInputField[] | undefined;
    if (fromParams && fromParams.length > 0) return fromParams;
    return [];
  };

  // Palette search
  const [paletteSearch, setPaletteSearch] = useState("");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<NodeCategory>>(new Set());

  // Undo/redo history
  const [undoStack, setUndoStack] = useState<Array<{ nodes: DanteRFNode[]; edges: RFEdge[] }>>([]);
  const [redoStack, setRedoStack] = useState<Array<{ nodes: DanteRFNode[]; edges: RFEdge[] }>>([]);
  const pushUndo = useCallback(() => {
    setUndoStack((s) => [...s.slice(-49), { nodes: structuredClone(nodes), edges: structuredClone(edges) }]);
    setRedoStack([]);
  }, [nodes, edges]);

  // Clipboard for copy/paste
  const [clipboard, setClipboard] = useState<DanteRFNode[] | null>(null);

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);

  // Drag-to-create node picker
  const [nodePicker, setNodePicker] = useState<{ x: number; y: number; fromNodeId: string; fromHandle?: string } | null>(null);

  // Pin data per node (keyed by node id)
  const [pinnedData, setPinnedData] = useState<Record<string, unknown>>({});

  // Data view tab in drawer
  const [dataViewTab, setDataViewTab] = useState<"config" | "input" | "output">("config");

  // Node Detail View (NDV) — the three-pane modal opened on double-click (spec §8).
  const [ndvNodeId, setNdvNodeId] = useState<string | null>(null);

  // n8n-parity state
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showNodeSearch, setShowNodeSearch] = useState(false);
  const [nodeSearchQuery, setNodeSearchQuery] = useState("");
  const [showImportExport, setShowImportExport] = useState<"import" | "export" | null>(null);
  const [importJson, setImportJson] = useState("");
  const [minimapVisible, setMinimapVisible] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [connectionStyle, setConnectionStyle] = useState<"curved" | "stepped">("curved");
  const [citationReports, setCitationReports] = useState<Record<string, CitationReport>>({});
  const citationRequested = useRef<Set<string>>(new Set());
  const [nodeColors, setNodeColors] = useState<Record<string, string>>(initialFlow.colors);
  const [nodeNotes, setNodeNotes] = useState<Record<string, string>>(initialFlow.notes);
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: "success" | "error" | "info" }>>([]);
  const [historyFilter, setHistoryFilter] = useState<"all" | "test" | "production">("all");
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [paramSearch, setParamSearch] = useState("");

  // Tags
  const [tags, setTags] = useState<string[]>((workflow as unknown as { tags?: string[] }).tags ?? []);
  const [tagInput, setTagInput] = useState("");

  // Versioning
  const [versions, setVersions] = useState<Array<{ id: string; version: number; name: string; created_at: string }> | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versionsLoading, setVersionsLoading] = useState(false);

  // Credentials
  const [secrets, setSecrets] = useState<Array<{ id: string; key: string; preview: string; updated_at: string }> | null>(null);
  const [secretsOpen, setSecretsOpen] = useState(false);
  const [secretsLoading, setSecretsLoading] = useState(false);
  const [newSecretKey, setNewSecretKey] = useState("");
  const [newSecretValue, setNewSecretValue] = useState("");

  const addToast = useCallback((message: string, type: "success" | "error" | "info" = "info") => {
    const id = Math.random().toString(36).slice(2, 8);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }, []);

  // Run history drawer state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState<RunHistoryRow[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<RunDetail | null>(null);
  const [runDetailLoading, setRunDetailLoading] = useState(false);

  // ── Undo / redo ───────────────────────────────────────────

  const undo = useCallback(() => {
    setUndoStack((stack) => {
      if (stack.length === 0) return stack;
      const prev = stack[stack.length - 1];
      setRedoStack((rs) => [...rs, { nodes: structuredClone(nodes), edges: structuredClone(edges) }]);
      setNodes(prev.nodes);
      setEdges(prev.edges);
      return stack.slice(0, -1);
    });
  }, [nodes, edges]);

  const redo = useCallback(() => {
    setRedoStack((stack) => {
      if (stack.length === 0) return stack;
      const next = stack[stack.length - 1];
      setUndoStack((us) => [...us, { nodes: structuredClone(nodes), edges: structuredClone(edges) }]);
      setNodes(next.nodes);
      setEdges(next.edges);
      return stack.slice(0, -1);
    });
  }, [nodes, edges]);

  // ── Copy / paste / duplicate ─────────────────────────────

  const copySelected = useCallback(() => {
    if (!selectedId) return;
    const node = nodes.find((n) => n.id === selectedId);
    if (node) setClipboard([structuredClone(node)]);
  }, [selectedId, nodes]);

  const pasteClipboard = useCallback(() => {
    if (!clipboard || clipboard.length === 0) return;
    pushUndo();
    const newNodes: DanteRFNode[] = clipboard.map((n) => {
      const id = newId(n.data.step.type.split("_")[0]);
      return {
        ...n,
        id,
        position: { x: n.position.x + 40, y: n.position.y + 40 },
        data: { ...n.data, step: { ...n.data.step, id } },
      };
    });
    setNodes((ns) => [...ns, ...newNodes]);
    if (newNodes.length === 1) setSelectedId(newNodes[0].id);
  }, [clipboard, pushUndo]);

  const duplicateSelected = useCallback(() => {
    if (!selectedId) return;
    const node = nodes.find((n) => n.id === selectedId);
    if (!node || isTriggerType(node.data.step.type)) return;
    pushUndo();
    const id = newId(node.data.step.type.split("_")[0]);
    const dup: DanteRFNode = {
      ...structuredClone(node),
      id,
      position: { x: node.position.x + 40, y: node.position.y + 60 },
      data: { ...structuredClone(node.data), step: { ...structuredClone(node.data.step), id } },
    };
    setNodes((ns) => [...ns, dup]);
    setSelectedId(id);
  }, [selectedId, nodes, pushUndo]);

  // ── Toggle node disabled ─────────────────────────────────

  const toggleDisabled = useCallback((nodeId: string) => {
    setNodes((ns) => ns.map((n) =>
      n.id === nodeId
        ? { ...n, data: { ...n.data, disabled: !n.data.disabled } }
        : n
    ));
  }, []);

  // ── Auto-layout ─────────────────────────────────────────

  const tidyLayout = useCallback(() => {
    pushUndo();
    setNodes((ns) => autoLayout(ns, edges));
  }, [edges, pushUndo]);

  // ── Node rename (from inline edit on canvas) ────────────
  const renameNode = useCallback((nodeId: string, newName: string) => {
    setNodes((ns) => ns.map((n) =>
      n.id === nodeId ? { ...n, data: { ...n.data, step: { ...n.data.step, name: newName } } } : n
    ));
  }, []);

  // ── Node color ─────────────────────────────────────────
  const setNodeColor = useCallback((nodeId: string, color: string) => {
    setNodeColors((prev) => ({ ...prev, [nodeId]: color }));
  }, []);

  // ── Node notes ─────────────────────────────────────────
  const setNodeNote = useCallback((nodeId: string, note: string) => {
    setNodeNotes((prev) => ({ ...prev, [nodeId]: note }));
  }, []);

  // ── Tags ──────────────────────────────────────────────
  const addTag = useCallback((t: string) => {
    const trimmed = t.trim().toLowerCase();
    if (!trimmed || tags.includes(trimmed)) return;
    setTags((prev) => [...prev, trimmed]);
  }, [tags]);

  const removeTag = useCallback((t: string) => {
    setTags((prev) => prev.filter((x) => x !== t));
  }, []);

  // ── Versions ─────────────────────────────────────────
  const loadVersions = useCallback(async () => {
    setVersionsLoading(true);
    try {
      const res = await fetch(`/api/dante/workflows/${workflow.id}/versions`, { credentials: "include" });
      if (res.ok) { const j = await res.json(); setVersions(j.versions); }
    } catch { /* ignore */ }
    finally { setVersionsLoading(false); }
  }, [workflow.id]);

  const restoreVersion = useCallback(async (versionId: string) => {
    try {
      const res = await fetch(`/api/dante/workflows/${workflow.id}/versions/${versionId}`, {
        method: "POST", credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      addToast("Version restored -- reloading...", "success");
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      addToast(e instanceof Error ? e.message : "Restore failed", "error");
    }
  }, [workflow.id, addToast]);

  // ── Credentials ──────────────────────────────────────
  const loadSecrets = useCallback(async () => {
    setSecretsLoading(true);
    try {
      const res = await fetch("/api/dante/secrets", { credentials: "include" });
      if (res.ok) { const j = await res.json(); setSecrets(j.secrets); }
    } catch { /* ignore */ }
    finally { setSecretsLoading(false); }
  }, []);

  const saveSecret = useCallback(async () => {
    if (!newSecretKey.trim() || !newSecretValue) return;
    try {
      const res = await fetch("/api/dante/secrets", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: newSecretKey.trim(), value: newSecretValue }),
      });
      if (!res.ok) throw new Error(await res.text());
      setNewSecretKey(""); setNewSecretValue("");
      addToast("Secret saved", "success");
      loadSecrets();
    } catch (e) {
      addToast(e instanceof Error ? e.message : "Save failed", "error");
    }
  }, [newSecretKey, newSecretValue, addToast, loadSecrets]);

  const deleteSecret = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/dante/secrets/${id}`, {
        method: "DELETE", credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      loadSecrets();
    } catch (e) {
      addToast(e instanceof Error ? e.message : "Delete failed", "error");
    }
  }, [addToast, loadSecrets]);

  // ── Connection validation (loop detection) ─────────────
  const wouldCreateLoop = useCallback((source: string, target: string): boolean => {
    const visited = new Set<string>();
    const queue = [source];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === target) continue;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const e of edges) {
        if (e.target === current) {
          if (e.source === target) return true;
          queue.push(e.source);
        }
      }
    }
    return false;
  }, [edges]);

  // ── Cancel execution ──────────────────────────────────
  const cancelExecution = useCallback(async () => {
    if (!currentRunId) return;
    try {
      await fetch(`/api/dante/workflows/runs/${currentRunId}/cancel`, {
        method: "POST", credentials: "include",
      });
      addToast("Execution cancelled", "info");
    } catch {
      addToast("Failed to cancel", "error");
    }
  }, [currentRunId, addToast]);

  // ── Import / Export ───────────────────────────────────
  const exportWorkflow = useCallback(() => {
    const graph = flowToGraph(nodes, edges, nodeColors, nodeNotes);
    const data = { name, description, enabled, graph };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/\s+/g, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addToast("Workflow exported", "success");
  }, [nodes, edges, name, description, enabled, addToast]);

  const importWorkflow = useCallback(() => {
    try {
      const data = JSON.parse(importJson);
      if (!data.graph || !data.graph.nodes) throw new Error("Invalid workflow JSON");
      pushUndo();
      const flow = graphToFlow(data.graph);
      setNodes(flow.nodes);
      setEdges(flow.edges);
      setNodeColors(flow.colors);
      setNodeNotes(flow.notes);
      if (data.name) setName(data.name);
      if (data.description) setDesc(data.description);
      setShowImportExport(null);
      setImportJson("");
      addToast("Workflow imported", "success");
    } catch (e) {
      addToast(e instanceof Error ? e.message : "Invalid JSON", "error");
    }
  }, [importJson, pushUndo, addToast]);

  // ── Pin data ────────────────────────────────────────────

  const togglePinData = useCallback((nodeId: string, data?: unknown) => {
    setPinnedData((prev) => {
      const next = { ...prev };
      if (next[nodeId] !== undefined && data === undefined) {
        delete next[nodeId];
      } else {
        next[nodeId] = data ?? {};
      }
      return next;
    });
  }, []);

  // ── Drag-to-create from handle ─────────────────────────

  const onConnectEnd: OnConnectEnd = useCallback((event, connectionState) => {
    if (!connectionState?.fromNode?.id) return;
    const target = event.target as HTMLElement;
    if (target.closest(".react-flow__node")) return;
    const bounds = (target.closest(".react-flow") as HTMLElement)?.getBoundingClientRect();
    if (!bounds) return;
    const clientEvent = event instanceof MouseEvent ? event : (event as TouchEvent).changedTouches?.[0];
    if (!clientEvent) return;
    setNodePicker({
      x: clientEvent.clientX - bounds.left,
      y: clientEvent.clientY - bounds.top,
      fromNodeId: connectionState.fromNode.id,
      fromHandle: connectionState.fromHandle?.id ?? undefined,
    });
  }, []);

  const addNodeFromPicker = useCallback((type: StepType) => {
    if (!nodePicker) return;
    const meta = getMeta(type);
    if (!meta) return;
    pushUndo();
    const id = newId(type.split("_")[0]);
    const step = meta.default(id);
    const newNode: DanteRFNode = {
      id,
      type: "dante",
      position: { x: nodePicker.x - 130, y: nodePicker.y },
      data: { step },
    };
    setNodes((ns) => [...ns, newNode]);
    const edgeId = `${nodePicker.fromNodeId}->${id}${nodePicker.fromHandle ? `:${nodePicker.fromHandle}` : ""}_${Math.random().toString(36).slice(2, 5)}`;
    setEdges((es) => addEdge({
      id: edgeId,
      source: nodePicker.fromNodeId,
      target: id,
      sourceHandle: nodePicker.fromHandle,
      style: { stroke: "var(--ink-subtle)", strokeWidth: 2 },
    }, es));
    setSelectedId(id);
    setNodePicker(null);
  }, [nodePicker, pushUndo]);

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
      if (conn.source && conn.target && wouldCreateLoop(conn.source, conn.target)) {
        addToast("Cannot connect: would create a loop", "error");
        return;
      }
      // Agent sub-ports accept only the matching sub-node kind.
      const tHandle = conn.targetHandle;
      if (tHandle === "ai_model" || tHandle === "ai_memory" || tHandle === "ai_tool") {
        const srcType = nodes.find((n) => n.id === conn.source)?.data.step.type;
        const expected = tHandle === "ai_model" ? "chat_model" : tHandle === "ai_memory" ? "agent_memory" : "agent_tool";
        if (srcType !== expected) {
          addToast("That agent port needs a matching sub-node", "error");
          return;
        }
      }
      pushUndo();
      const handle = conn.sourceHandle === "true" || conn.sourceHandle === "false" || conn.sourceHandle === "error"
        ? conn.sourceHandle : undefined;
      const isSubConn = tHandle === "ai_model" || tHandle === "ai_memory" || tHandle === "ai_tool";
      setEdges((es) => addEdge({
        ...conn,
        id: `${conn.source}->${conn.target}${handle ? `:${handle}` : ""}_${Math.random().toString(36).slice(2,5)}`,
        label: handle,
        data: {},
        style: isSubConn
          ? { stroke: "var(--ink-subtle)", strokeWidth: 1.5, strokeDasharray: "5 6", opacity: 0.7 }
          : { stroke: "var(--ink-subtle)", strokeWidth: 2 },
      }, es));
    },
    [pushUndo, wouldCreateLoop, addToast, nodes],
  );

  // ── Node ops ──────────────────────────────────────────────

  const addNode = useCallback((type: StepType) => {
    const meta = getMeta(type);
    if (!meta) return;

    pushUndo();

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
  }, [nodes, pushUndo]);

  const deleteNode = useCallback((id: string) => {
    pushUndo();
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
    if (selectedId === id) setSelectedId(null);
  }, [selectedId, pushUndo]);

  const updateSelectedStep = useCallback((patch: StepPatch) => {
    if (!selectedId) return;
    setNodes((ns) => ns.map((n) => {
      if (n.id !== selectedId) return n;
      const nextStep = { ...n.data.step, ...patch } as WorkflowStep;
      return { ...n, data: { ...n.data, step: nextStep } };
    }));
  }, [selectedId]);

  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;
  const ndvNode = nodes.find((n) => n.id === ndvNodeId) ?? null;

  // Verified/flagged display: when an agent node's Output tab is open,
  // run its result through Drift's citation validator (server-only) and
  // cache the report. validateCitations re-queries the workspace archive.
  const agentOutputText = selectedNode && selectedNode.data.step.type === "agent"
    ? ((selectedNode.data.runOutput as { text?: string } | undefined)?.text ?? "")
    : "";
  useEffect(() => {
    if (dataViewTab !== "output" || !selectedId || !agentOutputText) return;
    const key = `${selectedId}:${agentOutputText.length}`;
    if (citationRequested.current.has(key)) return;
    citationRequested.current.add(key);
    const nodeId = selectedId;
    fetch("/api/dante/citations/validate", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ responseText: agentOutputText, trace: runLog ?? [] }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((report: CitationReport | null) => {
        if (report) setCitationReports((m) => ({ ...m, [nodeId]: report }));
      })
      .catch(() => { /* leave undecorated */ });
  }, [selectedId, dataViewTab, agentOutputText, runLog]);

  // Esc closes the NDV (spec §9).
  useEffect(() => {
    if (!ndvNodeId) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setNdvNodeId(null); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [ndvNodeId]);

  // ── Save / run ────────────────────────────────────────────

  const save = useCallback(async () => {
    setSaving(true); setSaveStatus("idle"); setError(null);
    try {
      const graph = flowToGraph(nodes, edges, nodeColors, nodeNotes);
      // Derive the top-level trigger tag from the graph's trigger.
      const triggerNode = graph.nodes.find((n) => isTriggerType(n.type));
      const triggerTag = triggerNode?.type === "trigger_cron"    ? { type: "cron" }
                       : triggerNode?.type === "trigger_webhook" ? { type: "webhook" }
                       : { type: "manual" };
      const res = await fetch(`/api/dante/workflows/${workflow.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, enabled, trigger: triggerTag, graph, tags }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaveStatus("saved");
      addToast("Workflow saved", "success");
      setTimeout(() => setSaveStatus("idle"), 2000);
      fetch(`/api/dante/workflows/${workflow.id}/versions`, {
        method: "POST", credentials: "include",
      }).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSaveStatus("error");
    } finally { setSaving(false); }
  }, [workflow.id, name, description, enabled, nodes, edges, tags, nodeColors, nodeNotes, addToast]);

  // ── Keyboard shortcuts ───────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;

      if (mod && e.key === "s") {
        e.preventDefault();
        save();
        return;
      }
      if (mod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (mod && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        redo();
        return;
      }
      if (isInput) return;
      if (mod && e.key === "d") {
        e.preventDefault();
        duplicateSelected();
        return;
      }
      if (mod && e.key === "c") {
        e.preventDefault();
        copySelected();
        return;
      }
      if (mod && e.key === "v") {
        e.preventDefault();
        pasteClipboard();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        const node = nodes.find((n) => n.id === selectedId);
        if (node && !isTriggerType(node.data.step.type)) {
          e.preventDefault();
          pushUndo();
          deleteNode(selectedId);
        }
        // Also delete selected edges
        const selectedEdges = edges.filter((edge) => (edge as any).selected);
        if (selectedEdges.length > 0) {
          e.preventDefault();
          pushUndo();
          setEdges((es) => es.filter((edge) => !(edge as any).selected));
        }
      }
      // Keyboard shortcut overlay
      if (e.key === "?" && !isInput) {
        e.preventDefault();
        setShowShortcuts((v) => !v);
        return;
      }
      // Command palette
      if (mod && e.key === "k") {
        e.preventDefault();
        setShowCommandPalette((v) => !v);
        return;
      }
      // Node search on canvas
      if (mod && e.key === "f" && !isInput) {
        e.preventDefault();
        setShowNodeSearch(true);
        setNodeSearchQuery("");
        return;
      }
      // Select all
      if (mod && e.key === "a" && !isInput) {
        e.preventDefault();
        setNodes((ns) => ns.map((n) => ({ ...n, selected: true })));
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [save, undo, redo, duplicateSelected, copySelected, pasteClipboard, selectedId, nodes, edges, pushUndo, deleteNode]);

  // Check if the trigger has input fields; if so, open the dialog
  // instead of running immediately.
  const handleRunClick = useCallback(() => {
    // Find trigger node -- handles both Drift-native (trigger_manual) and
    // n8n-native (n8n-nodes-base.webhook) trigger types
    const triggerNode = nodes.find((n) => {
      const t = String(n.data.step.type);
      return t === "trigger_manual" || t === "n8n-nodes-base.webhook"
        || t === "n8n-nodes-base.manualTrigger" || t.startsWith("trigger_");
    });
    const fields = triggerNode ? getTriggerInputFields(triggerNode.data.step) : [];
    if (fields.length > 0 && fields.some((f) => f.name)) {
      // Seed defaults
      const defaults: Record<string, string> = {};
      for (const f of fields) {
        if (f.name) defaults[f.name] = f.default_value || "";
      }
      setRunInputValues(defaults);
      setRunInputOpen(true);
    } else {
      run({});
    }
  }, [nodes]);

  const retryExecution = useCallback(() => {
    handleRunClick();
  }, [handleRunClick]);

  const run = useCallback(async (input: Record<string, unknown>) => {
    setRunInputOpen(false);
    setRunning(true); setError(null); setRunLog(null); setRunStatus(null);
    try {
      // Save first so the run uses the current canvas.
      const graph = flowToGraph(nodes, edges, nodeColors, nodeNotes);
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
        body: JSON.stringify({ input, mode: "queue" }),
      });
      const enqueueJson = await enqueueRes.json();
      if (!enqueueRes.ok) throw new Error(enqueueJson.error || "Enqueue failed");

      const runId: string = enqueueJson.run_id;
      setCurrentRunId(runId);
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
          setRunStatus(rd.status as "queued" | "running");
          // Paint partial progress: mark completed nodes and highlight
          // the currently-running one for real-time visualization.
          if (rd.log && Array.isArray(rd.log) && rd.log.length > 0) {
            const partialLog = rd.log as StepLogEntry[];
            setRunLog(partialLog);
            const completedIds = new Set(partialLog.map((e: StepLogEntry) => e.step_id));
            setNodes((ns) => {
              const currentEdges = edges;
              return ns.map((n) => {
                const entry = partialLog.find((e: StepLogEntry) => e.step_id === n.id);
                if (entry) {
                  const dur = entry.started_at && entry.finished_at
                    ? Math.max(0, new Date(entry.finished_at).getTime() - new Date(entry.started_at).getTime())
                    : null;
                  return { ...n, data: { ...n.data, runStatus: entry.status as "success" | "error", runOutput: entry.output, runError: entry.error || null, runDuration: dur } };
                }
                const hasCompletedParent = currentEdges.some(
                  (e) => e.target === n.id && completedIds.has(e.source),
                );
                if (hasCompletedParent) {
                  return { ...n, data: { ...n.data, runStatus: "running" as const, runOutput: undefined, runError: null, runDuration: null } };
                }
                return { ...n, data: { ...n.data, runStatus: null, runOutput: undefined, runError: null, runDuration: null } };
              });
            });
          }
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
      const graph = flowToGraph(nodes, edges, nodeColors, nodeNotes);
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

  // Paint run status + output data on each node and item counts on edges after a run.
  useEffect(() => {
    if (!runLog) return;
    const byId = new Map(runLog.map((e) => [e.step_id, e]));
    setNodes((ns) => ns.map((n) => {
      const entry = byId.get(n.id);
      if (!entry) return { ...n, data: { ...n.data, runStatus: null, runOutput: undefined, runError: null, runDuration: null, itemCount: null } };
      const duration = entry.started_at && entry.finished_at
        ? Math.max(0, new Date(entry.finished_at).getTime() - new Date(entry.started_at).getTime())
        : null;
      const count = getItemCount(entry.output);
      return {
        ...n,
        data: {
          ...n.data,
          runStatus: entry.status as "success" | "error",
          runOutput: entry.output,
          runError: entry.error || null,
          runDuration: duration,
          itemCount: count,
        },
      };
    }));
    // Update edge data with item counts from source nodes
    setEdges((es) => es.map((e) => {
      const srcEntry = byId.get(e.source);
      const isRunning = runStatus === "running" || runStatus === "queued";
      return {
        ...e,
        animated: isRunning,
        data: {
          ...((e.data ?? {}) as Record<string, unknown>),
          itemCount: srcEntry ? getItemCount(srcEntry.output) : null,
          isExecuting: isRunning,
          // At-rest run tint: edges downstream of a succeeded/failed step
          // pick up the status color (the green dashed look from the design).
          runStatus: !isRunning && srcEntry ? (srcEntry.status as string) : null,
        },
      };
    }));
  }, [runLog, runStatus]);

  // Paint the most recent run's results at rest: a workflow that has run
  // before opens already decorated (green badges, item-count pills) — the
  // "just-ran" look from the design — instead of a bare canvas. Fetches the
  // last run's log once on mount; the paint effect above then decorates.
  useEffect(() => {
    if (!workflow.last_run_status) return;
    let cancelled = false;
    (async () => {
      try {
        const listRes = await fetch(`/api/dante/workflows/${workflow.id}`, { credentials: "include" });
        if (!listRes.ok) return;
        const listJson = await listRes.json();
        const lastRun = (listJson.runs ?? [])[0];
        if (!lastRun?.id) return;
        const detailRes = await fetch(`/api/dante/workflows/runs/${lastRun.id}`, { credentials: "include" });
        if (!detailRes.ok) return;
        const detailJson = await detailRes.json();
        const rd = detailJson.run;
        if (!cancelled && rd?.log) {
          setRunLog(rd.log);
          setRunStatus(rd.status === "error" ? "error" : "success");
        }
      } catch { /* leave the canvas undecorated */ }
    })();
    return () => { cancelled = true; };
  }, [workflow.id, workflow.last_run_status]);

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
  const edgeTypes: EdgeTypes = useMemo(() => ({ smooth: SmoothEdge }), []);

  // Enhance nodes with color, notes, and rename callback
  const enhancedNodes = useMemo(() =>
    nodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        color: nodeColors[n.id] || "",
        notes: nodeNotes[n.id] || "",
        onRename: renameNode,
      },
    })),
    [nodes, nodeColors, nodeNotes, renameNode],
  );

  // Categorized + filtered palette items
  const filteredByCategory = useMemo(() => {
    const q = paletteSearch.toLowerCase().trim();
    const filtered = q
      ? NODE_TYPES.filter((t) => t.label.toLowerCase().includes(q) || t.hint.toLowerCase().includes(q) || t.type.includes(q))
      : NODE_TYPES;
    const groups: Partial<Record<NodeCategory, typeof NODE_TYPES>> = {};
    for (const t of filtered) {
      (groups[t.category] ??= []).push(t);
    }
    return groups;
  }, [paletteSearch]);

  const toggleCategory = useCallback((cat: NodeCategory) => {
    setCollapsedCategories((s) => {
      const next = new Set(s);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden bg-[var(--canvas)]">
      {/* Top bar — n8n-style: back + name left, tools center, actions right */}
      <div className="sticky top-0 z-30 flex items-center h-[50px] px-3 bg-[var(--canvas)] border-b border-[var(--rule)]">
        {/* Left: back + name */}
        <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
          <Link href="/dante/workflows"
            className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
          </Link>
          <div className="w-px h-5 bg-[var(--rule)]" />
          <div className="flex flex-col min-w-0">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-sm font-semibold text-[var(--ink)] bg-transparent border-none focus:outline-none focus:bg-[var(--canvas-subtle)] rounded-[4px] px-2 py-0.5 max-w-[240px]"
            />
            <span className="mono px-2 text-[9px] uppercase tracking-wide text-[var(--ink-subtle)] whitespace-nowrap">
              {nodes.length} node{nodes.length === 1 ? "" : "s"}
              {workflow.last_run_at ? ` · last run ${timeAgoShort(workflow.last_run_at)}` : " · never run"}
            </span>
          </div>
          {saveStatus === "saved" && (
            <span className="text-[10px] text-[var(--verified)] flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" strokeWidth={1.5} /> Saved
            </span>
          )}
          <div className="flex items-center gap-1 ml-1">
            {tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-0.5 text-[9px] font-medium text-[var(--ink-muted)] bg-[var(--canvas-subtle)] border border-[var(--rule)] rounded-full px-1.5 py-0.5 group/tag">
                {t}
                <button onClick={() => removeTag(t)} className="opacity-0 group-hover/tag:opacity-100 transition ml-0.5">
                  <X className="w-2 h-2" strokeWidth={2} />
                </button>
              </span>
            ))}
            <div className="relative">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && tagInput.trim()) { addTag(tagInput); setTagInput(""); }
                  if (e.key === "Backspace" && !tagInput && tags.length > 0) removeTag(tags[tags.length - 1]);
                }}
                placeholder="+"
                className="w-[28px] focus:w-[80px] text-[9px] text-[var(--ink-muted)] bg-transparent border-none focus:outline-none focus:bg-[var(--canvas-subtle)] rounded-[3px] px-1 py-0.5 transition-all"
              />
            </div>
          </div>
        </div>

        {/* Center: editor tools */}
        <div className="flex-1 flex items-center justify-center gap-1">
          <div className="flex items-center bg-[var(--canvas-subtle)] rounded-[6px] p-0.5">
            <button onClick={undo} disabled={undoStack.length === 0}
              title="Undo (Cmd+Z)"
              className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas)] transition disabled:opacity-30">
              <Undo2 className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
            <button onClick={redo} disabled={redoStack.length === 0}
              title="Redo (Cmd+Shift+Z)"
              className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas)] transition disabled:opacity-30">
              <Redo2 className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
          <button
            onClick={tidyLayout}
            title="Auto-layout"
            className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition"
          >
            <AlignVerticalJustifyCenter className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
          <button
            onClick={() => setMinimapVisible((v) => !v)}
            title="Toggle minimap"
            className={`p-1.5 rounded-[4px] transition ${minimapVisible ? "text-[var(--ink)]" : "text-[var(--ink-subtle)]"} hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)]`}
          >
            <MapPin className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
          <button
            onClick={() => setConnectionStyle((s) => (s === "curved" ? "stepped" : "curved"))}
            title={`Connections: ${connectionStyle === "curved" ? "Curved" : "Stepped"}`}
            className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition"
          >
            <Spline className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
          <button
            onClick={() => setShowGrid((v) => !v)}
            title="Toggle grid"
            className={`p-1.5 rounded-[4px] transition ${showGrid ? "text-[var(--ink)]" : "text-[var(--ink-subtle)]"} hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)]`}
          >
            <LayoutGrid className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <div className="flex items-center gap-2 px-2">
            <span className="text-[11px] text-[var(--ink-muted)]">Active</span>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              data-on={enabled ? "true" : "false"}
              onClick={() => setEnabled(!enabled)}
              className="drift-switch"
              title={enabled ? "Active" : "Inactive"}
            >
              <span className="drift-switch__knob" />
            </button>
          </div>
          <div className="w-px h-5 bg-[var(--rule)] mx-1" />
          {/* Grouped secondary tools */}
          <div className="flex items-center bg-[var(--canvas-subtle)] rounded-[6px] p-0.5">
            <button onClick={toggleHistory} title="Execution history"
              className={`p-1.5 rounded-[4px] transition ${historyOpen ? "bg-[var(--canvas)] text-[var(--ink)] shadow-sm" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"}`}>
              <History className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
            <button onClick={() => { setVersionsOpen(true); loadVersions(); }} title="Versions"
              className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] transition">
              <GitBranch className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
            <button onClick={() => { setSecretsOpen(true); loadSecrets(); }} title="Credentials"
              className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] transition">
              <Key className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
            <button onClick={() => setShowImportExport("export")} title="Export"
              className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] transition">
              <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
            <button onClick={() => setShowShortcuts(true)} title="Keyboard shortcuts"
              className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] transition">
              <Keyboard className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
          <div className="w-px h-5 bg-[var(--rule)] mx-1" />
          {/* Primary actions */}
          <button onClick={save} disabled={saving} className="drift-btn drift-btn--secondary drift-btn--sm">
            {saving ? <Loader2 className="animate-spin" strokeWidth={1.5} /> : <Save strokeWidth={1.5} />}
            Save
          </button>
          <button
            onClick={dryRun}
            disabled={dryRunning || running || nodes.length === 0}
            title="Test run (side effects mocked)"
            className="drift-btn drift-btn--secondary drift-btn--sm"
          >
            {dryRunning
              ? <Loader2 className="animate-spin" strokeWidth={1.5} />
              : <FlaskConical strokeWidth={1.5} />}
            Test
          </button>
          {running ? (
            <button onClick={cancelExecution} className="drift-btn drift-btn--danger drift-btn--sm">
              <StopCircle strokeWidth={1.5} />
              Stop
            </button>
          ) : (
            <button onClick={handleRunClick} disabled={dryRunning || nodes.length === 0} className="drift-btn drift-btn--primary drift-btn--sm">
              <Play strokeWidth={1.5} />
              Execute
            </button>
          )}
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

      {/* Run input dialog — shown when trigger has input_fields */}
      {runInputOpen && (() => {
        const triggerNode = nodes.find((n) => {
          const t = String(n.data.step.type);
          return t === "trigger_manual" || t === "n8n-nodes-base.webhook"
            || t === "n8n-nodes-base.manualTrigger" || t.startsWith("trigger_");
        });
        const fields = (triggerNode ? getTriggerInputFields(triggerNode.data.step) : []).filter((f) => f.name);
        const missingRequired = fields.some((f) => f.required && !runInputValues[f.name]?.trim());
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-[var(--canvas)] rounded-xl shadow-2xl border border-[var(--rule)] w-full max-w-xl mx-4">
              <div className="px-8 py-6 border-b border-[var(--rule)]">
                <h3 className="text-lg font-semibold text-[var(--ink)]">Run workflow</h3>
                <p className="text-sm text-[var(--ink-muted)] mt-1">
                  Provide the inputs this workflow needs to run.
                </p>
              </div>
              <div className="px-8 py-6 space-y-5">
                {fields.map((f) => (
                  <div key={f.name}>
                    <label className="block text-sm font-semibold text-[var(--ink)] mb-1.5">
                      {f.label || f.name}
                      {f.required && <span className="text-[var(--danger)] ml-0.5">*</span>}
                    </label>
                    {f.type === "textarea" ? (
                      <textarea
                        value={runInputValues[f.name] || ""}
                        onChange={(e) => setRunInputValues((v) => ({ ...v, [f.name]: e.target.value }))}
                        placeholder={f.placeholder || ""}
                        rows={4}
                        className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[6px] px-4 py-3 text-sm leading-relaxed text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none focus:border-[var(--rule-strong)] focus:ring-1 focus:ring-[var(--rule-strong)]"
                      />
                    ) : (
                      <input
                        type={f.type === "number" ? "number" : "text"}
                        value={runInputValues[f.name] || ""}
                        onChange={(e) => setRunInputValues((v) => ({ ...v, [f.name]: e.target.value }))}
                        placeholder={f.placeholder || ""}
                        className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[6px] px-4 py-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none focus:border-[var(--rule-strong)] focus:ring-1 focus:ring-[var(--rule-strong)]"
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className="px-8 py-5 border-t border-[var(--rule)] flex justify-end gap-3">
                <button
                  onClick={() => setRunInputOpen(false)}
                  className="px-5 py-2.5 rounded-[6px] border border-[var(--rule)] text-sm font-medium text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const input: Record<string, unknown> = {};
                    for (const f of fields) {
                      const val = runInputValues[f.name]?.trim() || "";
                      if (val) input[f.name] = f.type === "number" ? Number(val) : val;
                    }
                    run(input);
                  }}
                  disabled={missingRequired}
                  className="px-6 py-2.5 rounded-[6px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition"
                >
                  <span className="flex items-center gap-2">
                    <Play className="w-4 h-4" strokeWidth={1.5} />
                    Run
                  </span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Main area */}
      <div className="flex-1 flex min-h-0">
        {/* Palette — n8n-style narrow sidebar */}
        <aside className="w-[240px] shrink-0 border-r border-[var(--rule)] bg-[var(--canvas)] overflow-y-auto">
          <div className="p-2.5">
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--ink-subtle)]" strokeWidth={1.5} />
              <input
                value={paletteSearch}
                onChange={(e) => setPaletteSearch(e.target.value)}
                placeholder="Search nodes..."
                className="w-full pl-8 pr-3 py-1.5 bg-[var(--canvas-subtle)] border-none rounded-[6px] text-xs text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none focus:ring-1 focus:ring-[var(--rule-strong)]"
              />
              {paletteSearch && (
                <button onClick={() => setPaletteSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--ink-subtle)] hover:text-[var(--ink)]">
                  <X className="w-3 h-3" strokeWidth={1.5} />
                </button>
              )}
            </div>
            {CATEGORY_ORDER.map((cat) => {
              const items = filteredByCategory[cat];
              if (!items || items.length === 0) return null;
              const collapsed = collapsedCategories.has(cat) && !paletteSearch;
              return (
                <div key={cat} className="mb-1">
                  <button
                    onClick={() => toggleCategory(cat)}
                    className="w-full flex items-center justify-between px-1.5 py-1 text-left group"
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-subtle)]">{CATEGORY_LABELS[cat]}</span>
                    <ChevronRight className={`w-3 h-3 text-[var(--ink-subtle)] transition-transform ${collapsed ? "" : "rotate-90"}`} strokeWidth={1.5} />
                  </button>
                  {!collapsed && (
                    <div className="space-y-px">
                      {items.map((t) => <PaletteItem key={t.type} meta={t} onAdd={() => addNode(t.type)} />)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        {/* Canvas + log column */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 relative min-h-0">
            <ReactFlowProvider>
              <SteppedEdgeContext.Provider value={connectionStyle === "stepped"}>
              <ReactFlow
                nodes={enhancedNodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onConnectEnd={onConnectEnd}
                onNodeClick={(_, n) => { setSelectedId(n.id); setContextMenu(null); setNodePicker(null); setDataViewTab("config"); }}
                onNodeDoubleClick={(_, n) => { setNdvNodeId(n.id); setSelectedId(n.id); setDataViewTab("output"); }}
                onPaneClick={() => { setSelectedId(null); setContextMenu(null); setNodePicker(null); }}
                onNodeContextMenu={(e, n) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, nodeId: n.id });
                  setSelectedId(n.id);
                }}
                onEdgeClick={(_, e) => { setSelectedId(null); }}
                selectionOnDrag
                selectionMode={"partial" as any}
                multiSelectionKeyCode="Shift"
                snapToGrid
                snapGrid={[16, 16]}
                fitView
                // Open at a readable scale: clamp the initial fit to >=0.85 so
                // a wide linear chain doesn't shrink to flat pills (the
                // neumorphic depth + dot grid only read near 100%). Wider
                // graphs open partially and pan; the Fit control (overall
                // minZoom 0.2) still frames everything on demand.
                fitViewOptions={{ padding: 0.15, minZoom: 0.85, maxZoom: 1 }}
                minZoom={0.2}
                deleteKeyCode={null}
                defaultEdgeOptions={{
                  type: "smooth",
                  animated: false,
                  data: {},
                  style: { stroke: "var(--ink-subtle)", strokeWidth: 2 },
                }}
              >
                {showGrid && <Background color="var(--grid-dot)" gap={22} size={1} variant={"dots" as any} />}
                <CanvasZoomControls />
                {/* Ask Dante */}
                <button
                  onClick={() => setShowCommandPalette(true)}
                  title="Ask Dante (Cmd+K)"
                  className="absolute right-4 bottom-4 z-10 inline-flex items-center gap-2 rounded-[12px] px-4 py-2.5 text-[13px] font-semibold border-none cursor-pointer transition hover:opacity-90"
                  style={{ background: "var(--action)", color: "var(--action-ink)", boxShadow: "var(--shadow-floating)" }}
                >
                  <Sparkles className="w-[15px] h-[15px]" strokeWidth={1.85} />
                  Ask Dante
                </button>
                {minimapVisible && (
                  <MiniMap
                    className="!bg-[var(--canvas-subtle)] !border !border-[var(--rule)] !rounded-[8px] !shadow-md"
                    position="top-right"
                    nodeColor="var(--ink-subtle)"
                    maskColor="rgba(21,21,21,0.05)"
                    pannable
                  />
                )}
              </ReactFlow>
              </SteppedEdgeContext.Provider>

              {/* Context menu */}
              {contextMenu && (() => {
                const ctxNode = nodes.find((n) => n.id === contextMenu.nodeId);
                if (!ctxNode) return null;
                const isTrigger = isTriggerType(ctxNode.data.step.type);
                const isDisabled = !!ctxNode.data.disabled;
                return (
                  <div
                    className="fixed z-50 bg-[var(--canvas)] border border-[var(--rule)] rounded-[6px] shadow-lg py-1 min-w-[160px]"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                  >
                    <ContextMenuItem
                      icon={Copy}
                      label="Duplicate"
                      shortcut="Cmd+D"
                      disabled={isTrigger}
                      onClick={() => { duplicateSelected(); setContextMenu(null); }}
                    />
                    <ContextMenuItem
                      icon={Clipboard}
                      label="Copy"
                      shortcut="Cmd+C"
                      onClick={() => { copySelected(); setContextMenu(null); }}
                    />
                    <div className="my-1 h-px bg-[var(--rule)]" />
                    <ContextMenuItem
                      icon={EyeOff}
                      label={isDisabled ? "Enable" : "Disable"}
                      disabled={isTrigger}
                      onClick={() => { toggleDisabled(contextMenu.nodeId); setContextMenu(null); }}
                    />
                    <div className="my-1 h-px bg-[var(--rule)]" />
                    <div className="px-3 py-1.5">
                      <div className="text-[10px] text-[var(--ink-subtle)] mb-1">Color</div>
                      <div className="flex gap-1">
                        {NODE_COLORS.map((c) => (
                          <button
                            key={c.value}
                            onClick={() => { setNodeColor(contextMenu.nodeId, c.value); setContextMenu(null); }}
                            className={`w-4 h-4 rounded-full border border-[var(--rule)] transition hover:scale-110 ${
                              (nodeColors[contextMenu.nodeId] || "") === c.value ? "ring-2 ring-[var(--ink)] ring-offset-1 ring-offset-[var(--canvas)]" : ""
                            }`}
                            style={{ background: c.value || "var(--canvas-subtle)" }}
                            title={c.label}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="my-1 h-px bg-[var(--rule)]" />
                    <ContextMenuItem
                      icon={Trash2}
                      label="Delete"
                      shortcut="Del"
                      disabled={isTrigger}
                      danger
                      onClick={() => { deleteNode(contextMenu.nodeId); setContextMenu(null); }}
                    />
                  </div>
                );
              })()}

              {/* Drag-to-create node picker */}
              {nodePicker && (
                <div
                  className="absolute z-50 bg-[var(--canvas)] border border-[var(--rule)] rounded-[6px] shadow-xl w-[220px] max-h-[300px] overflow-y-auto"
                  style={{ left: nodePicker.x, top: nodePicker.y }}
                >
                  <div className="px-3 py-2 border-b border-[var(--rule)]">
                    <span className="text-[10px] uppercase tracking-wider text-[var(--ink-subtle)] font-medium">Add connected node</span>
                  </div>
                  <div className="py-1">
                    {NODE_TYPES.filter((t) => t.group === "action").map((t) => {
                      const Icon = t.icon;
                      return (
                        <button
                          key={t.type}
                          onClick={() => addNodeFromPicker(t.type)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[var(--canvas-subtle)] transition"
                        >
                          <Icon className="w-3.5 h-3.5 text-[var(--ink-muted)]" strokeWidth={1.5} />
                          <span className="text-[var(--ink)]">{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </ReactFlowProvider>
          </div>

          {/* Execution panel — n8n-style bottom panel with step table */}
          {(runLog || (runStatus && runStatus !== null)) && (
            <div className="border-t border-[var(--rule)] bg-[var(--canvas)] max-h-[35vh] flex flex-col">
              <div
                onClick={() => setLogOpen((v) => !v)}
                className="flex items-center justify-between px-4 py-1.5 bg-[var(--canvas-subtle)] border-b border-[var(--rule)] cursor-pointer hover:bg-[var(--canvas-subtle)]/80 select-none"
              >
                <div className="flex items-center gap-2">
                  {runStatus && (
                    <>
                      {runStatus === "success" && <CheckCircle2 className="w-3.5 h-3.5 text-[var(--verified)]" strokeWidth={1.5} />}
                      {runStatus === "error" && <AlertCircle className="w-3.5 h-3.5 text-[var(--danger)]" strokeWidth={1.5} />}
                      {(runStatus === "running" || runStatus === "queued") && <Loader2 className="w-3.5 h-3.5 text-[var(--ink-muted)] animate-spin" strokeWidth={1.5} />}
                    </>
                  )}
                  <span className="text-[11px] font-semibold text-[var(--ink)]">
                    {isDryRun ? "Test execution" : "Execution"}
                  </span>
                  {runLog && runLog.length > 0 && (
                    <span className="text-[10px] text-[var(--ink-subtle)] mono">
                      {runLog.length} step{runLog.length !== 1 ? "s" : ""}
                    </span>
                  )}
                  {isDryRun && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded-[3px] text-[var(--ink-muted)] bg-[var(--canvas)]">
                      <FlaskConical className="w-2.5 h-2.5" strokeWidth={1.5} />
                      simulated
                    </span>
                  )}
                </div>
                {logOpen
                  ? <ChevronDown className="w-3.5 h-3.5 text-[var(--ink-muted)]" strokeWidth={1.5} />
                  : <ChevronUp   className="w-3.5 h-3.5 text-[var(--ink-muted)]" strokeWidth={1.5} />}
              </div>
              {logOpen && (
                <div className="overflow-y-auto flex-1">
                  {!runLog && runStatus && runStatus !== "success" && runStatus !== "error" && (
                    <div className="text-xs text-[var(--ink-muted)] flex items-center gap-2 py-4 px-4">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                      {runStatus === "queued" ? "Queued -- waiting for worker" : "Executing..."}
                    </div>
                  )}
                  {runLog && runLog.length > 0 && (
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="bg-[var(--canvas-subtle)] text-[var(--ink-subtle)]">
                          <th className="text-left px-4 py-1.5 font-medium w-6"></th>
                          <th className="text-left px-2 py-1.5 font-medium">Node</th>
                          <th className="text-left px-2 py-1.5 font-medium mono">Type</th>
                          <th className="text-right px-2 py-1.5 font-medium">Time</th>
                          <th className="text-left px-4 py-1.5 font-medium">Output</th>
                        </tr>
                      </thead>
                      <tbody>
                        {runLog.map((entry) => (
                          <tr
                            key={entry.step_id}
                            onClick={() => setSelectedId(entry.step_id)}
                            className="border-t border-[var(--rule)] hover:bg-[var(--canvas-subtle)] cursor-pointer transition"
                          >
                            <td className="px-4 py-1.5">
                              {entry.status === "success"
                                ? <CheckCircle2 className="w-3 h-3 text-[var(--verified)]" strokeWidth={1.5} />
                                : <AlertCircle  className="w-3 h-3 text-[var(--danger)]"   strokeWidth={1.5} />}
                            </td>
                            <td className="px-2 py-1.5 font-medium text-[var(--ink)]">{entry.step_name}</td>
                            <td className="px-2 py-1.5 text-[var(--ink-subtle)] mono text-[10px]">{entry.step_type}</td>
                            <td className="px-2 py-1.5 text-right text-[var(--ink-subtle)] mono text-[10px]">
                              {durationMs(entry.started_at, entry.finished_at)}ms
                            </td>
                            <td className="px-4 py-1.5 text-[var(--ink-muted)] mono text-[10px] max-w-[300px] truncate">
                              {entry.error
                                ? <span className="text-[var(--danger)]">{entry.error.slice(0, 60)}</span>
                                : entry.output !== undefined
                                  ? JSON.stringify(entry.output).slice(0, 80)
                                  : "--"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
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

            {/* Filter tabs */}
            <div className="flex border-b border-[var(--rule)]">
              {(["all", "production", "test"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setHistoryFilter(f)}
                  className={`flex-1 py-2 text-[10px] font-medium transition border-b-2 ${
                    historyFilter === f
                      ? "border-[var(--ink)] text-[var(--ink)]"
                      : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]"
                  }`}
                >
                  {f === "all" ? "All" : f === "production" ? "Production" : "Test"}
                </button>
              ))}
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
                            {/* Replay + Retry buttons */}
                            <div className="flex items-center gap-2 mb-3">
                              {runDetail && runDetail.log && runDetail.log.length > 0 && (
                                <button
                                  onClick={() => {
                                    setRunLog(runDetail.log);
                                    setRunStatus(runDetail.status as "success" | "error");
                                    setIsDryRun(false);
                                    setLogOpen(true);
                                    setHistoryOpen(false);
                                  }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] border border-[var(--rule)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas)] text-[11px] font-medium transition"
                                >
                                  <RotateCcw className="w-3 h-3" strokeWidth={1.5} />
                                  Replay on canvas
                                </button>
                              )}
                              {row.status === "error" && (
                                <button
                                  onClick={() => { setHistoryOpen(false); retryExecution(); }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] border border-[var(--rule)] text-[var(--danger)] hover:bg-[var(--danger-soft)] text-[11px] font-medium transition"
                                >
                                  <RefreshCw className="w-3 h-3" strokeWidth={1.5} />
                                  Retry
                                </button>
                              )}
                            </div>
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

        {/* Right drawer -- n8n-style node settings panel (hidden while the NDV modal is open) */}
        {selectedNode && !historyOpen && !ndvNodeId && (() => {
          const hasRunData = selectedNode.data.runStatus && selectedNode.data.runStatus !== "running";
          const isPinned = pinnedData[selectedNode.id] !== undefined;
          const meta = getMeta(selectedNode.data.step.type);
          const Icon = meta?.icon;
          const inputData = (() => {
            const incomingEdgeIds = edges.filter((e) => e.target === selectedNode.id).map((e) => e.source);
            const inputEntries: Array<{ id: string; name: string; output: unknown }> = [];
            for (const srcId of incomingEdgeIds) {
              const srcNode = nodes.find((n) => n.id === srcId);
              if (srcNode?.data.runOutput !== undefined) {
                inputEntries.push({ id: srcId, name: srcNode.data.step.name || srcId, output: srcNode.data.runOutput });
              }
            }
            return inputEntries;
          })();
          return (
          <aside className="w-[420px] shrink-0 border-l border-[var(--rule)] bg-[var(--canvas)] overflow-y-auto flex flex-col">
            <div className="sticky top-0 z-10 bg-[var(--canvas)]">
              {/* Node identity header */}
              <div className="px-4 py-3 flex items-center gap-3 border-b border-[var(--rule)]">
                {Icon && (
                  <div className="rounded-[8px] p-2 bg-[var(--canvas-subtle)] text-[var(--ink)]">
                    <Icon className="w-5 h-5" strokeWidth={1.5} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-[var(--ink)]">
                    {selectedNode.data.step.name || meta?.label || selectedNode.data.step.type}
                  </div>
                  <div className="text-[10px] text-[var(--ink-subtle)] mono truncate">
                    {meta?.label || selectedNode.data.step.type}
                  </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  {!isTriggerType(selectedNode.data.step.type) && (
                    <button
                      onClick={() => togglePinData(selectedNode.id, isPinned ? undefined : selectedNode.data.runOutput ?? {})}
                      title={isPinned ? "Unpin test data" : "Pin test data"}
                      className={`p-1.5 rounded-[4px] ${isPinned ? "text-[var(--accent)] bg-[var(--accent-soft)]" : "text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)]"}`}
                    >
                      {isPinned ? <PinOff className="w-3.5 h-3.5" strokeWidth={1.5} /> : <Pin className="w-3.5 h-3.5" strokeWidth={1.5} />}
                    </button>
                  )}
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
              {/* Tabs */}
              <div className="flex">
                {(["config", "input", "output"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setDataViewTab(tab)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-medium transition border-b-2 ${
                      dataViewTab === tab
                        ? "border-[var(--ink)] text-[var(--ink)]"
                        : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]"
                    }`}
                  >
                    {tab === "config" ? "Parameters" : tab === "input" ? "Input" : "Output"}
                    {tab === "output" && hasRunData && (
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        selectedNode.data.runStatus === "success" ? "bg-[var(--verified)]" : "bg-[var(--danger)]"
                      }`} />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {/* Config tab */}
              {dataViewTab === "config" && (
                <>
                  <StepConfigForm
                    key={selectedNode.id}
                    step={selectedNode.data.step}
                    onChange={updateSelectedStep}
                  />

                  {/* Node notes */}
                  <div className="mt-5 pt-5 border-t border-[var(--rule)]">
                    <div className="label-section mb-2">Notes</div>
                    <textarea
                      value={nodeNotes[selectedNode.id] || ""}
                      onChange={(e) => setNodeNote(selectedNode.id, e.target.value)}
                      placeholder="Add notes about this node..."
                      rows={3}
                      className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-3 py-2 text-[11px] text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)] placeholder:text-[var(--ink-subtle)] resize-y"
                    />
                  </div>

                  {/* Pin data editor */}
                  {isPinned && (
                    <div className="mt-5 pt-5 border-t border-[var(--rule)]">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="label-section">Pinned test data</span>
                        <Pin className="w-3 h-3 text-[var(--accent)]" strokeWidth={1.5} />
                      </div>
                      <p className="text-[10px] text-[var(--ink-muted)] mb-2">
                        Downstream nodes will use this data instead of running this step.
                      </p>
                      <textarea
                        defaultValue={JSON.stringify(pinnedData[selectedNode.id], null, 2)}
                        onBlur={(e) => {
                          try { togglePinData(selectedNode.id, JSON.parse(e.target.value)); } catch {}
                        }}
                        rows={6}
                        spellCheck={false}
                        className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-3 py-2 text-[11px] text-[var(--ink)] mono focus:outline-none focus:border-[var(--rule-strong)] resize-y"
                      />
                    </div>
                  )}

                  {/* Webhook token panel */}
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

                  {/* Description for trigger node */}
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
                </>
              )}

              {/* Input tab — data from upstream nodes */}
              {dataViewTab === "input" && (
                <div className="space-y-4">
                  {inputData.length === 0 ? (
                    <p className="text-xs text-[var(--ink-muted)] py-4 text-center">
                      No input data. Run the workflow to see upstream outputs flowing into this node.
                    </p>
                  ) : (
                    inputData.map((src) => (
                      <div key={src.id}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[11px] font-medium text-[var(--ink)]">{src.name}</span>
                          <span className="text-[9px] text-[var(--ink-subtle)] mono">{src.id}</span>
                        </div>
                        <DataView data={src.output} />
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Output tab — this node's run output */}
              {dataViewTab === "output" && (
                <div>
                  {!hasRunData ? (
                    <p className="text-xs text-[var(--ink-muted)] py-4 text-center">
                      No output data. Run the workflow to see this node's output.
                    </p>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 mb-3">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-[3px] ${
                          selectedNode.data.runStatus === "success"
                            ? "text-[var(--verified)] bg-[var(--verified-soft)]"
                            : "text-[var(--danger)] bg-[var(--danger-soft)]"
                        }`}>
                          {selectedNode.data.runStatus}
                        </span>
                        {selectedNode.data.runDuration != null && (
                          <span className="text-[10px] text-[var(--ink-subtle)] mono">
                            {(selectedNode.data.runDuration as number) < 1000
                              ? `${selectedNode.data.runDuration}ms`
                              : `${((selectedNode.data.runDuration as number) / 1000).toFixed(1)}s`}
                          </span>
                        )}
                      </div>
                      {selectedNode.data.runError && (
                        <pre className="mono text-[10px] text-[var(--danger)] bg-[var(--danger-soft)] rounded-[4px] p-2.5 whitespace-pre-wrap break-words mb-3">
                          {selectedNode.data.runError}
                        </pre>
                      )}
                      {selectedNode.data.step.type === "agent" && (selectedNode.data.runOutput as { text?: string } | undefined)?.text ? (
                        <AgentOutputView
                          text={(selectedNode.data.runOutput as { text?: string }).text as string}
                          trace={runLog ?? []}
                          report={citationReports[selectedNode.id] ?? null}
                        />
                      ) : selectedNode.data.runOutput !== undefined && selectedNode.data.runOutput !== null ? (
                        <DataView data={selectedNode.data.runOutput} />
                      ) : null}
                    </>
                  )}
                </div>
              )}
            </div>
          </aside>
          );
        })()}
      </div>

      {/* Node Detail View (NDV) — centered three-pane modal: Input · Parameters · Output (spec §8) */}
      {ndvNode && (() => {
        const nodeType = resolveStepType(ndvNode.data.step.type);
        const meta = getMeta(nodeType);
        const Icon = meta?.icon;
        const isAgent = nodeType === "agent";
        const isSub = nodeType === "chat_model" || nodeType === "agent_memory" || nodeType === "agent_tool";
        const isTrig = isTriggerType(nodeType);
        const hasRunData = ndvNode.data.runStatus && ndvNode.data.runStatus !== "running";
        const dur = ndvNode.data.runDuration as number | null | undefined;
        const fmtDur = dur == null ? "" : dur < 1000 ? `${dur}ms` : `${(dur / 1000).toFixed(1)}s`;
        const ndvInput = edges
          .filter((e) => e.target === ndvNode.id)
          .map((e) => nodes.find((n) => n.id === e.source))
          .filter((n): n is DanteRFNode => !!n && n.data.runOutput !== undefined)
          .map((n) => ({ id: n.id, name: n.data.step.name || n.id, output: n.data.runOutput }));
        const subRows = isAgent
          ? edges
              .filter((e) => e.target === ndvNode.id && (e.targetHandle === "ai_model" || e.targetHandle === "ai_memory" || e.targetHandle === "ai_tool"))
              .map((e) => ({
                label: e.targetHandle === "ai_model" ? "Chat Model" : e.targetHandle === "ai_memory" ? "Memory" : "Tool",
                name: nodes.find((n) => n.id === e.source)?.data.step.name ?? "—",
              }))
          : [];
        const out = ndvNode.data.runOutput;
        return (
          <div
            className="fixed inset-0 z-[55] flex items-center justify-center"
            style={{ background: "rgba(20,20,24,.28)", backdropFilter: "blur(3px)" }}
            onMouseDown={() => setNdvNodeId(null)}
          >
            <div
              className="glass-panel flex flex-col overflow-hidden"
              style={{ background: "var(--neu-sidebar)", width: "min(1180px,94vw)", height: "min(720px,88vh)" }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--rule-ink)] shrink-0">
                <div
                  className="shrink-0 flex items-center justify-center"
                  style={{ width: 40, height: 40, borderRadius: 11, background: isTrig ? "var(--ink)" : "var(--neu-card)", color: isTrig ? "#fff" : "var(--ink)", boxShadow: isTrig ? "0 1px 3px rgba(0,0,0,.25)" : "var(--neu-shadow-raised)" }}
                >
                  {Icon && <Icon style={{ width: 22, height: 22 }} strokeWidth={1.5} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-[var(--ink)] truncate">{ndvNode.data.step.name || meta?.label || nodeType}</div>
                  <div className="label-section">{meta?.label || nodeType}</div>
                </div>
                {hasRunData && (
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[999px] text-[11px] font-medium"
                    style={ndvNode.data.runStatus === "error" ? { background: "var(--danger-soft)", color: "var(--danger)" } : { background: "var(--verified-soft)", color: "var(--verified)" }}
                  >
                    {ndvNode.data.runStatus === "success" ? <CheckCircle2 className="w-3 h-3" strokeWidth={2} /> : <AlertCircle className="w-3 h-3" strokeWidth={2} />}
                    {ndvNode.data.runStatus === "success" ? "Success" : "Error"}{fmtDur ? ` · ${fmtDur}` : ""}
                  </span>
                )}
                {!isTrig && (
                  <button onClick={() => { setSelectedId(ndvNode.id); dryRun(); }} disabled={dryRunning} className="drift-btn drift-btn--secondary drift-btn--sm">
                    {dryRunning ? <Loader2 className="animate-spin" strokeWidth={1.5} /> : <FlaskConical strokeWidth={1.5} />}
                    Test step
                  </button>
                )}
                <button onClick={() => setNdvNodeId(null)} title="Close (Esc)" className="p-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--neu-hover)] rounded-[6px]">
                  <X className="w-4 h-4" strokeWidth={1.5} />
                </button>
              </div>

              {/* Body — Input · Parameters · Output */}
              <div className="flex-1 overflow-hidden grid" style={{ gridTemplateColumns: "1fr 1.3fr 1fr" }}>
                {/* INPUT (inset) */}
                <div className="overflow-y-auto p-4 border-r border-[var(--rule-ink)]" style={{ background: "var(--neu-main)" }}>
                  <div className="label-section mb-3">Input{ndvInput.length ? ` · ${ndvInput.length} item${ndvInput.length === 1 ? "" : "s"}` : ""}</div>
                  {ndvInput.length === 0 ? (
                    <p className="text-[11px] text-[var(--ink-muted)] py-3">
                      {isTrig ? "Starts the run — no input." : isSub ? "Invoked by its agent." : "No input yet. Run the workflow to see upstream data."}
                    </p>
                  ) : (
                    ndvInput.map((src) => (
                      <div key={src.id} className="mb-4">
                        <div className="text-[11px] font-medium text-[var(--ink)] mb-2">{src.name}</div>
                        <DataView data={src.output} />
                      </div>
                    ))
                  )}
                </div>

                {/* PARAMETERS (raised) */}
                <div className="overflow-y-auto p-5" style={{ background: "var(--neu-card)" }}>
                  <div className="label-section mb-3">Parameters</div>
                  <StepConfigForm key={ndvNode.id} step={ndvNode.data.step} onChange={updateSelectedStep} />
                  {subRows.length > 0 && (
                    <div className="mt-5 pt-5 border-t border-[var(--rule-ink)]">
                      <div className="label-section mb-2">Sub-nodes</div>
                      <div className="space-y-1.5">
                        {subRows.map((r, i) => (
                          <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-[8px]" style={{ background: "var(--neu-card)", boxShadow: "var(--neu-shadow-raised)" }}>
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--verified)] shrink-0" />
                            <span className="label-section">{r.label}</span>
                            <span className="text-[12px] text-[var(--ink)] ml-auto truncate">{r.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="mt-5 pt-5 border-t border-[var(--rule-ink)]">
                    <div className="label-section mb-2">Notes</div>
                    <textarea
                      value={nodeNotes[ndvNode.id] || ""}
                      onChange={(e) => setNodeNote(ndvNode.id, e.target.value)}
                      placeholder="Add notes about this node..."
                      rows={3}
                      className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[6px] px-3 py-2 text-[11px] text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)] placeholder:text-[var(--ink-subtle)] resize-y"
                    />
                  </div>
                </div>

                {/* OUTPUT (inset) */}
                <div className="overflow-y-auto p-4 border-l border-[var(--rule-ink)]" style={{ background: "var(--neu-main)" }}>
                  <div className="label-section mb-3">Output</div>
                  {!hasRunData ? (
                    <p className="text-[11px] text-[var(--ink-muted)] py-3">No output yet. Run the step to see its result.</p>
                  ) : (
                    <>
                      {ndvNode.data.runError ? (
                        <pre className="mono text-[10px] text-[var(--danger)] bg-[var(--danger-soft)] rounded-[6px] p-2.5 whitespace-pre-wrap break-words mb-3">{ndvNode.data.runError as string}</pre>
                      ) : null}
                      {isAgent && (out as { text?: string } | undefined)?.text ? (
                        <AgentOutputView text={(out as { text?: string }).text as string} trace={runLog ?? []} report={citationReports[ndvNode.id] ?? null} />
                      ) : out !== undefined && out !== null ? (
                        <DataView data={out} />
                      ) : (
                        <p className="text-[11px] text-[var(--ink-muted)] py-3">No output payload.</p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Toast notifications */}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-[6px] shadow-lg text-xs font-medium animate-[slideUp_0.2s_ease-out] ${
                t.type === "success" ? "bg-[var(--verified)] text-white"
                : t.type === "error" ? "bg-[var(--danger)] text-white"
                : "bg-[var(--ink)] text-[var(--canvas)]"
              }`}
            >
              {t.type === "success" && <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} />}
              {t.type === "error" && <AlertCircle className="w-3.5 h-3.5" strokeWidth={1.5} />}
              {t.message}
            </div>
          ))}
        </div>
      )}

      {/* Keyboard shortcuts overlay */}
      {showShortcuts && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={() => setShowShortcuts(false)}>
          <div className="bg-[var(--canvas)] rounded-lg shadow-xl border border-[var(--rule)] w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-[var(--rule)] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--ink)]">Keyboard shortcuts</h3>
              <button onClick={() => setShowShortcuts(false)} className="p-1 text-[var(--ink-muted)] hover:text-[var(--ink)]">
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>
            <div className="px-6 py-4 space-y-2">
              {[
                ["Cmd+S", "Save workflow"],
                ["Cmd+Z", "Undo"],
                ["Cmd+Shift+Z", "Redo"],
                ["Cmd+C", "Copy node"],
                ["Cmd+V", "Paste node"],
                ["Cmd+D", "Duplicate node"],
                ["Cmd+A", "Select all nodes"],
                ["Cmd+K", "Command palette"],
                ["Cmd+F", "Find node on canvas"],
                ["Delete", "Delete selected"],
                ["?", "Show this overlay"],
                ["Double-click", "Rename node"],
                ["Right-click", "Context menu"],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-xs text-[var(--ink)]">{desc}</span>
                  <kbd className="text-[10px] mono px-2 py-0.5 rounded-[3px] bg-[var(--canvas-subtle)] border border-[var(--rule)] text-[var(--ink-muted)]">{key}</kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Command palette */}
      {showCommandPalette && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[20vh] bg-black/40" onClick={() => setShowCommandPalette(false)}>
          <div className="bg-[var(--canvas)] rounded-lg shadow-xl border border-[var(--rule)] w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <CommandPalette
              onClose={() => setShowCommandPalette(false)}
              actions={[
                { label: "Save", hint: "Cmd+S", action: () => { save(); setShowCommandPalette(false); } },
                { label: "Run workflow", hint: "Execute", action: () => { handleRunClick(); setShowCommandPalette(false); } },
                { label: "Test run", hint: "Simulated", action: () => { dryRun(); setShowCommandPalette(false); } },
                { label: "Undo", hint: "Cmd+Z", action: () => { undo(); setShowCommandPalette(false); } },
                { label: "Redo", hint: "Cmd+Shift+Z", action: () => { redo(); setShowCommandPalette(false); } },
                { label: "Auto-layout", hint: "Tidy", action: () => { tidyLayout(); setShowCommandPalette(false); } },
                { label: "Export workflow", hint: "JSON", action: () => { exportWorkflow(); setShowCommandPalette(false); } },
                { label: "Import workflow", hint: "JSON", action: () => { setShowImportExport("import"); setShowCommandPalette(false); } },
                { label: "Toggle minimap", action: () => { setMinimapVisible((v) => !v); setShowCommandPalette(false); } },
                { label: "Execution history", action: () => { toggleHistory(); setShowCommandPalette(false); } },
                { label: "Keyboard shortcuts", hint: "?", action: () => { setShowShortcuts(true); setShowCommandPalette(false); } },
                ...NODE_TYPES.map((t) => ({
                  label: `Add: ${t.label}`,
                  hint: t.category,
                  action: () => { addNode(t.type); setShowCommandPalette(false); },
                })),
              ]}
            />
          </div>
        </div>
      )}

      {/* Node search on canvas */}
      {showNodeSearch && (
        <div className="fixed top-[60px] left-1/2 -translate-x-1/2 z-[60] w-[320px]">
          <div className="bg-[var(--canvas)] rounded-[8px] shadow-xl border border-[var(--rule)] overflow-hidden">
            <div className="flex items-center gap-2 px-3">
              <Search className="w-3.5 h-3.5 text-[var(--ink-subtle)]" strokeWidth={1.5} />
              <input
                autoFocus
                value={nodeSearchQuery}
                onChange={(e) => setNodeSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setShowNodeSearch(false);
                  if (e.key === "Enter") {
                    const q = nodeSearchQuery.toLowerCase();
                    const found = nodes.find((n) => (n.data.step.name || "").toLowerCase().includes(q) || n.data.step.type.includes(q));
                    if (found) { setSelectedId(found.id); setShowNodeSearch(false); }
                  }
                }}
                placeholder="Find node..."
                className="flex-1 py-2.5 bg-transparent border-none text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none"
              />
              <button onClick={() => setShowNodeSearch(false)} className="p-1 text-[var(--ink-muted)] hover:text-[var(--ink)]">
                <X className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </div>
            {nodeSearchQuery && (
              <div className="border-t border-[var(--rule)] max-h-[200px] overflow-y-auto">
                {nodes.filter((n) => {
                  const q = nodeSearchQuery.toLowerCase();
                  return (n.data.step.name || "").toLowerCase().includes(q) || n.data.step.type.includes(q);
                }).map((n) => {
                  const meta = getMeta(n.data.step.type);
                  const Icon = meta?.icon;
                  return (
                    <button
                      key={n.id}
                      onClick={() => { setSelectedId(n.id); setShowNodeSearch(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--canvas-subtle)] transition"
                    >
                      {Icon && <Icon className="w-3.5 h-3.5 text-[var(--ink-muted)]" strokeWidth={1.5} />}
                      <span className="text-xs text-[var(--ink)]">{n.data.step.name || meta?.label || n.data.step.type}</span>
                      <span className="text-[10px] text-[var(--ink-subtle)] mono ml-auto">{n.id}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Import/Export modal */}
      {showImportExport && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={() => setShowImportExport(null)}>
          <div className="bg-[var(--canvas)] rounded-lg shadow-xl border border-[var(--rule)] w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-[var(--rule)] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--ink)]">
                {showImportExport === "export" ? "Export workflow" : "Import workflow"}
              </h3>
              <button onClick={() => setShowImportExport(null)} className="p-1 text-[var(--ink-muted)] hover:text-[var(--ink)]">
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>
            <div className="px-6 py-4">
              {showImportExport === "export" ? (
                <>
                  <pre className="mono text-[10px] text-[var(--ink)] bg-[var(--canvas-subtle)] border border-[var(--rule)] rounded-[4px] p-3 whitespace-pre-wrap break-words max-h-64 overflow-auto mb-4">
                    {JSON.stringify({ name, description, enabled, graph: flowToGraph(nodes, edges, nodeColors, nodeNotes) }, null, 2)}
                  </pre>
                  <button
                    onClick={exportWorkflow}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-[6px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-medium hover:opacity-90"
                  >
                    <Download className="w-4 h-4" strokeWidth={1.5} />
                    Download JSON
                  </button>
                </>
              ) : (
                <>
                  <textarea
                    value={importJson}
                    onChange={(e) => setImportJson(e.target.value)}
                    placeholder="Paste workflow JSON here..."
                    rows={10}
                    spellCheck={false}
                    className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-3 py-2 text-[11px] text-[var(--ink)] mono focus:outline-none focus:border-[var(--rule-strong)] resize-y mb-4"
                  />
                  <button
                    onClick={importWorkflow}
                    disabled={!importJson.trim()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-[6px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    <Upload className="w-4 h-4" strokeWidth={1.5} />
                    Import
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Version history modal */}
      {versionsOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={() => setVersionsOpen(false)}>
          <div className="bg-[var(--canvas)] rounded-lg shadow-xl border border-[var(--rule)] w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-[var(--rule)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-[var(--ink)]" strokeWidth={1.5} />
                <h3 className="text-sm font-semibold text-[var(--ink)]">Version history</h3>
              </div>
              <button onClick={() => setVersionsOpen(false)} className="p-1 text-[var(--ink-muted)] hover:text-[var(--ink)]">
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {versionsLoading ? (
                <div className="p-8 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-[var(--ink-muted)]" strokeWidth={1.5} />
                </div>
              ) : !versions || versions.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-xs text-[var(--ink-muted)]">No versions yet. Versions are created each time you save.</p>
                </div>
              ) : (
                <div className="divide-y divide-[var(--rule)]">
                  {versions.map((v) => (
                    <div key={v.id} className="px-6 py-3 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-medium text-[var(--ink)]">
                          v{v.version} -- {v.name}
                        </div>
                        <div className="text-[10px] text-[var(--ink-subtle)] mt-0.5">
                          {new Date(v.created_at).toLocaleString(undefined, {
                            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                          })}
                        </div>
                      </div>
                      <button
                        onClick={() => { if (confirm(`Restore version ${v.version}? Current unsaved changes will be lost.`)) restoreVersion(v.id); }}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-[4px] border border-[var(--rule)] text-[11px] font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition"
                      >
                        <RotateCw className="w-3 h-3" strokeWidth={1.5} />
                        Restore
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Credentials modal */}
      {secretsOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={() => setSecretsOpen(false)}>
          <div className="bg-[var(--canvas)] rounded-lg shadow-xl border border-[var(--rule)] w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-[var(--rule)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-[var(--ink)]" strokeWidth={1.5} />
                <h3 className="text-sm font-semibold text-[var(--ink)]">Credentials</h3>
              </div>
              <button onClick={() => setSecretsOpen(false)} className="p-1 text-[var(--ink-muted)] hover:text-[var(--ink)]">
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>
            <div className="px-6 py-4">
              <p className="text-[10px] text-[var(--ink-muted)] mb-4">
                Secrets are available in expressions as {`{{secrets.your_key}}`}. Values are encrypted and never shown in run logs.
              </p>
              {/* Add new */}
              <div className="flex items-end gap-2 mb-4">
                <div className="flex-1">
                  <div className="text-[10px] text-[var(--ink-subtle)] mb-1">Key</div>
                  <input
                    value={newSecretKey}
                    onChange={(e) => setNewSecretKey(e.target.value)}
                    placeholder="api_key"
                    className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-2.5 py-1.5 text-xs text-[var(--ink)] mono focus:outline-none focus:border-[var(--rule-strong)]"
                  />
                </div>
                <div className="flex-1">
                  <div className="text-[10px] text-[var(--ink-subtle)] mb-1">Value</div>
                  <input
                    type="password"
                    value={newSecretValue}
                    onChange={(e) => setNewSecretValue(e.target.value)}
                    placeholder="sk-..."
                    className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-2.5 py-1.5 text-xs text-[var(--ink)] mono focus:outline-none focus:border-[var(--rule-strong)]"
                  />
                </div>
                <button
                  onClick={saveSecret}
                  disabled={!newSecretKey.trim() || !newSecretValue}
                  className="px-3 py-1.5 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-xs font-medium hover:opacity-90 disabled:opacity-30 transition shrink-0"
                >
                  Save
                </button>
              </div>
              {/* List */}
              {secretsLoading ? (
                <div className="py-4 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-[var(--ink-muted)]" strokeWidth={1.5} />
                </div>
              ) : !secrets || secrets.length === 0 ? (
                <p className="text-xs text-[var(--ink-subtle)] text-center py-4">No secrets stored yet.</p>
              ) : (
                <div className="border border-[var(--rule)] rounded-[4px] divide-y divide-[var(--rule)]">
                  {secrets.map((s) => (
                    <div key={s.id} className="flex items-center justify-between px-3 py-2.5">
                      <div>
                        <div className="text-xs font-medium text-[var(--ink)] mono">{s.key}</div>
                        <div className="text-[10px] text-[var(--ink-subtle)] mono">{s.preview}</div>
                      </div>
                      <button
                        onClick={() => deleteSecret(s.id)}
                        className="p-1 text-[var(--ink-muted)] hover:text-[var(--danger)] transition"
                      >
                        <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Slide-up animation for toasts */}
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
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
      className="w-full flex items-center gap-3 px-2.5 py-2 rounded-[8px] hover:bg-[var(--canvas-subtle)] text-left transition group"
    >
      <div className={`rounded-[8px] p-2 shrink-0 transition ${accentClasses(meta.accent).iconWrap}`}>
        <Icon className="w-4 h-4" strokeWidth={1.5} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-medium text-[var(--ink)] leading-tight">{meta.label}</div>
        <div className="text-[10px] text-[var(--ink-subtle)] truncate leading-tight mt-0.5">{meta.hint}</div>
      </div>
    </button>
  );
}

function ContextMenuItem({
  icon: Icon, label, shortcut, danger, disabled, onClick,
}: {
  icon: typeof Copy;
  label: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-xs transition disabled:opacity-30 ${
        danger
          ? "text-[var(--danger)] hover:bg-[var(--danger-soft)]"
          : "text-[var(--ink)] hover:bg-[var(--canvas-subtle)]"
      }`}
    >
      <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
      <span className="flex-1">{label}</span>
      {shortcut && (
        <span className="text-[10px] text-[var(--ink-subtle)] mono">{shortcut}</span>
      )}
    </button>
  );
}

interface CommandPaletteAction {
  label: string;
  hint?: string;
  action: () => void;
}

function CommandPalette({
  onClose,
  actions,
}: {
  onClose: () => void;
  actions: CommandPaletteAction[];
}) {
  const [query, setQuery] = useState("");
  const [idx, setIdx] = useState(0);
  const filtered = useMemo(() => {
    if (!query) return actions;
    const q = query.toLowerCase();
    return actions.filter(
      (a) => a.label.toLowerCase().includes(q) || (a.hint ?? "").toLowerCase().includes(q),
    );
  }, [query, actions]);

  useEffect(() => {
    setIdx(0);
  }, [query]);

  return (
    <>
      <div className="flex items-center gap-2 px-4 border-b border-[var(--rule)]">
        <Search className="w-4 h-4 text-[var(--ink-subtle)]" strokeWidth={1.5} />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, filtered.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
            if (e.key === "Enter" && filtered[idx]) { filtered[idx].action(); }
            if (e.key === "Escape") onClose();
          }}
          placeholder="Type a command..."
          className="flex-1 py-3 bg-transparent border-none text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none"
        />
      </div>
      <div className="max-h-[300px] overflow-y-auto py-1">
        {filtered.length === 0 && (
          <div className="px-4 py-3 text-xs text-[var(--ink-muted)]">No matching commands</div>
        )}
        {filtered.map((a, i) => (
          <button
            key={a.label}
            onClick={a.action}
            className={`w-full flex items-center justify-between px-4 py-2 text-left text-xs transition ${
              i === idx ? "bg-[var(--canvas-subtle)]" : "hover:bg-[var(--canvas-subtle)]"
            }`}
          >
            <span className="text-[var(--ink)]">{a.label}</span>
            {a.hint && <span className="text-[10px] text-[var(--ink-subtle)] mono">{a.hint}</span>}
          </button>
        ))}
      </div>
    </>
  );
}

function durationMs(start: string, end: string): number {
  return Math.max(0, new Date(end).getTime() - new Date(start).getTime());
}

// Agent output with verified/flagged claims. CitationRenderer decorates
// each [vN]/[mem:..] chip with its verification status; the banner below
// summarizes and lists anything that didn't check out against source.
function AgentOutputView({ text, trace, report }: { text: string; trace: unknown; report: CitationReport | null }) {
  const flagged = (report?.checks ?? []).filter((c) => c.status !== "valid");
  return (
    <div className="space-y-3">
      <div className="text-sm text-[var(--ink)] leading-relaxed">
        <CitationRenderer content={text} trace={trace} citationReport={report} />
      </div>
      {report && (
        flagged.length === 0 ? (
          <div className="text-[11px] text-[var(--verified)]">
            All {report.counts.total} citation{report.counts.total === 1 ? "" : "s"} verified against source.
          </div>
        ) : (
          <div className="rounded-[4px] border border-[var(--flag)] bg-[var(--flag-soft)] p-2.5 text-[11px]">
            <div className="font-semibold text-[var(--ink)] mb-1">
              {flagged.length} claim{flagged.length === 1 ? "" : "s"} flagged — verify before relying on {flagged.length === 1 ? "it" : "them"}
            </div>
            <ul className="space-y-0.5">
              {flagged.map((c, i) => (
                <li key={i} className="text-[var(--ink-muted)] mono">
                  {c.marker} — {c.detail || c.status}
                </li>
              ))}
            </ul>
          </div>
        )
      )}
    </div>
  );
}

function DataView({ data }: { data: unknown }) {
  const [viewMode, setViewMode] = useState<"table" | "json" | "schema">("json");

  if (data == null) return null;

  const isArray = Array.isArray(data);
  const isObj = typeof data === "object" && !isArray;
  const items = isArray ? data : isObj ? [data] : [{ value: data }];
  const columns = isArray && items.length > 0 && typeof items[0] === "object" && items[0] !== null
    ? Object.keys(items[0] as object)
    : isObj ? Object.keys(data as object) : ["value"];
  const schemaEntries = columns.map((k) => {
    const sample = items[0] && typeof items[0] === "object" ? (items[0] as Record<string, unknown>)[k] : undefined;
    return { key: k, type: sample === null ? "null" : Array.isArray(sample) ? "array" : typeof sample };
  });

  return (
    <div>
      <div className="flex items-center gap-1 mb-2">
        {(["table", "json", "schema"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setViewMode(m)}
            className={`px-2 py-1 text-[10px] rounded-[3px] font-medium transition ${
              viewMode === m
                ? "bg-[var(--canvas-subtle)] text-[var(--ink)] border border-[var(--rule)]"
                : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
            }`}
          >
            {m === "table" ? "Table" : m === "json" ? "JSON" : "Schema"}
          </button>
        ))}
        {isArray && (
          <span className="text-[9px] text-[var(--ink-subtle)] mono ml-auto">{items.length} item{items.length !== 1 ? "s" : ""}</span>
        )}
      </div>

      {viewMode === "json" && (
        <pre className="mono text-[10px] text-[var(--ink)] bg-[var(--canvas-subtle)] border border-[var(--rule)] rounded-[4px] p-2.5 whitespace-pre-wrap break-words max-h-64 overflow-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}

      {viewMode === "table" && (
        <div className="border border-[var(--rule)] rounded-[4px] overflow-auto max-h-64">
          <table className="w-full text-[10px] mono">
            <thead>
              <tr className="bg-[var(--canvas-subtle)]">
                {columns.map((col) => (
                  <th key={col} className="text-left px-2 py-1.5 text-[var(--ink-muted)] font-medium border-b border-[var(--rule)] whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.slice(0, 50).map((item, i) => (
                <tr key={i} className="border-b border-[var(--rule)] last:border-0">
                  {columns.map((col) => {
                    const val = typeof item === "object" && item !== null ? (item as Record<string, unknown>)[col] : item;
                    const display = val === null ? "null"
                      : typeof val === "object" ? JSON.stringify(val).slice(0, 60)
                      : String(val).slice(0, 60);
                    return (
                      <td key={col} className="px-2 py-1.5 text-[var(--ink)] whitespace-nowrap max-w-[200px] truncate">
                        {display}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {items.length > 50 && (
            <div className="px-2 py-1.5 text-[9px] text-[var(--ink-subtle)] text-center border-t border-[var(--rule)]">
              Showing 50 of {items.length}
            </div>
          )}
        </div>
      )}

      {viewMode === "schema" && (
        <div className="border border-[var(--rule)] rounded-[4px] overflow-hidden">
          {schemaEntries.map((e, i) => (
            <div key={e.key} className={`flex items-center justify-between px-3 py-1.5 text-[10px] ${i > 0 ? "border-t border-[var(--rule)]" : ""}`}>
              <span className="mono text-[var(--ink)] font-medium">{e.key}</span>
              <span className="mono text-[var(--ink-subtle)]">{e.type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
