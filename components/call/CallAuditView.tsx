"use client";

// Grounded call summary view — every claim links back to the exact
// transcript segment(s) it came from. Renders the structured summary on
// the left and the full timestamped transcript on the right, with
// hover/click interactions to highlight the source segment. This is the
// "here's where this answer came from" view a compliance officer sees.

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
      className={`rounded-lg border p-3 text-sm transition cursor-default ${
        isActive
          ? "border-[#3166bf]/60 bg-[#3166bf]/10"
          : "border-[#e5e7eb] bg-white hover:border-[#3166bf]/30"
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#3166bf]" />
        <div className="flex-1">
          {prefix && <div className="mb-1">{prefix}</div>}
          <div className="text-[#151515]">{claim.text}</div>
          {claim.deadline && (
            <div className="mt-1 text-xs text-[#151515]/60">
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
                  className="inline-flex items-center gap-1 rounded-full bg-[#3166bf]/10 px-2 py-0.5 text-[11px] font-medium text-[#3166bf]"
                >
                  <Clock className="h-2.5 w-2.5" />
                  {seg ? formatTime(seg.start) : `#${id}`}
                </span>
              );
            })}
          </div>
          {sourceSegs.length > 0 && (
            <div className="mt-2 rounded-md border border-dashed border-[#3166bf]/30 bg-[#3166bf]/5 p-2 text-xs italic text-[#151515]/70">
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
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#3166bf]/10">
              <FileCheck2 className="h-5 w-5 text-[#3166bf]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#151515]">
                Call audit — {contactName}
              </h2>
              <p className="text-xs text-[#151515]/60">
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
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                  verifiedPct >= 90
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                    : verifiedPct >= 70
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-700"
                    : "border-rose-500/30 bg-rose-500/10 text-rose-700"
                }`}
              >
                {verifiedPct >= 90 ? (
                  <ShieldCheck className="h-3.5 w-3.5" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5" />
                )}
                Verified {structured!.verified_count}/
                {structured!.total_claims} ({verifiedPct}%)
              </span>
            )}
            {onDownloadAudit && (
              <button
                type="button"
                onClick={onDownloadAudit}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs font-medium text-[#151515] hover:border-[#3166bf] hover:text-[#3166bf]"
              >
                <Download className="h-3.5 w-3.5" />
                Audit packet
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#151515]/60 hover:bg-[#f3f4f6] hover:text-[#151515]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body: summary | transcript */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 overflow-hidden">
          {/* Summary column */}
          <div className="overflow-y-auto border-b md:border-b-0 md:border-r border-[#e5e7eb] bg-[#fafafa] p-5 space-y-5">
            {!hasStructured ? (
              <div className="text-sm text-[#151515]/60">
                This summary predates citation grounding, or the model did not
                return any claims that could be verified against the
                transcript. The raw summary is preserved on the note. New
                recordings will include source-linked claims.
              </div>
            ) : (
              <>
                {structured!.tldr && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#151515]/60 mb-2">
                      Summary
                    </h3>
                    <p className="text-sm text-[#151515] leading-relaxed">
                      {structured!.tldr}
                    </p>
                  </div>
                )}

                {structured!.key_points.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#151515]/60 mb-2">
                      Key Points
                    </h3>
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
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#151515]/60 mb-2">
                      Action Items
                    </h3>
                    <ul className="space-y-2">
                      {structured!.action_items.map((a, i) => (
                        <ClaimRow
                          key={i}
                          claim={a}
                          segments={segments}
                          onHighlight={setHighlighted}
                          highlighted={highlighted}
                          prefix={
                            <span className="inline-block rounded-full bg-[#151515] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
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
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#151515]/60 mb-2">
                      Follow-up Questions
                    </h3>
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
          <div className="overflow-y-auto p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#151515]/60 mb-3 sticky top-0 bg-white pb-2">
              Transcript
              {segments.length > 0 && (
                <span className="ml-2 font-normal normal-case text-[#151515]/40">
                  ({segments.length} segments)
                </span>
              )}
            </h3>
            {segments.length === 0 ? (
              <p className="text-sm text-[#151515]/70 whitespace-pre-wrap leading-relaxed">
                {transcript}
              </p>
            ) : (
              <div className="space-y-1">
                {segments.map((s) => {
                  const isHl =
                    highlighted !== null && highlighted.includes(s.id);
                  return (
                    <div
                      key={s.id}
                      id={`seg-${s.id}`}
                      className={`flex gap-3 rounded-md p-2 transition ${
                        isHl
                          ? "bg-[#3166bf]/15 ring-1 ring-[#3166bf]/40"
                          : "hover:bg-[#f3f4f6]"
                      }`}
                    >
                      <span className="flex-shrink-0 text-[11px] font-mono text-[#151515]/40 w-12 tabular-nums">
                        {formatTime(s.start)}
                      </span>
                      <span className="flex-1 text-sm text-[#151515]/85 leading-relaxed">
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
