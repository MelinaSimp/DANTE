"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  FolderSync,
  FolderOpen,
  FileText,
  Search,
  HardDrive,
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Download,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  FolderPlus,
  Server,
  RefreshCw,
  Trash2,
  Activity,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────

interface WatchedFolder {
  id: string;
  kind: string;
  device_id: string | null;
  device_label: string | null;
  folder_path: string;
  folder_label: string;
  allowed_extensions: string[] | null;
  default_vault_project_id: string | null;
  default_processing_mode: string | null;
  status: string;
  created_at: string;
  last_seen_at: string | null;
  files_indexed_count: number | null;
}

interface IndexEntry {
  id: string;
  folder_id: string;
  file_path: string;
  file_name: string;
  file_extension: string | null;
  file_size_bytes: number | null;
  ingest_status: "indexed" | "ingest_requested" | "ingesting" | "ingested" | "ingest_failed";
  vault_item_id: string | null;
  ingest_error: string | null;
  first_seen_at: string;
  last_seen_at: string;
  ingested_at: string | null;
}

interface ContentRequest {
  id: string;
  file_path: string;
  index_entry_id: string;
  folder_id: string;
}

const PAGE_SIZE = 50;

// ── Main component ───────────────────────────────────────────────

export default function WatchedFoldersClient() {
  const [folders, setFolders] = useState<WatchedFolder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(true);
  const [selectedFolder, setSelectedFolder] = useState<WatchedFolder | null>(null);
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const isElectron = typeof window !== "undefined" && !!window.electronAPI?.watched?.pickFolder;

  const fetchFolders = useCallback(async () => {
    setLoadingFolders(true);
    try {
      const res = await fetch("/api/electron/watched-folders");
      if (!res.ok) return;
      const data = await res.json();
      setFolders(data.folders || []);
    } finally {
      setLoadingFolders(false);
    }
  }, []);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  const addFolder = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.watched?.pickFolder || !api?.getDevice) return;

    setAdding(true);
    try {
      const picked = await api.watched.pickFolder();
      if (picked.canceled || !picked.folder_path) return;

      const device = await api.getDevice();

      const res = await fetch("/api/electron/watched-folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "local_electron",
          device_id: device.device_id,
          device_label: device.device_label,
          folder_path: picked.folder_path,
        }),
      });

      if (res.ok) {
        await fetchFolders();
        // Sync watchers so Electron starts watching immediately
        if (api.watched.sync) {
          const refreshed = await fetch("/api/electron/watched-folders");
          if (refreshed.ok) {
            const data = await refreshed.json();
            const active = (data.folders || []).filter((f: WatchedFolder) => f.status === "active");
            await api.watched.sync(active);
          }
        }
        // Tell WatcherBridge to refresh its folder list
        window.dispatchEvent(new Event("drift:watched-folders-changed"));
      } else if (res.status === 409) {
        await fetchFolders();
      }
    } finally {
      setAdding(false);
    }
  }, [fetchFolders]);

  const syncNow = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.watched) return;

    setSyncing(true);
    try {
      // Fetch fresh folder list
      const res = await fetch("/api/electron/watched-folders");
      if (!res.ok) return;
      const data = await res.json();
      const active = (data.folders || []).filter((f: WatchedFolder) => f.status === "active");
      setFolders(data.folders || []);

      // Sync watchers (starts chokidar for any new folders)
      // Sync watchers (starts chokidar for any new folders)
      await api.watched.sync(active);

      // Tell WatcherBridge to refresh its folder list
      window.dispatchEvent(new Event("drift:watched-folders-changed"));

      // Fire rescans in background — don't await. The rescan walks
      // the entire directory tree and can take minutes for large
      // folders (TerraGroup has 6800+ files). WatcherBridge handles
      // the events as they stream in. We refresh the folder list
      // periodically so the user sees progress.
      for (const folder of active) {
        if (api.watched.rescan) {
          api.watched.rescan(folder).then((_result: { ok: boolean; scanned?: number; queued?: number }) => {
            fetchFolders();
          });
        }
      }

      // Brief pause then refresh — the rescan fires events in the
      // background; this first refresh shows whatever has landed.
      await new Promise((r) => setTimeout(r, 3000));
      await fetchFolders();
    } finally {
      setSyncing(false);
    }
  }, [fetchFolders]);

  if (selectedFolder) {
    return (
      <FolderDetail
        folder={selectedFolder}
        onBack={() => setSelectedFolder(null)}
      />
    );
  }

  return (
    <FolderList
      folders={folders}
      loading={loadingFolders}
      onSelect={setSelectedFolder}
      onAddFolder={isElectron ? addFolder : undefined}
      adding={adding}
      onSync={isElectron ? syncNow : undefined}
      syncing={syncing}
    />
  );
}

