"use client";

import { useEffect, useRef } from "react";

/**
 * WatcherBridge — global component mounted in root layout that connects
 * the Electron main-process file watcher to the server API.
 *
 * Flow:
 *   1. Boot: fetch active watched_folders, tell Electron to start chokidar
 *   2. Subscribe to fileEvent IPC — when Electron detects a file, we
 *      extract text (if permitted) and POST to /notify
 *
 * The folder list is stored in a ref so the onFileEvent handler always
 * sees the latest set of folders — not a stale closure from boot time.
 * Re-syncing folders (e.g. when the user adds a new one) updates the ref.
 */
export default function WatcherBridge() {
  const syncedRef = useRef(false);
  // Keep the active folder list in a ref so the event handler always
  // sees the current set — not the stale closure from boot.
  const foldersRef = useRef<Array<{ id: string; default_processing_mode?: string | null }>>([]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.watched) {
      console.log("[WatcherBridge] not in Electron, skipping");
      return;
    }

    let unsubscribe: (() => void) | null = null;

    const boot = async () => {
      if (syncedRef.current) return;
      syncedRef.current = true;

      console.log("[WatcherBridge] booting...");

      try {
        const res = await fetch("/api/electron/watched-folders");
        if (!res.ok) {
          console.warn("[WatcherBridge] failed to fetch folders:", res.status);
          syncedRef.current = false;
          return;
        }
        const { folders } = await res.json();
        const active = (folders || []).filter(
          (f: { status: string }) => f.status === "active",
        );
        foldersRef.current = active;
        console.log(`[WatcherBridge] ${active.length} active folder(s)`);
        if (active.length === 0) {
          // Even with no folders now, subscribe to events so that
          // folders added later (via the watched-folders page) will
          // work once re-synced.
        }

        const syncResult = await api.watched!.sync(active);
        console.log("[WatcherBridge] sync result:", syncResult);

        unsubscribe = api.watched!.onFileEvent(async (event) => {
          console.log("[WatcherBridge] file event:", event.file_name, event.folder_id);

          // Look up folder in the LIVE ref, not a stale closure.
          const folder = foldersRef.current.find(
            (f) => f.id === event.folder_id,
          );

          // If the folder isn't in our list, re-fetch before giving up.
          // This handles the case where a folder was added after boot.
          if (!folder) {
            console.log("[WatcherBridge] folder not in cache, re-fetching...");
            try {
              const refreshRes = await fetch("/api/electron/watched-folders");
              if (refreshRes.ok) {
                const refreshData = await refreshRes.json();
                const refreshedActive = (refreshData.folders || []).filter(
                  (f: { status: string }) => f.status === "active",
                );
                foldersRef.current = refreshedActive;
              }
            } catch {
              // Ignore — we'll try the notify call anyway
            }
          }

          const resolvedFolder = foldersRef.current.find(
            (f) => f.id === event.folder_id,
          );

          // Extract text if not local_only mode
          let extractedText: string | undefined;
          if (
            resolvedFolder?.default_processing_mode !== "local_only" &&
            api.watched?.extractFileText
          ) {
            try {
              const result = await api.watched.extractFileText(
                event.file_path,
                event.file_extension,
              );
              if ("text" in result && result.text) {
                extractedText = result.text;
                console.log(`[WatcherBridge] extracted ${result.text.length} chars from ${event.file_name}`);
              }
            } catch (err) {
              console.warn("[WatcherBridge] extraction failed:", err);
            }
          }

          // Always forward to the server — even if we couldn't resolve
          // the folder locally. The server validates ownership and will
          // reject if the folder_id is invalid.
          try {
            const notifyRes = await fetch(
              `/api/electron/watched-folders/${event.folder_id}/notify`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  file_path: event.file_path,
                  file_name: event.file_name,
                  file_extension: event.file_extension,
                  file_size_bytes: event.file_size_bytes,
                  content_sha256: event.content_sha256,
                  extracted_text: extractedText,
                }),
              },
            );
            console.log(`[WatcherBridge] notify ${event.file_name}: ${notifyRes.status}`);
          } catch (err) {
            console.warn("[WatcherBridge] notify failed:", err);
          }
        });

        console.log("[WatcherBridge] listening for file events");
      } catch (err) {
        console.error("[WatcherBridge] boot failed:", err);
        syncedRef.current = false;
      }
    };

    boot();

    // Listen for re-sync signals from watched-folders page.
    // When the user adds a folder or clicks "Sync now", we refresh
    // the folder list so the event handler picks up new folders.
    const handleResync = async () => {
      try {
        const res = await fetch("/api/electron/watched-folders");
        if (res.ok) {
          const { folders } = await res.json();
          const active = (folders || []).filter(
            (f: { status: string }) => f.status === "active",
          );
          foldersRef.current = active;
          console.log(`[WatcherBridge] re-synced ${active.length} folder(s)`);
        }
      } catch {
        // Ignore
      }
    };
    window.addEventListener("drift:watched-folders-changed", handleResync);

    return () => {
      unsubscribe?.();
      window.removeEventListener("drift:watched-folders-changed", handleResync);
    };
  }, []);

  return null;
}
