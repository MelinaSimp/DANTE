// app/api/electron/watched-folders/[id]/files/[file_id]/confirm/route.ts
//
// User confirmed a pending file should be ingested. Promotes the
// watched_folder_files row into a real vault_items entry, links
// them, and bumps the folder's files_indexed_count.
//
// The file content itself is NOT uploaded to Supabase storage in
// the watched-folder flow — the canonical bytes live on the user's
// machine and are referenced by file_path. file_url is null on
// these vault items; the Electron renderer is the only client that
// can actually open them. (For cloud-folder kinds in Phase 3, the
// file_url is the cloud-provider URL.)
//
// processing_mode_override is inherited from the watched folder's
// default — so a folder marked local_only on registration produces
// vault items that resolve to local_only at chat time, without the
// user having to flag each file individually.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; file_id: string }> },
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
  const { id: folderId, file_id: fileId } = await params;

  const { data: file } = await supabaseAdmin
    .from("watched_folder_files")
    .select(
      "id, folder_id, status, file_name, file_path, file_extension, file_size_bytes, vault_item_id",
    )
    .eq("id", fileId)
    .eq("workspace_id", workspaceId)
    .eq("folder_id", folderId)
    .maybeSingle();
  if (!file) {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }
  const f = file as {
    id: string;
    folder_id: string;
    status: string;
    file_name: string;
    file_path: string;
    file_extension: string | null;
    file_size_bytes: number | null;
    vault_item_id: string | null;
  };
  if (f.status !== "pending_user_confirm") {
    return NextResponse.json(
      { error: `cannot confirm file in status '${f.status}'` },
      { status: 409 },
    );
  }

  const { data: folder } = await supabaseAdmin
    .from("watched_folders")
    .select("default_vault_project_id, default_processing_mode")
    .eq("id", folderId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const fld = folder as {
    default_vault_project_id: string | null;
    default_processing_mode: "cloud" | "local_only";
  } | null;

  // Create the vault item. file_url is null — the file lives on
  // the user's machine, the Electron renderer opens it directly.
  const { data: vaultItem, error: vaultErr } = await supabaseAdmin
    .from("vault_items")
    .insert({
      workspace_id: workspaceId,
      uploaded_by: user.id,
      kind: "watched_folder_file",
      title: f.file_name,
      description: `Auto-ingested from watched folder: ${f.file_path}`,
      file_url: null,
      file_size: f.file_size_bytes,
      file_type: f.file_extension,
      project_id: fld?.default_vault_project_id ?? null,
      processing_mode_override:
        fld?.default_processing_mode === "local_only" ? "local_only" : null,
    })
    .select("id")
    .single();

  if (vaultErr) {
    return NextResponse.json({ error: vaultErr.message }, { status: 500 });
  }
  const newVaultId = (vaultItem as { id: string }).id;

  // Link the watched_folder_files row to the new vault item.
  await supabaseAdmin
    .from("watched_folder_files")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      confirmed_by: user.id,
      vault_item_id: newVaultId,
    })
    .eq("id", fileId);

  // Bump the folder counter and the last_seen_at.
  await supabaseAdmin.rpc("increment_watched_folder_count", {
    p_folder_id: folderId,
  }).then(
    () => undefined,
    () =>
      // Fallback if the RPC isn't installed yet — direct update is
      // racy but tolerable for a counter.
      supabaseAdmin
        .from("watched_folders")
        .select("files_indexed_count")
        .eq("id", folderId)
        .maybeSingle()
        .then(({ data }) => {
          const cur = (data as { files_indexed_count?: number } | null)
            ?.files_indexed_count ?? 0;
          return supabaseAdmin
            .from("watched_folders")
            .update({
              files_indexed_count: cur + 1,
              last_seen_at: new Date().toISOString(),
            })
            .eq("id", folderId);
        }),
  );

  await supabaseAdmin.from("audit_logs").insert({
    workspace_id: workspaceId,
    user_id: user.id,
    action: "watched_folder_file.confirmed",
    resource_type: "vault_item",
    resource_id: newVaultId,
    metadata: {
      file_id: fileId,
      folder_id: folderId,
      file_path: f.file_path,
      processing_mode_override:
        fld?.default_processing_mode === "local_only" ? "local_only" : null,
    },
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({ vault_item_id: newVaultId, status: "confirmed" });
}
