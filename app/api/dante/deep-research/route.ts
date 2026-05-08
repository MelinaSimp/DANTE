// /api/dante/deep-research
//
// Streaming endpoint that runs the user's question against the
// Anthropic Managed Agent "Drift Deep Research" (id pinned in
// DRIFT_DEEP_RESEARCH_AGENT_ID env). Emits SSE in the same shape as
// /api/dante/ask so the chat UI consumer (streamClient.tsx) doesn't
// have to switch protocols.
//
// What's intentionally simpler than /ask:
//   • No vault/memory tool calls — the managed agent has its own
//     web search via agent_toolset_20260401 and reads the open
//     internet, not Drift's vault.
//   • No citation_report / grounding_score on the result. The agent's
//     output cites URLs in its system-prompt-mandated Sources section;
//     full chip integration is a follow-up.
//   • No followup suggestions yet.
//
// What stays consistent with /ask:
//   • Same chat_id + dante_chat_messages persistence so the turn
//     lands in the user's chat history alongside non-research turns.
//   • Same SSE event names (chat_started, tool_start, tool_end,
//     text_delta, final, error).

import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runManagedAgentTurn } from "@/lib/agents/managed-agent";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface PostBody {
  message: string;
  chat_id?: string;
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "no workspace" }, { status: 400 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const message = (body.message || "").trim();
  if (!message) return NextResponse.json({ error: "empty message" }, { status: 400 });

  const agentId = process.env.DRIFT_DEEP_RESEARCH_AGENT_ID;
  const environmentId = process.env.DRIFT_AGENT_ENVIRONMENT_ID;
  if (!agentId || !environmentId) {
    return NextResponse.json(
      { error: "Deep Research agent not configured (missing env)" },
      { status: 500 },
    );
  }

  // Resolve chat — create new if no chat_id, else verify ownership.
  let chatId = body.chat_id;
  if (chatId) {
    const { data: chat } = await supabaseAdmin
      .from("dante_chats")
      .select("id, user_id, workspace_id")
      .eq("id", chatId)
      .maybeSingle();
    if (!chat || chat.user_id !== user.id || chat.workspace_id !== profile.workspace_id) {
      return NextResponse.json({ error: "chat not found" }, { status: 404 });
    }
    await supabaseAdmin
      .from("dante_chats")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", chatId);
  } else {
    const title = (message.length > 60 ? message.slice(0, 57) + "…" : message) + " · research";
    const { data: created, error } = await supabaseAdmin
      .from("dante_chats")
      .insert({
        workspace_id: profile.workspace_id,
        user_id: user.id,
        title,
      })
      .select("id")
      .single();
    if (error || !created) {
      return NextResponse.json({ error: error?.message || "create_failed" }, { status: 500 });
    }
    chatId = created.id as string;
  }

  // Persist user turn first.
  await supabaseAdmin.from("dante_chat_messages").insert({
    chat_id: chatId,
    role: "user",
    content: message,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      send({ type: "chat_started", chat_id: chatId });

      let assistantContent = "";
      let runError: string | null = null;
      const trace: Array<{ step_id: string; step_name: string; status: string; output?: unknown }> = [];

      try {
        const result = await runManagedAgentTurn({
          agentId,
          environmentId,
          userText: message,
          workspaceId: profile.workspace_id,
          feature: "deep_research",
          model: "claude-sonnet-4-6",
          onEvent: async (event) => {
            // Translate managed-agent events into Drift's chat SSE shape.
            if (event.type === "text_delta" && event.text) {
              assistantContent += event.text;
              // The chat UI doesn't currently consume text_delta for /ask
              // (it renders from the final block), but emit it anyway
              // so a future streaming-enabled UI just works.
              send({ type: "text_delta", text: event.text });
            } else if (event.type === "tool_start") {
              const subId = event.sub_id || `t_${trace.length}`;
              trace.push({
                step_id: subId,
                step_name: event.tool_name || "tool",
                status: "running",
                output: event.payload,
              });
              send({
                type: "tool_start",
                sub_id: subId,
                tool_name: event.tool_name,
                args: event.payload,
              });
            } else if (event.type === "tool_end") {
              const subId = event.sub_id || `t_${trace.length}`;
              const idx = trace.findIndex((t) => t.step_id === subId);
              if (idx >= 0) {
                trace[idx].status = "success";
                trace[idx].output = event.payload;
              }
              send({
                type: "tool_end",
                sub_id: subId,
                tool_name: event.tool_name,
                status: "success",
                output: event.payload,
              });
            } else if (event.type === "iteration_thinking" && event.text) {
              send({ type: "iteration_thinking", iteration: trace.length, summary: event.text });
            }
          },
        });

        if (!result.text.trim()) {
          runError = "empty_model_output";
          assistantContent = "Deep research finished without producing a final answer. Try rephrasing the question.";
          send({ type: "error", error: runError });
        }
      } catch (err) {
        runError = err instanceof Error ? err.message : "agent_failed";
        assistantContent = `Research couldn't complete. ${runError}`;
        send({ type: "error", error: runError });
        console.error("[deep-research] managed-agent turn failed:", err);
      }

      const { data: persisted } = await supabaseAdmin
        .from("dante_chat_messages")
        .insert({
          chat_id: chatId,
          role: "assistant",
          content: assistantContent,
          trace,
        })
        .select("id")
        .single();

      send({
        type: "final",
        chat_id: chatId,
        message_id: persisted?.id,
        content: assistantContent,
        trace,
        error: runError,
      });

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
