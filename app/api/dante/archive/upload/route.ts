// app/api/dante/archive/upload/route.ts
//
// Dante Archive — upload endpoint. Accepts multipart/form-data:
//
//   file         File                         required
//   title        string                       required (falls back to file.name)
//   kind         ArchiveKind                  optional
//   tags         string (comma-separated)     optional
//   source_url   string                       optional
//
// Runs the full extract→chunk→embed pipeline synchronously and
// returns the finalized document row. For very large files the
// 60s lambda budget can be tight — anything past ~150 pages should
// eventually move to the background queue, but inline is fine for
// the typical 1-30 page legal doc.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { ingestDocument } from "@/lib/dante/archive/pipeline";
import { SUPPORTED_MIME_TYPES } from "@/lib/dante/archive/extract";
import { resolveArchiveAccess } from "@/lib/dante/archive/guard";
import type { ArchiveKind } from "@/lib/dante/archive/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VALID_KINDS = new Set<ArchiveKind>([
  "form_adv", "ips", "prospectus", "client_agreement",
  "policy", "regulation", "memo", "other",
]);

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const access = await resolveArchiveAccess(supabase);
  if (access.reason === "unauthenticated") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (access.reason === "no_workspace") return NextResponse.json({ error: "No workspace" }, { status: 403 });
  if (!access.allowed) {
    return NextResponse.json(
      { error: "Only the workspace owner can manage the archive." },
      { status: 403 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (!SUPPORTED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type || "unknown"}. Supported: PDF, TXT, MD, DOCX.` },
      { status: 400 },
    );
  }

  const titleInput = String(form.get("title") || "").trim();
  const title = titleInput || file.name.replace(/\.[^.]+$/, "");
  const kindInput = String(form.get("kind") || "").trim() as ArchiveKind;
  const kind: ArchiveKind | null = VALID_KINDS.has(kindInput) ? kindInput : null;
  const sourceUrl = String(form.get("source_url") || "").trim() || null;
  const tagsRaw = String(form.get("tags") || "").trim();
  const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];

  try {
    const buffer = await file.arrayBuffer();
    const result = await ingestDocument({
      workspaceId: access.workspaceId!,
      uploadedBy: access.userId!,
      title,
      kind,
      tags,
      sourceUrl,
      fileName: file.name,
      mimeType: file.type,
      buffer,
    });
    return NextResponse.json({
      document: result.document,
      chunk_count: result.chunkCount,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upload failed";
    // Pre-migration signal so the client can show a specific hint.
    if (msg.includes("42P01") || /relation .* does not exist/i.test(msg)) {
      return NextResponse.json(
        { error: "Archive tables not provisioned. Run the dante-archive SQL migration." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
