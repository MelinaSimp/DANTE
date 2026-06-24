"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  CheckCircle2, AlertCircle, Loader2, Plus, StickyNote, Ban,
} from "lucide-react";
import type { WorkflowStep } from "@/lib/dante/workflow-types";
import { getMeta, isTriggerType } from "./nodeTypes";

export const NODE_COLORS = [
  { value: "", label: "Default" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#8b5cf6", label: "Purple" },
  { value: "#ec4899", label: "Pink" },
  { value: "#f97316", label: "Orange" },
  { value: "#eab308", label: "Yellow" },
  { value: "#22c55e", label: "Green" },
  { value: "#06b6d4", label: "Cyan" },
] as const;

export interface DanteNodeData {
  step: WorkflowStep;
  runStatus?: "success" | "error" | "running" | null;
  runDuration?: number | null;
  runOutput?: unknown;
  runError?: string | null;
  disabled?: boolean;
  color?: string;
  notes?: string;
  itemCount?: number | null;
  onRename?: (id: string, name: string) => void;
  [key: string]: unknown;
}

export default function DanteNode({ data, selected }: NodeProps) {
  const d = data as DanteNodeData;
  const step = d.step;
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(step.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commitRename = useCallback(() => {
    setEditing(false);
    const trimmed = (editName ?? "").trim();
    if (trimmed && trimmed !== step.name && d.onRename) {
      d.onRename(step.id, trimmed);
    } else {
      setEditName(step.name);
    }
  }, [editName, step.name, step.id, d]);

  if (step.type === "sticky_note") {
    return <StickyNoteCard data={d} selected={!!selected} />;
  }

  const meta = getMeta(step.type);
  const Icon = meta?.icon;
  const isTrigger = isTriggerType(step.type);
  const isCondition = step.type === "condition";
  const isSwitch = step.type === "switch";
  const isDisabled = !!d.disabled;
  const nodeColor = d.color || "";
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
  const itemCount = d.itemCount;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`group relative rounded-[10px] transition-shadow duration-150 cursor-pointer ${isDisabled ? "opacity-50 grayscale-[30%]" : ""}`}
      style={{
        background: "var(--neu-card)",
        border: "1px solid rgba(255,255,255,0.30)",
        borderTopColor: "rgba(255,255,255,0.50)",
        width: 260,
        boxShadow:
          d.runStatus === "running"
            ? "var(--neu-shadow-card), 0 0 0 2px var(--accent)"
            : selected
              ? "var(--neu-shadow-card), 0 0 0 2px var(--ink)"
              : hovered
                ? "var(--neu-shadow-card-hover)"
                : "var(--neu-shadow-card)",
      }}
    >
      {/* Color accent bar */}
      {nodeColor && (
        <div
          className="absolute left-0 top-0 bottom-0 w-[4px] rounded-l-[10px]"
          style={{ background: nodeColor }}
        />
      )}

      {/* Target handle */}
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-3 !h-3 !bg-[var(--ink)] !border-2 !border-[var(--canvas)] !-top-[6px] !transition-colors !rounded-full"
        />
      )}

      {/* Disabled overlay icon */}
      {isDisabled && (
        <div className="absolute top-1 right-1 z-10">
          <Ban className="w-3 h-3 text-[var(--ink-subtle)]" strokeWidth={2} />
        </div>
      )}

      <div className="flex items-center gap-3 px-4 py-3.5">
        {/* Icon */}
        <div
          className="relative rounded-[10px] p-2.5 shrink-0 flex items-center justify-center"
          style={{
            background: isTrigger ? "var(--ink)" : "var(--neu-card)",
            color: isTrigger ? "#fff" : "var(--ink)",
            boxShadow: isTrigger ? "0 1px 3px rgba(0,0,0,.25)" : "var(--neu-shadow-raised)",
          }}
        >
          {Icon && <Icon className="w-[22px] h-[22px]" strokeWidth={1.5} />}
          {statusIcon && (
            <div className="absolute -bottom-1 -right-1 bg-[var(--canvas)] rounded-full p-[1px]">
              {statusIcon}
            </div>
          )}
        </div>

        {/* Name + subtitle */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              ref={inputRef}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") { setEditName(step.name); setEditing(false); }
              }}
              className="text-sm font-semibold text-[var(--ink)] bg-[var(--canvas-subtle)] border border-[var(--rule-strong)] rounded-[4px] px-1.5 py-0.5 w-full leading-tight focus:outline-none"
              spellCheck={false}
            />
          ) : (
            <div
              onDoubleClick={() => { setEditName(step.name || displayName); setEditing(true); }}
              className={`text-sm font-semibold leading-tight truncate ${isDisabled ? "text-[var(--ink-muted)] line-through" : "text-[var(--ink)]"}`}
            >
              {displayName}
            </div>
          )}
          {subtitle && (
            <div className="text-[11px] text-[var(--ink-muted)] leading-snug truncate mt-1 mono">
              {subtitle}
            </div>
          )}
        </div>
      </div>

      {/* Execution data strip */}
      {outputPreview && d.runStatus && d.runStatus !== "running" && (
        <div className={`border-t border-[var(--rule)] px-4 py-2 text-[11px] mono truncate flex items-center gap-1.5 ${
          d.runStatus === "error" ? "text-[var(--danger)] bg-[var(--danger-soft)]/30" : "text-[var(--ink-muted)] bg-[var(--canvas-subtle)]/50"
        }`}>
          {itemCount != null && (
            <span className="shrink-0 text-[9px] font-semibold px-1 py-0 rounded-[2px] bg-[var(--canvas)] border border-[var(--rule)]">
              {itemCount}
            </span>
          )}
          {outputPreview}
        </div>
      )}

      {/* Notes indicator */}
      {d.notes && (
        <div className="absolute top-1 right-1 z-10" title={d.notes}>
          <StickyNote className="w-3 h-3 text-[var(--flag)]" strokeWidth={1.5} />
        </div>
      )}

      {/* Error output handle (right side) */}
      {!isTrigger && !isCondition && !isSwitch && (
        <Handle
          id="error"
          type="source"
          position={Position.Right}
          className="!w-2 !h-2 !bg-[var(--danger)] !border-2 !border-[var(--canvas)] !-right-[4px] !rounded-full opacity-40 hover:opacity-100 !transition-opacity"
          title="Error output"
        />
      )}

      {/* Source handles */}
      {isCondition ? (
        <>
          <Handle
            id="true"
            type="source"
            position={Position.Bottom}
            style={{ left: "30%" }}
            className="!w-3 !h-3 !bg-[var(--verified)] !border-2 !border-[var(--canvas)] !-bottom-[6px] !rounded-full"
          />
          <Handle
            id="false"
            type="source"
            position={Position.Bottom}
            style={{ left: "70%" }}
            className="!w-3 !h-3 !bg-[var(--danger)] !border-2 !border-[var(--canvas)] !-bottom-[6px] !rounded-full"
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
              className="!w-3 !h-3 !bg-[var(--accent)] !border-2 !border-[var(--canvas)] !-bottom-[6px] !rounded-full"
            />
          ))}
          <Handle
            id="__default__"
            type="source"
            position={Position.Bottom}
            style={{ left: `${((switchCases.length + 1) / (switchCases.length + 2)) * 100}%` }}
            className="!w-3 !h-3 !bg-[var(--ink-muted)] !border-2 !border-[var(--canvas)] !-bottom-[6px] !rounded-full"
          />
        </>
      ) : (
        <div className="relative">
          <Handle
            type="source"
            position={Position.Bottom}
            className="!w-3 !h-3 !bg-[var(--ink)] !border-2 !border-[var(--canvas)] !-bottom-[6px] !transition-colors !rounded-full"
          />
          {hovered && (
            <div
              className="absolute left-1/2 -translate-x-1/2 -bottom-[24px] z-10 pointer-events-none"
            >
              <div className="w-[22px] h-[22px] rounded-full bg-[var(--ink)] flex items-center justify-center shadow-md">
                <Plus className="w-3 h-3 text-[var(--canvas)]" strokeWidth={2.5} />
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
        rounded-[10px] min-w-[200px] max-w-[280px] shadow
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

export function getItemCount(output: unknown): number | null {
  if (output == null) return null;
  if (Array.isArray(output)) return output.length;
  if (typeof output === "object") {
    const o = output as Record<string, unknown>;
    if (typeof o.count === "number") return o.count;
    if (Array.isArray(o.contacts)) return o.contacts.length;
    if (Array.isArray(o.properties)) return o.properties.length;
    if (Array.isArray(o.listings)) return o.listings.length;
    if (Array.isArray(o.offers)) return o.offers.length;
    if (Array.isArray(o.hits)) return o.hits.length;
    if (Array.isArray(o.results)) return o.results.length;
    if (Array.isArray(o.abstracts)) return o.abstracts.length;
    return 1;
  }
  return 1;
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
    case "lease_lookup":     return String(cfg.status ?? "completed");
    case "web_search":       return truncate(String(cfg.query ?? ""), 28);
    case "archive_lookup":   return truncate(String(cfg.query ?? ""), 28);
    case "send_sms":         return cfg.to_phone ? `to: ${String(cfg.to_phone)}` : (cfg.to_role ? `role: ${String(cfg.to_role)}` : null);
    case "agent":            return truncate(String(cfg.objective ?? ""), 28);
    case "trigger_at":       return cfg.scheduled_for ? String(cfg.scheduled_for).slice(0, 16).replace("T", " ") : null;
    case "integration_query": return (cfg.provider as string) || null;
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
