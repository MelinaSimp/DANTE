// POST /api/integrations/[provider]/sync   — manual sync trigger
//
// Pulls fresh data from the provider into Drift. Workspace admin only.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isWorkspaceAdmin } from "@/lib/rbac";
import { runOneConnection } from "@/lib/integrations/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: providerId } = await params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }
  if (!isWorkspaceAdmin(profile.role)) {
    return NextResponse.json(
      { error: "Workspace admin role required" },
      { status: 403 }
    );
  }

  const { data: connection } = await supabaseAdmin
    .from("integration_connections")
    .select("id, status")
    .eq("workspace_id", profile.workspace_id)
    .eq("provider", providerId)
    .maybeSingle();
  if (!connection) {
    return NextResponse.json(
      { error: `No ${providerId} connection for this workspace` },
      { status: 404 }
    );
  }
  if ((connection as any).status !== "connected") {
    return NextResponse.json(
      { error: `Connection status: ${(connection as any).status}. Connect first.` },
      { status: 400 }
    );
  }

  const result = await runOneConnection(
    (connection as any).id,
    "manual",
    user.id,
  );
  return NextResponse.json(result);
}
