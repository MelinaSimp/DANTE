// app/api/properties/[id]/route.ts
//
// Single-property fetch / update / delete. Workspace isolation comes
// from RLS in the database; we just scope the query so an authed user
// from another workspace gets a 404 instead of someone else's data.

import { createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { logAuditEvent } from "@/lib/audit/log";

const VALID_STATUSES = ["active", "pending", "sold", "withdrawn", "off_market"];
const VALID_KINDS = ["residential", "commercial", "rental", "land", "other"];

async function loadAuth() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();
  if (!profile?.workspace_id) return null;
  return { supabase, user, workspaceId: profile.workspace_id as string };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await loadAuth();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { data: property, error } = await ctx.supabase
    .from("properties")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();

  if (error || !property) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Linked clients (via property_clients).
  const { data: links } = await ctx.supabase
    .from("property_clients")
    .select("contact_id, role")
    .eq("property_id", id);

  let clients: Array<{ contact_id: string; role: string; name: string | null; email: string | null; phone: string | null }> = [];
  if (links && links.length > 0) {
    const ids = links.map((l: any) => l.contact_id);
    const { data: contacts } = await ctx.supabase
      .from("contacts")
      .select("id, name, email, phone")
      .in("id", ids);
    const byId = new Map((contacts || []).map((c: any) => [c.id, c]));
    clients = links.map((l: any) => ({
      contact_id: l.contact_id,
      role: l.role,
      name: byId.get(l.contact_id)?.name ?? null,
      email: byId.get(l.contact_id)?.email ?? null,
      phone: byId.get(l.contact_id)?.phone ?? null,
    }));
  }

  return NextResponse.json({ ...property, clients });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await loadAuth();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await request.json();
  const updates: Record<string, unknown> = {};

  if (typeof body.address_line1 === "string") updates.address_line1 = body.address_line1.trim();
  if (typeof body.address_line2 === "string") updates.address_line2 = body.address_line2.trim() || null;
  if (typeof body.city === "string") updates.city = body.city.trim() || null;
  if (typeof body.state === "string") updates.state = body.state.trim() || null;
  if (typeof body.zip === "string") updates.zip = body.zip.trim() || null;
  if (typeof body.beds === "number" || body.beds === null) updates.beds = body.beds;
  if (typeof body.baths === "number" || body.baths === null) updates.baths = body.baths;
  if (typeof body.sqft === "number" || body.sqft === null) updates.sqft = body.sqft;
  if (body.kind === null || (typeof body.kind === "string" && VALID_KINDS.includes(body.kind))) {
    updates.kind = body.kind;
  }
  if (typeof body.list_price_cents === "number" || body.list_price_cents === null) {
    updates.list_price_cents = body.list_price_cents;
  }
  if (typeof body.status === "string" && VALID_STATUSES.includes(body.status)) {
    updates.status = body.status;
    // Stamp lifecycle timestamps on transitions.
    if (body.status === "sold") updates.sold_at = new Date().toISOString();
    if (body.status === "active" && !body.listed_at_supplied) {
      // listed_at is set on first move into "active" — keep client-supplied if any.
    }
  }
  if (typeof body.listed_at === "string" || body.listed_at === null) updates.listed_at = body.listed_at;
  if (typeof body.sold_at === "string" || body.sold_at === null) updates.sold_at = body.sold_at;
  if (typeof body.notes === "string") updates.notes = body.notes;

  // New descriptive fields.
  if (typeof body.description === "string" || body.description === null) {
    updates.description =
      typeof body.description === "string" ? body.description.trim() || null : null;
  }
  if (Array.isArray(body.interior_features)) {
    updates.interior_features = body.interior_features
      .map((v: unknown) => (typeof v === "string" ? v.trim() : ""))
      .filter((v: string) => v.length > 0)
      .slice(0, 40);
  }
  if (Array.isArray(body.exterior_features)) {
    updates.exterior_features = body.exterior_features
      .map((v: unknown) => (typeof v === "string" ? v.trim() : ""))
      .filter((v: string) => v.length > 0)
      .slice(0, 40);
  }
  if (typeof body.year_built === "number" || body.year_built === null) {
    updates.year_built = body.year_built;
  }
  if (typeof body.lot_size_sqft === "number" || body.lot_size_sqft === null) {
    updates.lot_size_sqft = body.lot_size_sqft;
  }

  // Transaction pipeline stage. Auto-stamp stage_entered_at on
  // change so the work-queue's "stuck in stage X" scan has a clean
  // timestamp. The DB trigger backstops this for direct updates.
  const VALID_TXN_STAGES = [
    "listed",
    "showing",
    "offer",
    "pending",
    "closed",
    "withdrawn",
    "expired",
  ];
  if (
    body.transaction_stage === null ||
    (typeof body.transaction_stage === "string" &&
      VALID_TXN_STAGES.includes(body.transaction_stage))
  ) {
    updates.transaction_stage = body.transaction_stage;
    updates.stage_entered_at = new Date().toISOString();
  }
  if (typeof body.expected_close_date === "string" || body.expected_close_date === null) {
    updates.expected_close_date = body.expected_close_date || null;
  }

  // Lease block.
  if (typeof body.lease_term_months === "number" || body.lease_term_months === null) {
    updates.lease_term_months = body.lease_term_months;
  }
  if (typeof body.lease_start_date === "string" || body.lease_start_date === null) {
    updates.lease_start_date = body.lease_start_date || null;
  }
  if (typeof body.lease_end_date === "string" || body.lease_end_date === null) {
    updates.lease_end_date = body.lease_end_date || null;
  }
  if (typeof body.monthly_rent_cents === "number" || body.monthly_rent_cents === null) {
    updates.monthly_rent_cents = body.monthly_rent_cents;
  }
  if (typeof body.tenant_contact_id === "string" || body.tenant_contact_id === null) {
    updates.tenant_contact_id = body.tenant_contact_id || null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  // Read the prior row before the update so we can record stage
  // transitions (from → to) faithfully in the audit row.
  const { data: prior } = await ctx.supabase
    .from("properties")
    .select("transaction_stage, address_line1, city")
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();

  const { data, error } = await ctx.supabase
    .from("properties")
    .update(updates)
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)
    .select()
    .single();

  if (error) {
    console.error("Properties PATCH:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Stage changes get a dedicated audit action — they're the
  // load-bearing pipeline events. Other field edits roll up into
  // a generic property.update.
  const stageChanged =
    "transaction_stage" in updates &&
    prior?.transaction_stage !== updates.transaction_stage;
  await logAuditEvent({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.user.id,
    actorKind: "user",
    action: stageChanged ? "property.stage_change" : "property.update",
    entityType: "property",
    entityId: id,
    metadata: stageChanged
      ? {
          from: prior?.transaction_stage ?? null,
          to: updates.transaction_stage,
          address: [prior?.address_line1, prior?.city]
            .filter(Boolean)
            .join(", "),
        }
      : { fields: Object.keys(updates) },
    request,
  });

  if (stageChanged) {
    import("@/lib/dante/deal-stage-trigger").then(({ evaluateDealStageWorkflows }) =>
      evaluateDealStageWorkflows({
        workspaceId: ctx.workspaceId,
        propertyId: id,
        fromStage: prior?.transaction_stage ?? null,
        toStage: updates.transaction_stage as string,
        propertyAddress: [prior?.address_line1, prior?.city].filter(Boolean).join(", "),
      }),
    );
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await loadAuth();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { error } = await ctx.supabase
    .from("properties")
    .delete()
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId);

  if (error) {
    console.error("Properties DELETE:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
