"use client";

// components/desktop/UpdateAffordance.tsx
//
// Renders both the top-bar "Update" button (small, persistent,
// next to Ask Dante) and the centered update modal it opens.
// Replaces the old bottom-right toast — that pattern looked like
// a system notification, this one looks like part of the app.
//
// Two cases:
//   1. v1.1.0+ — has window.electronAPI.updates. The button is
//      hidden until electron-updater finishes downloading a new
//      build, then surfaces with one big "Update now" button in
//      the modal. Click → quitAndInstall → relaunch.
//   2. v1.0.x — no IPC bridge. We treat that as "out of date"
//      definitionally and surface DMG download buttons.
//
// In the web build (no electronAPI) the component renders nothing.

import { useCallback, useEffect, useState } from "react";
import { ArrowUp, X } from "lucide-react";
import type { UpdateState } from "@/types/electron-api";

const DISMISS_KEY = "drift.updateBanner.dismissedVersion";
const PRE_BRIDGE_DISMISS_KEY = "drift.updateBanner.preBridgeDismissed";
const FIRST_BRIDGE_VERSION = "1.1.0";

export default function UpdateAffordance() {
  const [state, setState] = useState<UpdateState | null>(null);
  const [applying, setApplying] = useState(false);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const [preBridgeDismissed, setPreBridgeDismissed] = useState<string | null>(null);
  const [isElectron, setIsElectron] = useState(false);
  const [hasBridge, setHasBridge] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsElectron(!!window.electronAPI?.isElectron);
    setHasBridge(!!window.electronAPI?.updates);
    setDismissedVersion(localStorage.getItem(DISMISS_KEY));
    setPreBridgeDismissed(localStorage.getItem(PRE_BRIDGE_DISMISS_KEY));
  }, []);

  useEffect(() => {
    const api = window.electronAPI?.updates;
    if (!api) return;
    api.getState().then(setState).catch(() => {});
    const unsub = api.onState((next) => setState(next));
    api.check().catch(() => {});
    return () => {
      try {
        unsub();
      } catch {
        /* ignore */
      }
    };
  }, []);

  // Esc closes the modal, matching the Ask Dante modal's behavior.
  useEffect(() => {
    if (!modalOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setModalOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen]);

  const apply = useCallback(async () => {
    if (!window.electronAPI?.updates) return;
    setApplying(true);
    try {
      await window.electronAPI.updates.apply();
      // App restarts; this won't return.
    } catch {
      setApplying(false);
    }
  }, []);

  const dismiss = useCallback(() => {
    if (hasBridge && state?.downloaded_version) {
      localStorage.setItem(DISMISS_KEY, state.downloaded_version);
      setDismissedVersion(state.downloaded_version);
    } else if (!hasBridge) {
      localStorage.setItem(PRE_BRIDGE_DISMISS_KEY, FIRST_BRIDGE_VERSION);
      setPreBridgeDismissed(FIRST_BRIDGE_VERSION);
    }
    setModalOpen(false);
  }, [hasBridge, state?.downloaded_version]);

  // Determine if there's anything to show. Three states feed in:
  //   1. v1.0.x Electron — always offer update (until dismissed).
  //   2. v1.1.0+ with state=downloaded — offer "Update now".
  //   3. Anything else — render nothing.
  const updateMode: "pre_bridge" | "ready" | null = (() => {
    if (!isElectron) return null;
    if (!hasBridge) {
      if (preBridgeDismissed === FIRST_BRIDGE_VERSION) return null;
      return "pre_bridge";
    }
    if (state?.status === "downloaded") {
      if (
        state.downloaded_version &&
        dismissedVersion === state.downloaded_version
      ) {
        return null;
      }
      return "ready";
    }
    return null;
  })();

  if (!updateMode) return null;

  const versionLabel =
    updateMode === "ready"
      ? state?.downloaded_version || ""
      : FIRST_BRIDGE_VERSION;

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className={`relative inline-flex items-center gap-1.5 rounded-[6px] border px-3 py-2 text-xs font-medium transition hover:opacity-90 active:scale-[0.99] ${
          updateMode === "ready"
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
        }`}
        aria-label={`Drift v${versionLabel} is available — click to update`}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            updateMode === "ready" ? "bg-emerald-500" : "bg-amber-500"
          } animate-pulse`}
        />
        <ArrowUp className="w-3.5 h-3.5" strokeWidth={2} />
        <span>Update</span>
      </button>

      {modalOpen && (
        <UpdateModal
          mode={updateMode}
          versionLabel={versionLabel}
          applying={applying}
          onClose={() => setModalOpen(false)}
          onApply={apply}
          onDismiss={dismiss}
        />
      )}
    </>
  );
}

function UpdateModal({
  mode,
  versionLabel,
  applying,
  onClose,
  onApply,
  onDismiss,
}: {
  mode: "pre_bridge" | "ready";
  versionLabel: string;
  applying: boolean;
  onClose: () => void;
  onApply: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-modal-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--ink)]/60 backdrop-blur-md px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-lg rounded-lg border border-[var(--rule)] bg-[var(--canvas)] shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 p-1.5 rounded-md text-[var(--ink-muted)] hover:bg-[var(--rule)]/30 hover:text-[var(--ink)]"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6">
          <div className="flex items-start gap-3 mb-4">
            <div
              className={`mt-1 w-8 h-8 rounded-full flex items-center justify-center ${
                mode === "ready"
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
              }`}
            >
              <ArrowUp className="w-4 h-4" strokeWidth={2.25} />
            </div>
            <div>
              <h2
                id="update-modal-title"
                className="heading-display text-xl mb-1"
              >
                {mode === "ready"
                  ? `Drift ${versionLabel} is ready`
                  : `Drift v${versionLabel} is available`}
              </h2>
              <p className="text-sm text-[var(--ink-muted)] leading-relaxed">
                {mode === "ready"
                  ? "A new version has been downloaded. Restart to apply — this takes a few seconds."
                  : "Auto-updates require code-signing setup we haven't done yet, so this one's a manual install — pick your Mac, drag it into Applications, and reopen."}
              </p>
            </div>
          </div>

          <div className="rounded-md border border-[var(--rule)] bg-[var(--rule)]/5 p-4 mb-5">
            <div className="text-xs uppercase tracking-wide text-[var(--ink-muted)] mb-2">
              What&rsquo;s in this release
            </div>
            <ul className="text-sm space-y-1.5 leading-relaxed">
              <li>
                <strong>Hermes (local AI)</strong> — chat with a model
                running entirely on your machine; nothing leaves the
                desktop.
              </li>
              <li>
                <strong>Watched files</strong> — register folders, get
                approval prompts as new files appear.
              </li>
              <li>
                <strong>In-app updates</strong> — replaces the native
                &ldquo;restart now&rdquo; dialog with this surface.
              </li>
            </ul>
          </div>

          {mode === "ready" ? (
            <div className="flex items-center gap-2">
              <button
                onClick={onApply}
                disabled={applying}
                className="flex-1 px-4 py-2.5 rounded-md bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {applying ? "Restarting…" : "Update now"}
              </button>
              <button
                onClick={onDismiss}
                className="px-4 py-2.5 rounded-md border border-[var(--rule)] text-sm hover:bg-[var(--rule)]/30"
              >
                Later
              </button>
            </div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 gap-2 mb-3">
                <a
                  href="/api/desktop-download/Drift-AI-mac-arm64.dmg"
                  className="block rounded-md border border-[var(--ink)] bg-[var(--ink)] text-[var(--canvas)] p-3 hover:opacity-90 transition"
                >
                  <div className="text-sm font-medium">Apple Silicon</div>
                  <div className="text-xs opacity-70 mt-0.5">
                    M1 / M2 / M3 / M4 · ~251 MB
                  </div>
                </a>
                <a
                  href="/api/desktop-download/Drift-AI-mac-x64.dmg"
                  className="block rounded-md border border-[var(--rule)] p-3 hover:bg-[var(--rule)]/30 transition"
                >
                  <div className="text-sm font-medium">Intel Mac</div>
                  <div className="text-xs text-[var(--ink-muted)] mt-0.5">
                    Intel processors · ~257 MB
                  </div>
                </a>
              </div>
              <div className="flex items-center justify-between">
                <a
                  href="https://github.com/MelinaSimp/drift-crm/releases/latest"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)]"
                >
                  View release notes →
                </a>
                <button
                  onClick={onDismiss}
                  className="text-xs px-3 py-1.5 rounded text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--rule)]/30"
                >
                  Dismiss
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
