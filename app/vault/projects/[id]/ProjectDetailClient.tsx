"use client";

// ProjectDetailClient — Harvey-style project detail. The body is a
// TABLE of files (not a card grid) so the project reads as a
// structured corpus you can scan, sort, and select. Red PDF icons,
// numbered rows, checkbox column, and an "+ Add column" header
// affordance for triggering review-table-style extraction inline.
//
// Header keeps Upload + Delete actions on the right. The "Loose
// files" virtual project (id='loose') reuses the same view without
// project metadata.

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
  Search,
  Trash2,
  Pencil,
  Save,
  CheckCircle2,
  Table2,
  FileText,
  FileImage,
  FileType,
  File as FileIcon,
  Users,
  UserPlus,
  UserMinus,
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
  total_items?: number;
}

interface IndexedFile {
  id: string;
  file_name: string;
  file_path: string;
  file_extension: string;
  file_size_bytes: number | null;
  ingest_status: string;
  created_at: string;
}

function formatSize(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelative(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}

// Pick an icon + tint based on file_type. Mirrors Harvey's red PDF
// glyph — PDFs are the dominant type in this domain so they get the
// distinctive red treatment; everything else gets a muted gray.
function FileTypeIcon({
  fileType,
  fileName,
  className = "w-4 h-4",
}: {
  fileType: string | null;
  fileName: string;
  className?: string;
}) {
  const lower = (fileType || "").toLowerCase();
  const ext = fileName.toLowerCase().split(".").pop() || "";

  if (lower.includes("pdf") || ext === "pdf") {
    return (
      <FileText
        className={`${className} text-[#D93025] shrink-0`}
        strokeWidth={1.5}
      />
    );
  }
  if (lower.includes("word") || ext === "doc" || ext === "docx") {
    return (
      <FileType
        className={`${className} text-[#2A5BD7] shrink-0`}
        strokeWidth={1.5}
      />
    );
  }
  if (lower.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) {
    return (
      <FileImage
        className={`${className} text-[var(--ink-muted)] shrink-0`}
        strokeWidth={1.5}
      />
    );
  }
  return (
    <FileIcon
      className={`${className} text-[var(--ink-muted)] shrink-0`}
      strokeWidth={1.5}
    />
  );
}

// Type chip for the "Type" column. Templates get an accent pill,
// documents get a muted one.
function KindBadge({ kind }: { kind: "template" | "document" }) {
  if (kind === "template") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border border-[var(--accent)]/30 text-[var(--accent)] bg-[var(--accent-soft)]">
        <Sparkles className="w-2.5 h-2.5" strokeWidth={1.75} />
        Template
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border border-[var(--rule)] text-[var(--ink-muted)] bg-[var(--canvas-subtle)]">
      Document
    </span>
  );
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<"vault" | "indexed" | "members">("vault");
  const [indexedFiles, setIndexedFiles] = useState<IndexedFile[] | null>(null);
  const [indexedCount, setIndexedCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  // Edit-name (proper projects only)
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);

  // Upload modal
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
      const r = await fetch("/api/vault", { credentials: "include" });
      if (!r.ok) {
        setError((await r.json()).error || "Failed");
        return;
      }
      const all = (await r.json()) as Array<
        VaultItem & { project_id?: string | null }
      >;
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

  const loadMore = useCallback(async () => {
    if (!project || isLoose || loadingMore) return;
    const currentCount = project.items.length;
    if (currentCount >= (project.total_items ?? 0)) return;
    setLoadingMore(true);
    try {
      const r = await fetch(
        `/api/vault/projects/${projectId}?offset=${currentCount}&limit=100`,
        { credentials: "include" }
      );
      if (!r.ok) return;
      const p = await r.json();
      setProject((prev) =>
        prev ? { ...prev, items: [...prev.items, ...(p.items || [])] } : prev
      );
    } finally {
      setLoadingMore(false);
    }
  }, [project, projectId, isLoose, loadingMore]);

  useEffect(() => {
    const pid = isLoose ? "loose" : projectId;
    fetch(`/api/vault/projects/${pid}/indexed-files`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setIndexedFiles(d.files || []);
        setIndexedCount(d.files?.length || 0);
      })
      .catch(() => setIndexedFiles([]));
  }, [projectId, isLoose]);

  const items = isLoose ? looseItems ?? [] : project?.items ?? [];
  const hasMore = !isLoose && (project?.total_items ?? 0) > items.length;
  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        (i.description || "").toLowerCase().includes(q)
    );
  }, [items, search]);

  const toggleAll = () => {
    if (selected.size === filteredItems.length && filteredItems.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredItems.map((i) => i.id)));
    }
  };
  const toggleOne = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
    if (
      !confirm(
        "Delete this project? Items inside become loose (not deleted)."
      )
    )
      return;
    const r = await fetch(`/api/vault/projects/${projectId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (r.ok) router.push("/vault");
  };

  const [deletingSelected, setDeletingSelected] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const deleteSelected = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (
      !confirm(
        `Delete ${ids.length} item${ids.length === 1 ? "" : "s"}? This removes the vault entries and any chunks Dante uses. The original files on disk are untouched.`,
      )
    ) {
      return;
    }
    setDeletingSelected({ done: 0, total: ids.length });
    setError(null);
    // Run in batches of 8 — vault delete is light but RLS lookups
    // add up; staying polite avoids overwhelming the connection pool.
    let done = 0;
    const queue = [...ids];
    while (queue.length > 0) {
      const batch = queue.splice(0, 8);
      await Promise.allSettled(
        batch.map((id) =>
          fetch(`/api/vault/${id}`, {
            method: "DELETE",
            credentials: "include",
          }),
        ),
      );
      done += batch.length;
      setDeletingSelected({ done, total: ids.length });
    }
    setDeletingSelected(null);
    setSelected(new Set());
    // Reload the items list so deleted rows disappear.
    await load();
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
      const up = await fetch("/api/vault/upload", {
        method: "POST",
        body: form,
      });
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

  const allSelected =
    filteredItems.length > 0 && selected.size === filteredItems.length;

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      {/* Top bar */}
      <div className="sticky top-0 z-10 border-b border-[var(--rule)] bg-[var(--canvas)]/95 backdrop-blur">
        <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 text-sm text-[var(--ink-muted)] min-w-0">
            <Link href="/vault" className="hover:text-[var(--ink)] transition flex items-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
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

      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-8">
        {/* Project hero — compact, single line of metadata */}
        <div className="mb-6">
          <div className="flex items-start gap-3 mb-2">
            {isLoose ? (
              <Folder
                className="w-5 h-5 text-[var(--ink-subtle)] mt-1"
                strokeWidth={1.5}
              />
            ) : (
              <FolderClosed
                className="w-5 h-5 text-[var(--ink-muted)] mt-1"
                strokeWidth={1.5}
              />
            )}
            <div className="flex-1 min-w-0">
              {!isLoose && editingName ? (
                <div className="flex items-center gap-2 mb-1">
                  <input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveName();
                      if (e.key === "Escape") setEditingName(false);
                    }}
                    className="heading-display text-2xl md:text-3xl text-[var(--ink)] leading-[1.1] bg-transparent border-b border-[var(--rule-strong)] focus:outline-none focus:border-[var(--ink)] px-1 py-0.5 max-w-xl"
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
                  <h1 className="heading-display text-2xl md:text-3xl text-[var(--ink)] leading-[1.1]">
                    {headerName}
                  </h1>
                  {!isLoose && (
                    <button
                      onClick={() => setEditingName(true)}
                      className="p-1 rounded-[4px] text-[var(--ink-subtle)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition"
                      title="Rename"
                    >
                      <Pencil className="w-3 h-3" strokeWidth={1.5} />
                    </button>
                  )}
                </div>
              )}
              <p className="text-xs text-[var(--ink-muted)] max-w-2xl">
                {headerDescription || (
                  <span className="text-[var(--ink-subtle)] italic">
                    No description
                  </span>
                )}
              </p>
              <div className="mt-2 flex items-center gap-2 text-[11px] mono text-[var(--ink-subtle)]">
                <span>
                  {items.length} file{items.length === 1 ? "" : "s"}
                </span>
                {items.length > 0 && (
                  <>
                    <span>·</span>
                    <span>
                      {items.filter((i) => i.kind === "template").length}{" "}
                      template
                      {items.filter((i) => i.kind === "template").length === 1 ? "" : "s"}
                    </span>
                    <span>·</span>
                    <span>
                      {items.filter((i) => i.kind === "document").length}{" "}
                      document
                      {items.filter((i) => i.kind === "document").length === 1 ? "" : "s"}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Workflow CTAs row — compact and inline */}
        {!isLoose && items.length > 0 && (
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            <Link
              href="/review-tables/new"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] text-xs font-medium text-[var(--ink)] transition"
            >
              <Table2 className="w-3.5 h-3.5" strokeWidth={1.5} />
              Create review table
            </Link>
            <Link
              href="/dante"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] text-xs font-medium text-[var(--ink)] transition"
            >
              <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
              Ask the assistant
            </Link>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex items-center gap-0 border-b border-[var(--rule)] mb-4">
          <button
            onClick={() => setTab("vault")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              tab === "vault"
                ? "border-[var(--ink)] text-[var(--ink)]"
                : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]"
            }`}
          >
            Documents{items.length > 0 ? ` (${items.length})` : ""}
          </button>
          {indexedCount > 0 && (
            <button
              onClick={() => setTab("indexed")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
                tab === "indexed"
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Indexed files
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-700">
                {indexedCount}
              </span>
            </button>
          )}
          {!isLoose && (
            <button
              onClick={() => setTab("members")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition flex items-center gap-1.5 ${
                tab === "members"
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Users className="w-3.5 h-3.5" strokeWidth={1.5} />
              Members
            </button>
          )}
        </div>

        {tab === "members" && !isLoose ? (
          <ProjectMembersPanel projectId={projectId} />
        ) : tab === "indexed" && indexedFiles ? (
          <IndexedFilesTable
            files={indexedFiles}
            onIngest={async (fileId) => {
              try {
                await fetch("/api/electron/watched-folders/file-index", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({ index_entry_id: fileId }),
                });
                setIndexedFiles((prev) =>
                  (prev || []).map((f) =>
                    f.id === fileId ? { ...f, ingest_status: "ingest_requested" } : f,
                  ),
                );
              } catch {}
            }}
          />
        ) : (
        <>
        {/* Search + selection summary */}
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="max-w-md flex-1 relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--ink-subtle)]"
              strokeWidth={1.5}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search this project"
              className={`${inputClass} pl-9 py-1.5`}
            />
          </div>
          {selected.size > 0 && (
            <div className="flex items-center gap-3">
              <div className="text-xs text-[var(--ink-muted)] mono">
                {deletingSelected
                  ? `Deleting ${deletingSelected.done}/${deletingSelected.total}…`
                  : `${selected.size} selected`}
              </div>
              {!deletingSelected && (
                <button
                  type="button"
                  onClick={deleteSelected}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] border border-[var(--rule)] text-[var(--danger)] hover:bg-[var(--danger-soft)] text-xs font-medium transition"
                >
                  Delete selected
                </button>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger)]/30 rounded-[4px] flex items-center gap-2">
            <AlertCircle className="w-4 h-4" strokeWidth={1.5} /> {error}
          </div>
        )}

        {items.length === 0 ? (
          <div className="py-16 text-center border border-dashed border-[var(--rule-strong)] rounded-[8px]">
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
          <div className="border border-[var(--rule)] rounded-[8px] overflow-hidden bg-[var(--canvas)]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--rule)]">
                  <tr>
                    <th className="w-10 px-3 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        className="w-3.5 h-3.5 accent-[var(--ink)] cursor-pointer"
                        aria-label="Select all"
                      />
                    </th>
                    <th className="w-10 px-2 py-3 text-left text-[10px] mono text-[var(--ink-subtle)] uppercase tracking-wider"></th>
                    <th className="px-3 py-3 text-left label-section">Name</th>
                    <th className="px-3 py-3 text-left label-section w-32">
                      Type
                    </th>
                    <th className="px-3 py-3 text-left label-section w-32">
                      Modified
                    </th>
                    <th className="px-3 py-3 text-right label-section w-28">
                      Size
                    </th>
                    {/* "+ Add column" — placeholder for inline review-table
                        column creation. Wired in a follow-up pass. */}
                    <th className="px-3 py-3 text-left w-32">
                      <button
                        className="inline-flex items-center gap-1 text-xs text-[var(--ink-subtle)] hover:text-[var(--ink)] transition"
                        title="Add a custom column (extracts data per file)"
                        onClick={() =>
                          alert(
                            "Inline column extraction lands in the next pass. For now use Review Tables."
                          )
                        }
                      >
                        <Plus className="w-3 h-3" strokeWidth={1.75} />
                        Add column
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item, i) => {
                    const isSelected = selected.has(item.id);
                    return (
                      <tr
                        key={item.id}
                        onClick={() => router.push(`/vault/${item.id}`)}
                        className="border-b border-[var(--rule)] last:border-b-0 hover:bg-[var(--canvas-subtle)] transition cursor-pointer"
                        style={{
                          background: isSelected
                            ? "var(--canvas-subtle)"
                            : undefined,
                        }}
                      >
                        <td
                          className="px-3 py-3"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleOne(item.id);
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleOne(item.id)}
                            className="w-3.5 h-3.5 accent-[var(--ink)] cursor-pointer"
                            aria-label={`Select ${item.title}`}
                          />
                        </td>
                        <td className="px-2 py-3 text-[11px] mono text-[var(--ink-subtle)] text-center">
                          {i + 1}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <FileTypeIcon
                              fileType={item.file_type}
                              fileName={item.title}
                            />
                            <div className="min-w-0">
                              <div className="text-sm text-[var(--ink)] truncate">
                                {item.title}
                              </div>
                              {item.description && (
                                <div className="text-[11px] text-[var(--ink-subtle)] truncate mt-0.5">
                                  {item.description}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <KindBadge kind={item.kind} />
                        </td>
                        <td className="px-3 py-3 text-xs text-[var(--ink-muted)] mono">
                          {formatRelative(item.updated_at)}
                        </td>
                        <td className="px-3 py-3 text-right text-xs text-[var(--ink-muted)] mono">
                          {formatSize(item.file_size)}
                        </td>
                        <td className="px-3 py-3"></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {hasMore && (
                <div className="flex justify-center py-4">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="px-4 py-2 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--neu-hover)] rounded-md transition disabled:opacity-50"
                  >
                    {loadingMore ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Loading...
                      </span>
                    ) : (
                      `Load more (${items.length} of ${project?.total_items ?? 0})`
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        </>
        )}
      </div>

      {/* Upload modal */}
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
                      ? "Use this template for onboarding new customers. Includes the standard terms block."
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

function StatusPill({ status }: { status: string }) {
  switch (status) {
    case "indexed":
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--neu-hover)] text-[var(--ink-muted)]">Indexed</span>;
    case "ingest_requested":
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700 animate-pulse">Requested</span>;
    case "ingesting":
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700 inline-flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />
          Ingesting
        </span>
      );
    case "ingested":
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700">Ingested</span>;
    case "ingest_failed":
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700">Failed</span>;
    default:
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--neu-hover)] text-[var(--ink-subtle)]">{status}</span>;
  }
}

interface AccessEntry {
  id: string;
  profile_id: string;
  role: string;
  granted_at: string;
  profile_name: string;
  profile_role: string;
}

interface WorkspaceMember {
  id: string;
  full_name: string;
  role: string;
}

function ProjectMembersPanel({ projectId }: { projectId: string }) {
  const [access, setAccess] = useState<AccessEntry[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [selectedMember, setSelectedMember] = useState("");
  const [selectedRole, setSelectedRole] = useState("viewer");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/vault/projects/${projectId}/access`, {
        credentials: "include",
      });
      if (r.ok) {
        const d = await r.json();
        setAccess(d.access || []);
        setMembers(d.members || []);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const grantAccess = async () => {
    if (!selectedMember) return;
    setAdding(true);
    try {
      const r = await fetch(`/api/vault/projects/${projectId}/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ profile_id: selectedMember, role: selectedRole }),
      });
      if (r.ok) {
        setSelectedMember("");
        await load();
      }
    } finally {
      setAdding(false);
    }
  };

  const revokeAccess = async (profileId: string) => {
    await fetch(`/api/vault/projects/${projectId}/access?profile_id=${profileId}`, {
      method: "DELETE",
      credentials: "include",
    });
    await load();
  };

  const assignedIds = new Set(access.map((a) => a.profile_id));
  const unassigned = members.filter((m) => !assignedIds.has(m.id));

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--ink-muted)] py-8 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
        Loading members…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[12px] text-[var(--ink-muted)] mb-4">
          Control who can see and work with documents in this project.
          Owners and admins always have full access. Members only see
          projects they&rsquo;ve been explicitly added to.
        </p>
      </div>

      {access.length > 0 && (
        <div className="border border-[var(--rule)] rounded-[8px] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--rule)] bg-[var(--canvas-subtle)]">
              <tr>
                <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-subtle)]">Name</th>
                <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-subtle)] w-28">Workspace role</th>
                <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-subtle)] w-28">Project access</th>
                <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-subtle)] w-28">Granted</th>
                <th className="px-4 py-2.5 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {access.map((a) => (
                <tr key={a.id} className="border-b border-[var(--rule)] last:border-b-0">
                  <td className="px-4 py-3 text-[var(--ink)]">{a.profile_name}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--neu-hover)] text-[var(--ink-muted)] capitalize">
                      {a.profile_role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700 capitalize">
                      {a.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--ink-muted)] mono">
                    {formatRelative(a.granted_at)}
                  </td>
                  <td className="px-4 py-3">
                    {a.profile_role !== "owner" && (
                      <button
                        onClick={() => revokeAccess(a.profile_id)}
                        className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] transition"
                        title="Remove access"
                      >
                        <UserMinus className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {access.length === 0 && (
        <div className="py-8 text-center border border-dashed border-[var(--rule-strong)] rounded-[8px]">
          <Users className="w-8 h-8 text-[var(--ink-subtle)] mx-auto mb-2" strokeWidth={1} />
          <p className="text-sm text-[var(--ink-muted)]">
            No members assigned yet. Owners have access by default.
          </p>
        </div>
      )}

      {unassigned.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedMember}
            onChange={(e) => setSelectedMember(e.target.value)}
            className="rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
          >
            <option value="">Add a team member…</option>
            {unassigned.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name} ({m.role})
              </option>
            ))}
          </select>
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
          >
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
            <option value="admin">Admin</option>
          </select>
          <button
            onClick={grantAccess}
            disabled={!selectedMember || adding}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition"
          >
            {adding ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
            ) : (
              <UserPlus className="w-3.5 h-3.5" strokeWidth={1.5} />
            )}
            Add
          </button>
        </div>
      )}
    </div>
  );
}

