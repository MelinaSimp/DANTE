// /api/dante/refine — small one-shot rewrite for the Customize and
// Improve toolbar buttons.
//
// Body shape:
//   {
//     kind: "prompt" | "answer",
//     text: string,
//     instruction?: string,   // optional user direction, e.g. "shorter"
//   }
//
// Returns { text: string }. Plain OpenAI call, no tools, no agent
// loop — this is intentionally a tight in-and-out so the button
// feels instant.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const PROMPT_SYSTEM = `You are a writing coach helping a financial advisor refine a query they're about to send to an AI assistant. Your job: take their draft prompt and rewrite it to be more specific, concrete, and likely to produce a useful answer. Keep the user's intent. Do not answer the question. Return ONLY the rewritten prompt, no preamble.

If the user provides an instruction (e.g. "more specific"), apply it. Otherwise, default to: add specificity, name the contact if implied, request a particular output format (bullets, table, prose) when appropriate.`;

const ANSWER_SYSTEM = `You are an editor helping a financial advisor refine an AI-generated answer. Your job: rewrite the answer per the user's instruction (e.g. "shorter", "add bullets", "more formal"). Preserve any citation markers like [v1] or [mem:abc12345] verbatim — they're load-bearing. Return ONLY the rewritten answer, no preamble.`;

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    kind?: "prompt" | "answer";
    text?: string;
    instruction?: string;
  };
  const kind = body.kind === "answer" ? "answer" : "prompt";
  const text = (body.text || "").trim();
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });
  if (text.length > 8000) {
    return NextResponse.json({ error: "text too long" }, { status: 400 });
  }
  const instruction = (body.instruction || "").trim().slice(0, 200);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }

  const userMessage = instruction
    ? `Instruction: ${instruction}\n\n---\n\n${text}`
    : text;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: kind === "answer" ? ANSWER_SYSTEM : PROMPT_SYSTEM },
        { role: "user", content: userMessage },
      ],
      max_tokens: 1500,
    }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    return NextResponse.json(
      { error: `openai ${res.status}: ${errBody.slice(0, 200)}` },
      { status: 500 },
    );
  }
  const json = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const out = json.choices?.[0]?.message?.content?.trim() || "";
  return NextResponse.json({ text: out });
}
