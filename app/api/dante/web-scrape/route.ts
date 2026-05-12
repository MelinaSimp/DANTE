// /api/dante/web-scrape
//
// Streaming endpoint that runs against the "Drift Web Scraper"
// managed agent (DRIFT_WEB_SCRAPER_AGENT_ID). Same SSE shape as
// /api/dante/deep-research; only the agent id and persisted chat
// title differ. Used by Vergil's "Pull comps" composer chip.
//
// Why share the deep-research scaffold rather than abstract: the
// two endpoints are short enough that the duplication is more
// readable than the helper they'd share. If we add a third agent
// surface, factor then.

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

  const agentId = process.env.DRIFT_WEB_SCRAPER_AGENT_ID;
  const environmentId = process.env.DRIFT_AGENT_ENVIRONMENT_ID;
  if (!agentId || !environmentId) {
    return NextResponse.json(
      { error: "Web Scraper agent not configured (missing env)" },
      { status: 500 },
    );
  }

  let chatId = body.chat_id;
  if (chatId) {
    const { data: chat } = await supabaseAdmin
      .from("dante_chats")
      .select("id, user_id, workspace_id")
      .eq("id", chatId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!chat || chat.user_id !== user.id || chat.workspace_id !== profile.workspace_id) {
      return NextResponse.json({ error: "chat not found" }, { status: 404 });
    }
    await supabaseAdmin
      .from("dante_chats")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", chatId);
  } else {
    const title = (message.length > 60 ? message.slice(0, 57) + "…" : message) + " · scrape";
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
          feature: "web_scrape",
          model: "claude-sonnet-4-6",
          onEvent: async (event) => {
            if (event.type === "text_delta" && event.text) {
              assistantContent += event.text;
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
          assistantContent =
            "The scraper finished without returning anything. The page may have blocked the bot or the URL is unreachable.";
          send({ type: "error", error: runError });
        }
      } catch (err) {
        runError = err instanceof Error ? err.message : "scrape_failed";
        assistantContent = `Couldn't pull that. ${runError}`;
        send({ type: "error", error: runError });
        console.error("[web-scrape] managed-agent turn failed:", err);
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
