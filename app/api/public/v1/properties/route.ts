// app/api/public/v1/properties/route.ts
//
// Phase 7 — public API: list properties/parcels.
//
//   GET /api/public/v1/properties?limit=50&q=foo
//   Authorization: Bearer drift_pat_<...>
//   Required scope: read:properties
//
// Token-based auth. Workspace scoped via the token's
// workspace_id. Standard pagination via `limit` (max 200).
// Search via `q` matches address substring.
//
// Response shape:
//   { items: [{ id, address_line1, city, state, zip, kind, status, ... }], next: null }

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireApiToken } from "@/lib/auth/api-token";

export const dynamic = "force-dynamic";

const PROPERTY_COLS =
  "id, address_line1, address_line2, city, state, zip, kind, status, " +
  "beds, baths, sqft, list_price_cents, year_built, lot_size_sqft, " +
  "lease_term_months, lease_start_date, lease_end_date, monthly_rent_cents, " +
  "transaction_stage, expected_close_date, listed_at, sold_at, " +
  "notes, description, created_at, updated_at";

export async function GET(req: NextRequest) {
  const auth = await requireApiToken(req, "read:properties");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10), 1), 200);
  const q = url.searchParams.get("q")?.trim() ?? "";

  let query = supabaseAdmin
    .from("properties")
    .select(PROPERTY_COLS)
    .eq("workspace_id", auth.workspaceId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (q) {
    query = query.or(
      `address_line1.ilike.%${q}%,city.ilike.%${q}%,zip.ilike.%${q}%`,
    );
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ items: data ?? [], next: null });
}
