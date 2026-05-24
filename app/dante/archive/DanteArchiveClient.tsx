"use client";

// app/dante/archive/DanteArchiveClient.tsx
//
// Archive gallery client. Three surfaces stacked top-down:
//
//   1. Upload card — drag/drop or click to pick; metadata form folds
//      out once a file is attached (title defaulted to filename,
//      kind tag, optional source URL).
//   2. Search bar — vector-search across all docs in the workspace;
//      hits render inline with their citation + a "Jump to doc" link.
//   3. Document list — grouped by kind, newest first. Processing
//      docs show a spinner; errored docs show the reason + a delete
//      button so the user can clear the tombstone.
//
// Styling follows the Harvey / Drift vocabulary already in use across
// Dante: card-flat, --canvas, --ink, --rule tokens.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import DanteGateLink from "@/components/dante/DanteGateLink";
import { DriftMark } from "@/components/dante/DriftMark";
import {
  ArrowLeft, Upload, Loader2, Trash2, FileText, Search,
  AlertCircle, Archive, Tag, ExternalLink, ChevronRight,
  CheckCircle2,
} from "lucide-react";
import { ARCHIVE_KIND_LABELS, type ArchiveKind, type ArchiveSearchHit } from "@/lib/dante/archive/types";
import { useAssistantBrand } from "@/components/dante/AssistantNameProvider";

interface DocRow {
  id: string;
  title: string;
  kind: ArchiveKind | null;
  tags: string[];
  mime_type: string | null;
  byte_size: number | null;
  page_count: number | null;
  source_url: string | null;
  status: "processing" | "ready" | "error";
  error: string | null;
  created_at: string;
  chunk_count: number;
}

const KIND_OPTIONS: Array<{ value: ArchiveKind | ""; label: string }> = [
  { value: "", label: "Choose a kind…" },
  { value: "lease", label: "Lease" },
  { value: "listing_agreement", label: "Listing agreement" },
  { value: "rent_roll", label: "Rent roll" },
  { value: "client_agreement", label: "Client agreement" },
  { value: "policy", label: "Internal policy / SOP" },
  { value: "regulation", label: "Regulation" },
  { value: "memo", label: "Memo / research" },
  { value: "other", label: "Other" },
];

