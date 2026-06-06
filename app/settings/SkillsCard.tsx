"use client";

// Settings → Dante skills panel.
//
// Lists registered skills, lets you create new ones, edit existing
// ones (which versions them rather than mutating), disable, and run
// ad-hoc with a JSON input. Tool whitelist is a multi-select against
// the canonical built-in list — MCP entries can be added by typing
// `mcp:<server_name>` and the registry handles the rest at run time.

import { useCallback, useEffect, useState } from "react";
import {
  Sparkles,
  Loader2,
  Play,
  ShieldCheck,
  ShieldAlert,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";

const BUILTIN_TOOLS = [
  "memory.search",
  "memory.write",
  "archive.search",
  "vault.cite",
  "clients.query",
  "clients.update",
  "email.send",
  "http.fetch",
  "skill.run",
] as const;

interface Skill {
  id: string;
  name: string;
  version: number;
  description: string;
  config: {
    objective: string;
    system?: string;
    tools: Array<string | { mcp: string }>;
    model?: string;
    max_steps?: number;
  };
  input_schema: { properties?: Record<string, unknown>; required?: string[] };
  auto_approve: boolean;
}

export default function SkillsCard() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeRun, setActiveRun] = useState<Skill | null>(null);
  const [editing, setEditing] = useState<Skill | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dante/skills");
      const json = await res.json();
      setSkills((json.skills || []) as Skill[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onDelete = async (s: Skill) => {
    if (!confirm(`Disable skill "${s.name}"? Existing run logs are kept; new calls will fail.`)) return;
    await fetch(`/api/dante/skills/${s.id}`, { method: "DELETE" });
    refresh();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--ink-subtle)]">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading skills…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-[4px] bg-[var(--accent)] px-3 py-1.5 text-xs text-white hover:opacity-90"
        >
          <Plus className="w-3 h-3" /> New skill
        </button>
      </div>

      {skills.length === 0 ? (
        <div className="rounded-[4px] border border-[var(--rule)] bg-[var(--canvas-subtle)] p-5 text-sm text-[var(--ink-muted)]">
          No skills registered yet. Create one above, or run the seed migration to install Dante&apos;s defaults.
        </div>
      ) : (
        skills.map((s) => (
          <SkillRow
            key={s.id}
            skill={s}
            onRun={() => setActiveRun(s)}
            onEdit={() => setEditing(s)}
            onDelete={() => onDelete(s)}
          />
        ))
      )}

      {activeRun && (
        <RunSkillModal skill={activeRun} onClose={() => setActiveRun(null)} />
      )}
      {(creating || editing) && (
        <EditSkillModal
          existing={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function SkillRow({
  skill,
  onRun,
  onEdit,
  onDelete,
}: {
  skill: Skill;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const tools = (skill.config.tools || []).map((t) =>
    typeof t === "string" ? t : `mcp:${t.mcp}`,
  );
  return (
    <div className="rounded-[4px] border border-[var(--rule)] bg-[var(--canvas-subtle)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-[var(--accent)]" strokeWidth={1.5} />
            <span className="text-sm text-[var(--ink)] font-medium">{skill.name}</span>
            <span className="text-xs text-[var(--ink-subtle)]">v{skill.version}</span>
            {skill.auto_approve ? (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-300/90">
                <ShieldCheck className="w-3 h-3" /> auto-approve
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-amber-300/90">
                <ShieldAlert className="w-3 h-3" /> needs review
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--ink-muted)] mb-2">{skill.description}</p>
          <div className="flex flex-wrap gap-1.5">
            {tools.map((t) => (
              <span
                key={t}
                className="inline-flex items-center rounded-[3px] bg-[var(--canvas)] border border-[var(--rule)] px-1.5 py-0.5 text-[10px] text-[var(--ink-muted)] font-mono"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <button
            onClick={onRun}
            className="inline-flex items-center gap-1.5 rounded-[4px] border border-[var(--rule)] px-2.5 py-1 text-xs text-[var(--ink-muted)] hover:text-[var(--ink)]"
          >
            <Play className="w-3 h-3" /> Run
          </button>
          <button
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 rounded-[4px] border border-[var(--rule)] px-2.5 py-1 text-xs text-[var(--ink-muted)] hover:text-[var(--ink)]"
          >
            <Pencil className="w-3 h-3" /> Edit
          </button>
          <button
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 rounded-[4px] border border-[var(--rule)] px-2.5 py-1 text-xs text-[var(--ink-muted)] hover:text-red-300"
          >
            <Trash2 className="w-3 h-3" /> Disable
          </button>
        </div>
      </div>
    </div>
  );
}

function RunSkillModal({ skill, onClose }: { skill: Skill; onClose: () => void }) {
  const [inputJson, setInputJson] = useState(() =>
    JSON.stringify(buildInputTemplate(skill), null, 2),
  );
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  const onRun = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const input = JSON.parse(inputJson);
      const res = await fetch("/api/dante/skills/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: skill.name, input }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "run_failed");
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "run_failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <ModalShell title={`Run ${skill.name}`} onClose={onClose}>
      <div className="text-xs text-[var(--ink-muted)] mb-2">Input (JSON)</div>
      <textarea
        className="w-full h-32 rounded-[4px] border border-[var(--rule)] bg-[var(--canvas-subtle)] px-2 py-1.5 text-sm font-mono text-[var(--ink)]"
        value={inputJson}
        onChange={(e) => setInputJson(e.target.value)}
      />
      <button
        onClick={onRun}
        disabled={running}
        className="mt-3 inline-flex items-center gap-1.5 rounded-[4px] bg-[var(--accent)] px-3 py-1.5 text-xs text-white hover:opacity-90 disabled:opacity-50"
      >
        {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
        {running ? "Running…" : "Run (simulate)"}
      </button>
      {error && (
        <div className="mt-4 rounded-[4px] border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}
      {result != null && (
        <div className="mt-4">
          <div className="text-xs text-[var(--ink-muted)] mb-2">Result</div>
          <pre className="rounded-[4px] border border-[var(--rule)] bg-[var(--canvas-subtle)] px-3 py-2 text-xs text-[var(--ink)] overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </ModalShell>
  );
}

function EditSkillModal({
  existing,
  onClose,
  onSaved,
}: {
  existing: Skill | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [objective, setObjective] = useState(existing?.config.objective ?? "");
  const [system, setSystem] = useState(existing?.config.system ?? "");
  const [tools, setTools] = useState<string[]>(
    existing?.config.tools.map((t) => (typeof t === "string" ? t : `mcp:${t.mcp}`)) ?? [
      "memory.search",
    ],
  );
  const [maxSteps, setMaxSteps] = useState(existing?.config.max_steps ?? 6);
  const [autoApprove, setAutoApprove] = useState(existing?.auto_approve ?? false);
  const [inputSchemaJson, setInputSchemaJson] = useState(
    JSON.stringify(existing?.input_schema ?? {}, null, 2),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleTool = (tool: string) => {
    setTools((prev) => (prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]));
  };

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const parsedSchema = inputSchemaJson.trim() ? JSON.parse(inputSchemaJson) : {};
      const toolsPayload = tools.map((t) => {
        if (t.startsWith("mcp:")) return { mcp: t.slice(4) };
        return t;
      });
      const res = await fetch("/api/dante/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          objective,
          system: system.trim() || undefined,
          tools: toolsPayload,
          max_steps: maxSteps,
          auto_approve: autoApprove,
          input_schema: parsedSchema,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "save_failed");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "save_failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title={existing ? `Edit ${existing.name}` : "New skill"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Name (lowercase, underscores)">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!!existing}                          // names are immutable; edits version
            placeholder="draft_review_meeting_recap"
            className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas-subtle)] px-2 py-1.5 text-sm text-[var(--ink)] disabled:opacity-50 font-mono"
          />
          {existing && (
            <div className="text-[10px] text-[var(--ink-subtle)] mt-1">
              Editing creates v{existing.version + 1}; v{existing.version} is disabled.
            </div>
          )}
        </Field>
        <Field label="Description (one line)">
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Draft a follow-up email recapping a deal review meeting."
            className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas-subtle)] px-2 py-1.5 text-sm text-[var(--ink)]"
          />
        </Field>
        <Field label="Objective (templated; use {{input.field}})">
          <textarea
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            className="w-full h-24 rounded-[4px] border border-[var(--rule)] bg-[var(--canvas-subtle)] px-2 py-1.5 text-sm text-[var(--ink)]"
          />
        </Field>
        <Field label="System prompt (optional persona/role)">
          <textarea
            value={system}
            onChange={(e) => setSystem(e.target.value)}
            className="w-full h-16 rounded-[4px] border border-[var(--rule)] bg-[var(--canvas-subtle)] px-2 py-1.5 text-sm text-[var(--ink)]"
          />
        </Field>
        <Field label="Tools">
          <div className="flex flex-wrap gap-1.5">
            {BUILTIN_TOOLS.map((t) => (
              <button
                key={t}
                onClick={() => toggleTool(t)}
                className={`text-[11px] font-mono rounded-[3px] border px-1.5 py-0.5 ${
                  tools.includes(t)
                    ? "bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)]"
                    : "bg-[var(--canvas)] border-[var(--rule)] text-[var(--ink-muted)]"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="text-[10px] text-[var(--ink-subtle)] mt-1.5">
            For MCP server tools, type the prefix below and click Add MCP.
          </div>
          <McpAdder
            current={tools}
            onAdd={(name) => setTools((prev) => [...prev, `mcp:${name}`])}
            onRemove={(name) => setTools((prev) => prev.filter((t) => t !== `mcp:${name}`))}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Max steps">
            <input
              type="number"
              min={1}
              max={20}
              value={maxSteps}
              onChange={(e) => setMaxSteps(Number(e.target.value))}
              className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas-subtle)] px-2 py-1.5 text-sm text-[var(--ink)]"
            />
          </Field>
          <Field label="Auto-approve">
            <label className="flex items-center gap-2 mt-2 text-sm text-[var(--ink-muted)]">
              <input
                type="checkbox"
                checked={autoApprove}
                onChange={(e) => setAutoApprove(e.target.checked)}
              />
              Run mutating tools without review
            </label>
          </Field>
        </div>
        <Field label="Input schema (JSON)">
          <textarea
            value={inputSchemaJson}
            onChange={(e) => setInputSchemaJson(e.target.value)}
            className="w-full h-24 rounded-[4px] border border-[var(--rule)] bg-[var(--canvas-subtle)] px-2 py-1.5 text-sm font-mono text-[var(--ink)]"
          />
        </Field>

        {error && (
          <div className="rounded-[4px] border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="rounded-[4px] border border-[var(--rule)] px-3 py-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)]"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="rounded-[4px] bg-[var(--accent)] px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : existing ? "Save new version" : "Create skill"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-[var(--ink-muted)] mb-1">{label}</div>
      {children}
    </div>
  );
}

function McpAdder({
  current,
  onAdd,
  onRemove,
}: {
  current: string[];
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
}) {
  const [val, setVal] = useState("");
  const mcps = current.filter((t) => t.startsWith("mcp:")).map((t) => t.slice(4));
  return (
    <div className="mt-1.5 flex items-center gap-2">
      {mcps.map((m) => (
        <span
          key={m}
          className="inline-flex items-center gap-1 rounded-[3px] bg-[var(--accent-soft)] border border-[var(--accent)] px-1.5 py-0.5 text-[11px] text-[var(--accent)] font-mono"
        >
          mcp:{m}
          <button onClick={() => onRemove(m)} className="text-[var(--accent)] hover:opacity-70">
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="wealthbox"
        className="w-32 rounded-[4px] border border-[var(--rule)] bg-[var(--canvas-subtle)] px-2 py-1 text-xs text-[var(--ink)]"
      />
      <button
        onClick={() => {
          if (val.trim()) {
            onAdd(val.trim());
            setVal("");
          }
        }}
        className="rounded-[4px] border border-[var(--rule)] px-2 py-1 text-xs text-[var(--ink-muted)] hover:text-[var(--ink)]"
      >
        Add MCP
      </button>
    </div>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
      <div className="bg-[var(--canvas)] border border-[var(--rule)] rounded-[6px] w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base text-[var(--ink)]">{title}</h3>
          <button onClick={onClose} className="text-sm text-[var(--ink-muted)] hover:text-[var(--ink)]">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function buildInputTemplate(skill: Skill): Record<string, string> {
  const out: Record<string, string> = {};
  const props = skill.input_schema?.properties || {};
  for (const key of Object.keys(props)) out[key] = "";
  return out;
}
