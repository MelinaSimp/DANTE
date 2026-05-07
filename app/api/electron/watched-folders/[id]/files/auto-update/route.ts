// app/api/electron/watched-folders/[id]/files/auto-update/route.ts
//
// chokidar in the Electron main process detected a CHANGE to a
// file that's already been confirmed once. Instead of putting the
// updated version back in the pending queue (forcing the user to
// re-approve every save), we re-ingest in-place: same vault_item,
// new content, fresh chunks.
//
// The renderer is responsible for two things before calling this
// endpoint:
//   1. Detecting that this file_path already has a confirmed
//      vault_item_id (look up in the local watched_folder_files
//      list it already polls).
//   2. Extracting the new content via window.electronAPI.watched.
//      extractFileText. Bytes never leave the machine; we only
//      receive the extracted text.
//
// For local_only folders, the renderer should NEVER hit this
// endpoint — extracted text would defeat the privacy contract.
// We defensively reject extracted_text from local_only folders
// here too, matching the confirm route.
//
// On success: the file's vault_item.content is replaced, all
// existing chunks are dropped + re-embedded, an audit row is
// inserted with status='auto_updated', and the response carries
// the chunk count for the renderer to display.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ingestVaultItem } from "@/lib/vault/ingest";
import { sanitizeForPostgres } from "@/lib/vault/sanitize-text";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

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
    file_size_bytes?: number;
    content_sha256?: string;
    extracted_text?: string;
  };

  if (!body.file_path) {
    return NextResponse.json(
      { error: "file_path required" },
      { status: 400 },
    );
  }

  // Find the existing confirmed entry for this path.
  const { data: prior } = await supabaseAdmin
    .from("watched_folder_files")
    .select("id, vault_item_id, content_sha256")
    .eq("workspace_id", workspaceId)
    .eq("folder_id", folderId)
    .eq("file_path", body.file_path)
    .eq("status", "confirmed")
    .not("vault_item_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!prior) {
    return NextResponse.json(
      { error: "no prior confirmed file at this path" },
      { status: 404 },
    );
  }
  const priorRow = prior as {
    id: string;
    vault_item_id: string;
    content_sha256: string | null;
  };

  // No-op when the hash matches a previous version — chokidar
  // sometimes fires `change` for identical content (atime, etc.).
  if (
    body.content_sha256 &&
    body.content_sha256 === priorRow.content_sha256
  ) {
    return NextResponse.json({
      status: "noop",
      reason: "sha256_unchanged",
      vault_item_id: priorRow.vault_item_id,
    });
  }

  const { data: folder } = await supabaseAdmin
    .from("watched_folders")
    .select("default_processing_mode")
    .eq("id", folderId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const isLocalOnly =
    (folder as { default_processing_mode?: string } | null)
      ?.default_processing_mode === "local_only";

  // Defense in depth: silently drop extracted_text on local_only
  // folders even if the renderer mistakenly sent it.
  const acceptedText =
    !isLocalOnly && typeof body.extracted_text === "string"
      ? sanitizeForPostgres(body.extracted_text.trim())
      : null;

  // Update vault_items metadata. content gets replaced when we
  // have new text; otherwise leave it (the file may be a scanned
  // PDF or unsupported format).
  const update: Record<string, unknown> = {
    file_size: body.file_size_bytes ?? null,
    updated_at: new Date().toISOString(),
  };
  if (acceptedText) update.content = acceptedText;

  await supabaseAdmin
    .from("vault_items")
    .update(update)
    .eq("id", priorRow.vault_item_id)
    .eq("workspace_id", workspaceId);

  // Re-chunk + re-embed. ingestVaultItem with force:true clears
  // existing chunks first, so this is fully idempotent.
  let chunkCount = 0;
  let ingestError: string | null = null;
  if (acceptedText) {
    try {
      const result = await ingestVaultItem(priorRow.vault_item_id, {
        force: true,
      });
      chunkCount = result.chunkCount;
    } catch (err) {
      ingestError = err instanceof Error ? err.message : "ingest_failed";
      console.warn(
        `[watched-folder auto-update] ingestVaultItem failed for ${priorRow.vault_item_id}:`,
        ingestError,
      );
    }
  }

  // Append a new watched_folder_files audit row so the SEC question
  // "show every modification to this file Drift saw" has a complete
  // timeline. Linked to the same vault_item_id; status reflects that
  // the user didn't have to approve this round.
  const { data: auditRow, error: auditErr } = await supabaseAdmin
    .from("watched_folder_files")
    .insert({
      folder_id: folderId,
      workspace_id: workspaceId,
      file_path: body.file_path,
      file_name: body.file_path.split("/").pop() || body.file_path,
      file_extension:
        (body.file_path.match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase(),
      file_size_bytes: body.file_size_bytes ?? null,
      content_sha256: body.content_sha256 ?? null,
      status: "auto_updated",
      vault_item_id: priorRow.vault_item_id,
      confirmed_at: new Date().toISOString(),
      confirmed_by: user.id,
    })
    .select("id")
    .single();
  if (auditErr) {
    console.warn(
      "[watched-folder auto-update] audit insert failed:",
      auditErr.message,
    );
  }

  await supabaseAdmin.from("audit_logs").insert({
    workspace_id: workspaceId,
    user_id: user.id,
    action: "watched_folder_file.auto_updated",
    resource_type: "vault_item",
    resource_id: priorRow.vault_item_id,
    metadata: {
      folder_id: folderId,
      file_path: body.file_path,
      content_sha256: body.content_sha256 ?? null,
      chunk_count: chunkCount,
      ingest_error: ingestError,
      audit_row_id: (auditRow as { id?: string } | null)?.id ?? null,
    },
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({
    status: "auto_updated",
    vault_item_id: priorRow.vault_item_id,
    chunk_count: chunkCount,
    ingest_error: ingestError,
  });
}
