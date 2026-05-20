"use client";

// CSV contact importer.
//
// Flow: pick a file → parse client-side → auto-map columns against
// well-known aliases → preview the first 3 rows → user confirms or
// adjusts the mapping → POST to /api/contacts/import. Results show
// imported count + a scrollable list of skipped rows with reasons.
//
// Intentionally small-surface: we only ask the user to intervene on
// column mapping when auto-detection isn't confident about the name
// field. Most exports (Google Contacts, Wealthbox, Redtail, Follow Up
// Boss, kvCORE) have recognisable headers — the alias table in
// lib/csv.ts handles them without a mapping step.

import { useCallback, useMemo, useRef, useState } from "react";
import { Upload, X, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { parseCsv, detectMapping } from "@/lib/csv";

type FieldKey = "name" | "first_name" | "last_name" | "phone" | "email" | "notes";

interface ImportResult {
  imported: number;
  skipped: { row: number; name?: string; reason: string }[];
  message?: string;
}

interface Props {
  onClose: () => void;
  // Called after a successful import so the parent can refetch the list.
  onImported: () => void;
}

export default function ContactImporter({ onClose, onImported }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, number | null>>({
    name: null,
    first_name: null,
    last_name: null,
    phone: null,
    email: null,
    notes: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setResult(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.rows.length === 0) {
        setError("That file looked empty once we parsed it.");
        setHeaders([]);
        setRows([]);
        return;
      }
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      const detected = detectMapping(parsed.headers);
      setMapping({
        name: detected.name ?? null,
        first_name: detected.first_name ?? null,
        last_name: detected.last_name ?? null,
        phone: detected.phone ?? null,
        email: detected.email ?? null,
        notes: detected.notes ?? null,
      });
    } catch (e: any) {
      setError(e?.message || "Couldn't read that file.");
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  // Derive the actual contact records that would be imported, given
  // the current mapping. Used for the preview and the submit payload.
  const derived = useMemo(() => {
    return rows.map((row) => {
      const pick = (key: FieldKey) => {
        const idx = mapping[key];
        return idx == null ? "" : (row[idx] ?? "").trim();
      };
      // If the CSV has separate first/last name columns and no combined
      // name, synthesize the combined name. If both exist, prefer the
      // combined one (e.g. Google Contacts has both but "Name" is the
      // display-ready version).
      const nameDirect = pick("name");
      const first = pick("first_name");
      const last = pick("last_name");
      const composed = [first, last].filter(Boolean).join(" ").trim();
      const name = nameDirect || composed;
      return {
        name,
        phone: pick("phone"),
        email: pick("email"),
        notes: pick("notes"),
      };
    });
  }, [rows, mapping]);

  const readyCount = useMemo(
    () => derived.filter((r) => r.name.length > 0).length,
    [derived],
  );
  const hasFile = rows.length > 0;
  const hasName = mapping.name != null || mapping.first_name != null;

  async function handleSubmit() {
    if (!hasName) {
      setError("We need at least a name column to import contacts.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const contacts = derived.filter((r) => r.name.length > 0);
      const res = await fetch("/api/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ contacts }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Import failed.");
      }
      setResult(json as ImportResult);
      if (json.imported > 0) onImported();
    } catch (e: any) {
      setError(e?.message || "Import failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-hidden bg-[var(--canvas)] rounded-xl shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--glass-border)]">
          <div>
            <h2 className="text-lg font-semibold text-[#151515]">
              Import contacts
            </h2>
            <p className="text-xs text-[var(--ink-muted)] mt-0.5">
              CSV export from Google Contacts, Wealthbox, Redtail, Follow Up
              Boss, kvCORE, or any spreadsheet.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--ink-muted)] hover:text-[#151515] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {!hasFile && !result && (
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[var(--glass-border)] px-6 py-14 cursor-pointer hover:border-[#3166bf] hover:bg-[#f9fafb] transition"
            >
              <Upload className="w-8 h-8 text-[#9ca3af]" strokeWidth={1.5} />
              <div className="text-center">
                <div className="text-sm font-medium text-[#151515]">
                  Drop a CSV here, or click to choose
                </div>
                <div className="text-xs text-[var(--ink-muted)] mt-1">
                  First row should be column headers (name, phone, email…)
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
            </label>
          )}

          {hasFile && !result && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 text-xs text-[var(--ink-muted)]">
                <FileText className="w-4 h-4" strokeWidth={1.5} />
                <span>{fileName}</span>
                <span className="text-[#9ca3af]">·</span>
                <span>
                  {rows.length} row{rows.length === 1 ? "" : "s"} detected
                </span>
                <button
                  onClick={() => {
                    setFileName(null);
                    setHeaders([]);
                    setRows([]);
                  }}
                  className="ml-auto text-xs text-[#3166bf] hover:underline"
                >
                  Change file
                </button>
              </div>

              {/* Column mapping — only shown when auto-detection left
                  something blank or ambiguous. If auto-detection nailed
                  it we still show it so the user can sanity-check. */}
              <div>
                <div className="text-xs font-medium text-[#151515] mb-2">
                  Column mapping
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <MappingSelect
                    label="Name"
                    value={mapping.name}
                    onChange={(v) => setMapping((m) => ({ ...m, name: v }))}
                    headers={headers}
                    required={mapping.first_name == null}
                  />
                  <MappingSelect
                    label="Phone"
                    value={mapping.phone}
                    onChange={(v) => setMapping((m) => ({ ...m, phone: v }))}
                    headers={headers}
                  />
                  <MappingSelect
                    label="First name"
                    value={mapping.first_name}
                    onChange={(v) =>
                      setMapping((m) => ({ ...m, first_name: v }))
                    }
                    headers={headers}
                  />
                  <MappingSelect
                    label="Email"
                    value={mapping.email}
                    onChange={(v) => setMapping((m) => ({ ...m, email: v }))}
                    headers={headers}
                  />
                  <MappingSelect
                    label="Last name"
                    value={mapping.last_name}
                    onChange={(v) =>
                      setMapping((m) => ({ ...m, last_name: v }))
                    }
                    headers={headers}
                  />
                  <MappingSelect
                    label="Notes"
                    value={mapping.notes}
                    onChange={(v) => setMapping((m) => ({ ...m, notes: v }))}
                    headers={headers}
                  />
                </div>
              </div>

              {/* Preview — first 3 rows as they'll actually land. */}
              <div>
                <div className="text-xs font-medium text-[#151515] mb-2">
                  Preview
                </div>
                <div className="rounded-lg border border-[var(--glass-border)] overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-[#f9fafb] text-[var(--ink-muted)]">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">
                          Name
                        </th>
                        <th className="text-left px-3 py-2 font-medium">
                          Phone
                        </th>
                        <th className="text-left px-3 py-2 font-medium">
                          Email
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e5e7eb]">
                      {derived.slice(0, 3).map((r, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 text-[#151515]">
                            {r.name || (
                              <span className="text-[#ef4444]">
                                (missing)
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-[var(--ink-muted)]">
                            {r.phone || "—"}
                          </td>
                          <td className="px-3 py-2 text-[var(--ink-muted)]">
                            {r.email || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-xs text-[var(--ink-muted)] mt-2">
                  {readyCount} of {rows.length} rows have a name. Rows without
                  a name will be skipped.
                </div>
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-[#10b981]/40 bg-[#ecfdf5] p-4">
                <CheckCircle2
                  className="w-5 h-5 text-[#10b981] mt-0.5 shrink-0"
                  strokeWidth={1.5}
                />
                <div>
                  <div className="text-sm font-semibold text-[#065f46]">
                    {result.imported === 0
                      ? "Nothing imported."
                      : `Imported ${result.imported} contact${result.imported === 1 ? "" : "s"}.`}
                  </div>
                  {result.message && (
                    <div className="text-xs text-[#065f46]/80 mt-1">
                      {result.message}
                    </div>
                  )}
                </div>
              </div>

              {result.skipped.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 text-xs font-medium text-[#151515] mb-2">
                    <AlertCircle
                      className="w-3.5 h-3.5 text-[#f59e0b]"
                      strokeWidth={1.5}
                    />
                    {result.skipped.length} skipped
                  </div>
                  <div className="rounded-lg border border-[var(--glass-border)] max-h-64 overflow-y-auto">
                    <ul className="divide-y divide-[#e5e7eb]">
                      {result.skipped.map((s, i) => (
                        <li
                          key={i}
                          className="px-3 py-2 text-xs flex items-center gap-3"
                        >
                          <span className="mono text-[#9ca3af] w-10 shrink-0">
                            {s.row ? `#${s.row}` : "—"}
                          </span>
                          <span className="flex-1 truncate text-[#151515]">
                            {s.name || "(no name)"}
                          </span>
                          <span className="text-[var(--ink-muted)] shrink-0">
                            {s.reason}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="mt-4 flex items-start gap-2 text-sm text-[#ef4444]">
              <AlertCircle
                className="w-4 h-4 mt-0.5 shrink-0"
                strokeWidth={1.5}
              />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--glass-border)] bg-[#f9fafb]">
          <button
            onClick={onClose}
            className="text-sm text-[var(--ink-muted)] hover:text-[#151515] transition"
          >
            {result ? "Close" : "Cancel"}
          </button>
          {hasFile && !result && (
            <button
              onClick={handleSubmit}
              disabled={submitting || !hasName || readyCount === 0}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-[#3166bf] text-white text-sm font-medium hover:bg-[#2a5aa8] transition disabled:opacity-50"
            >
              {submitting
                ? "Importing…"
                : `Import ${readyCount} contact${readyCount === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MappingSelect({
  label,
  value,
  onChange,
  headers,
  required = false,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  headers: string[];
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs text-[var(--ink-muted)]">
        {label}
        {required && <span className="text-[#ef4444]"> *</span>}
      </span>
      <select
        value={value ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? null : Number(v));
        }}
        className="mt-1 w-full px-3 py-2 text-sm bg-[var(--canvas)] border border-[var(--glass-border)] rounded-lg text-[#151515] outline-none focus:border-[#3166bf]"
      >
        <option value="">(none)</option>
        {headers.map((h, i) => (
          <option key={i} value={i}>
            {h}
          </option>
        ))}
      </select>
    </label>
  );
}
