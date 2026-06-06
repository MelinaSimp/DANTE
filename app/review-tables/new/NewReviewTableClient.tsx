"use client";

// NewReviewTableClient — single-page wizard. Title, columns
// (name + question + kind), and a doc picker that filters the vault
// list. Saves as draft; user runs from the detail page.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  Save,
  AlertCircle,
  Search,
  ScrollText,
  Sparkles,
  Check,
} from "lucide-react";

type Kind =
  | "text"
  | "date"
  | "number"
  | "yes_no"
  | "currency"
  | "verbatim"
  | "list";

interface Column {
  id: string;
  name: string;
  prompt: string;
  kind: Kind;
}

interface VaultItem {
  id: string;
  kind: "template" | "document";
  title: string;
  description: string | null;
}

interface ReviewTemplateSummary {
  id: string;
  name: string;
  description: string;
  industry: string;
  columns: Array<{ name: string; prompt: string; kind: Kind }>;
}

const KIND_LABEL: Record<Kind, string> = {
  text: "Text",
  date: "Date",
  number: "Number",
  yes_no: "Yes / No",
  currency: "Currency",
  verbatim: "Verbatim quote",
  list: "List",
};

function newColumnId(): string {
  return `col_${Math.random().toString(36).slice(2, 8)}`;
}

