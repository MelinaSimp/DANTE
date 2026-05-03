// Daily integrations cron — sync every connected integration.
// Skips revoked / errored / pending. Wired to "0 8 * * *" UTC.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runOneConnection } from "@/lib/integrations/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(request: NextRequest) {
  // Header-only cron auth — `?key=` fallback removed (logs leak).
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "");
  const secret = process.env.CRON_SECRET;
  if (secret && bearer !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: connections, error } = await supabaseAdmin
    .from("integration_connections")
    .select("id, workspace_id, provider")
    .eq("status", "connected");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{
    connection_id: string;
    provider: string;
    ok: boolean;
    error?: string;
  }> = [];

  for (const c of connections || []) {
    const r = await runOneConnection((c as any).id, "cron");
    results.push({
      connection_id: (c as any).id,
      provider: (c as any).provider,
      ok: r.ok,
      error: r.error,
    });
  }

  return NextResponse.json({
    ok: true,
    swept: connections?.length || 0,
    results,
  });
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
