"use client";

// app/dante/workflows/[workflowId]/canvas/DanteNode.tsx
//
// Custom React Flow node for every Dante step type. We keep ONE
// component for all 10 types and branch on `data.step.type` for the
// visual differences — the vast majority of the presentation is
// shared (card chrome, icon chip, name, hint, handles).
//
// Condition nodes get two output handles ("true" / "false"), every
// other node a single default. Triggers get no input handle.

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import type { WorkflowStep } from "@/lib/dante/workflow-types";
import { getMeta, isTriggerType, accentClasses } from "./nodeTypes";

export interface DanteNodeData {
  step: WorkflowStep;
  runStatus?: "success" | "error" | "running" | null;
  [key: string]: unknown; // satisfy @xyflow/react generic index signature
}

export default function DanteNode({ data, selected }: NodeProps) {
  const d = data as DanteNodeData;
  const step = d.step;
  const meta = getMeta(step.type);
  const Icon = meta?.icon;
  const accent = accentClasses(meta?.accent ?? "ink");
  const isTrigger = isTriggerType(step.type);
  const isCondition = step.type === "condition";
  const isSwitch = step.type === "switch";
  const switchCases = isSwitch
    ? ((step.config as Record<string, unknown>).cases as Array<{ value: string; label?: string }>) || []
    : [];

  const summary = nodeSummary(step);

  return (
    <div
      className={`
        group relative bg-[var(--canvas)] border rounded-[6px] transition
        ${selected
          ? `border-[var(--rule-strong)] ring-2 ring-offset-1 ring-offset-[var(--canvas)] ${accent.selectedOutline}`
          : "border-[var(--rule)] hover:border-[var(--rule-strong)]"}
        min-w-[220px] max-w-[260px]
      `}
    >
      {/* Input handle — not on triggers */}
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-2 !h-2 !bg-[var(--ink)] !border-[var(--canvas)] !border-2"
        />
      )}

      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <div className={`border border-[var(--rule)] rounded-[4px] p-1.5 shrink-0 ${accent.iconWrap}`}>
          {Icon && <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-[var(--ink-subtle)] mono">
            {meta?.label ?? step.type}
          </div>
          <div className="text-sm font-semibold text-[var(--ink)] truncate">
            {step.name || meta?.label || step.type}
          </div>
          {summary && (
            <div className="text-[11px] text-[var(--ink-muted)] truncate mt-0.5 mono">
              {summary}
            </div>
          )}
        </div>
        {d.runStatus && (
          <div className="shrink-0">
            {d.runStatus === "success" && <CheckCircle2 className="w-3.5 h-3.5 text-[var(--verified)]" strokeWidth={1.5} />}
            {d.runStatus === "error"   && <AlertCircle  className="w-3.5 h-3.5 text-[var(--danger)]"  strokeWidth={1.5} />}
            {d.runStatus === "running" && <Loader2     className="w-3.5 h-3.5 text-[var(--ink-muted)] animate-spin" strokeWidth={1.5} />}
          </div>
        )}
      </div>

      {/* Output handles */}
      {isCondition ? (
        <>
          <Handle
            id="true"
            type="source"
            position={Position.Bottom}
            style={{ left: "30%" }}
            className="!w-2 !h-2 !bg-[var(--verified)] !border-[var(--canvas)] !border-2"
          />
          <Handle
            id="false"
            type="source"
            position={Position.Bottom}
            style={{ left: "70%" }}
            className="!w-2 !h-2 !bg-[var(--danger)] !border-[var(--canvas)] !border-2"
          />
          <div className="flex justify-between px-3 pb-1.5 text-[9px] uppercase tracking-wider mono">
            <span className="text-[var(--verified)]">true</span>
            <span className="text-[var(--danger)]">false</span>
          </div>
        </>
      ) : isSwitch && switchCases.length > 0 ? (
        <>
          {switchCases.map((c, i) => (
            <Handle
              key={c.value}
              id={c.value}
              type="source"
              position={Position.Bottom}
              style={{ left: `${((i + 1) / (switchCases.length + 2)) * 100}%` }}
              className="!w-2 !h-2 !bg-[var(--accent)] !border-[var(--canvas)] !border-2"
            />
          ))}
          <Handle
            id="__default__"
            type="source"
            position={Position.Bottom}
            style={{ left: `${((switchCases.length + 1) / (switchCases.length + 2)) * 100}%` }}
            className="!w-2 !h-2 !bg-[var(--ink-muted)] !border-[var(--canvas)] !border-2"
          />
          <div className="flex justify-between px-3 pb-1.5 text-[9px] uppercase tracking-wider mono gap-1">
            {switchCases.map((c) => (
              <span key={c.value} className="text-[var(--accent)] truncate">{c.label || c.value}</span>
            ))}
            <span className="text-[var(--ink-muted)]">else</span>
          </div>
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-2 !h-2 !bg-[var(--ink)] !border-[var(--canvas)] !border-2"
        />
      )}
    </div>
  );
}

// ── One-line node summary ────────────────────────────────────
// Shows the most-identifying config field right on the node card so
// you don't have to click every node to see what's configured.

function nodeSummary(step: WorkflowStep): string | null {
  const cfg = step.config as Record<string, unknown>;
  switch (step.type) {
    case "trigger_manual":  return null;
    case "trigger_cron":    return typeof cfg.cron === "string" ? `cron: ${cfg.cron}` : null;
    case "trigger_webhook": return "POST /api/dante/hooks/…";
    case "http": {
      const m = (cfg.method as string) || "GET";
      const u = (cfg.url as string) || "";
      return `${m} ${u}`;
    }
    case "openai":         return (cfg.model as string) || "gpt-4o-mini";
    case "query_clients":  return `contacts · limit ${cfg.limit ?? 25}`;
    case "update_contact": return `id: ${truncate(String(cfg.contact_id ?? ""), 24)}`;
    case "send_email":     return `to: ${truncate(String(cfg.to ?? ""), 28)}`;
    case "condition":        return truncate(String(cfg.expression ?? ""), 32);
    case "delay":            return `${cfg.seconds ?? 0}s`;
    case "query_properties": return `properties · limit ${cfg.limit ?? 25}`;
    case "query_listings":   return `listings · limit ${cfg.limit ?? 25}`;
    case "query_offers":     return `offers · limit ${cfg.limit ?? 25}`;
    case "lease_lookup":     return `leases · ${cfg.status ?? "completed"}`;
    case "web_search":       return truncate(String(cfg.query ?? ""), 32);
    case "archive_lookup":   return truncate(String(cfg.query ?? ""), 32);
    case "send_sms":         return cfg.to_phone ? `to: ${String(cfg.to_phone)}` : (cfg.to_role ? `role: ${String(cfg.to_role)}` : null);
    case "agent":            return truncate(String(cfg.objective ?? ""), 32);
    case "trigger_at":       return cfg.scheduled_for ? String(cfg.scheduled_for).slice(0, 16).replace("T", " ") : null;
    case "integration_query": {
      const p = (cfg.provider as string) || "";
      const m = (cfg.method as string) || "GET";
      return p ? `${p} · ${m}` : null;
    }
    case "due_diligence": {
      const sf = cfg.state_fips as string;
      const cf = cfg.county_fips as string;
      if (sf && cf) return `FIPS: ${sf}-${cf}`;
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
    case "trigger_lease_expiry": return `${cfg.days_before ?? 90}d before`;
    case "trigger_deal_stage": {
      const from = (cfg.from_stage as string) || "any";
      const to = (cfg.to_stage as string) || "any";
      return `${from} -> ${to}`;
    }
    default:                 return null;
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
