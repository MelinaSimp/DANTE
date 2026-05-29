"use client";

// ScenarioBuilder — minimal v1: linear list of nodes with type +
// content. Branch nodes have inline (match → next-node) pairs that
// pick from the other nodes via dropdown. Voicemail and transfer are
// terminal. The entry node is selectable.
//
// The data model lives entirely in JSONB on agents.scenario, so node
// shapes can grow without migrations. Persisted via the same PUT
// /api/agents/[id] that handles the rest of agent config.

import { useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  ArrowDown,
  GitBranch,
  Mic,
  PhoneForwarded,
  Voicemail,
  AlertCircle,
} from "lucide-react";

type NodeType = "say" | "branch" | "voicemail" | "transfer";

// Mirrors lib/voice/schedule.ts shape. Kept local so this client
// component doesn't pull the server module (which reads process.env).
type DayKey = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
interface ScheduleWindow {
  start: string;
  end: string;
}
const SCENARIO_DAY_KEYS: { key: DayKey; label: string }[] = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

interface SayNode {
  id: string;
  type: "say";
  text: string;
}
interface BranchNode {
  id: string;
  type: "branch";
  prompt: string;
  branches: Array<{ match: string; next: string }>;
  default?: string | null;
}
interface VoicemailNode {
  id: string;
  type: "voicemail";
  prompt?: string;
  // Optional routing — lets one scenario differentiate, e.g.,
  // "Property Management" voicemails (transcript SMS to +1…001) from
  // "Accounting" (SMS to +1…002). Empty/omitted means: no SMS, email
  // falls through to the workspace owner.
  label?: string;
  sms_to?: string;
  email_to?: string;
  // Per-step "live transfer during these hours" — when configured,
  // calls that reach this voicemail step inside any of the windows
  // get bridged to human_transfer_to instead of recording. Outside
  // the windows the step behaves like a normal voicemail.
  human_hours?: {
    timezone?: string;
    windows: Partial<Record<DayKey, ScheduleWindow[]>>;
  } | null;
  human_transfer_to?: string;
  human_ring_seconds?: number;
}
interface TransferNode {
  id: string;
  type: "transfer";
  to_number: string;
}

type ScenarioNode = SayNode | BranchNode | VoicemailNode | TransferNode;

export interface Scenario {
  version?: number;
  entry: string | null;
  nodes: ScenarioNode[];
}

const NEW_ID = () =>
  // Short, readable, unique enough within one scenario.
  Math.random().toString(36).slice(2, 8);

function newNode(type: NodeType): ScenarioNode {
  switch (type) {
    case "say":
      return { id: NEW_ID(), type, text: "" };
    case "branch":
      return {
        id: NEW_ID(),
        type,
        prompt: "",
        branches: [{ match: "", next: "" }],
        default: null,
      };
    case "voicemail":
      return { id: NEW_ID(), type, prompt: "", label: "", sms_to: "", email_to: "" };
    case "transfer":
      return { id: NEW_ID(), type, to_number: "" };
  }
}

const TYPE_LABEL: Record<NodeType, string> = {
  say: "Say",
  branch: "Branch (ask & route)",
  voicemail: "Voicemail",
  transfer: "Transfer",
};

const TYPE_ICON = {
  say: Mic,
  branch: GitBranch,
  voicemail: Voicemail,
  transfer: PhoneForwarded,
} as const;

