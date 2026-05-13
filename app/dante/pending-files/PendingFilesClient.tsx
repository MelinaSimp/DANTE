"use client";

// app/dante/pending-files/PendingFilesClient.tsx
//
// Renderer-side UI for the watched-folders queue. In the Electron
// build this is also the engine: it subscribes to chokidar events
// from the main process and POSTs them to the notify API using the
// renderer's session cookies. In the web build it's a read-only
// view of pending files plus a "download the desktop app" prompt.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import UpdatePromptCard from "@/components/desktop/UpdatePromptCard";

type WatchedFolder = {
  id: string;
  kind: "local_electron" | "onedrive" | "google_drive" | "dropbox";
  device_id: string | null;
  device_label: string | null;
  folder_path: string;
  folder_label: string;
  allowed_extensions: string[];
  default_processing_mode: "cloud" | "local_only";
  status: "active" | "paused" | "deleted";
  files_indexed_count: number | null;
  last_seen_at: string | null;
  created_at: string;
};

type WatchedFile = {
  id: string;
  folder_id: string;
  file_path: string;
  file_name: string;
  file_extension: string | null;
  file_size_bytes: number | null;
  content_sha256: string | null;
  status: string;
  rejected_reason: string | null;
  vault_item_id: string | null;
  confirmed_at: string | null;
  created_at: string;
};

type FileEvent = {
  folder_id: string;
  file_path: string;
  file_name: string;
  file_extension: string;
  file_size_bytes: number | null;
  content_sha256: string | null;
  kind_of_event: "added" | "changed";
};

// Window.electronAPI and Window.driftLocal are declared globally in
// types/electron-api.d.ts so multiple components don't fight over
// the canonical shape.

