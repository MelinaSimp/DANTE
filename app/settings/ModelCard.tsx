"use client";

// ModelCard — three-tier hybrid routing controls.
//
// Drift's chat path doesn't run on a single model; calls are routed
// per task tier so cheap classification turns hit Haiku, bulk Q&A
// hits Sonnet, and hard reasoning (contradiction detection, RMD
// math, Deep Research synthesis) hits Opus. This card surfaces
// that routing as three dropdowns. Customers who want a different
// trade-off (e.g. Opus for everything, or Sonnet for hard reasoning
// to save money) override here.
//
// Writes to workspaces.model_overrides — same column the per-customer
// admin page edits. Reads via /api/workspace/model-routing.

import { useEffect, useState } from "react";
import TetrisLoading from "@/components/ui/tetris-loader";

const TIERS = [
  {
    key: "routing" as const,
    title: "Quick lookups",
    blurb:
      "Intent classification + simple structured outputs. Most cost-sensitive tier.",
    options: [
      { value: "claude-haiku-4-5", label: "Haiku 4.5", note: "Cheapest, fastest. Recommended." },
      { value: "claude-sonnet-4-6", label: "Sonnet 4.6", note: "Richer routing. ~4× cost." },
    ],
  },
  {
    key: "bulk" as const,
    title: "Standard answers",
    blurb:
      "Most chat turns: retrieval-grounded answers, summaries, drafts.",
    options: [
      { value: "claude-haiku-4-5", label: "Haiku 4.5", note: "Cheap but smaller context handling." },
      { value: "claude-sonnet-4-6", label: "Sonnet 4.6", note: "Default. Best cost/quality balance." },
      { value: "claude-opus-4-7", label: "Opus 4", note: "Premium. ~5× cost vs Sonnet." },
    ],
  },
  {
    key: "hard" as const,
    title: "Hard reasoning",
    blurb:
      "Contradiction detection, RMD math, Deep Research synthesis, multi-step compliance.",
    options: [
      { value: "claude-sonnet-4-6", label: "Sonnet 4.6", note: "Saves cost; works for most reasoning." },
      { value: "claude-opus-4-7", label: "Opus 4", note: "Default. Best at multi-step reasoning." },
    ],
  },
];

interface Overrides {
  routing?: string;
  bulk?: string;
  hard?: string;
}

interface Props {
  isAdmin: boolean;
}

export default function ModelCard({ isAdmin }: Props) {
  const [overrides, setOverrides] = useState<Overrides>({});
  const [defaults, setDefaults] = useState<Required<Overrides>>({
    routing: "claude-haiku-4-5",
    bulk: "claude-sonnet-4-6",
    hard: "claude-opus-4-7",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/workspace/model-routing")
      .then((r) => r.json())
      .then((d) => {
        setOverrides(d.overrides || {});
        if (d.defaults) setDefaults(d.defaults);
      })
      .finally(() => setLoading(false));
  }, []);

  function setTier(tier: keyof Overrides, value: string) {
    setOverrides((prev) => ({ ...prev, [tier]: value }));
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/workspace/model-routing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(overrides),
      });
      const d = await res.json();
      if (!res.ok) {
        setStatus(d.error || "Save failed");
      } else {
        setStatus("Saved");
        setTimeout(() => setStatus(null), 2000);
      }
    } catch (e: any) {
      setStatus(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setOverrides({});
    void save();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <TetrisLoading size="sm" speed="fast" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-[var(--rule)] bg-[var(--canvas-subtle)] p-4">
        <div className="text-xs uppercase tracking-wide text-[var(--ink-subtle)] mb-1">
          Hybrid model routing
        </div>
        <div className="text-sm text-[var(--ink)]">
          Different tasks use different models for the best cost/quality
          tradeoff. Override per tier below; system defaults apply if you
          don't.
        </div>
      </div>

      {!isAdmin ? (
        <div className="text-sm text-[var(--ink-muted)]">
          Only workspace admins can change model routing.
        </div>
      ) : (
        <>
          {TIERS.map((tier) => {
            const value = (overrides as Record<string, string | undefined>)[tier.key] || defaults[tier.key];
            const isOverride = !!(overrides as Record<string, string | undefined>)[tier.key];
            const opt = tier.options.find((o) => o.value === value);
            return (
              <div key={tier.key} className="border border-[var(--rule)] rounded-md p-4">
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <div>
                    <div className="text-sm font-medium text-[var(--ink)]">{tier.title}</div>
                    <div className="text-xs text-[var(--ink-muted)]">{tier.blurb}</div>
                  </div>
                  {isOverride && (
                    <span className="text-[10px] mono uppercase tracking-wider text-[var(--accent,#2563eb)]">
                      overridden
                    </span>
                  )}
                </div>
                <select
                  value={value}
                  onChange={(e) => setTier(tier.key, e.target.value)}
                  disabled={saving}
                  className="w-full mt-2 px-3 py-2 rounded-md border border-[var(--rule)] bg-[var(--canvas)] text-[var(--ink)] text-sm focus:outline-none focus:border-[var(--accent)]"
                >
                  {tier.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {opt?.note && (
                  <div className="text-xs text-[var(--ink-subtle)] mt-1.5">{opt.note}</div>
                )}
              </div>
            );
          })}

          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 text-sm rounded-md bg-[var(--accent)] text-white hover:opacity-90 transition disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            {Object.keys(overrides).length > 0 && (
              <button
                onClick={reset}
                disabled={saving}
                className="px-4 py-2 text-sm rounded-md border border-[var(--rule)] text-[var(--ink-muted)] hover:text-[var(--ink)] transition disabled:opacity-50"
              >
                Reset to defaults
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