export default function ScenarioBuilder({
  value,
  onChange,
}: {
  value: Scenario | null;
  onChange: (next: Scenario) => void;
}) {
  const scenario: Scenario = value ?? { version: 1, entry: null, nodes: [] };

  const idToLabel = useMemo(() => {
    const m = new Map<string, string>();
    let i = 1;
    for (const n of scenario.nodes) {
      m.set(n.id, `Step ${i} — ${TYPE_LABEL[n.type]}`);
      i++;
    }
    return m;
  }, [scenario.nodes]);

  const update = (next: Scenario) => onChange(next);

  const addNode = (type: NodeType) => {
    const node = newNode(type);
    const nodes = [...scenario.nodes, node];
    update({
      ...scenario,
      nodes,
      entry: scenario.entry ?? node.id,
    });
  };

  const removeNode = (id: string) => {
    const nodes = scenario.nodes.filter((n) => n.id !== id);
    // Strip references to the deleted node from any branches.
    const cleaned = nodes.map((n) => {
      if (n.type === "branch") {
        const branches = n.branches.map((b) =>
          b.next === id ? { ...b, next: "" } : b
        );
        return {
          ...n,
          branches,
          default: n.default === id ? null : n.default,
        };
      }
      return n;
    });
    update({
      ...scenario,
      entry: scenario.entry === id ? cleaned[0]?.id ?? null : scenario.entry,
      nodes: cleaned,
    });
  };

  const updateNode = (id: string, patch: Partial<ScenarioNode>) => {
    const nodes = scenario.nodes.map((n) =>
      n.id === id ? ({ ...n, ...patch } as ScenarioNode) : n
    );
    update({ ...scenario, nodes });
  };

  const inputClass =
    "w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none focus:border-[var(--rule-strong)]";

  return (
    <div className="space-y-5">
      {/* Entry picker */}
      <div className="card-flat p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="label-section">First step</div>
          <select
            value={scenario.entry ?? ""}
            onChange={(e) =>
              update({ ...scenario, entry: e.target.value || null })
            }
            className={`${inputClass} max-w-sm`}
            disabled={scenario.nodes.length === 0}
          >
            <option value="" disabled>
              {scenario.nodes.length === 0
                ? "Add a step below"
                : "— pick the entry step —"}
            </option>
            {scenario.nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {idToLabel.get(n.id)}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-[var(--ink-subtle)] flex-1">
            What the agent does the moment the call connects.
          </span>
        </div>
      </div>

      {/* Nodes */}
      {scenario.nodes.length === 0 && (
        <div className="card-flat py-12 text-center">
          <GitBranch
            className="w-8 h-8 text-[var(--ink-subtle)] mx-auto mb-3"
            strokeWidth={1.5}
          />
          <p className="text-sm text-[var(--ink-muted)] mb-4">
            No steps yet. Add one to begin.
          </p>
        </div>
      )}

      {scenario.nodes.map((n, idx) => {
        const Icon = TYPE_ICON[n.type];
        return (
          <div
            key={n.id}
            className="card-flat p-5 relative"
            style={{
              borderLeft:
                scenario.entry === n.id
                  ? "3px solid var(--ink)"
                  : "1px solid var(--rule)",
            }}
          >
            <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Icon
                  className="w-4 h-4 text-[var(--ink-muted)]"
                  strokeWidth={1.5}
                />
                <span className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)]">
                  Step {idx + 1}
                </span>
                <span className="text-sm font-semibold text-[var(--ink)]">
                  {TYPE_LABEL[n.type]}
                </span>
                {scenario.entry === n.id && (
                  <span className="text-[10px] mono uppercase tracking-wider text-[var(--accent)] px-1.5 py-0.5 rounded bg-[var(--accent-soft)]">
                    Entry
                  </span>
                )}
              </div>
              <button
                onClick={() => removeNode(n.id)}
                className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] transition"
                title="Remove step"
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </div>

            {n.type === "say" && (
              <textarea
                value={n.text}
                onChange={(e) => updateNode(n.id, { text: e.target.value } as Partial<SayNode>)}
                rows={3}
                placeholder="What the agent says verbatim. e.g. 'Thanks for calling Acme Realty — how can I help today?'"
                className={`${inputClass} resize-y`}
              />
            )}

            {n.type === "branch" && (
              <div className="space-y-3">
                <textarea
                  value={n.prompt}
                  onChange={(e) =>
                    updateNode(n.id, { prompt: e.target.value } as Partial<BranchNode>)
                  }
                  rows={2}
                  placeholder="The question the agent asks. e.g. 'Are you a buyer or a seller?'"
                  className={`${inputClass} resize-y`}
                />
                <div className="space-y-2">
                  <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)]">
                    If answer matches… → go to step
                  </div>
                  <p className="text-[11px] text-[var(--ink-subtle)] -mt-1">
                    Comma-separated synonyms count as one branch — e.g. <span className="mono">property management, PM, tenant, rent</span>.
                  </p>
                  {n.branches.map((b, i) => (
                    <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 items-center">
                      <input
                        value={b.match}
                        onChange={(e) => {
                          const branches = [...n.branches];
                          branches[i] = { ...b, match: e.target.value };
                          updateNode(n.id, { branches } as Partial<BranchNode>);
                        }}
                        placeholder='property management, PM, tenant, rent'
                        className={inputClass}
                      />
                      <ArrowDown
                        className="w-3 h-3 text-[var(--ink-subtle)] rotate-[-90deg]"
                        strokeWidth={1.5}
                      />
                      <select
                        value={b.next}
                        onChange={(e) => {
                          const branches = [...n.branches];
                          branches[i] = { ...b, next: e.target.value };
                          updateNode(n.id, { branches } as Partial<BranchNode>);
                        }}
                        className={inputClass}
                      >
                        <option value="">— pick step —</option>
                        {scenario.nodes
                          .filter((other) => other.id !== n.id)
                          .map((other) => (
                            <option key={other.id} value={other.id}>
                              {idToLabel.get(other.id)}
                            </option>
                          ))}
                      </select>
                      <button
                        onClick={() => {
                          const branches = n.branches.filter((_, j) => j !== i);
                          updateNode(n.id, {
                            branches: branches.length === 0 ? [{ match: "", next: "" }] : branches,
                          } as Partial<BranchNode>);
                        }}
                        className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] transition"
                        title="Remove branch"
                      >
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      const branches = [...n.branches, { match: "", next: "" }];
                      updateNode(n.id, { branches } as Partial<BranchNode>);
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] text-xs font-medium text-[var(--ink-muted)] transition"
                  >
                    <Plus className="w-3 h-3" strokeWidth={1.5} /> Add branch
                  </button>
                </div>
                <div className="grid grid-cols-[auto_1fr] gap-2 items-center pt-2 border-t border-[var(--rule)]">
                  <span className="text-xs text-[var(--ink-muted)]">
                    Otherwise →
                  </span>
                  <select
                    value={n.default ?? ""}
                    onChange={(e) =>
                      updateNode(n.id, { default: e.target.value || null } as Partial<BranchNode>)
                    }
                    className={inputClass}
                  >
                    <option value="">— end the call —</option>
                    {scenario.nodes
                      .filter((other) => other.id !== n.id)
                      .map((other) => (
                        <option key={other.id} value={other.id}>
                          {idToLabel.get(other.id)}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            )}

            {n.type === "voicemail" && (
              <div className="space-y-3">
                <textarea
                  value={n.prompt ?? ""}
                  onChange={(e) =>
                    updateNode(n.id, { prompt: e.target.value } as Partial<VoicemailNode>)
                  }
                  rows={2}
                  placeholder="What the agent says before the beep. e.g. 'Sorry I missed you — please leave a message after the tone.'"
                  className={`${inputClass} resize-y`}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 border-t border-[var(--rule)]">
                  <div>
                    <label className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] block mb-1">
                      Category label
                    </label>
                    <input
                      value={n.label ?? ""}
                      onChange={(e) =>
                        updateNode(n.id, { label: e.target.value } as Partial<VoicemailNode>)
                      }
                      placeholder="Property Management"
                      className={inputClass}
                    />
                    <p className="text-[11px] text-[var(--ink-subtle)] mt-1">
                      Appears in the SMS/email subject so the recipient knows the call type.
                    </p>
                  </div>
                  <div>
                    <label className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] block mb-1">
                      SMS transcript to
                    </label>
                    {(() => {
                      // sms_to is stored as a comma-joined string for
                      // backwards compat with the single-number shape.
                      // Split here so the UI can manage N inputs; rejoin
                      // on every change. Empty array shows one blank row
                      // so the user always has somewhere to type.
                      // sms_to is stored comma-joined; we KEEP blank entries
                      // in storage so the "+ Add number" button can add a
                      // blank input that persists across renders. The webhook
                      // filters blanks at parse time so empty rows don't
                      // attempt sends.
                      const numbers = (n.sms_to ?? "").split(",").map((s) => s.trim());
                      const display =
                        numbers.length === 0 || (numbers.length === 1 && !numbers[0])
                          ? [""]
                          : numbers;
                      const writeBack = (next: string[]) => {
                        updateNode(
                          n.id,
                          { sms_to: next.map((s) => s.trim()).join(",") } as Partial<VoicemailNode>,
                        );
                      };
                      return (
                        <div className="space-y-1.5">
                          {display.map((num, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <input
                                value={num}
                                onChange={(e) => {
                                  const copy = [...display];
                                  copy[i] = e.target.value;
                                  writeBack(copy);
                                }}
                                placeholder="+15551234567"
                                className={`${inputClass} mono flex-1`}
                              />
                              {display.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const copy = display.filter((_, j) => j !== i);
                                    writeBack(copy.length === 0 ? [""] : copy);
                                  }}
                                  className="p-1.5 rounded-[4px] text-[var(--ink-subtle)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] transition"
                                  aria-label="Remove number"
                                  title="Remove this number"
                                >
                                  <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                                </button>
                              )}
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => writeBack([...display, ""])}
                            className="inline-flex items-center gap-1 text-[11px] text-[var(--accent)] hover:underline"
                          >
                            <Plus className="w-3 h-3" strokeWidth={1.5} />
                            Add number
                          </button>
                        </div>
                      );
                    })()}
                    <p className="text-[11px] text-[var(--ink-subtle)] mt-1.5">
                      E.164 format. Each number on the list receives the transcript. Leave all blank for no SMS dispatch.
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] block mb-1">
                      Also send transcript to (optional)
                    </label>
                    <input
                      value={n.email_to ?? ""}
                      onChange={(e) =>
                        updateNode(n.id, { email_to: e.target.value } as Partial<VoicemailNode>)
                      }
                      placeholder="ops@example.com"
                      className={inputClass}
                    />
                    <p className="text-[11px] text-[var(--ink-subtle)] mt-1.5">
                      Sent in addition to the workspace owner. Leave blank to email the workspace owner only.
                    </p>
                  </div>
                </div>

                {/* Per-step "live transfer during these hours" */}
                {(() => {
                  const hasHours = !!n.human_hours && !!n.human_transfer_to;
                  const windows = n.human_hours?.windows ?? {};
                  const tz = n.human_hours?.timezone ?? "America/New_York";
                  const setHours = (next: NonNullable<VoicemailNode["human_hours"]>) => {
                    updateNode(n.id, { human_hours: next } as Partial<VoicemailNode>);
                  };
                  return (
                    <div className="mt-4 pt-4 border-t border-[var(--rule)]">
                      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                        <div>
                          <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-0.5">
                            Live transfer during certain hours
                          </div>
                          <p className="text-[11px] text-[var(--ink-subtle)] max-w-md">
                            Optional. When the caller reaches this step during these hours, bridge the call to a person instead of recording voicemail.
                          </p>
                        </div>
                        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={hasHours}
                            onChange={(e) => {
                              if (e.target.checked) {
                                updateNode(n.id, {
                                  human_hours: {
                                    timezone: "America/New_York",
                                    windows: {
                                      mon: [{ start: "09:00", end: "17:00" }],
                                      tue: [{ start: "09:00", end: "17:00" }],
                                      wed: [{ start: "09:00", end: "17:00" }],
                                      thu: [{ start: "09:00", end: "17:00" }],
                                      fri: [{ start: "09:00", end: "17:00" }],
                                      sat: [],
                                      sun: [],
                                    },
                                  },
                                  human_transfer_to: n.human_transfer_to ?? "",
                                  human_ring_seconds: n.human_ring_seconds ?? 60,
                                } as Partial<VoicemailNode>);
                              } else {
                                updateNode(n.id, {
                                  human_hours: null,
                                  human_transfer_to: "",
                                } as Partial<VoicemailNode>);
                              }
                            }}
                            className="w-4 h-4 accent-[var(--ink)]"
                          />
                          <span className="text-xs font-medium text-[var(--ink)]">
                            {hasHours ? "On" : "Off"}
                          </span>
                        </label>
                      </div>

                      {hasHours && (
                        <div className="space-y-3 mt-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <label className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)]">
                              Timezone
                            </label>
                            <select
                              value={tz}
                              onChange={(e) =>
                                setHours({
                                  timezone: e.target.value,
                                  windows,
                                })
                              }
                              className={`${inputClass} max-w-xs`}
                            >
                              {[
                                "America/New_York",
                                "America/Chicago",
                                "America/Denver",
                                "America/Los_Angeles",
                                "America/Phoenix",
                                "America/Anchorage",
                                "Pacific/Honolulu",
                              ].map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-2">
                            {SCENARIO_DAY_KEYS.map(({ key, label }) => {
                              const dayWindows = windows[key] ?? [];
                              return (
                                <div
                                  key={key}
                                  className="grid grid-cols-[60px_1fr_auto] gap-2 items-start py-1.5"
                                >
                                  <div className="text-xs font-medium text-[var(--ink)] pt-2">
                                    {label}
                                  </div>
                                  <div className="space-y-1.5">
                                    {dayWindows.length === 0 && (
                                      <div className="text-[11px] text-[var(--ink-subtle)] italic pt-2">
                                        No transfer
                                      </div>
                                    )}
                                    {dayWindows.map((w, i) => (
                                      <div key={i} className="flex items-center gap-1.5">
                                        <input
                                          type="time"
                                          value={w.start}
                                          onChange={(e) => {
                                            const next = [...dayWindows];
                                            next[i] = { ...w, start: e.target.value };
                                            setHours({ timezone: tz, windows: { ...windows, [key]: next } });
                                          }}
                                          className={`${inputClass} w-28 mono`}
                                        />
                                        <span className="text-[11px] text-[var(--ink-subtle)]">to</span>
                                        <input
                                          type="time"
                                          value={w.end}
                                          onChange={(e) => {
                                            const next = [...dayWindows];
                                            next[i] = { ...w, end: e.target.value };
                                            setHours({ timezone: tz, windows: { ...windows, [key]: next } });
                                          }}
                                          className={`${inputClass} w-28 mono`}
                                        />
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const next = dayWindows.filter((_, j) => j !== i);
                                            setHours({ timezone: tz, windows: { ...windows, [key]: next } });
                                          }}
                                          className="p-1 rounded-[4px] text-[var(--ink-subtle)] hover:text-[var(--danger)] transition"
                                          title="Remove window"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next: ScheduleWindow[] = [
                                        ...dayWindows,
                                        { start: "09:00", end: "17:00" },
                                      ];
                                      setHours({ timezone: tz, windows: { ...windows, [key]: next } });
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] text-[10px] font-medium text-[var(--ink-muted)] transition mt-0.5"
                                    title="Add window"
                                  >
                                    <Plus className="w-3 h-3" strokeWidth={1.5} />
                                    Add
                                  </button>
                                </div>
                              );
                            })}
                          </div>

                          <div className="pt-2 border-t border-[var(--rule)] grid grid-cols-1 md:grid-cols-[1fr_140px] gap-3">
                            <div>
                              <label className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] block mb-1">
                                Bridge live calls to
                              </label>
                              <input
                                value={n.human_transfer_to ?? ""}
                                onChange={(e) =>
                                  updateNode(n.id, {
                                    human_transfer_to: e.target.value,
                                  } as Partial<VoicemailNode>)
                                }
                                placeholder="+15551234567"
                                className={`${inputClass} mono`}
                              />
                              <p className="text-[11px] text-[var(--ink-subtle)] mt-1">
                                E.164. The phone that rings during the hours above. Outside those hours, the caller leaves a voicemail like normal.
                              </p>
                            </div>
                            <div>
                              <label className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] block mb-1">
                                Ring for (sec)
                              </label>
                              <input
                                type="number"
                                min={5}
                                max={300}
                                step={5}
                                value={n.human_ring_seconds ?? 60}
                                onChange={(e) =>
                                  updateNode(n.id, {
                                    human_ring_seconds: Math.max(5, Math.min(300, parseInt(e.target.value || "60", 10) || 60)),
                                  } as Partial<VoicemailNode>)
                                }
                                className={`${inputClass} mono`}
                              />
                              <p className="text-[11px] text-[var(--ink-subtle)] mt-1">
                                Then fall back to voicemail.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {n.type === "transfer" && (
              <div>
                <input
                  value={n.to_number}
                  onChange={(e) =>
                    updateNode(n.id, {
                      to_number: e.target.value,
                    } as Partial<TransferNode>)
                  }
                  placeholder="+15551234567"
                  className={`${inputClass} mono`}
                />
                <p className="text-[11px] text-[var(--ink-subtle)] mt-1.5">
                  Use E.164 format. The caller is bridged to this number.
                </p>
              </div>
            )}
          </div>
        );
      })}

      {/* Add node row */}
      <div className="card-flat p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-[var(--ink-muted)] mr-2">
            Add step:
          </span>
          {(["say", "branch", "voicemail", "transfer"] as NodeType[]).map((t) => {
            const Icon = TYPE_ICON[t];
            return (
              <button
                key={t}
                onClick={() => addNode(t)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] text-xs font-medium text-[var(--ink)] transition"
              >
                <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
                {TYPE_LABEL[t]}
              </button>
            );
          })}
        </div>
        {scenario.nodes.length > 0 && !scenario.entry && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-[var(--flag)]">
            <AlertCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
            Pick a "First step" above so the call has somewhere to start.
          </div>
        )}
      </div>
    </div>
  );
}
