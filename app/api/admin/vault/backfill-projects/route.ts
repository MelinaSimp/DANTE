// /api/admin/vault/backfill-projects
//
// One-shot backfill: every vault_item that came from a watched
// folder but currently has project_id = null gets routed into the
// project derived from the watched folder's basename. Creates the
// project if it doesn't exist (case-insensitive match first).
//
// Idempotent — re-running is a no-op for files already routed.
// Superadmin-gated. Triggered manually from the admin UI; the
// per-customer pricing surface adds a button.

import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasSuperadminAccess } from "@/lib/superadmin";
import { resolveProjectForWatchedFile } from "@/lib/vault/auto-project";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface PostBody {
  /** Optional: limit to a specific workspace. Default: all workspaces. */
  workspaceId?: string;
  /** Default false. When true, returns the plan without writing. */
  dryRun?: boolean;
}

interface FolderRow {
  id: string;
  workspace_id: string;
  folder_path: string;
}

interface FileRow {
  id: string;
  workspace_id: string;
  folder_id: string;
  file_path: string;
  vault_item_id: string | null;
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", user.id)
    .maybeSingle();
  if (!hasSuperadminAccess(user.email, profile?.is_superadmin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body: PostBody = await req.json().catch(() => ({}));
  const dryRun = !!body.dryRun;

  // Pull every watched folder, indexed by id. The folder_path is the
  // input to projectNameForWatchedFolder().
  const folderQuery = supabaseAdmin
    .from("watched_folders")
    .select("id, workspace_id, folder_path");
  const { data: folders, error: folderErr } = body.workspaceId
    ? await folderQuery.eq("workspace_id", body.workspaceId)
    : await folderQuery;
  if (folderErr) {
    return NextResponse.json({ error: folderErr.message }, { status: 500 });
  }
  const folderById = new Map<string, FolderRow>();
  for (const f of (folders || []) as FolderRow[]) folderById.set(f.id, f);

  // Pull every watched_folder_files row that has a vault_item_id but
  // whose vault_item still has project_id = null. We only care about
  // the loose ones.
  const fileQuery = supabaseAdmin
    .from("watched_folder_files")
    .select("id, workspace_id, folder_id, file_path, vault_item_id")
    .not("vault_item_id", "is", null);
  const { data: files, error: fileErr } = body.workspaceId
    ? await fileQuery.eq("workspace_id", body.workspaceId)
    : await fileQuery;
  if (fileErr) {
    return NextResponse.json({ error: fileErr.message }, { status: 500 });
  }

  // Filter to vault_items currently in Loose (project_id null).
  const itemIds = (files || []).map((f: FileRow) => f.vault_item_id).filter(Boolean) as string[];
  const looseItemIds = new Set<string>();
  if (itemIds.length > 0) {
    // Chunked .in() in case there are thousands.
    const CHUNK = 500;
    for (let i = 0; i < itemIds.length; i += CHUNK) {
      const slice = itemIds.slice(i, i + CHUNK);
      const { data: rows } = await supabaseAdmin
        .from("vault_items")
        .select("id")
        .in("id", slice)
        .is("project_id", null);
      for (const r of (rows || []) as { id: string }[]) looseItemIds.add(r.id);
    }
  }

  let scanned = 0;
  let routed = 0;
  let skipped = 0;
  const projectsTouched = new Set<string>();
  const projectCreatedNames = new Set<string>();

  for (const f of (files || []) as FileRow[]) {
    scanned += 1;
    if (!f.vault_item_id || !looseItemIds.has(f.vault_item_id)) {
      skipped += 1;
      continue;
    }
    const folder = folderById.get(f.folder_id);
    if (!folder) {
      skipped += 1;
      continue;
    }

    const auto = await resolveProjectForWatchedFile({
      workspaceId: f.workspace_id,
      watchedFolderPath: folder.folder_path,
      filePath: f.file_path,
      userId: user.id,
    });

    if (!auto.projectId) {
      skipped += 1;
      continue;
    }

    if (auto.created) projectCreatedNames.add(auto.projectName || auto.projectId);
    projectsTouched.add(auto.projectId);

    if (dryRun) {
      routed += 1;
      continue;
    }

    const { error: updErr } = await supabaseAdmin
      .from("vault_items")
      .update({ project_id: auto.projectId })
      .eq("id", f.vault_item_id);
    if (updErr) {
      console.warn("[backfill-projects] update failed:", updErr.message);
      skipped += 1;
      continue;
    }
    routed += 1;
  }

  return NextResponse.json({
    dry_run: dryRun,
    files_scanned: scanned,
    items_routed: routed,
    items_skipped: skipped,
    projects_touched: projectsTouched.size,
    projects_created: Array.from(projectCreatedNames),
  });
}
