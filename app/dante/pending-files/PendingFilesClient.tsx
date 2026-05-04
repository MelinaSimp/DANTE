"use client";

// app/dante/pending-files/PendingFilesClient.tsx
//
// Renderer-side UI for the watched-folders queue. In the Electron
// build this is also the engine: it subscribes to chokidar events
// from the main process and POSTs them to the notify API using the
// renderer's session cookies. In the web build it's a read-only
// view of pending files plus a "download the desktop app" prompt.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  useEffect(() => {
    if (!window.electronAPI?.watched?.onFileEvent) return;
    const unsub = window.electronAPI.watched.onFileEvent(async (event) => {
      // Dedup by sha256 so chokidar's occasional duplicate emit
      // doesn't double-post.
      const key = event.content_sha256 || `${event.folder_id}::${event.file_path}`;
      if (inFlightHashes.current.has(key)) return;
      inFlightHashes.current.add(key);
      try {
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
            }),
          },
        );
        await fetchFiles();
      } finally {
        // Allow re-post on a real second change after some time.
        setTimeout(() => inFlightHashes.current.delete(key), 60_000);
      }
    });
    return unsub;
  }, [fetchFiles]);

  // ─── Folder actions ──────────────────────────────────────────
  const pickAndAdd = useCallback(async () => {
    const e = window.electronAPI;
    if (!e?.watched?.pickFolder || !device) return;
    const { canceled, folder_path } = await e.watched.pickFolder();
    if (canceled || !folder_path) return;
    const r = await fetch("/api/electron/watched-folders", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "local_electron",
        device_id: device.device_id,
        device_label: device.device_label,
        folder_path,
      }),
    });
    if (!r.ok) {
      const err = (await r.json()) as { error?: string };
      alert(`Failed to add folder: ${err.error || r.status}`);
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
        const r = await fetch(
          `/api/electron/watched-folders/${file.folder_id}/files/${file.id}/confirm`,
          { method: "POST", credentials: "include" },
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
    [fetchFiles],
  );

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
      <header className="mb-8">
        <h1 className="heading-display text-3xl mb-2">Pending files</h1>
        <p className="text-sm text-[var(--ink-muted)] leading-relaxed max-w-2xl">
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
        <div className="mb-8 border border-amber-500/40 bg-amber-500/5 rounded-md p-5 text-sm">
          <strong className="text-[var(--ink)] block mb-1">
            Your desktop app needs to update
          </strong>
          <p className="text-[var(--ink-muted)] leading-relaxed">
            The watched-folders pipeline ships in Drift v1.1.0+. The
            version you&rsquo;re running doesn&rsquo;t expose the folder picker
            or chokidar bridge yet. Quit and relaunch Drift — the
            auto-updater will pick up v1.1.0 and the &ldquo;Update now&rdquo;
            banner will appear in the bottom-right.
          </p>
        </div>
      )}

      {isElectron && hasBridge && (
        <section className="mb-8">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="heading-display text-xl">Folders</h2>
            <button
              onClick={pickAndAdd}
              className="text-sm px-3 py-1.5 rounded-md bg-[var(--accent)] text-white hover:opacity-90"
            >
              + Add folder
            </button>
          </div>
          {folders.length === 0 ? (
            <div className="text-sm text-[var(--ink-muted)] border border-dashed border-[var(--rule)] rounded-md p-6 text-center">
              No folders registered yet. Click &ldquo;Add folder&rdquo; to start.
            </div>
          ) : (
            <ul className="border border-[var(--rule)] rounded-md divide-y divide-[var(--rule)]">
              {folders.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between px-4 py-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{f.folder_label}</div>
                    <div className="text-xs text-[var(--ink-muted)] truncate">
                      {f.folder_path}
                    </div>
                    <div className="text-xs text-[var(--ink-muted)] mt-1 flex gap-3">
                      <span>
                        {f.default_processing_mode === "local_only"
                          ? "Local-only"
                          : "Cloud-default"}
                      </span>
                      <span>
                        {f.files_indexed_count ?? 0} ingested
                      </span>
                      <span>{f.status}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        setSelectedFolderId((cur) => (cur === f.id ? null : f.id))
                      }
                      className={`text-xs px-2 py-1 rounded border border-[var(--rule)] hover:bg-[var(--rule)]/30 ${
                        selectedFolderId === f.id
                          ? "bg-[var(--rule)]/40"
                          : ""
                      }`}
                    >
                      {selectedFolderId === f.id ? "Showing" : "Filter"}
                    </button>
                    <button
                      onClick={() => removeFolder(f.id)}
                      className="text-xs px-2 py-1 rounded border border-[var(--rule)] text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {ollama && (
            <p className="text-xs text-[var(--ink-muted)] mt-3">
              Local LLM: {ollama.reachable ? "reachable" : "not reachable"}
              {ollama.reachable && ollama.hermes_pulled
                ? " · Hermes pulled"
                : ollama.reachable
                  ? " · Hermes not pulled (run `ollama pull hermes3:8b`)"
                  : ""}
            </p>
          )}
        </section>
      )}

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="heading-display text-xl">
            Pending {selectedFolderId ? "(filtered)" : ""}
          </h2>
          <button
            onClick={fetchFiles}
            className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)]"
          >
            Refresh
          </button>
        </div>
        {files.length === 0 ? (
          <div className="text-sm text-[var(--ink-muted)] border border-dashed border-[var(--rule)] rounded-md p-6 text-center">
            All caught up — no files awaiting your approval.
          </div>
        ) : (
          <ul className="border border-[var(--rule)] rounded-md divide-y divide-[var(--rule)]">
            {files.map((file) => {
              const folder = folderById[file.folder_id];
              return (
                <li
                  key={file.id}
                  className="flex items-center justify-between px-4 py-3 text-sm gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{file.file_name}</div>
                    <div className="text-xs text-[var(--ink-muted)] truncate">
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
                      className="text-xs px-3 py-1.5 rounded border border-[var(--rule)] hover:bg-[var(--rule)]/30 disabled:opacity-50"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => confirmFile(file)}
                      disabled={busy[file.id]}
                      className="text-xs px-3 py-1.5 rounded bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50"
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
