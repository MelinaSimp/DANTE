"use client";

// app/dante/workflows/[workflowId]/canvas/DanteNode.tsx
//
// Custom React Flow node for Dante workflow steps. Each card is
// designed to communicate what a step DOES and what DATA it
// touches — making the canvas read like infrastructure, not a toy.
//
// Visual tiers:
//   Triggers:  top accent bar (verified green), pulse dot
//   AI/LLM:   accent bar (blue), sparkle badge
//   Data:      subtle bar (ink), database icon
//   Actions:   flag bar (amber) for flow control, ink for I/O

import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  CheckCircle2, AlertCircle, Loader2,
  Database, Sparkles, Zap, ArrowDownToLine,
} from "lucide-react";
import type { WorkflowStep } from "@/lib/dante/workflow-types";
import { getMeta, isTriggerType, accentClasses } from "./nodeTypes";

export interface DanteNodeData {
  step: WorkflowStep;
  runStatus?: "success" | "error" | "running" | null;
  runDuration?: number | null;
  runOutput?: unknown;
  runError?: string | null;
  disabled?: boolean;
  [key: string]: unknown;
}

// Which node types are AI-powered
const AI_TYPES = new Set(["openai", "agent", "archive_lookup", "due_diligence", "web_search"]);
// Which node types are data lookups
const DATA_TYPES = new Set([
  "query_clients", "query_properties", "query_listings", "query_offers",
  "lease_lookup", "integration_query",
]);

