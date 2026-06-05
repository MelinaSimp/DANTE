// POST /api/lease-abstractor/export-pdf — render a lease abstract as branded PDF.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { renderBrandedReport, type ReportSection } from "@/lib/pdf/render";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
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
  if (!profile?.workspace_id)
    return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const body = await req.json();
  const { abstractId, sections } = body as {
    abstractId?: string;
    sections?: ReportSection[];
  };

  if (!abstractId || !sections?.length) {
    return NextResponse.json({ error: "abstractId and sections required" }, { status: 400 });
  }

  // Verify ownership via the workspace
  const { data: abstract } = await supabaseAdmin
    .from("lease_abstracts")
    .select("id, workspace_id, vault_item_id")
    .eq("id", abstractId)
    .maybeSingle();

  if (!abstract || abstract.workspace_id !== profile.workspace_id) {
    return NextResponse.json({ error: "Abstract not found" }, { status: 404 });
  }

  // Get the vault item title for the PDF header
  const { data: vaultItem } = await supabaseAdmin
    .from("vault_items")
    .select("title")
    .eq("id", abstract.vault_item_id)
    .maybeSingle();

  const docTitle = (vaultItem as { title?: string } | null)?.title ?? "Lease Abstract";

  try {
    const pdfBuffer = await renderBrandedReport({
      workspaceId: profile.workspace_id,
      title: `Lease Abstract: ${docTitle}`,
      subtitle: `Extracted ${new Date().toLocaleDateString()} -- AI-generated, verify against source`,
      sections,
    });

    const filename = `lease-abstract-${abstractId.slice(0, 8)}.pdf`;
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "PDF rendering failed";
    console.error("[lease-pdf-export]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