export default function PendingFilesClient() {
  const [folders, setFolders] = useState<WatchedFolder[]>([]);
  const [files, setFiles] = useState<WatchedFile[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [isElectron, setIsElectron] = useState(false);
  const [hasBridge, setHasBridge] = useState(false);
  const [device, setDevice] = useState<{
    device_id: string;
    device_label: string;
  } | null>(null);
  const [ollama, setOllama] = useState<{
    reachable: boolean;
    hermes_pulled: boolean;
    models_available: string[];
  } | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const inFlightHashes = useRef<Set<string>>(new Set());

  // ─── Batch notify buffer ─────────────────────────────────────
  // Instead of POSTing one file at a time to /notify, we buffer
  // events and flush in batches. This cuts round-trip overhead
  // during bulk rescans (1000 files → ~10 POSTs instead of 1000).
  const notifyBuffer = useRef<Array<{ folderId: string; event: FileEvent }>>([]);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushNotifyBufferRef = useRef<(() => void) | null>(null);

  // ─── Ingestion progress ──────────────────────────────────────
  const [ingestProgress, setIngestProgress] = useState<{
    pending: number;
    running: number;
    completed: number;
    failed: number;
    dead: number;
    total: number;
    recent: Array<{
      vault_item_id: string;
      title: string;
      chunk_count: number;
      completed_at: string;
    }>;
  } | null>(null);

  // ─── Capability detection ────────────────────────────────────
  useEffect(() => {
    const e = window.electronAPI;
    setIsElectron(!!e?.isElectron);
    setHasBridge(!!e?.watched && !!e?.getDevice);
    if (e?.getDevice) {
      e.getDevice()
        .then(setDevice)
        .catch(() => {});
    }
    if (window.driftLocal?.probe) {
      window.driftLocal
        .probe()
        .then((p) =>
          setOllama({
            reachable: p.reachable,
            hermes_pulled: p.hermes_pulled,
            models_available: p.models_available,
          }),
        )
        .catch(() => {});
    }
  }, []);

  // ─── Folder loading ──────────────────────────────────────────
  const fetchFolders = useCallback(async () => {
    const r = await fetch("/api/electron/watched-folders", {
      credentials: "include",
    });
    if (!r.ok) return;
    const j = (await r.json()) as { folders: WatchedFolder[] };
    setFolders(j.folders || []);
    // Push the active set down to the chokidar watcher.
    if (window.electronAPI?.watched?.sync) {
      await window.electronAPI.watched.sync(j.folders || []);
    }
  }, []);

  // ─── File loading ────────────────────────────────────────────
  const fetchFiles = useCallback(async () => {
    if (folders.length === 0) {
      setFiles([]);
      return;
    }
    const targets = selectedFolderId
      ? folders.filter((f) => f.id === selectedFolderId)
      : folders;
    const all: WatchedFile[] = [];
    for (const f of targets) {
      const r = await fetch(
        `/api/electron/watched-folders/${f.id}/files?status=pending_user_confirm&limit=2000`,
        { credentials: "include" },
      );
      if (!r.ok) continue;
      const j = (await r.json()) as { files: WatchedFile[] };
      for (const x of j.files || []) all.push(x);
    }
    all.sort((a, b) => b.created_at.localeCompare(a.created_at));
    setFiles(all);
  }, [folders, selectedFolderId]);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  useEffect(() => {
    fetchFiles();
    const t = setInterval(fetchFiles, 10_000);
    return () => clearInterval(t);
  }, [fetchFiles]);

  // ─── Watcher event subscription ──────────────────────────────
  // Two paths fork on every file event:
  //   • The file_path already maps to a CONFIRMED watched file
  //     → auto-update path: extract text, hit /auto-update, server
  //     re-chunks in place. User isn't asked to re-approve.
  //   • Otherwise → notify path: buffer events and flush in batches
  //     to /notify-batch (falls back to single /notify on error).
  //
  // Concurrency: the previous version ran every fileEvent's
  // extract+post chain in parallel. For a 1000-file rescan that
  // queued ~1000 in-flight chains each holding ~200KB of extracted
  // text, blowing past the renderer's webview heap limit. The
  // window crashed (chromium killed the renderer process, leaving
  // BrowserWindow's #000000 background showing). Now we cap at
  // EVENT_CONCURRENCY simultaneous in-flight events — the rescan
  // takes longer but the renderer survives.
  useEffect(() => {
    if (!window.electronAPI?.watched?.onFileEvent) return;

    // Build a quick lookup of "file_path → vault_item_id" from the
    // current files state. We'd ideally hit the server for ground
    // truth but this is good enough for the dedup gate; the server
    // double-checks via the prior-confirmed lookup in /auto-update.
    const knownConfirmed = new Set(
      files
        .filter((f) => f.vault_item_id && f.status === "confirmed")
        .map((f) => `${f.folder_id}::${f.file_path}`),
    );

    const EVENT_CONCURRENCY = 20;
    const queue: FileEvent[] = [];
    let active = 0;
    let cancelled = false;
    let pendingFetchTimer: ReturnType<typeof setTimeout> | null = null;

    // Debounce the pending-list refetch so 1000 rapid events don't
    // produce 1000 GET /files calls. After the last enqueue settles,
    // wait 800ms then refetch once.
    const scheduleFetchFiles = () => {
      if (pendingFetchTimer) clearTimeout(pendingFetchTimer);
      pendingFetchTimer = setTimeout(() => {
        if (!cancelled) fetchFiles();
      }, 800);
    };

    // ── Batch notify flush ─────────────────────────────────────
    // Buffer notify events and flush in batches. This groups events
    // by folderId and POSTs to /notify-batch with up to 100 files
    // per request, cutting round-trip overhead during bulk rescans.
    const flushNotifyBuffer = async () => {
      if (flushTimer.current) {
        clearTimeout(flushTimer.current);
        flushTimer.current = null;
      }
      const items = notifyBuffer.current.splice(0);
      if (items.length === 0) return;

      // Group by folderId.
      const groups = new Map<string, typeof items>();
      for (const item of items) {
        let arr = groups.get(item.folderId);
        if (!arr) {
          arr = [];
          groups.set(item.folderId, arr);
        }
        arr.push(item);
      }

      const entries = Array.from(groups.entries());
      for (const [folderId, group] of entries) {
        // Cap at 100 files per POST; split into chunks if needed.
        for (let i = 0; i < group.length; i += 100) {
          const chunk = group.slice(i, i + 100);
          const payload = chunk.map((item) => ({
            file_path: item.event.file_path,
            file_name: item.event.file_name,
            file_extension: item.event.file_extension,
            file_size_bytes: item.event.file_size_bytes,
            content_sha256: item.event.content_sha256,
          }));

          try {
            const r = await fetch(
              `/api/electron/watched-folders/${folderId}/notify-batch`,
              {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ files: payload }),
              },
            );
            if (!r.ok) {
              // Batch endpoint failed — fall back to single-file notify
              // for each item in this chunk.
              console.warn(
                `[onFileEvent] batch notify failed (${r.status}), falling back to single-file`,
              );
              for (const item of chunk) {
                try {
                  await fetch(
                    `/api/electron/watched-folders/${folderId}/notify`,
                    {
                      method: "POST",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        file_path: item.event.file_path,
                        file_name: item.event.file_name,
                        file_extension: item.event.file_extension,
                        file_size_bytes: item.event.file_size_bytes,
                        content_sha256: item.event.content_sha256,
                      }),
                    },
                  );
                } catch (err) {
                  console.warn("[onFileEvent] single notify fallback failed:", err);
                }
              }
            }
          } catch (err) {
            console.warn("[onFileEvent] batch post failed:", err);
            // Network-level failure — try single-file fallback.
            for (const item of chunk) {
              try {
                await fetch(
                  `/api/electron/watched-folders/${folderId}/notify`,
                  {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      file_path: item.event.file_path,
                      file_name: item.event.file_name,
                      file_extension: item.event.file_extension,
                      file_size_bytes: item.event.file_size_bytes,
                      content_sha256: item.event.content_sha256,
                    }),
                  },
                );
              } catch {
                /* exhausted fallback */
              }
            }
          }
        }
      }

      scheduleFetchFiles();
    };

    // Expose flushNotifyBuffer to the ref so cleanup can call it.
    flushNotifyBufferRef.current = flushNotifyBuffer;

    const scheduleFlush = () => {
      // Flush immediately if buffer reaches 50 items.
      if (notifyBuffer.current.length >= 50) {
        flushNotifyBuffer();
        return;
      }
      // Otherwise set a 500ms debounce timer.
      if (!flushTimer.current) {
        flushTimer.current = setTimeout(() => {
          flushTimer.current = null;
          flushNotifyBuffer();
        }, 500);
      }
    };

    const processOne = async (event: FileEvent) => {
      const key =
        event.content_sha256 || `${event.folder_id}::${event.file_path}`;
      if (inFlightHashes.current.has(key)) return;
      inFlightHashes.current.add(key);
      try {
        const folder = folders.find((f) => f.id === event.folder_id);
        const isLocalOnly = folder?.default_processing_mode === "local_only";
        const folderConsent = (folder as any)?.confirm_mode === "folder_consent";
        const pathKey = `${event.folder_id}::${event.file_path}`;
        const isUpdate = knownConfirmed.has(pathKey);

        let extractedText: string | null = null;
        if (
          (!isLocalOnly || folderConsent) &&
          window.electronAPI?.watched?.extractFileText
        ) {
          try {
            const result = await window.electronAPI.watched.extractFileText(
              event.file_path,
              event.file_extension,
            );
            if (result && "text" in result && result.text) {
              extractedText = result.text;
            }
          } catch {
            /* fall through */
          }
        }

        if (isUpdate) {
          // Auto-update path: single POST, not batchable (needs extracted text).
          try {
            await fetch(
              `/api/electron/watched-folders/${event.folder_id}/files/auto-update`,
              {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  file_path: event.file_path,
                  file_size_bytes: event.file_size_bytes,
                  content_sha256: event.content_sha256,
                  extracted_text: extractedText,
                }),
              },
            );
          } catch (err) {
            console.warn("[onFileEvent] auto-update post failed:", err);
          }
          scheduleFetchFiles();
        } else {
          // Notify path: buffer for batch flush.
          notifyBuffer.current.push({ folderId: event.folder_id, event });
          scheduleFlush();
        }
      } finally {
        // Allow re-post on a real second change after some time.
        setTimeout(() => inFlightHashes.current.delete(key), 60_000);
      }
    };

    const drain = async () => {
      while (!cancelled && queue.length > 0 && active < EVENT_CONCURRENCY) {
        const next = queue.shift()!;
        active++;
        processOne(next).finally(() => {
          active--;
          if (!cancelled) drain();
        });
      }
    };

    const unsub = window.electronAPI.watched.onFileEvent((event) => {
      queue.push(event);
      drain();
    });

    return () => {
      cancelled = true;
      if (pendingFetchTimer) clearTimeout(pendingFetchTimer);
      if (flushTimer.current) clearTimeout(flushTimer.current);
      // Flush any remaining buffered events before teardown.
      if (notifyBuffer.current.length > 0 && flushNotifyBufferRef.current) {
        flushNotifyBufferRef.current();
      }
      try {
        unsub();
      } catch {
        /* ignore */
      }
    };
  }, [fetchFiles, files, folders]);

  // ─── Ingestion progress polling ───────────────────────────────
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const r = await fetch("/api/electron/watched-folders/ingest-progress", {
          credentials: "include",
        });
        if (!r.ok) return;
        const data = (await r.json()) as {
          pending: number;
          running: number;
          completed: number;
          failed: number;
          dead: number;
          total: number;
          recent: Array<{
            vault_item_id: string;
            title: string;
            chunk_count: number;
            completed_at: string;
          }>;
        };
        if (active) {
          setIngestProgress(data);
          // Keep polling while there's activity (pending or running files).
          if (data.pending + data.running > 0) {
            timer = setTimeout(poll, 3_000);
          } else {
            // Poll less frequently when idle — check every 15s in case
            // a rescan starts outside this component.
            timer = setTimeout(poll, 15_000);
          }
        }
      } catch {
        // Network error — retry after a longer delay.
        if (active) {
          timer = setTimeout(poll, 10_000);
        }
      }
    };

    poll();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // ─── Folder actions ──────────────────────────────────────────
  const pickAndAdd = useCallback(async () => {
    const e = window.electronAPI;
    // Diagnose silently-broken paths so the user sees something
    // when "Add folder" doesn't work, instead of nothing.
    if (!e?.watched?.pickFolder) {
      alert(
        "The folder picker isn't available. You're likely on Drift v1.0.x — install v1.1.2 (or newer) from the Update pill in the top-right.",
      );
      return;
    }
    if (!device) {
      // device loads asynchronously on mount via getDevice IPC.
      // If the user clicks Add Folder before that resolves we
      // have nothing to pass. Try one more time, fail loudly.
      try {
        const fresh = e.getDevice ? await e.getDevice() : null;
        if (!fresh) {
          alert(
            "Drift couldn't determine this device's identity. Quit and relaunch the app, then try again.",
          );
          return;
        }
        setDevice(fresh);
      } catch (err) {
        alert(
          `Couldn't load device identity: ${err instanceof Error ? err.message : "unknown"}.`,
        );
        return;
      }
    }
    let folderPath: string | undefined;
    try {
      const result = await e.watched.pickFolder();
      if (result.canceled) return;
      folderPath = result.folder_path;
    } catch (err) {
      console.error("[pending-files] pickFolder threw:", err);
      alert(
        `The folder picker errored: ${err instanceof Error ? err.message : "unknown"}.`,
      );
      return;
    }
    if (!folderPath) {
      const grant = confirm(
        "The folder picker closed without returning a path.\n\nThis usually means macOS hasn't granted Drift access to the folder you tried to pick (especially if it's in Documents, Desktop, Downloads, iCloud Drive, or an external volume).\n\nClick OK to open System Settings → Privacy & Security → Files and Folders, then enable Drift AI for the relevant categories.",
      );
      if (grant && e.openSystemSettings) {
        await e.openSystemSettings("files_and_folders");
      }
      return;
    }

    const dev = device || (e.getDevice ? await e.getDevice() : null);
    if (!dev) {
      alert("Device identity is still missing. Quit and relaunch Drift.");
      return;
    }

    try {
      const r = await fetch("/api/electron/watched-folders", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "local_electron",
          device_id: dev.device_id,
          device_label: dev.device_label,
          folder_path: folderPath,
        }),
      });
      if (!r.ok) {
        let detail = `${r.status}`;
        try {
          const err = (await r.json()) as { error?: string };
          detail = err.error || detail;
        } catch {
          /* not JSON */
        }
        alert(`Failed to register folder: ${detail}`);
        console.error("[pending-files] POST /api/electron/watched-folders failed:", detail);
        return;
      }
    } catch (err) {
      console.error("[pending-files] POST threw:", err);
      alert(
        `Network error registering folder: ${err instanceof Error ? err.message : "unknown"}.`,
      );
      return;
    }
    await fetchFolders();
  }, [device, fetchFolders]);

  const removeFolder = useCallback(
    async (id: string) => {
      if (!confirm("Stop watching this folder? Existing pending files stay queued.")) return;
      await fetch(`/api/electron/watched-folders/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      await fetchFolders();
    },
    [fetchFolders],
  );

  const [rescanning, setRescanning] = useState<string | null>(null);
  const rescanFolder = useCallback(
    async (folder: WatchedFolder) => {
      const api = window.electronAPI?.watched as
        | { rescan?: (f: unknown) => Promise<{ ok: boolean; scanned?: number; queued?: number; reason?: string }> }
        | undefined;
      if (!api?.rescan) {
        alert(
          "Rescan needs Drift v1.1.6+. Update via the pill in the top-right.",
        );
        return;
      }
      setRescanning(folder.id);
      try {
        const result = await api.rescan(folder);
        if (!result.ok) {
          alert(`Rescan failed: ${result.reason || "unknown"}`);
        } else {
          // Files arrive via the existing fileEvent stream; the
          // pending list will repopulate as notify POSTs land.
          // Give the queue a moment to settle before refresh.
          setTimeout(() => {
            fetchFolders();
            fetchFiles();
          }, 1500);
        }
      } finally {
        setRescanning(null);
      }
    },
    [fetchFolders, fetchFiles],
  );

  // ─── File actions ────────────────────────────────────────────
  const confirmFile = useCallback(
    async (file: WatchedFile) => {
      setBusy((b) => ({ ...b, [file.id]: true }));
      try {
        // Look up the folder to decide whether to extract text.
        const folder = folders.find((f) => f.id === file.folder_id);
        const isLocalOnly =
          folder?.default_processing_mode === "local_only";

        // For cloud folders, extract the file text in the main
        // process before posting confirm. The server saves it on
        // vault_items.content and runs the chunker so the file is
        // searchable immediately.
        let extractedText: string | null = null;
        if (
          !isLocalOnly &&
          window.electronAPI?.watched?.extractFileText &&
          file.file_extension
        ) {
          try {
            const result = await window.electronAPI.watched.extractFileText(
              file.file_path,
              file.file_extension,
            );
            if (result && "text" in result && result.text) {
              extractedText = result.text;
            }
          } catch {
            /* fall through — confirm proceeds, ingest can be retried */
          }
        }

        const r = await fetch(
          `/api/electron/watched-folders/${file.folder_id}/files/${file.id}/confirm`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ extracted_text: extractedText }),
          },
        );
        if (!r.ok) {
          const j = (await r.json()) as { error?: string };
          alert(`Confirm failed: ${j.error || r.status}`);
        }
        await fetchFiles();
      } finally {
        setBusy((b) => ({ ...b, [file.id]: false }));
      }
    },
    [fetchFiles, folders],
  );

  const [confirmingAll, setConfirmingAll] = useState<{ done: number; total: number } | null>(null);
  const confirmAll = useCallback(async () => {
    if (files.length === 0) return;
    if (
      !confirm(
        `Confirm ${files.length} pending file${files.length === 1 ? "" : "s"}? Each will be ingested into Vault and made searchable by Dante. This may take a few minutes for large folders.`,
      )
    ) {
      return;
    }
    setConfirmingAll({ done: 0, total: files.length });
    // Run in batches of 10 — confirm no longer waits for embeddings
    // (server queues ingest asynchronously), so we can push more.
    const queue = [...files];
    let done = 0;
    const BATCH = 10;
    while (queue.length > 0) {
      const batch = queue.splice(0, BATCH);
      await Promise.allSettled(batch.map((f) => confirmFile(f)));
      done += batch.length;
      setConfirmingAll({ done, total: files.length });
    }
    setConfirmingAll(null);
    await fetchFiles();
  }, [files, confirmFile, fetchFiles]);

  const rejectFile = useCallback(
    async (file: WatchedFile) => {
      const reason = prompt("Reason for rejecting? (optional)") || "";
      setBusy((b) => ({ ...b, [file.id]: true }));
      try {
        await fetch(
          `/api/electron/watched-folders/${file.folder_id}/files/${file.id}/reject`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason }),
          },
        );
        await fetchFiles();
      } finally {
        setBusy((b) => ({ ...b, [file.id]: false }));
      }
    },
    [fetchFiles],
  );

  // ─── Render ──────────────────────────────────────────────────
  const folderById = useMemo(
    () => Object.fromEntries(folders.map((f) => [f.id, f])),
    [folders],
  );

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-10">
        <div className="mono text-[11px] text-[var(--ink-muted)] mb-1 uppercase tracking-wide">
          Watched folders · ingest queue
        </div>
        <h1 className="heading-display text-4xl md:text-5xl text-[var(--ink)] leading-tight">
          Pending files
        </h1>
        <p className="text-sm text-[var(--ink-muted)] mt-3 max-w-2xl leading-relaxed">
          When Drift sees a new file in a folder you&rsquo;ve registered,
          it shows up here for your approval before being added to Vault.
          Folders marked local-only never send file content to Drift&rsquo;s
          servers — only filename and hash, for the audit trail.
        </p>
      </header>

      {!isElectron && (
        <div className="mb-8 border border-dashed border-[var(--rule)] rounded-md p-5 text-sm text-[var(--ink-muted)]">
          <strong className="text-[var(--ink)] block mb-1">
            Watched folders need the desktop app
          </strong>
          <p>
            The folder watcher runs in Drift&rsquo;s desktop app — the
            web app can&rsquo;t reach your filesystem. Install it from{" "}
            <a href="/download" className="text-[var(--accent)] hover:underline">
              /download
            </a>{" "}
            and reopen this page from there.
          </p>
        </div>
      )}

      {isElectron && !hasBridge && (
        <div className="mb-8">
          <UpdatePromptCard />
        </div>
      )}

      {isElectron && hasBridge && (
        <section className="mb-10">
          <div className="flex items-baseline justify-between mb-4 gap-3">
            <h2 className="heading-display text-xl text-[var(--ink)]">
              Folders
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  const api = window.electronAPI;
                  if (!api?.openSystemSettings) {
                    alert(
                      "This Drift version can't open System Settings directly. Open System Settings → Privacy & Security → Files and Folders → Drift AI manually.",
                    );
                    return;
                  }
                  await api.openSystemSettings("files_and_folders");
                }}
                className="mono text-[11px] uppercase tracking-wide text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
                title="Open System Settings → Privacy & Security → Files and Folders so you can grant Drift access to protected folders (Documents, Desktop, Downloads, iCloud Drive, external volumes)."
              >
                Grant access →
              </button>
              <button
                onClick={pickAndAdd}
                className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--ink)] bg-[var(--ink)] text-[var(--canvas)] px-4 py-2 text-sm font-medium transition hover:opacity-90 active:scale-[0.99]"
              >
                <span className="text-base leading-none">+</span> Add folder
              </button>
            </div>
          </div>
          {folders.length === 0 ? (
            <div className="text-sm text-[var(--ink-muted)] border border-dashed border-[var(--rule)] rounded-md p-8 text-center">
              No folders registered yet. Click &ldquo;Add folder&rdquo; to start.
            </div>
          ) : (
            <ul className="border border-[var(--rule)] rounded-md divide-y divide-[var(--rule)] bg-[var(--canvas)]">
              {folders.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between px-4 py-3.5 text-sm gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate text-[var(--ink)]">
                      {f.folder_label}
                    </div>
                    <div className="mono text-[11px] text-[var(--ink-muted)] truncate mt-0.5">
                      {f.folder_path}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 mono text-[10px] uppercase tracking-wide ${
                          f.default_processing_mode === "local_only"
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : "border-[var(--rule)] text-[var(--ink-muted)]"
                        }`}
                      >
                        {f.default_processing_mode === "local_only"
                          ? "Local-only"
                          : "Cloud"}
                      </span>
                      <span className="mono text-[11px] text-[var(--ink-muted)]">
                        {f.files_indexed_count ?? 0} ingested
                      </span>
                      <span className="mono text-[11px] text-[var(--ink-muted)]">
                        {f.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() =>
                        setSelectedFolderId((cur) => (cur === f.id ? null : f.id))
                      }
                      className={`rounded-[6px] border px-3 py-1.5 text-xs transition ${
                        selectedFolderId === f.id
                          ? "border-[var(--ink)] bg-[var(--rule)]/40"
                          : "border-[var(--rule)] hover:bg-[var(--rule)]/30"
                      }`}
                    >
                      {selectedFolderId === f.id ? "Showing" : "Filter"}
                    </button>
                    <button
                      onClick={() => rescanFolder(f)}
                      disabled={rescanning === f.id}
                      className="rounded-[6px] border border-[var(--rule)] px-3 py-1.5 text-xs hover:bg-[var(--rule)]/30 transition disabled:opacity-50"
                      title="Force a full recursive scan of this folder. Use if files are missing from the pending queue."
                    >
                      {rescanning === f.id ? "Scanning…" : "Rescan"}
                    </button>
                    <button
                      onClick={() => removeFolder(f.id)}
                      className="rounded-[6px] border border-[var(--rule)] px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {ollama && (
            <p className="mono text-[11px] text-[var(--ink-muted)] mt-3 uppercase tracking-wide">
              Local LLM ·{" "}
              {ollama.reachable ? "Reachable" : "Not reachable"}
              {ollama.reachable && ollama.hermes_pulled
                ? " · Hermes pulled"
                : ollama.reachable
                  ? " · Hermes not pulled — run `ollama pull hermes3:8b`"
                  : ""}
            </p>
          )}
        </section>
      )}

      {ingestProgress && ingestProgress.total > 0 && (
        <section className="mb-10">
          <h2 className="label-section text-[var(--ink-muted)] mb-3">
            Ingestion progress
          </h2>
          <div className="border border-[var(--rule)] rounded-md bg-[var(--canvas)] p-4">
            {/* Progress bar */}
            <div className="h-2 rounded-full bg-[var(--accent-soft)] overflow-hidden mb-3">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-all duration-500 ease-out"
                style={{
                  width: `${Math.round(((ingestProgress.completed + ingestProgress.failed + ingestProgress.dead) / ingestProgress.total) * 100)}%`,
                }}
              />
            </div>
            {/* Stats line */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="mono text-[12px] text-[var(--ink)]">
                {ingestProgress.completed} of {ingestProgress.total} files ingested
              </span>
              {ingestProgress.running > 0 && (
                <span className="mono text-[12px] text-[var(--accent)] animate-pulse">
                  Processing {ingestProgress.running}...
                </span>
              )}
              {ingestProgress.failed + ingestProgress.dead > 0 && (
                <span className="mono text-[12px] text-[var(--danger)]">
                  {ingestProgress.failed + ingestProgress.dead} failed
                </span>
              )}
            </div>
            {/* Recent completions */}
            {ingestProgress.recent && ingestProgress.recent.length > 0 && (
              <div className="mt-3 pt-3 border-t border-[var(--rule)]">
                <div className="mono text-[10px] text-[var(--ink-muted)] uppercase tracking-wide mb-2">
                  Recently ingested
                </div>
                <ul className="space-y-1">
                  {ingestProgress.recent.slice(0, 5).map((item) => (
                    <li
                      key={item.vault_item_id}
                      className="mono text-[11px] text-[var(--ink-muted)] truncate"
                    >
                      {item.title}
                      {item.chunk_count > 0 && (
                        <span className="text-[var(--ink-muted)]/60 ml-1">
                          ({item.chunk_count} chunks)
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-baseline justify-between mb-4 gap-3">
          <h2 className="heading-display text-xl text-[var(--ink)]">
            Pending {selectedFolderId ? "(filtered)" : ""}
          </h2>
          <div className="flex items-center gap-3">
            {confirmingAll && (
              <span className="mono text-[11px] text-[var(--ink-muted)] uppercase tracking-wide">
                Confirming {confirmingAll.done}/{confirmingAll.total}…
              </span>
            )}
            {files.length > 0 && !confirmingAll && (
              <button
                onClick={confirmAll}
                className="inline-flex items-center rounded-[6px] border border-[var(--ink)] bg-[var(--ink)] text-[var(--canvas)] px-3 py-1.5 text-xs font-medium hover:opacity-90 active:scale-[0.99] transition"
              >
                Confirm all ({files.length})
              </button>
            )}
            <button
              onClick={fetchFiles}
              className="mono text-[11px] text-[var(--ink-muted)] hover:text-[var(--ink)] uppercase tracking-wide"
            >
              Refresh
            </button>
          </div>
        </div>
        {files.length === 0 ? (
          <div className="text-sm text-[var(--ink-muted)] border border-dashed border-[var(--rule)] rounded-md p-8 text-center">
            All caught up — no files awaiting your approval.
          </div>
        ) : (
          <ul className="border border-[var(--rule)] rounded-md divide-y divide-[var(--rule)] bg-[var(--canvas)]">
            {files.map((file) => {
              const folder = folderById[file.folder_id];
              return (
                <li
                  key={file.id}
                  className="flex items-center justify-between px-4 py-3.5 text-sm gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate text-[var(--ink)]">
                      {file.file_name}
                    </div>
                    <div className="mono text-[11px] text-[var(--ink-muted)] truncate mt-0.5">
                      {folder?.folder_label || file.folder_id} ·{" "}
                      {file.file_extension || "no ext"} ·{" "}
                      {formatBytes(file.file_size_bytes)} ·{" "}
                      {timeAgo(file.created_at)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => rejectFile(file)}
                      disabled={busy[file.id]}
                      className="rounded-[6px] border border-[var(--rule)] px-3 py-1.5 text-sm hover:bg-[var(--rule)]/30 disabled:opacity-50 transition"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => confirmFile(file)}
                      disabled={busy[file.id]}
                      className="inline-flex items-center rounded-[6px] border border-[var(--ink)] bg-[var(--ink)] text-[var(--canvas)] px-4 py-1.5 text-sm font-medium hover:opacity-90 active:scale-[0.99] disabled:opacity-50 transition"
                    >
                      Confirm
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function formatBytes(b: number | null): string {
  if (b === null || b === undefined) return "?";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}
