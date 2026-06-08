// app/api/site-scan/detail/route.ts
//
// POST /api/site-scan/detail
//
// Run consolidated due diligence on a property: auditor records, census
// demographics, EPA brownfield check, tax estimates, and linked vault
// documents. Called by the DriftDueDiligence n8n node after geocoding.
//
// Accepts { address, lat?, lng?, workspace_id? }. The address is used
// to look up parcel data (the function geocodes internally if needed).
// workspace_id is optional -- without it, vault document linking is
// skipped but all external data sources still run.
//
// Supports two auth modes:
//   1. Cookie-based session (Drift UI)
//   2. Service role key in headers (n8n nodes)

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { handleSiteScanDetail } from "@/lib/site-scan/tools";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function authorize(req: NextRequest): Promise<{ ok: boolean; workspaceId?: string }> {
  // Check for n8n service-role auth first (apikey header)
  const apiKey = req.headers.get("apikey");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (apiKey && serviceRoleKey && apiKey === serviceRoleKey) {
    // n8n call -- workspace_id comes from request body if provided
    return { ok: true };
  }

  // Fall back to cookie-based session auth
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false };

    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", user.id)
      .maybeSingle();

    return { ok: true, workspaceId: profile?.workspace_id || undefined };
  } catch {
    return { ok: false };
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const address = typeof body.address === "string" ? body.address.trim() : "";

  if (!address) {
    return NextResponse.json(
      { error: "address is required" },
      { status: 400 },
    );
  }

  // workspace_id: prefer body (n8n can pass it), fall back to session profile
  const workspaceId = (typeof body.workspace_id === "string" && body.workspace_id)
    || auth.workspaceId
    || "";

  try {
    const resultJson = await handleSiteScanDetail(
      { address },
      workspaceId,
    );
    const result = JSON.parse(resultJson);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Site scan detail failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