// ── Folder list ──────────────────────────────────────────────────

function FolderList({
  folders,
  loading,
  onSelect,
  onAddFolder,
  adding,
  onSync,
  syncing,
}: {
  folders: WatchedFolder[];
  loading: boolean;
  onSelect: (f: WatchedFolder) => void;
  onAddFolder?: () => void;
  adding?: boolean;
  onSync?: () => void;
  syncing?: boolean;
}) {
  const activeFolders = folders.filter((f) => f.status === "active");

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-8">
        <Link
          href="/home"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-subtle)] hover:text-[var(--ink-muted)] mb-3 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Dashboard
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif font-light text-gray-900">
              Watched Folders
            </h1>
            <p className="text-sm text-[var(--ink-muted)] mt-2 max-w-2xl">
              Folders connected from your file servers. Drift indexes filenames
              instantly and extracts content into the Vault on demand — when you
              or the agent need it.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 mt-1">
            {onSync && (
              <button
                onClick={onSync}
                disabled={syncing}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-[var(--neu-card)] text-[var(--ink-muted)] shadow-[var(--neu-shadow-raised)] border border-white/30 border-t-white/50 hover:bg-[var(--neu-active)] active:shadow-[var(--neu-shadow-pressed)] disabled:opacity-50 transition-all"
              >
                <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Syncing..." : "Sync now"}
              </button>
            )}
            {onAddFolder && (
              <button
                onClick={onAddFolder}
                disabled={adding}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-[var(--ink)] text-white shadow-[var(--neu-shadow-raised)] border border-white/10 hover:opacity-90 active:shadow-[var(--neu-shadow-pressed)] disabled:opacity-50 transition-all"
              >
                {adding ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FolderPlus className="w-4 h-4" />
                )}
                Add Folder
              </button>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-12 justify-center text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading folders...
        </div>
      ) : activeFolders.length === 0 ? (
        <EmptyState onAddFolder={onAddFolder} adding={adding} />
      ) : (
        <>
          <div className="space-y-3">
            {activeFolders.map((f) => (
              <FolderCard key={f.id} folder={f} onClick={() => onSelect(f)} />
            ))}
          </div>
          <RecentActivity folders={activeFolders} />
        </>
      )}
    </div>
  );
}

function EmptyState({
  onAddFolder,
  adding,
}: {
  onAddFolder?: () => void;
  adding?: boolean;
}) {
  return (
    <div className="glass-card border border-dashed border-black/[0.08] rounded-xl px-8 py-14 text-center">
      <FolderPlus className="w-8 h-8 text-[var(--ink-subtle)] mx-auto mb-4" />
      <h2 className="text-lg font-medium text-[var(--ink-muted)] mb-2">
        No folders connected
      </h2>
      <p className="text-sm text-[var(--ink-subtle)] max-w-md mx-auto mb-6">
        Connect a folder from a file server or local drive to let Drift index
        your documents. Files stay on your machine — Drift only pulls content
        when you or the agent need it.
      </p>
      {onAddFolder ? (
        <button
          onClick={onAddFolder}
          disabled={adding}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-[var(--ink)] text-white shadow-[var(--neu-shadow-raised)] border border-white/10 hover:opacity-90 active:shadow-[var(--neu-shadow-pressed)] disabled:opacity-50 transition-all"
        >
          {adding ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FolderPlus className="w-4 h-4" />
          )}
          Add Folder
        </button>
      ) : (
        <p className="text-xs text-[var(--ink-subtle)]">
          Open the Drift desktop app to add a watched folder, or use the{" "}
          <Link
            href="/settings"
            className="text-[var(--ink-muted)] hover:text-[var(--ink)] underline underline-offset-2 transition"
          >
            CLI watcher
          </Link>{" "}
          for headless file servers.
        </p>
      )}
    </div>
  );
}

