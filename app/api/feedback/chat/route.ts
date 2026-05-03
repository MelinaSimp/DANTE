// app/api/feedback/chat/route.ts
//
// Phase 8 W8.4 — chat feedback capture.
//
// POST { message_id, vote: "up"|"down", comment?: string }
//
// Stores the feedback + a snapshot of the user input + agent
// output at the time the vote was cast (so the eval team has
// reproducible context). Used by the auto-improvement loop:
// downvotes flow to a triage queue; AI lead promotes the strong
// signals into eval tasks weekly.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface Body {
  message_id?: string;
  vote?: "up" | "down";
  comment?: string;
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "unauthorized");
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) return jsonError(400, "no_workspace");

  const body = (await req.json().catch(() => ({}))) as Body;
  if (!body.message_id) return jsonError(400, "message_id required");
  if (body.vote !== "up" && body.vote !== "down") return jsonError(400, "vote must be up|down");

  // Pull the message + the user's most recent input that preceded it
  // so the snapshot is self-contained. If we can't find them, store
  // empty strings — the vote is still useful.
  const { data: msg } = await supabaseAdmin
    .from("dante_chat_messages")
    .select("id, chat_id, role, content, created_at")
    .eq("id", body.message_id)
    .maybeSingle();
  let agentOutput = "";
  let userInput = "";
  if (msg && (msg as { role: string }).role === "assistant") {
    agentOutput = (msg as { content: string }).content;
    const { data: prior } = await supabaseAdmin
      .from("dante_chat_messages")
      .select("content")
      .eq("chat_id", (msg as { chat_id: string }).chat_id)
      .eq("role", "user")
      .lt("created_at", (msg as { created_at: string }).created_at)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    userInput = (prior as { content?: string } | null)?.content ?? "";
  }

  const comment = (body.comment || "").trim().slice(0, 1000) || null;

  const { error } = await supabaseAdmin.from("chat_feedback").insert({
    workspace_id: profile.workspace_id,
    user_id: user.id,
    chat_message_id: body.message_id,
    user_input: userInput,
    agent_output: agentOutput,
    vote: body.vote,
    comment,
    triage_status: "pending",
  });
  if (error) return jsonError(500, error.message);

  return NextResponse.json({ ok: true });
}

function jsonError(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
