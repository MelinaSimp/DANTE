"use client";

// app/dante/CitationRenderer.tsx
//
// Renders an assistant message with inline citation chips. Plain
// markdown text passes through; [v1] / [mem:abc12345] tokens become
// clickable chips that open a popover with the source row.
//
// Phase 3+ additions:
//   - Optional `citationReport` prop (from validateCitations() —
//     surfaced as a `citation_report` SSE frame) decorates each
//     chip with a per-marker status badge (verified / unverified /
//     mismatch / missing). Without the report the chips render
//     as before (no decoration).
//   - The vault popover now includes a "View source" link that
//     deep-links into /dante/archive/[id]?page=N so the reviewer
//     can read the cited page in context.
//
// We resolve the per-chip status by walking the report's `checks`
// array in document order and keying by marker text. The report
// preserves order so first [v1] in the response maps to the first
// vault check, etc. Memory markers are keyed the same way.

import Link from "next/link";
import { useMemo, useState } from "react";
import { BookOpen, ExternalLink, Sparkles, X } from "lucide-react";
import {
  buildCitationMap,
  tokenize,
  type CitationMap,
  type VaultCitation,
  type MemoryCitation,
} from "@/lib/dante/citations";

type CitationStatus =
  | "valid"
  | "missing"
  | "quote_mismatch"
  | "page_mismatch"
  | "doc_missing"
  | "unverifiable";

type CitationLevel = "strong" | "confirmed" | "provenance";

interface CitationCheckLike {
  marker: string;
  type: "vault" | "memory";
  status: CitationStatus;
  level?: CitationLevel;
  detail?: string;
}

export interface CitationReport {
  overall:
    | "valid"
    | "partial"
    | "invalid"
    | "unverifiable"
    | "no_citations";
  checks: CitationCheckLike[];
  counts: {
    total: number;
    valid: number;
    failed: number;
    unverifiable: number;
  };
}

interface Props {
  content: string;
  trace: unknown;
  /** Validator output — when set, chips decorate with verified state. */
  citationReport?: CitationReport | null;
}

export default function CitationRenderer({ content, trace, citationReport }: Props) {
  const map: CitationMap = buildCitationMap(
    Array.isArray(trace) ? (trace as Parameters<typeof buildCitationMap>[0]) : [],
  );
  const tokens = tokenize(content);
  const [popover, setPopover] = useState<
    | { type: "vault"; data: VaultCitation; status?: CitationStatus; detail?: string }
    | { type: "memory"; data: MemoryCitation; status?: CitationStatus; detail?: string }
    | null
  >(null);

  // Walk the report in order, peeling off the next vault/memory
  // check as we hit each marker in document order. Maps each chip
  // occurrence to its check (handles repeat markers correctly).
  const statusByOccurrence = useMemo(() => {
    if (!citationReport?.checks?.length) return null;
    const vaultChecks = citationReport.checks.filter((c) => c.type === "vault");
    const memoryChecks = citationReport.checks.filter((c) => c.type === "memory");
    let vaultIdx = 0;
    let memoryIdx = 0;
    const map: Map<number, CitationCheckLike> = new Map();
    tokens.forEach((t, i) => {
      if (t.kind !== "citation") return;
      if (t.type === "vault" && vaultIdx < vaultChecks.length) {
        map.set(i, vaultChecks[vaultIdx++]);
      } else if (t.type === "memory" && memoryIdx < memoryChecks.length) {
        map.set(i, memoryChecks[memoryIdx++]);
      }
    });
    return map;
    // tokens is derived from content; safe to depend on the strings.
  }, [citationReport, tokens]);

  return (
    <>
      <div className="text-[var(--ink)] text-sm whitespace-pre-wrap leading-relaxed">
        {tokens.map((t, i) => {
          if (t.kind === "text") return <span key={i}>{t.value}</span>;
          const check = statusByOccurrence?.get(i);
          if (t.type === "vault") {
            const data = map.vault[t.key];
            return (
              <CitationChip
                key={i}
                label={t.raw}
                tone="vault"
                status={check?.status}
                level={check?.level}
                detail={check?.detail}
                disabled={!data}
                onClick={() =>
                  data && setPopover({ type: "vault", data, status: check?.status, detail: check?.detail })
                }
              />
            );
          }
          // memory
          const data = map.memory[t.key];
          return (
            <CitationChip
              key={i}
              label={t.raw}
              tone="memory"
              status={check?.status}
              level={check?.level}
              detail={check?.detail}
              disabled={!data}
              onClick={() =>
                data && setPopover({ type: "memory", data, status: check?.status, detail: check?.detail })
              }
            />
          );
        })}
      </div>

      {/* Validator summary line — quiet when everything verified, more
          prominent when something failed. */}
      {citationReport && citationReport.overall !== "no_citations" && (
        <CitationSummary report={citationReport} />
      )}

      {popover && (
        <CitationPopover popover={popover} onClose={() => setPopover(null)} />
      )}
    </>
  );
}

