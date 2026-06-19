// app/api/underwrite/summary/route.ts
//
// POST { vaultItemId, purchasePrice? } -> JSON underwriting summary.
// Parses a rent-roll spreadsheet in the vault and runs the DCF engine,
// returning indicated value / NOI / cap / IRR as JSON (vs. the xlsx the
// /model endpoint produces). Built for workflow callers (the Underwriter
// n8n node) and reusable from the app. Session OR service auth.

import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveServiceWorkspace } from "@/lib/api/service-auth";
import { computeDcfSummary, DEFAULT_ASSUMPTIONS } from "@/lib/underwriting/dcf-math";
import { parseRentRoll } from "@/lib/underwriting/rent-roll-parser";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function resolveWorkspace(req: Request): Promise<string | null> {
  const svc = resolveServiceWorkspace(req);
  if (svc) return svc;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  return profile?.workspace_id ?? null;
}

function isSpreadsheet(ft?: string | null): boolean {
  const f = (ft || "").toLowerCase();
  return (
    f.includes("spreadsheet") || f.includes("excel") || f.includes("csv") ||
    f.endsWith("xlsx") || f.endsWith("xls") || f === "xlsx" || f === "xls" || f === "csv"
  );
}

export async function POST(req: NextRequest) {
  const ws = await resolveWorkspace(req);
  if (!ws) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { vaultItemId?: string; purchasePrice?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const vaultItemId = body.vaultItemId;
  if (!vaultItemId) return NextResponse.json({ error: "vaultItemId required" }, { status: 400 });

  const { data: item } = await supabaseAdmin
    .from("vault_items")
    .select("id, title, file_url, file_type")
    .eq("id", vaultItemId)
    .eq("workspace_id", ws)
    .maybeSingle<{ id: string; title: string | null; file_url: string | null; file_type: string | null }>();
  if (!item) return NextResponse.json({ error: "Vault item not found" }, { status: 404 });
  if (!item.file_url || !isSpreadsheet(item.file_type)) {
    return NextResponse.json({ error: "Vault item is not a spreadsheet rent roll." }, { status: 422 });
  }

  let buffer: Buffer;
  try {
    const res = await fetch(item.file_url);
    if (!res.ok) throw new Error(`source fetch ${res.status}`);
    buffer = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "download failed" }, { status: 502 });
  }

  const parsed = parseRentRoll(buffer);
  if (!parsed.ok || parsed.totals.totalAnnualRent <= 0 || parsed.totals.totalSf <= 0) {
    return NextResponse.json(
      { error: "Could not derive rent or area from the rent roll.", warnings: parsed.warnings },
      { status: 422 },
    );
  }

  const gpr = parsed.totals.totalAnnualRent;
  const purchasePrice =
    typeof body.purchasePrice === "number" && body.purchasePrice > 0 ? body.purchasePrice : undefined;

  const summary = computeDcfSummary({
    property: { name: item.title || "Asset", address: "", sf: parsed.totals.totalSf },
    assumptions: { ...DEFAULT_ASSUMPTIONS },
    income: { gross_potential_rent: gpr, other_income: 0, reimbursements: 0 },
    expenses: {
      operating_expenses: Math.round(gpr * 0.35),
      management_fee: 0, reserves: 0, insurance: 0, taxes: 0,
    },
    acquisition: purchasePrice ? { purchase_price: purchasePrice } : undefined,
  });

  return NextResponse.json({
    property: { name: item.title || "Asset", sf: parsed.totals.totalSf },
    totals: parsed.totals,
    summary,
    assumptions: "Drift defaults (10yr, 8.5% discount, 7% exit, 35% opex estimate)",
    warnings: parsed.warnings,
  });
}
