// app/api/properties/route.ts
//
// Properties CRUD — list (GET) + create (POST). Workspace isolation
// is enforced by RLS in the database; this route still scopes the
// fetch by workspace so an authed-but-unaffiliated user sees nothing.

import { createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const VALID_STATUSES = ["active", "pending", "sold", "withdrawn", "off_market"];
const VALID_KINDS = ["residential", "commercial", "rental", "land", "other"];

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();
  if (!profile?.workspace_id) return NextResponse.json([]);

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  let query = supabase
    .from("properties")
    .select(
      "id, address_line1, address_line2, city, state, zip, beds, baths, sqft, kind, list_price_cents, status, listed_at, sold_at, updated_at"
    )
    .eq("workspace_id", profile.workspace_id)
    .order("updated_at", { ascending: false });

  if (status && VALID_STATUSES.includes(status)) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Properties GET:", error);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
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
    .single();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  const body = await request.json();
  const address_line1 = (body.address_line1 || "").trim();
  if (!address_line1) {
    return NextResponse.json(
      { error: "Address is required" },
      { status: 400 }
    );
  }

  const status = VALID_STATUSES.includes(body.status) ? body.status : "active";
  const kind = VALID_KINDS.includes(body.kind) ? body.kind : null;

  const sanitizeStringArray = (raw: unknown): string[] | undefined => {
    if (!Array.isArray(raw)) return undefined;
    return raw
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter((v) => v.length > 0)
      .slice(0, 40);
  };
  const interior_features = sanitizeStringArray(body.interior_features);
  const exterior_features = sanitizeStringArray(body.exterior_features);

  const insert: Record<string, unknown> = {
    workspace_id: profile.workspace_id,
    created_by: user.id,
    address_line1,
    address_line2: body.address_line2?.trim() || null,
    city: body.city?.trim() || null,
    state: body.state?.trim() || null,
    zip: body.zip?.trim() || null,
    beds: typeof body.beds === "number" ? body.beds : null,
    baths: typeof body.baths === "number" ? body.baths : null,
    sqft: typeof body.sqft === "number" ? body.sqft : null,
    kind,
    list_price_cents:
      typeof body.list_price_cents === "number" ? body.list_price_cents : null,
    status,
    notes: body.notes?.trim() || null,
    description:
      typeof body.description === "string" ? body.description.trim() || null : null,
    year_built: typeof body.year_built === "number" ? body.year_built : null,
    lot_size_sqft:
      typeof body.lot_size_sqft === "number" ? body.lot_size_sqft : null,
    lease_term_months:
      typeof body.lease_term_months === "number" ? body.lease_term_months : null,
    lease_start_date:
      typeof body.lease_start_date === "string" && body.lease_start_date
        ? body.lease_start_date
        : null,
    lease_end_date:
      typeof body.lease_end_date === "string" && body.lease_end_date
        ? body.lease_end_date
        : null,
    monthly_rent_cents:
      typeof body.monthly_rent_cents === "number" ? body.monthly_rent_cents : null,
    tenant_contact_id:
      typeof body.tenant_contact_id === "string" && body.tenant_contact_id
        ? body.tenant_contact_id
        : null,
  };
  if (interior_features) insert.interior_features = interior_features;
  if (exterior_features) insert.exterior_features = exterior_features;

  const { data, error } = await supabase
    .from("properties")
    .insert(insert)
    .select()
    .single();

  if (error) {
    console.error("Properties POST:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
