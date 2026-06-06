// app/api/dante/n8n/health/route.ts
//
// Health check endpoint for the n8n connection. Returns whether
// n8n is reachable and the API key is valid, along with latency.
// Used by the frontend workflows page to show connection status.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { healthCheck } from "@/lib/dante/n8n-bridge";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only check if the env vars are configured
  if (!process.env.DRIFT_N8N_BASE_URL || !process.env.DRIFT_N8N_API_KEY) {
    return NextResponse.json({
      ok: false,
      configured: false,
      message: "n8n integration not configured",
    });
  }

  const result = await healthCheck();
  return NextResponse.json({
    ...result,
    configured: true,
  });
}
