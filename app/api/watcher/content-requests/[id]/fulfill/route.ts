import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ingestVaultItem } from "@/lib/vault/ingest";
import { resolveProjectForWatchedFile } from "@/lib/vault/auto-project";
import { sanitizeForPostgres } from "@/lib/vault/sanitize-text";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: requestId } = await params;
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Bearer token required" }, { status: 401 });
  }

  const { data: folder } = await supabaseAdmin
    .from("watched_folders")
    .select("id, workspace_id, folder_path, default_vault_project_id, default_processing_mode, watcher_token")
    .eq("watcher_token", token)
    .maybeSingle();

  if (!folder) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  const { data: cr } = await supabaseAdmin
    .from("content_requests")
    .select("id, index_entry_id, file_path, folder_id, status")
    .eq("id", requestId)
    .maybeSingle();

  if (!cr || cr.folder_id !== folder.id) {
    return NextResponse.json({ error: "request not found" }, { status: 404 });
  }
  if (cr.status !== "pending" && cr.status !== "claimed") {
    return NextResponse.json({ error: `request already ${cr.status}` }, { status: 409 });
  }

  await supabaseAdmin
    .from("content_requests")
    .update({ status: "claimed", claimed_at: new Date().toISOString() })
    .eq("id", requestId);

  const body = await req.json().catch(() => null);
  const extractedText = body?.extracted_text;
  if (!extractedText || typeof extractedText !== "string") {
    await supabaseAdmin
      .from("content_requests")
      .update({ status: "failed", error: "no extracted_text" })
      .eq("id", requestId);
    await supabaseAdmin
      .from("watched_file_index")
      .update({ ingest_status: "ingest_failed", ingest_error: "no extracted_text" })
      .eq("id", cr.index_entry_id);
    return NextResponse.json({ error: "extracted_text required" }, { status: 400 });
  }

  const { data: indexEntry } = await supabaseAdmin
    .from("watched_file_index")
    .select("file_name, file_extension, file_size_bytes, content_sha256")
    .eq("id", cr.index_entry_id)
    .maybeSingle();

  if (!indexEntry) {
    return NextResponse.json({ error: "index entry not found" }, { status: 404 });
  }

  await supabaseAdmin
    .from("watched_file_index")
    .update({ ingest_status: "ingesting" })
    .eq("id", cr.index_entry_id);

  try {
    const resolved = await resolveProjectForWatchedFile({
      workspaceId: folder.workspace_id,
      watchedFolderPath: folder.folder_path,
      filePath: cr.file_path,
    });

    const sanitized = sanitizeForPostgres(extractedText);
    const { data: vaultItem, error: insertErr } = await supabaseAdmin
      .from("vault_items")
      .insert({
        workspace_id: folder.workspace_id,
        project_id: resolved.projectId ?? folder.default_vault_project_id,
        title: indexEntry.file_name,
        content: sanitized,
        source: "watched_folder",
        file_type: indexEntry.file_extension || "txt",
        processing_mode_override: folder.default_processing_mode === "local_only" ? "local_only" : null,
      })
      .select("id")
      .single();

    if (insertErr || !vaultItem) {
      throw new Error(insertErr?.message || "vault insert failed");
    }

    await ingestVaultItem(vaultItem.id, folder.workspace_id);

    await supabaseAdmin
      .from("watched_file_index")
      .update({
        ingest_status: "ingested",
        vault_item_id: vaultItem.id,
        ingested_at: new Date().toISOString(),
      })
      .eq("id", cr.index_entry_id);

    await supabaseAdmin
      .from("content_requests")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", requestId);

    return NextResponse.json({ ok: true, vault_item_id: vaultItem.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabaseAdmin
      .from("content_requests")
      .update({ status: "failed", error: msg })
      .eq("id", requestId);
    await supabaseAdmin
      .from("watched_file_index")
      .update({ ingest_status: "ingest_failed", ingest_error: msg })
      .eq("id", cr.index_entry_id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
