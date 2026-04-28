"use client";

// VaultClient — Harvey-styled. Big serif hero + subtitle, two
// prominent CTA cards at the top (Upload Template / Upload
// Document), filter tabs (text-only, no pill chrome), and a card
// grid below grouped by kind when "All" is selected. Each card
// reads as a single coherent object — large icon, bold title,
// dimmed description, footer chip with kind + size — instead of
// the dense one-line rows we had before.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  Search,
  Upload,
  Loader2,
  AlertCircle,
  Sparkles,
  ScrollText,
  Plus,
  X,
  Check,
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

type FilterKind = "all" | "template" | "document";

const TABS: Array<{ value: FilterKind; label: string }> = [
  { value: "all", label: "All" },
  { value: "template", label: "Templates" },
  { value: "document", label: "Documents" },
];

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
  const [filter, setFilter] = useState<FilterKind>("all");
  const [search, setSearch] = useState("");

  // Upload modal state — replaces the old inline form so the page's
  // resting state stays clean and editorial like Harvey's Vault.
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadKind, setUploadKind] =
    useState<"template" | "document">("document");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

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

  const templates = filtered?.filter((r) => r.kind === "template") ?? [];
  const documents = filtered?.filter((r) => r.kind === "document") ?? [];

  const openUpload = (kind: "template" | "document") => {
    setUploadKind(kind);
    setUploadTitle("");
    setUploadDescription("");
    setPendingFile(null);
    setError(null);
    setUploadOpen(true);
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
        }),
      });
      if (!create.ok) {
        const j = await create.json().catch(() => ({}));
        throw new Error(j.error || "Failed to add to vault");
      }
      const created = await create.json();
      setRows((prev) => (prev ? [created, ...prev] : [created]));
      setUploadOpen(false);
    } catch (e: any) {
      setError(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const Card = ({ row }: { row: VaultRow }) => {
    const isTemplate = row.kind === "template";
    const Icon = isTemplate ? Sparkles : ScrollText;
    return (
      <button
        onClick={() => router.push(`/vault/${row.id}`)}
        className="group text-left transition flex flex-col"
        style={{
          background: "var(--canvas)",
          border: "1px solid var(--rule)",
          borderRadius: "8px",
          padding: 0,
          minHeight: "200px",
        }}
      >
        {/* Icon panel */}
        <div
          className="flex items-center justify-center transition-colors"
          style={{
            background: isTemplate
              ? "var(--accent-soft)"
              : "var(--canvas-subtle)",
            borderRadius: "8px 8px 0 0",
            height: "92px",
          }}
        >
          <Icon
            className={
              isTemplate
                ? "w-9 h-9 text-[var(--accent)]"
                : "w-9 h-9 text-[var(--ink-muted)]"
            }
            strokeWidth={1.25}
          />
        </div>
        {/* Body */}
        <div className="flex-1 px-4 py-3 flex flex-col">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-sm font-semibold text-[var(--ink)] truncate">
              {row.title}
            </span>
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
            <span className="ml-auto text-[var(--ink-subtle)] group-hover:text-[var(--ink)] transition">
              Open →
            </span>
          </div>
        </div>
      </button>
    );
  };

  const Section = ({
    title,
    items,
    emptyHint,
    cta,
  }: {
    title: string;
    items: VaultRow[];
    emptyHint: string;
    cta?: { label: string; onClick: () => void };
  }) => (
    <section className="mb-12">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="heading-display text-2xl text-[var(--ink)]">{title}</h2>
        {items.length > 0 && cta && (
          <button
            onClick={cta.onClick}
            className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] transition inline-flex items-center gap-1"
          >
            {cta.label}
            <ArrowRight className="w-3 h-3" strokeWidth={1.5} />
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <div
          className="rounded-[8px] border border-dashed py-10 px-6 text-center"
          style={{ borderColor: "var(--rule-strong)" }}
        >
          <p className="text-sm text-[var(--ink-muted)]">{emptyHint}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map((r) => (
            <Card key={r.id} row={r} />
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      {/* Top bar */}
      <div className="sticky top-0 z-10 border-b border-[var(--rule)] bg-[var(--canvas)]/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-4 flex items-center justify-between gap-4">
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

      <div className="max-w-7xl mx-auto px-6 md:px-10 py-8 md:py-10">
        {/* Editorial hero — sized down so the page breathes around
            content, not headlines. */}
        <div className="mb-6 flex items-end justify-between gap-6 flex-wrap">
          <div>
            <div className="label-section mb-1.5">Workspace archive</div>
            <h1 className="heading-display text-3xl md:text-4xl text-[var(--ink)] leading-[1.1]">
              Vault
            </h1>
            <p className="text-sm text-[var(--ink-muted)] mt-1.5 max-w-xl">
              Templates and documents the assistant cites from. Everyone in
              this workspace sees everything here.
            </p>
          </div>
        </div>

        {/* Two prominent CTAs — tighter so they don't dominate */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
          <button
            onClick={() => openUpload("template")}
            className="group text-left transition flex items-center gap-4 px-5 py-3.5 hover:border-[var(--rule-strong)]"
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
              <Sparkles
                className="w-5 h-5 text-[var(--accent)]"
                strokeWidth={1.5}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-[var(--ink)]">
                Upload template
              </div>
              <div className="text-[11px] text-[var(--ink-muted)] truncate">
                Fillable docs the assistant uses to draft for clients.
              </div>
            </div>
            <ArrowRight
              className="w-4 h-4 text-[var(--ink-subtle)] group-hover:text-[var(--ink)] transition shrink-0"
              strokeWidth={1.5}
            />
          </button>

          <button
            onClick={() => openUpload("document")}
            className="group text-left transition flex items-center gap-4 px-5 py-3.5 hover:border-[var(--rule-strong)]"
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
              <ScrollText
                className="w-5 h-5 text-[var(--ink-muted)]"
                strokeWidth={1.5}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-[var(--ink)]">
                Upload document
              </div>
              <div className="text-[11px] text-[var(--ink-muted)] truncate">
                Contracts, statements, tax forms — anything to cite from.
              </div>
            </div>
            <ArrowRight
              className="w-4 h-4 text-[var(--ink-subtle)] group-hover:text-[var(--ink)] transition shrink-0"
              strokeWidth={1.5}
            />
          </button>
        </div>

        {/* Tabs + search */}
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap border-b border-[var(--rule)]">
          <div className="flex items-center -mb-px">
            {TABS.map((t) => (
              <button
                key={t.value}
                onClick={() => setFilter(t.value)}
                className="px-3 py-2.5 text-sm font-medium transition relative"
                style={{
                  color:
                    filter === t.value ? "var(--ink)" : "var(--ink-muted)",
                  borderBottom:
                    filter === t.value
                      ? "2px solid var(--ink)"
                      : "2px solid transparent",
                }}
              >
                {t.label}
                {rows && (
                  <span className="ml-1.5 text-[var(--ink-subtle)] text-[11px] mono">
                    {t.value === "all"
                      ? rows.length
                      : rows.filter((r) => r.kind === t.value).length}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="flex-1 max-w-xs relative pb-2">
            <Search
              className="absolute left-3 top-1/2 -translate-y-[60%] w-3.5 h-3.5 text-[var(--ink-subtle)]"
              strokeWidth={1.5}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title or description"
              className="w-full rounded-[6px] border border-[var(--rule)] bg-[var(--canvas)] pl-9 pr-3 py-1.5 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
            />
          </div>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger)]/30 rounded-[4px] flex items-center gap-2">
            <AlertCircle className="w-4 h-4" strokeWidth={1.5} /> {error}
          </div>
        )}

        {/* Body */}
        {filtered === null ? (
          <div className="flex items-center justify-center py-32">
            <Loader2
              className="w-6 h-6 animate-spin text-[var(--ink-subtle)]"
              strokeWidth={1.5}
            />
          </div>
        ) : rows && rows.length === 0 ? (
          // First-run state — show placeholder cards so the page reads
          // as "this is what your vault will look like" instead of an
          // empty void.
          <div>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="heading-display text-xl text-[var(--ink)]">
                Your vault will live here
              </h2>
              <span className="text-[11px] text-[var(--ink-subtle)]">
                Click a card above to upload your first item.
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[
                {
                  kind: "template" as const,
                  title: "e.g. Texas residential cash offer",
                  description:
                    "Fillable purchase agreement. The assistant uses your description to pick this template when you ask it to draft.",
                },
                {
                  kind: "template" as const,
                  title: "e.g. Quarterly review email",
                  description:
                    "Templated outreach. Vergil prefills with the client's portfolio numbers and recent activity.",
                },
                {
                  kind: "document" as const,
                  title: "e.g. Smith pre-approval letter",
                  description:
                    "Tag with the client's contact and Vergil cites it when drafting offers.",
                },
                {
                  kind: "document" as const,
                  title: "e.g. Listing agreement, 123 Main St",
                  description:
                    "Tag with a property and the assistant pulls relevant clauses on calls.",
                },
              ].map((p, i) => {
                const Icon = p.kind === "template" ? Sparkles : ScrollText;
                return (
                  <div
                    key={i}
                    className="flex flex-col opacity-60"
                    style={{
                      background: "var(--canvas)",
                      border: "1px dashed var(--rule-strong)",
                      borderRadius: "8px",
                      minHeight: "200px",
                    }}
                  >
                    <div
                      className="flex items-center justify-center"
                      style={{
                        background:
                          p.kind === "template"
                            ? "var(--accent-soft)"
                            : "var(--canvas-subtle)",
                        borderRadius: "8px 8px 0 0",
                        height: "92px",
                      }}
                    >
                      <Icon
                        className={
                          p.kind === "template"
                            ? "w-9 h-9 text-[var(--accent)]"
                            : "w-9 h-9 text-[var(--ink-muted)]"
                        }
                        strokeWidth={1.25}
                      />
                    </div>
                    <div className="flex-1 px-4 py-3">
                      <div className="text-sm font-semibold text-[var(--ink)] mb-1">
                        {p.title}
                      </div>
                      <p className="text-[12px] text-[var(--ink-muted)] line-clamp-3">
                        {p.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : filter === "all" ? (
          <>
            <Section
              title="Templates"
              items={templates}
              emptyHint="No templates yet. Upload one above to let the assistant draft from a saved form."
              cta={
                templates.length > 6
                  ? { label: "View all", onClick: () => setFilter("template") }
                  : undefined
              }
            />
            <Section
              title="Documents"
              items={documents}
              emptyHint="No documents yet. Upload contracts, statements, or anything else the assistant should be able to quote."
              cta={
                documents.length > 6
                  ? { label: "View all", onClick: () => setFilter("document") }
                  : undefined
              }
            />
          </>
        ) : (
          <Section
            title={filter === "template" ? "Templates" : "Documents"}
            items={filtered}
            emptyHint={
              search.trim()
                ? "No matches. Clear the search or pick another tab."
                : filter === "template"
                ? "No templates yet."
                : "No documents yet."
            }
          />
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
                  Upload to vault
                </div>
                <h3 className="text-sm font-semibold text-[var(--ink)]">
                  {uploadKind === "template"
                    ? "New template"
                    : "New document"}
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
              {/* Kind toggle (so user can flip without closing) */}
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
                  className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
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
                  className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)] resize-y"
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
                  onChange={(e) =>
                    setPendingFile(e.target.files?.[0] ?? null)
                  }
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
                Press Esc to close.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
