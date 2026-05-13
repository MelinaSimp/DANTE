import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { complete as llmComplete } from "@/lib/llm/client";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { prompt, currentBody, currentSubject } = await req.json();
  if (!prompt || typeof prompt !== "string") {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  const nameMatch = prompt.match(/(?:for|to|about|email|write|send|contact|client|reach out to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
  let contactContext = "";

  if (nameMatch) {
    const searchName = nameMatch[1].trim();
    const { data: contacts } = await supabaseAdmin
      .from("contacts")
      .select("id, name, email, phone, created_at")
      .eq("workspace_id", profile.workspace_id)
      .ilike("name", `%${searchName}%`)
      .limit(3);

    if (contacts && contacts.length > 0) {
      const c = contacts[0];

      const { data: appointments } = await supabaseAdmin
        .from("appointments")
        .select("scheduled_at, service_type, status, duration_minutes, notes")
        .eq("contact_id", c.id)
        .order("scheduled_at", { ascending: false })
        .limit(5);

      const { data: emails } = await supabaseAdmin
        .from("sent_emails")
        .select("to_email, subject, created_at")
        .eq("workspace_id", profile.workspace_id)
        .eq("to_email", c.email || "")
        .order("created_at", { ascending: false })
        .limit(5);

      const { data: callLogs } = await supabaseAdmin
        .from("outbound_call_logs")
        .select("phone_number, status, summary, created_at")
        .eq("phone_number", c.phone || "")
        .order("created_at", { ascending: false })
        .limit(3);

      contactContext = `\n\nCONTACT DATABASE MATCH:\nName: ${c.name}\nEmail: ${c.email || "N/A"}\nPhone: ${c.phone || "N/A"}\nClient since: ${new Date(c.created_at).toLocaleDateString()}`;

      if (appointments && appointments.length > 0) {
        contactContext += `\n\nRECENT APPOINTMENTS:\n${appointments.map(a =>
          `- ${new Date(a.scheduled_at).toLocaleDateString()} | ${a.service_type || "General"} | ${a.status} | ${a.duration_minutes}min${a.notes ? " | " + a.notes.substring(0, 80) : ""}`
        ).join("\n")}`;
      }

      if (emails && emails.length > 0) {
        contactContext += `\n\nPAST EMAILS:\n${emails.map(e =>
          `- ${new Date(e.created_at).toLocaleDateString()} | Subject: ${e.subject}`
        ).join("\n")}`;
      }

      if (callLogs && callLogs.length > 0) {
        contactContext += `\n\nRECENT CALLS:\n${callLogs.map(cl =>
          `- ${new Date(cl.created_at).toLocaleDateString()} | ${cl.status}${cl.summary ? " | " + cl.summary.substring(0, 80) : ""}`
        ).join("\n")}`;
      }
    }
  }

  const systemPrompt = `You are an email drafting assistant for a CRM. The user will describe what email they want to write. You must return a JSON object with "subject" and "body" fields — nothing else.

Rules:
- Write professional, warm, concise emails
- Use the contact's name naturally
- Reference their history (appointments, past emails, calls) when relevant
- Do NOT include salutation sign-off placeholders like "[Your Name]" — end with "Best regards"
- The body should be plain text with newlines, not HTML
- If you can infer the recipient's email from the contact data, include it as "to" in the JSON
${contactContext}`;

  let raw: string;
  try {
    const result = await llmComplete({
      model: "claude-haiku-4-5-20251001",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `${prompt}${currentSubject ? `\n\nCurrent subject: ${currentSubject}` : ""}${currentBody ? `\n\nCurrent draft:\n${currentBody}` : ""}` },
      ],
      temperature: 0.4,
      maxTokens: 1000,
      responseFormat: { type: "json_object" },
      feature: "ai.compose_email",
      workspaceId: profile.workspace_id,
    });
    raw = (typeof result.message.content === "string" ? result.message.content : "{}").trim();
  } catch (err) {
    console.error("LLM API error:", err);
    return NextResponse.json({ error: "AI request failed" }, { status: 500 });
  }

  try {
    const parsed = JSON.parse(raw);
    return NextResponse.json({
      subject: parsed.subject || currentSubject || "",
      body: parsed.body || "",
      to: parsed.to || "",
      contactName: nameMatch ? nameMatch[1].trim() : null,
    });
  } catch {
    return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
  }
}
