// /api/dante/ask — the front-door chat endpoint.
//
// Body shape:
//   { chat_id?: string, message: string }
//
// If chat_id is provided, append to that conversation. Otherwise
// create a new one. Either way, the user message is persisted, the
// agent loop fires with the default tool whitelist, the assistant
// reply is persisted with the full reasoning trace, and the
// response surfaces { chat_id, message_id, content, trace }.
//
// Default tools = the read-mostly set: memory.search, archive.search,
// vault.cite, clients.query, skill.run. We deliberately exclude
// mutating tools (email.send, clients.update, memory.write) from the
// default chat surface — advisors can still invoke skills that
// mutate, gated by skill auto_approve. This keeps "Ask Dante anything"
// from being a way to accidentally email a client.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runAgent } from "@/lib/dante/agent";
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
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "no workspace" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    chat_id?: string;
    message?: string;
  };
  const message = (body.message || "").trim();
  if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });

  // Resolve chat — create or verify ownership of existing.
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
    // Bump updated_at so the recent-chats list reorders.
    await supabaseAdmin
      .from("dante_chats")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", chatId);
  } else {
    // First-message chat: derive title from user input.
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
    if (error || !created) {
      return NextResponse.json({ error: error?.message || "create_failed" }, { status: 500 });
    }
    chatId = created.id as string;
  }

  // Persist the user turn before running the agent. If the agent
  // throws, the user message stays — they can retry without re-typing.
  await supabaseAdmin.from("dante_chat_messages").insert({
    chat_id: chatId,
    role: "user",
    content: message,
  });

  // Pull prior turns (if any) and prepend them to the agent's
  // objective so it has conversation context. Multi-turn done the
  // poor man's way — we don't yet pipe full message history into the
  // agent loop's messages[] array, but for MVP this is plenty.
  const { data: priorMessages } = await supabaseAdmin
    .from("dante_chat_messages")
    .select("role, content")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true })
    .limit(10);

  const priorTranscript = (priorMessages || [])
    .slice(0, -1)                                        // exclude the just-inserted user message
    .map((m) => `${m.role === "user" ? "User" : "Dante"}: ${m.content}`)
    .join("\n\n");

  const objective = priorTranscript
    ? `Previous turns in this conversation:\n\n${priorTranscript}\n\n---\n\nLatest user message: ${message}`
    : message;

  const step: AgentStep = {
    id: `chat:${chatId}`,
    type: "agent",
    name: "Ask Dante",
    config: {
      objective,
      tools: DEFAULT_TOOLS,
      max_steps: 10,
      system: SYSTEM_PROMPT,
    },
  };

  const log: StepLogEntry[] = [];
  const runId = `chat_${chatId}_${Date.now()}`;

  let assistantContent = "";
  let runError: string | null = null;

  try {
    const result = await runAgent({
      step,
      workspaceId: profile.workspace_id,
      simulate: true,                                    // chat surface is read-only by design
      runId,
      log,
    });
    assistantContent = result.text || "";
  } catch (err) {
    runError = err instanceof Error ? err.message : "agent_failed";
    assistantContent = `I hit an error and couldn't complete that. ${runError}`;
  }

  // Persist the assistant turn.
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

  return NextResponse.json({
    ok: !runError,
    chat_id: chatId,
    message_id: persisted?.id,
    content: assistantContent,
    trace: log,
    error: runError,
  });
}
