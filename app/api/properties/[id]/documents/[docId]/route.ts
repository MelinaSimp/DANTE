// app/api/properties/[id]/documents/[docId]/route.ts
//
// Update or remove a single property document. Used for editing
// metadata (title, expires_at, notes) and for unlinking.

import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

const VALID_KINDS = [
  "lease",
  "inspection",
  "disclosure",
  "comp",
  "photo",
  "deed",
  "hoa",
  "insurance",
  "other",
];

async function loadAuth() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();
  if (!profile?.workspace_id) return null;
  return { supabase, user, workspaceId: profile.workspace_id as string };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const ctx = await loadAuth();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, docId } = await params;

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  if (typeof body.title === "string") updates.title = body.title.trim().slice(0, 200);
  if (typeof body.doc_kind === "string" && VALID_KINDS.includes(body.doc_kind)) {
    updates.doc_kind = body.doc_kind;
  }
  if (typeof body.file_path === "string" || body.file_path === null) {
    updates.file_path = body.file_path || null;
  }
  if (typeof body.external_url === "string" || body.external_url === null) {
    updates.external_url = body.external_url || null;
  }
  if (typeof body.expires_at === "string" || body.expires_at === null) {
    updates.expires_at = body.expires_at || null;
  }
  if (typeof body.notes === "string" || body.notes === null) {
    updates.notes =
      typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) || null : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const { data, error } = await ctx.supabase
    .from("property_documents")
    .update(updates)
    .eq("id", docId)
    .eq("property_id", id)
    .eq("workspace_id", ctx.workspaceId)
    .select()
    .single();

  if (error) {
    console.error("property_documents PATCH:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const ctx = await loadAuth();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, docId } = await params;

  // Read the row first so we know whether there's a storage blob to
  // clean up. Best-effort: a missing row still falls through to the
  // delete, which will no-op.
  const { data: existing } = await ctx.supabase
    .from("property_documents")
    .select("file_path")
    .eq("id", docId)
    .eq("property_id", id)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();

  const { error } = await ctx.supabase
    .from("property_documents")
    .delete()
    .eq("id", docId)
    .eq("property_id", id)
    .eq("workspace_id", ctx.workspaceId);

  if (error) {
    console.error("property_documents DELETE:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Remove the storage blob if there was one. Non-fatal — orphaned
  // blobs are recoverable via storage admin; a failed row delete is
  // not, so we prioritise the row.
  if (existing?.file_path) {
    try {
      await supabaseAdmin.storage
        .from("client-documents")
        .remove([existing.file_path]);
    } catch (err) {
      console.error("[property_documents.delete] orphaned blob:", err);
    }
  }

  return NextResponse.json({ success: true });
}
