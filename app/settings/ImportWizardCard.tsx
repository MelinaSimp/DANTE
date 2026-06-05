"use client";

// app/settings/ImportWizardCard.tsx
//
// Bulk import wizard for contacts and properties.
// Three-step flow:
//   1. Upload CSV/JSON file and select entity type
//   2. Preview parsed rows and column mapping
//   3. Submit and show results

import { useState, useRef, useCallback, useMemo } from "react";
import {
  Upload,
  FileText,
  FileSpreadsheet,
  Loader2,
  X,
  AlertCircle,
  Check,
  ChevronRight,
  Info,
  ChevronLeft,
  Users,
  Building2,
} from "lucide-react";

import {
  MIGRATION_TEMPLATES,
  detectCRMSource,
  type MigrationTemplate,
} from "@/lib/import/migration-templates";

type EntityType = "contacts" | "properties";
type Step = "upload" | "preview" | "result";

interface ImportResultData {
  entity: string;
  total: number;
  inserted: number;
  skipped: number;
  errors: number;
  skipped_rows: Array<{ row: number; reason: string }>;
  error_rows: Array<{ row: number; error: string }>;
}

export default function ImportWizardCard() {
  const [step, setStep] = useState<Step>("upload");
  const [entity, setEntity] = useState<EntityType>("contacts");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResultData | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [detectedCRM, setDetectedCRM] = useState<MigrationTemplate | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const templates = useMemo(
    () => MIGRATION_TEMPLATES.filter((t) => t.id !== "generic"),
    [],
  );

  // ── File handling ────────────────────────────────────────────

  const parseCSVPreview = (text: string): { headers: string[]; rows: Record<string, string>[] } => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 1) return { headers: [], rows: [] };
    const hdrs = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
    const rows = lines.slice(1, 11).map((line) => {
      const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
      const row: Record<string, string> = {};
      hdrs.forEach((h, i) => {
        if (values[i] !== undefined) row[h] = values[i];
      });
      return row;
    });
    return { headers: hdrs, rows };
  };

  const handleFile = useCallback(async (f: File) => {
    setError(null);
    setFile(f);

    if (f.size > 10 * 1024 * 1024) {
      setError("File size exceeds 10 MB limit.");
      return;
    }

    const text = await f.text();
    const name = f.name.toLowerCase();

    if (name.endsWith(".json")) {
      try {
        const parsed = JSON.parse(text);
        const arr: Record<string, string>[] = Array.isArray(parsed)
          ? parsed
          : parsed.rows || parsed.data || [];
        if (arr.length === 0) {
          setError("JSON file contains no rows.");
          return;
        }
        setHeaders(Object.keys(arr[0]));
        setPreview(arr.slice(0, 10));
        setStep("preview");
      } catch {
        setError("Invalid JSON file.");
      }
    } else if (name.endsWith(".csv")) {
      const { headers: h, rows } = parseCSVPreview(text);
      if (h.length === 0) {
        setError("CSV file appears empty.");
        return;
      }
      setHeaders(h);
      setPreview(rows);
      // Auto-detect CRM source
      const detected = detectCRMSource(h);
      setDetectedCRM(detected);
      setStep("preview");
    } else {
      setError("Unsupported file type. Upload a .csv or .json file.");
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  // ── Submit ───────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("entity", entity);

      const res = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Import failed.");
        setLoading(false);
        return;
      }

      setResult(data);
      setStep("result");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Reset ────────────────────────────────────────────────────

  const reset = () => {
    setStep("upload");
    setFile(null);
    setPreview([]);
    setHeaders([]);
    setError(null);
    setResult(null);
    setDetectedCRM(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs text-[var(--ink-muted)]">
        <StepBadge label="1. Upload" active={step === "upload"} done={step !== "upload"} />
        <ChevronRight className="w-3 h-3 text-[var(--ink-subtle)]" strokeWidth={1.5} />
        <StepBadge label="2. Preview" active={step === "preview"} done={step === "result"} />
        <ChevronRight className="w-3 h-3 text-[var(--ink-subtle)]" strokeWidth={1.5} />
        <StepBadge label="3. Import" active={step === "result"} done={false} />
      </div>

      {error && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" strokeWidth={1.5} />
          <span className="text-sm text-red-700 dark:text-red-400">{error}</span>
        </div>
      )}

      {/* ── Step 1: Upload ─────────────────────────────────── */}
      {step === "upload" && (
        <div className="space-y-4">
          {/* Entity selector */}
          <div>
            <div className="label-section mb-2">What are you importing?</div>
            <div className="flex gap-2">
              <EntityButton
                icon={Users}
                label="Contacts"
                active={entity === "contacts"}
                onClick={() => setEntity("contacts")}
              />
              <EntityButton
                icon={Building2}
                label="Properties"
                active={entity === "properties"}
                onClick={() => setEntity("properties")}
              />
            </div>
          </div>

          {/* Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition ${
              dragOver
                ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                : "border-[var(--rule)] hover:border-[var(--rule-strong)] hover:bg-[var(--canvas-subtle)]"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.json"
              onChange={handleFileInput}
              className="hidden"
            />
            <Upload
              className="w-8 h-8 text-[var(--ink-subtle)] mx-auto mb-3"
              strokeWidth={1.5}
            />
            <p className="text-sm text-[var(--ink)]">
              Drop a CSV or JSON file here, or click to browse
            </p>
            <p className="text-xs text-[var(--ink-muted)] mt-1">
              Max 5,000 rows per file. 10 MB limit.
            </p>
          </div>

          {/* Column hints */}
          <div className="card-flat p-4">
            <div className="label-section mb-2">Expected columns</div>
            {entity === "contacts" ? (
              <p className="text-xs text-[var(--ink-muted)]">
                Name (required), Email, Phone, Stage, Company, Title, State, Notes.
                Headers are matched flexibly -- "Full Name", "Email Address", "Phone Number" all work.
              </p>
            ) : (
              <p className="text-xs text-[var(--ink-muted)]">
                Address (required), City (required), State (required), Zip, Type/Kind, Sqft,
                Year Built, List Price, Monthly Rent, Notes. Price values can be in dollars
                (e.g. $1,500,000) or cents.
              </p>
            )}
          </div>

          {/* Migration templates */}
          <div className="card-flat p-4">
            <button
              onClick={() => setShowTemplates(!showTemplates)}
              className="flex items-center gap-2 w-full text-left"
            >
              <Info className="w-4 h-4 text-[var(--accent)]" strokeWidth={1.5} />
              <span className="label-section text-[var(--ink)]">Migrating from another CRM?</span>
              <ChevronRight
                className={`w-3 h-3 text-[var(--ink-subtle)] ml-auto transition ${showTemplates ? "rotate-90" : ""}`}
                strokeWidth={1.5}
              />
            </button>
            {showTemplates && (
              <div className="mt-3 space-y-3">
                {templates.map((t) => (
                  <div key={t.id} className="rounded-lg bg-[var(--canvas-subtle)] p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-[var(--ink)]">{t.name}</span>
                      <span className="text-[10px] text-[var(--ink-muted)] px-1.5 py-0.5 rounded bg-[var(--canvas)]">
                        {t.entity}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--ink-muted)] mb-2">{t.description}</p>
                    <ol className="list-decimal list-inside space-y-0.5">
                      {t.exportInstructions.map((step, i) => (
                        <li key={i} className="text-xs text-[var(--ink-muted)]">
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Step 2: Preview ────────────────────────────────── */}
      {step === "preview" && (
        <div className="space-y-4">
          {/* Detected CRM banner */}
          {detectedCRM && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
              <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" strokeWidth={1.5} />
              <span className="text-sm text-blue-700 dark:text-blue-400">
                Detected <strong>{detectedCRM.name}</strong> export format. Column names will be mapped automatically.
              </span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-[var(--ink)]">
                {file && (
                  <span className="inline-flex items-center gap-2">
                    {file.name.endsWith(".json") ? (
                      <FileText className="w-4 h-4 text-[var(--ink-muted)]" strokeWidth={1.5} />
                    ) : (
                      <FileSpreadsheet className="w-4 h-4 text-[var(--ink-muted)]" strokeWidth={1.5} />
                    )}
                    {file.name}
                    <span className="text-[var(--ink-muted)]">
                      ({(file.size / 1024).toFixed(0)} KB)
                    </span>
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                Showing first {preview.length} rows. Importing as{" "}
                <strong className="text-[var(--ink)]">{entity}</strong>.
              </p>
            </div>
            <button
              onClick={reset}
              className="inline-flex items-center gap-1 text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
            >
              <X className="w-3 h-3" strokeWidth={1.5} />
              Clear
            </button>
          </div>

          {/* Preview table */}
          <div className="overflow-x-auto rounded-lg border border-[var(--rule)]">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--rule)] bg-[var(--canvas-subtle)]">
                  <th className="px-3 py-2 text-left font-medium text-[var(--ink-muted)] w-8">
                    #
                  </th>
                  {headers.slice(0, 8).map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left font-medium text-[var(--ink-muted)] max-w-[160px] truncate"
                    >
                      {h}
                    </th>
                  ))}
                  {headers.length > 8 && (
                    <th className="px-3 py-2 text-left font-medium text-[var(--ink-subtle)]">
                      +{headers.length - 8} more
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-[var(--rule)] last:border-b-0"
                  >
                    <td className="px-3 py-2 text-[var(--ink-subtle)] font-mono">
                      {i + 1}
                    </td>
                    {headers.slice(0, 8).map((h) => (
                      <td
                        key={h}
                        className="px-3 py-2 text-[var(--ink)] max-w-[160px] truncate"
                      >
                        {row[h] || ""}
                      </td>
                    ))}
                    {headers.length > 8 && <td className="px-3 py-2" />}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <button
              onClick={reset}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
            >
              <ChevronLeft className="w-4 h-4" strokeWidth={1.5} />
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="inline-flex items-center gap-2 bg-[var(--accent)] text-white px-5 py-2.5 rounded-[4px] text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                  Importing...
                </>
              ) : (
                <>
                  Import {entity}
                  <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Result ─────────────────────────────────── */}
      {step === "result" && result && (
        <div className="space-y-4">
          {/* Summary stats */}
          <div className="grid grid-cols-4 gap-3">
            <StatBox label="Total" value={result.total} />
            <StatBox label="Inserted" value={result.inserted} accent="emerald" />
            <StatBox label="Skipped" value={result.skipped} accent="amber" />
            <StatBox label="Errors" value={result.errors} accent="red" />
          </div>

          {/* Skipped details */}
          {result.skipped_rows.length > 0 && (
            <div className="card-flat p-4">
              <div className="label-section mb-2">
                Skipped rows ({result.skipped_rows.length})
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {result.skipped_rows.slice(0, 20).map((s) => (
                  <div key={s.row} className="text-xs text-[var(--ink-muted)]">
                    Row {s.row}: {s.reason}
                  </div>
                ))}
                {result.skipped_rows.length > 20 && (
                  <div className="text-xs text-[var(--ink-subtle)]">
                    ...and {result.skipped_rows.length - 20} more
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error details */}
          {result.error_rows.length > 0 && (
            <div className="card-flat p-4">
              <div className="label-section text-red-600 dark:text-red-400 mb-2">
                Errors ({result.error_rows.length})
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {result.error_rows.slice(0, 20).map((e) => (
                  <div key={e.row} className="text-xs text-red-600 dark:text-red-400">
                    Row {e.row}: {e.error}
                  </div>
                ))}
                {result.error_rows.length > 20 && (
                  <div className="text-xs text-[var(--ink-subtle)]">
                    ...and {result.error_rows.length - 20} more
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Success message */}
          {result.inserted > 0 && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
              <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" strokeWidth={2} />
              <span className="text-sm text-emerald-700 dark:text-emerald-400">
                Successfully imported {result.inserted} {result.entity}.
              </span>
            </div>
          )}

          <button
            onClick={reset}
            className="inline-flex items-center gap-2 border border-[var(--rule-strong)] px-4 py-2 rounded-[4px] text-sm font-medium hover:bg-[var(--canvas-subtle)] transition"
          >
            Import another file
          </button>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────

function StepBadge({
  label,
  active,
  done,
}: {
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition ${
        active
          ? "bg-[var(--accent-soft)] text-[var(--accent)]"
          : done
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-[var(--ink-subtle)]"
      }`}
    >
      {done && <Check className="w-3 h-3" strokeWidth={2} />}
      {label}
    </span>
  );
}

function EntityButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof Users;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-[4px] text-sm font-medium transition ${
        active
          ? "bg-[var(--accent-soft)] text-[var(--accent)] ring-1 ring-[var(--accent)]"
          : "bg-[var(--canvas-subtle)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
      }`}
    >
      <Icon className="w-4 h-4" strokeWidth={1.5} />
      {label}
    </button>
  );
}

function StatBox({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "emerald" | "amber" | "red";
}) {
  const colors = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    red: "text-red-600 dark:text-red-400",
  };
  return (
    <div className="card-flat p-3 text-center">
      <div
        className={`text-2xl font-mono font-semibold ${
          accent ? colors[accent] : "text-[var(--ink)]"
        }`}
      >
        {value}
      </div>
      <div className="text-[10px] text-[var(--ink-muted)] mt-0.5">{label}</div>
    </div>
  );
}
