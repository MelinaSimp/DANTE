// app/api/dante/workflows/generate/route.ts
//
// POST → natural-language prompt → newly-created workflow in this
// workspace. Returns { workflow } so the client can push straight
// into the editor.
//
// The heavy lifting lives in lib/dante/workflow-ai.ts. This route
// just glues auth + DB insert around it.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateWorkflow } from "@/lib/dante/workflow-ai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id").eq("id", user.id).maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return NextResponse.json({ error: "Prompt required" }, { status: 400 });

  let generated;
  try {
    generated = await generateWorkflow(prompt);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Generation failed";
    // 422 because the request was syntactically valid but the model
    // couldn't produce a runnable graph.
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  // Derive the simple top-level trigger tag from the graph's trigger node.
  const triggerNode = generated.graph.nodes.find((n) => n.type.startsWith("trigger_"));
  const triggerTag = triggerNode?.type === "trigger_cron"    ? { type: "cron" }    :
                     triggerNode?.type === "trigger_webhook" ? { type: "webhook" } :
                                                               { type: "manual" };

  const { data, error } = await supabaseAdmin
    .from("dante_workflows")
    .insert({
      workspace_id: profile.workspace_id,
      created_by: user.id,
      name: generated.name,
      description: generated.description || null,
      trigger: triggerTag,
      steps: [], // legacy column — graph is the source of truth now
      graph: generated.graph,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ workflow: data, prompt });
}
