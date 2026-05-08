// Read/update the workspace's hybrid model routing overrides.
//
// Reads workspaces.model_overrides — the per-task-tier routing
// table that the model-router (lib/dante/model-router.ts) reads
// when picking which Anthropic model to use for routing /
// classification / synthesis. Admin-only writes; any member reads.
//
// Three tiers, mapped to user-friendly labels in the UI:
//   • routing  — quick intent classification → Haiku
//   • bulk     — most chat turns / drafts    → Sonnet
//   • hard     — Deep Research, contradiction detection, RMD math → Opus

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isWorkspaceAdmin } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const ALLOWED_KEYS = ["routing", "bulk", "hard"] as const;
type TierKey = typeof ALLOWED_KEYS[number];

const SYSTEM_DEFAULTS: Record<TierKey, string> = {
  routing: "claude-haiku-4-5",
  bulk: "claude-sonnet-4-6",
  hard: "claude-opus-4-7",
};

async function resolveProfile() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
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
    .select("model_overrides")
    .eq("id", profile.workspace_id)
    .maybeSingle();
  const overrides = ((data as { model_overrides?: Record<string, string> } | null)?.model_overrides) || {};
  return NextResponse.json({
    overrides,
    defaults: SYSTEM_DEFAULTS,
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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sanitized: Record<string, string> = {};
  for (const k of ALLOWED_KEYS) {
    const v = body[k];
    if (v === null || v === "") continue; // unset → fall back to system default
    if (typeof v === "string" && v.length > 0 && v.length < 64) {
      sanitized[k] = v;
    }
  }

  const { error } = await supabaseAdmin
    .from("workspaces")
    .update({ model_overrides: sanitized })
    .eq("id", profile.workspace_id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ overrides: sanitized });
}
