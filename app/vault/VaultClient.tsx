"use client";

// VaultClient — list, filter, search, and upload. Mirrors the
// Properties list visual: filter chips at top (All / Templates /
// Documents), search box, drag-drop upload zone, table of items.
// Click a row → /vault/[id] for the detail/edit screen.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  Search,
  Upload,
  Loader2,
  AlertCircle,
  Sparkles,
  ScrollText,
} from "lucide-react";

interface VaultRow {
  id: string;
  kind: "template" | "document";
  title: string;
  description: string | null;
  file_url: string | null;
  file_size: number | null;
  file_type: string | null;
  property_id: string | null;
  created_at: string;
  updated_at: string;
}

const KIND_FILTERS = [
  { value: "all", label: "All" },
  { value: "template", label: "Templates" },
  { value: "document", label: "Documents" },
] as const;

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function VaultClient() {
  const router = useRouter();
  const [rows, setRows] = useState<VaultRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "template" | "document">("all");
  const [search, setSearch] = useState("");

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadKind, setUploadKind] =
    useState<"template" | "document">("document");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const load = () => {
    setRows(null);
    setError(null);
    fetch("/api/vault", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || "Failed to load");
        return r.json();
      })
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch((e) => setError(e.message));
  };

  useEffect(load, []);

  const filtered = useMemo(() => {
    if (!rows) return null;
    return rows.filter((r) => {
      if (filter !== "all" && r.kind !== filter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          r.title.toLowerCase().includes(q) ||
          (r.description || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [rows, filter, search]);

  const submitUpload = async () => {
    if (!pendingFile) {
      setError("Pick a file first");
      return;
    }
    if (!uploadTitle.trim()) {
      setError("Title required");
      return;
    }
    if (uploadKind === "template" && !uploadDescription.trim()) {
      setError(
        "Templates need a description so Vergil knows when to use this one"
      );
      return;
    }
    setUploading(true);
    setError(null);
    try {
      // 1) Upload the file via the existing /api/upload pipeline.
      const form = new FormData();
      form.append("file", pendingFile);
      form.append("category", "vault");
      const up = await fetch("/api/upload", { method: "POST", body: form });
      if (!up.ok) {
        const j = await up.json().catch(() => ({}));
        throw new Error(j.error || "Upload failed");
      }
      const u = await up.json();

      // 2) Create the vault row.
      const create = await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          kind: uploadKind,
          title: uploadTitle.trim(),
          description: uploadDescription.trim() || null,
          file_url: u.url,
          file_size: u.fileSize,
          file_type: u.fileType,
        }),
      });
      if (!create.ok) {
        const j = await create.json().catch(() => ({}));
        throw new Error(j.error || "Failed to add to vault");
      }
      const created = await create.json();
      setRows((prev) => (prev ? [created, ...prev] : [created]));
      setUploadOpen(false);
      setPendingFile(null);
      setUploadTitle("");
      setUploadDescription("");
    } catch (e: any) {
      setError(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      {/* Top bar */}
      <div className="sticky top-0 z-10 border-b border-[var(--rule)] bg-[var(--canvas)]/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm text-[var(--ink-muted)]">
            <Link href="/dashboard" className="hover:text-[var(--ink)] transition">
              Drift
            </Link>
            <span className="text-[var(--ink-subtle)]">/</span>
            <span className="text-[var(--ink)]">Vault</span>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
            Dashboard
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 md:px-10 py-10">
        <div className="flex items-baseline justify-between mb-8 gap-6 flex-wrap">
          <div>
            <div className="label-section mb-1">Workspace archive</div>
            <h1 className="heading-display text-4xl text-[var(--ink)]">Vault</h1>
            <p className="text-sm text-[var(--ink-muted)] mt-1 max-w-xl">
              Templates and documents your AI assistant can quote and fill out.
              Everyone in this workspace sees everything here.
            </p>
          </div>
          <button
            onClick={() => setUploadOpen((v) => !v)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-semibold hover:opacity-90 transition"
          >
            <Upload className="w-4 h-4" strokeWidth={1.5} />
            {uploadOpen ? "Cancel" : "Upload"}
          </button>
        </div>

        {/* Upload form */}
        {uploadOpen && (
          <section className="card-flat p-6 mb-8">
            <div className="grid md:grid-cols-3 gap-3 mb-4">
              <label className="block">
                <div className="text-xs font-medium text-[var(--ink-muted)] mb-1.5">
                  Type
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(["document", "template"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setUploadKind(k)}
                      className="text-sm px-3 py-2 transition"
                      style={{
                        border:
                          uploadKind === k
                            ? "1px solid var(--ink)"
                            : "1px solid var(--rule)",
                        background:
                          uploadKind === k
                            ? "var(--canvas-subtle)"
                            : "var(--canvas)",
                        color: "var(--ink)",
                        fontWeight: uploadKind === k ? 600 : 400,
                        borderRadius: "var(--r-input)",
                      }}
                    >
                      {k === "template" ? "Template" : "Document"}
                    </button>
                  ))}
                </div>
              </label>
              <label className="block md:col-span-2">
                <div className="text-xs font-medium text-[var(--ink-muted)] mb-1.5">
                  Title
                </div>
                <input
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder={
                    uploadKind === "template"
                      ? "e.g. Texas residential cash offer"
                      : "e.g. Smith pre-approval letter"
                  }
                  className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
                />
              </label>
            </div>
            <label className="block mb-4">
              <div className="text-xs font-medium text-[var(--ink-muted)] mb-1.5">
                {uploadKind === "template"
                  ? "Description (required) — what is this template for?"
                  : "Description (optional)"}
              </div>
              <textarea
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
                rows={3}
                placeholder={
                  uploadKind === "template"
                    ? "Use this for cash offers on residential listings in Texas. Includes seller-fills-title-fee clause."
                    : "Anything you want to remember about this doc."
                }
                className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)] resize-y"
              />
              {uploadKind === "template" && (
                <p className="text-[11px] text-[var(--ink-subtle)] mt-1.5">
                  Vergil reads this description to decide which template to
                  reach for when you ask it to draft something.
                </p>
              )}
            </label>

            {/* File picker / drop zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) setPendingFile(f);
              }}
              className={`rounded-[6px] border border-dashed p-6 text-center transition ${
                dragOver
                  ? "border-[var(--ink)] bg-[var(--canvas-subtle)]"
                  : "border-[var(--rule-strong)] bg-[var(--canvas)]"
              }`}
            >
              <input
                id="vault-upload-file"
                type="file"
                onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              <label
                htmlFor="vault-upload-file"
                className="cursor-pointer block"
              >
                <Upload
                  className="w-5 h-5 text-[var(--ink-muted)] mx-auto mb-2"
                  strokeWidth={1.5}
                />
                <div className="text-sm text-[var(--ink)] font-medium">
                  {pendingFile
                    ? pendingFile.name
                    : "Drop a file or click to choose"}
                </div>
                <div className="text-[11px] text-[var(--ink-subtle)] mt-1">
                  PDFs, Word, text. PDFs are text-extracted in the background.
                </div>
              </label>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={submitUpload}
                disabled={uploading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-semibold disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2
                    className="w-4 h-4 animate-spin"
                    strokeWidth={1.5}
                  />
                ) : (
                  <Upload className="w-4 h-4" strokeWidth={1.5} />
                )}
                {uploading ? "Uploading…" : "Add to vault"}
              </button>
            </div>
          </section>
        )}

        {error && (
          <div className="mb-4 px-3 py-2 text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger)]/30 rounded-[4px] flex items-center gap-2">
            <AlertCircle className="w-4 h-4" strokeWidth={1.5} /> {error}
          </div>
        )}

        {/* Filter chips + search */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <div className="flex items-center gap-1 p-0.5 rounded-[6px] border border-[var(--rule)] bg-[var(--canvas-subtle)]">
            {KIND_FILTERS.map((k) => (
              <button
                key={k.value}
                onClick={() => setFilter(k.value as any)}
                className="px-3 py-1.5 rounded-[4px] text-xs font-medium transition"
                style={{
                  background:
                    filter === k.value ? "var(--canvas)" : "transparent",
                  color:
                    filter === k.value ? "var(--ink)" : "var(--ink-muted)",
                  boxShadow:
                    filter === k.value
                      ? "0 1px 2px rgba(0,0,0,0.04)"
                      : "none",
                }}
              >
                {k.label}
              </button>
            ))}
          </div>
          <div className="flex-1 min-w-[200px] relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--ink-subtle)]"
              strokeWidth={1.5}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title or description…"
              className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] pl-9 pr-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
            />
          </div>
        </div>

        {filtered === null ? (
          <div className="flex items-center justify-center py-24">
            <Loader2
              className="w-6 h-6 animate-spin text-[var(--ink-subtle)]"
              strokeWidth={1.5}
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="card-flat py-16 text-center">
            <FileText
              className="w-8 h-8 text-[var(--ink-subtle)] mx-auto mb-3"
              strokeWidth={1.5}
            />
            <p className="text-sm text-[var(--ink-muted)] mb-4">
              {rows && rows.length > 0
                ? "No matches with this filter."
                : "No items in the vault yet — upload your first template or document."}
            </p>
            {!uploadOpen && (
              <button
                onClick={() => setUploadOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-semibold hover:opacity-90 transition"
              >
                <Upload className="w-4 h-4" strokeWidth={1.5} /> Upload
              </button>
            )}
          </div>
        ) : (
          <div className="card-flat overflow-hidden">
            <ul className="divide-y divide-[var(--rule)]">
              {filtered.map((r) => (
                <li
                  key={r.id}
                  onClick={() => router.push(`/vault/${r.id}`)}
                  className="py-4 px-6 flex items-center gap-4 hover:bg-[var(--canvas-subtle)] transition cursor-pointer"
                >
                  {r.kind === "template" ? (
                    <Sparkles
                      className="w-4 h-4 text-[var(--accent)] shrink-0"
                      strokeWidth={1.5}
                    />
                  ) : (
                    <ScrollText
                      className="w-4 h-4 text-[var(--ink-muted)] shrink-0"
                      strokeWidth={1.5}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-medium text-[var(--ink)] truncate">
                        {r.title}
                      </span>
                      <span className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)]">
                        {r.kind}
                      </span>
                    </div>
                    {r.description && (
                      <div className="text-[11px] text-[var(--ink-subtle)] truncate mt-0.5">
                        {r.description}
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] mono text-[var(--ink-subtle)] shrink-0">
                    {formatSize(r.file_size)}
                  </span>
                  <span className="text-[10px] mono text-[var(--ink-subtle)] shrink-0">
                    {new Date(r.updated_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
