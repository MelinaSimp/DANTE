"use client";

import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  CheckCircle2, AlertCircle, Loader2, Plus,
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

export default function DanteNode({ data, selected }: NodeProps) {
  const d = data as DanteNodeData;
  const step = d.step;
  const [hovered, setHovered] = useState(false);

  if (step.type === "sticky_note") {
    return <StickyNoteCard data={d} selected={!!selected} />;
  }

  const meta = getMeta(step.type);
  const Icon = meta?.icon;
  const accent = accentClasses(meta?.accent ?? "ink");
  const isTrigger = isTriggerType(step.type);
  const isCondition = step.type === "condition";
  const isSwitch = step.type === "switch";
  const isDisabled = !!d.disabled;
  const switchCases = isSwitch
    ? ((step.config as Record<string, unknown>).cases as Array<{ value: string; label?: string }>) || []
    : [];

  const displayName = step.name || meta?.label || step.type;
  const subtitle = nodeSummary(step);

  const statusIcon = d.runStatus === "success"
    ? <CheckCircle2 className="w-3.5 h-3.5 text-[var(--verified)]" strokeWidth={2} />
    : d.runStatus === "error"
      ? <AlertCircle className="w-3.5 h-3.5 text-[var(--danger)]" strokeWidth={2} />
      : d.runStatus === "running"
        ? <Loader2 className="w-3.5 h-3.5 text-[var(--accent)] animate-spin" strokeWidth={2} />
        : null;

  const outputPreview = formatOutputPreview(d.runOutput, d.runError);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`
        group relative rounded-[8px] transition-all duration-100 cursor-pointer
        ${d.runStatus === "running" ? "ring-2 ring-[var(--accent)] shadow-md" : ""}
        ${d.runStatus !== "running" && selected
          ? `ring-2 ring-offset-1 ring-offset-[var(--canvas)] ${accent.selectedOutline} shadow-md`
          : d.runStatus !== "running" ? "shadow-sm hover:shadow-md" : ""}
        ${isDisabled ? "opacity-40" : ""}
      `}
      style={{
        background: "var(--canvas)",
        border: "1px solid var(--rule)",
        minWidth: 180,
        maxWidth: 260,
      }}
    >
      {/* Target handle */}
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-2.5 !h-2.5 !bg-[var(--rule-strong)] !border-2 !border-[var(--canvas)] !-top-[5px] hover:!bg-[var(--ink)] !transition-colors !rounded-full"
        />
      )}

      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Icon */}
        <div className={`relative rounded-lg p-2 shrink-0 ${accent.iconWrap}`}>
          {Icon && <Icon className="w-5 h-5" strokeWidth={1.5} />}
          {/* Status overlay on icon */}
          {statusIcon && (
            <div className="absolute -bottom-1 -right-1 bg-[var(--canvas)] rounded-full p-[1px]">
              {statusIcon}
            </div>
          )}
        </div>

        {/* Name + subtitle */}
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-[var(--ink)] leading-tight truncate">
            {displayName}
          </div>
          {subtitle && (
            <div className="text-[10px] text-[var(--ink-muted)] leading-snug truncate mt-0.5 mono">
              {subtitle}
            </div>
          )}
        </div>
      </div>

      {/* Execution data strip */}
      {outputPreview && d.runStatus && d.runStatus !== "running" && (
        <div className={`border-t border-[var(--rule)] px-3 py-1.5 text-[10px] mono truncate ${
          d.runStatus === "error" ? "text-[var(--danger)] bg-[var(--danger-soft)]/30" : "text-[var(--ink-muted)] bg-[var(--canvas-subtle)]/50"
        }`}>
          {outputPreview}
        </div>
      )}

      {/* Source handles */}
      {isCondition ? (
        <>
          <Handle
            id="true"
            type="source"
            position={Position.Bottom}
            style={{ left: "30%" }}
            className="!w-2.5 !h-2.5 !bg-[var(--verified)] !border-2 !border-[var(--canvas)] !-bottom-[5px] !rounded-full"
          />
          <Handle
            id="false"
            type="source"
            position={Position.Bottom}
            style={{ left: "70%" }}
            className="!w-2.5 !h-2.5 !bg-[var(--danger)] !border-2 !border-[var(--canvas)] !-bottom-[5px] !rounded-full"
          />
          <div className="flex justify-between px-3 pb-1 text-[8px] uppercase tracking-wider font-mono font-semibold">
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
              className="!w-2.5 !h-2.5 !bg-[var(--accent)] !border-2 !border-[var(--canvas)] !-bottom-[5px] !rounded-full"
            />
          ))}
          <Handle
            id="__default__"
            type="source"
            position={Position.Bottom}
            style={{ left: `${((switchCases.length + 1) / (switchCases.length + 2)) * 100}%` }}
            className="!w-2.5 !h-2.5 !bg-[var(--ink-muted)] !border-2 !border-[var(--canvas)] !-bottom-[5px] !rounded-full"
          />
        </>
      ) : (
        <div className="relative">
          <Handle
            type="source"
            position={Position.Bottom}
            className="!w-2.5 !h-2.5 !bg-[var(--rule-strong)] !border-2 !border-[var(--canvas)] !-bottom-[5px] hover:!bg-[var(--ink)] !transition-colors !rounded-full"
          />
          {hovered && (
            <div
              className="absolute left-1/2 -translate-x-1/2 -bottom-[22px] z-10 pointer-events-none"
            >
              <div className="w-[18px] h-[18px] rounded-full bg-[var(--ink)] flex items-center justify-center shadow-sm">
                <Plus className="w-2.5 h-2.5 text-[var(--canvas)]" strokeWidth={2.5} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StickyNoteCard({ data, selected }: { data: DanteNodeData; selected: boolean }) {
  const content = (data.step.config as { content?: string })?.content || "";
  return (
    <div
      className={`
        rounded-md min-w-[180px] max-w-[260px] shadow-sm
        ${selected ? "ring-2 ring-offset-1 ring-offset-[var(--canvas)] ring-[var(--flag)] shadow-md" : ""}
      `}
      style={{
        background: "var(--flag-soft)",
        border: "1px solid var(--flag)",
      }}
    >
      <div className="px-3 py-2.5">
        <div className="text-[10px] uppercase tracking-[0.06em] text-[var(--flag)] font-semibold mb-1">
          Note
        </div>
        <div className="text-[11px] text-[var(--ink)] leading-relaxed whitespace-pre-wrap">
          {content || "Click to add a note..."}
        </div>
      </div>
    </div>
  );
}

function formatOutputPreview(output: unknown, error?: string | null): string | null {
  if (error) return error.slice(0, 60);
  if (output == null) return null;
  if (typeof output === "string") return output.slice(0, 60);
  if (typeof output === "object") {
    const o = output as Record<string, unknown>;
    if (o.text && typeof o.text === "string") return o.text.slice(0, 60);
    if (o.count != null) return `${o.count} item${o.count === 1 ? "" : "s"}`;
    if (o.simulated) return "simulated";
    if (o.email_id) return `sent: ${o.email_id}`;
    if (o.delivery_channel) return `${o.delivery_channel}`;
    if (o.passed != null) return o.passed ? "true" : "false";
    if (o.waited_seconds != null) return `waited ${o.waited_seconds}s`;
    if (o.url) return String(o.url).slice(0, 60);
    if (Array.isArray(o)) return `${o.length} item${o.length !== 1 ? "s" : ""}`;
    const keys = Object.keys(o);
    if (keys.length <= 3) return keys.join(", ");
    return `${keys.length} fields`;
  }
  return String(output).slice(0, 60);
}

function nodeSummary(step: WorkflowStep): string | null {
  const cfg = step.config as Record<string, unknown>;
  switch (step.type) {
    case "trigger_manual":  return null;
    case "trigger_cron":    return typeof cfg.cron === "string" ? cfg.cron : null;
    case "trigger_webhook": return "POST incoming";
    case "http": {
      const m = (cfg.method as string) || "GET";
      const u = (cfg.url as string) || "";
      return `${m} ${u}`.slice(0, 40);
    }
    case "openai":           return (cfg.model as string) || "LLM";
    case "query_clients":    return `limit ${cfg.limit ?? 25}`;
    case "update_contact":   return `patch contact`;
    case "send_email":       return `to: ${truncate(String(cfg.to ?? ""), 24)}`;
    case "condition":        return truncate(String(cfg.expression ?? ""), 28);
    case "delay":            return `${cfg.seconds ?? 0}s pause`;
    case "query_properties": return `limit ${cfg.limit ?? 25}`;
    case "query_listings":   return `limit ${cfg.limit ?? 25}`;
    case "query_offers":     return `limit ${cfg.limit ?? 25}`;
    case "lease_lookup":     return String(cfg.status ?? "completed");
    case "web_search":       return truncate(String(cfg.query ?? ""), 28);
    case "archive_lookup":   return truncate(String(cfg.query ?? ""), 28);
    case "send_sms":         return cfg.to_phone ? `to: ${String(cfg.to_phone)}` : (cfg.to_role ? `role: ${String(cfg.to_role)}` : null);
    case "agent":            return truncate(String(cfg.objective ?? ""), 28);
    case "trigger_at":       return cfg.scheduled_for ? String(cfg.scheduled_for).slice(0, 16).replace("T", " ") : null;
    case "integration_query": return (cfg.provider as string) || null;
    case "due_diligence":    return (cfg.address as string)?.slice(0, 28) || null;
    case "generate_document": return truncate(String(cfg.title ?? ""), 24);
    case "for_each":         return (cfg.action_type as string) || null;
    case "transform":        return `${((cfg.operations as unknown[]) || []).length} ops`;
    case "switch":           return truncate(String(cfg.expression ?? ""), 24);
    case "sub_workflow":     return cfg.workflow_id ? "sub-workflow" : null;
    case "approval":         return truncate(String(cfg.message ?? ""), 24);
    case "trigger_lease_expiry": return `${cfg.days_before ?? 90}d`;
    case "trigger_deal_stage": return `${(cfg.from_stage as string) || "any"} -> ${(cfg.to_stage as string) || "any"}`;
    case "code":             return "JavaScript";
    case "sticky_note":      return null;
    default:                 return null;
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "..." : s;
}
