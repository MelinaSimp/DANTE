// app/api/reminders/draft/route.ts
//
// Vergil-asked reminder drafting. Input: a free-text user prompt
// ("remind me to follow up with Smith about closing next Tuesday at
// 2pm"). We resolve a contact from the workspace, ask the LLM to
// produce a structured draft, then persist as status='draft' so the
// user can review + approve before it sends.

import { NextResponse } from "next/server";
import { complete as llmComplete } from "@/lib/llm/client";
import { createServerSupabase } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, full_name")
    .eq("id", user.id)
    .single();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }
  const workspaceId = profile.workspace_id;

  const { prompt } = await request.json();
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return NextResponse.json({ error: "prompt required" }, { status: 400 });
  }

  // Pull the contact list so the LLM can match names. Keep it small —
  // a typical advisor or RE workspace is hundreds, not thousands; if a
  // workspace grows past the comfortable token budget we'll switch to
  // a vector search over names.
  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, name, email, phone")
    .eq("workspace_id", workspaceId)
    .order("name", { ascending: true })
    .limit(500);

  const contactList = (contacts || [])
    .map((c: any) => `- ${c.id}: ${c.name || "(no name)"} <${c.email || "no email"}>`)
    .join("\n");

  const nowIso = new Date().toISOString();

  const systemPrompt = `You draft email reminders for a workspace user. Output JSON only:

{
  "contact_id": "<uuid from the contact list, or null if no match>",
  "subject": "<email subject line>",
  "body": "<email body, plain text, signed off as the user>",
  "send_at": "<ISO 8601 datetime in UTC; resolve relative phrases like 'next Tuesday at 2pm' against the supplied 'Now'>",
  "reason": "<one-sentence rationale shown to the user before they approve>"
}

Rules:
- The body should be a polished, ready-to-send email — concise, friendly, and useful.
- Sign off as the user (their name is supplied below). Never sign as "Drift" or "Vergil".
- If the user's prompt doesn't specify a time, pick a sensible default (next business day at 9am local, treated as US/Eastern unless prompt says otherwise).
- If you can't find the contact in the list, set contact_id to null but still draft the message. The user will pick a contact manually.
- Never invent facts about the contact. Keep the body to topic + ask, no fabricated history.`;

  const userPrompt = `Now: ${nowIso}
User name: ${profile.full_name || "the user"}

Contact list (id: name <email>):
${contactList || "(empty)"}

User's reminder request:
${prompt}`;

  let parsed: any = {};
  try {
    const resp = await llmComplete({
      model: "gpt-4o-mini",
      responseFormat: { type: "json_object" },
      temperature: 0.3,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      feature: "reminders.draft",
      workspaceId,
    });
    parsed = JSON.parse(resp.message.content || "{}");
  } catch (e: any) {
    console.error("reminders draft llm error:", e);
    return NextResponse.json({ error: "AI draft failed" }, { status: 502 });
  }

  // Resolve contact email if the LLM picked an id.
  let to_email: string | null = null;
  let resolvedContactId: string | null = null;
  if (parsed.contact_id) {
    const c = (contacts || []).find((x: any) => x.id === parsed.contact_id);
    if (c) {
      resolvedContactId = c.id;
      to_email = c.email || null;
    }
  }

  const insert = {
    workspace_id: workspaceId,
    created_by: user.id,
    source: "user",
    contact_id: resolvedContactId,
    channel: "email",
    to_email,
    subject: parsed.subject || null,
    body: parsed.body || null,
    send_at: parsed.send_at || null,
    reason: parsed.reason || null,
    status: "draft",
  };
  const { data, error } = await supabase
    .from("reminders")
    .insert(insert)
    .select()
    .single();
  if (error) {
    console.error("reminders draft insert:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