export default function DanteNode({ data, selected }: NodeProps) {
  const d = data as DanteNodeData;
  const step = d.step;

  if (step.type === "sticky_note") {
    return <StickyNoteCard data={d} selected={!!selected} />;
  }

  const meta = getMeta(step.type);
  const Icon = meta?.icon;
  const accent = accentClasses(meta?.accent ?? "ink");
  const isTrigger = isTriggerType(step.type);
  const isCondition = step.type === "condition";
  const isSwitch = step.type === "switch";
  const isAI = AI_TYPES.has(step.type);
  const isData = DATA_TYPES.has(step.type);
  const isDisabled = !!d.disabled;
  const switchCases = isSwitch
    ? ((step.config as Record<string, unknown>).cases as Array<{ value: string; label?: string }>) || []
    : [];

  const summary = nodeSummary(step);
  const typeLabel = meta?.label ?? step.type;

  const barColor = isTrigger
    ? "bg-[var(--verified)]"
    : isAI
      ? "bg-[var(--accent)]"
      : meta?.accent === "flag"
        ? "bg-[var(--flag)]"
        : "bg-[var(--ink)]";

  const runOutputPreview = formatOutputPreview(d.runOutput, d.runError);

  return (
    <div
      className={`
        group relative rounded-[8px] transition-all duration-150
        ${d.runStatus === "running" ? "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--canvas)] shadow-lg animate-pulse" : ""}
        ${!d.runStatus || d.runStatus !== "running"
          ? selected
            ? `ring-2 ring-offset-2 ring-offset-[var(--canvas)] ${accent.selectedOutline} shadow-lg`
            : "shadow-sm hover:shadow-md"
          : ""}
        ${isDisabled ? "opacity-40" : ""}
        min-w-[260px] max-w-[300px]
        overflow-hidden
      `}
      style={{
        background: "var(--canvas)",
        border: "1px solid var(--rule)",
      }}
    >
      <div className={`h-[3px] w-full ${barColor}`} />

      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-2.5 !h-2.5 !bg-[var(--ink)] !border-[var(--canvas)] !border-2 !-top-[5px]"
        />
      )}

      <div className="px-4 pt-3 pb-3">
        <div className="flex items-center gap-2.5 mb-2">
          <div className={`rounded-[6px] p-2 shrink-0 ${accent.iconWrap}`}>
            {Icon && <Icon className="w-4 h-4" strokeWidth={1.5} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.06em] text-[var(--ink-subtle)] font-medium">
                {typeLabel}
              </span>
              {isTrigger && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--verified)] opacity-40" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--verified)]" />
                </span>
              )}
              {isAI && (
                <Sparkles className="w-3 h-3 text-[var(--accent)]" strokeWidth={2} />
              )}
              {isData && (
                <Database className="w-3 h-3 text-[var(--ink-subtle)]" strokeWidth={1.5} />
              )}
            </div>
          </div>

          {d.runStatus && (
            <div className={`shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] text-[10px] font-medium ${
              d.runStatus === "success"
                ? "bg-[var(--verified-soft)] text-[var(--verified)]"
                : d.runStatus === "error"
                  ? "bg-[var(--danger-soft)] text-[var(--danger)]"
                  : "bg-[var(--canvas-subtle)] text-[var(--ink-muted)]"
            }`}>
              {d.runStatus === "success" && <CheckCircle2 className="w-3 h-3" strokeWidth={2} />}
              {d.runStatus === "error"   && <AlertCircle  className="w-3 h-3" strokeWidth={2} />}
              {d.runStatus === "running" && <Loader2     className="w-3 h-3 animate-spin" strokeWidth={2} />}
              {d.runDuration != null && d.runStatus !== "running" && (
                <span className="ml-0.5">
                  {d.runDuration < 1000 ? `${d.runDuration}ms` : `${(d.runDuration / 1000).toFixed(1)}s`}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="text-[13px] font-semibold text-[var(--ink)] leading-tight mb-1 truncate">
          {step.name || typeLabel}
        </div>

        {summary && (
          <div className="text-[11px] text-[var(--ink-muted)] leading-snug truncate font-mono">
            {summary}
          </div>
        )}

        {(isAI || isData) && (
          <div className="mt-2.5 pt-2 border-t border-[var(--rule)] flex items-center gap-1.5">
            {isAI ? (
              <>
                <Zap className="w-3 h-3 text-[var(--accent)]" strokeWidth={1.5} />
                <span className="text-[10px] text-[var(--ink-subtle)]">
                  {step.type === "openai" ? (step.config as any)?.model || "LLM" : "AI-powered"}
                </span>
              </>
            ) : (
              <>
                <ArrowDownToLine className="w-3 h-3 text-[var(--ink-subtle)]" strokeWidth={1.5} />
                <span className="text-[10px] text-[var(--ink-subtle)]">
                  {step.type === "lease_lookup" ? "Lease abstractions" :
                   step.type === "query_clients" ? "Contact records" :
                   step.type === "query_properties" ? "Property records" :
                   step.type === "query_listings" ? "Active listings" :
                   step.type === "query_offers" ? "Offer records" :
                   "Data source"}
                </span>
              </>
            )}
          </div>
        )}

        {/* In-canvas run data preview */}
        {runOutputPreview && d.runStatus && d.runStatus !== "running" && (
          <div className={`mt-2 pt-2 border-t border-[var(--rule)] text-[10px] font-mono leading-snug truncate ${
            d.runStatus === "error" ? "text-[var(--danger)]" : "text-[var(--ink-muted)]"
          }`}>
            {runOutputPreview}
          </div>
        )}
      </div>

      {isCondition ? (
        <>
          <div className="flex justify-between px-4 pb-2 text-[9px] uppercase tracking-wider font-mono font-medium">
            <span className="text-[var(--verified)]">true</span>
            <span className="text-[var(--danger)]">false</span>
          </div>
          <Handle
            id="true"
            type="source"
            position={Position.Bottom}
            style={{ left: "30%" }}
            className="!w-2.5 !h-2.5 !bg-[var(--verified)] !border-[var(--canvas)] !border-2 !-bottom-[5px]"
          />
          <Handle
            id="false"
            type="source"
            position={Position.Bottom}
            style={{ left: "70%" }}
            className="!w-2.5 !h-2.5 !bg-[var(--danger)] !border-[var(--canvas)] !border-2 !-bottom-[5px]"
          />
        </>
      ) : isSwitch && switchCases.length > 0 ? (
        <>
          <div className="flex justify-between px-4 pb-2 text-[9px] uppercase tracking-wider font-mono gap-1">
            {switchCases.map((c) => (
              <span key={c.value} className="text-[var(--accent)] truncate">{c.label || c.value}</span>
            ))}
            <span className="text-[var(--ink-muted)]">else</span>
          </div>
          {switchCases.map((c, i) => (
            <Handle
              key={c.value}
              id={c.value}
              type="source"
              position={Position.Bottom}
              style={{ left: `${((i + 1) / (switchCases.length + 2)) * 100}%` }}
              className="!w-2.5 !h-2.5 !bg-[var(--accent)] !border-[var(--canvas)] !border-2 !-bottom-[5px]"
            />
          ))}
          <Handle
            id="__default__"
            type="source"
            position={Position.Bottom}
            style={{ left: `${((switchCases.length + 1) / (switchCases.length + 2)) * 100}%` }}
            className="!w-2.5 !h-2.5 !bg-[var(--ink-muted)] !border-[var(--canvas)] !border-2 !-bottom-[5px]"
          />
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-2.5 !h-2.5 !bg-[var(--ink)] !border-[var(--canvas)] !border-2 !-bottom-[5px]"
        />
      )}
    </div>
  );
}

function StickyNoteCard({ data, selected }: { data: DanteNodeData; selected: boolean }) {
  const content = (data.step.config as { content?: string })?.content || "";
  return (
    <div
      className={`
        rounded-[6px] min-w-[200px] max-w-[280px] shadow-sm
        ${selected ? "ring-2 ring-offset-2 ring-offset-[var(--canvas)] ring-[var(--flag)] shadow-md" : ""}
      `}
      style={{
        background: "var(--flag-soft)",
        border: "1px solid var(--flag)",
      }}
    >
      <div className="px-4 py-3">
        <div className="text-[10px] uppercase tracking-[0.06em] text-[var(--flag)] font-medium mb-1.5">
          Note
        </div>
        <div className="text-[12px] text-[var(--ink)] leading-relaxed whitespace-pre-wrap">
          {content || "Click to add a note..."}
        </div>
      </div>
    </div>
  );
}

function formatOutputPreview(output: unknown, error?: string | null): string | null {
  if (error) return error.slice(0, 80);
  if (output == null) return null;
  if (typeof output === "string") return output.slice(0, 80);
  if (typeof output === "object") {
    const o = output as Record<string, unknown>;
    if (o.text && typeof o.text === "string") return o.text.slice(0, 80);
    if (o.count != null) return `${o.count} result${o.count === 1 ? "" : "s"}`;
    if (o.simulated) return "simulated";
    if (o.email_id) return `sent: ${o.email_id}`;
    if (o.delivery_channel) return `${o.delivery_channel}`;
    if (o.passed != null) return o.passed ? "true" : "false";
    if (o.waited_seconds != null) return `waited ${o.waited_seconds}s`;
    if (o.url) return String(o.url).slice(0, 80);
    const json = JSON.stringify(o);
    return json.length > 80 ? json.slice(0, 77) + "..." : json;
  }
  return String(output).slice(0, 80);
}

// ── One-line node summary ────────────────────────────────────
// Shows the most-identifying config field right on the node card.

function nodeSummary(step: WorkflowStep): string | null {
  const cfg = step.config as Record<string, unknown>;
  switch (step.type) {
    case "trigger_manual":  return null;
    case "trigger_cron":    return typeof cfg.cron === "string" ? cfg.cron : null;
    case "trigger_webhook": return "POST /api/dante/hooks/...";
    case "http": {
      const m = (cfg.method as string) || "GET";
      const u = (cfg.url as string) || "";
      return `${m} ${u}`;
    }
    case "openai":         return (cfg.model as string) || "claude-sonnet-4-6";
    case "query_clients":  return `limit ${cfg.limit ?? 25}`;
    case "update_contact": return `id: ${truncate(String(cfg.contact_id ?? ""), 24)}`;
    case "send_email":     return `to: ${truncate(String(cfg.to ?? ""), 28)}`;
    case "condition":        return truncate(String(cfg.expression ?? ""), 32);
    case "delay":            return `${cfg.seconds ?? 0}s pause`;
    case "query_properties": return `limit ${cfg.limit ?? 25}`;
    case "query_listings":   return `limit ${cfg.limit ?? 25}`;
    case "query_offers":     return `limit ${cfg.limit ?? 25}`;
    case "lease_lookup":     return String(cfg.status ?? "completed");
    case "web_search":       return truncate(String(cfg.query ?? ""), 32);
    case "archive_lookup":   return truncate(String(cfg.query ?? ""), 32);
    case "send_sms":         return cfg.to_phone ? `to: ${String(cfg.to_phone)}` : (cfg.to_role ? `role: ${String(cfg.to_role)}` : null);
    case "agent":            return truncate(String(cfg.objective ?? ""), 32);
    case "trigger_at":       return cfg.scheduled_for ? String(cfg.scheduled_for).slice(0, 16).replace("T", " ") : null;
    case "integration_query": {
      const p = (cfg.provider as string) || "";
      const m = (cfg.method as string) || "GET";
      return p ? `${p} / ${m}` : null;
    }
    case "due_diligence": {
      const addr = cfg.address as string;
      if (addr) return truncate(addr, 32);
      const sf = cfg.state_fips as string;
      const cf = cfg.county_fips as string;
      if (sf && cf) return `FIPS ${sf}-${cf}`;
      const lat = cfg.latitude as number;
      const lng = cfg.longitude as number;
      return lat && lng ? `${lat.toFixed(2)}, ${lng.toFixed(2)}` : null;
    }
    case "generate_document": return truncate(String(cfg.title ?? ""), 28);
    case "for_each": {
      const at = (cfg.action_type as string) || "";
      return at ? `${at} x array` : null;
    }
    case "transform": {
      const ops = cfg.operations as Array<{ action: string; field: string }>;
      return Array.isArray(ops) ? `${ops.length} op${ops.length !== 1 ? "s" : ""}` : null;
    }
    case "switch":             return truncate(String(cfg.expression ?? ""), 28);
    case "sub_workflow":       return cfg.workflow_id ? `wf: ${truncate(String(cfg.workflow_id), 20)}` : null;
    case "approval":           return truncate(String(cfg.message ?? ""), 28);
    case "trigger_lease_expiry": return `${cfg.days_before ?? 90}d before expiry`;
    case "trigger_deal_stage": {
      const from = (cfg.from_stage as string) || "any";
      const to = (cfg.to_stage as string) || "any";
      return `${from} -> ${to}`;
    }
    case "code":             return truncate(String(cfg.code ?? ""), 32);
    case "sticky_note":      return null;
    default:                 return null;
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "..." : s;
}