export default function NewReviewTableClient() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [columns, setColumns] = useState<Column[]>([
    { id: newColumnId(), name: "", prompt: "", kind: "text" },
  ]);
  const [search, setSearch] = useState("");
  const [docs, setDocs] = useState<VaultItem[] | null>(null);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<ReviewTemplateSummary[]>([]);

  useEffect(() => {
    fetch("/api/vault", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setDocs(Array.isArray(d) ? d : []))
      .catch(() => setDocs([]));
    fetch("/api/review-tables/templates", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setTemplates(Array.isArray(d) ? d : []))
      .catch(() => setTemplates([]));
  }, []);

  // Apply a template — overwrites title (suggestion) and columns.
  // Doc selection is preserved so the user can build a template +
  // pick docs in either order.
  const applyTemplate = (t: ReviewTemplateSummary) => {
    if (
      columns.some((c) => c.name.trim() || c.prompt.trim()) &&
      !confirm(
        `Replace your current columns with the "${t.name}" template? Your unsaved column edits will be lost.`
      )
    ) {
      return;
    }
    if (!title.trim()) setTitle(t.name);
    setColumns(
      t.columns.map((c) => ({
        id: newColumnId(),
        name: c.name,
        prompt: c.prompt,
        kind: c.kind,
      }))
    );
  };

  const inputClass =
    "w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none focus:border-[var(--rule-strong)]";

  const updateColumn = (id: string, patch: Partial<Column>) => {
    setColumns((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };
  const addColumn = () => {
    setColumns((cs) => [
      ...cs,
      { id: newColumnId(), name: "", prompt: "", kind: "text" },
    ]);
  };
  const removeColumn = (id: string) => {
    setColumns((cs) => (cs.length === 1 ? cs : cs.filter((c) => c.id !== id)));
  };

  const toggleDoc = (id: string) => {
    setSelectedDocs((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredDocs = (docs || []).filter((d) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      d.title.toLowerCase().includes(q) ||
      (d.description || "").toLowerCase().includes(q)
    );
  });

  const submit = async () => {
    if (!title.trim()) {
      setError("Title required");
      return;
    }
    const cleanCols = columns
      .map((c) => ({ ...c, name: c.name.trim(), prompt: c.prompt.trim() }))
      .filter((c) => c.name && c.prompt);
    if (cleanCols.length === 0) {
      setError("Add at least one column with a name and question");
      return;
    }
    if (selectedDocs.size === 0) {
      setError("Pick at least one document");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/review-tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: title.trim(),
          columns: cleanCols,
          doc_ids: Array.from(selectedDocs),
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || "Save failed");
      }
      const created = await r.json();
      router.push(`/review-tables/${created.id}`);
    } catch (e: any) {
      setError(e.message || "Save failed");
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <div className="sticky top-0 z-10 border-b border-[var(--rule)] bg-[var(--canvas)]/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-6 md:px-10 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm text-[var(--ink-muted)]">
            <Link href="/home" className="hover:text-[var(--ink)] transition">
              Drift
            </Link>
            <span className="text-[var(--ink-subtle)]">/</span>
            <Link href="/review-tables" className="hover:text-[var(--ink)] transition">
              Review tables
            </Link>
            <span className="text-[var(--ink-subtle)]">/</span>
            <span className="text-[var(--ink)]">New</span>
          </div>
          <Link
            href="/review-tables"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
            Back
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 md:px-10 py-8 md:py-10 space-y-8">
        <div>
          <div className="label-section mb-1.5">New review table</div>
          <h1 className="heading-display text-3xl md:text-4xl text-[var(--ink)] leading-[1.1]">
            Define columns + pick docs
          </h1>
          <p className="text-sm text-[var(--ink-muted)] mt-1.5 max-w-xl">
            The assistant fills one row per document. Each column you add
            becomes a question it answers per row, with citations.
          </p>
        </div>

        {/* Templates — Harvey "one-click workflow" pattern. Filtered
            by workspace industry on the server. */}
        {templates.length > 0 && (
          <section className="card-flat p-5">
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <div className="label-section mb-0.5">Start from a template</div>
                <p className="text-xs text-[var(--ink-muted)]">
                  Pre-built column sets for common doc types — click to
                  populate the columns below.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => applyTemplate(t)}
                  className="text-left transition flex flex-col hover:border-[var(--rule-strong)]"
                  style={{
                    background: "var(--canvas)",
                    border: "1px solid var(--rule)",
                    borderRadius: "8px",
                    padding: "12px 14px",
                  }}
                >
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className="text-sm font-semibold text-[var(--ink)] truncate">
                      {t.name}
                    </span>
                    <span className="text-[10px] mono text-[var(--ink-subtle)] shrink-0">
                      {t.columns.length} cols
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--ink-muted)] line-clamp-2">
                    {t.description}
                  </p>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Title */}
        <section className="card-flat p-5">
          <label className="block">
            <div className="label-section mb-1.5">Table title</div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='e.g. "Expiration dates across all lease agreements"'
              className={inputClass}
            />
          </label>
        </section>

        {/* Columns */}
        <section className="card-flat p-5">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <div className="label-section mb-0.5">Columns</div>
              <p className="text-xs text-[var(--ink-muted)]">
                What do you want extracted from each document?
              </p>
            </div>
            <button
              onClick={addColumn}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] text-xs font-medium transition"
            >
              <Plus className="w-3 h-3" strokeWidth={1.5} />
              Add column
            </button>
          </div>
          <div className="space-y-3">
            {columns.map((c, i) => (
              <div
                key={c.id}
                className="grid grid-cols-12 gap-3 items-start border border-[var(--rule)] rounded-[6px] p-3"
              >
                <div className="col-span-12 md:col-span-3">
                  <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-1">
                    Name
                  </div>
                  <input
                    value={c.name}
                    onChange={(e) =>
                      updateColumn(c.id, { name: e.target.value })
                    }
                    placeholder="Closing date"
                    className={inputClass}
                  />
                </div>
                <div className="col-span-12 md:col-span-6">
                  <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-1">
                    Question
                  </div>
                  <input
                    value={c.prompt}
                    onChange={(e) =>
                      updateColumn(c.id, { prompt: e.target.value })
                    }
                    placeholder="When does this contract close?"
                    className={inputClass}
                  />
                </div>
                <div className="col-span-9 md:col-span-2">
                  <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-1">
                    Kind
                  </div>
                  <select
                    value={c.kind}
                    onChange={(e) =>
                      updateColumn(c.id, { kind: e.target.value as Kind })
                    }
                    className={inputClass}
                  >
                    {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-3 md:col-span-1 flex items-end justify-end pt-4">
                  <button
                    onClick={() => removeColumn(c.id)}
                    disabled={columns.length === 1}
                    className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] transition disabled:opacity-30"
                    title="Remove column"
                  >
                    <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Doc picker */}
        <section className="card-flat p-5">
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <div className="label-section mb-0.5">Documents</div>
              <p className="text-xs text-[var(--ink-muted)]">
                {selectedDocs.size} selected. Each becomes one row in the
                table.
              </p>
            </div>
            <div className="relative max-w-xs">
              <Search
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--ink-subtle)]"
                strokeWidth={1.5}
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search vault"
                className={`${inputClass} pl-8 py-1.5 text-xs`}
              />
            </div>
          </div>
          {docs === null ? (
            <div className="flex items-center justify-center py-10">
              <Loader2
                className="w-5 h-5 animate-spin text-[var(--ink-subtle)]"
                strokeWidth={1.5}
              />
            </div>
          ) : docs.length === 0 ? (
            <p className="text-xs text-[var(--ink-muted)] py-4 text-center">
              Vault is empty.{" "}
              <Link
                href="/vault"
                className="underline underline-offset-2 hover:text-[var(--ink)]"
              >
                Upload a document first
              </Link>
              .
            </p>
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[420px] overflow-y-auto">
              {filteredDocs.map((d) => {
                const selected = selectedDocs.has(d.id);
                const Icon = d.kind === "template" ? Sparkles : ScrollText;
                return (
                  <li key={d.id}>
                    <button
                      onClick={() => toggleDoc(d.id)}
                      className="w-full text-left px-3 py-2 rounded-[6px] border transition flex items-start gap-3"
                      style={{
                        background: selected
                          ? "var(--canvas-subtle)"
                          : "var(--canvas)",
                        borderColor: selected
                          ? "var(--ink)"
                          : "var(--rule)",
                      }}
                    >
                      <div
                        className="shrink-0 mt-0.5 flex items-center justify-center"
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 4,
                          border: selected
                            ? "1px solid var(--ink)"
                            : "1px solid var(--rule-strong)",
                          background: selected ? "var(--ink)" : "var(--canvas)",
                        }}
                      >
                        {selected && (
                          <Check
                            className="w-3 h-3 text-[var(--canvas)]"
                            strokeWidth={2.5}
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Icon
                            className="w-3.5 h-3.5 text-[var(--ink-muted)] shrink-0"
                            strokeWidth={1.5}
                          />
                          <span className="text-sm font-medium text-[var(--ink)] truncate">
                            {d.title}
                          </span>
                        </div>
                        {d.description && (
                          <div className="text-[11px] text-[var(--ink-subtle)] truncate mt-0.5">
                            {d.description}
                          </div>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {error && (
          <div className="px-3 py-2 text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger)]/30 rounded-[4px] flex items-center gap-2">
            <AlertCircle className="w-4 h-4" strokeWidth={1.5} /> {error}
          </div>
        )}

        <div className="flex items-center gap-3 sticky bottom-0 bg-[var(--canvas)] border-t border-[var(--rule)] py-4 -mx-6 md:-mx-10 px-6 md:px-10">
          <button
            onClick={submit}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-semibold disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
            ) : (
              <Save className="w-4 h-4" strokeWidth={1.5} />
            )}
            {saving ? "Saving…" : "Save as draft"}
          </button>
          <span className="text-[11px] text-[var(--ink-subtle)]">
            Run extraction from the table view after saving.
          </span>
        </div>
      </div>
    </div>
  );
}
