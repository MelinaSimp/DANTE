import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { runArchitectTurn, type ArchitectMessage } from "@/lib/dante/agent-architect";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function getWorkspaceId(): Promise<string | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  return profile?.workspace_id ?? null;
}

function sanitizeTranscript(raw: unknown): ArchitectMessage[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ArchitectMessage[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") return null;
    const role = (m as { role?: unknown }).role;
    const content = (m as { content?: unknown }).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
    out.push({ role, content: content.slice(0, 4000) });
  }
  if (out.length === 0 || out.length > 40) return null;
  return out;
}

export async function POST(req: NextRequest) {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(`agent-architect:${workspaceId}`, 30);
  if (!rl.allowed) return rateLimitResponse();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const transcript = sanitizeTranscript((body as { transcript?: unknown })?.transcript);
  if (!transcript) {
    return NextResponse.json({ error: "transcript must be a non-empty array of {role, content}" }, { status: 400 });
  }

  try {
    const result = await runArchitectTurn({ transcript, workspaceId });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[agent-architect] turn failed:", err);
    return NextResponse.json({ error: "Architect failed to respond" }, { status: 500 });
  }
}
