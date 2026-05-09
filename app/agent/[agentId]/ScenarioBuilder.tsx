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
                    <input
                      value={n.sms_to ?? ""}
                      onChange={(e) =>
                        updateNode(n.id, { sms_to: e.target.value } as Partial<VoicemailNode>)
                      }
                      placeholder="+15551234567"
                      className={`${inputClass} mono`}
                    />
                    <p className="text-[11px] text-[var(--ink-subtle)] mt-1">
                      E.164 format. Leave blank for no SMS dispatch.
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] block mb-1">
                      Override email recipient (optional)
                    </label>
                    <input
                      value={n.email_to ?? ""}
                      onChange={(e) =>
                        updateNode(n.id, { email_to: e.target.value } as Partial<VoicemailNode>)
                      }
                      placeholder="ops@example.com — leave blank to use workspace owner"
                      className={inputClass}
                    />
                  </div>
                </div>
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
