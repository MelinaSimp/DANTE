// app/api/admin/examiner/route.ts
//
// Phase 7 W7.9 — examiner credentials.
//
//   GET   /api/admin/examiner          list active credentials
//   POST  /api/admin/examiner          issue a new credential
//   DELETE /api/admin/examiner/[id]    revoke (separate route)
//
// Returns plaintext token ONCE at creation. Examiner clicks
// /examiner/login?token=<plaintext> → session is read-only,
// scope-limited, expires at valid_until.
//
// Enterprise-tier-gated.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { canApprove, type Role } from "@/lib/auth/rbac";
import { requireFeature } from "@/lib/billing/plan-tiers";
import { createHash, randomBytes } from "node:crypto";

export const dynamic = "force-dynamic";

const TOKEN_PREFIX = "drift_exam_";

interface CreateBody {
  examiner_label?: string;
  contact_id?: string | null;
  valid_for_days?: number;
}

export async function GET() {
  const ctx = await ensureAdmin();
  if (!ctx.ok) return ctx.response;
  const { data } = await supabaseAdmin
    .from("examiner_credentials")
    .select("id, examiner_label, contact_id, valid_from, valid_until, used_at, revoked_at")
    .eq("workspace_id", ctx.workspaceId)
    .order("valid_from", { ascending: false });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const ctx = await ensureAdmin();
  if (!ctx.ok) return ctx.response;
  if (!ctx.isSuper) {
    const gate = await requireFeature(ctx.workspaceId, "compliance.export");
    if (!gate.ok) return gate.response!;
  }

  const body = (await req.json().catch(() => ({}))) as CreateBody;
  const label = (body.examiner_label || "").trim().slice(0, 120);
  if (!label) return jsonError(400, "examiner_label required");
  const days = Math.min(Math.max(body.valid_for_days ?? 14, 1), 90);
  const validFrom = new Date();
  const validUntil = new Date(validFrom.getTime() + days * 86400 * 1000);

  const random = randomBytes(24).toString("hex");
  const plaintext = `${TOKEN_PREFIX}${random}`;
  const hash = createHash("sha256").update(plaintext).digest("hex");

  const { data, error } = await supabaseAdmin
    .from("examiner_credentials")
    .insert({
      workspace_id: ctx.workspaceId,
      issued_by: ctx.userId,
      examiner_label: label,
      contact_id: body.contact_id ?? null,
      valid_from: validFrom.toISOString(),
      valid_until: validUntil.toISOString(),
      token_hash: hash,
    })
    .select("id, examiner_label, valid_from, valid_until")
    .single();
  if (error) return jsonError(500, error.message);

  await supabaseAdmin.from("audit_logs").insert({
    workspace_id: ctx.workspaceId,
    user_id: ctx.userId,
    action: "examiner_credential.issued",
    resource_type: "examiner_credential",
    resource_id: (data as { id: string }).id,
    metadata: { label, valid_until: validUntil.toISOString(), contact_scoped: !!body.contact_id },
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({
    ...data,
    plaintext_token: plaintext,
    login_url: `${process.env.APP_URL || "https://driftai.studio"}/examiner/login?token=${plaintext}`,
    notice:
      "Send the login URL to the examiner over a secure channel. The plaintext token cannot be displayed again.",
  });
}

interface AdminCtx {
  ok: true;
  userId: string;
  workspaceId: string;
  isSuper: boolean;
}

interface AdminFail {
  ok: false;
  response: Response;
}

async function ensureAdmin(): Promise<AdminCtx | AdminFail> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: jsonError(401, "unauthorized") };
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, role, is_superadmin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return { ok: false, response: jsonError(400, "no_workspace") };
  }
  const role = ((profile as { role?: string }).role ?? "advisor") as Role;
  const isSuper = !!(profile as { is_superadmin?: boolean }).is_superadmin;
  if (!isSuper && !canApprove(role)) {
    return { ok: false, response: jsonError(403, "admin_only") };
  }
  return { ok: true, userId: user.id, workspaceId: profile.workspace_id, isSuper };
}

function jsonError(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
