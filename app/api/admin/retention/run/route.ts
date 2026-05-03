// app/api/admin/retention/run/route.ts
//
// Trigger surface for the retention worker. Three callers:
//
//   GET  ?dry_run=1   — preview (read-only). What WOULD this run delete?
//   POST              — execute. Triggers a real hard-delete pass.
//   Cron header       — Vercel-cron / external scheduler invocation.
//
// Auth:
//   - Vercel cron requests carry a CRON_SECRET-keyed Authorization
//     header. We accept those without user auth.
//   - Otherwise: superadmin profiles only. Workspace admins can't
//     trigger a global run; that's a platform-wide operation.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { runRetention, type Triggered } from "@/lib/retention/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // retention worker may take a few minutes

async function authorize(req: NextRequest): Promise<
  { ok: true; triggered: Triggered } | { ok: false; status: number; error: string }
> {
  const cronAuth = req.headers.get("authorization");
  if (cronAuth && process.env.CRON_SECRET && cronAuth === `Bearer ${process.env.CRON_SECRET}`) {
    return { ok: true, triggered: "cron" };
  }
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "unauthorized" };
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.is_superadmin) {
    return { ok: false, status: 403, error: "superadmin_only" };
  }
  return { ok: true, triggered: "admin" };
}

export async function GET(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) return jsonError(auth.status, auth.error);
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "1";
  if (!dryRun) {
    return jsonError(400, "use POST to actually run; GET requires dry_run=1");
  }
  const result = await runRetention({ dryRun: true, triggeredBy: auth.triggered });
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) return jsonError(auth.status, auth.error);
  const result = await runRetention({ dryRun: false, triggeredBy: auth.triggered });
  return NextResponse.json(result);
}

function jsonError(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
