"use client";

// app/dante/CitationRenderer.tsx
//
// Renders an assistant message with inline citation chips. Plain
// markdown text passes through; [v1] / [mem:abc12345] tokens become
// clickable chips that open a popover with the source row.
//
// We resolve citations from the same trace the message was written
// with — no extra API call. See lib/dante/citations.ts for the
// tokenizer + lookup builder.

import { useState } from "react";
import { BookOpen, Sparkles, X } from "lucide-react";
import {
  buildCitationMap,
  tokenize,
  type CitationMap,
  type VaultCitation,
  type MemoryCitation,
} from "@/lib/dante/citations";

interface Props {
  content: string;
  trace: unknown;
}

export default function CitationRenderer({ content, trace }: Props) {
  const map: CitationMap = buildCitationMap(
    Array.isArray(trace) ? (trace as Parameters<typeof buildCitationMap>[0]) : [],
  );
  const tokens = tokenize(content);
  const [popover, setPopover] = useState<
    | { type: "vault"; data: VaultCitation }
    | { type: "memory"; data: MemoryCitation }
    | null
  >(null);

  return (
    <>
      <div className="text-[var(--ink)] text-sm whitespace-pre-wrap leading-relaxed">
        {tokens.map((t, i) => {
          if (t.kind === "text") return <span key={i}>{t.value}</span>;
          if (t.type === "vault") {
            const data = map.vault[t.key];
            return (
              <CitationChip
                key={i}
                label={t.raw}
                tone="vault"
                disabled={!data}
                onClick={() => data && setPopover({ type: "vault", data })}
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
              disabled={!data}
              onClick={() => data && setPopover({ type: "memory", data })}
            />
          );
        })}
      </div>

      {popover && (
        <CitationPopover popover={popover} onClose={() => setPopover(null)} />
      )}
    </>
  );
}

function CitationChip({
  label,
  tone,
  disabled,
  onClick,
}: {
  label: string;
  tone: "vault" | "memory";
  disabled?: boolean;
  onClick: () => void;
}) {
  const palette =
    tone === "vault"
      ? "bg-amber-500/10 border-amber-500/30 text-amber-200/90 hover:bg-amber-500/20"
      : "bg-cyan-500/10 border-cyan-500/30 text-cyan-200/90 hover:bg-cyan-500/20";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? "Source not in trace" : "Click to view source"}
      className={`mx-0.5 align-baseline inline-flex items-center rounded-[3px] border px-1 py-0 text-[10px] font-mono transition disabled:opacity-50 disabled:cursor-not-allowed ${palette}`}
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
    | { type: "vault"; data: VaultCitation }
    | { type: "memory"; data: MemoryCitation };
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
