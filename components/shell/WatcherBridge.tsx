"use client";

import { useEffect, useRef } from "react";

/**
 * WatcherBridge -- global component mounted in root layout that connects
 * the Electron main-process file watcher to the server API.
 *
 * Flow:
 *   1. Boot: fetch active watched_folders, tell Electron to start chokidar
 *   2. Subscribe to fileEvent IPC -- when Electron detects a file, queue
 *      it and POST in batches to /notify-batch
 *
 * Boot is retried on navigation and on "drift:watched-folders-changed"
 * events, so it survives the common case where the root layout mounts
 * before the user has signed in (the initial boot fails with 401, then
 * succeeds after auth completes and the dashboard loads).
 */

const BATCH_SIZE = 50;
const FLUSH_INTERVAL_MS = 2000;
const MAX_CONCURRENT_BATCHES = 3;

interface FileEvent {
  folder_id: string;
  file_path: string;
  file_name: string;
  file_extension: string;
  file_size_bytes: number | null;
  content_sha256: string | null;
  kind_of_event: string;
}

export default function WatcherBridge() {
  const bootedRef = useRef(false);
  const subscribedRef = useRef(false);
  const foldersRef = useRef<Array<{ id: string; default_processing_mode?: string | null }>>([]);
  const queueRef = useRef<FileEvent[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inflightRef = useRef(0);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.watched) {
      console.log("[WatcherBridge] not in Electron, skipping");
      return;
    }

    // ── Batch flush ─────────────────────────────────────────────
    const flushQueue = async () => {
      if (queueRef.current.length === 0) return;
      if (inflightRef.current >= MAX_CONCURRENT_BATCHES) return;

      const batch = queueRef.current.splice(0, BATCH_SIZE);
      if (batch.length === 0) return;

      // Group by folder_id
      const byFolder = new Map<string, FileEvent[]>();
      for (const evt of batch) {
        const arr = byFolder.get(evt.folder_id) || [];
        arr.push(evt);
        byFolder.set(evt.folder_id, arr);
      }

      for (const [folderId, events] of byFolder) {
        inflightRef.current++;
        fetch(`/api/electron/watched-folders/${folderId}/notify-batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            files: events.map((e) => ({
              file_path: e.file_path,
              file_name: e.file_name,
              file_extension: e.file_extension,
              file_size_bytes: e.file_size_bytes,
              content_sha256: e.content_sha256,
            })),
          }),
        })
          .then((res) => {
            console.log(
              `[WatcherBridge] batch notify ${events.length} files -> ${folderId}: ${res.status}`,
            );
          })
          .catch((err) => {
            console.warn("[WatcherBridge] batch notify failed:", err);
            // Re-queue for retry (but don't loop forever)
            if (events.length <= BATCH_SIZE) {
              queueRef.current.push(...events);
            }
          })
          .finally(() => {
            inflightRef.current--;
          });
      }
    };

    // ── Subscribe to IPC events (idempotent) ────────────────────
    const ensureSubscribed = () => {
      if (subscribedRef.current) return;
      subscribedRef.current = true;

      unsubRef.current = api.watched!.onFileEvent((event: FileEvent) => {
        queueRef.current.push(event);
        if (queueRef.current.length >= BATCH_SIZE) {
          flushQueue();
        }
      });

      // Start periodic flush
      if (!flushTimerRef.current) {
        flushTimerRef.current = setInterval(flushQueue, FLUSH_INTERVAL_MS);
      }

      console.log("[WatcherBridge] subscribed to file events (batched)");
    };

    // ── Boot (retryable) ────────────────────────────────────────
    const boot = async () => {
      if (bootedRef.current) return;

      console.log("[WatcherBridge] booting...");

      try {
        const res = await fetch("/api/electron/watched-folders");
        if (!res.ok) {
          console.warn("[WatcherBridge] fetch folders failed:", res.status, "- will retry");
          return; // Don't set bootedRef -- allow retry
        }
        const { folders } = await res.json();
        const active = (folders || []).filter(
          (f: { status: string }) => f.status === "active",
        );
        foldersRef.current = active;
        console.log(`[WatcherBridge] ${active.length} active folder(s)`);

        await api.watched!.sync(active);
        console.log("[WatcherBridge] sync complete");

        ensureSubscribed();
        bootedRef.current = true;
        console.log("[WatcherBridge] boot complete");
      } catch (err) {
        console.error("[WatcherBridge] boot failed:", err);
        // Don't set bootedRef -- allow retry
      }
    };

    // Initial boot attempt
    boot();

    // Retry boot on navigation (catches post-auth dashboard load)
    const retryOnFocus = () => {
      if (!bootedRef.current) boot();
    };
    window.addEventListener("focus", retryOnFocus);

    // Retry boot + refresh folders on sync signal from watched-folders page
    const handleResync = async () => {
      // If not booted yet, try now (user is definitely authed if
      // they're on the watched-folders page)
      if (!bootedRef.current) {
        await boot();
      }
      // Refresh folder list
      try {
        const res = await fetch("/api/electron/watched-folders");
        if (res.ok) {
          const { folders } = await res.json();
          const active = (folders || []).filter(
            (f: { status: string }) => f.status === "active",
          );
          foldersRef.current = active;

          // Ensure we're subscribed (in case boot succeeded just now)
          ensureSubscribed();

          // Re-sync watchers with latest folder list
          await api.watched!.sync(active);
          console.log(`[WatcherBridge] re-synced ${active.length} folder(s)`);
        }
      } catch {
        // Ignore
      }
    };
    window.addEventListener("drift:watched-folders-changed", handleResync);

    // Periodic boot retry (covers the case where the user signed in
    // but never triggered a focus or resync event)
    const retryTimer = setInterval(() => {
      if (!bootedRef.current) boot();
    }, 5000);

    return () => {
      unsubRef.current?.();
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
      clearInterval(retryTimer);
      flushQueue();
      window.removeEventListener("focus", retryOnFocus);
      window.removeEventListener("drift:watched-folders-changed", handleResync);
    };
  }, []);

  return null;
}
