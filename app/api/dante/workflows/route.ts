// app/api/dante/workflows/route.ts
//
// GET  → list workflows for the caller's workspace
// POST → create a new workflow (name required, steps optional)

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function requireWorkspace() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles")
    .select("workspace_id").eq("id", user.id).maybeSingle();
  if (!profile?.workspace_id) return { error: NextResponse.json({ error: "No workspace" }, { status: 400 }) };
  return { user, workspaceId: profile.workspace_id };
}

export async function GET() {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;

  const { data, error } = await supabaseAdmin
    .from("dante_workflows")
    .select("id, name, description, enabled, trigger, last_run_at, last_run_status, created_at, updated_at")
    .eq("workspace_id", ctx.workspaceId)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ workflows: data || [] });
}

export async function POST(request: Request) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;

  const body = await request.json().catch(() => ({}));
  const name = (body.name as string)?.trim();
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  // Default graph seeds a single manual trigger so the canvas isn't
  // empty when the editor loads. Callers (notably the AI generator)
  // can pass their own `graph` to override.
  const defaultGraph = {
    nodes: [{
      id: "trigger",
      type: "trigger_manual",
      position: { x: 80, y: 80 },
      data: { step: { id: "trigger", type: "trigger_manual", name: "Manual trigger", config: {} } },
    }],
    edges: [],
  };

  const { data, error } = await supabaseAdmin
    .from("dante_workflows")
    .insert({
      workspace_id: ctx.workspaceId,
      created_by: ctx.user.id,
      name,
      description: body.description ?? null,
      trigger: body.trigger ?? { type: "manual" },
      steps: body.steps ?? [],
      graph: body.graph ?? defaultGraph,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ workflow: data });
}
