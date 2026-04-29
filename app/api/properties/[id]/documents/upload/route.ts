// POST /api/properties/[id]/documents/upload
//
// Multipart upload that creates a property_documents row backed by
// a real file in Supabase Storage. Mirrors the contact-document
// upload pattern (app/api/documents/upload/route.ts) — same bucket
// (client-documents) but namespaced under a properties/ prefix so
// the bucket policies work identically.
//
// Body: FormData with
//   file        — the upload (PDF, image, or doc — capped at 25 MB)
//   title       — display title
//   doc_kind    — lease | inspection | disclosure | comp | photo |
//                 deed | hoa | insurance | other
//   expires_at  — optional ISO date (drives renewal cron)
//   notes       — optional free text
//
// Returns the inserted property_documents row.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/audit/log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;

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

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/heic",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }
  const workspaceId = profile.workspace_id;

  const { id: propertyId } = await params;

  // Workspace-scope the property so a cross-workspace upload returns
  // 404 instead of going through to storage.
  const { data: prop } = await supabaseAdmin
    .from("properties")
    .select("id")
    .eq("id", propertyId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!prop) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large — max ${MAX_BYTES / 1024 / 1024} MB` },
      { status: 400 },
    );
  }
  if (file.type && !ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type}` },
      { status: 400 },
    );
  }

  const title =
    ((formData.get("title") as string) || file.name || "Untitled")
      .trim()
      .slice(0, 200);
  const docKindRaw = (formData.get("doc_kind") as string) || "other";
  const doc_kind = VALID_KINDS.includes(docKindRaw) ? docKindRaw : "other";
  const expiresRaw = (formData.get("expires_at") as string) || "";
  const expires_at = expiresRaw && /^\d{4}-\d{2}-\d{2}/.test(expiresRaw)
    ? expiresRaw
    : null;
  const notesRaw = (formData.get("notes") as string) || "";
  const notes = notesRaw.trim().slice(0, 2000) || null;

  // Storage path: {workspaceId}/properties/{propertyId}/{ts}_{name}.
  // Sharing the client-documents bucket keeps RLS rules unified.
  const ts = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  const filePath = `${workspaceId}/properties/${propertyId}/${ts}_${safeName}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await supabaseAdmin.storage
    .from("client-documents")
    .upload(filePath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (uploadErr) {
    console.error("[property_documents.upload] storage error:", uploadErr);
    const msg = uploadErr.message || "Upload failed";
    return NextResponse.json(
      {
        error: msg.includes("Bucket")
          ? "Storage bucket 'client-documents' not configured — see supabase migrations"
          : msg,
      },
      { status: 500 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("property_documents")
    .insert({
      workspace_id: workspaceId,
      property_id: propertyId,
      created_by: user.id,
      title,
      doc_kind,
      file_path: filePath,
      external_url: null,
      expires_at,
      notes,
    })
    .select()
    .single();

  if (error) {
    // Clean up the orphaned blob if the row insert fails.
    await supabaseAdmin.storage.from("client-documents").remove([filePath]);
    console.error("[property_documents.upload] insert error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAuditEvent({
    workspaceId,
    actorUserId: user.id,
    actorKind: "user",
    action: "document.upload",
    entityType: "property_document",
    entityId: data.id,
    metadata: {
      property_id: propertyId,
      title,
      doc_kind,
      file_name: file.name,
      file_size: file.size,
      expires_at,
    },
    request: req,
  });

  return NextResponse.json(data);
}

// GET /api/properties/[id]/documents/upload?path=<storage-path>
// — issues a short-lived signed URL the UI can use to render or
// download the underlying file.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  const { id: propertyId } = await params;
  const path = req.nextUrl.searchParams.get("path");
  if (!path) return NextResponse.json({ error: "path required" }, { status: 400 });

  // Path must live under this workspace + property — defends against
  // a forged signed-URL request for someone else's storage path.
  const expectedPrefix = `${profile.workspace_id}/properties/${propertyId}/`;
  if (!path.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin.storage
    .from("client-documents")
    .createSignedUrl(path, 300);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
  }
  return NextResponse.json({ url: data.signedUrl });
}
