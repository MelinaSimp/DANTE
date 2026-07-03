import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { validateBlueprint } from "@/lib/dante/agent-blueprint";

export const dynamic = "force-dynamic";

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

export async function POST(req: NextRequest) {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(`agents:${workspaceId}`, 60);
  if (!rl.allowed) return rateLimitResponse();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { ok, blueprint, errors } = validateBlueprint((body as { blueprint?: unknown })?.blueprint);
  if (!ok) {
    return NextResponse.json({ error: "Incomplete agent", details: errors }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("agents")
    .insert({
      workspace_id: workspaceId,
      name: blueprint.name,
      description: blueprint.description || null,
      modality: "chat",
      status: "draft",
      mode: "llm",
      llm_instructions: blueprint.persona,
      first_message: blueprint.first_message || null,
      llm_model: blueprint.model,
      // Persisted config (skills + tools). Not a runtime enforcement
      // boundary yet — see migration note.
      builder_config: {
        skills: blueprint.skills,
        tools: blueprint.tools,
        source: "architect",
      },
    })
    .select("id")
    .single();

  if (error) {
    console.error("[from-blueprint] insert failed:", error);
    return NextResponse.json({ error: "Failed to create agent" }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}
