import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ingestVaultItem } from "@/lib/vault/ingest";
import { resolveProjectForWatchedFile } from "@/lib/vault/auto-project";
import { sanitizeForPostgres } from "@/lib/vault/sanitize-text";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "no workspace" }, { status: 403 });
  }

  const { data: requests } = await supabaseAdmin
    .from("content_requests")
    .select("id, file_path, index_entry_id, folder_id")
    .eq("workspace_id", profile.workspace_id)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("requested_at", { ascending: true })
    .limit(10);

  return NextResponse.json({ requests: requests || [] });
}

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const requestId = body?.request_id;
  const extractedText = body?.extracted_text;

  if (!requestId || !extractedText) {
    return NextResponse.json({ error: "request_id and extracted_text required" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "no workspace" }, { status: 403 });
  }

  const { data: cr } = await supabaseAdmin
    .from("content_requests")
    .select("id, index_entry_id, file_path, folder_id, status, workspace_id")
    .eq("id", requestId)
    .maybeSingle();

  if (!cr || cr.workspace_id !== profile.workspace_id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (cr.status !== "pending" && cr.status !== "claimed") {
    return NextResponse.json({ error: `already ${cr.status}` }, { status: 409 });
  }

  await supabaseAdmin
    .from("content_requests")
    .update({ status: "claimed", claimed_at: new Date().toISOString() })
    .eq("id", requestId);

  const { data: indexEntry } = await supabaseAdmin
    .from("watched_file_index")
    .select("file_name, file_extension, file_size_bytes")
    .eq("id", cr.index_entry_id)
    .maybeSingle();

  if (!indexEntry) {
    return NextResponse.json({ error: "index entry gone" }, { status: 404 });
  }

  const { data: folder } = await supabaseAdmin
    .from("watched_folders")
    .select("folder_path, default_vault_project_id, default_processing_mode")
    .eq("id", cr.folder_id)
    .maybeSingle();

  await supabaseAdmin
    .from("watched_file_index")
    .update({ ingest_status: "ingesting" })
    .eq("id", cr.index_entry_id);

  try {
    const resolved = await resolveProjectForWatchedFile({
      workspaceId: cr.workspace_id,
      watchedFolderPath: folder?.folder_path ?? "",
      filePath: cr.file_path,
    });

    const sanitized = sanitizeForPostgres(extractedText);
    const { data: vaultItem, error: insertErr } = await supabaseAdmin
      .from("vault_items")
      .insert({
        workspace_id: cr.workspace_id,
        project_id: resolved.projectId ?? folder?.default_vault_project_id ?? null,
        title: indexEntry.file_name,
        content: sanitized,
        source: "watched_folder",
        file_type: indexEntry.file_extension || "txt",
        processing_mode_override: folder?.default_processing_mode === "local_only" ? "local_only" : null,
      })
      .select("id")
      .single();

    if (insertErr || !vaultItem) throw new Error(insertErr?.message || "insert failed");

    await ingestVaultItem(vaultItem.id, cr.workspace_id);

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
