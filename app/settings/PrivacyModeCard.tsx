"use client";

// app/settings/PrivacyModeCard.tsx
//
// Workspace-level privacy / processing mode settings. Admin-only.
// Two-way toggle between cloud (default) and local-only (Hermes
// via the Electron app's bundled Ollama).
//
// Renders a clear capability gate: when local mode isn't available
// (Ollama unreachable or Hermes not pulled), the local-only option
// is disabled and a "set up local mode" link is shown. Avoids the
// failure mode of an admin flipping the firm to local_only when no
// laptop in the firm can actually serve those calls.

import { useEffect, useState } from "react";
import { Cloud, Laptop, AlertCircle, Loader2, ExternalLink } from "lucide-react";

type Mode = "cloud" | "local_only";

interface CapabilityResponse {
  available: boolean;
  workspace_default: Mode;
  ollama: {
    reachable: boolean;
    hermes_pulled: boolean;
    base_url: string;
    models_available: string[];
  };
}

export default function PrivacyModeCard() {
  const [cap, setCap] = useState<CapabilityResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me/local-mode", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((j) => setCap(j))
      .catch(() => setCap(null));
  }, []);

  const setMode = async (mode: Mode) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/workspace/processing-mode", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ default_processing_mode: mode }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update");
      setCap((c) => (c ? { ...c, workspace_default: mode } : c));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  if (!cap) {
    return (
      <div className="space-y-4">
        <div className="label-section mb-2">Privacy mode</div>
        <div className="text-sm text-[var(--ink-muted)] flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} />
          Loading capabilities…
        </div>
      </div>
    );
  }

  const localAvailable = cap.available;

  return (
    <div className="space-y-6">
      <div>
        <div className="label-section mb-2">Privacy mode (workspace default)</div>
        <p className="text-[12px] leading-relaxed text-[var(--ink-muted)] mb-3">
          Cloud mode sends prompts and document content to the LLM
          provider (OpenAI, with Zero Data Retention). Local mode
          processes everything on the user&rsquo;s machine via the Drift
          desktop app and an embedded Hermes 3 model — content never
          leaves the laptop. Per-contact, per-document, and per-chat
          overrides can tighten further; they cannot loosen below the
          workspace default.
        </p>
        <div
          role="radiogroup"
          aria-label="Workspace processing mode default"
          className="grid grid-cols-2 gap-2"
        >
          <ModeButton
            value="cloud"
            label="Cloud"
            description="OpenAI via ZDR contract. Default for most firms."
            icon={Cloud}
            active={cap.workspace_default === "cloud"}
            disabled={saving}
            onClick={() => setMode("cloud")}
          />
          <ModeButton
            value="local_only"
            label="Local only"
            description={
              localAvailable
                ? "Hermes 3 on each user's machine. Strictest privacy posture."
                : "Requires Drift desktop + Ollama. Currently unavailable."
            }
            icon={Laptop}
            active={cap.workspace_default === "local_only"}
            disabled={saving || !localAvailable}
            onClick={() => setMode("local_only")}
          />
        </div>
      </div>

      <div className="rounded-[6px] border border-[var(--rule)] bg-[var(--canvas-subtle)] px-4 py-3 text-[12px]">
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <span className="text-[var(--ink-muted)]">Local-mode availability</span>
          <span className={`mono ${localAvailable ? "text-emerald-700" : "text-amber-700"}`}>
            {localAvailable ? "available" : "unavailable"}
          </span>
        </div>
        <div className="text-[var(--ink-subtle)] leading-relaxed">
          Ollama reachable: <span className="mono">{String(cap.ollama.reachable)}</span>
          {" · "}Hermes pulled: <span className="mono">{String(cap.ollama.hermes_pulled)}</span>
          {cap.ollama.reachable && (
            <>
              {" · "}base URL: <span className="mono">{cap.ollama.base_url}</span>
            </>
          )}
        </div>
        {!localAvailable && (
          <div className="mt-2 flex items-start gap-1.5 text-[var(--ink-muted)]">
            <AlertCircle className="h-3 w-3 text-amber-600 mt-0.5" strokeWidth={1.5} />
            <span>
              To enable local mode, install the Drift desktop app and let it
              pull the Hermes 3 model on first run, or run Ollama
              independently with{" "}
              <span className="mono">ollama pull hermes3:8b</span>.
              <a
                href="/download"
                className="ml-1 inline-flex items-center gap-1 text-[var(--accent)] hover:underline underline-offset-2"
              >
                Download Drift
                <ExternalLink className="h-2.5 w-2.5" strokeWidth={1.5} />
              </a>
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="text-[12px] text-amber-700">{error}</div>
      )}

      <p className="text-[12px] leading-relaxed text-[var(--ink-muted)]">
        <strong className="text-[var(--ink)]">CCO note:</strong> changing the
        workspace default is logged to the audit trail. Per-contact and
        per-document overrides remain available regardless of the default.
      </p>
    </div>
  );
}

function ModeButton({
  value,
  label,
  description,
  icon: Icon,
  active,
  disabled,
  onClick,
}: {
  value: Mode;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      disabled={disabled}
      data-mode={value}
      className={`group flex flex-col items-start gap-2 rounded-[6px] border p-4 text-left transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out-quart active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed ${
        active
          ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-ground"
          : "border-[var(--rule)] bg-[var(--canvas)] hover:border-[var(--rule-strong)] hover:bg-[var(--canvas-subtle)]"
      }`}
    >
      <div className="flex items-center gap-2">
        <Icon
          className={`h-4 w-4 ${
            active ? "text-[var(--accent)]" : "text-[var(--ink-muted)]"
          }`}
          strokeWidth={1.5}
        />
        <span
          className={`text-sm font-medium ${
            active ? "text-[var(--accent)]" : "text-[var(--ink)]"
          }`}
        >
          {label}
        </span>
      </div>
      <p className="text-[12px] leading-relaxed text-[var(--ink-muted)]">
        {description}
      </p>
    </button>
  );
}