export default function DanteArchiveClient() {
  const brand = useAssistantBrand();
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [migrationPending, setMigrationPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Upload form
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ArchiveKind | "">("");
  const [tags, setTags] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragZoneRef = useRef<HTMLLabelElement>(null);

  // Search
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<ArchiveSearchHit[] | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Paint the page with Harvey tokens even before Tailwind's resets
  // have landed — matches the pattern in DanteSecretsClient.
  useEffect(() => {
    const html = document.documentElement, body = document.body;
    html.style.setProperty("background", "var(--canvas)", "important");
    body.style.setProperty("background", "var(--canvas)", "important");
    body.style.setProperty("color", "var(--ink)", "important");
    return () => {
      html.style.removeProperty("background");
      body.style.removeProperty("background");
      body.style.removeProperty("color");
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dante/archive", { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setDocs(json.documents || []);
      setMigrationPending(Boolean(json.migration_pending));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Poll while anything is processing so the spinner resolves
  // without the user needing to hit refresh.
  useEffect(() => {
    if (!docs.some((d) => d.status === "processing")) return;
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [docs, load]);

  const onPickFile = (f: File) => {
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  };

  const doUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true); setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", title || file.name);
      if (kind) form.append("kind", kind);
      if (tags) form.append("tags", tags);
      if (sourceUrl) form.append("source_url", sourceUrl);
      const res = await fetch("/api/dante/archive/upload", {
        method: "POST", credentials: "include", body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");
      // Reset form & refresh list
      setFile(null); setTitle(""); setKind(""); setTags(""); setSourceUrl("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally { setUploading(false); }
  };

  const doSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    if (!query) { setHits(null); return; }
    setSearching(true); setError(null);
    try {
      const res = await fetch("/api/dante/archive/search", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, k: 8 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Search failed");
      setHits(json.hits || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally { setSearching(false); }
  };

  const deleteDoc = async (id: string) => {
    if (!confirm("Delete this document and its chunks? This can't be undone.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/dante/archive/${id}`, { method: "DELETE", credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Delete failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally { setDeletingId(null); }
  };

  // Drag/drop handlers
  useEffect(() => {
    const el = dragZoneRef.current;
    if (!el) return;
    const over = (e: DragEvent) => { e.preventDefault(); el.classList.add("ring-2", "ring-[var(--ink)]"); };
    const leave = () => el.classList.remove("ring-2", "ring-[var(--ink)]");
    const drop = (e: DragEvent) => {
      e.preventDefault(); leave();
      const f = e.dataTransfer?.files?.[0];
      if (f) onPickFile(f);
    };
    el.addEventListener("dragover", over);
    el.addEventListener("dragleave", leave);
    el.addEventListener("drop", drop);
    return () => {
      el.removeEventListener("dragover", over);
      el.removeEventListener("dragleave", leave);
      el.removeEventListener("drop", drop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const processingCount = docs.filter((d) => d.status === "processing").length;

  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      {/* Top bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-6 md:px-8 py-4 bg-[var(--canvas)] border-b border-[var(--rule)]">
        <div className="flex items-center gap-3">
          <img src="/brand/logo-circle.png" alt="Drift" className="w-6 h-6 rounded-full object-cover" />
          <span className="text-sm font-semibold text-[var(--ink)]">Drift</span>
          <span className="text-xs text-[var(--ink-subtle)]">/</span>
          <Link href="/dashboard" className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] transition">Dashboard</Link>
          <span className="text-xs text-[var(--ink-subtle)]">/</span>
          <DanteGateLink variant="breadcrumb" />
          <span className="text-xs text-[var(--ink-subtle)]">/</span>
          <span className="text-xs text-[var(--ink)]">Archive</span>
        </div>
        <Link href="/dante" className="flex items-center gap-1.5 px-3 py-2 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition text-sm font-medium">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
          <span className="hidden sm:inline">{brand.name}</span>
        </Link>
      </div>

      <div className="px-6 md:px-8 py-10 max-w-[1100px] mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="label-section mb-3">Archive</div>
          <h1 className="heading-display text-4xl text-[var(--ink)] mb-3">
            Every document your brokerage touches — searchable.
          </h1>
          <p className="text-sm text-[var(--ink-muted)] max-w-2xl leading-relaxed">
            Drop in leases, listing agreements, rent rolls, disclosures, inspection
            reports, or any deal document the team references. Dante extracts, chunks,
            and embeds each document so workflows and search queries can cite it
            with page-level precision.
          </p>
        </div>

        {migrationPending && (
          <div className="mb-6 card-flat p-4 border-l-2 border-[var(--flag)] bg-[var(--flag-soft)] flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-[var(--flag)] mt-0.5" strokeWidth={1.5} />
            <div className="text-xs text-[var(--ink)]">
              <strong>Migration pending.</strong> The archive tables and pgvector
              extension haven&apos;t been created yet. Upload will fail until
              you run the SQL migration in Supabase.
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 card-flat p-3 border-l-2 border-[var(--danger)] bg-[var(--danger-soft)] flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-[var(--danger)] mt-0.5" strokeWidth={1.5} />
            <div className="text-xs text-[var(--ink)] flex-1">{error}</div>
            <button onClick={() => setError(null)} className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)]">dismiss</button>
          </div>
        )}

        {/* Upload */}
        <form onSubmit={doUpload} className="card-flat p-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Upload className="w-4 h-4 text-[var(--ink)]" strokeWidth={1.5} />
            <h2 className="text-sm font-semibold text-[var(--ink)]">Upload a document</h2>
            <span className="text-xs text-[var(--ink-subtle)]">PDF · TXT · MD · DOCX · up to 25MB</span>
          </div>

          <label
            ref={dragZoneRef}
            className="block border-2 border-dashed border-[var(--rule)] rounded-[4px] p-6 text-center cursor-pointer hover:border-[var(--rule-strong)] transition"
          >
            <input
              ref={fileInputRef} type="file" className="hidden"
              accept="application/pdf,text/plain,text/markdown,.md,.docx"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickFile(f); }}
            />
            {file ? (
              <div className="flex items-center justify-center gap-2 text-sm text-[var(--ink)]">
                <FileText className="w-4 h-4" strokeWidth={1.5} />
                <span>{file.name}</span>
                <span className="text-xs text-[var(--ink-muted)]">({Math.round(file.size / 1024)}KB)</span>
              </div>
            ) : (
              <div className="text-xs text-[var(--ink-muted)]">
                <span className="text-[var(--ink)] font-medium">Click to pick</span> or drag a file here
              </div>
            )}
          </label>

          {file && (
            <div className="grid md:grid-cols-2 gap-3 mt-4">
              <div>
                <div className="label-section mb-1.5">Title</div>
                <input
                  value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder={file.name}
                  className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
                />
              </div>
              <div>
                <div className="label-section mb-1.5">Kind</div>
                <select
                  value={kind} onChange={(e) => setKind(e.target.value as ArchiveKind | "")}
                  className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
                >
                  {KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <div className="label-section mb-1.5">Tags</div>
                <input
                  value={tags} onChange={(e) => setTags(e.target.value)}
                  placeholder="retirement, rollover, 2024"
                  className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
                />
              </div>
              <div>
                <div className="label-section mb-1.5">Source URL (optional)</div>
                <input
                  value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://adviserinfo.sec.gov/…"
                  className="w-full bg-[var(--canvas)] border border-[var(--rule)] rounded-[4px] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 mt-4">
            {file && (
              <button
                type="button" onClick={() => { setFile(null); setTitle(""); setKind(""); setTags(""); setSourceUrl(""); }}
                className="px-3 py-2 text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
              >
                Clear
              </button>
            )}
            <button
              type="submit" disabled={!file || uploading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-xs font-medium hover:opacity-90 transition disabled:opacity-40"
            >
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" strokeWidth={1.5} />}
              {uploading ? "Indexing…" : "Upload & index"}
            </button>
          </div>
        </form>

        {/* Search */}
        <form onSubmit={doSearch} className="card-flat p-4 mb-6 flex items-center gap-2">
          <Search className="w-4 h-4 text-[var(--ink-muted)]" strokeWidth={1.5} />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Ask the archive — e.g. 'what fee disclosure do we need for held-away accounts?'"
            className="flex-1 bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none"
          />
          {hits !== null && (
            <button
              type="button" onClick={() => { setHits(null); setQ(""); }}
              className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)]"
            >
              Clear
            </button>
          )}
          <button
            type="submit" disabled={!q.trim() || searching}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-xs font-medium hover:opacity-90 transition disabled:opacity-40"
          >
            {searching ? <Loader2 className="w-3 h-3 animate-spin" /> : <DriftMark className="w-3 h-3" />}
            Search
          </button>
        </form>

        {/* Search results */}
        {hits !== null && (
          <div className="mb-6">
            <div className="label-section mb-3">
              {hits.length} result{hits.length === 1 ? "" : "s"}
            </div>
            {hits.length === 0 ? (
              <div className="card-flat p-5 text-xs text-[var(--ink-muted)]">
                Nothing matched. Try a broader phrasing or upload more source docs.
              </div>
            ) : (
              <div className="space-y-2">
                {hits.map((h) => (
                  <Link
                    key={h.chunk_id} href={`/dante/archive/${h.document_id}`}
                    className="block card-flat card-flat-hover p-4 group"
                  >
                    <div className="flex items-center gap-2 mb-1.5 text-xs">
                      <span className="text-[var(--ink)] font-medium">{h.document_title}</span>
                      {h.document_kind && (
                        <span className="text-[var(--ink-subtle)]">· {ARCHIVE_KIND_LABELS[h.document_kind]}</span>
                      )}
                      {h.page_number != null && (
                        <span className="text-[var(--ink-subtle)]">· p.{h.page_number}</span>
                      )}
                      <span className="ml-auto text-[var(--ink-subtle)]">{Math.round(h.similarity * 100)}% match</span>
                      <ChevronRight className="w-3.5 h-3.5 text-[var(--ink-subtle)] group-hover:text-[var(--ink)] transition" strokeWidth={1.5} />
                    </div>
                    <p className="text-xs text-[var(--ink-muted)] leading-relaxed line-clamp-3">
                      {h.content}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Document list */}
        <div>
          <div className="label-section mb-3 flex items-center gap-2">
            <Archive className="w-3 h-3" strokeWidth={1.5} />
            {docs.length} document{docs.length === 1 ? "" : "s"}
            {processingCount > 0 && (
              <span className="text-[var(--flag)]">
                · {processingCount} processing
              </span>
            )}
          </div>
          {loading ? (
            <div className="card-flat p-5 flex items-center gap-2 text-xs text-[var(--ink-muted)]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading archive…
            </div>
          ) : docs.length === 0 ? (
            <div className="card-flat p-8 text-center">
              <Archive className="w-8 h-8 text-[var(--ink-subtle)] mx-auto mb-3" strokeWidth={1.5} />
              <p className="text-sm text-[var(--ink-muted)] mb-1">Nothing archived yet.</p>
              <p className="text-xs text-[var(--ink-subtle)]">Upload your first document above to start building the firm&apos;s vault.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {docs.map((d) => (
                <div key={d.id} className="card-flat p-4 flex items-start gap-3">
                  <div className="border border-[var(--rule)] bg-[var(--canvas)] rounded-[4px] p-2">
                    <FileText className="w-4 h-4 text-[var(--ink)]" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {d.status === "ready" ? (
                        <Link href={`/dante/archive/${d.id}`} className="text-sm font-medium text-[var(--ink)] hover:underline">
                          {d.title}
                        </Link>
                      ) : (
                        <span className="text-sm font-medium text-[var(--ink)]">{d.title}</span>
                      )}
                      {d.kind && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-[3px] bg-[var(--canvas-subtle)] text-[var(--ink-muted)] inline-flex items-center gap-1">
                          <Tag className="w-2.5 h-2.5" strokeWidth={1.5} />
                          {ARCHIVE_KIND_LABELS[d.kind]}
                        </span>
                      )}
                      {d.status === "processing" && (
                        <span className="text-[10px] text-[var(--flag)] inline-flex items-center gap-1">
                          <Loader2 className="w-2.5 h-2.5 animate-spin" /> processing…
                        </span>
                      )}
                      {d.status === "ready" && (
                        <span className="text-[10px] text-[var(--verified)] inline-flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5" strokeWidth={1.5} /> indexed
                        </span>
                      )}
                      {d.status === "error" && (
                        <span className="text-[10px] text-[var(--danger)] inline-flex items-center gap-1">
                          <AlertCircle className="w-2.5 h-2.5" strokeWidth={1.5} /> error
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[var(--ink-muted)] flex items-center gap-3 flex-wrap">
                      <span>{new Date(d.created_at).toLocaleDateString()}</span>
                      {d.page_count != null && <span>{d.page_count} page{d.page_count === 1 ? "" : "s"}</span>}
                      {d.chunk_count > 0 && <span>{d.chunk_count} chunks</span>}
                      {d.byte_size != null && <span>{Math.round(d.byte_size / 1024)}KB</span>}
                      {d.source_url && (
                        <a href={d.source_url} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[var(--ink-muted)] hover:text-[var(--ink)]">
                          source <ExternalLink className="w-2.5 h-2.5" strokeWidth={1.5} />
                        </a>
                      )}
                    </div>
                    {d.status === "error" && d.error && (
                      <div className="text-[11px] text-[var(--danger)] mt-1.5">{d.error}</div>
                    )}
                    {d.tags && d.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {d.tags.map((t) => (
                          <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-[3px] bg-[var(--canvas-subtle)] text-[var(--ink-subtle)]">
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => deleteDoc(d.id)} disabled={deletingId === d.id}
                    className="text-[var(--ink-subtle)] hover:text-[var(--danger)] transition disabled:opacity-40"
                    title="Delete"
                  >
                    {deletingId === d.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" strokeWidth={1.5} />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
