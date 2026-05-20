"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Search,
  FileText,
  HardDrive,
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Download,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";

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

export default function FileIndexClient() {
  const [files, setFiles] = useState<IndexEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [ingesting, setIngesting] = useState<Set<string>>(new Set());
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchFiles = useCallback(async (q: string, p: number, status: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(PAGE_SIZE) });
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
  }, []);

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
      const res = await fetch(`/api/electron/watched-folders/file-index`, {
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

  // Content request fulfillment loop (Electron only)
  useEffect(() => {
    if (!window.electronAPI?.watched?.extractFileText) return;

    let cancelled = false;
    const poll = async () => {
      while (!cancelled) {
        try {
          const res = await fetch("/api/electron/watched-folders/content-requests");
          if (!res.ok) { await sleep(5000); continue; }
          const { requests } = (await res.json()) as { requests: ContentRequest[] };
          for (const cr of requests) {
            if (cancelled) break;
            try {
              const ext = cr.file_path.split(".").pop() || "";
              const result = await window.electronAPI!.watched!.extractFileText!(cr.file_path, ext);
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

    return () => { cancelled = true; };
  }, []);

  // Refresh file list periodically to pick up status changes
  useEffect(() => {
    const interval = setInterval(() => {
      const hasActive = files.some((f) =>
        f.ingest_status === "ingest_requested" || f.ingest_status === "ingesting",
      );
      if (hasActive) fetchFiles(query, page, statusFilter);
    }, 3000);
    return () => clearInterval(interval);
  }, [files, query, page, statusFilter, fetchFiles]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-8">
        <div className="text-xs uppercase tracking-wider text-[var(--ink-subtle)] mb-1">
          Watched Folders · File Index
        </div>
        <h1 className="text-3xl font-serif font-light text-[var(--ink)]">
          File Index
        </h1>
        <p className="text-sm text-[var(--ink-subtle)] mt-2 max-w-2xl">
          Every file on your connected servers, indexed by metadata. Files stay
          on your machine until you or Dante need them — then content is
          extracted on demand and ingested into the Vault.
        </p>
      </div>

      {/* Search + filters */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-subtle)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search files by name or path…"
            className="w-full pl-10 pr-4 py-2.5 border border-[var(--glass-border)] rounded-xl text-sm bg-[var(--canvas)] outline-none focus:border-[var(--accent)] placeholder:text-[var(--ink-subtle)]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="border border-[var(--glass-border)] rounded-xl px-3 py-2.5 text-sm bg-[var(--canvas)] outline-none"
        >
          <option value="">All statuses</option>
          <option value="indexed">Indexed only</option>
          <option value="ingested">Ingested</option>
          <option value="ingest_requested,ingesting">Ingesting…</option>
          <option value="ingest_failed">Failed</option>
        </select>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 mb-4 text-xs text-[var(--ink-subtle)]">
        <span>{total.toLocaleString()} files</span>
        {loading && <Loader2 className="w-3 h-3 animate-spin" />}
      </div>

      {/* File list */}
      <div className="border border-[var(--glass-border)] rounded-xl overflow-hidden">
        {files.length === 0 && !loading ? (
          <div className="px-6 py-12 text-center text-sm text-[var(--ink-subtle)]">
            {query ? "No files match your search." : "No indexed files yet. Register a folder with \"Index only\" mode to get started."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--glass-border)] text-left text-xs text-[var(--ink-subtle)] uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">File</th>
                <th className="px-4 py-3 font-medium w-24">Size</th>
                <th className="px-4 py-3 font-medium w-32">Status</th>
                <th className="px-4 py-3 font-medium w-28"></th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.id} className="border-b border-[var(--glass-border)] hover:bg-[var(--canvas-subtle)]/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-[var(--ink-subtle)] flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium text-[var(--ink)] truncate">{f.file_name}</div>
                        <div className="text-xs text-[var(--ink-subtle)] truncate">{f.file_path}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--ink-subtle)] text-xs">
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
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--glass)] border border-[var(--glass-border)] text-white hover:bg-[var(--canvas-muted)] disabled:opacity-50 transition"
                      >
                        {ingesting.has(f.id) ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Download className="w-3 h-3" />
                        )}
                        Ingest
                      </button>
                    )}
                    {f.ingest_status === "ingested" && f.vault_item_id && (
                      <a
                        href={`/vault?item=${f.vault_item_id}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--glass-hover)] transition"
                      >
                        View
                      </a>
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
        <div className="flex items-center justify-between mt-4 text-sm text-[var(--ink-subtle)]">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg hover:bg-[var(--glass-hover)] disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg hover:bg-[var(--glass-hover)] disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status, error }: { status: IndexEntry["ingest_status"]; error: string | null }) {
  switch (status) {
    case "indexed":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--glass-hover)] text-[var(--ink-muted)]">
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
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--accent-soft)] text-[var(--accent)]">
          <Loader2 className="w-3 h-3 animate-spin" />
          Ingesting
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
          title={error || "Ingest failed"}
        >
          <AlertCircle className="w-3 h-3" />
          Failed
        </span>
      );
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
