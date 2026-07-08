"use client";

// MarketKnowledgeCard — per-workspace reference knowledge that feeds
// into Dante's answers as ground truth.
//
// Two input modes:
//   1. Text notes — structured free-form reference text (facts, terms,
//      definitions, policies, and other context)
//   2. File uploads — PDFs, DOCX, XLSX, CSV of reference documents and
//      reports. Text is extracted server-side and injected into Dante
//      alongside the notes.
//
// All content feeds into Dante's system prompt as trusted context.

import { useEffect, useState, useCallback, useRef } from "react";
import {
  MapPin,
  Upload,
  FileText,
  X,
  Loader2,
  AlertCircle,
  FileSpreadsheet,
  File as FileIcon,
} from "lucide-react";
import TetrisLoading from "@/components/ui/tetris-loader";

// ── Types ────────────────────────────────────────────────────────

interface MarketFile {
  id: string;
  filename: string;
  file_size_bytes: number;
  mime_type: string | null;
  label: string | null;
  uploaded_at: string;
}

// ── Constants ────────────────────────────────────────────────────

const MAX_TEXT_LEN = 8000;
const MAX_FILE_SIZE_MB = 20;
const ACCEPTED_EXTENSIONS = ".pdf,.docx,.doc,.xlsx,.xls,.txt,.csv,.md";

const TEXT_PLACEHOLDER = `Reference knowledge that Dante uses as ground truth:

Products & pricing:
- Starter plan: $12/mo
- Pro plan: $29/mo
- Enterprise: custom pricing

Key facts:
- Support hours: 9am-6pm ET, Mon-Fri
- Standard refund window: 30 days
- Data is stored in US regions

Policies:
- Always cite the source document when answering
- Escalate billing disputes to the finance team
- Never share internal roadmap details externally

Common terms:
- "Workspace" = a single customer account
- "Seat" = one active user

Known gaps:
- No published SLA for the free tier
- Mobile app does not support offline mode yet`;

// ── Component ────────────────────────────────────────────────────

