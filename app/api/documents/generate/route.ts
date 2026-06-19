// POST /api/documents/generate
//
// Render a branded PDF from {title, subtitle, sections[]} and return it
// base64-encoded. Built to be callable by the Drift "Generate Document"
// n8n node (service auth) and reusable from the app (session auth).
//
// Session OR service auth — mirrors /api/underwrite/summary.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { renderBrandedReport, type ReportSection } from "@/lib/pdf/render";
import { resolveServiceWorkspace } from "@/lib/api/service-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function resolveWorkspace(req: NextRequest): Promise<string | null> {
  // Service callers (n8n node) present the service-role key + workspace
  // header. Browser callers fall back to their session.
  const serviceWorkspace = resolveServiceWorkspace(req);
  if (serviceWorkspace) return serviceWorkspace;

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  return profile?.workspace_id ?? null;
}

export async function POST(req: NextRequest) {
  const workspaceId = await resolveWorkspace(req);
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { title?: string; subtitle?: string; sections?: ReportSection[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = (body.title || "").trim();
  const sections = Array.isArray(body.sections) ? body.sections : [];
  if (!title || sections.length === 0) {
    return NextResponse.json(
      { error: "title and a non-empty sections array are required" },
      { status: 400 },
    );
  }

  try {
    const pdfBuffer = await renderBrandedReport({
      workspaceId,
      title,
      subtitle: body.subtitle || "",
      sections,
    });

    const slug =
      title
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase() || "document";

    // Base64 so the n8n node can re-emit it as a binary attachment
    // (downstream: email, save-to-disk, upload) without a storage bucket.
    return NextResponse.json({
      generated: true,
      filename: `${slug}.pdf`,
      mimeType: "application/pdf",
      bytes: pdfBuffer.length,
      base64: Buffer.from(pdfBuffer).toString("base64"),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "PDF rendering failed";
    console.error("[documents-generate]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
