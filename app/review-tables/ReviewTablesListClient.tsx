"use client";

// ReviewTablesListClient — Harvey "review tables" landing. Lists every
// saved table for the workspace with a status pill + counts, plus a
// prominent "New review table" CTA. Click a row → detail page.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Loader2,
  AlertCircle,
  Table2,
  CheckCircle2,
  Clock,
  Pencil,
} from "lucide-react";

interface ReviewTable {
  id: string;
  title: string;
  columns: Array<{ id: string; name: string; prompt: string; kind: string }>;
  doc_ids: string[];
  status: "draft" | "running" | "complete" | "failed";
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  running: "Running",
  complete: "Complete",
  failed: "Failed",
};
const STATUS_CHIP: Record<string, string> = {
  draft:
    "text-[var(--ink-muted)] bg-[var(--canvas-subtle)] border-[var(--rule)]",
  running:
    "text-[var(--accent)] bg-[var(--accent-soft)] border-[var(--accent)]/30",
  complete:
    "text-[var(--verified)] bg-[var(--verified-soft)] border-[var(--verified)]/30",
  failed:
    "text-[var(--danger)] bg-[var(--danger-soft)] border-[var(--danger)]/30",
};

export default function ReviewTablesListClient() {
  const router = useRouter();
  const [items, setItems] = useState<ReviewTable[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/review-tables", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || "Failed");
        return r.json();
      })
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <div className="sticky top-0 z-10 border-b border-[var(--rule)] bg-[var(--canvas)]/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm text-[var(--ink-muted)]">
            <Link href="/dashboard" className="hover:text-[var(--ink)] transition">
              Drift
            </Link>
            <span className="text-[var(--ink-subtle)]">/</span>
            <span className="text-[var(--ink)]">Review tables</span>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
            Dashboard
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 md:px-10 py-8 md:py-10">
        <div className="mb-6 flex items-end justify-between gap-6 flex-wrap">
          <div>
            <div className="label-section mb-1.5">Bulk extraction</div>
            <h1 className="heading-display text-3xl md:text-4xl text-[var(--ink)] leading-[1.1]">
              Review tables
            </h1>
            <p className="text-sm text-[var(--ink-muted)] mt-1.5 max-w-xl">
              Pick a stack of vault docs, define the columns you want
              extracted, and the assistant fills in a row per document.
              One question across many files at once.
            </p>
          </div>
          <Link
            href="/review-tables/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-semibold hover:opacity-90 transition"
          >
            <Plus className="w-4 h-4" strokeWidth={1.5} />
            New review table
          </Link>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger)]/30 rounded-[4px] flex items-center gap-2">
            <AlertCircle className="w-4 h-4" strokeWidth={1.5} /> {error}
          </div>
        )}

        {items === null ? (
          <div className="flex items-center justify-center py-32">
            <Loader2
              className="w-6 h-6 animate-spin text-[var(--ink-subtle)]"
              strokeWidth={1.5}
            />
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center">
            <Table2
              className="w-10 h-10 text-[var(--ink-subtle)] mx-auto mb-3"
              strokeWidth={1}
            />
            <h2 className="heading-display text-xl text-[var(--ink)] mb-1.5">
              No review tables yet
            </h2>
            <p className="text-sm text-[var(--ink-muted)] max-w-md mx-auto mb-4">
              Try one for "extract closing dates from every offer in the
              vault" or "pull the AUM out of all client onboarding forms."
            </p>
            <Link
              href="/review-tables/new"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-semibold hover:opacity-90 transition"
            >
              <Plus className="w-4 h-4" strokeWidth={1.5} />
              New review table
            </Link>
          </div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {items.map((t) => (
              <li
                key={t.id}
                onClick={() => router.push(`/review-tables/${t.id}`)}
                className="rounded-[8px] border border-[var(--rule)] hover:border-[var(--rule-strong)] bg-[var(--canvas)] p-4 cursor-pointer transition"
              >
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <span className="text-sm font-semibold text-[var(--ink)] truncate">
                    {t.title}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                      STATUS_CHIP[t.status]
                    }`}
                  >
                    {t.status === "complete" ? (
                      <CheckCircle2 className="w-2.5 h-2.5" strokeWidth={1.5} />
                    ) : t.status === "running" ? (
                      <Loader2
                        className="w-2.5 h-2.5 animate-spin"
                        strokeWidth={1.5}
                      />
                    ) : t.status === "failed" ? (
                      <AlertCircle className="w-2.5 h-2.5" strokeWidth={1.5} />
                    ) : (
                      <Pencil className="w-2.5 h-2.5" strokeWidth={1.5} />
                    )}
                    {STATUS_LABEL[t.status]}
                  </span>
                </div>
                <div className="text-[11px] text-[var(--ink-subtle)] mb-2">
                  {t.doc_ids.length} doc{t.doc_ids.length === 1 ? "" : "s"} ·{" "}
                  {t.columns.length} column{t.columns.length === 1 ? "" : "s"}
                </div>
                {t.columns.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {t.columns.slice(0, 4).map((c) => (
                      <span
                        key={c.id}
                        className="text-[10px] mono px-1.5 py-0.5 rounded bg-[var(--canvas-subtle)] text-[var(--ink-muted)] border border-[var(--rule)]"
                      >
                        {c.name}
                      </span>
                    ))}
                    {t.columns.length > 4 && (
                      <span className="text-[10px] text-[var(--ink-subtle)]">
                        +{t.columns.length - 4}
                      </span>
                    )}
                  </div>
                )}
                <div className="text-[10px] mono text-[var(--ink-subtle)] mt-2 flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" strokeWidth={1.5} />
                  {t.last_run_at
                    ? `Ran ${new Date(t.last_run_at).toLocaleString()}`
                    : "Not run yet"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
