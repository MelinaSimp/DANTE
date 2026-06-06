import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createPremadeScenarios } from "@/lib/agents/premade-scenarios";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

async function getWorkspace(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { workspaceId: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  return { workspaceId: profile?.workspace_id ?? null };
}

export async function GET(req: NextRequest) {
  const { workspaceId } = await getWorkspace(req);
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(`agents:${workspaceId}`, 60);
  if (!rl.allowed) return rateLimitResponse();

  const { data, error } = await supabaseAdmin
    .from("agents")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch agents", error);
    return NextResponse.json({ error: "Failed to fetch agents" }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const { workspaceId } = await getWorkspace(req);
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, modality, description } = body;

  if (!name || !modality) {
    return NextResponse.json({ error: "Name and modality are required" }, { status: 400 });
  }

  if (!["chat", "voice", "multi-modal"].includes(modality)) {
    return NextResponse.json({ error: "Invalid modality" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("agents")
    .insert({
      workspace_id: workspaceId,
      name,
      modality,
      description: description || null,
      status: "draft",
    })
    .select("*")
    .single();

  if (error) {
    console.error("Failed to create agent", error);
    return NextResponse.json({ error: "Failed to create agent" }, { status: 500 });
  }

  // Create premade scenarios for the new agent
  if (data) {
    await createPremadeScenarios(data.id);
  }

  return NextResponse.json(data);
}


