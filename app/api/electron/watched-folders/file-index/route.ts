import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
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

  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  const status = url.searchParams.get("status") || "";
  const folderId = url.searchParams.get("folder_id") || "";
  const extensions = url.searchParams.get("extensions") || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from("watched_file_index")
    .select("*", { count: "exact" })
    .eq("workspace_id", profile.workspace_id)
    .is("deleted_at", null)
    .order("last_seen_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (folderId) {
    query = query.eq("folder_id", folderId);
  }

  if (status) {
    const statuses = status.split(",").map((s) => s.trim());
    query = query.in("ingest_status", statuses);
  }

  if (extensions) {
    const exts = extensions.split(",").map((e) => e.trim().toLowerCase());
    query = query.in("file_extension", exts);
  }

  if (q) {
    query = query.textSearch("search_tsv", q, { type: "websearch" });
  }

  const { data: files, count, error } = await query;

  if (error) {
    console.error("[file-index] query error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ files: files || [], total: count || 0, page });
}

export async function POST(req: Request) {
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

  const body = await req.json().catch(() => null);
  const indexEntryId = body?.index_entry_id;
  if (!indexEntryId) {
    return NextResponse.json({ error: "index_entry_id required" }, { status: 400 });
  }

  const { data: entry } = await supabaseAdmin
    .from("watched_file_index")
    .select("id, folder_id, file_path, ingest_status, workspace_id")
    .eq("id", indexEntryId)
    .maybeSingle();

  if (!entry || entry.workspace_id !== profile.workspace_id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (entry.ingest_status === "ingested") {
    return NextResponse.json({ error: "already ingested" }, { status: 409 });
  }

  const { data: cr } = await supabaseAdmin
    .from("content_requests")
    .insert({
      workspace_id: profile.workspace_id,
      folder_id: entry.folder_id,
      index_entry_id: entry.id,
      file_path: entry.file_path,
      requested_by: `user:${user.id}`,
    })
    .select("id")
    .single();

  await supabaseAdmin
    .from("watched_file_index")
    .update({ ingest_status: "ingest_requested" })
    .eq("id", indexEntryId);

  return NextResponse.json({ content_request_id: cr?.id, status: "ingest_requested" });
}

/**
 * DELETE — remove an ingested file from the vault and reset its index status.
 * Body: { index_entry_id: string }
 */
export async function DELETE(req: Request) {
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

  const body = await req.json().catch(() => null);
  const indexEntryId = body?.index_entry_id;
  if (!indexEntryId) {
    return NextResponse.json({ error: "index_entry_id required" }, { status: 400 });
  }

  const { data: entry } = await supabaseAdmin
    .from("watched_file_index")
    .select("id, vault_item_id, ingest_status, workspace_id")
    .eq("id", indexEntryId)
    .maybeSingle();

  if (!entry || entry.workspace_id !== profile.workspace_id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (entry.ingest_status !== "ingested" || !entry.vault_item_id) {
    return NextResponse.json({ error: "file is not ingested" }, { status: 400 });
  }

  // Delete the vault item
  const { error: delErr } = await supabaseAdmin
    .from("vault_items")
    .delete()
    .eq("id", entry.vault_item_id)
    .eq("workspace_id", profile.workspace_id);

  if (delErr) {
    console.error("[file-index] vault delete error:", delErr);
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  // Reset the index entry back to "indexed"
  await supabaseAdmin
    .from("watched_file_index")
    .update({
      ingest_status: "indexed",
      vault_item_id: null,
      ingested_at: null,
      ingest_error: null,
    })
    .eq("id", indexEntryId);

  return NextResponse.json({ success: true, status: "indexed" });
}
