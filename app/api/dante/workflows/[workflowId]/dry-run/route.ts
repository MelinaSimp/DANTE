// app/api/dante/workflows/[workflowId]/dry-run/route.ts
//
// POST → execute the workflow with simulate=true: read-only nodes
// (query_clients, archive_lookup, openai, condition, delay, GET http)
// run for real, destructive ones (send_email, update_contact, non-GET
// http) return a "would_have" stub.
//
// This does NOT persist a run row — the advisor is shaking the
// workflow down before committing. We still validate auth + workspace
// ownership because query_clients returns real contact data.
//
// Accepts an optional { input } body so the advisor can try different
// webhook payloads without wiring them for real.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runWorkflow } from "@/lib/dante/workflow-runner";
import { definitionFromRow } from "@/lib/dante/workflow-types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  const { workflowId } = await params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  const { data: wf } = await supabaseAdmin
    .from("dante_workflows")
    .select("*")
    .eq("id", workflowId)
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();
  if (!wf) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const input =
    body.input && typeof body.input === "object" ? body.input : {};

  try {
    const definition = definitionFromRow(wf);
    const result = await runWorkflow(definition, input, { simulate: true });
    return NextResponse.json({ ...result, simulated: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Dry-run failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
