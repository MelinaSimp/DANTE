// app/api/admin/api-tokens/route.ts
//
// Workspace admin token management.
//
//   GET   /api/admin/api-tokens          list (no plaintext)
//   POST  /api/admin/api-tokens          create — returns plaintext ONCE
//   DELETE /api/admin/api-tokens/[id]    revoke (separate route)
//
// Public API access is enterprise-tier-gated. Lower tiers get 402.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { canApprove, type Role } from "@/lib/auth/rbac";
import { requireFeature } from "@/lib/billing/plan-tiers";
import { generateToken } from "@/lib/auth/api-token";

export const dynamic = "force-dynamic";

interface CreateBody {
  name?: string;
  scopes?: string[];
  rate_limit_per_min?: number;
}

const VALID_SCOPES = new Set([
  "read:contacts",
  "read:memory",
  "read:vault",
  "read:appointments",
  "write:memory",
  "write:contacts",
  "chat:ask",
]);

export async function GET() {
  const ctx = await ensureAdmin();
  if (!ctx.ok) return ctx.response;

  const { data } = await supabaseAdmin
    .from("api_tokens")
    .select("id, name, prefix, scopes, rate_limit_per_min, created_at, last_used_at, revoked_at")
    .eq("workspace_id", ctx.workspaceId)
    .order("created_at", { ascending: false });

  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const ctx = await ensureAdmin();
  if (!ctx.ok) return ctx.response;

  // Enterprise feature gate.
  if (!ctx.isSuper) {
    const gate = await requireFeature(ctx.workspaceId, "api.public");
    if (!gate.ok) return gate.response!;
  }

  const body = (await req.json().catch(() => ({}))) as CreateBody;
  const name = (body.name || "").trim().slice(0, 80);
  if (!name) return jsonError(400, "name required");
  const scopes = (body.scopes || []).filter((s) => VALID_SCOPES.has(s));
  if (scopes.length === 0) return jsonError(400, "at least one scope required");

  const { plaintext, hash, prefix } = generateToken();

  const { data, error } = await supabaseAdmin
    .from("api_tokens")
    .insert({
      workspace_id: ctx.workspaceId,
      name,
      token_hash: hash,
      prefix,
      scopes,
      rate_limit_per_min: body.rate_limit_per_min ?? null,
      created_by: ctx.userId,
    })
    .select("id, name, prefix, scopes, created_at")
    .single();
  if (error) return jsonError(500, error.message);

  await supabaseAdmin.from("audit_logs").insert({
    workspace_id: ctx.workspaceId,
    user_id: ctx.userId,
    action: "api_token.created",
    resource_type: "api_token",
    resource_id: (data as { id: string }).id,
    metadata: { name, scopes },
    timestamp: new Date().toISOString(),
  });

  // Plaintext returned ONCE in the response. The user copies it
  // immediately; it's never retrievable again.
  return NextResponse.json({
    ...data,
    plaintext_token: plaintext,
    notice: "Copy this token now — it cannot be displayed again. Store it securely.",
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
