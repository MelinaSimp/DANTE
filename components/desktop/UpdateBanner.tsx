"use client";

// components/desktop/UpdateBanner.tsx
//
// In-app update banner for the Drift desktop app. Two behaviors
// depending on which version the user is on:
//
//  • v1.1.0+ — the renderer has window.electronAPI.updates and
//    can talk to electron-updater. We listen for state changes,
//    and when an update finishes downloading we show the banner
//    with an "Update now" button that triggers quitAndInstall.
//
//  • v1.0.x (pre-bridge) — the renderer has window.electronAPI
//    but no updates namespace. We detect that gap directly,
//    treat it as "this app is provably out of date," and show a
//    banner pointing to the DMG download. User can also dismiss
//    per-version; the dismiss persists in localStorage so the
//    nudge doesn't keep reappearing on every page navigation.
//
// In the web build (no electronAPI at all) the component
// renders nothing — this is a desktop-only nudge.

import { useCallback, useEffect, useState } from "react";
import type { UpdateState } from "@/types/electron-api";

const DISMISS_KEY = "drift.updateBanner.dismissedVersion";
const PRE_BRIDGE_DISMISS_KEY = "drift.updateBanner.preBridgeDismissed";
// Version users are missing if they don't have window.electronAPI.updates.
const FIRST_BRIDGE_VERSION = "1.1.0";

export default function UpdateBanner() {
  const [state, setState] = useState<UpdateState | null>(null);
  const [applying, setApplying] = useState(false);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const [isElectron, setIsElectron] = useState(false);
  const [hasBridge, setHasBridge] = useState(false);
  const [preBridgeDismissed, setPreBridgeDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsElectron(!!window.electronAPI?.isElectron);
    setHasBridge(!!window.electronAPI?.updates);
    setDismissedVersion(localStorage.getItem(DISMISS_KEY));
    setPreBridgeDismissed(
      localStorage.getItem(PRE_BRIDGE_DISMISS_KEY) === FIRST_BRIDGE_VERSION,
    );
  }, []);

  useEffect(() => {
    const api = window.electronAPI?.updates;
    if (!api) return;

    // Hydrate immediately — banner shouldn't wait for the next
    // broadcast if main has already finished the download.
    api.getState().then(setState).catch(() => {});

    // Subscribe to live changes.
    const unsub = api.onState((next) => setState(next));

    // Force a fresh check on mount. The dashboard load is the
    // best proxy for "user just logged in"; checking here means
    // a returning user sees the banner during the same session
    // instead of waiting up to 4 hours for the next interval.
    api.check().catch(() => {});

    return () => {
      try {
        unsub();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const apply = useCallback(async () => {
    if (!window.electronAPI?.updates) return;
    setApplying(true);
    try {
      await window.electronAPI.updates.apply();
      // The app restarts; control flow won't return.
    } catch {
      setApplying(false);
    }
  }, []);

  const dismiss = useCallback(() => {
    if (state?.downloaded_version) {
      localStorage.setItem(DISMISS_KEY, state.downloaded_version);
      setDismissedVersion(state.downloaded_version);
    }
  }, [state?.downloaded_version]);

  const dismissPreBridge = useCallback(() => {
    localStorage.setItem(PRE_BRIDGE_DISMISS_KEY, FIRST_BRIDGE_VERSION);
    setPreBridgeDismissed(true);
  }, []);

  // ─── Pre-bridge case: user is in a v1.0.x Electron build that
  //     can't talk to the auto-updater the modern way. Surface a
  //     direct-download nudge instead. ─────────────────────────
  if (isElectron && !hasBridge && !preBridgeDismissed) {
    return (
      <div
        role="status"
        className="fixed bottom-4 right-4 z-[60] max-w-sm rounded-lg border border-amber-500/40 bg-[var(--canvas)] shadow-lg p-4 flex items-start gap-3"
      >
        <div className="mt-0.5 w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">
            Drift v{FIRST_BRIDGE_VERSION} is available
          </div>
          <div className="text-xs text-[var(--ink-muted)] mt-0.5 leading-snug">
            Adds local Hermes 3 chat, watched folders, and in-app updates.
            Auto-updater hasn&rsquo;t fired yet — install manually if
            you&rsquo;d like it now.
          </div>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <a
              href="/api/desktop-download/Drift-AI-mac-arm64.dmg"
              className="text-xs px-3 py-1.5 rounded bg-[var(--accent)] text-white hover:opacity-90"
            >
              Download (Apple Silicon)
            </a>
            <a
              href="/api/desktop-download/Drift-AI-mac-x64.dmg"
              className="text-xs px-3 py-1.5 rounded border border-[var(--rule)] hover:bg-[var(--rule)]/30"
            >
              Intel
            </a>
            <button
              onClick={dismissPreBridge}
              className="text-xs px-2 py-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)] ml-auto"
            >
              Later
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── v1.1.0+ case: render only when the auto-updater has a
  //     downloaded build ready and the user hasn't dismissed
  //     this specific version. ───────────────────────────────
  if (!state) return null;
  if (state.status !== "downloaded") return null;
  if (
    state.downloaded_version &&
    dismissedVersion === state.downloaded_version
  ) {
    return null;
  }

  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-[60] max-w-sm rounded-lg border border-[var(--rule)] bg-[var(--canvas)] shadow-lg p-4 flex items-start gap-3"
    >
      <div className="mt-0.5 w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">
          Drift {state.downloaded_version || ""} is ready
        </div>
        <div className="text-xs text-[var(--ink-muted)] mt-0.5 leading-snug">
          A new version has been downloaded. Restart to apply — this takes a
          few seconds.
        </div>
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={apply}
            disabled={applying}
            className="text-xs px-3 py-1.5 rounded bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50"
          >
            {applying ? "Restarting…" : "Update now"}
          </button>
          <button
            onClick={dismiss}
            className="text-xs px-3 py-1.5 rounded border border-[var(--rule)] hover:bg-[var(--rule)]/30"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
