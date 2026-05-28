// /api/workspace/market-context — per-workspace market intelligence
//
// GET  → returns the market_context text
// PATCH → upserts market_context into workspace_firm_prompts
//
// This feeds into Dante's void analysis and CRE analysis prompts.
// The market context is factual local knowledge (rent ranges,
// competitors, demographics, zoning nuances) — distinct from
// custom_instructions which are behavioral directives.

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const MAX_MARKET_CONTEXT_LEN = 8000;

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
    return NextResponse.json({ market_context: "" });
  }

  const { data } = await supabaseAdmin
    .from("workspace_firm_prompts")
    .select("market_context")
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();

  return NextResponse.json({
    market_context: (data as { market_context?: string } | null)?.market_context || "",
  });
}

export async function PATCH(req: NextRequest) {
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

  // Only admins/owners can edit market context
  if (profile.role !== "admin" && profile.role !== "owner") {
    return NextResponse.json({ error: "admin required" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const raw = typeof body.market_context === "string" ? body.market_context : "";
  const trimmed = raw.trim().slice(0, MAX_MARKET_CONTEXT_LEN);

  const { error } = await supabaseAdmin
    .from("workspace_firm_prompts")
    .upsert(
      {
        workspace_id: profile.workspace_id,
        market_context: trimmed || null,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      },
      { onConflict: "workspace_id" },
    );

  if (error) {
    console.error("[market-context] upsert failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
