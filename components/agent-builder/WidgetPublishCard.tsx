"use client";

// WidgetPublishCard — the "Publish → Web widget" panel in the agent
// builder. Toggles the agent's embeddable web-chat channel on/off and
// shows the copy-paste embed snippet. Independent of the voice deploy
// state: an agent can be a live web widget without a phone number.
//
// The embed uses the agent's widget_public_id (a rotatable token), not
// the internal UUID — so the snippet never leaks the real id, and
// rotating the token instantly revokes every embed.

import { useState } from "react";
import { Globe, Copy, Check, Link2 } from "lucide-react";

export default function WidgetPublishCard({
  agentId,
  publicId,
  initialEnabled,
}: {
  agentId: string;
  publicId: string | null;
  initialEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<"snippet" | "link" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Resolved client-side so it works across environments (localhost,
  // preview, prod) without threading an origin through the server.
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shareLink = publicId ? `${origin}/widget/${publicId}` : "";
  const snippet = publicId
    ? `<script src="${origin}/widget.js"\n        data-agent-id="${publicId}"\n        data-position="bottom-right"\n        data-primary-color="#4F46E5"></script>`
    : "";

  async function toggle(next: boolean) {
    setSaving(true);
    setError(null);
    const prev = enabled;
    setEnabled(next);
    try {
      const r = await fetch(`/api/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widget_enabled: next }),
      });
      if (!r.ok) throw new Error();
    } catch {
      setEnabled(prev);
      setError("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function copy(text: string, which: "snippet" | "link") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-100">
            <Globe className="h-4.5 w-4.5 text-neutral-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-neutral-900">Web widget</h3>
            <p className="mt-0.5 text-xs text-neutral-500">
              Embed this agent as a chat bubble on any website, or share it as a link.
            </p>
          </div>
        </div>

        {/* Toggle */}
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={saving || !publicId}
          onClick={() => toggle(!enabled)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            enabled ? "bg-emerald-500" : "bg-neutral-300"
          } disabled:opacity-50`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-[22px]" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

      {enabled && publicId && (
        <div className="mt-4 space-y-4">
          {/* Share link */}
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-neutral-700">
              <Link2 className="h-3.5 w-3.5" /> Shareable link
            </div>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={shareLink}
                className="flex-1 truncate rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-700"
              />
              <button
                type="button"
                onClick={() => copy(shareLink, "link")}
                className="flex items-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
              >
                {copied === "link" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copied === "link" ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          {/* Embed snippet */}
          <div>
            <div className="mb-1.5 text-xs font-medium text-neutral-700">Embed code</div>
            <div className="relative">
              <pre className="overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-900 p-3 text-[11px] leading-relaxed text-neutral-100">
                {snippet}
              </pre>
              <button
                type="button"
                onClick={() => copy(snippet, "snippet")}
                className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[11px] font-medium text-white hover:bg-white/20"
              >
                {copied === "snippet" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied === "snippet" ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-neutral-400">
              Paste before <code>&lt;/body&gt;</code> on any page. The widget only answers from this
              workspace&apos;s documents.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
