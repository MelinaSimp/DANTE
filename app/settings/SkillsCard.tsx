"use client";

// Settings → Dante skills panel.
//
// Read-mostly for now. Lists every skill registered for the
// workspace, shows which model + tools each one uses, and lets
// the advisor fire one ad-hoc with a JSON input. Authoring net-new
// skills is a Phase-3-polish UI that comes later — today the
// expected flow is: seed migration installs defaults, ops adds
// custom rows via SQL, advisors run and review.

import { useCallback, useEffect, useState } from "react";
import { Sparkles, Loader2, Play, ShieldCheck, ShieldAlert } from "lucide-react";

interface Skill {
  id: string;
  name: string;
  version: number;
  description: string;
  config: {
    objective: string;
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
  const [activeSkill, setActiveSkill] = useState<Skill | null>(null);

  const refresh = useCallback(async () => {
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

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--ink-subtle)]">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading skills…
      </div>
    );
  }

  if (skills.length === 0) {
    return (
      <div className="rounded-[4px] border border-[var(--rule)] bg-[var(--canvas-subtle)] p-5 text-sm text-[var(--ink-muted)]">
        No skills registered yet. Run the seed migration to install Dante&apos;s defaults
        (<code>draft_review_meeting_recap</code>, <code>summarize_recent_emails</code>,{" "}
        <code>prep_briefing_for_meeting</code>).
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {skills.map((s) => (
        <SkillRow key={s.id} skill={s} onRun={() => setActiveSkill(s)} />
      ))}

      {activeSkill && (
        <RunSkillModal skill={activeSkill} onClose={() => setActiveSkill(null)} />
      )}
    </div>
  );
}

function SkillRow({ skill, onRun }: { skill: Skill; onRun: () => void }) {
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
        <button
          onClick={onRun}
          className="inline-flex items-center gap-1.5 rounded-[4px] border border-[var(--rule)] px-2.5 py-1 text-xs text-[var(--ink-muted)] hover:text-[var(--ink)]"
        >
          <Play className="w-3 h-3" /> Run
        </button>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
      <div className="bg-[var(--canvas)] border border-[var(--rule)] rounded-[6px] w-full max-w-2xl max-h-[80vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base text-[var(--ink)]">Run {skill.name}</h3>
          <button onClick={onClose} className="text-sm text-[var(--ink-muted)] hover:text-[var(--ink)]">
            Close
          </button>
        </div>

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
