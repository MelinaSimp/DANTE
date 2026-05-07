// app/api/electron/watched-folders/[id]/files/[file_id]/confirm/route.ts
//
// User confirmed a pending file should be ingested. Promotes the
// watched_folder_files row into a real vault_items entry, runs
// the chunking pipeline so the file is searchable by Dante, and
// bumps the folder's files_indexed_count.
//
// The file BYTES themselves are not uploaded to Supabase storage
// — the canonical bytes live on the user's machine and are
// referenced by file_path. file_url stays null; the Electron
// renderer is the only client that can actually open the file.
// (For cloud-folder kinds in Phase 3, file_url will be the cloud-
// provider URL.)
//
// EXTRACTED TEXT, however, IS sent to the server when the folder
// is cloud-default. The renderer extracts text via the Electron
// main process (pdf-parse / docx / plain-text) and POSTs it here
// in `extracted_text`. We save it to vault_items.content and call
// ingestVaultItem() — same chunker + embedder the regular Vault
// upload route uses, so the file is queryable via vault.cite,
// archive.search, and inconsistency.detect immediately after
// confirmation.
//
// For local_only folders, we deliberately ignore extracted_text
// even if the renderer mistakenly sent it. The point of local-only
// is that file content does not reach Drift's servers; the file
// stays path-only, and chat about it routes to local Hermes which
// reads from disk via IPC instead of from the chunks table.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ingestVaultItem } from "@/lib/vault/ingest";
import { resolveProjectForWatchedFile } from "@/lib/vault/auto-project";
import { sanitizeForPostgres } from "@/lib/vault/sanitize-text";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(
  req: Request,
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

  const body = (await req.json().catch(() => ({}))) as {
    extracted_text?: string;
  };

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
    .select("folder_path, default_vault_project_id, default_processing_mode")
    .eq("id", folderId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const fld = folder as {
    folder_path: string;
    default_vault_project_id: string | null;
    default_processing_mode: "cloud" | "local_only";
  } | null;

  // For local_only folders, ignore extracted_text — the privacy
  // contract is that content does not reach Drift's servers.
  const isLocalOnly = fld?.default_processing_mode === "local_only";
  const acceptedText =
    !isLocalOnly && typeof body.extracted_text === "string"
      ? sanitizeForPostgres(body.extracted_text.trim())
      : null;

  // Folder-wise routing: each top-level subfolder becomes a Vault
  // project. See lib/vault/auto-project.ts.
  let autoProjectId: string | null = null;
  let autoProjectName: string | null = null;
  if (fld?.folder_path) {
    try {
      const auto = await resolveProjectForWatchedFile({
        workspaceId,
        watchedFolderPath: fld.folder_path,
        filePath: f.file_path,
        userId: user.id,
      });
      autoProjectId = auto.projectId;
      autoProjectName = auto.projectName;
    } catch (err) {
      console.warn(
        "[confirm] subfolder auto-project resolution failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Create the vault item. file_url is null — the file lives on
  // the user's machine, the Electron renderer opens it directly.
  // content gets the extracted text (if cloud-default), so
  // ingestVaultItem can chunk it without hitting file_url.
  const { data: vaultItem, error: vaultErr } = await supabaseAdmin
    .from("vault_items")
    .insert({
      workspace_id: workspaceId,
      uploaded_by: user.id,
      // vault_items.kind is constrained to 'template' | 'document'.
      // Watched-folder origin is captured by description + the
      // watched_folder_files.vault_item_id link.
      kind: "document",
      title: f.file_name,
      description: `Auto-ingested from watched folder: ${f.file_path}`,
      file_url: null,
      file_size: f.file_size_bytes,
      file_type: f.file_extension,
      content: acceptedText || null,
      project_id: autoProjectId ?? fld?.default_vault_project_id ?? null,
      processing_mode_override: isLocalOnly ? "local_only" : null,
    })
    .select("id")
    .single();

  if (vaultErr) {
    return NextResponse.json({ error: vaultErr.message }, { status: 500 });
  }
  const newVaultId = (vaultItem as { id: string }).id;

  // Run the chunker + embedder on the new vault item so it's
  // searchable immediately. Skip for local_only (no content stored)
  // and for the no-text-extracted case (e.g., scanned PDF without
  // OCR — caller can re-run later if they OCR the file separately).
  let chunkCount = 0;
  let ingestError: string | null = null;
  if (acceptedText) {
    try {
      const result = await ingestVaultItem(newVaultId, { force: true });
      chunkCount = result.chunkCount;
    } catch (err) {
      ingestError = err instanceof Error ? err.message : "ingest_failed";
      console.warn(
        `[watched-folder confirm] ingestVaultItem failed for ${newVaultId}:`,
        ingestError,
      );
      // Don't fail the request — the vault item exists, the user
      // can re-ingest later via /api/vault/[id]/ingest.
    }
  }

  // Link the watched_folder_files row to the new vault item.
  // .select() forces the call to surface errors — a previous
  // version had no error check here, and a CHECK constraint
  // rejected status='confirmed' silently for weeks, leaving
  // orphan vault_items in the DB.
  const { error: linkErr } = await supabaseAdmin
    .from("watched_folder_files")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      confirmed_by: user.id,
      vault_item_id: newVaultId,
    })
    .eq("id", fileId)
    .select("id");
  if (linkErr) {
    console.error(
      `[confirm] FAILED to link watched_folder_files ${fileId} to vault_item ${newVaultId}:`,
      linkErr.message,
    );
    return NextResponse.json(
      {
        error: `Vault item created (${newVaultId}) but linking back to watched_folder_files failed: ${linkErr.message}`,
        vault_item_id: newVaultId,
      },
      { status: 500 },
    );
  }

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
      processing_mode_override: isLocalOnly ? "local_only" : null,
      chunk_count: chunkCount,
      ingest_error: ingestError,
      auto_project_id: autoProjectId,
      auto_project_name: autoProjectName,
    },
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({
    vault_item_id: newVaultId,
    status: "confirmed",
    chunk_count: chunkCount,
    ingest_error: ingestError,
    project_id: autoProjectId,
    project_name: autoProjectName,
  });
}
