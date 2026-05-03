// app/api/emails/categorize/cron/route.ts
//
// Daily cron sweep — categorizes uncategorized emails across every
// workspace that has a non-zero backlog. Capped iterations per
// workspace so a single huge backlog doesn't starve the others.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { categorizeWorkspaceEmails } from "@/lib/emails/categorize";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BATCHES_PER_WORKSPACE = 4; // 4 × 25 = 100 emails / workspace / day

function authOk(request: Request) {
  // Header-only cron auth — `?key=` fallback removed (logs leak).
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "");
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return bearer === secret;
}

async function handle(request: Request) {
  if (!authOk(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Workspaces with at least one uncategorized email.
  const { data: workspaces } = await supabaseAdmin
    .from("workspaces")
    .select("id, industry");

  let totalProcessed = 0;
  let totalUpdated = 0;
  for (const ws of workspaces || []) {
    for (let i = 0; i < MAX_BATCHES_PER_WORKSPACE; i++) {
      const r = await categorizeWorkspaceEmails(
        supabaseAdmin as any,
        ws.id,
        ws.industry,
        25
      );
      totalProcessed += r.processed;
      totalUpdated += r.updated;
      if (r.processed === 0) break; // backlog clear for this workspace
    }
  }

  return NextResponse.json({ ok: true, processed: totalProcessed, updated: totalUpdated });
}

export const GET = handle;
export const POST = handle;
