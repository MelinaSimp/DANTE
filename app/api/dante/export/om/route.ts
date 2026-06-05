// POST /api/dante/export/om — render a branded Offering Memorandum PDF.
//
// Accepts structured property data and returns application/pdf.
// Used by the Dante agent tool and the workflow OM generation node.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  renderOfferingMemorandum,
  type OMInput,
} from "@/lib/pdf/offering-memorandum";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  let body: OMInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.property?.address) {
    return NextResponse.json(
      { error: "property.address is required" },
      { status: 400 },
    );
  }

  // Force workspace ID from session, not from request body
  body.workspaceId = profile.workspace_id;

  try {
    const pdfBuffer = await renderOfferingMemorandum(body);

    const addressSlug = body.property.address
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .toLowerCase()
      .slice(0, 40);
    const filename = `om-${addressSlug}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "PDF render failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
