import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasSuperadminAccess } from "@/lib/superadmin";
import { ALL_FEATURE_IDS, type FeatureId } from "@/lib/features";

export const dynamic = "force-dynamic";

async function verifySuperadmin() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", user.id)
    .maybeSingle();

  if (!hasSuperadminAccess(user.email, profile?.is_superadmin)) return null;
  return user;
}

export async function GET() {
  const admin = await verifySuperadmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: workspaces, error } = await supabaseAdmin
    .from("workspaces")
    .select("id, name, created_at, owner_id, enabled_features, plan_status")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, workspace_id, full_name");

  const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
  const emailMap = new Map<string, string>();
  authUsers?.users.forEach((u) => {
    if (u.email) emailMap.set(u.id, u.email);
  });

  const enriched = (workspaces || []).map((ws) => {
    const owner = profiles?.find((p) => p.id === ws.owner_id);
    const ownerEmail = owner ? emailMap.get(owner.id) : null;
    const userCount = profiles?.filter((p) => p.workspace_id === ws.id).length || 0;
    return {
      ...ws,
      owner_name: owner?.full_name || null,
      owner_email: ownerEmail || null,
      user_count: userCount,
    };
  });

  return NextResponse.json(enriched);
}

export async function PUT(req: NextRequest) {
  const admin = await verifySuperadmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("workspaces")
    .insert({ name: name.trim(), plan_status: "active" })
    .select("id, name, created_at, owner_id, enabled_features, plan_status")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const admin = await verifySuperadmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("id");
  if (!workspaceId) return NextResponse.json({ error: "id is required" }, { status: 400 });

  // Remove profiles linked to this workspace
  await supabaseAdmin.from("profiles").update({ workspace_id: null }).eq("workspace_id", workspaceId);
  // Remove agents
  await supabaseAdmin.from("agents").delete().eq("workspace_id", workspaceId);
  // Remove the workspace
  const { error } = await supabaseAdmin.from("workspaces").delete().eq("id", workspaceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

export async function POST(req: NextRequest) {
  const admin = await verifySuperadmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { workspace_id, user_email } = await req.json();
  if (!workspace_id || !user_email) {
    return NextResponse.json({ error: "workspace_id and user_email required" }, { status: 400 });
  }

  // Find user by email
  const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
  const target = authUsers?.users.find(u => u.email === user_email);
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Update their profile to this workspace
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ workspace_id })
    .eq("id", target.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, user_id: target.id });
}

export async function PATCH(req: NextRequest) {
  const admin = await verifySuperadmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { workspace_id, enabled_features, plan_status } = body;

  if (!workspace_id) {
    return NextResponse.json({ error: "workspace_id is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (enabled_features !== undefined) {
    if (enabled_features === null) {
      updates.enabled_features = null;
    } else if (Array.isArray(enabled_features)) {
      const valid = enabled_features.filter((f: string) =>
        ALL_FEATURE_IDS.includes(f as FeatureId)
      );
      updates.enabled_features = valid;
    }
  }

  if (plan_status !== undefined) updates.plan_status = plan_status;


  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("workspaces")
    .update(updates)
    .eq("id", workspace_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
