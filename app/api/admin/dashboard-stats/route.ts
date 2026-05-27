import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasSuperadminAccess } from "@/lib/superadmin";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase.from("profiles").select("is_superadmin").eq("id", user.id).maybeSingle();
  if (!hasSuperadminAccess(user.email, me?.is_superadmin)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [{ data: workspaces }, { data: profiles }, { data: agents }, { data: conversations }] = await Promise.all([
    supabaseAdmin.from("workspaces").select("id, plan_status"),
    supabaseAdmin.from("profiles").select("id"),
    supabaseAdmin.from("agents").select("id, status"),
    supabaseAdmin.from("conversations").select("id").gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString()),
  ]);

  return NextResponse.json({
    workspaces: workspaces?.length || 0,
    activeWorkspaces: workspaces?.filter(w => w.plan_status === "active").length || 0,
    users: profiles?.length || 0,
    deployedAgents: agents?.filter(a => a.status === "deployed").length || 0,
    totalAgents: agents?.length || 0,
    recentConversations: conversations?.length || 0,
  });
}
