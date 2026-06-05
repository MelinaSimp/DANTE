// POST /api/dante/memory/consolidate — trigger memory consolidation.
//
// Merges near-duplicate memory entries within the user's workspace.
// Pass { dryRun: true } to preview without applying changes.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isOwner } from "@/lib/rbac";
import { consolidateMemory } from "@/lib/dante/memory/consolidate";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // consolidation can be slow for large workspaces

export async function POST(req: NextRequest) {
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

  // Only owners can trigger consolidation
  if (!isOwner(profile.role)) {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }

  let body: { dryRun?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // no body = defaults
  }

  const result = await consolidateMemory({
    workspaceId: profile.workspace_id,
    dryRun: body.dryRun ?? false,
  });

  return NextResponse.json(result);
}
