import { NextResponse } from "next/server";
import { complete as llmComplete } from "@/lib/llm/client";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, string> = {};

  // 1. Auth
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    checks.auth = user ? `ok (${user.id.slice(0, 8)})` : "no user";
  } catch (e: any) {
    checks.auth = `error: ${e.message}`;
  }

  // 2. Anthropic API — one tiny call
  try {
    const t0 = Date.now();
    const res = await llmComplete({
      model: "claude-haiku-4-5-20251001",
      messages: [
        { role: "system", content: "Reply with exactly: ok" },
        { role: "user", content: "health check" },
      ],
      maxTokens: 8,
      feature: "health",
    });
    const ms = Date.now() - t0;
    checks.anthropic = `ok (${ms}ms, tokens=${res.usage.totalTokens})`;
  } catch (e: any) {
    checks.anthropic = `error: ${e.message}`;
  }

  // 3. Env vars for managed agents
  checks.web_scraper_agent = process.env.DRIFT_WEB_SCRAPER_AGENT_ID ? "set" : "MISSING";
  checks.deep_research_agent = process.env.DRIFT_DEEP_RESEARCH_AGENT_ID ? "set" : "MISSING";
  checks.agent_environment = process.env.DRIFT_AGENT_ENVIRONMENT_ID ? "set" : "MISSING";

  const allOk = Object.values(checks).every((v) => v.startsWith("ok") || v === "set");
  return NextResponse.json({ status: allOk ? "healthy" : "degraded", checks });
}
