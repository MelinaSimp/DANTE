"use client";

// components/desktop/UpdateBanner.tsx
//
// In-app update banner for the Drift desktop app. Replaces the
// native "Restart now" dialog box that fired blindly whenever
// electron-updater finished a download. The new flow:
//
//   1. App launches → main process auto-checks for updates and
//      auto-downloads in the background (autoDownload=true).
//   2. When status reaches 'downloaded', main process broadcasts
//      via IPC and this banner appears.
//   3. User clicks "Update now" → renderer calls apply() which
//      triggers quitAndInstall in the main process. App restarts
//      into the new version.
//
// In the web build (or in Electron versions that predate the
// updates IPC bridge), window.electronAPI.updates is undefined
// and this component renders nothing.

import { useCallback, useEffect, useState } from "react";
import type { UpdateState } from "@/types/electron-api";

const DISMISS_KEY = "drift.updateBanner.dismissedVersion";

export default function UpdateBanner() {
  const [state, setState] = useState<UpdateState | null>(null);
  const [applying, setApplying] = useState(false);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  useEffect(() => {
    setDismissedVersion(
      typeof window !== "undefined" ? localStorage.getItem(DISMISS_KEY) : null,
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

  // Render nothing unless an update is downloaded and ready.
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
