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
        `/api/electron/watched-folders/${f.id}/files?status=pending_user_confirm&limit=50`,
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
  //       re-chunks in place. User isn't asked to re-approve.
  //   • Otherwise → notify path: create a pending row for the user
  //     to confirm via the UI.
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

    const unsub = window.electronAPI.watched.onFileEvent(async (event) => {
      const key = event.content_sha256 || `${event.folder_id}::${event.file_path}`;
      if (inFlightHashes.current.has(key)) return;
      inFlightHashes.current.add(key);

      try {
        const folder = folders.find((f) => f.id === event.folder_id);
        const isLocalOnly =
          folder?.default_processing_mode === "local_only";
        const pathKey = `${event.folder_id}::${event.file_path}`;
        const isUpdate = knownConfirmed.has(pathKey);

        // Extract text only when (a) we're going to send it
        // somewhere AND (b) the folder isn't local_only. For
        // local_only folders we skip extraction entirely — bytes
        // never leave the machine.
        let extractedText: string | null = null;
        if (
          !isLocalOnly &&
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
            /* fall through — server still records the event */
          }
        }

        if (isUpdate) {
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
        } else {
          // Send extracted_text upfront so the server can auto-confirm
          // (cloud folders only — server ignores extracted_text for
          // local_only). For local_only folders extractedText is null
          // by design, server stays on pending path.
          await fetch(
            `/api/electron/watched-folders/${event.folder_id}/notify`,
            {
              method: "POST",
              credentials: "include",
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
        }
        await fetchFiles();
      } finally {
        setTimeout(() => inFlightHashes.current.delete(key), 60_000);
      }
    });
    return unsub;
  }, [fetchFiles, files, folders]);

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
    // Run in batches of 4 — embeddings are rate-limited; flooding
    // OpenAI tends to throttle the whole queue.
    const queue = [...files];
    let done = 0;
    const BATCH = 4;
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
