// app/api/ai/analyze-contact/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireUserWithWorkspace } from "@/lib/api-auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

interface NoteLite {
  id: string;
  body: string;
  created_at: string;
}

interface KnowledgeBase {
  company_info?: string;
  services?: string;
  hours?: string;
  policies?: string;
  faq?: string;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUserWithWorkspace();
    if (auth.error) return auth.error;

    if (!rateLimit(`ai-contact:${auth.user.id}`, 20).allowed) return rateLimitResponse();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const { contactId, workspaceId } = (await req.json()) as { 
      contactId: string;
      workspaceId?: string;
    };

    if (!contactId) {
      return NextResponse.json({ error: "Contact ID is required" }, { status: 400 });
    }

    // Get contact details — scoped to user's workspace
    const ownerWorkspace = auth.workspaceId;
    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("id, name, phone, email, notes, workspace_id")
      .eq("id", contactId)
      .single();

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    if (ownerWorkspace && contact.workspace_id !== ownerWorkspace) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    const finalWorkspaceId = workspaceId || contact.workspace_id;

    // Get notes for this contact
    const { data: notesData } = await supabaseAdmin
      .from("notes")
      .select("id, body, created_at")
      .eq("contact_id", contactId)
      .eq("workspace_id", finalWorkspaceId)
      .order("created_at", { ascending: false });

    const notesSafe = (Array.isArray(notesData) ? notesData : []) as NoteLite[];

    // Get company knowledge base if workspaceId provided
    let knowledgeBase: KnowledgeBase = {};
    if (finalWorkspaceId) {
      try {
        const { data: kb } = await supabaseAdmin
          .from("knowledge_base")
          .select("company_info, services, hours, policies, faq")
          .eq("workspace_id", finalWorkspaceId)
          .maybeSingle();
        
        if (kb) {
          knowledgeBase = kb;
        }
      } catch (e) {
        console.error("Failed to fetch knowledge base:", e);
      }
    }

    // Build context from knowledge base
    const companyContext = [];
    if (knowledgeBase.company_info) {
      companyContext.push(`COMPANY INFO: ${knowledgeBase.company_info}`);
    }
    if (knowledgeBase.services) {
      companyContext.push(`SERVICES OFFERED: ${knowledgeBase.services}`);
    }
    if (knowledgeBase.hours) {
      companyContext.push(`BUSINESS HOURS: ${knowledgeBase.hours}`);
    }
    if (knowledgeBase.policies) {
      companyContext.push(`POLICIES: ${knowledgeBase.policies}`);
    }
    if (knowledgeBase.faq) {
      companyContext.push(`FREQUENTLY ASKED QUESTIONS: ${knowledgeBase.faq}`);
    }

    // Build contact summary
    const contactInfo = [
      `CONTACT DETAILS:`,
      `- Name: ${contact.name}`,
      `- Phone: ${contact.phone}`,
      contact.email ? `- Email: ${contact.email}` : null,
      contact.notes ? `- Notes: ${contact.notes}` : null,
    ].filter(Boolean).join('\n');

    const notesJoined = notesSafe
      .map((n) => `• [${new Date(n.created_at).toISOString()}] ${n.body}`)
      .join("\n");

    const prompt = [
      "You are an AI receptionist assistant analyzing customer interaction data for a specific company.",
      "Use the company knowledge base below to provide contextually relevant analysis.",
      "",
      ...(companyContext.length > 0 ? ["COMPANY KNOWLEDGE BASE:", ...companyContext, ""] : []),
      contactInfo,
      "",
      "Given the customer interaction notes below, provide three sections in JSON:",
      "1) summary: Brief recap focusing on customer needs, service requests, and communication preferences.",
      "2) keywords: Key service types, urgency indicators, contact preferences, and business-relevant terms.",
      "3) suggested_tasks: Prioritize callback scheduling, appointment booking, service follow-ups, and customer communication tasks.",
      "",
      "For suggested tasks, focus on:",
      "- Callback appointments with specific times based on business hours",
      "- Service scheduling and follow-ups matching company services", 
      "- Customer communication and status updates",
      "- Urgent service requests that need immediate attention",
      "",
      "Return strictly valid JSON of the shape:",
      `{"summary": "...", "keywords": ["..."], "suggested_tasks": [{"title": "...", "details": "...", "due_at": "YYYY-MM-DD or null"}]}`,
      "",
      "CUSTOMER INTERACTION NOTES:",
      notesJoined || "(no prior customer interactions)",
    ].join('\n');

    // OpenAI responses: use a small, fast model
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are an AI receptionist assistant for service-based businesses. Focus on scheduling, callbacks, and customer service needs." },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("OpenAI API error:", text);
      return NextResponse.json(
        { error: "AI analysis failed" },
        { status: 500 }
      );
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json(
        { error: "No AI response received" },
        { status: 500 }
      );
    }

    try {
      const parsed = JSON.parse(content);
      return NextResponse.json(parsed);
    } catch (e) {
      console.error("Failed to parse AI response:", content);
      return NextResponse.json(
        { error: "Invalid AI response format" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Contact analysis API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
