// /api/workspace/market-files — upload, list, delete market intel files
//
// POST   → upload a PDF/doc/spreadsheet, extract text, persist
// GET    → list all market files for the workspace
// DELETE → remove a market file by id
//
// Files are stored in Supabase storage under market-intel/{workspace_id}/
// and their extracted text is saved in workspace_market_files for
// injection into Dante's system prompt.

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { extractText } from "@/lib/vault/extract";

export const dynamic = "force-dynamic";

// 20MB limit
const MAX_FILE_SIZE = 20 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/plain",
  "text/csv",
  "text/markdown",
]);

const ALLOWED_EXTENSIONS = new Set([
  "pdf", "docx", "doc", "xlsx", "xls", "txt", "csv", "md",
]);

/**
 * POST — upload a market intel file.
 * FormData: { file: File, label?: string }
 */
export async function POST(req: NextRequest) {
  const auth = await getSessionUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { user, supabase } = auth;

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "no workspace" }, { status: 400 });
  }
  if (profile.role !== "admin" && profile.role !== "owner") {
    return NextResponse.json({ error: "admin required" }, { status: 403 });
  }

  const workspaceId = profile.workspace_id;

  const formData = await req.formData();
  const file = formData.get("file") as File;
  const label = (formData.get("label") as string) || "";
  if (!file) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  // Validate size
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` },
      { status: 400 },
    );
  }

  // Validate type
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (!ALLOWED_TYPES.has(file.type) && !ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json(
      { error: "Unsupported file type. Accepted: PDF, DOCX, XLSX, TXT, CSV, MD" },
      { status: 400 },
    );
  }

  try {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Upload to Supabase storage
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const storagePath = `market-intel/${workspaceId}/${timestamp}_${sanitizedName}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("agent-files")
      .upload(storagePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      console.error("[market-files] storage upload failed:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload file" },
        { status: 500 },
      );
    }

    // Extract text
    let extractedText = "";
    try {
      // Determine mime type — prefer file.type, fall back to extension
      let mimeType = file.type || "";
      if (!mimeType || mimeType === "application/octet-stream") {
        if (ext === "pdf") mimeType = "application/pdf";
        else if (ext === "docx") mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        else if (ext === "xlsx") mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        else if (ext === "txt" || ext === "md" || ext === "csv") mimeType = "text/plain";
      }
      const result = await extractText(buffer, mimeType);
      extractedText = result.text || "";
      // Cap extracted text to prevent prompt bloat
      if (extractedText.length > 50000) {
        extractedText = extractedText.slice(0, 50000) + "\n\n[Truncated — file exceeds 50,000 characters]";
      }
    } catch (err) {
      console.warn("[market-files] text extraction failed:", err);
      extractedText = "[Text extraction failed for this file]";
    }

    // Persist metadata + extracted text
    const { data: row, error: insertError } = await supabaseAdmin
      .from("workspace_market_files")
      .insert({
        workspace_id: workspaceId,
        filename: file.name,
        storage_path: storagePath,
        extracted_text: extractedText,
        file_size_bytes: file.size,
        mime_type: file.type || null,
        label: label.trim() || null,
        uploaded_by: user.id,
      })
      .select("id, filename, file_size_bytes, mime_type, label, uploaded_at")
      .single();

    if (insertError) {
      console.error("[market-files] insert failed:", insertError);
      return NextResponse.json(
        { error: "Failed to save file metadata" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ...row,
      has_text: !!extractedText && !extractedText.startsWith("[Text extraction"),
      text_length: extractedText.length,
    });
  } catch (err: any) {
    console.error("[market-files] upload error:", err);
    return NextResponse.json(
      { error: err?.message || "Upload failed" },
      { status: 500 },
    );
  }
}

/**
 * GET — list all market files for the workspace.
 */
export async function GET() {
  const auth = await getSessionUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { user, supabase } = auth;

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ files: [] });
  }

  const { data, error } = await supabaseAdmin
    .from("workspace_market_files")
    .select("id, filename, file_size_bytes, mime_type, label, uploaded_at")
    .eq("workspace_id", profile.workspace_id)
    .order("uploaded_at", { ascending: false });

  if (error) {
    console.error("[market-files] list failed:", error);
    return NextResponse.json({ files: [] });
  }

  return NextResponse.json({ files: data || [] });
}

/**
 * DELETE — remove a market file by id.
 * Body: { id: string }
 */
export async function DELETE(req: NextRequest) {
  const auth = await getSessionUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { user, supabase } = auth;

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "no workspace" }, { status: 400 });
  }
  if (profile.role !== "admin" && profile.role !== "owner") {
    return NextResponse.json({ error: "admin required" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const fileId = body.id;
  if (!fileId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  // Load the file to get storage path
  const { data: file } = await supabaseAdmin
    .from("workspace_market_files")
    .select("id, storage_path")
    .eq("id", fileId)
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();

  if (!file) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Delete from storage
  if (file.storage_path) {
    await supabaseAdmin.storage
      .from("agent-files")
      .remove([file.storage_path])
      .catch(() => {});
  }

  // Delete from DB
  await supabaseAdmin
    .from("workspace_market_files")
    .delete()
    .eq("id", fileId);

  return NextResponse.json({ ok: true });
}
