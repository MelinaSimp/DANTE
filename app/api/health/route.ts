import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// GET /api/health
//
// Lightweight health check for uptime monitors (UptimeRobot, etc.).
// Pings Supabase and verifies the OpenAI key is present.
// Returns 200 when healthy, 503 when degraded.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

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
      // Bound the probe with a 3s timeout. Without this, a hung Supabase — the
      // exact outage this endpoint exists to catch — makes the health check
      // itself hang instead of cleanly reporting "degraded".
      const { error } = (await Promise.race([
        sb.from("workspaces").select("id").limit(1),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("supabase probe timed out (3000ms)")), 3000),
        ),
      ])) as { error: unknown };
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

  // 2. LLM providers configured (boolean only — never expose key
  //    presence/absence details on a public endpoint)
  const llmOk =
    !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length > 10) &&
    !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.length > 10);
  checks.push({ name: "llm", ok: llmOk });

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