function FolderCard({
  folder,
  onClick,
}: {
  folder: WatchedFolder;
  onClick: () => void;
}) {
  const fileCount = folder.files_indexed_count ?? 0;
  const lastSeen = folder.last_seen_at
    ? timeAgo(new Date(folder.last_seen_at))
    : "never";

  return (
    <button
      onClick={onClick}
      className="w-full text-left glass-card rounded-xl px-5 py-4 hover:shadow-[var(--neu-shadow-raised)] transition-all group"
    >
      <div className="flex items-start gap-4">
        <div className="mt-0.5 p-2 rounded-lg bg-[var(--neu-hover)] text-[var(--ink-subtle)] group-hover:bg-[var(--neu-active)] transition">
          <FolderOpen className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-medium text-[var(--ink)] truncate">
              {folder.folder_label}
            </span>
            {folder.device_label && (
              <span className="inline-flex items-center gap-1 text-[11px] text-[var(--ink-subtle)]">
                <Server className="w-3 h-3" />
                {folder.device_label}
              </span>
            )}
          </div>
          <div className="text-xs text-[var(--ink-subtle)] truncate mb-2">
            {folder.folder_path}
          </div>
          <div className="flex items-center gap-4 text-xs text-[var(--ink-muted)]">
            <span>{fileCount.toLocaleString()} file{fileCount === 1 ? "" : "s"} indexed</span>
            <span className="text-black/[0.12]">|</span>
            <span>Last synced {lastSeen}</span>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-[var(--ink-subtle)] mt-2 group-hover:text-[var(--ink-muted)] transition" />
      </div>
    </button>
  );
}

// ── Folder detail (file list) ────────────────────────────────────

