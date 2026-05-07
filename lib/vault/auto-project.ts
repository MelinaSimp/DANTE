// lib/vault/auto-project.ts
//
// "Folder-wise" ingest for watched folders. The user registers a
// deal-room parent folder (e.g. ~/Downloads/TerraGroup Files), and
// each top-level subfolder (LOI, Architectural, REFINANCE NH 2022,
// Estoppel, ...) becomes its own Vault project. Files at the root
// of the watched folder stay loose.
//
// This makes /vault mirror the user's on-disk structure instead of
// flattening hundreds of unrelated PDFs into Loose Files, and it
// gives Dante a natural filterable scope ("answer using only the
// LOI project") for follow-up questions.
//
// The migration 20260506_vault_projects_workspace_name_unique adds
// a (workspace_id, lower(name)) unique index so parallel notify
// calls inserting "Architectural" 50 times settle to a single row
// via ON CONFLICT.

import { supabaseAdmin } from "@/lib/supabase/admin";
import path from "node:path";

export interface ResolveOpts {
  workspaceId: string;
  /** The watched folder's folder_path on the user's disk. */
  watchedFolderPath: string;
  /** Absolute file_path the watcher reported. */
  filePath: string;
  /** Optional creator id to stamp on a freshly-auto-created project. */
  userId?: string | null;
}

export interface ResolveResult {
  /** vault_projects.id, or null when the file is at the watch root
   *  (loose) or the name resolution failed. */
  projectId: string | null;
  /** The subfolder name we used (or null for loose). */
  projectName: string | null;
  /** True if we created a new vault_projects row for this call. */
  created: boolean;
}

const NULL_RESULT: ResolveResult = {
  projectId: null,
  projectName: null,
  created: false,
};

/**
 * Given a watched-folder file, find or create the Vault project
 * that should own its vault_item. Project = first subfolder of
 * file_path relative to watchedFolderPath. Files at the root
 * return null (stay loose).
 *
 * Idempotent: relies on the unique index on
 * (workspace_id, lower(name)) to coalesce concurrent inserts.
 */
export async function resolveProjectForWatchedFile(
  opts: ResolveOpts,
): Promise<ResolveResult> {
  const subfolderName = subfolderForPath(
    opts.watchedFolderPath,
    opts.filePath,
  );
  if (!subfolderName) return NULL_RESULT;

  // Try to find an existing project case-insensitively.
  const { data: existing } = await supabaseAdmin
    .from("vault_projects")
    .select("id, name")
    .eq("workspace_id", opts.workspaceId)
    .ilike("name", subfolderName)
    .maybeSingle();
  if (existing) {
    return {
      projectId: (existing as { id: string }).id,
      projectName: (existing as { name: string }).name,
      created: false,
    };
  }

  // Insert. ON CONFLICT swallows the race where two parallel notify
  // calls both reached this branch — second wins-and-returns the
  // existing row.
  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from("vault_projects")
    .upsert(
      {
        workspace_id: opts.workspaceId,
        name: subfolderName,
        description: `Auto-created from watched folder subfolder · ${subfolderName}`,
        created_by: opts.userId ?? null,
      },
      { onConflict: "workspace_id,name", ignoreDuplicates: false },
    )
    .select("id, name")
    .single();

  if (insertErr || !inserted) {
    // Fall back to a fresh select in case the unique index uses
    // lower(name) — supabase upsert with custom conflict expression
    // sometimes reports a "no row" on conflict path.
    const { data: refetched } = await supabaseAdmin
      .from("vault_projects")
      .select("id, name")
      .eq("workspace_id", opts.workspaceId)
      .ilike("name", subfolderName)
      .maybeSingle();
    if (refetched) {
      return {
        projectId: (refetched as { id: string }).id,
        projectName: (refetched as { name: string }).name,
        created: false,
      };
    }
    console.warn(
      `[auto-project] failed to upsert project '${subfolderName}' for workspace ${opts.workspaceId}:`,
      insertErr?.message,
    );
    return NULL_RESULT;
  }
  return {
    projectId: (inserted as { id: string }).id,
    projectName: (inserted as { name: string }).name,
    created: true,
  };
}

/**
 * Compute the first-segment subfolder name for a file under a
 * watch root. Returns null when:
 *   • file lives at watch root (no segment)
 *   • paths can't be normalized into a parent/child relationship
 *   • the segment is a hidden directory (starts with '.')
 */
export function subfolderForPath(
  watchedFolderPath: string,
  filePath: string,
): string | null {
  // Normalize trailing slashes to be tolerant of either form.
  const root = path.normalize(watchedFolderPath).replace(/\/+$/, "");
  const file = path.normalize(filePath);
  if (!file.startsWith(root + path.sep) && file !== root) return null;

  const rel = file.slice(root.length + 1);
  const firstSep = rel.indexOf(path.sep);
  if (firstSep < 0) return null; // file at watch root → loose
  const segment = rel.slice(0, firstSep).trim();
  if (!segment) return null;
  if (segment.startsWith(".")) return null; // hidden dirs
  return segment;
}
