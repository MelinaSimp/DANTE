// app/api/electron/watched-folders/[id]/notify/route.ts
//
// The Electron app calls this when its filesystem watcher detects
// a new file in a registered folder. Server validates against the
// folder's allowed_extensions, dedups by sha256, and decides:
//
//   • If the workspace policy is "auto-accept" — register as a
//     vault item immediately.
//   • If the policy is "per-file confirm" — record as
//     status='pending_user_confirm' and surface in the renderer
//     for the user to approve/reject.
//
// Phase 1 ships the protocol; the auto-accept-vs-confirm policy
// flag and the renderer-side confirmation UI land in Phase 2.
// For now, files arrive with status='pending_user_confirm' and
// require an explicit POST to /api/electron/watched-folders/
// /[id]/files/[file_id]/confirm to be promoted to a vault item.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sb = await createServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data: profile } = await sb
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  const workspaceId = (profile as { workspace_id?: string | null } | null)
    ?.workspace_id;
  if (!workspaceId) {
    return NextResponse.json({ error: "no_workspace" }, { status: 400 });
  }
  const { id: folderId } = await params;

  const body = (await req.json().catch(() => ({}))) as {
    file_path?: string;
    file_name?: string;
    file_extension?: string;
    file_size_bytes?: number;
    content_sha256?: string;
  };

  if (!body.file_path || !body.file_name) {
    return NextResponse.json(
      { error: "file_path and file_name required" },
      { status: 400 },
    );
  }

  // Validate folder belongs to workspace + is active.
  const { data: folder } = await supabaseAdmin
    .from("watched_folders")
    .select(
      "id, status, allowed_extensions, default_vault_project_id, default_processing_mode",
    )
    .eq("id", folderId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!folder) {
    return NextResponse.json({ error: "folder not found" }, { status: 404 });
  }
  const f = folder as {
    status: string;
    allowed_extensions: string[];
    default_vault_project_id: string | null;
    default_processing_mode: "cloud" | "local_only";
  };
  if (f.status !== "active") {
    return NextResponse.json(
      { error: `folder is ${f.status}, not active` },
      { status: 409 },
    );
  }

  const ext = (body.file_extension || extractExt(body.file_name)).toLowerCase();
  let status: string = "pending_user_confirm";
  let rejectedReason: string | null = null;
  let dupVaultItemId: string | null = null;

  if (!f.allowed_extensions.map((e) => e.toLowerCase()).includes(ext)) {
    status = "rejected_extension";
    rejectedReason = `extension '${ext}' not in allowed list`;
  } else if (body.file_size_bytes && body.file_size_bytes > 100 * 1024 * 1024) {
    status = "rejected_size";
    rejectedReason = `file size ${body.file_size_bytes} exceeds 100MB cap`;
  } else if (body.content_sha256) {
    // Dedup: have we already ingested a file with this hash in this
    // workspace? If so, status=rejected_duplicate; the existing
    // vault_item_id is reported back so the user/renderer can link.
    const { data: existing } = await supabaseAdmin
      .from("watched_folder_files")
      .select("vault_item_id")
      .eq("workspace_id", workspaceId)
      .eq("content_sha256", body.content_sha256)
      .not("vault_item_id", "is", null)
      .maybeSingle();
    const exV = (existing as { vault_item_id?: string | null } | null)?.vault_item_id;
    if (exV) {
      status = "rejected_duplicate";
      rejectedReason = `content hash already ingested as vault item ${exV}`;
      dupVaultItemId = exV;
    }
  }

  const { data: inserted, error } = await supabaseAdmin
    .from("watched_folder_files")
    .insert({
      folder_id: folderId,
      workspace_id: workspaceId,
      file_path: body.file_path,
      file_name: body.file_name,
      file_extension: ext,
      file_size_bytes: body.file_size_bytes ?? null,
      content_sha256: body.content_sha256 ?? null,
      status,
      rejected_reason: rejectedReason,
      vault_item_id: dupVaultItemId,
    })
    .select("id, status, rejected_reason, vault_item_id, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    file: inserted,
    next_action:
      status === "pending_user_confirm"
        ? "user_confirmation_required"
        : "rejected",
    default_processing_mode: f.default_processing_mode,
    default_vault_project_id: f.default_vault_project_id,
  });
}

function extractExt(name: string): string {
  const m = name.match(/\.([a-z0-9]+)$/i);
  return m ? m[1] : "";
}
