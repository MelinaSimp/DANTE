"use client";

// One-click button that triggers /api/admin/vault/backfill-projects
// across all workspaces. First runs in dryRun=true, shows the
// preview, then asks before committing. Idempotent — re-running
// a second time is a no-op for already-routed files.

import { useState } from "react";
import { Loader2, FolderTree } from "lucide-react";

interface RunResult {
  dry_run: boolean;
  files_scanned: number;
  items_routed: number;
  items_skipped: number;
  projects_touched: number;
  projects_created: string[];
}

export default function BackfillButton() {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(dryRun: boolean) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/vault/backfill-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j?.error || `Failed (${r.status})`);
        return;
      }
      if (dryRun) {
        setPreview(j as RunResult);
      } else {
        setPreview(j as RunResult);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {preview && (
        <div className="text-[12px] text-[var(--ink-muted)]">
          {preview.dry_run ? "Preview" : "Done"}: routed {preview.items_routed} items into {preview.projects_touched} projects
          {preview.projects_created.length > 0 && (
            <>{" "}· created: {preview.projects_created.slice(0, 3).join(", ")}{preview.projects_created.length > 3 ? "…" : ""}</>
          )}
        </div>
      )}
      {error && <div className="text-[12px] text-[var(--danger)]">{error}</div>}
      {!preview ? (
        <button
          type="button"
          onClick={() => run(true)}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-[6px] border border-[var(--rule)] bg-[var(--canvas)] hover:bg-[var(--canvas-subtle)] px-3 py-1.5 text-xs disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderTree className="w-3.5 h-3.5" />}
          Backfill loose files (preview)
        </button>
      ) : preview.dry_run ? (
        <button
          type="button"
          onClick={() => run(false)}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-[6px] bg-black text-white px-3 py-1.5 text-xs hover:bg-black/85 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderTree className="w-3.5 h-3.5" />}
          Confirm — route {preview.items_routed} items
        </button>
      ) : null}
    </div>
  );
}
