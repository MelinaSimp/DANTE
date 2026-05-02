// Read or update the workspace's default agent model.
// Admin-only writes; any member can read.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isWorkspaceAdmin } from "@/lib/rbac";
import { DEFAULT_AGENT_MODEL } from "@/lib/dante/model";

export const dynamic = "force-dynamic";

async function resolveProfile() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, workspace_id, role")
    .eq("id", user.id)
    .maybeSingle();
  return profile as { id: string; workspace_id: string | null; role: string | null } | null;
}

export async function GET() {
  const profile = await resolveProfile();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data } = await supabaseAdmin
    .from("workspaces")
    .select("default_model")
    .eq("id", profile.workspace_id)
    .maybeSingle();
  return NextResponse.json({
    model: (data as any)?.default_model || null,
    fallback: DEFAULT_AGENT_MODEL,
  });
}

export async function PATCH(req: NextRequest) {
  const profile = await resolveProfile();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isWorkspaceAdmin(profile.role)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const raw = typeof body?.model === "string" ? body.model.trim() : "";
  // Empty string clears the override and falls back to DEFAULT_AGENT_MODEL.
  const next = raw.length ? raw : null;
  if (next && next.length > 100) {
    return NextResponse.json({ error: "Model name too long" }, { status: 400 });
  }
  const { error } = await supabaseAdmin
    .from("workspaces")
    .update({ default_model: next })
    .eq("id", profile.workspace_id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ model: next, fallback: DEFAULT_AGENT_MODEL });
}
