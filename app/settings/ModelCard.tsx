"use client";

import { useEffect, useState } from "react";

const SUGGESTIONS = ["gpt-5", "gpt-4o", "gpt-4o-mini", "o3-mini"];

interface Props {
  isAdmin: boolean;
}

export default function ModelCard({ isAdmin }: Props) {
  const [current, setCurrent] = useState<string>("");
  const [fallback, setFallback] = useState<string>("gpt-5");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/workspace/model")
      .then((r) => r.json())
      .then((d) => {
        setCurrent(d.model || "");
        setFallback(d.fallback || "gpt-5");
      })
      .finally(() => setLoading(false));
  }, []);

  async function save(next: string) {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/workspace/model", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: next }),
      });
      const d = await res.json();
      if (!res.ok) {
        setStatus(d.error || "Save failed");
      } else {
        setCurrent(d.model || "");
        setStatus("Saved");
        setTimeout(() => setStatus(null), 2000);
      }
    } catch (e: any) {
      setStatus(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="text-sm text-[var(--ink-subtle)]">Loading…</div>
    );
  }

  const effective = current || fallback;
  const usingDefault = !current;

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-[var(--rule)] bg-[var(--canvas-subtle)] p-4">
        <div className="text-xs uppercase tracking-wide text-[var(--ink-subtle)] mb-1">
          Currently using
        </div>
        <div className="font-mono text-base text-[var(--ink)]">{effective}</div>
        {usingDefault && (
          <div className="text-xs text-[var(--ink-subtle)] mt-1">
            (workspace default — no override set)
          </div>
        )}
      </div>

      {!isAdmin ? (
        <div className="text-sm text-[var(--ink-muted)]">
          Only workspace admins can change the model.
        </div>
      ) : (
        <>
          <div>
            <label className="block text-sm text-[var(--ink-muted)] mb-2">
              Model name
            </label>
            <input
              type="text"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder={`Leave blank to use default (${fallback})`}
              className="w-full px-3 py-2 rounded-md border border-[var(--rule)] bg-[var(--canvas)] text-[var(--ink)] font-mono text-sm focus:outline-none focus:border-[var(--accent)]"
              disabled={saving}
            />
            <div className="text-xs text-[var(--ink-subtle)] mt-2">
              Any OpenAI chat-completions model your API key has access to.
              Applies to Dante, Vergil, SMS, and all workflow agent steps in
              this workspace.
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((m) => (
              <button
                key={m}
                onClick={() => setCurrent(m)}
                disabled={saving}
                className="px-3 py-1.5 text-xs font-mono rounded-md border border-[var(--rule)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:border-[var(--accent)] transition disabled:opacity-50"
              >
                {m}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => save(current)}
              disabled={saving}
              className="px-4 py-2 text-sm rounded-md bg-[var(--accent)] text-white hover:opacity-90 transition disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {current && (
              <button
                onClick={() => {
                  setCurrent("");
                  save("");
                }}
                disabled={saving}
                className="px-4 py-2 text-sm rounded-md border border-[var(--rule)] text-[var(--ink-muted)] hover:text-[var(--ink)] transition disabled:opacity-50"
              >
                Reset to default
              </button>
            )}
            {status && (
              <span className="text-xs text-[var(--ink-subtle)]">{status}</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
