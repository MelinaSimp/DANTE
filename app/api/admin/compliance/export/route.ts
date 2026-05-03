// app/api/admin/compliance/export/route.ts
//
// Compliance export endpoint. Phase 3+ panel fix #4.
//
//   POST  /api/admin/compliance/export
//     body: { contact_id?: string, from_date?: ISO, to_date?: ISO }
//     returns: ExportBundle JSON
//
// Auth: workspace admin or supervisor (designated broker / RIA
// principal). Both have legitimate need; advisors do not.
//
// Headers:
//   - Content-Disposition: attachment; filename="audit-pack-..."
//     so a browser GET downloads instead of rendering. Useful for
//     the in-app "download audit pack" button.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { generateAuditPack } from "@/lib/compliance/export";
import { requireFeature } from "@/lib/billing/plan-tiers";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface ExportBody {
  contact_id?: string;
  from_date?: string;
  to_date?: string;
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, role, is_superadmin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) return jsonError(400, "no_workspace");

  // Compliance exports are sensitive — only admins, supervisors,
  // or superadmins can generate them. Not advisors / read-only.
  const role = (profile as { role?: string }).role;
  if (
    !(profile as { is_superadmin?: boolean }).is_superadmin &&
    role !== "admin" &&
    role !== "supervisor"
  ) {
    return jsonError(403, "admin_or_supervisor_only");
  }

  // Plan-tier gate: compliance export is an enterprise feature.
  // Starter / Pro workspaces get a 402 explaining the upgrade
  // path. Superadmin bypass — internal staff can still generate
  // exports for support / debugging.
  if (!(profile as { is_superadmin?: boolean }).is_superadmin) {
    const gate = await requireFeature(profile.workspace_id, "compliance.export");
    if (!gate.ok) return gate.response!;
  }

  const body = (await req.json().catch(() => ({}))) as ExportBody;
  const bundle = await generateAuditPack({
    workspaceId: profile.workspace_id,
    contactId: body.contact_id,
    fromDate: body.from_date,
    toDate: body.to_date,
    userId: user.id,
  });

  // Filename: audit-pack-{contact|workspace}-{YYYYMMDD}.json
  const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const scope = body.contact_id ? `contact-${body.contact_id.slice(0, 8)}` : "workspace";
  const filename = `audit-pack-${scope}-${dateStamp}.json`;

  return new NextResponse(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function jsonError(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
