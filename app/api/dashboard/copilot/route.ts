import { NextResponse } from "next/server";
import { complete as llmComplete } from "@/lib/llm/client";
import { createServerSupabase } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { prompt } = await request.json();
    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const systemPrompt = `You are Drift Copilot, an AI assistant for commercial real estate professionals.
You help CRE brokers with deal intelligence, meeting prep, lease analysis, and market insights.
Always respond with structured output in the following JSON format:
{
  "sections": [
    { "type": "answer", "label": "Summary", "content": "Your main answer here" },
    { "type": "findings", "label": "Key Findings", "content": ["Finding 1", "Finding 2"] },
    { "type": "actions", "label": "Recommended Actions", "content": ["Action 1", "Action 2"] }
  ],
  "trace": {
    "confidence": "HIGH",
    "dataQuality": "COMPLETE",
    "requestType": "GENERAL_QUERY",
    "timestamp": "${new Date().toISOString()}",
    "inputsUsed": ["client_records", "opportunity_data"],
    "deterministicChecks": ["Verified against stored records"],
    "agentModulesUsed": ["copilot_synthesis"],
    "outputsGenerated": ["structured_response"],
    "missingData": [],
    "reviewRequired": false
  }
}
If the question is about a specific topic, use the appropriate section types: "answer", "findings", "actions", "warning", "draft", "missing_data".
Only respond with valid JSON.`;

    const response = await llmComplete({
      model: "claude-haiku-4-5-20251001",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      responseFormat: { type: "json_object" },
      temperature: 0.7,
      maxTokens: 1500,
      feature: "dashboard.copilot",
    });

    const raw = response.message.content ?? "{}";
    const parsed = JSON.parse(raw);
    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Copilot error:", error);
    return NextResponse.json({ error: "Copilot request failed" }, { status: 500 });
  }
}