export default function MarketKnowledgeCard() {
  // Text state
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [loadingText, setLoadingText] = useState(true);
  const [savingText, setSavingText] = useState(false);
  const [textStatus, setTextStatus] = useState<string | null>(null);

  // File state
  const [files, setFiles] = useState<MarketFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Active tab
  const [tab, setTab] = useState<"notes" | "files">("notes");

  // Load text
  useEffect(() => {
    fetch("/api/workspace/market-context")
      .then((r) => r.json())
      .then((d) => {
        setContent(d.market_context || "");
        setSavedContent(d.market_context || "");
      })
      .finally(() => setLoadingText(false));
  }, []);

  // Load files
  useEffect(() => {
    fetch("/api/workspace/market-files")
      .then((r) => r.json())
      .then((d) => setFiles(d.files || []))
      .finally(() => setLoadingFiles(false));
  }, []);

  const isDirty = content !== savedContent;

  // Save text
  const saveText = useCallback(async () => {
    setSavingText(true);
    setTextStatus(null);
    try {
      const res = await fetch("/api/workspace/market-context", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ market_context: content }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setTextStatus(d.error || "Save failed");
      } else {
        setSavedContent(content);
        setTextStatus("Saved");
        setTimeout(() => setTextStatus(null), 2000);
      }
    } catch (e: any) {
      setTextStatus(e?.message || "Save failed");
    } finally {
      setSavingText(false);
    }
  }, [content]);

  // Upload file
  const uploadFile = useCallback(async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/workspace/market-files", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error || "Upload failed");
        return;
      }
      // Refresh file list
      const listRes = await fetch("/api/workspace/market-files");
      const listData = await listRes.json();
      setFiles(listData.files || []);
    } catch (e: any) {
      setUploadError(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }, []);

  // Delete file
  const deleteFile = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      await fetch("/api/workspace/market-files", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setFiles((prev) => prev.filter((f) => f.id !== id));
    } finally {
      setDeletingId(null);
    }
  }, []);

  // Drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };
  const handleDragLeave = () => setDragOver(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) uploadFile(droppedFile);
  };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) uploadFile(selected);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  if (loadingText && loadingFiles) {
    return (
      <div className="flex items-center justify-center py-8">
        <TetrisLoading size="sm" speed="fast" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-md border border-[var(--rule)] bg-[var(--canvas-subtle)] p-4">
        <div className="flex items-center gap-2 mb-2">
          <MapPin className="w-4 h-4 text-[var(--ink-muted)]" strokeWidth={1.5} />
          <div className="text-xs uppercase tracking-wide text-[var(--ink-subtle)]">
            Workspace Knowledge
          </div>
        </div>
        <div className="text-sm text-[var(--ink)] leading-relaxed">
          Reference notes and documents that Dante treats as ground truth when
          answering. Upload reference PDFs and reports, or type notes directly.
          Different for every workspace.
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--rule)]">
        <button
          onClick={() => setTab("notes")}
          className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px ${
            tab === "notes"
              ? "border-[var(--accent)] text-[var(--accent)]"
              : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]"
          }`}
        >
          Notes
        </button>
        <button
          onClick={() => setTab("files")}
          className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px flex items-center gap-1.5 ${
            tab === "files"
              ? "border-[var(--accent)] text-[var(--accent)]"
              : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]"
          }`}
        >
          Files
          {files.length > 0 && (
            <span className="text-[10px] bg-[var(--canvas-subtle)] text-[var(--ink-muted)] px-1.5 py-0.5 rounded-full">
              {files.length}
            </span>
          )}
        </button>
      </div>

      {/* Notes tab */}
      {tab === "notes" && (
        <div className="space-y-4">
          <div className="rounded-md border border-[var(--rule)] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--rule)] bg-[var(--canvas-subtle)]">
              <span className="text-xs text-[var(--ink-muted)]">
                {content.length.toLocaleString()} / {MAX_TEXT_LEN.toLocaleString()} characters
              </span>
              {isDirty && (
                <span className="text-[10px] mono uppercase tracking-wider text-amber-600">
                  Unsaved changes
                </span>
              )}
            </div>
            <textarea
              value={content}
              onChange={(e) => {
                if (e.target.value.length <= MAX_TEXT_LEN) {
                  setContent(e.target.value);
                }
              }}
              placeholder={TEXT_PLACEHOLDER}
              rows={18}
              className="w-full px-4 py-3 bg-[var(--canvas)] text-[var(--ink)] text-sm font-mono leading-relaxed resize-y focus:outline-none placeholder:text-[var(--ink-subtle)]/40"
              spellCheck={false}
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={saveText}
              disabled={savingText || !isDirty}
              className="px-4 py-2 text-sm rounded-md bg-[var(--accent)] text-white hover:opacity-90 transition disabled:opacity-50"
            >
              {savingText ? "Saving..." : "Save changes"}
            </button>
            {isDirty && (
              <button
                onClick={() => setContent(savedContent)}
                disabled={savingText}
                className="px-4 py-2 text-sm rounded-md border border-[var(--rule)] text-[var(--ink-muted)] hover:text-[var(--ink)] transition disabled:opacity-50"
              >
                Discard
              </button>
            )}
            {textStatus && (
              <span className={`text-xs ${textStatus === "Saved" ? "text-green-600" : "text-red-600"}`}>
                {textStatus}
              </span>
            )}
          </div>

          {/* Guidance */}
          <div className="grid grid-cols-2 gap-3">
            <GuidanceCard
              title="Products & pricing"
              items={[
                "Plans and price points",
                "What's included in each tier",
                "Discounts and terms",
              ]}
            />
            <GuidanceCard
              title="Policies"
              items={[
                "Support and SLAs",
                "Refunds and billing rules",
                "Do's and don'ts for answers",
              ]}
            />
            <GuidanceCard
              title="Key facts"
              items={[
                "Definitions and terminology",
                "Hours and contact points",
                "Important dates and limits",
              ]}
            />
            <GuidanceCard
              title="Context & nuances"
              items={[
                "Edge cases to watch for",
                "Common misconceptions",
                "Known gaps / open questions",
              ]}
            />
          </div>
        </div>
      )}

      {/* Files tab */}
      {tab === "files" && (
        <div className="space-y-4">
          {/* Drop zone */}
          <div
            ref={dropRef}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition ${
              dragOver
                ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                : "border-[var(--rule)] hover:border-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)]"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              onChange={handleFileSelect}
              className="hidden"
            />
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-6 h-6 text-[var(--accent)] animate-spin" />
                <span className="text-sm text-[var(--ink-muted)]">
                  Uploading and extracting text...
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-6 h-6 text-[var(--ink-muted)]" strokeWidth={1.5} />
                <div className="text-sm text-[var(--ink)]">
                  Drop files here or click to browse
                </div>
                <div className="text-xs text-[var(--ink-subtle)]">
                  PDF, DOCX, XLSX, CSV, TXT -- up to {MAX_FILE_SIZE_MB}MB
                </div>
              </div>
            )}
          </div>

          {uploadError && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-50 border border-red-200 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {uploadError}
              <button onClick={() => setUploadError(null)} className="ml-auto">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* File list */}
          {files.length === 0 && !loadingFiles ? (
            <div className="text-center py-8 text-sm text-[var(--ink-muted)]">
              No files uploaded yet. Upload reference PDFs, reports, or any
              documents Dante should treat as ground truth.
            </div>
          ) : (
            <div className="rounded-md border border-[var(--rule)] divide-y divide-[var(--rule)]">
              {files.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--canvas-subtle)] transition"
                >
                  <FileTypeIcon mime={f.mime_type} filename={f.filename} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[var(--ink)] truncate">
                      {f.label || f.filename}
                    </div>
                    <div className="text-xs text-[var(--ink-muted)] flex items-center gap-2">
                      {f.label && (
                        <span className="truncate max-w-[200px]">{f.filename}</span>
                      )}
                      <span>{formatFileSize(f.file_size_bytes)}</span>
                      <span>{formatDate(f.uploaded_at)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => deleteFile(f.id)}
                    disabled={deletingId === f.id}
                    className="p-1.5 rounded text-[var(--ink-subtle)] hover:text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                    title="Remove file"
                  >
                    {deletingId === f.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <X className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Info */}
          <div className="text-xs text-[var(--ink-subtle)] leading-relaxed">
            Text is automatically extracted from uploaded files and fed to Dante
            during analysis. PDFs with scanned images may not extract well --
            use text-based PDFs or DOCX for best results.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────

function GuidanceCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border border-[var(--rule)]/50 p-3">
      <div className="text-xs font-medium text-[var(--ink)] mb-1.5">{title}</div>
      <ul className="space-y-0.5">
        {items.map((item, i) => (
          <li key={i} className="text-[11px] text-[var(--ink-muted)] leading-relaxed">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FileTypeIcon({ mime, filename }: { mime: string | null; filename: string }) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (mime === "application/pdf" || ext === "pdf") {
    return <FileText className="w-5 h-5 text-red-500 flex-shrink-0" strokeWidth={1.5} />;
  }
  if (ext === "xlsx" || ext === "xls" || ext === "csv") {
    return <FileSpreadsheet className="w-5 h-5 text-green-600 flex-shrink-0" strokeWidth={1.5} />;
  }
  return <FileIcon className="w-5 h-5 text-[var(--ink-muted)] flex-shrink-0" strokeWidth={1.5} />;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}
