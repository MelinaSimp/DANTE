import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// GET /api/health
//
// Lightweight health check for uptime monitors (UptimeRobot, etc.).
// Pings Supabase and verifies the OpenAI key is present.
// Returns 200 when healthy, 503 when degraded.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Check {
  name: string;
  ok: boolean;
  latency_ms?: number;
  error?: string;
}

export async function GET() {
  const checks: Check[] = [];
  const start = Date.now();

  // 1. Supabase connectivity
  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!sbUrl || !sbKey) {
    checks.push({ name: "supabase", ok: false, error: "missing env vars" });
  } else {
    const t0 = Date.now();
    try {
      const sb = createClient(sbUrl, sbKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      // Simple query that touches the DB without needing RLS
      const { error } = await sb.from("workspaces").select("id").limit(1);
      if (error) throw error;
      checks.push({ name: "supabase", ok: true, latency_ms: Date.now() - t0 });
    } catch (err) {
      checks.push({
        name: "supabase",
        ok: false,
        latency_ms: Date.now() - t0,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  // 2. OpenAI API key present (don't call the API -- just verify the key exists)
  const openaiKey = process.env.OPENAI_API_KEY;
  checks.push({
    name: "openai_key",
    ok: !!openaiKey && openaiKey.length > 10,
    ...((!openaiKey || openaiKey.length <= 10) && { error: "missing or invalid" }),
  });

  // 3. Anthropic API key present
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  checks.push({
    name: "anthropic_key",
    ok: !!anthropicKey && anthropicKey.length > 10,
    ...((!anthropicKey || anthropicKey.length <= 10) && { error: "missing or invalid" }),
  });

  const allOk = checks.every((c) => c.ok);

  return NextResponse.json(
    {
      status: allOk ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      uptime_ms: Date.now() - start,
      checks,
    },
    { status: allOk ? 200 : 503 },
  );
}
