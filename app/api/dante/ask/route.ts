// /api/dante/ask — the front-door chat endpoint.
//
// Streams agent-loop events back to the client over Server-Sent
// Events so the chat UI can render "Searching memory..." → "Checking
// vault..." live as the loop progresses, instead of sitting silent
// for 10 seconds and dumping the result. This is the Phase 4a fix —
// same engine, same tools, same persisted history; just a streaming
// transport instead of a request/response one.
//
// Wire format: `data: <json>\n\n` lines. Event shapes:
//   { type: "chat_started", chat_id }              — first frame
//   { type: "tool_start", sub_id, tool_name, args }
//   { type: "tool_end", sub_id, tool_name, status, output, error? }
//   { type: "iteration_thinking", iteration }
//   { type: "final", chat_id, message_id, content, trace }
//   { type: "error", error }
//
// Default tools = the read-mostly set: memory.search, archive.search,
// vault.cite, clients.query, skill.run. Mutating tools are excluded
// from the chat surface by design — chat is for asking, not for
// sending mail. Skill invocations through skill.run still respect
// each skill's own auto_approve gate.

import { NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runAgent, type AgentEvent } from "@/lib/dante/agent";
import type { AgentStep, AgentToolEntry, StepLogEntry } from "@/lib/dante/workflow-types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DEFAULT_TOOLS: AgentToolEntry[] = [
  "memory.search",
  "archive.search",
  "vault.cite",
  "clients.query",
  "skill.run",
];

const SYSTEM_PROMPT = `You are Dante, an AI assistant for a financial advisor. You have access to:

- The advisor's persistent memory (facts, summaries, and email/call episodes about specific clients) via memory.search
- The firm's document vault (Form ADVs, policies, IPS templates, compliance memos) via archive.search and vault.cite
- The contacts database via clients.query
- Named workspace skills (preconfigured agent recipes) via skill.run

Default behavior:
- For questions about a specific client, start with memory.search to gather context.
- For questions that touch policy or compliance, ground your answer in vault.cite citations and reference them inline like [v1] [v2].
- For multi-step asks (e.g. "draft a follow-up to John recapping last week"), check whether a workspace skill matches first via skill.run.
- When you have enough context, return a clear, concise final answer in markdown. Bullet lists for multi-point answers, prose for narrative.
- If the user's question is ambiguous (e.g. "summarize my recent emails" with no contact), ask one clarifying question before tool-calling.`;

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) return jsonError(400, "no workspace");

  const body = (await req.json().catch(() => ({}))) as {
    chat_id?: string;
    message?: string;
    deep?: boolean;
    context_contact_id?: string;
    context_contact_name?: string;
  };
  const message = (body.message || "").trim();
  if (!message) return jsonError(400, "message required");
  const deep = body.deep === true;
  const contextContactId = body.context_contact_id?.trim() || null;
  const contextContactName = body.context_contact_name?.trim() || null;

  // Resolve chat — create or verify ownership of existing.
  let chatId = body.chat_id;
  if (chatId) {
    const { data: chat } = await supabaseAdmin
      .from("dante_chats")
      .select("id, user_id, workspace_id")
      .eq("id", chatId)
      .maybeSingle();
    if (!chat || chat.user_id !== user.id || chat.workspace_id !== profile.workspace_id) {
      return jsonError(404, "chat not found");
    }
    await supabaseAdmin
      .from("dante_chats")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", chatId);
  } else {
    const title = message.length > 60 ? message.slice(0, 57) + "…" : message;
    const { data: created, error } = await supabaseAdmin
      .from("dante_chats")
      .insert({
        workspace_id: profile.workspace_id,
        user_id: user.id,
        title,
      })
      .select("id")
      .single();
    if (error || !created) return jsonError(500, error?.message || "create_failed");
    chatId = created.id as string;
  }

  // Persist the user turn before running the agent.
  await supabaseAdmin.from("dante_chat_messages").insert({
    chat_id: chatId,
    role: "user",
    content: message,
  });

  // Pull prior turns for context.
  const { data: priorMessages } = await supabaseAdmin
    .from("dante_chat_messages")
    .select("role, content")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true })
    .limit(10);

  const priorTranscript = (priorMessages || [])
    .slice(0, -1)
    .map((m) => `${m.role === "user" ? "User" : "Dante"}: ${m.content}`)
    .join("\n\n");

  // Contact scope is prepended so the model treats it as load-bearing
  // context: any tool call that takes a contact_id should default to
  // this one unless the user explicitly names a different contact.
  const contextLine = contextContactId
    ? `\n\nCONTEXT: this conversation is scoped to contact ${contextContactName || "(unknown name)"} (id: ${contextContactId}). When calling memory.search, clients.query, or skill.run, pass this contact_id by default unless the user asks about a different contact.`
    : "";

  const objective = priorTranscript
    ? `Previous turns in this conversation:\n\n${priorTranscript}${contextLine}\n\n---\n\nLatest user message: ${message}`
    : `${message}${contextLine}`;

  // Deep research bumps the agent's tool-call budget and nudges the
  // system prompt toward iterative refinement — the model is told to
  // re-search with narrower queries when initial results are thin
  // rather than answering with what it has after one shot.
  const deepNote = deep
    ? "\n\nDEEP RESEARCH MODE: take more time. If a tool call returns thin results, refine the query and try again. Cross-check across memory and the vault before writing the final answer. Aim for thoroughness over speed."
    : "";

  const step: AgentStep = {
    id: `chat:${chatId}`,
    type: "agent",
    name: deep ? "Ask Dante (deep)" : "Ask Dante",
    config: {
      objective,
      tools: DEFAULT_TOOLS,
      max_steps: deep ? 20 : 10,
      system: SYSTEM_PROMPT + deepNote,
    },
  };

  const log: StepLogEntry[] = [];
  const runId = `chat_${chatId}_${Date.now()}`;

  // Build the SSE stream. We keep the response open until the agent
  // loop returns or throws, then send a final event with the
  // persisted assistant message id.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      send({ type: "chat_started", chat_id: chatId });

      let assistantContent = "";
      let runError: string | null = null;

      try {
        const result = await runAgent({
          step,
          workspaceId: profile.workspace_id!,
          simulate: true,
          runId,
          log,
          onEvent: (event: AgentEvent) => {
            send(event);
          },
        });
        assistantContent = result.text || "";
      } catch (err) {
        runError = err instanceof Error ? err.message : "agent_failed";
        assistantContent = `I hit an error and couldn't complete that. ${runError}`;
        send({ type: "error", error: runError });
      }

      // Persist the assistant turn and emit a `final` event with the
      // canonical data so the client can replace its in-memory
      // streaming state with the persisted version (matches what
      // /chat/[id] would show on a hard refresh).
      const { data: persisted } = await supabaseAdmin
        .from("dante_chat_messages")
        .insert({
          chat_id: chatId,
          role: "assistant",
          content: assistantContent,
          trace: log,
        })
        .select("id")
        .single();

      send({
        type: "final",
        chat_id: chatId,
        message_id: persisted?.id,
        content: assistantContent,
        trace: log,
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
      // Vercel-specific: tells their edge to NOT buffer this response.
      "X-Accel-Buffering": "no",
    },
  });
}

function jsonError(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
