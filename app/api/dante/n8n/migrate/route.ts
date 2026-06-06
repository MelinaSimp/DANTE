// app/api/dante/n8n/migrate/route.ts
//
// POST /api/dante/n8n/migrate — migrate workspace workflows to n8n
//
// Owner-only. Converts all legacy Drift workflows in the caller's
// workspace to n8n format, validates them, and pushes to n8n.
//
// Query params:
//   dry_run=true  — validate only, don't push to n8n
//
// Returns a MigrationReport with per-workflow results.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isOwner } from "@/lib/rbac";
import { migrateWorkspace } from "@/lib/dante/n8n-migration";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // migrations can take a while

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

  if (!isOwner(profile.role)) {
    return NextResponse.json(
      { error: "Only workspace owners can run migrations" },
      { status: 403 },
    );
  }

  // Check n8n is configured
  if (!process.env.DRIFT_N8N_BASE_URL || !process.env.DRIFT_N8N_API_KEY) {
    return NextResponse.json(
      { error: "n8n integration not configured" },
      { status: 503 },
    );
  }

  const dryRun = req.nextUrl.searchParams.get("dry_run") === "true";

  const report = await migrateWorkspace(profile.workspace_id, dryRun);

  return NextResponse.json(report);
}
