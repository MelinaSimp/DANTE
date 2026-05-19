"use client";

// Fill-template flow — only mounted on vault items with kind='template'.
// Opens a side-panel that lets the user pick a contact + property +
// extra instructions, then asks Dante to fill the template via
// /api/vault/[id]/fill. Result is rendered side-by-side (template ↔
// filled output + citations); a "Download PDF" button wraps the
// filled text into a jsPDF document for the user to send.

import { useEffect, useMemo, useState } from "react";
import {
  Sparkles,
  Loader2,
  X,
  AlertCircle,
  Download,
  CheckCircle2,
  Eye,
  EyeOff,
} from "lucide-react";

// ── Word-level diff (LCS-based) ─────────────────────────────────
//
// Used by the "Show edits" toggle so the user can see exactly which
// runs of text Dante added when filling the template. Splits on
// whitespace boundaries, runs an O(m*n) LCS, then walks the table
// to produce same/add/remove segments. Templates here are < a few
// thousand words so the quadratic memory is fine; if that ever
// changes, swap for a streaming diff.

type DiffSegment = { kind: "same" | "add" | "remove"; text: string };

function diffByWords(a: string, b: string): DiffSegment[] {
  const aw = a.split(/(\s+)/);
  const bw = b.split(/(\s+)/);
  const m = aw.length;
  const n = bw.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (aw[i] === bw[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffSegment[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (aw[i] === bw[j]) {
      out.push({ kind: "same", text: aw[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ kind: "remove", text: aw[i] });
      i++;
    } else {
      out.push({ kind: "add", text: bw[j] });
      j++;
    }
  }
  while (i < m) out.push({ kind: "remove", text: aw[i++] });
  while (j < n) out.push({ kind: "add", text: bw[j++] });
  return out;
}

interface Contact {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
}
interface Property {
  id: string;
  address_line1: string;
  city: string | null;
}

interface Field {
  name: string;
  value: string | null;
  source: string;
  missing_reason?: string;
}

interface FillResult {
  fields: Field[];
  filled_text: string;
  template_text: string;
  cost_cents_estimate: number;
}

export default function FillTemplateButton({
  templateId,
  templateTitle,
  initialPropertyId,
}: {
  templateId: string;
  templateTitle: string;
  /** If the template has a property already linked, prefill the picker. */
  initialPropertyId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [contactId, setContactId] = useState("");
  const [propertyId, setPropertyId] = useState(initialPropertyId ?? "");
  const [instructions, setInstructions] = useState("");
  const [filling, setFilling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FillResult | null>(null);
  // "edits" highlights additions inline on the filled side; "clean"
  // shows just the final draft text. Defaults to edits because the
  // user's first instinct is "what did the AI change?".
  const [viewMode, setViewMode] = useState<"edits" | "clean">("edits");

  useEffect(() => {
    if (!open) return;
    fetch("/api/contacts", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setContacts(Array.isArray(d) ? d : []))
      .catch(() => setContacts([]));
    fetch("/api/properties", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setProperties(Array.isArray(d) ? d : []))
      .catch(() => setProperties([]));
  }, [open]);

  const submit = async () => {
    setFilling(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch(`/api/vault/${templateId}/fill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          contact_id: contactId || null,
          property_id: propertyId || null,
          instructions,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || "Fill failed");
      }
      setResult(await r.json());
    } catch (e: any) {
      setError(e.message || "Fill failed");
    } finally {
      setFilling(false);
    }
  };

  const downloadPdf = async () => {
    if (!result) return;
    // Lazy-load jspdf so the bundle stays small for users who never fill.
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "letter" });

    const margin = 54; // 0.75"
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const usable = pageWidth - margin * 2;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(templateTitle, margin, margin);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    let y = margin + 28;
    const lineHeight = 14;

    const lines = doc.splitTextToSize(result.filled_text, usable) as string[];
    for (const line of lines) {
      if (y + lineHeight > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += lineHeight;
    }

    // Footer with citations
    if (result.fields.length > 0) {
      doc.addPage();
      y = margin;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Citations", margin, y);
      y += 18;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      for (const f of result.fields) {
        const value = f.value ?? "[not filled]";
        const text = `• ${f.name}: ${value}  (source: ${f.source})`;
        const wrapped = doc.splitTextToSize(text, usable) as string[];
        for (const w of wrapped) {
          if (y + lineHeight > pageHeight - margin) {
            doc.addPage();
            y = margin;
          }
          doc.text(w, margin, y);
          y += lineHeight;
        }
      }
    }

    const safeTitle = templateTitle.replace(/[^a-z0-9-_ ]/gi, "_").slice(0, 80);
    doc.save(`${safeTitle} — filled.pdf`);
  };

  const selectedContact = useMemo(
    () => contacts.find((c) => c.id === contactId),
    [contacts, contactId]
  );
  const missingFields = result?.fields.filter((f) => f.value == null) ?? [];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-xs font-semibold hover:opacity-90 transition"
      >
        <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} /> Fill template
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/30 backdrop-blur-sm px-4 py-8"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="bg-[var(--canvas)] border border-[var(--rule)] rounded-[6px] shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-[var(--rule)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles
                  className="w-4 h-4 text-[var(--accent)]"
                  strokeWidth={1.5}
                />
                <h3 className="text-sm font-semibold text-[var(--ink)]">
                  Fill template — {templateTitle}
                </h3>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)] transition"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Picker form */}
              <div className="grid md:grid-cols-2 gap-3">
                <label className="block">
                  <div className="text-xs font-medium text-[var(--ink-muted)] mb-1.5">
                    Client
                  </div>
                  <select
                    value={contactId}
                    onChange={(e) => setContactId(e.target.value)}
                    className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
                  >
                    <option value="">— Pick a client —</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name || c.email || "(no name)"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <div className="text-xs font-medium text-[var(--ink-muted)] mb-1.5">
                    Property (optional)
                  </div>
                  <select
                    value={propertyId}
                    onChange={(e) => setPropertyId(e.target.value)}
                    className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
                  >
                    <option value="">— No property —</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.address_line1}
                        {p.city ? `, ${p.city}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block">
                <div className="text-xs font-medium text-[var(--ink-muted)] mb-1.5">
                  Extra instructions (optional)
                </div>
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  rows={2}
                  placeholder="e.g. Use a 30-day closing window. Buyer is paying all closing costs."
                  className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)] resize-y"
                />
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={submit}
                  disabled={filling}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-semibold disabled:opacity-50"
                >
                  {filling ? (
                    <Loader2
                      className="w-4 h-4 animate-spin"
                      strokeWidth={1.5}
                    />
                  ) : (
                    <Sparkles className="w-4 h-4" strokeWidth={1.5} />
                  )}
                  {filling ? "Filling…" : result ? "Re-fill" : "Generate draft"}
                </button>
                {selectedContact && !result && (
                  <span className="text-[11px] text-[var(--ink-subtle)]">
                    Pulling tagged docs for {selectedContact.name || selectedContact.email}.
                  </span>
                )}
              </div>

              {error && (
                <div className="px-3 py-2 text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger)]/30 rounded-[4px] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" strokeWidth={1.5} /> {error}
                </div>
              )}

              {/* Result side-by-side */}
              {result && (
                <div className="space-y-4 pt-4 border-t border-[var(--rule)]">
                  <div className="flex items-baseline justify-between flex-wrap gap-2">
                    <div className="label-section">Draft</div>
                    <div className="flex items-center gap-3">
                      {missingFields.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-[var(--flag)]">
                          <AlertCircle
                            className="w-3.5 h-3.5"
                            strokeWidth={1.5}
                          />
                          {missingFields.length} field
                          {missingFields.length === 1 ? "" : "s"} missing
                        </span>
                      )}
                      {missingFields.length === 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-[var(--verified)]">
                          <CheckCircle2
                            className="w-3.5 h-3.5"
                            strokeWidth={1.5}
                          />
                          All fields filled
                        </span>
                      )}
                      <span className="text-[10px] mono text-[var(--ink-subtle)]">
                        ~{(result.cost_cents_estimate / 100).toFixed(2)}¢ this fill
                      </span>
                      <button
                        onClick={() =>
                          setViewMode((v) => (v === "edits" ? "clean" : "edits"))
                        }
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] text-[11px] font-medium text-[var(--ink-muted)] transition"
                        title={
                          viewMode === "edits"
                            ? "Hide highlights of what Dante added"
                            : "Highlight what Dante added"
                        }
                      >
                        {viewMode === "edits" ? (
                          <>
                            <EyeOff className="w-3 h-3" strokeWidth={1.5} />
                            Hide edits
                          </>
                        ) : (
                          <>
                            <Eye className="w-3 h-3" strokeWidth={1.5} />
                            Show edits
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="border border-[var(--rule)] rounded-[4px] p-3 max-h-[400px] overflow-y-auto">
                      <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-2">
                        Original template
                      </div>
                      <pre className="whitespace-pre-wrap text-[12px] text-[var(--ink-muted)] leading-relaxed font-sans">
                        {result.template_text}
                      </pre>
                    </div>
                    <div className="border border-[var(--rule)] rounded-[4px] p-3 max-h-[400px] overflow-y-auto bg-[var(--canvas-subtle)]">
                      <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-2 flex items-center gap-2">
                        <span>Filled draft</span>
                        {viewMode === "edits" && (
                          <span className="text-[var(--verified)] normal-case tracking-normal">
                            · highlights show what Dante added
                          </span>
                        )}
                      </div>
                      <pre className="whitespace-pre-wrap text-[12px] text-[var(--ink)] leading-relaxed font-sans">
                        {viewMode === "clean"
                          ? result.filled_text
                          : diffByWords(
                              result.template_text,
                              result.filled_text
                            )
                              .filter((seg) => seg.kind !== "remove")
                              .map((seg, i) =>
                                seg.kind === "add" ? (
                                  <mark
                                    key={i}
                                    className="px-0.5 rounded-[2px] bg-[var(--verified-soft)] text-[var(--ink)] not-italic"
                                  >
                                    {seg.text}
                                  </mark>
                                ) : (
                                  <span key={i}>{seg.text}</span>
                                )
                              )}
                      </pre>
                    </div>
                  </div>

                  {/* Field citations */}
                  <div>
                    <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-2">
                      Citations
                    </div>
                    <ul className="divide-y divide-[var(--rule)] border-t border-b border-[var(--rule)]">
                      {result.fields.map((f, i) => (
                        <li key={i} className="py-2 flex items-baseline gap-3">
                          <span className="text-xs font-medium text-[var(--ink)] shrink-0 min-w-[140px]">
                            {f.name}
                          </span>
                          <span
                            className={`text-xs flex-1 ${
                              f.value
                                ? "text-[var(--ink)]"
                                : "italic text-[var(--ink-subtle)]"
                            }`}
                          >
                            {f.value ?? `[empty — ${f.missing_reason ?? "no source"}]`}
                          </span>
                          <span className="text-[10px] mono text-[var(--ink-subtle)] shrink-0">
                            {f.source}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={downloadPdf}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-semibold hover:opacity-90 transition"
                    >
                      <Download className="w-4 h-4" strokeWidth={1.5} />
                      Download PDF
                    </button>
                    <span className="text-[11px] text-[var(--ink-subtle)]">
                      Review the draft before sending — Dante only fills what's
                      grounded in the source data.
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
