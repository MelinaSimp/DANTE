"use client";

// ReviewTableDetailClient — the table itself. Rows = vault docs,
// columns = user-defined questions, cells = extracted answers with
// citations on hover. "Run" kicks off the extractor; the route
// processes up to 60 cells per call so for big tables we re-call
// until done. Cell hover reveals the citation. CSV export is
// client-side.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Play,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Download,
  Trash2,
  RefreshCcw,
  Clock,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";

type Kind = "text" | "date" | "number" | "yes_no";

interface Column {
  id: string;
  name: string;
  prompt: string;
  kind: Kind;
}

interface Cell {
  doc_id: string;
  column_id: string;
  value: string | null;
  citation: string | null;
  confidence: number | null;
  status: "pending" | "running" | "done" | "failed";
  error: string | null;
}

interface ReviewTable {
  id: string;
  title: string;
  columns: Column[];
  doc_ids: string[];
  status: "draft" | "running" | "complete" | "failed";
  last_run_at: string | null;
  cells: Cell[];
  docs: Array<{ id: string; title: string }>;
}

export default function ReviewTableDetailClient({
  tableId,
}: {
  tableId: string;
}) {
  const router = useRouter();
  const [table, setTable] = useState<ReviewTable | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/review-tables/${tableId}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error((await r.json()).error || "Failed");
      setTable(await r.json());
    } catch (e: any) {
      setError(e.message);
    }
  }, [tableId]);

  useEffect(() => {
    load();
  }, [load]);

  // Re-poll while a run is in flight so the UI shows progress without
  // forcing the user to refresh.
  useEffect(() => {
    if (!table) return;
    if (table.status !== "running") return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [table, load]);

  const cellMap = useMemo(() => {
    const m = new Map<string, Cell>();
    if (table) {
      for (const c of table.cells) m.set(`${c.doc_id}::${c.column_id}`, c);
    }
    return m;
  }, [table]);

  // Sort state — clicking a column header toggles asc → desc → off.
  // 'doc' sorts by document title; otherwise sort by the cell value
  // for that column id. Empty cells sort last regardless of direction.
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const toggleSort = (key: string) => {
    if (sortBy !== key) {
      setSortBy(key);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortBy(null);
    }
  };

  const sortedDocs = useMemo(() => {
    if (!table) return [];
    if (!sortBy) return table.docs;
    const valueFor = (docId: string): string => {
      if (sortBy === "doc") {
        return table.docs.find((d) => d.id === docId)?.title ?? "";
      }
      const cell = cellMap.get(`${docId}::${sortBy}`);
      return cell?.value ?? "";
    };
    const docs = [...table.docs];
    docs.sort((a, b) => {
      const va = valueFor(a.id);
      const vb = valueFor(b.id);
      // Empty values bubble to the bottom regardless of direction.
      if (!va && !vb) return 0;
      if (!va) return 1;
      if (!vb) return -1;
      // Numeric-aware compare: trims currency symbols + commas so
      // "$1,250,000" sorts after "$900,000".
      const na = parseFloat(va.replace(/[$,€£]/g, ""));
      const nb = parseFloat(vb.replace(/[$,€£]/g, ""));
      let cmp: number;
      if (!isNaN(na) && !isNaN(nb)) cmp = na - nb;
      else cmp = va.localeCompare(vb);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return docs;
  }, [table, sortBy, sortDir, cellMap]);

  const totalCells = table ? table.docs.length * table.columns.length : 0;
  const doneCells = useMemo(
    () => (table ? table.cells.filter((c) => c.status === "done").length : 0),
    [table]
  );
  const failedCells = useMemo(
    () =>
      table ? table.cells.filter((c) => c.status === "failed").length : 0,
    [table]
  );

  const run = async () => {
    if (!table) return;
    setRunning(true);
    setError(null);
    try {
      // The extractor processes up to ~60 cells per call. For larger
      // tables keep calling until the run is complete.
      let safety = 12; // 12 × 60 = 720 cells max per click
      while (safety-- > 0) {
        const r = await fetch(`/api/review-tables/${tableId}/run`, {
          method: "POST",
          credentials: "include",
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || "Run failed");
        }
        const result = await r.json();
        await load();
        if ((result.processed ?? 0) === 0) break;
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  const remove = async () => {
    if (!confirm("Delete this review table? Cells go with it.")) return;
    const r = await fetch(`/api/review-tables/${tableId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (r.ok) router.push("/review-tables");
  };

  const exportCsv = () => {
    if (!table) return;
    const escape = (v: string) => {
      if (v == null) return "";
      const needsQuote = /[",\n]/.test(v);
      const inner = v.replace(/"/g, '""');
      return needsQuote ? `"${inner}"` : inner;
    };
    const header = ["Document", ...table.columns.map((c) => c.name)];
    const lines = [header.map(escape).join(",")];
    for (const doc of table.docs) {
      const row = [doc.title];
      for (const col of table.columns) {
        const cell = cellMap.get(`${doc.id}::${col.id}`);
        row.push(cell?.value ?? "");
      }
      lines.push(row.map(escape).join(","));
    }
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeTitle = table.title.replace(/[^a-z0-9-_ ]/gi, "_").slice(0, 80);
    a.download = `${safeTitle}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!table && !error) {
    return (
      <div className="min-h-screen bg-[var(--canvas)] flex items-center justify-center">
        <Loader2
          className="w-6 h-6 animate-spin text-[var(--ink-subtle)]"
          strokeWidth={1.5}
        />
      </div>
    );
  }
  if (error && !table) {
    return (
      <div className="min-h-screen bg-[var(--canvas)] flex items-center justify-center px-6">
        <div className="card-flat p-6 text-center max-w-md">
          <AlertCircle
            className="w-8 h-8 text-[var(--danger)] mx-auto mb-3"
            strokeWidth={1.5}
          />
          <p className="text-sm text-[var(--ink)] mb-2">{error}</p>
          <Link
            href="/review-tables"
            className="text-xs text-[var(--accent)] hover:underline"
          >
            Back
          </Link>
        </div>
      </div>
    );
  }
  if (!table) return null;

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <div className="sticky top-0 z-10 border-b border-[var(--rule)] bg-[var(--canvas)]/95 backdrop-blur">
        <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 text-sm text-[var(--ink-muted)] min-w-0">
            <Link href="/home" className="hover:text-[var(--ink)] transition">
              Drift
            </Link>
            <span className="text-[var(--ink-subtle)]">/</span>
            <Link href="/review-tables" className="hover:text-[var(--ink)] transition">
              Review tables
            </Link>
            <span className="text-[var(--ink-subtle)]">/</span>
            <span className="text-[var(--ink)] truncate max-w-[400px]">
              {table.title}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={run}
              disabled={running || table.docs.length === 0 || table.columns.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-semibold hover:opacity-90 transition disabled:opacity-40"
            >
              {running ? (
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
              ) : doneCells > 0 ? (
                <RefreshCcw className="w-4 h-4" strokeWidth={1.5} />
              ) : (
                <Play className="w-4 h-4" strokeWidth={1.5} />
              )}
              {running
                ? `Running… (${doneCells}/${totalCells})`
                : doneCells > 0
                ? "Re-run"
                : "Run"}
            </button>
            <button
              onClick={exportCsv}
              disabled={doneCells === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] text-xs font-medium transition disabled:opacity-30"
            >
              <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
              Export CSV
            </button>
            <button
              onClick={remove}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[4px] border border-[var(--rule)] text-[var(--danger)] hover:bg-[var(--danger-soft)] text-xs font-medium transition"
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
              Delete
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-8">
        <div className="mb-6 flex items-end justify-between gap-6 flex-wrap">
          <div>
            <div className="label-section mb-1.5">Review table</div>
            <h1 className="heading-display text-3xl md:text-4xl text-[var(--ink)] leading-[1.1]">
              {table.title}
            </h1>
            <p className="text-sm text-[var(--ink-muted)] mt-1.5">
              {table.docs.length} doc{table.docs.length === 1 ? "" : "s"} ·{" "}
              {table.columns.length} column
              {table.columns.length === 1 ? "" : "s"} · {doneCells}/
              {totalCells} cells filled
              {failedCells > 0 ? ` · ${failedCells} failed` : ""}
              {table.last_run_at && (
                <>
                  {" "}
                  ·{" "}
                  <Clock
                    className="inline w-3 h-3 -mt-0.5"
                    strokeWidth={1.5}
                  />{" "}
                  Ran {new Date(table.last_run_at).toLocaleString()}
                </>
              )}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger)]/30 rounded-[4px] flex items-center gap-2">
            <AlertCircle className="w-4 h-4" strokeWidth={1.5} /> {error}
          </div>
        )}

        {/* Table */}
        <div className="card-flat overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--rule)] bg-[var(--canvas-subtle)]">
                <tr>
                  <th className="label-section text-left py-3 px-4 sticky left-0 bg-[var(--canvas-subtle)] z-10 min-w-[220px]">
                    <button
                      onClick={() => toggleSort("doc")}
                      className="inline-flex items-center gap-1 hover:text-[var(--ink)] transition"
                    >
                      Document
                      <SortGlyph active={sortBy === "doc"} dir={sortDir} />
                    </button>
                  </th>
                  {table.columns.map((c) => (
                    <th
                      key={c.id}
                      className="label-section text-left py-3 px-4 min-w-[200px]"
                      title={c.prompt}
                    >
                      <button
                        onClick={() => toggleSort(c.id)}
                        className="inline-flex items-center gap-1 hover:text-[var(--ink)] transition"
                      >
                        {c.name}
                        <span className="ml-0.5 text-[10px] mono text-[var(--ink-subtle)] font-normal">
                          {c.kind}
                        </span>
                        <SortGlyph active={sortBy === c.id} dir={sortDir} />
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.docs.length === 0 || table.columns.length === 0 ? (
                  <tr>
                    <td
                      colSpan={Math.max(table.columns.length + 1, 2)}
                      className="py-12 text-center text-sm text-[var(--ink-muted)]"
                    >
                      Add documents and columns to start.
                    </td>
                  </tr>
                ) : (
                  sortedDocs.map((doc) => (
                    <tr
                      key={doc.id}
                      className="border-b border-[var(--rule)] last:border-b-0"
                    >
                      <td className="py-3 px-4 text-sm text-[var(--ink)] sticky left-0 bg-[var(--canvas)] z-10 truncate max-w-[260px] border-r border-[var(--rule)]">
                        {doc.title}
                      </td>
                      {table.columns.map((c) => {
                        const cell = cellMap.get(`${doc.id}::${c.id}`);
                        return (
                          <CellRender key={c.id} cell={cell} />
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function SortGlyph({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) {
    return (
      <ArrowUpDown
        className="w-3 h-3 text-[var(--ink-subtle)] opacity-40"
        strokeWidth={1.5}
      />
    );
  }
  return dir === "asc" ? (
    <ArrowUp className="w-3 h-3 text-[var(--ink)]" strokeWidth={1.75} />
  ) : (
    <ArrowDown className="w-3 h-3 text-[var(--ink)]" strokeWidth={1.75} />
  );
}

function CellRender({ cell }: { cell: Cell | undefined }) {
  if (!cell) {
    return (
      <td className="py-3 px-4 text-xs text-[var(--ink-subtle)]">—</td>
    );
  }
  if (cell.status === "running" || cell.status === "pending") {
    return (
      <td className="py-3 px-4">
        <span className="inline-flex items-center gap-1 text-[11px] text-[var(--ink-subtle)]">
          <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
          {cell.status === "running" ? "Running" : "Queued"}
        </span>
      </td>
    );
  }
  if (cell.status === "failed") {
    return (
      <td className="py-3 px-4">
        <span
          className="inline-flex items-center gap-1 text-[11px] text-[var(--danger)]"
          title={cell.error || ""}
        >
          <AlertCircle className="w-3 h-3" strokeWidth={1.5} />
          Failed
        </span>
      </td>
    );
  }
  if (cell.value == null) {
    return (
      <td className="py-3 px-4 text-xs text-[var(--ink-subtle)] italic">
        Not in doc
      </td>
    );
  }
  const lowConfidence = (cell.confidence ?? 1) < 0.6;
  return (
    <td
      className="py-3 px-4 text-sm text-[var(--ink)] align-top"
      title={cell.citation ? `Source: ${cell.citation}` : undefined}
    >
      <div className="flex items-start gap-1.5">
        <span className="flex-1">{cell.value}</span>
        {lowConfidence && (
          <span
            className="text-[10px] text-[var(--flag)] shrink-0"
            title={`Low confidence (${Math.round((cell.confidence ?? 0) * 100)}%)`}
          >
            ?
          </span>
        )}
        {cell.citation && (
          <CheckCircle2
            className="w-3 h-3 text-[var(--verified)] shrink-0 mt-0.5"
            strokeWidth={1.5}
          />
        )}
      </div>
    </td>
  );
}
