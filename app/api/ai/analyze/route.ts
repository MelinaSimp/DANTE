// app/api/ai/analyze/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireUser } from "@/lib/api-auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { complete as llmComplete } from "@/lib/llm/client";

export const runtime = "nodejs";

interface NoteLite { id: string; body: string; created_at: string }
interface KnowledgeBase {
  company_info?: string;
  services?: string;
  hours?: string;
  policies?: string;
  faq?: string;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser();
    if (auth.error) return auth.error;

    if (!(await rateLimit(`ai-analyze:${auth.user.id}`, 20)).allowed) return rateLimitResponse();

    const { notes, workspaceId } = (await req.json()) as {
      notes: NoteLite[] | null | undefined;
      workspaceId?: string;
    };

    const notesSafe = (Array.isArray(notes) ? notes : []) as NoteLite[];
    const joined = notesSafe
      .map((n) => `• [${new Date(n.created_at).toISOString()}] ${n.body}`)
      .join("\n");

    // Get company knowledge base if workspaceId provided
    let knowledgeBase: KnowledgeBase = {};
    if (workspaceId) {
      try {
        const supabase = await createServerSupabase();
        const { data: kb } = await supabase
          .from("knowledge_base")
          .select("company_info, services, hours, policies, faq")
          .eq("workspace_id", workspaceId)
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

    const prompt = [
      "You are an AI receptionist assistant analyzing customer interaction notes for a specific company.",
      "Use the company knowledge base below to provide contextually relevant analysis.",
      "",
      ...(companyContext.length > 0 ? ["COMPANY KNOWLEDGE BASE:", ...companyContext, ""] : []),
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
      joined || "(no prior customer interactions)",
    ].join("\n");

    let content: string;
    try {
      const result = await llmComplete({
        model: "claude-haiku-4-5-20251001",
        messages: [
          { role: "system", content: "You are an AI receptionist assistant for service-based businesses. Focus on scheduling, callbacks, and customer service needs." },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        feature: "ai.analyze",
        workspaceId: workspaceId ?? null,
      });
      content = (typeof result.message.content === "string" ? result.message.content : "{}").trim();
    } catch (err: any) {
      return NextResponse.json(
        { error: `LLM error: ${err?.message || "Unknown"}` },
        { status: 500 }
      );
    }

    // Try to parse the model output as JSON
    let parsed: {
      summary?: string;
      keywords?: string[];
      suggested_tasks?: { title: string; details?: string | null; due_at?: string | null }[];
    } = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      // best-effort extraction if the model wrapped JSON in code fences
      const match = content.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : {};
    }

    // Basic normalization
    parsed.summary ||= "";
    parsed.keywords ||= [];
    parsed.suggested_tasks ||= [];

    return NextResponse.json(parsed);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
