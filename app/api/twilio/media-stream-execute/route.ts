/**
 * Execute agent step for Media Streams - SIMPLIFIED VERSION
 * Direct LLM call with function calling for scheduling (faster, ~2-3s instead of ~9s)
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Helper to normalize phone numbers
function normalizePhone(phone: string): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) return `+1${cleaned}`;
  if (cleaned.length === 11 && cleaned.startsWith("1")) return `+${cleaned}`;
  if (phone.startsWith("+")) return phone;
  return null;
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    const body = await req.json();
    const conversationId = body.conversationId;
    const userInput = (body.userInput ?? "") as string;

    if (!conversationId) {
      return NextResponse.json(
        { error: "Missing conversationId" },
        { status: 400 }
      );
    }

    // Load conversation and agent in parallel
    const [conversationResult, agentResult] = await Promise.all([
      supabaseAdmin
        .from("conversations")
        .select("*")
        .eq("id", conversationId)
        .single(),
      supabaseAdmin
        .from("conversations")
        .select("agent_id")
        .eq("id", conversationId)
        .single()
        .then(async (conv) => {
          if (!conv.data) return { data: null };
          return supabaseAdmin
            .from("agents")
            .select("id, name, description, elevenlabs_voice_id")
            .eq("id", conv.data.agent_id)
            .single();
        }),
    ]);

    const conversation = conversationResult.data;
    const agent = agentResult.data;

    // Return 200 with canned message so the call doesn't drop when Supabase/env not configured
    if (!conversation || !agent) {
      console.warn("[Media Stream Execute] Conversation or agent not found; returning canned reply so call does not drop.");
      return NextResponse.json({
        success: true,
        output: "Hello! Thanks for calling. We're currently setting up our system. Please leave your name and a message and we'll call you back shortly.",
        voiceId: "21m00Tcm4TlvDq8ikWAM",
        shouldContinue: true,
      });
    }

    // Load data sources (knowledge base)
    const { data: dataSources } = await supabaseAdmin
      .from("agent_data_sources")
      .select("id, name, type, content")
      .eq("agent_id", agent.id)
      .limit(20); // Increased to 20 sources for better coverage

    // Build knowledge base from data sources
    // Note: For file-based sources (PDFs), content should be extracted text stored in the 'content' field
    const knowledgeBase = (dataSources || [])
      .filter((ds: any) => ds.content && ds.content.trim().length > 0)
      .map((ds: any) => {
        // Use first 2000 chars per source for better context (increased from 1000)
        const content = ds.content.substring(0, 2000);
        return `[${ds.name || ds.type || 'Data Source'}]: ${content}`;
      })
      .join("\n\n");

    // Get conversation history (last 3 messages)
    const transcript = conversation.transcript || [];
    const recentMessages = transcript.slice(-3).map((msg: any) => ({
      role: msg.role,
      content: msg.content.substring(0, 200), // Limit length
    }));

    // Add user input to transcript
    const updatedTranscript = [
      ...transcript,
      {
        role: "user",
        content: userInput,
        timestamp: new Date().toISOString(),
      },
    ];

    // Build system prompt
    const systemPrompt = `You are ${agent.name || "AI Assistant"}. ${agent.description || "You are a helpful AI assistant."}

${knowledgeBase ? `KNOWLEDGE BASE (use this to answer questions):
${knowledgeBase}

IMPORTANT: Use ONLY information from the Knowledge Base above. If the Knowledge Base doesn't have the answer, say "I don't have that information in my knowledge base."` : ""}

You can help with:
- Answering questions using the knowledge base
- Scheduling appointments (use the schedule_appointment function)
- Checking appointment availability (use the check_availability function)

Be friendly, concise, and natural. For voice conversations, keep responses short (1-2 sentences).`;

    // OpenAI function definitions
    const functions = [
      {
        name: "schedule_appointment",
        description: "Schedule an appointment for the caller",
        parameters: {
          type: "object",
          properties: {
            contactName: {
              type: "string",
              description: "The caller's name",
            },
            scheduledAt: {
              type: "string",
              description: "Date and time in ISO 8601 format (YYYY-MM-DDTHH:MM:SS)",
            },
            serviceType: {
              type: "string",
              description: "Type of service or appointment (e.g., 'Consultation', 'Meeting')",
            },
            durationMinutes: {
              type: "number",
              description: "Duration in minutes (default: 60)",
            },
            notes: {
              type: "string",
              description: "Additional notes about the appointment",
            },
          },
          required: ["scheduledAt", "serviceType"],
        },
      },
      {
        name: "check_availability",
        description: "Check available appointment time slots for a specific date",
        parameters: {
          type: "object",
          properties: {
            date: {
              type: "string",
              description: "Date in YYYY-MM-DD format",
            },
            durationMinutes: {
              type: "number",
              description: "Duration in minutes (default: 60)",
            },
          },
          required: ["date"],
        },
      },
    ];

    // Prepare messages for OpenAI
    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...recentMessages,
      { role: "user", content: userInput || "Hello, introduce yourself." },
    ];

    // Call OpenAI with function calling
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn("[Media Stream Execute] OPENAI_API_KEY not set; returning canned reply so call does not drop.");
      return NextResponse.json({
        success: true,
        output: "Hello! Thanks for calling. We're currently setting up our AI. Please leave your name and a quick message and we'll get back to you shortly.",
        voiceId: agent?.elevenlabs_voice_id || "21m00Tcm4TlvDq8ikWAM",
        shouldContinue: true,
      });
    }

    const openaiStartTime = Date.now();
    let openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        functions,
        function_call: "auto",
        temperature: 0.2,
        max_tokens: 150,
      }),
    });

    if (!openaiResponse.ok) {
      const error = await openaiResponse.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const openaiData = await openaiResponse.json();
    const openaiEndTime = Date.now();
    console.log(`[Media Stream Execute] ⏱️  OpenAI call took ${openaiEndTime - openaiStartTime}ms`);

    let assistantMessage = openaiData.choices[0]?.message;
    let finalOutput = "";
    let functionCallResult = null;

    // Handle function calls
    if (assistantMessage.function_call) {
      const functionName = assistantMessage.function_call.name;
      const functionArgs = JSON.parse(assistantMessage.function_call.arguments || "{}");

      console.log(`[Media Stream Execute] 🔧 Function call: ${functionName}`, functionArgs);

      if (functionName === "schedule_appointment") {
        // Get contact phone from conversation
        const contactPhone = conversation.from_number || conversation.metadata?.customerNumber || "";

        const baseUrl = process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || "https://driftai.studio";
        const scheduleResponse = await fetch(`${baseUrl}/api/agents/${agent.id}/schedule`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contactName: functionArgs.contactName || "Caller",
            contactPhone: contactPhone,
            scheduledAt: functionArgs.scheduledAt,
            serviceType: functionArgs.serviceType,
            durationMinutes: functionArgs.durationMinutes || 60,
            notes: functionArgs.notes || "",
            fromNumber: contactPhone,
          }),
        });

        if (scheduleResponse.ok) {
          const scheduleData = await scheduleResponse.json();
          functionCallResult = `Appointment scheduled successfully for ${new Date(functionArgs.scheduledAt).toLocaleString()}.`;
        } else {
          const errorData = await scheduleResponse.json();
          functionCallResult = errorData.error || "Failed to schedule appointment. Please try again.";
        }
      } else if (functionName === "check_availability") {
        const baseUrl = process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || "https://driftai.studio";
        const checkResponse = await fetch(
          `${baseUrl}/api/agents/${agent.id}/schedule?date=${functionArgs.date}&duration=${functionArgs.durationMinutes || 60}`,
          {
            method: "GET",
            headers: { "Content-Type": "application/json" },
          }
        );

        if (checkResponse.ok) {
          const checkData = await checkResponse.json();
          const slots = checkData.availableSlots || [];
          if (slots.length > 0) {
            const formattedSlots = slots.slice(0, 5).map((slot: string) => {
              return new Date(slot).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              });
            });
            functionCallResult = `Available times on ${new Date(functionArgs.date).toLocaleDateString()}: ${formattedSlots.join(", ")}${slots.length > 5 ? ` and ${slots.length - 5} more` : ""}.`;
          } else {
            functionCallResult = `No available slots on ${new Date(functionArgs.date).toLocaleDateString()}. Would you like to check a different date?`;
          }
        } else {
          functionCallResult = "I couldn't check availability. Please try again.";
        }
      }

      // Call OpenAI again with function result to get natural language response
      if (functionCallResult) {
        messages.push(assistantMessage);
        messages.push({
          role: "function",
          name: functionName,
          content: functionCallResult,
        });

        const secondResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages,
            temperature: 0.2,
            max_tokens: 100,
          }),
        });

        const secondData = await secondResponse.json();
        finalOutput = secondData.choices[0]?.message?.content || functionCallResult;
      } else {
        finalOutput = assistantMessage.content || "I've processed your request.";
      }
    } else {
      finalOutput = assistantMessage.content || "I'm sorry, I couldn't generate a response.";
    }

    // Update conversation transcript
    const updates: any = {
      transcript: [
        ...updatedTranscript,
        {
          role: "assistant",
          content: finalOutput,
          timestamp: new Date().toISOString(),
        },
      ],
      updated_at: new Date().toISOString(),
    };

    // Update in background (don't wait)
    (async () => {
      try {
        await supabaseAdmin
          .from("conversations")
          .update(updates)
          .eq("id", conversation.id);
      } catch (err: any) {
        console.error("[Media Stream Execute] DB update error:", err);
      }
    })();

    const totalTime = Date.now() - startTime;
    console.log(`[Media Stream Execute] ⏱️  Total execution time: ${totalTime}ms`);

    const voiceId = agent.elevenlabs_voice_id || "21m00Tcm4TlvDq8ikWAM";

    return NextResponse.json({
      success: true,
      output: finalOutput,
      voiceId,
      shouldContinue: true,
    });
  } catch (error: any) {
    console.error("[Media Stream Execute] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to execute agent step" },
      { status: 500 }
    );
  }
}
