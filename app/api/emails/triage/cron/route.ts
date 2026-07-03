// app/api/emails/triage/cron/route.ts — daily sweep across all workspaces.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { triageWorkspaceEmails } from "@/lib/emails/triage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BATCHES_PER_WORKSPACE = 3; // 3 × 40 = 120 / workspace / day

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

  const { data: workspaces } = await supabaseAdmin
    .from("workspaces")
    .select("id");

  const total = { processed: 0, rules_only: 0, ai_pass: 0, errors: 0 };
  for (const ws of workspaces || []) {
    for (let i = 0; i < MAX_BATCHES_PER_WORKSPACE; i++) {
      const r = await triageWorkspaceEmails(supabaseAdmin as any, ws.id, 40);
      total.processed += r.processed;
      total.rules_only += r.rules_only;
      total.ai_pass += r.ai_pass;
      total.errors += r.errors;
      if (r.processed === 0) break;
    }
  }

  return NextResponse.json({ ok: true, ...total });
}

export const GET = handle;
export const POST = handle;
