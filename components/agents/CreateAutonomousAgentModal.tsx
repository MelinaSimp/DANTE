"use client";

// Modal for customers to define their own autonomous agent. Rendered from
// the Autonomous tab on /dashboard/agents. On submit, POSTs to
// /api/autonomous-agents/create and calls onCreated with the new row.

import { useState } from "react";
import {
  X,
  Loader2,
  Users,
  DollarSign,
  MessageSquare,
  CheckCircle,
  AlertTriangle,
  Zap,
  Bot,
  Sparkles,
  Lightbulb,
  FileText,
  Bell,
} from "lucide-react";

export interface CreatedAgent {
  id: string;
  name: string;
  purpose: string;
  status: string;
  icon: string;
  color_class: string;
  success_rate: number;
  confidence_level: number;
  outputs_today: number;
  pending_reviews: number;
  last_run: string | null;
  last_error: string | null;
}

const DATA_SOURCES: { id: string; label: string; hint: string }[] = [
  {
    id: "contacts",
    label: "Contacts",
    hint: "Names, emails, last interaction, engagement gaps",
  },
  {
    id: "sales",
    label: "Sales records",
    hint: "Revenue by company, recent transactions, trends",
  },
  {
    id: "conversations",
    label: "Conversations",
    hint: "Completed agent conversations with transcript excerpts",
  },
  {
    id: "appointments",
    label: "Meetings",
    hint: "Upcoming + recent appointments with notes",
  },
  {
    id: "tasks_activity",
    label: "Recent activity",
    hint: "New contacts, completed calls, open tasks (last 7 days)",
  },
  {
    id: "churn_signals",
    label: "Engagement profile",
    hint: "Per-contact note + appointment counts for churn scoring",
  },
];

const ICONS = [
  { name: "Sparkles", Comp: Sparkles },
  { name: "Bot", Comp: Bot },
  { name: "Zap", Comp: Zap },
  { name: "Lightbulb", Comp: Lightbulb },
  { name: "Users", Comp: Users },
  { name: "DollarSign", Comp: DollarSign },
  { name: "MessageSquare", Comp: MessageSquare },
  { name: "CheckCircle", Comp: CheckCircle },
  { name: "AlertTriangle", Comp: AlertTriangle },
  { name: "FileText", Comp: FileText },
  { name: "Bell", Comp: Bell },
];

const COLORS = [
  "text-fuchsia-400",
  "text-blue-400",
  "text-emerald-400",
  "text-purple-400",
  "text-amber-400",
  "text-rose-400",
  "text-cyan-400",
  "text-indigo-400",
];

export default function CreateAutonomousAgentModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (agent: CreatedAgent) => void;
}) {
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [instructions, setInstructions] = useState("");
  const [selectedSources, setSelectedSources] = useState<string[]>([
    "contacts",
  ]);
  const [icon, setIcon] = useState("Sparkles");
  const [colorClass, setColorClass] = useState("text-fuchsia-400");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const toggleSource = (id: string) => {
    setSelectedSources((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const reset = () => {
    setName("");
    setPurpose("");
    setInstructions("");
    setSelectedSources(["contacts"]);
    setIcon("Sparkles");
    setColorClass("text-fuchsia-400");
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) return setError("Name is required");
    if (!instructions.trim())
      return setError("Tell the agent what to do in the instructions");
    if (selectedSources.length === 0)
      return setError("Pick at least one data source");

    setSaving(true);
    try {
      const res = await fetch("/api/autonomous-agents/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          purpose: purpose.trim(),
          custom_instructions: instructions.trim(),
          data_sources: selectedSources,
          icon,
          color_class: colorClass,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Failed to create agent");
      }
      onCreated(json.agent as CreatedAgent);
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={() => !saving && onClose()}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-fuchsia-500/10">
              <Sparkles className="h-4 w-4 text-fuchsia-400" />
            </div>
            <h2 className="text-lg font-semibold text-zinc-50">
              New autonomous agent
            </h2>
          </div>
          <button
            type="button"
            onClick={() => !saving && onClose()}
            className="p-1 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1.5 block">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. High-value lead watcher"
              maxLength={80}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1.5 block">
              One-line purpose
              <span className="ml-1 font-normal normal-case text-zinc-600">
                (optional — shown on the agent card)
              </span>
            </label>
            <input
              type="text"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Scans my contacts for big fish that have gone quiet"
              maxLength={200}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1.5 block">
              Instructions
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Tell the agent what to look for and what output you want. e.g. 'Find contacts who have spent more than $10k historically but haven't been contacted in 30+ days. For each, suggest a specific re-engagement action (call, email, offer).'"
              maxLength={4000}
              rows={6}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none resize-y"
            />
            <p className="text-[11px] text-zinc-600 mt-1">
              The agent will follow these instructions every time it runs and
              produce structured insights + follow-up tasks.
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1.5 block">
              Data sources
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {DATA_SOURCES.map((src) => {
                const active = selectedSources.includes(src.id);
                return (
                  <button
                    key={src.id}
                    type="button"
                    onClick={() => toggleSource(src.id)}
                    className={`text-left rounded-xl border px-3 py-2.5 transition ${
                      active
                        ? "border-emerald-500/50 bg-emerald-500/10"
                        : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-3.5 w-3.5 rounded border flex items-center justify-center ${
                          active
                            ? "bg-emerald-500 border-emerald-500"
                            : "border-zinc-600"
                        }`}
                      >
                        {active && (
                          <CheckCircle
                            className="h-2.5 w-2.5 text-black"
                            strokeWidth={3}
                          />
                        )}
                      </span>
                      <span className="text-sm font-medium text-zinc-100">
                        {src.label}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-600 mt-1 ml-5">
                      {src.hint}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1.5 block">
                Icon
              </label>
              <div className="flex flex-wrap gap-1.5">
                {ICONS.map(({ name: n, Comp }) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setIcon(n)}
                    className={`p-2 rounded-lg border transition ${
                      icon === n
                        ? "border-zinc-500 bg-zinc-800"
                        : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
                    }`}
                    title={n}
                  >
                    <Comp
                      className={`h-4 w-4 ${colorClass}`}
                      strokeWidth={1.5}
                    />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1.5 block">
                Color
              </label>
              <div className="flex flex-wrap gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColorClass(c)}
                    className={`h-8 w-8 rounded-lg border flex items-center justify-center transition ${
                      colorClass === c
                        ? "border-zinc-500 bg-zinc-800"
                        : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
                    }`}
                    title={c.replace("text-", "").replace("-400", "")}
                  >
                    <span
                      className={`h-3 w-3 rounded-full ${c.replace(
                        "text-",
                        "bg-"
                      )}`}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
            <button
              type="button"
              onClick={() => !saving && onClose()}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {saving ? "Creating…" : "Create agent"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
