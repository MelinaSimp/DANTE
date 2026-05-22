import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface IndexEntry {
  file_path: string;
  file_name: string;
  file_extension?: string;
  file_size_bytes?: number;
  content_sha256?: string;
  file_modified_at?: string;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: folderId } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: folder } = await supabaseAdmin
    .from("watched_folders")
    .select("id, workspace_id, status")
    .eq("id", folderId)
    .maybeSingle();

  if (!folder) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.workspace_id !== folder.workspace_id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (folder.status !== "active") {
    return NextResponse.json({ error: `folder is ${folder.status}` }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  const files: IndexEntry[] = body?.files;
  if (!Array.isArray(files) || files.length === 0) {
    return NextResponse.json({ error: "files array required" }, { status: 400 });
  }
  if (files.length > 500) {
    return NextResponse.json({ error: "max 500 files per batch" }, { status: 400 });
  }

  const rows = files
    .filter((f) => f.file_path && f.file_name)
    .map((f) => ({
      folder_id: folder.id,
      workspace_id: folder.workspace_id,
      file_path: f.file_path,
      file_name: f.file_name,
      file_extension: f.file_extension || null,
      file_size_bytes: f.file_size_bytes || null,
      content_sha256: f.content_sha256 || null,
      file_modified_at: f.file_modified_at || null,
      last_seen_at: new Date().toISOString(),
    }));

  const { data: upserted, error } = await supabaseAdmin
    .from("watched_file_index")
    .upsert(rows, { onConflict: "folder_id,file_path", ignoreDuplicates: false })
    .select("id, file_path, ingest_status, vault_item_id");

  if (error) {
    console.error("[index-batch] upsert error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabaseAdmin
    .from("watched_folders")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", folder.id);

  // Auto-fire content_requests for newly-indexed files so the
  // Electron app extracts them immediately instead of waiting for
  // Dante to search. Cap at 20 per batch to avoid flooding.
  const needIngest = (upserted || []).filter(
    (r) => !r.vault_item_id && r.ingest_status !== "ingest_requested" && r.ingest_status !== "ingesting" && r.ingest_status !== "ingested",
  );
  const batch = needIngest.slice(0, 20);
  let contentRequestsCreated = 0;
  if (batch.length > 0) {
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const requests = batch.map((r) => ({
      workspace_id: folder.workspace_id,
      folder_id: folder.id,
      index_entry_id: r.id,
      file_path: r.file_path,
      requested_by: "index-batch:auto",
      expires_at: expires,
    }));
    const { error: crErr } = await supabaseAdmin
      .from("content_requests")
      .insert(requests);
    if (!crErr) {
      contentRequestsCreated = batch.length;
      await supabaseAdmin
        .from("watched_file_index")
        .update({ ingest_status: "ingest_requested" })
        .in("id", batch.map((r) => r.id));
    }
  }

  return NextResponse.json({
    indexed: upserted?.length ?? rows.length,
    content_requests_created: contentRequestsCreated,
  });
}
