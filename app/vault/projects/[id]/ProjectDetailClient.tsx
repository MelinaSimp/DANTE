"use client";

// ProjectDetailClient — Harvey-style project detail. Sticky header
// with project name + Upload + Delete. Body has the file list (cards
// grouped by kind). The "Loose files" virtual project (id='loose')
// reuses the same view but without project metadata or delete.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  FolderClosed,
  Folder,
  Upload,
  Loader2,
  Plus,
  X,
  AlertCircle,
  Sparkles,
  ScrollText,
  Search,
  Trash2,
  Pencil,
  Save,
  CheckCircle2,
  Table2,
} from "lucide-react";

interface VaultItem {
  id: string;
  kind: "template" | "document";
  title: string;
  description: string | null;
  file_url: string | null;
  file_size: number | null;
  file_type: string | null;
  created_at: string;
  updated_at: string;
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  items: VaultItem[];
}

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ProjectDetailClient({
  projectId,
}: {
  projectId: string;
}) {
  const router = useRouter();
  const isLoose = projectId === "loose";
  const [project, setProject] = useState<Project | null>(null);
  const [looseItems, setLooseItems] = useState<VaultItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Edit-name state (proper projects only)
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);

  // Upload modal state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadKind, setUploadKind] =
    useState<"template" | "document">("document");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    if (isLoose) {
      // Loose items — fetch /api/vault filtered to project_id=null.
      // The list endpoint doesn't have a "no project" filter built in,
      // so we just fetch everything and filter client-side. At the
      // workspace size we expect this is fine; tighten later if a
      // workspace ever has thousands of items.
      const r = await fetch("/api/vault", { credentials: "include" });
      if (!r.ok) {
        setError((await r.json()).error || "Failed");
        return;
      }
      const all = (await r.json()) as Array<VaultItem & { project_id?: string | null }>;
      setLooseItems(all.filter((i) => !i.project_id));
      return;
    }
    const r = await fetch(`/api/vault/projects/${projectId}`, {
      credentials: "include",
    });
    if (!r.ok) {
      setError((await r.json()).error || "Failed");
      return;
    }
    const p = await r.json();
    setProject(p);
    setNameDraft(p.name);
  }, [projectId, isLoose]);

  useEffect(() => {
    load();
  }, [load]);

  const items = isLoose ? looseItems ?? [] : project?.items ?? [];
  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        (i.description || "").toLowerCase().includes(q)
    );
  }, [items, search]);

  const templates = filteredItems.filter((i) => i.kind === "template");
  const documents = filteredItems.filter((i) => i.kind === "document");

  const saveName = async () => {
    if (!project || !nameDraft.trim() || nameDraft.trim() === project.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      const r = await fetch(`/api/vault/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: nameDraft.trim() }),
      });
      if (r.ok) {
        const updated = await r.json();
        setProject((p) => (p ? { ...p, name: updated.name } : p));
        setEditingName(false);
      }
    } finally {
      setSavingName(false);
    }
  };

  const deleteProject = async () => {
    if (isLoose) return;
    if (!confirm("Delete this project? Items inside become loose (not deleted).")) return;
    const r = await fetch(`/api/vault/projects/${projectId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (r.ok) router.push("/vault");
  };

  const submitUpload = async () => {
    if (!pendingFile) return setError("Pick a file first");
    if (!uploadTitle.trim()) return setError("Title required");
    if (uploadKind === "template" && !uploadDescription.trim()) {
      return setError(
        "Templates need a description so the assistant knows when to use them"
      );
    }
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", pendingFile);
      const up = await fetch("/api/vault/upload", { method: "POST", body: form });
      if (!up.ok) {
        const j = await up.json().catch(() => ({}));
        throw new Error(j.error || "Upload failed");
      }
      const u = await up.json();
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
          project_id: isLoose ? null : projectId,
        }),
      });
      if (!create.ok) {
        const j = await create.json().catch(() => ({}));
        throw new Error(j.error || "Failed to add to vault");
      }
      setUploadOpen(false);
      setPendingFile(null);
      setUploadTitle("");
      setUploadDescription("");
      load();
    } catch (e: any) {
      setError(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const inputClass =
    "w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none focus:border-[var(--rule-strong)]";

  // Card component reused for both template + document sections.
  const ItemCard = ({ row }: { row: VaultItem }) => {
    const isTemplate = row.kind === "template";
    const Icon = isTemplate ? Sparkles : ScrollText;
    return (
      <button
        onClick={() => router.push(`/vault/${row.id}`)}
        className="group text-left transition flex flex-col hover:border-[var(--rule-strong)]"
        style={{
          background: "var(--canvas)",
          border: "1px solid var(--rule)",
          borderRadius: "8px",
          minHeight: "170px",
        }}
      >
        <div
          className="flex items-center justify-center"
          style={{
            background: isTemplate ? "var(--accent-soft)" : "var(--canvas-subtle)",
            borderRadius: "8px 8px 0 0",
            height: "72px",
          }}
        >
          <Icon
            className={
              isTemplate
                ? "w-7 h-7 text-[var(--accent)]"
                : "w-7 h-7 text-[var(--ink-muted)]"
            }
            strokeWidth={1.25}
          />
        </div>
        <div className="flex-1 px-4 py-3 flex flex-col">
          <div className="text-sm font-semibold text-[var(--ink)] truncate mb-1">
            {row.title}
          </div>
          {row.description ? (
            <p className="text-[12px] text-[var(--ink-muted)] line-clamp-2 mb-2">
              {row.description}
            </p>
          ) : (
            <p className="text-[12px] text-[var(--ink-subtle)] italic mb-2">
              No description
            </p>
          )}
          <div className="mt-auto flex items-center gap-2 text-[10px] mono text-[var(--ink-subtle)]">
            <span>{isTemplate ? "Template" : "Document"}</span>
            {row.file_size ? <span>·</span> : null}
            {row.file_size ? <span>{formatSize(row.file_size)}</span> : null}
          </div>
        </div>
      </button>
    );
  };

  // Header values vary slightly between loose + real projects.
  const headerName = isLoose ? "Loose files" : project?.name ?? "";
  const headerDescription = isLoose
    ? "Items not yet placed in a project. Upload or move them somewhere they belong."
    : project?.description ?? "";

  if (!isLoose && !project && !error) {
    return (
      <div className="min-h-screen bg-[var(--canvas)] flex items-center justify-center">
        <Loader2
          className="w-6 h-6 animate-spin text-[var(--ink-subtle)]"
          strokeWidth={1.5}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <div className="sticky top-0 z-10 border-b border-[var(--rule)] bg-[var(--canvas)]/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 text-sm text-[var(--ink-muted)] min-w-0">
            <Link href="/dashboard" className="hover:text-[var(--ink)] transition">
              Drift
            </Link>
            <span className="text-[var(--ink-subtle)]">/</span>
            <Link href="/vault" className="hover:text-[var(--ink)] transition">
              Vault
            </Link>
            <span className="text-[var(--ink-subtle)]">/</span>
            <span className="text-[var(--ink)] truncate max-w-[300px]">
              {headerName}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setUploadOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-semibold hover:opacity-90 transition"
            >
              <Upload className="w-4 h-4" strokeWidth={1.5} />
              Upload
            </button>
            {!isLoose && (
              <button
                onClick={deleteProject}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[4px] border border-[var(--rule)] text-[var(--danger)] hover:bg-[var(--danger-soft)] text-xs font-medium transition"
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 md:px-10 py-8 md:py-10">
        {/* Project hero */}
        <div className="mb-8">
          <div className="flex items-start gap-4">
            <div
              className="flex items-center justify-center shrink-0"
              style={{
                width: 72,
                height: 72,
                background: "var(--canvas-subtle)",
                border: "1px solid var(--rule)",
                borderRadius: 8,
              }}
            >
              {isLoose ? (
                <Folder
                  className="w-9 h-9 text-[var(--ink-subtle)]"
                  strokeWidth={1.25}
                />
              ) : (
                <FolderClosed
                  className="w-9 h-9 text-[var(--ink-muted)]"
                  strokeWidth={1.25}
                />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="label-section mb-1">Project</div>
              {!isLoose && editingName ? (
                <div className="flex items-center gap-2 mb-1">
                  <input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveName();
                      if (e.key === "Escape") setEditingName(false);
                    }}
                    className="heading-display text-3xl md:text-4xl text-[var(--ink)] leading-[1.1] bg-transparent border-b border-[var(--rule-strong)] focus:outline-none focus:border-[var(--ink)] px-1 py-0.5 max-w-xl"
                    autoFocus
                  />
                  <button
                    onClick={saveName}
                    disabled={savingName}
                    className="p-1.5 rounded-[4px] text-[var(--verified)] hover:bg-[var(--verified-soft)] transition"
                  >
                    {savingName ? (
                      <Loader2
                        className="w-4 h-4 animate-spin"
                        strokeWidth={1.5}
                      />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" strokeWidth={1.5} />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setEditingName(false);
                      setNameDraft(project?.name ?? "");
                    }}
                    className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)] transition"
                  >
                    <X className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                </div>
              ) : (
                <div className="flex items-baseline gap-2 mb-1">
                  <h1 className="heading-display text-3xl md:text-4xl text-[var(--ink)] leading-[1.1]">
                    {headerName}
                  </h1>
                  {!isLoose && (
                    <button
                      onClick={() => setEditingName(true)}
                      className="opacity-0 hover:opacity-100 group-hover:opacity-100 p-1 rounded-[4px] text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)] transition"
                      title="Rename"
                    >
                      <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                  )}
                </div>
              )}
              <p className="text-sm text-[var(--ink-muted)] max-w-2xl">
                {headerDescription || (
                  <span className="text-[var(--ink-subtle)] italic">
                    No description
                  </span>
                )}
              </p>
              <div className="mt-2 flex items-center gap-3 text-[11px] mono text-[var(--ink-subtle)]">
                <span>{items.length} item{items.length === 1 ? "" : "s"}</span>
                <span>·</span>
                <span>
                  {documents.length} document{documents.length === 1 ? "" : "s"}
                </span>
                <span>·</span>
                <span>
                  {templates.length} template{templates.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Workflow CTAs — discovery for power features. Each links
            into the appropriate flow with this project pre-selected
            where possible. */}
        {!isLoose && items.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
            <Link
              href="/review-tables/new"
              className="group flex items-center gap-4 px-5 py-3.5 transition hover:border-[var(--rule-strong)]"
              style={{
                background: "var(--canvas)",
                border: "1px solid var(--rule)",
                borderRadius: "8px",
              }}
            >
              <div
                className="flex items-center justify-center shrink-0"
                style={{
                  width: 40,
                  height: 40,
                  background: "var(--accent-soft)",
                  borderRadius: 6,
                }}
              >
                <Table2
                  className="w-5 h-5 text-[var(--accent)]"
                  strokeWidth={1.5}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[var(--ink)]">
                  Create a review table
                </div>
                <div className="text-[11px] text-[var(--ink-muted)] truncate">
                  Extract structured fields across these documents.
                </div>
              </div>
            </Link>
            <Link
              href="/dante"
              className="group flex items-center gap-4 px-5 py-3.5 transition hover:border-[var(--rule-strong)]"
              style={{
                background: "var(--canvas)",
                border: "1px solid var(--rule)",
                borderRadius: "8px",
              }}
            >
              <div
                className="flex items-center justify-center shrink-0"
                style={{
                  width: 40,
                  height: 40,
                  background: "var(--canvas-subtle)",
                  borderRadius: 6,
                }}
              >
                <Sparkles
                  className="w-5 h-5 text-[var(--ink-muted)]"
                  strokeWidth={1.5}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[var(--ink)]">
                  Ask the assistant
                </div>
                <div className="text-[11px] text-[var(--ink-muted)] truncate">
                  Question across this project's documents.
                </div>
              </div>
            </Link>
          </div>
        )}

        {/* Search */}
        <div className="mb-6 max-w-md relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--ink-subtle)]"
            strokeWidth={1.5}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search this project"
            className={`${inputClass} pl-9`}
          />
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger)]/30 rounded-[4px] flex items-center gap-2">
            <AlertCircle className="w-4 h-4" strokeWidth={1.5} /> {error}
          </div>
        )}

        {items.length === 0 ? (
          <div className="py-16 text-center">
            <Folder
              className="w-10 h-10 text-[var(--ink-subtle)] mx-auto mb-3"
              strokeWidth={1}
            />
            <h2 className="heading-display text-xl text-[var(--ink)] mb-1.5">
              {isLoose ? "No loose files" : "Empty project"}
            </h2>
            <p className="text-sm text-[var(--ink-muted)] max-w-md mx-auto mb-4">
              {isLoose
                ? "Everything is filed away."
                : "Upload your first template or document into this project."}
            </p>
            {!isLoose && (
              <button
                onClick={() => setUploadOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-semibold hover:opacity-90 transition"
              >
                <Upload className="w-4 h-4" strokeWidth={1.5} />
                Upload
              </button>
            )}
          </div>
        ) : (
          <>
            {templates.length > 0 && (
              <section className="mb-10">
                <h2 className="heading-display text-xl text-[var(--ink)] mb-3">
                  Templates
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {templates.map((r) => (
                    <ItemCard key={r.id} row={r} />
                  ))}
                </div>
              </section>
            )}
            {documents.length > 0 && (
              <section className="mb-10">
                <h2 className="heading-display text-xl text-[var(--ink)] mb-3">
                  Documents
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {documents.map((r) => (
                    <ItemCard key={r.id} row={r} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* Upload modal — same shape as the previous Vault one but
          posts project_id with the create call. */}
      {uploadOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/30 backdrop-blur-sm px-4 py-8"
          onClick={(e) => {
            if (e.target === e.currentTarget) setUploadOpen(false);
          }}
        >
          <div className="bg-[var(--canvas)] border border-[var(--rule)] rounded-[8px] shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-[var(--rule)] flex items-center justify-between">
              <div>
                <div className="label-section mb-0.5">
                  Upload to {isLoose ? "(no project)" : headerName}
                </div>
                <h3 className="text-sm font-semibold text-[var(--ink)]">
                  {uploadKind === "template" ? "New template" : "New document"}
                </h3>
              </div>
              <button
                onClick={() => setUploadOpen(false)}
                className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)] transition"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {(["template", "document"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setUploadKind(k)}
                    className="text-left text-sm px-3 py-2.5 transition"
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
              <label className="block">
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
                  className={inputClass}
                />
              </label>
              <label className="block">
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
                      ? "Cash offers on residential listings in Texas. Includes seller-fills-title-fee clause."
                      : "Anything you want to remember about this doc."
                  }
                  className={`${inputClass} resize-y`}
                />
              </label>
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
            </div>
            <div className="px-6 py-4 border-t border-[var(--rule)] flex items-center gap-3">
              <button
                onClick={submitUpload}
                disabled={uploading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-semibold disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                ) : (
                  <Plus className="w-4 h-4" strokeWidth={1.5} />
                )}
                {uploading ? "Uploading…" : "Add to vault"}
              </button>
              <span className="text-[11px] text-[var(--ink-subtle)]">
                Esc to close.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
