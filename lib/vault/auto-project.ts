// lib/vault/auto-project.ts
//
// "One project per watched folder" ingest. The user registers a
// deal-room parent folder (e.g. ~/Downloads/TerraGroup Files), and
// the entire watched folder — every file at any depth inside it —
// rolls up into a single Vault project named after the watched
// folder's basename ("TerraGroup Files").
//
// Earlier versions used the FIRST subfolder as the project name,
// which fragmented one client's deal room into 30 micro-projects.
// The advisor thinks of "TerraGroup" as one thing; the project
// surface should reflect that.
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
 * that should own its vault_item. Project name = the watched
 * folder's basename, regardless of how deep the file sits inside.
 * Files anywhere under TerraGroup Files/* all roll up into one
 * "TerraGroup Files" project.
 *
 * Idempotent: relies on the unique index on
 * (workspace_id, lower(name)) to coalesce concurrent inserts.
 */
export async function resolveProjectForWatchedFile(
  opts: ResolveOpts,
): Promise<ResolveResult> {
  const projectName = projectNameForWatchedFolder(opts.watchedFolderPath);
  if (!projectName) return NULL_RESULT;

  // Try to find an existing project case-insensitively.
  const { data: existing } = await supabaseAdmin
    .from("vault_projects")
    .select("id, name")
    .eq("workspace_id", opts.workspaceId)
    .ilike("name", projectName)
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
        name: projectName,
        description: `Auto-created from watched folder · ${projectName}`,
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
      .ilike("name", projectName)
      .maybeSingle();
    if (refetched) {
      return {
        projectId: (refetched as { id: string }).id,
        projectName: (refetched as { name: string }).name,
        created: false,
      };
    }
    console.warn(
      `[auto-project] failed to upsert project '${projectName}' for workspace ${opts.workspaceId}:`,
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
 * Project name for a watched folder = its basename.
 *   /Users/x/Downloads/TerraGroup Files  → "TerraGroup Files"
 *   /Users/x/Documents/Hermes Drop       → "Hermes Drop"
 *
 * Returns null when the path resolves to nothing usable (empty,
 * root-only, hidden).
 */
export function projectNameForWatchedFolder(watchedFolderPath: string): string | null {
  const cleaned = path.normalize(watchedFolderPath).replace(/\/+$/, "");
  const name = path.basename(cleaned).trim();
  if (!name) return null;
  if (name.startsWith(".")) return null;
  return name;
}

/**
 * Legacy helper retained for any caller that wants the "first
 * segment under the watch root" behavior (e.g. surfacing the
 * subfolder in UI breadcrumbs without changing project membership).
 * No longer used for project routing.
 */
export function subfolderForPath(
  watchedFolderPath: string,
  filePath: string,
): string | null {
  const root = path.normalize(watchedFolderPath).replace(/\/+$/, "");
  const file = path.normalize(filePath);
  if (!file.startsWith(root + path.sep) && file !== root) return null;

  const rel = file.slice(root.length + 1);
  const firstSep = rel.indexOf(path.sep);
  if (firstSep < 0) return null;
  const segment = rel.slice(0, firstSep).trim();
  if (!segment) return null;
  if (segment.startsWith(".")) return null;
  return segment;
}
