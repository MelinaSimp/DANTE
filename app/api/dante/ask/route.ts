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
import {
  buildDanteSystemPrompt,
  getAssistantName,
  getActivePromptVersion,
} from "@/lib/dante/system-prompt";
import { validateCitations } from "@/lib/dante/citation-validator";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit/limiter";
import { getVerticalSpecLoose } from "@/lib/industry/vertical-spec";
import { computeGroundingScore } from "@/lib/dante/grounding";
import type { AgentStep, AgentToolEntry, StepLogEntry } from "@/lib/dante/workflow-types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Fallback for workspaces with no industry set yet. Per-vertical
// tool whitelists come from lib/industry/vertical-spec.ts and are
// resolved per-request below — keeps the chat surface aligned with
// whatever the workspace's vertical specifies.
const DEFAULT_TOOLS: AgentToolEntry[] = [
  "memory.search",
  "archive.search",
  "vault.cite",
  "clients.query",
  "skill.run",
];

// System prompt is now built per-workspace inside POST() so realtor
// workspaces get the Vergil/realtor flavor instead of advisor copy.
// See lib/dante/system-prompt.ts.

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

  const { data: workspace } = await supabaseAdmin
    .from("workspaces")
    .select("industry")
    .eq("id", profile.workspace_id)
    .maybeSingle();
  const industry = (workspace?.industry as string | null) ?? null;
  const assistantName = getAssistantName(industry);

  const body = (await req.json().catch(() => ({}))) as {
    chat_id?: string;
    message?: string;
    deep?: boolean;
    context_contact_id?: string;
    context_contact_name?: string;
    context_property_id?: string;
    context_property_label?: string;
  };
  const message = (body.message || "").trim();
  if (!message) return jsonError(400, "message required");
  const deep = body.deep === true;

  // Phase 2 W2.5 — workspace-scoped rate limit on the chat surface.
  // Deep-research turns are more expensive; charge them more tokens
  // from the same bucket. Default 60 tokens/minute → roughly 1
  // chat turn per second sustained, with bursts up to 60. Tier
  // limits land when the SKU surface ships.
  const rl = await rateLimit({
    workspaceId: profile.workspace_id,
    bucket: "dante.ask",
    cost: deep ? 5 : 1,
    capacity: 60,
    refillPerMin: 60,
  });
  const rlResp = rateLimitResponse(rl);
  if (rlResp) return rlResp;
  const contextContactId = body.context_contact_id?.trim() || null;
  const contextContactName = body.context_contact_name?.trim() || null;
  const contextPropertyId = body.context_property_id?.trim() || null;
  const contextPropertyLabel = body.context_property_label?.trim() || null;

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
    .map((m) => `${m.role === "user" ? "User" : assistantName}: ${m.content}`)
    .join("\n\n");

  // Entity scope is prepended so the model treats it as load-bearing
  // context: any tool call that takes a contact_id or property_id
  // should default to this one unless the user explicitly names a
  // different entity. Property scope additionally fetches the
  // property's address + linked clients + attached documents up
  // front so the agent doesn't burn a tool call on the obvious
  // first-step lookup.
  let contextLine = "";
  if (contextContactId) {
    contextLine += `\n\nCONTEXT: this conversation is scoped to contact ${contextContactName || "(unknown name)"} (id: ${contextContactId}). When calling memory.search, clients.query, or skill.run, pass this contact_id by default unless the user asks about a different contact.`;
  }
  if (contextPropertyId) {
    // Snapshot the property up front — saves the agent a hop.
    const { data: prop } = await supabaseAdmin
      .from("properties")
      .select(
        "address_line1, city, state, zip, kind, status, beds, baths, sqft, year_built, list_price_cents, monthly_rent_cents, lease_start_date, lease_end_date, description, interior_features, exterior_features",
      )
      .eq("id", contextPropertyId)
      .eq("workspace_id", profile.workspace_id)
      .maybeSingle();
    const { data: links } = await supabaseAdmin
      .from("property_clients")
      .select("contact_id, role")
      .eq("property_id", contextPropertyId);
    const { data: docs } = await supabaseAdmin
      .from("property_documents")
      .select("id, title, doc_kind, expires_at")
      .eq("workspace_id", profile.workspace_id)
      .eq("property_id", contextPropertyId)
      .order("expires_at", { ascending: true, nullsFirst: false });

    const lines: string[] = [];
    lines.push(
      `\n\nCONTEXT: this conversation is scoped to property ${contextPropertyLabel || "(unknown)"} (id: ${contextPropertyId}).`,
    );
    if (prop) {
      const facts: string[] = [];
      const addr = [prop.address_line1, prop.city, prop.state, prop.zip].filter(Boolean).join(", ");
      if (addr) facts.push(`address: ${addr}`);
      if (prop.kind) facts.push(`kind: ${prop.kind}`);
      if (prop.status) facts.push(`status: ${prop.status}`);
      if (prop.beds != null) facts.push(`beds: ${prop.beds}`);
      if (prop.baths != null) facts.push(`baths: ${prop.baths}`);
      if (prop.sqft != null) facts.push(`sqft: ${prop.sqft}`);
      if (prop.year_built != null) facts.push(`year built: ${prop.year_built}`);
      if (prop.list_price_cents != null)
        facts.push(`list price: $${(prop.list_price_cents / 100).toLocaleString()}`);
      if (prop.monthly_rent_cents != null)
        facts.push(`monthly rent: $${(prop.monthly_rent_cents / 100).toLocaleString()}`);
      if (prop.lease_start_date) facts.push(`lease start: ${prop.lease_start_date}`);
      if (prop.lease_end_date) facts.push(`lease end: ${prop.lease_end_date}`);
      if (Array.isArray(prop.interior_features) && prop.interior_features.length > 0)
        facts.push(`interior: ${prop.interior_features.join(", ")}`);
      if (Array.isArray(prop.exterior_features) && prop.exterior_features.length > 0)
        facts.push(`exterior: ${prop.exterior_features.join(", ")}`);
      if (facts.length > 0) lines.push(`Property facts — ${facts.join("; ")}.`);
      if (prop.description) lines.push(`Description: ${prop.description}`);
    }
    if (links && links.length > 0) {
      lines.push(
        `Linked clients (use clients.query for details): ${links
          .map((l: any) => `${l.role}=${l.contact_id}`)
          .join(", ")}.`,
      );
    }
    if (docs && docs.length > 0) {
      const docLines = docs
        .map((d: any) =>
          `${d.doc_kind} "${d.title}"${d.expires_at ? ` (expires ${d.expires_at})` : ""}`,
        )
        .join("; ");
      lines.push(`Attached documents: ${docLines}.`);
    }
    lines.push(
      "When tools take a property_id, contact_id, or document context, default to this property and its linked clients unless the user names a different entity.",
    );
    contextLine += lines.join("\n");
  }

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

  const systemPrompt = buildDanteSystemPrompt({ industry });

  // Per-vertical tool whitelist (Phase 3 W3.5). Defaults match
  // DEFAULT_TOOLS but the indirection is live so future vertical-
  // specific tools (mls.search for realtor; portfolio.summarize
  // for advisor) drop in here without route surgery.
  const verticalSpec = getVerticalSpecLoose(industry);
  const tools = verticalSpec.toolWhitelist.builtin as AgentToolEntry[];

  const step: AgentStep = {
    id: `chat:${chatId}`,
    type: "agent",
    name: deep ? `Ask ${assistantName} (deep)` : `Ask ${assistantName}`,
    config: {
      objective,
      tools: tools.length > 0 ? tools : DEFAULT_TOOLS,
      max_steps: deep ? 20 : 10,
      system: systemPrompt + deepNote,
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
          // Identifies "me" for tools like reminder.schedule that need
          // to know who to text. Workflow / cron runs into runAgent
          // leave userId undefined and the tool refuses self-actions.
          userId: user.id,
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

      // Citation validation runs BEFORE persistence now (Phase 3+
      // panel fix #2: persisted threads need the report attached so
      // chips render decorated when the user opens yesterday's
      // chat). Cost is small — one validator pass before insert
      // instead of after — and the user sees no latency change
      // because the validator runs in parallel with the insert
      // resolution either way.
      let report: import("@/lib/dante/citation-validator").CitationValidationReport | null = null;
      if (!runError && assistantContent) {
        try {
          report = await validateCitations({
            workspaceId: profile.workspace_id!,
            responseText: assistantContent,
            trace: log as Array<{
              step_id: string;
              step_name: string;
              status: string;
              output?: unknown;
            }>,
          });
        } catch (err) {
          console.warn("[ask] citation validation failed:", err);
        }
      }

      // Compute grounding score (panel fix #7). Surfaces below the
      // response and persists alongside the message so audits can
      // answer "what % of advisor answers were strongly grounded
      // last week."
      const grounding = computeGroundingScore({
        responseText: assistantContent,
        trace: log as Array<{ step_name?: string }>,
        citationReport: report,
      });

      const promptVersion = getActivePromptVersion(industry);

      // Persist the assistant turn with citation report + prompt
      // version + grounding score. /chat/[id] reads these on
      // refresh so chips render decorated even hours later.
      const { data: persisted } = await supabaseAdmin
        .from("dante_chat_messages")
        .insert({
          chat_id: chatId,
          role: "assistant",
          content: assistantContent,
          trace: log,
          citation_report: report,
          prompt_version: promptVersion,
          grounding_score: grounding.score,
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
        prompt_version: promptVersion,
      });

      if (report) send({ type: "citation_report", report });
      send({ type: "grounding", grounding });

      // Suggested follow-ups — fire AFTER `final` so the UI renders
      // the answer immediately and the suggestions populate a moment
      // later. One small gpt-4o-mini call. Failures here are silent;
      // the UI just doesn't show suggestions.
      if (!runError && assistantContent) {
        try {
          const suggestions = await generateFollowups(
            message,
            assistantContent,
            industry,
          );
          if (suggestions.length > 0) {
            send({ type: "followups", suggestions });
          }
        } catch (err) {
          console.warn("[ask] followups generation failed:", err);
        }
      }

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

/**
 * Suggest 3 follow-up questions the advisor might ask next, given
 * the question they just asked and Dante's answer. Returns an empty
 * array on any failure — follow-ups are nice-to-have, never load-
 * bearing for the chat experience.
 */
async function generateFollowups(
  question: string,
  answer: string,
  industry: string | null,
): Promise<string[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return [];

  const verticalNoun =
    industry === "real_estate" ? "real estate agent" : "financial advisor";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-5",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You suggest follow-up questions a ${verticalNoun} might ask their AI assistant next. Given a question and an answer, return JSON of the shape { "questions": [string, string, string] } with exactly three short, specific, actionable follow-ups (8-15 words each, end with a question mark). They should build on the answer — extend it, drill into a specific point, or pivot to a related concrete next step. Do not repeat the original question.`,
        },
        {
          role: "user",
          content: `QUESTION:\n${question}\n\nANSWER:\n${answer.slice(0, 4000)}`,
        },
      ],
      max_tokens: 400,
    }),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const raw = json.choices?.[0]?.message?.content;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { questions?: unknown };
    if (!Array.isArray(parsed.questions)) return [];
    return parsed.questions
      .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
      .slice(0, 4)
      .map((q) => q.trim());
  } catch {
    return [];
  }
}
