// app/api/admin/branding/route.ts
//
// Phase 6 W6.8 — workspace branding API.
//
//   GET  /api/admin/branding   read current branding
//   PUT  /api/admin/branding   update (admin-only, enterprise-tier-gated)
//
// Storage: workspace_branding table. Logo upload is a separate
// flow via Supabase Storage; this endpoint stores the resulting
// path. Custom subdomain is reserved here but DNS provisioning
// is out of scope of the application code.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { canApprove, type Role } from "@/lib/auth/rbac";
import { requireFeature } from "@/lib/billing/plan-tiers";

export const dynamic = "force-dynamic";

interface BrandingBody {
  logo_storage_path?: string | null;
  brand_color_hex?: string | null;
  custom_subdomain?: string | null;
  email_from_name?: string | null;
  email_from_domain?: string | null;
  pdf_header_text?: string | null;
}

const SUBDOMAIN_RE = /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "unauthorized");
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) return jsonError(400, "no_workspace");

  const { data } = await supabaseAdmin
    .from("workspace_branding")
    .select("*")
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();
  return NextResponse.json(data ?? {});
}

export async function PUT(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, role, is_superadmin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) return jsonError(400, "no_workspace");

  const role = ((profile as { role?: string }).role ?? "advisor") as Role;
  const isSuper = !!(profile as { is_superadmin?: boolean }).is_superadmin;
  if (!isSuper && !canApprove(role)) return jsonError(403, "admin_only");

  // Branding is enterprise-tier-gated. Superadmin bypass.
  if (!isSuper) {
    const gate = await requireFeature(profile.workspace_id, "byok.encryption");
    // We piggyback on byok.encryption as an enterprise marker; in
    // the future this becomes its own "branding.custom" feature.
    if (!gate.ok) return gate.response!;
  }

  const body = (await req.json().catch(() => ({}))) as BrandingBody;

  // Validate the user-supplied fields. Anything that fails returns
  // 400 with a specific reason — don't accept partial updates.
  if (body.brand_color_hex && !HEX_RE.test(body.brand_color_hex)) {
    return jsonError(400, "brand_color_hex must be a #rrggbb hex string");
  }
  if (body.custom_subdomain) {
    const sd = body.custom_subdomain.toLowerCase();
    if (!SUBDOMAIN_RE.test(sd)) {
      return jsonError(400, "custom_subdomain must be lowercase letters/digits/hyphens, 2-32 chars");
    }
  }

  const update = {
    workspace_id: profile.workspace_id,
    logo_storage_path: body.logo_storage_path ?? null,
    brand_color_hex: body.brand_color_hex ?? null,
    custom_subdomain: body.custom_subdomain?.toLowerCase() ?? null,
    email_from_name: body.email_from_name ?? null,
    email_from_domain: body.email_from_domain ?? null,
    pdf_header_text: body.pdf_header_text ?? null,
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  };

  const { error } = await supabaseAdmin
    .from("workspace_branding")
    .upsert(update, { onConflict: "workspace_id" });
  if (error) return jsonError(500, error.message);

  await supabaseAdmin.from("audit_logs").insert({
    workspace_id: profile.workspace_id,
    user_id: user.id,
    action: "branding.updated",
    resource_type: "workspace",
    resource_id: profile.workspace_id,
    metadata: { fields: Object.keys(body) },
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}

function jsonError(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
