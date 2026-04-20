// app/api/dante/archive/[id]/route.ts
//
// Per-document endpoint.
//
//   GET   → returns the metadata row + all chunks + a short-lived
//           signed URL so the client can render the original file.
//   DELETE → removes the doc, cascades chunks, and evicts the
//           storage object.
//
// Workspace scoping is enforced by every query, not by RLS from the
// user session — we use the service-role client so the handler works
// uniformly for API callers too.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { deleteDocument } from "@/lib/dante/archive/pipeline";

export const dynamic = "force-dynamic";

async function getCallerWorkspace(): Promise<string | null> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles").select("workspace_id").eq("id", user.id).maybeSingle();
  return profile?.workspace_id || null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const workspaceId = await getCallerWorkspace();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: doc, error } = await supabaseAdmin
    .from("dante_archive_documents").select("*")
    .eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: chunks } = await supabaseAdmin
    .from("dante_archive_chunks")
    .select("id, chunk_index, page_number, content")
    .eq("document_id", id)
    .order("chunk_index", { ascending: true });

  // 5-minute signed URL for the raw file viewer. The bucket is
  // private; we don't want to hand out anything longer-lived.
  let file_url: string | null = null;
  try {
    const { data: signed } = await supabaseAdmin.storage
      .from("dante-archive")
      .createSignedUrl(doc.storage_path, 300);
    file_url = signed?.signedUrl ?? null;
  } catch { /* best-effort */ }

  return NextResponse.json({
    document: doc,
    chunks: chunks || [],
    file_url,
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const workspaceId = await getCallerWorkspace();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await deleteDocument(workspaceId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
