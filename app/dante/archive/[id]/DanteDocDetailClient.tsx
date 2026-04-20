"use client";

// app/dante/archive/[id]/DanteDocDetailClient.tsx
//
// One-document view. Two panes side-by-side on desktop:
//   • Left: the raw file in an iframe (for PDFs — the browser
//     renders them natively; for text we show the first chunk's
//     content as a fallback).
//   • Right: every chunk, grouped by page, with its index and a
//     copy-to-clipboard affordance so users can paste a specific
//     citation into a workflow prompt.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Loader2, FileText, Tag, ExternalLink, Copy,
  CheckCircle2, AlertCircle, Archive,
} from "lucide-react";
import { ARCHIVE_KIND_LABELS, type ArchiveKind } from "@/lib/dante/archive/types";

interface Doc {
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
}

interface Chunk {
  id: string;
  chunk_index: number;
  page_number: number | null;
  content: string;
}

export default function DanteDocDetailClient({ documentId }: { documentId: string }) {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
      const res = await fetch(`/api/dante/archive/${documentId}`, { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setDoc(json.document);
      setChunks(json.chunks || []);
      setFileUrl(json.file_url || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally { setLoading(false); }
  }, [documentId]);

  useEffect(() => { load(); }, [load]);

  const copyChunk = async (c: Chunk) => {
    try {
      await navigator.clipboard.writeText(c.content);
      setCopiedId(c.id);
      setTimeout(() => setCopiedId((cur) => (cur === c.id ? null : cur)), 1500);
    } catch { /* ignore */ }
  };

  // Group chunks by page for nicer scanning.
  const byPage: Record<string, Chunk[]> = {};
  for (const c of chunks) {
    const key = c.page_number != null ? `p.${c.page_number}` : "—";
    (byPage[key] ||= []).push(c);
  }

  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      {/* Top bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-6 md:px-8 py-4 bg-[var(--canvas)] border-b border-[var(--rule)]">
        <div className="flex items-center gap-3 min-w-0">
          <img src="/brand/logo-circle.png" alt="Drift" className="w-6 h-6 rounded-full object-cover" />
          <span className="text-sm font-semibold text-[var(--ink)]">Drift</span>
          <span className="text-xs text-[var(--ink-subtle)]">/</span>
          <Link href="/dante" className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] transition">Dante</Link>
          <span className="text-xs text-[var(--ink-subtle)]">/</span>
          <Link href="/dante/archive" className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] transition">Archive</Link>
          <span className="text-xs text-[var(--ink-subtle)]">/</span>
          <span className="text-xs text-[var(--ink)] truncate max-w-[320px]">{doc?.title ?? "…"}</span>
        </div>
        <Link href="/dante/archive" className="flex items-center gap-1.5 px-3 py-2 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition text-sm font-medium">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
          <span className="hidden sm:inline">Archive</span>
        </Link>
      </div>

      <div className="px-6 md:px-8 py-10 max-w-[1400px] mx-auto">
        {error && (
          <div className="mb-6 card-flat p-3 border-l-2 border-[var(--danger)] bg-[var(--danger-soft)] flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-[var(--danger)] mt-0.5" strokeWidth={1.5} />
            <div className="text-xs text-[var(--ink)]">{error}</div>
          </div>
        )}

        {loading ? (
          <div className="card-flat p-5 flex items-center gap-2 text-xs text-[var(--ink-muted)]">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading document…
          </div>
        ) : !doc ? (
          <div className="card-flat p-8 text-center">
            <Archive className="w-8 h-8 text-[var(--ink-subtle)] mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-sm text-[var(--ink-muted)]">Document not found.</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {doc.kind && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-[3px] bg-[var(--canvas-subtle)] text-[var(--ink-muted)] inline-flex items-center gap-1">
                    <Tag className="w-2.5 h-2.5" strokeWidth={1.5} />
                    {ARCHIVE_KIND_LABELS[doc.kind]}
                  </span>
                )}
                {doc.status === "ready" && (
                  <span className="text-[10px] text-[var(--verified)] inline-flex items-center gap-1">
                    <CheckCircle2 className="w-2.5 h-2.5" strokeWidth={1.5} /> indexed · {chunks.length} chunks
                  </span>
                )}
                {doc.status === "processing" && (
                  <span className="text-[10px] text-[var(--flag)] inline-flex items-center gap-1">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" /> processing…
                  </span>
                )}
                {doc.source_url && (
                  <a href={doc.source_url} target="_blank" rel="noreferrer"
                    className="text-[10px] inline-flex items-center gap-1 text-[var(--ink-muted)] hover:text-[var(--ink)]">
                    source <ExternalLink className="w-2.5 h-2.5" strokeWidth={1.5} />
                  </a>
                )}
              </div>
              <h1 className="heading-display text-3xl text-[var(--ink)]">{doc.title}</h1>
              <div className="text-xs text-[var(--ink-muted)] mt-1 flex items-center gap-3 flex-wrap">
                <span>Uploaded {new Date(doc.created_at).toLocaleDateString()}</span>
                {doc.page_count != null && <span>{doc.page_count} page{doc.page_count === 1 ? "" : "s"}</span>}
                {doc.byte_size != null && <span>{Math.round(doc.byte_size / 1024)}KB</span>}
                {doc.mime_type && <span className="text-[var(--ink-subtle)]">{doc.mime_type}</span>}
              </div>
              {doc.tags && doc.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {doc.tags.map((t) => (
                    <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-[3px] bg-[var(--canvas-subtle)] text-[var(--ink-subtle)]">
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="grid lg:grid-cols-[1.1fr_1fr] gap-6">
              {/* Left — file preview */}
              <div>
                <div className="label-section mb-2">Original</div>
                {fileUrl && doc.mime_type === "application/pdf" ? (
                  <iframe
                    src={fileUrl} className="w-full h-[70vh] rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)]"
                    title={doc.title}
                  />
                ) : fileUrl ? (
                  <div className="card-flat p-5">
                    <a href={fileUrl} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-[var(--ink)] hover:underline">
                      <FileText className="w-3.5 h-3.5" strokeWidth={1.5} />
                      Open raw file
                      <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
                    </a>
                    <p className="text-xs text-[var(--ink-muted)] mt-2">
                      Preview not available for this file type — open it in a new tab.
                    </p>
                  </div>
                ) : (
                  <div className="card-flat p-5 text-xs text-[var(--ink-muted)]">
                    File URL unavailable. Re-upload if this persists.
                  </div>
                )}
              </div>

              {/* Right — chunks */}
              <div>
                <div className="label-section mb-2">Chunks</div>
                {chunks.length === 0 ? (
                  <div className="card-flat p-5 text-xs text-[var(--ink-muted)]">
                    No chunks yet. {doc.status === "processing" && "Still processing…"}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
                    {Object.entries(byPage).map(([page, cs]) => (
                      <div key={page}>
                        <div className="label-section mb-1">{page}</div>
                        {cs.map((c) => (
                          <div key={c.id} className="card-flat p-3 mb-2 group">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[10px] text-[var(--ink-subtle)]">chunk {c.chunk_index}</span>
                              <button
                                onClick={() => copyChunk(c)}
                                className="text-[10px] inline-flex items-center gap-1 text-[var(--ink-muted)] hover:text-[var(--ink)] transition opacity-0 group-hover:opacity-100"
                              >
                                {copiedId === c.id ? <CheckCircle2 className="w-3 h-3" strokeWidth={1.5} /> : <Copy className="w-3 h-3" strokeWidth={1.5} />}
                                {copiedId === c.id ? "copied" : "copy"}
                              </button>
                            </div>
                            <p className="text-xs text-[var(--ink)] leading-relaxed whitespace-pre-wrap">
                              {c.content}
                            </p>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
