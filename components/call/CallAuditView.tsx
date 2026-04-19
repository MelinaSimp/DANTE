"use client";

// Grounded call summary view — every claim links back to the exact
// transcript segment(s) it came from. Renders the structured summary on
// the left and the full timestamped transcript on the right, with
// hover/click interactions to highlight the source segment.
//
// This is the "here's where this answer came from" view a compliance
// officer sees. Design language: Harvey-style editorial — serif display,
// 1px rules, no shadows, timestamps in mono, one accent for citations.

import { useMemo, useState } from "react";
import {
  X,
  FileCheck2,
  Clock,
  Download,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";

type Segment = {
  id: number;
  start: number;
  end: number;
  text: string;
};

type Claim = {
  text: string;
  cite_segments: number[];
  owner?: string;
  deadline?: string | null;
};

export type StructuredSummary = {
  tldr: string;
  key_points: Claim[];
  action_items: Claim[];
  follow_ups: Claim[];
  verified_count: number;
  total_claims: number;
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function ClaimRow({
  claim,
  segments,
  onHighlight,
  highlighted,
  prefix,
}: {
  claim: Claim;
  segments: Segment[];
  onHighlight: (ids: number[] | null) => void;
  highlighted: number[] | null;
  prefix?: React.ReactNode;
}) {
  const isActive =
    highlighted &&
    claim.cite_segments.some((id) => highlighted.includes(id));
  const sourceSegs = segments.filter((s) =>
    claim.cite_segments.includes(s.id)
  );

  return (
    <li
      onMouseEnter={() => onHighlight(claim.cite_segments)}
      onMouseLeave={() => onHighlight(null)}
      className="border p-3 text-sm transition cursor-default"
      style={{
        borderColor: isActive ? "var(--accent)" : "var(--rule)",
        background: isActive ? "var(--accent-soft)" : "var(--canvas)",
        borderRadius: "var(--r-card)",
      }}
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full"
          style={{ background: "var(--accent)" }}
        />
        <div className="flex-1">
          {prefix && <div className="mb-1.5">{prefix}</div>}
          <div style={{ color: "var(--ink)" }} className="prose-body">
            {claim.text}
          </div>
          {claim.deadline && (
            <div
              className="mt-1 text-xs mono"
              style={{ color: "var(--ink-muted)" }}
            >
              Due: {claim.deadline}
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-1">
            {claim.cite_segments.map((id) => {
              const seg = segments.find((s) => s.id === id);
              return (
                <span
                  key={id}
                  title={seg?.text}
                  className="chip-citation inline-flex items-center gap-1"
                >
                  <Clock className="h-2.5 w-2.5" />
                  {seg ? formatTime(seg.start) : `#${id}`}
                </span>
              );
            })}
          </div>
          {sourceSegs.length > 0 && (
            <div
              className="mt-2 border border-dashed p-2 text-xs italic"
              style={{
                borderColor: "var(--accent)",
                background: "var(--accent-soft)",
                color: "var(--ink-muted)",
                borderRadius: "var(--r-card)",
                opacity: 0.9,
              }}
            >
              {sourceSegs.map((s) => (
                <div key={s.id}>&ldquo;{s.text}&rdquo;</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

export default function CallAuditView({
  open,
  onClose,
  contactName,
  createdAt,
  transcript,
  segments,
  structured,
  onDownloadAudit,
}: {
  open: boolean;
  onClose: () => void;
  contactName: string;
  createdAt: string;
  transcript: string;
  segments: Segment[];
  structured: StructuredSummary | null;
  onDownloadAudit?: () => void;
}) {
  const [highlighted, setHighlighted] = useState<number[] | null>(null);

  const verifiedPct = useMemo(() => {
    if (!structured || structured.total_claims === 0) return null;
    return Math.round(
      (structured.verified_count / structured.total_claims) * 100
    );
  }, [structured]);

  if (!open) return null;

  const hasStructured =
    structured &&
    (structured.key_points.length > 0 ||
      structured.action_items.length > 0 ||
      structured.follow_ups.length > 0);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: "rgba(21,21,21,0.45)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col border"
        style={{
          borderColor: "var(--rule)",
          background: "var(--canvas)",
          borderRadius: "var(--r-card)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: "var(--rule)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="p-2"
              style={{
                background: "var(--accent-soft)",
                borderRadius: "var(--r-card)",
              }}
            >
              <FileCheck2
                className="h-5 w-5"
                style={{ color: "var(--accent)" }}
              />
            </div>
            <div>
              <div className="label-section mb-1">Call audit</div>
              <h2
                className="heading-display text-2xl"
                style={{ color: "var(--ink)" }}
              >
                {contactName}
              </h2>
              <p
                className="text-xs mono mt-0.5"
                style={{ color: "var(--ink-muted)" }}
              >
                {new Date(createdAt).toLocaleString("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {verifiedPct !== null && (
              <span
                className={
                  verifiedPct >= 90
                    ? "chip-verified inline-flex items-center gap-1.5"
                    : "chip-flag inline-flex items-center gap-1.5"
                }
              >
                {verifiedPct >= 90 ? (
                  <ShieldCheck className="h-3.5 w-3.5" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5" />
                )}
                {structured!.verified_count}/{structured!.total_claims} verified
                ({verifiedPct}%)
              </span>
            )}
            {onDownloadAudit && (
              <button
                type="button"
                onClick={onDownloadAudit}
                className="inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-medium transition"
                style={{
                  borderColor: "var(--rule)",
                  color: "var(--ink)",
                  borderRadius: "var(--r-input)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--accent)";
                  e.currentTarget.style.color = "var(--accent)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--rule)";
                  e.currentTarget.style.color = "var(--ink)";
                }}
              >
                <Download className="h-3.5 w-3.5" />
                Audit packet
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 transition"
              style={{
                color: "var(--ink-muted)",
                borderRadius: "var(--r-input)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--canvas-subtle)";
                e.currentTarget.style.color = "var(--ink)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--ink-muted)";
              }}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body: summary | transcript */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 overflow-hidden">
          {/* Summary column */}
          <div
            className="overflow-y-auto border-b md:border-b-0 md:border-r p-6 space-y-6"
            style={{
              borderColor: "var(--rule)",
              background: "var(--canvas-subtle)",
            }}
          >
            {!hasStructured ? (
              <div
                className="prose-body text-sm"
                style={{ color: "var(--ink-muted)" }}
              >
                This summary predates citation grounding, or the model did not
                return any claims that could be verified against the
                transcript. The raw summary is preserved on the note. New
                recordings will include source-linked claims.
              </div>
            ) : (
              <>
                {structured!.tldr && (
                  <div>
                    <h3 className="label-section mb-2">Summary</h3>
                    <p
                      className="prose-body"
                      style={{ color: "var(--ink)" }}
                    >
                      {structured!.tldr}
                    </p>
                  </div>
                )}

                {structured!.key_points.length > 0 && (
                  <div>
                    <h3 className="label-section mb-2">Key points</h3>
                    <ul className="space-y-2">
                      {structured!.key_points.map((p, i) => (
                        <ClaimRow
                          key={i}
                          claim={p}
                          segments={segments}
                          onHighlight={setHighlighted}
                          highlighted={highlighted}
                        />
                      ))}
                    </ul>
                  </div>
                )}

                {structured!.action_items.length > 0 && (
                  <div>
                    <h3 className="label-section mb-2">Action items</h3>
                    <ul className="space-y-2">
                      {structured!.action_items.map((a, i) => (
                        <ClaimRow
                          key={i}
                          claim={a}
                          segments={segments}
                          onHighlight={setHighlighted}
                          highlighted={highlighted}
                          prefix={
                            <span
                              className="label-section"
                              style={{
                                color: "var(--ink)",
                                letterSpacing: "0.1em",
                              }}
                            >
                              {a.owner || "Unclear"}
                            </span>
                          }
                        />
                      ))}
                    </ul>
                  </div>
                )}

                {structured!.follow_ups.length > 0 && (
                  <div>
                    <h3 className="label-section mb-2">Follow-up questions</h3>
                    <ul className="space-y-2">
                      {structured!.follow_ups.map((f, i) => (
                        <ClaimRow
                          key={i}
                          claim={f}
                          segments={segments}
                          onHighlight={setHighlighted}
                          highlighted={highlighted}
                        />
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Transcript column */}
          <div className="overflow-y-auto p-6">
            <div
              className="sticky top-0 pb-3 mb-3 flex items-baseline gap-2 border-b"
              style={{
                background: "var(--canvas)",
                borderColor: "var(--rule)",
              }}
            >
              <h3 className="label-section">Transcript</h3>
              {segments.length > 0 && (
                <span
                  className="text-[11px] mono"
                  style={{ color: "var(--ink-subtle)" }}
                >
                  {segments.length} segments
                </span>
              )}
            </div>
            {segments.length === 0 ? (
              <p
                className="prose-body text-sm whitespace-pre-wrap"
                style={{ color: "var(--ink-muted)" }}
              >
                {transcript}
              </p>
            ) : (
              <div className="space-y-0.5">
                {segments.map((s) => {
                  const isHl =
                    highlighted !== null && highlighted.includes(s.id);
                  return (
                    <div
                      key={s.id}
                      id={`seg-${s.id}`}
                      className="flex gap-3 p-2 transition"
                      style={{
                        background: isHl
                          ? "var(--accent-soft)"
                          : "transparent",
                        borderLeft: isHl
                          ? `2px solid var(--accent)`
                          : "2px solid transparent",
                        borderRadius: "var(--r-input)",
                      }}
                      onMouseEnter={(e) => {
                        if (!isHl)
                          e.currentTarget.style.background =
                            "var(--canvas-subtle)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isHl)
                          e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <span
                        className="flex-shrink-0 text-[11px] mono w-12 tabular-nums"
                        style={{ color: "var(--ink-subtle)" }}
                      >
                        {formatTime(s.start)}
                      </span>
                      <span
                        className="flex-1 prose-body text-sm"
                        style={{ color: "var(--ink)" }}
                      >
                        {s.text}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