function IndexedFilesTable({
  files,
  onIngest,
}: {
  files: IndexedFile[];
  onIngest: (fileId: string) => void;
}) {
  return (
    <div className="border border-[var(--rule)] rounded-[8px] overflow-hidden">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-[var(--rule)] bg-[var(--canvas-subtle)]">
            <th className="px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-subtle)]">File</th>
            <th className="px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-subtle)] w-24">Size</th>
            <th className="px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-subtle)] w-28">Status</th>
            <th className="px-4 py-2.5 w-24"></th>
          </tr>
        </thead>
        <tbody>
          {files.map((f) => (
            <tr key={f.id} className="border-b border-[var(--rule)] last:border-b-0 hover:bg-[var(--canvas-subtle)] transition">
              <td className="px-4 py-3">
                <div className="text-sm text-[var(--ink)] truncate max-w-md">{f.file_name}</div>
                <div className="text-[11px] text-[var(--ink-subtle)] truncate max-w-md mt-0.5">{f.file_path}</div>
              </td>
              <td className="px-4 py-3 text-xs text-[var(--ink-muted)]">{formatSize(f.file_size_bytes)}</td>
              <td className="px-4 py-3"><StatusPill status={f.ingest_status} /></td>
              <td className="px-4 py-3">
                {f.ingest_status === "indexed" && (
                  <button
                    onClick={() => onIngest(f.id)}
                    className="px-3 py-1 rounded text-xs font-medium bg-[var(--ink)] text-white hover:opacity-90 transition"
                  >
                    Ingest
                  </button>
                )}
              </td>
            </tr>
          ))}
          {files.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-sm text-[var(--ink-subtle)]">
                No indexed files for this project
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
