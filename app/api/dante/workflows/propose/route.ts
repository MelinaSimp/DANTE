// app/api/dante/workflows/propose/route.ts
//
// Phase 1+2 of the book-aware generate flow:
//   1. Build a BookSummary from the caller's workspace.
//   2. Ask the LLM to produce three grounded proposals for the
//      advisor's prompt.
//
// Returns { proposals, bookSummary } with NO DB write — the advisor
// picks one of the three in the UI, and then /materialize writes the
// workflow. Think of this as "shopping" vs. "checkout".

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { buildBookSummary } from "@/lib/dante/book-summary";
import { proposeWorkflows } from "@/lib/dante/workflow-proposals";
import { requireActiveBilling } from "@/lib/billing/gate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
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

  const gate = await requireActiveBilling(profile.workspace_id);
  if (!gate.ok) return gate.response;

  const body = await req.json().catch(() => ({}));
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return NextResponse.json({ error: "Prompt required" }, { status: 400 });
  }

  let bookSummary;
  try {
    bookSummary = await buildBookSummary(profile.workspace_id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Book summary failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  try {
    const result = await proposeWorkflows({
      userPrompt: prompt,
      bookSummary,
      anthropicKey: process.env.ANTHROPIC_API_KEY,
      openaiKey: process.env.OPENAI_API_KEY,
    });
    return NextResponse.json({
      proposals: result.proposals,
      book_summary: bookSummary,
      prompt,
      model: result.model,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Proposal generation failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
