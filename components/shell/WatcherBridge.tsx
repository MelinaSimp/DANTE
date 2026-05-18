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
 * Events are queued and flushed in batches of up to BATCH_SIZE every
 * FLUSH_INTERVAL_MS. Text extraction is deferred -- we index metadata
 * first so the user sees progress, then extract on demand when the
 * agent or user requests file content.
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
  const syncedRef = useRef(false);
  const foldersRef = useRef<Array<{ id: string; default_processing_mode?: string | null }>>([]);
  const queueRef = useRef<FileEvent[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inflightRef = useRef(0);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.watched) {
      console.log("[WatcherBridge] not in Electron, skipping");
      return;
    }

    let unsubscribe: (() => void) | null = null;

    // ── Batch flush ─────────────────────────────────────────────
    const flushQueue = async () => {
      if (queueRef.current.length === 0) return;
      if (inflightRef.current >= MAX_CONCURRENT_BATCHES) return;

      // Grab up to BATCH_SIZE events grouped by folder_id
      const batch = queueRef.current.splice(0, BATCH_SIZE);
      if (batch.length === 0) return;

      // Group by folder_id for separate API calls
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
            // Re-queue failed events for retry
            queueRef.current.push(...events);
          })
          .finally(() => {
            inflightRef.current--;
          });
      }
    };

    // ── Boot ────────────────────────────────────────────────────
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

        const syncResult = await api.watched!.sync(active);
        console.log("[WatcherBridge] sync result:", syncResult);

        // Subscribe to file events -- queue them for batch flush
        unsubscribe = api.watched!.onFileEvent((event: FileEvent) => {
          queueRef.current.push(event);
          // If the queue is getting large, flush immediately
          if (queueRef.current.length >= BATCH_SIZE) {
            flushQueue();
          }
        });

        // Start periodic flush timer
        flushTimerRef.current = setInterval(flushQueue, FLUSH_INTERVAL_MS);

        console.log("[WatcherBridge] listening for file events (batched)");
      } catch (err) {
        console.error("[WatcherBridge] boot failed:", err);
        syncedRef.current = false;
      }
    };

    boot();

    // Listen for re-sync signals from watched-folders page
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
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
      // Flush remaining events on unmount
      flushQueue();
      window.removeEventListener("drift:watched-folders-changed", handleResync);
    };
  }, []);

  return null;
}