function FolderDetail({
  folder,
  onBack,
}: {
  folder: WatchedFolder;
  onBack: () => void;
}) {
  const [files, setFiles] = useState<IndexEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [ingesting, setIngesting] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const [batchIngesting, setBatchIngesting] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchFiles = useCallback(
    async (q: string, p: number, status: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(p),
          limit: String(PAGE_SIZE),
          folder_id: folder.id,
        });
        if (q) params.set("q", q);
        if (status) params.set("status", status);
        const res = await fetch(`/api/electron/watched-folders/file-index?${params}`);
        if (!res.ok) return;
        const data = await res.json();
        setFiles(data.files || []);
        setTotal(data.total || 0);
      } finally {
        setLoading(false);
      }
    },
    [folder.id],
  );

  useEffect(() => {
    fetchFiles(query, page, statusFilter);
  }, [page, statusFilter, fetchFiles]);

  const onSearchChange = (value: string) => {
    setQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      fetchFiles(value, 1, statusFilter);
    }, 400);
  };

  const requestIngest = async (entry: IndexEntry) => {
    setIngesting((prev) => new Set(prev).add(entry.id));
    try {
      const res = await fetch("/api/electron/watched-folders/file-index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index_entry_id: entry.id }),
      });
      if (res.ok) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === entry.id ? { ...f, ingest_status: "ingest_requested" as const } : f,
          ),
        );
      }
    } finally {
      setIngesting((prev) => {
        const next = new Set(prev);
        next.delete(entry.id);
        return next;
      });
    }
  };

  const requestBatchIngest = async () => {
    const indexedFiles = files.filter((f) => f.ingest_status === "indexed");
    if (indexedFiles.length === 0) return;
    setBatchIngesting(true);
    try {
      for (const f of indexedFiles) {
        await fetch("/api/electron/watched-folders/file-index", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ index_entry_id: f.id }),
        });
      }
      setFiles((prev) =>
        prev.map((f) =>
          f.ingest_status === "indexed"
            ? { ...f, ingest_status: "ingest_requested" as const }
            : f,
        ),
      );
    } finally {
      setBatchIngesting(false);
    }
  };

  const removeFromVault = async (entry: IndexEntry) => {
    setRemoving((prev) => new Set(prev).add(entry.id));
    try {
      const res = await fetch("/api/electron/watched-folders/file-index", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index_entry_id: entry.id }),
      });
      if (res.ok) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === entry.id
              ? { ...f, ingest_status: "indexed" as const, vault_item_id: null, ingested_at: null }
              : f,
          ),
        );
      }
    } finally {
      setRemoving((prev) => {
        const next = new Set(prev);
        next.delete(entry.id);
        return next;
      });
    }
  };

  // Content request fulfillment loop (Electron only)
  useEffect(() => {
    if (!window.electronAPI?.watched?.extractFileText) return;

    let cancelled = false;
    const poll = async () => {
      while (!cancelled) {
        try {
          const res = await fetch("/api/electron/watched-folders/content-requests");
          if (!res.ok) {
            await sleep(5000);
            continue;
          }
          const { requests } = (await res.json()) as { requests: ContentRequest[] };
          for (const cr of requests) {
            if (cancelled) break;
            try {
              const ext = cr.file_path.split(".").pop() || "";
              const result = await window.electronAPI!.watched!.extractFileText!(
                cr.file_path,
                ext,
              );
              if (!result?.text) continue;
              await fetch("/api/electron/watched-folders/content-requests", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ request_id: cr.id, extracted_text: result.text }),
              });
            } catch (err) {
              console.warn("[content-request] fulfill failed:", err);
            }
          }
        } catch {
          // network error, retry
        }
        await sleep(5000);
      }
    };
    poll();

    return () => {
      cancelled = true;
    };
  }, []);

  // Refresh file list periodically to pick up status changes
  useEffect(() => {
    const interval = setInterval(() => {
      const hasActive = files.some(
        (f) => f.ingest_status === "ingest_requested" || f.ingest_status === "ingesting",
      );
      if (hasActive) fetchFiles(query, page, statusFilter);
    }, 3000);
    return () => clearInterval(interval);
  }, [files, query, page, statusFilter, fetchFiles]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const indexedCount = files.filter((f) => f.ingest_status === "indexed").length;
  const ingestedCount = files.filter((f) => f.ingest_status === "ingested").length;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-subtle)] hover:text-[var(--ink-muted)] mb-3 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Watched Folders
        </button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif font-light text-[var(--ink)]">
              {folder.folder_label}
            </h1>
            <p className="text-sm text-[var(--ink-subtle)] mt-1 truncate max-w-xl">
              {folder.folder_path}
            </p>
          </div>
          {indexedCount > 0 && (
            <button
              onClick={requestBatchIngest}
              disabled={batchIngesting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-[var(--ink)] text-white shadow-[var(--neu-shadow-raised)] border border-white/10 hover:opacity-90 active:shadow-[var(--neu-shadow-pressed)] disabled:opacity-50 transition-all flex-shrink-0"
            >
              {batchIngesting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              Extract all to Vault
            </button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 mb-6 text-xs text-[var(--ink-muted)]">
        <span>{total.toLocaleString()} file{total === 1 ? "" : "s"}</span>
        {ingestedCount > 0 && (
          <>
            <span className="text-black/[0.12]">|</span>
            <span className="text-emerald-600">
              {ingestedCount} in Vault
            </span>
          </>
        )}
        {loading && <Loader2 className="w-3 h-3 animate-spin" />}
      </div>

      {/* Search + filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-subtle)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search files by name or path..."
            className="glass-input w-full pl-10 pr-4 py-2.5 rounded-xl text-sm bg-[var(--neu-input)] border border-white/30 border-t-white/50 outline-none text-[var(--ink)] placeholder:text-[var(--ink-subtle)]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="glass-input rounded-xl px-3 py-2.5 text-sm bg-[var(--neu-input)] border border-white/30 border-t-white/50 outline-none text-[var(--ink)]"
        >
          <option value="">All statuses</option>
          <option value="indexed">Indexed only</option>
          <option value="ingested">In Vault</option>
          <option value="ingest_requested,ingesting">Extracting...</option>
          <option value="ingest_failed">Failed</option>
        </select>
      </div>

      {/* File list */}
      <div className="glass-card rounded-xl overflow-hidden">
        {files.length === 0 && !loading ? (
          <div className="px-6 py-12 text-center text-sm text-[var(--ink-subtle)]">
            {query
              ? "No files match your search."
              : "No files indexed in this folder yet. The watcher will populate this as it scans."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/[0.06] text-left text-xs text-[var(--ink-muted)] uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">File</th>
                <th className="px-4 py-3 font-medium w-24">Size</th>
                <th className="px-4 py-3 font-medium w-32">Status</th>
                <th className="px-4 py-3 font-medium w-28"></th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.id} className="border-b border-black/[0.04] hover:bg-[var(--neu-hover)]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-[var(--ink-subtle)] flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium text-[var(--ink)] truncate">
                          {f.file_name}
                        </div>
                        <div className="text-xs text-[var(--ink-subtle)] truncate">
                          {f.file_path}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--ink-muted)] text-xs">
                    {f.file_size_bytes ? formatBytes(f.file_size_bytes) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={f.ingest_status} error={f.ingest_error} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {f.ingest_status === "indexed" && (
                      <button
                        onClick={() => requestIngest(f)}
                        disabled={ingesting.has(f.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--ink)] text-white shadow-[var(--neu-shadow-card)] hover:opacity-90 disabled:opacity-50 transition-all"
                      >
                        {ingesting.has(f.id) ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Download className="w-3 h-3" />
                        )}
                        Extract
                      </button>
                    )}
                    {f.ingest_status === "ingested" && f.vault_item_id && (
                      <div className="flex items-center gap-1">
                        <a
                          href={`/vault?item=${f.vault_item_id}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--neu-hover)] transition"
                        >
                          View in Vault
                        </a>
                        <button
                          onClick={() => removeFromVault(f)}
                          disabled={removing.has(f.id)}
                          className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-[var(--ink-subtle)] hover:text-red-600 hover:bg-red-50 transition"
                          title="Remove from Vault"
                        >
                          {removing.has(f.id) ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Trash2 className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    )}
                    {f.ingest_status === "ingest_failed" && (
                      <button
                        onClick={() => requestIngest(f)}
                        disabled={ingesting.has(f.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-red-600 hover:bg-red-50 transition"
                      >
                        Retry
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-[var(--ink-muted)]">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg hover:bg-[var(--neu-hover)] disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg hover:bg-[var(--neu-hover)] disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Recent activity feed ─────────────────────────────────────────

function RecentActivity({ folders }: { folders: WatchedFolder[] }) {
  const [recentFiles, setRecentFiles] = useState<(IndexEntry & { folder_label?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<Set<string>>(new Set());

  const folderMap = new Map(folders.map((f) => [f.id, f.folder_label]));

  const fetchRecent = useCallback(async () => {
    try {
      const res = await fetch(
        "/api/electron/watched-folders/file-index?status=ingested&limit=20",
      );
      if (!res.ok) return;
      const data = await res.json();
      const files = (data.files || []).map((f: IndexEntry) => ({
        ...f,
        folder_label: folderMap.get(f.folder_id) || "Unknown folder",
      }));
      setRecentFiles(files);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folders]);

  useEffect(() => {
    if (folders.length > 0) fetchRecent();
  }, [fetchRecent, folders]);

  const removeFromVault = async (entry: IndexEntry) => {
    setRemoving((prev) => new Set(prev).add(entry.id));
    try {
      const res = await fetch("/api/electron/watched-folders/file-index", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index_entry_id: entry.id }),
      });
      if (res.ok) {
        setRecentFiles((prev) => prev.filter((f) => f.id !== entry.id));
      }
    } finally {
      setRemoving((prev) => {
        const next = new Set(prev);
        next.delete(entry.id);
        return next;
      });
    }
  };

  if (loading && folders.length > 0) {
    return (
      <div className="flex items-center gap-2 py-6 justify-center text-sm text-gray-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Loading recent activity...
      </div>
    );
  }

  if (recentFiles.length === 0) return null;

  return (
    <div className="mt-10">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-4 h-4 text-[var(--ink-subtle)]" />
        <h2 className="text-sm font-medium text-[var(--ink-muted)] uppercase tracking-wider">
          Recently Ingested
        </h2>
      </div>
      <div className="glass-card rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/[0.06] text-left text-xs text-[var(--ink-muted)] uppercase tracking-wider">
              <th className="px-4 py-3 font-medium">File</th>
              <th className="px-4 py-3 font-medium w-40">Folder</th>
              <th className="px-4 py-3 font-medium w-32">Ingested</th>
              <th className="px-4 py-3 font-medium w-28"></th>
            </tr>
          </thead>
          <tbody>
            {recentFiles.map((f) => (
              <tr key={f.id} className="border-b border-black/[0.04] hover:bg-[var(--neu-hover)]">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[var(--ink-subtle)] flex-shrink-0" />
                    <span className="font-medium text-[var(--ink)] truncate">{f.file_name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-[var(--ink-muted)] truncate">
                  {f.folder_label}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--ink-subtle)]">
                  {f.ingested_at ? timeAgo(new Date(f.ingested_at)) : "--"}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center gap-1 justify-end">
                    {f.vault_item_id && (
                      <a
                        href={`/vault?item=${f.vault_item_id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--neu-hover)] transition"
                      >
                        View
                      </a>
                    )}
                    <button
                      onClick={() => removeFromVault(f)}
                      disabled={removing.has(f.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-[var(--ink-subtle)] hover:text-red-600 hover:bg-red-50 transition"
                      title="Remove from Vault"
                    >
                      {removing.has(f.id) ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Trash2 className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Shared components ────────────────────────────────────────────

function StatusPill({
  status,
  error,
}: {
  status: IndexEntry["ingest_status"];
  error: string | null;
}) {
  switch (status) {
    case "indexed":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600">
          <HardDrive className="w-3 h-3" />
          Indexed
        </span>
      );
    case "ingest_requested":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700">
          <Clock className="w-3 h-3 animate-pulse" />
          Requested
        </span>
      );
    case "ingesting":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700">
          <Loader2 className="w-3 h-3 animate-spin" />
          Extracting
        </span>
      );
    case "ingested":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700">
          <CheckCircle2 className="w-3 h-3" />
          In Vault
        </span>
      );
    case "ingest_failed":
      return (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-50 text-red-700"
          title={error || "Extraction failed"}
        >
          <AlertCircle className="w-3 h-3" />
          Failed
        </span>
      );
  }
}

// ── Utilities ────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function timeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return "yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