function CitationSummary({ report }: { report: CitationReport }) {
  const tone =
    report.overall === "valid"
      ? "text-emerald-700/70"
      : report.overall === "partial" || report.overall === "invalid"
        ? "text-amber-700"
        : "text-[var(--ink-subtle)]";
  const label =
    report.overall === "valid"
      ? `All ${report.counts.total} citation${report.counts.total === 1 ? "" : "s"} verified against source.`
      : report.overall === "partial"
        ? `${report.counts.valid} of ${report.counts.total} citations verified — ${report.counts.failed} need review.`
        : report.overall === "invalid"
          ? `${report.counts.failed} of ${report.counts.total} citations failed verification.`
          : `${report.counts.total} citation${report.counts.total === 1 ? "" : "s"} could not be verified (system unavailable).`;
  return (
    <div className={`mt-2 text-[11px] ${tone}`}>{label}</div>
  );
}

function CitationChip({
  label,
  tone,
  disabled,
  onClick,
  status,
  level,
  detail,
}: {
  label: string;
  tone: "vault" | "memory";
  disabled?: boolean;
  onClick: () => void;
  status?: CitationStatus;
  level?: CitationLevel;
  detail?: string;
}) {
  // Phase 4 W4.8 — graduated verification colors.
  //
  //   strong       → emerald ring (verified verbatim against cited page/chunk)
  //   confirmed    → light gold ring (verified verbatim somewhere in doc)
  //   provenance   → neutral / no ring (document confirmed, quote drifted)
  //   failed       → amber border + tinted bg (genuine problem)
  //   no level     → neutral
  const decoration =
    status === "valid" && level === "strong"
      ? "ring-1 ring-emerald-600/40"
      : status === "valid" && level === "confirmed"
        ? "ring-1 ring-amber-500/30"
        : status === "missing" ||
            status === "quote_mismatch" ||
            status === "page_mismatch" ||
            status === "doc_missing"
          ? "border-amber-500/60 bg-amber-50/40"
          : "";
  const title = disabled
    ? "Source not in trace"
    : detail
      ? `${detail} — click for source`
      : level === "strong"
        ? "Verified against cited page — click for source"
        : level === "confirmed"
          ? "Verified somewhere in source — click for details"
          : level === "provenance"
            ? "Source document confirmed — click for details"
            : "Click to view source";
  void tone;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`mx-0.5 align-baseline inline-flex items-center rounded-[3px] border px-1 py-0 text-[10px] font-mono transition disabled:opacity-50 disabled:cursor-not-allowed bg-[var(--ink)]/[0.04] border-[var(--rule)] text-[var(--ink)] hover:bg-[var(--ink)]/[0.08] ${decoration}`}
    >
      {label}
    </button>
  );
}

function CitationPopover({
  popover,
  onClose,
}: {
  popover:
    | { type: "vault"; data: VaultCitation; status?: CitationStatus; detail?: string }
    | { type: "memory"; data: MemoryCitation; status?: CitationStatus; detail?: string };
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onClick={onClose}
    >
      <div
        className="bg-[var(--canvas)] border border-[var(--rule)] rounded-[6px] w-full max-w-lg p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xs text-[var(--ink-muted)]">
            {popover.type === "vault" ? (
              <>
                <BookOpen className="w-3.5 h-3.5" strokeWidth={1.5} />
                Vault citation
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
                Memory citation · {popover.data.kind}
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-[var(--ink-subtle)] hover:text-[var(--ink)]"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        {popover.type === "vault" ? (
          <div>
            <div className="text-sm text-[var(--ink)] font-medium mb-1">
              {popover.data.source}
            </div>
            {popover.data.page != null && (
              <div className="text-xs text-[var(--ink-subtle)] mb-3">
                Page {popover.data.page}
              </div>
            )}
            <blockquote className="text-sm text-[var(--ink-muted)] border-l-2 border-amber-500/40 pl-3 whitespace-pre-wrap">
              {popover.data.quote}
            </blockquote>

            {/* Validator badge — only renders when the popover has a
                status (i.e. the chat surface ran the validator). */}
            {popover.status && popover.status !== "valid" && (
              <div className="mt-3 text-xs text-amber-700 border-l-2 border-amber-500 pl-3">
                {popover.detail ?? `Verification: ${popover.status}`}
              </div>
            )}
            {popover.status === "valid" && (
              <div className="mt-3 text-xs text-emerald-700/80">
                Verified against source document.
              </div>
            )}

            {/* Deep link into the source document. vault.cite returns
                document_ids that resolve in vault_items, so the right
                viewer is /vault/[id]. /dante/archive/[id] reads from
                the empty dante_archive_* tables and would 404. */}
            {popover.data.document_id && (
              <Link
                href={`/vault/${popover.data.document_id}${
                  popover.data.page != null ? `?page=${popover.data.page}` : ""
                }`}
                onClick={onClose}
                className="mt-4 inline-flex items-center gap-1.5 text-xs text-[var(--ink)] hover:text-[var(--accent)] underline-offset-2 hover:underline"
              >
                <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
                View in source document
              </Link>
            )}
          </div>
        ) : (
          <div>
            <div className="text-xs text-[var(--ink-subtle)] mb-2 font-mono">
              {popover.data.short_id}
              {popover.data.source_kind && ` · from ${popover.data.source_kind}`}
            </div>
            <div className="text-sm text-[var(--ink)] whitespace-pre-wrap">
              {popover.data.content}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
