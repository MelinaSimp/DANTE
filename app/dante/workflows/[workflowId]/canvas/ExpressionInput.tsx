"use client";

// app/dante/workflows/[workflowId]/canvas/ExpressionInput.tsx
//
// Expression editor for the Drift workflow canvas. Provides inline
// autocomplete for {{steps.<id>.<field>}} template references so the
// user never has to memorize step IDs or output keys.
//
// Usage: drop this into StepConfigForm wherever a field should accept
// template expressions (prompt, subject, body, expression, etc.).

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import type { StepType } from "@/lib/dante/workflow-types";

// ── Output-key defaults by step type ─────────────────────────────

const OUTPUT_KEY_MAP: Record<string, string[]> = {
  trigger_manual: ["input"],
  trigger_cron: ["input"],
  trigger_webhook: ["input"],
  trigger_at: ["input"],
  openai: ["text"],
  query_clients: ["contacts", "count"],
  query_properties: ["properties", "count"],
  query_listings: ["listings", "count"],
  query_offers: ["offers", "count"],
  lease_lookup: ["abstracts", "count"],
  archive_lookup: ["hits", "context"],
  web_search: ["answer", "results"],
  send_email: ["email_id"],
  send_sms: ["delivery_channel", "sid"],
  condition: ["passed"],
  delay: ["waited_seconds"],
  http: ["status", "body", "headers"],
  agent: ["text", "output"],
  due_diligence: ["census", "epa", "location", "nearby_places", "drive_times"],
  generate_document: ["url", "file_id"],
  code: ["result"],
};

const DEFAULT_OUTPUT_KEYS = ["output"];

/** Returns the default output keys for a given step type. */
export function getDefaultOutputKeys(type: StepType | string): string[] {
  return OUTPUT_KEY_MAP[type] ?? DEFAULT_OUTPUT_KEYS;
}

// Built-in variables available in all expressions.
const BUILTIN_VARIABLES = [
  { id: "$now", label: "$now", hint: "Current ISO timestamp" },
  { id: "$today", label: "$today", hint: "Today's date (YYYY-MM-DD)" },
  { id: "$timestamp", label: "$timestamp", hint: "Unix timestamp (ms)" },
  { id: "$workflow.id", label: "$workflow.id", hint: "Current workflow ID" },
  { id: "$workflow.name", label: "$workflow.name", hint: "Current workflow name" },
  { id: "$execution.id", label: "$execution.id", hint: "Current run ID" },
  { id: "$random", label: "$random", hint: "Random number 0-1" },
] as const;

// ── Types ────────────────────────────────────────────────────────

export interface AvailableStep {
  id: string;
  name?: string;
  type: string;
  outputKeys?: string[];
}

interface ExpressionInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  availableSteps: AvailableStep[];
}

// ── Autocomplete state machine ───────────────────────────────────
// Phase 1: user typed `{{` -- show list of steps
// Phase 2: user picked a step -- show list of output keys for it

type DropdownPhase =
  | { phase: "closed" }
  | { phase: "steps"; filter: string }
  | { phase: "keys"; stepId: string; stepLabel: string; filter: string };

// ── Component ────────────────────────────────────────────────────

