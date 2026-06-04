"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  CheckCircle2, AlertCircle, Loader2, Plus, StickyNote, Ban,
} from "lucide-react";
import type { WorkflowStep } from "@/lib/dante/workflow-types";
import { getMeta, isTriggerType, categoryColor } from "./nodeTypes";

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
  const catColor = categoryColor(meta?.category ?? "data");
  const headerBg = nodeColor || catColor.bg;
  const headerFg = nodeColor ? "#fff" : catColor.fg;

  const switchCases = isSwitch
    ? ((step.config as Record<string, unknown>).cases as Array<{ value: string; label?: string }>) || []
    : [];

  const displayName = step.name || meta?.label || step.type;
  const subtitle = nodeSummary(step);
  const typeLabel = meta?.label || step.type;

  const statusIcon = d.runStatus === "success"
    ? <CheckCircle2 className="w-3.5 h-3.5 text-[var(--verified)]" strokeWidth={2.5} />
    : d.runStatus === "error"
      ? <AlertCircle className="w-3.5 h-3.5 text-[var(--danger)]" strokeWidth={2.5} />
      : d.runStatus === "running"
        ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" strokeWidth={2.5} />
        : null;

  const outputPreview = formatOutputPreview(d.runOutput, d.runError);
  const itemCount = d.itemCount;

  // Running state uses the accent color
  const isRunning = d.runStatus === "running";

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`
        group relative transition-all duration-150 cursor-pointer overflow-hidden
        ${isRunning ? "ring-2 ring-[var(--accent)] dante-node-pulse" : ""}
        ${!isRunning && selected
          ? "ring-2 ring-offset-2 ring-offset-[var(--canvas)] shadow-xl"
          : !isRunning ? "hover:shadow-xl" : ""}
        ${isDisabled ? "opacity-50 grayscale-[40%]" : ""}
      `}
      style={{
        width: 280,
        borderRadius: 12,
        background: "var(--neu-card)",
        boxShadow: isRunning
          ? undefined
          : selected
            ? "var(--neu-shadow-card-hover)"
            : "var(--neu-shadow-card)",
        border: `1px solid ${selected ? headerBg : "var(--rule)"}`,
        ...(selected ? { ringColor: headerBg } : {}),
      }}
    >
      {/* ── Colored header band ── */}
      <div
        className="flex items-center gap-3 px-4"
        style={{
          background: headerBg,
          color: headerFg,
          height: 44,
          borderRadius: "11px 11px 0 0",
        }}
      >
        {/* Icon in a frosted circle */}
        <div
          className="shrink-0 flex items-center justify-center"
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: "rgba(255,255,255,0.2)",
          }}
        >
          {Icon && <Icon className="w-[18px] h-[18px]" strokeWidth={1.8} />}
        </div>

        {/* Type label */}
        <div className="flex-1 min-w-0">
          <div
            className="text-[11px] font-semibold leading-tight truncate"
            style={{ opacity: 0.9 }}
          >
            {typeLabel}
          </div>
        </div>

        {/* Status icon in header */}
        {statusIcon && (
          <div className="shrink-0">
            {statusIcon}
          </div>
        )}

        {/* Disabled icon */}
        {isDisabled && (
          <Ban className="w-3.5 h-3.5 shrink-0" style={{ opacity: 0.6 }} strokeWidth={2} />
        )}
      </div>

      {/* ── Body ── */}
      <div className="px-4 py-3">
        {/* Editable name */}
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
            className="text-[13px] font-semibold text-[var(--ink)] bg-[var(--canvas-subtle)] border border-[var(--rule-strong)] rounded-[4px] px-1.5 py-0.5 w-full leading-tight focus:outline-none"
            spellCheck={false}
          />
        ) : (
          <div
            onDoubleClick={() => { setEditName(step.name || displayName); setEditing(true); }}
            className={`text-[13px] font-semibold leading-tight truncate ${isDisabled ? "text-[var(--ink-muted)] line-through" : "text-[var(--ink)]"}`}
          >
            {displayName}
          </div>
        )}
        {subtitle && (
          <div className="text-[11px] text-[var(--ink-muted)] leading-snug truncate mt-1 mono">
            {subtitle}
          </div>
        )}

        {/* Duration badge */}
        {d.runDuration != null && d.runStatus && d.runStatus !== "running" && (
          <div className="mt-1.5 text-[10px] text-[var(--ink-subtle)] mono">
            {d.runDuration < 1000 ? `${d.runDuration}ms` : `${(d.runDuration / 1000).toFixed(1)}s`}
          </div>
        )}
      </div>

      {/* ── Execution data strip ── */}
      {outputPreview && d.runStatus && d.runStatus !== "running" && (
        <div className={`border-t px-4 py-2 text-[11px] mono truncate flex items-center gap-1.5 ${
          d.runStatus === "error"
            ? "text-[var(--danger)] bg-[var(--danger-soft)] border-[var(--danger-soft)]"
            : "text-[var(--ink-muted)] bg-[var(--canvas-subtle)] border-[var(--rule)]"
        }`}
        style={{ borderBottomLeftRadius: 11, borderBottomRightRadius: 11 }}
        >
          {itemCount != null && (
            <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-[3px] bg-[var(--canvas)] border border-[var(--rule)]"
              style={{ minWidth: 20, textAlign: "center" }}
            >
              {itemCount}
            </span>
          )}
          <span className="truncate">{outputPreview}</span>
        </div>
      )}

      {/* ── Notes indicator ── */}
      {d.notes && (
        <div className="absolute top-[48px] right-2 z-10" title={d.notes}>
          <StickyNote className="w-3 h-3 text-[var(--flag)]" strokeWidth={1.5} />
        </div>
      )}

      {/* ── Target handle (top) ── */}
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-3.5 !h-3.5 !border-[3px] !border-[var(--canvas)] !-top-[7px] !transition-colors !rounded-full"
          style={{ background: headerBg }}
        />
      )}

      {/* ── Error output handle (right side) ── */}
      {!isTrigger && !isCondition && !isSwitch && (
        <Handle
          id="error"
          type="source"
          position={Position.Right}
          className="!w-2.5 !h-2.5 !bg-[var(--danger)] !border-[2px] !border-[var(--canvas)] !-right-[5px] !rounded-full opacity-30 hover:opacity-100 !transition-opacity"
          title="Error output"
        />
      )}

      {/* ── Source handles (bottom) ── */}
      {isCondition ? (
        <>
          <Handle
            id="true"
            type="source"
            position={Position.Bottom}
            style={{ left: "30%", background: "var(--verified)" }}
            className="!w-3.5 !h-3.5 !border-[3px] !border-[var(--canvas)] !-bottom-[7px] !rounded-full"
          />
          <Handle
            id="false"
            type="source"
            position={Position.Bottom}
            style={{ left: "70%", background: "var(--danger)" }}
            className="!w-3.5 !h-3.5 !border-[3px] !border-[var(--canvas)] !-bottom-[7px] !rounded-full"
          />
          <div className="flex justify-between px-4 pb-1 text-[9px] uppercase tracking-wider font-mono font-bold">
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
              style={{ left: `${((i + 1) / (switchCases.length + 2)) * 100}%`, background: headerBg }}
              className="!w-3.5 !h-3.5 !border-[3px] !border-[var(--canvas)] !-bottom-[7px] !rounded-full"
            />
          ))}
          <Handle
            id="__default__"
            type="source"
            position={Position.Bottom}
            style={{ left: `${((switchCases.length + 1) / (switchCases.length + 2)) * 100}%` }}
            className="!w-3.5 !h-3.5 !bg-[var(--ink-muted)] !border-[3px] !border-[var(--canvas)] !-bottom-[7px] !rounded-full"
          />
        </>
      ) : (
        <div className="relative">
          <Handle
            type="source"
            position={Position.Bottom}
            className="!w-3.5 !h-3.5 !border-[3px] !border-[var(--canvas)] !-bottom-[7px] hover:!brightness-110 !transition-all !rounded-full"
            style={{ background: headerBg }}
          />
          {hovered && (
            <div className="absolute left-1/2 -translate-x-1/2 -bottom-[26px] z-10 pointer-events-none">
              <div
                className="w-[24px] h-[24px] rounded-full flex items-center justify-center shadow-lg"
                style={{ background: headerBg }}
              >
                <Plus className="w-3 h-3 text-white" strokeWidth={3} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* CSS for running pulse */}
      <style>{`
        .dante-node-pulse {
          animation: dante-pulse 1.5s ease-in-out infinite;
        }
        @keyframes dante-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(0,136,255,0.4); }
          50% { box-shadow: 0 0 0 8px rgba(0,136,255,0); }
        }
      `}</style>
    </div>
  );
}

function StickyNoteCard({ data, selected }: { data: DanteNodeData; selected: boolean }) {
  const content = (data.step.config as { content?: string })?.content || "";
  return (
    <div
      className={`
        min-w-[200px] max-w-[280px]
        ${selected ? "ring-2 ring-offset-2 ring-offset-[var(--canvas)] ring-[var(--flag)]" : ""}
      `}
      style={{
        background: "var(--flag-soft)",
        border: "1.5px solid var(--flag)",
        borderRadius: 12,
        boxShadow: "var(--neu-shadow-card)",
      }}
    >
      <div className="px-4 py-3">
        <div className="text-[10px] uppercase tracking-[0.08em] font-bold mb-1.5"
          style={{ color: "var(--flag)" }}
        >
          Note
        </div>
        <div className="text-[12px] text-[var(--ink)] leading-relaxed whitespace-pre-wrap">
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
