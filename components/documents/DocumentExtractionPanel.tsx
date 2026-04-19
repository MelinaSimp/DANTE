"use client";

// Compact extraction review panel for the document viewer sidebar.
//
// Shows the user the fields + rows pulled out of a client-uploaded PDF
// (1099-B, 1099-DIV, 1099-R to start). If no extraction exists yet the
// panel offers a doc-type picker + Extract button that fires
// POST /api/documents/[id]/extract. Everything stays self-contained —
// the parent only needs to pass documentId.
//
// Design: Harvey tokens throughout, no shadows, 1px rules, mono for
// numbers + codes. Fields render as a key→value table; row data (e.g.
// 1099-B transactions) renders as a compact scrollable mini-table
// because advisors need to see the line items.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FileText,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";

type DocTypeOption = {
  value: "form_1099_b" | "form_1099_div" | "form_1099_r";
  label: string;
};

const DOC_TYPES: DocTypeOption[] = [
  { value: "form_1099_b", label: "1099-B (Broker proceeds)" },
  { value: "form_1099_div", label: "1099-DIV (Dividends)" },
  { value: "form_1099_r", label: "1099-R (Retirement distributions)" },
];

type Extraction = {
  id: string;
  doc_type: string;
  model: string;
  prompt_version: string;
  tax_year: number | null;
  fields: Record<string, unknown>;
  rows: Array<Record<string, unknown>>;
  confidence: number;
  confidence_detail: Record<string, number> | null;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
};

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") {
    // Format dollar-ish numbers with commas.
    if (Math.abs(v) >= 1 && !Number.isInteger(v)) {
      return v.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
    return v.toLocaleString("en-US");
  }
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

function formatLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function DocumentExtractionPanel({
  documentId,
}: {
  documentId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [extractions, setExtractions] = useState<Extraction[]>([]);
  const [selectedDocType, setSelectedDocType] =
    useState<DocTypeOption["value"]>("form_1099_b");
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/documents/${documentId}/extractions`, {
        credentials: "include",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j?.error || "Failed to load");
        return;
      }
      setExtractions((j?.extractions as Extraction[]) || []);
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    load();
  }, [load]);

  async function runExtraction() {
    setRunning(true);
    setErr(null);
    try {
      const r = await fetch(`/api/documents/${documentId}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ docType: selectedDocType }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j?.error || `Extract failed (${r.status})`);
        return;
      }
      await load();
      setExpanded(true);
    } catch (e: any) {
      setErr(e?.message || "Extract failed");
    } finally {
      setRunning(false);
    }
  }

  const latest = extractions[0];

  const hasData =
    latest &&
    (Object.keys(latest.fields || {}).length > 0 ||
      (latest.rows || []).length > 0);

  const confidencePct = useMemo(() => {
    if (!latest) return null;
    if (typeof latest.confidence !== "number") return null;
    return Math.round(latest.confidence * 100);
  }, [latest]);

  return (
    <div
      className="border"
      style={{
        borderColor: "var(--rule)",
        background: "var(--canvas)",
        borderRadius: "var(--r-card)",
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
      >
        {expanded ? (
          <ChevronDown
            className="h-3.5 w-3.5"
            style={{ color: "var(--ink-muted)" }}
          />
        ) : (
          <ChevronRight
            className="h-3.5 w-3.5"
            style={{ color: "var(--ink-muted)" }}
          />
        )}
        <FileText
          className="h-3.5 w-3.5"
          style={{ color: "var(--accent)" }}
        />
        <span
          className="label-section flex-1"
          style={{ color: "var(--ink)" }}
        >
          Extract data
        </span>
        {hasData && confidencePct !== null && (
          <span
            className={
              confidencePct >= 85
                ? "chip-verified inline-flex items-center gap-1"
                : "chip-flag inline-flex items-center gap-1"
            }
            title="Model's self-reported min confidence across required fields"
          >
            {confidencePct >= 85 ? (
              <ShieldCheck className="h-2.5 w-2.5" />
            ) : (
              <AlertTriangle className="h-2.5 w-2.5" />
            )}
            {confidencePct}%
          </span>
        )}
      </button>

      {expanded && (
        <div
          className="px-3 pb-3 space-y-3 border-t"
          style={{ borderColor: "var(--rule)" }}
        >
          {/* Trigger row — always visible so the user can re-run or pick a
              different doc type. */}
          <div className="flex items-center gap-2 pt-3">
            <select
              value={selectedDocType}
              onChange={(e) =>
                setSelectedDocType(e.target.value as DocTypeOption["value"])
              }
              className="flex-1 text-xs px-2 py-1.5 outline-none"
              style={{
                border: "1px solid var(--rule)",
                background: "var(--canvas)",
                color: "var(--ink)",
                borderRadius: "var(--r-input)",
              }}
            >
              {DOC_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={runExtraction}
              disabled={running}
              className="text-xs inline-flex items-center gap-1.5 px-2.5 py-1.5 transition"
              style={{
                background: "var(--ink)",
                color: "var(--canvas)",
                borderRadius: "var(--r-input)",
                opacity: running ? 0.5 : 1,
                cursor: running ? "not-allowed" : "pointer",
              }}
            >
              {running ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              {running
                ? "Extracting…"
                : hasData
                ? "Re-run"
                : "Extract"}
            </button>
          </div>

          {err && (
            <div
              className="text-xs px-2 py-1.5"
              style={{
                color: "var(--danger)",
                background: "var(--danger-soft)",
                border: "1px solid var(--danger)",
                borderRadius: "var(--r-input)",
              }}
            >
              {err}
            </div>
          )}

          {loading && !latest && (
            <div
              className="text-xs mono"
              style={{ color: "var(--ink-subtle)" }}
            >
              Loading…
            </div>
          )}

          {!loading && !latest && !err && (
            <div
              className="text-xs leading-relaxed"
              style={{ color: "var(--ink-muted)" }}
            >
              No extraction yet. Pick a form type above and hit Extract.
              The model reads the already-parsed text on this document
              and returns structured fields you can cross-check against
              custodian cost basis.
            </div>
          )}

          {latest && (
            <div className="space-y-3">
              <div
                className="flex items-center gap-2 text-[10px] mono uppercase tracking-wider"
                style={{ color: "var(--ink-subtle)" }}
              >
                <span>{formatLabel(latest.doc_type)}</span>
                {latest.tax_year && <span>· TY {latest.tax_year}</span>}
                <span>· {latest.model}</span>
              </div>

              {/* Scalar fields */}
              {Object.keys(latest.fields || {}).length > 0 && (
                <div>
                  <div
                    className="label-section mb-1.5"
                    style={{ color: "var(--ink-muted)" }}
                  >
                    Fields
                  </div>
                  <div
                    className="border divide-y"
                    style={{
                      borderColor: "var(--rule)",
                      borderRadius: "var(--r-card)",
                    }}
                  >
                    {Object.entries(latest.fields).map(([k, v]) => {
                      const conf = latest.confidence_detail?.[k];
                      const isLow = typeof conf === "number" && conf < 0.6;
                      return (
                        <div
                          key={k}
                          className="flex items-baseline gap-2 px-2 py-1.5 text-xs"
                          style={{
                            color: "var(--ink)",
                          }}
                        >
                          <span
                            className="flex-shrink-0"
                            style={{ color: "var(--ink-muted)" }}
                          >
                            {formatLabel(k)}
                          </span>
                          <span className="flex-1 text-right mono tabular-nums">
                            {formatValue(v)}
                          </span>
                          {isLow && (
                            <AlertTriangle
                              className="h-3 w-3 flex-shrink-0"
                              style={{ color: "var(--flag, var(--accent))" }}
                              aria-label={`Low confidence (${Math.round(
                                conf! * 100
                              )}%)`}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Row data */}
              {(latest.rows || []).length > 0 && (
                <div>
                  <div
                    className="label-section mb-1.5"
                    style={{ color: "var(--ink-muted)" }}
                  >
                    Rows · {latest.rows.length}
                  </div>
                  <div
                    className="overflow-x-auto border"
                    style={{
                      borderColor: "var(--rule)",
                      borderRadius: "var(--r-card)",
                      maxHeight: 280,
                    }}
                  >
                    <table
                      className="min-w-full text-xs"
                      style={{ color: "var(--ink)" }}
                    >
                      <thead
                        className="sticky top-0"
                        style={{
                          background: "var(--canvas-subtle)",
                          borderBottom: "1px solid var(--rule)",
                        }}
                      >
                        <tr>
                          {Object.keys(latest.rows[0]).map((k) => (
                            <th
                              key={k}
                              className="text-left px-2 py-1.5 label-section"
                              style={{
                                color: "var(--ink-muted)",
                                fontSize: 9,
                              }}
                            >
                              {formatLabel(k)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {latest.rows.map((row, i) => (
                          <tr
                            key={i}
                            style={{
                              borderTop:
                                i === 0 ? undefined : "1px solid var(--rule)",
                            }}
                          >
                            {Object.entries(row).map(([k, v]) => (
                              <td
                                key={k}
                                className="px-2 py-1.5 mono tabular-nums whitespace-nowrap"
                              >
                                {formatValue(v)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