export default function ExpressionInput({
  value,
  onChange,
  placeholder,
  rows = 1,
  availableSteps,
}: ExpressionInputProps) {
  const [dropdown, setDropdown] = useState<DropdownPhase>({ phase: "closed" });
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  // Track cursor position so we can splice text correctly.
  const cursorRef = useRef(0);
  // Track the position in the string where `{{` starts, for replacement.
  const tokenStartRef = useRef(0);

  // Close dropdown on outside click.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setDropdown({ phase: "closed" });
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Compute filtered items for the current dropdown phase.
  const items = useMemo(() => {
    if (dropdown.phase === "steps") {
      const f = dropdown.filter.toLowerCase();
      const stepItems = availableSteps
        .filter((s) => {
          const label = (s.name || s.id).toLowerCase();
          return label.includes(f) || s.type.toLowerCase().includes(f);
        })
        .map((s) => ({
          id: s.id,
          primary: s.name || s.id,
          secondary: s.type,
          value: s.id,
          isBuiltin: false,
        }));
      const builtinItems = BUILTIN_VARIABLES
        .filter((b) => b.label.toLowerCase().includes(f) || b.hint.toLowerCase().includes(f))
        .map((b) => ({
          id: b.id,
          primary: b.label,
          secondary: b.hint,
          value: b.id,
          isBuiltin: true,
        }));
      return [...stepItems, ...builtinItems];
    }
    if (dropdown.phase === "keys") {
      const step = availableSteps.find((s) => s.id === dropdown.stepId);
      const keys = step?.outputKeys ?? getDefaultOutputKeys(step?.type ?? "");
      const f = dropdown.filter.toLowerCase();
      return keys
        .filter((k) => k.toLowerCase().includes(f))
        .map((k) => ({
          id: k,
          primary: k,
          secondary: "",
          value: k,
          isBuiltin: false,
        }));
    }
    return [];
  }, [dropdown, availableSteps]);

  // Clamp selected index when list changes.
  useEffect(() => {
    setSelectedIdx((prev) => Math.min(prev, Math.max(0, items.length - 1)));
  }, [items]);

  // Scroll selected item into view inside the dropdown.
  useEffect(() => {
    if (!dropdownRef.current) return;
    const el = dropdownRef.current.children[selectedIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  // ── Text change handler ──────────────────────────────────────

  const handleChange = useCallback(
    (raw: string, cursor: number) => {
      onChange(raw);
      cursorRef.current = cursor;

      // Scan backwards from cursor to find an open `{{` that hasn't
      // been closed yet. This determines whether to show the dropdown.
      const before = raw.slice(0, cursor);
      const openIdx = before.lastIndexOf("{{");
      if (openIdx === -1) {
        setDropdown({ phase: "closed" });
        return;
      }

      // If there's a `}}` after the `{{`, the expression is already
      // closed -- no dropdown.
      const betweenOpenAndCursor = before.slice(openIdx + 2);
      if (betweenOpenAndCursor.includes("}}")) {
        setDropdown({ phase: "closed" });
        return;
      }

      tokenStartRef.current = openIdx;

      // Parse what the user has typed so far after `{{`.
      // Possible states:
      //   `{{`            -> phase: steps, filter: ""
      //   `{{qu`          -> phase: steps, filter: "qu"
      //   `{{steps.abc.`  -> phase: keys, stepId: "abc", filter: ""
      //   `{{steps.abc.te` -> phase: keys, stepId: "abc", filter: "te"
      const typed = betweenOpenAndCursor;

      const stepsPrefix = /^steps\.([^.]+)\.(.*)$/;
      const match = typed.match(stepsPrefix);
      if (match) {
        const stepId = match[1];
        const keyFilter = match[2];
        setDropdown({ phase: "keys", stepId, stepLabel: stepId, filter: keyFilter });
        setSelectedIdx(0);
        return;
      }

      // Could also be `steps.<partial>` without the trailing dot yet.
      const partialStep = /^steps\.([^.]*)$/;
      const pm = typed.match(partialStep);
      if (pm) {
        setDropdown({ phase: "steps", filter: pm[1] });
        setSelectedIdx(0);
        return;
      }

      // Bare `{{` or `{{<filter>` -- show steps.
      setDropdown({ phase: "steps", filter: typed });
      setSelectedIdx(0);
    },
    [onChange],
  );

  // ── Insertion helpers ────────────────────────────────────────

  const insertStep = useCallback(
    (stepId: string) => {
      const start = tokenStartRef.current;
      const cursor = cursorRef.current;
      const before = value.slice(0, start);
      const after = value.slice(cursor);
      const inserted = `{{steps.${stepId}.`;
      const next = before + inserted + after;
      onChange(next);
      const newCursor = before.length + inserted.length;
      cursorRef.current = newCursor;
      tokenStartRef.current = start;

      // Move to phase 2: pick a key.
      setDropdown({ phase: "keys", stepId, stepLabel: stepId, filter: "" });
      setSelectedIdx(0);

      // Restore focus and cursor position.
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(newCursor, newCursor);
        }
      });
    },
    [value, onChange],
  );

  const insertKey = useCallback(
    (key: string) => {
      const start = tokenStartRef.current;
      const cursor = cursorRef.current;
      const before = value.slice(0, start);
      const after = value.slice(cursor);

      // Find the step ID from the current dropdown state.
      const stepId =
        dropdown.phase === "keys" ? dropdown.stepId : "";
      const inserted = `{{steps.${stepId}.${key}}}`;
      const next = before + inserted + after;
      onChange(next);
      const newCursor = before.length + inserted.length;
      cursorRef.current = newCursor;
      setDropdown({ phase: "closed" });

      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(newCursor, newCursor);
        }
      });
    },
    [value, onChange, dropdown],
  );

  const insertBuiltin = useCallback(
    (varName: string) => {
      const start = tokenStartRef.current;
      const cursor = cursorRef.current;
      const before = value.slice(0, start);
      const after = value.slice(cursor);
      const inserted = `{{${varName}}}`;
      const next = before + inserted + after;
      onChange(next);
      const newCursor = before.length + inserted.length;
      cursorRef.current = newCursor;
      setDropdown({ phase: "closed" });
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el) { el.focus(); el.setSelectionRange(newCursor, newCursor); }
      });
    },
    [value, onChange],
  );

  const selectItem = useCallback(
    (idx: number) => {
      const item = items[idx];
      if (!item) return;
      if (item.isBuiltin) {
        insertBuiltin(item.value);
      } else if (dropdown.phase === "steps") {
        insertStep(item.value);
      } else if (dropdown.phase === "keys") {
        insertKey(item.value);
      }
    },
    [items, dropdown.phase, insertStep, insertKey, insertBuiltin],
  );

  // ── Keyboard handler ─────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (dropdown.phase === "closed") return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, items.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        if (items.length > 0) {
          e.preventDefault();
          selectItem(selectedIdx);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setDropdown({ phase: "closed" });
        return;
      }
      if (e.key === "Tab") {
        if (items.length > 0) {
          e.preventDefault();
          selectItem(selectedIdx);
        }
        return;
      }
    },
    [dropdown.phase, items, selectedIdx, selectItem],
  );

  // ── Render ────────────────────────────────────────────────────

  const inputClasses =
    "w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] " +
    "px-3 py-2 text-sm text-[var(--ink)] font-mono " +
    "focus:outline-none focus:border-[var(--rule-strong)] " +
    "placeholder:text-[var(--ink-subtle)]";

  const isOpen = dropdown.phase !== "closed" && items.length > 0;

  return (
    <div className="relative">
      {rows === 1 ? (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          value={value}
          placeholder={placeholder}
          onChange={(e) =>
            handleChange(e.target.value, e.target.selectionStart ?? e.target.value.length)
          }
          onKeyDown={handleKeyDown}
          className={inputClasses}
        />
      ) : (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={value}
          placeholder={placeholder}
          rows={rows}
          onChange={(e) =>
            handleChange(e.target.value, e.target.selectionStart ?? e.target.value.length)
          }
          onKeyDown={handleKeyDown}
          className={inputClasses + " resize-y"}
        />
      )}

      {/* Expression preview */}
      {value.includes("{{") && !isOpen && (
        <div className="mt-1 px-2 py-1 rounded-[3px] bg-[var(--canvas-subtle)] border border-[var(--rule)] text-[10px] mono text-[var(--ink-muted)] truncate">
          {resolvePreview(value)}
        </div>
      )}

      {isOpen && (
        <div
          ref={dropdownRef}
          className={
            "absolute left-0 right-0 z-50 mt-1 " +
            "bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] shadow-lg " +
            "max-h-[200px] overflow-y-auto"
          }
        >
          {dropdown.phase === "keys" && (
            <div className="px-3 py-1.5 text-[10px] text-[var(--ink-subtle)] border-b border-[var(--rule)] select-none">
              {dropdown.stepLabel} -- output keys
            </div>
          )}
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault(); // keep focus in input
                selectItem(i);
              }}
              className={
                "w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 " +
                (i === selectedIdx
                  ? "bg-[var(--canvas-subtle)]"
                  : "hover:bg-[var(--canvas-subtle)]")
              }
            >
              <span className="text-[var(--ink)] truncate">{item.primary}</span>
              {item.secondary && (
                <span className="text-[var(--ink-subtle)] font-mono ml-auto shrink-0">
                  {item.secondary}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function resolvePreview(expr: string): string {
  return expr.replace(/\{\{([^}]+)\}\}/g, (_, ref: string) => {
    const trimmed = ref.trim();
    if (trimmed === "$now") return new Date().toISOString();
    if (trimmed === "$today") return new Date().toISOString().slice(0, 10);
    if (trimmed === "$timestamp") return String(Date.now());
    if (trimmed === "$random") return (Math.random()).toFixed(4);
    if (trimmed.startsWith("steps.")) return `[${trimmed}]`;
    return `[${trimmed}]`;
  });
}
