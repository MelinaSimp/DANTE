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
import { createServerSupabase, getSessionUser } from "@/lib/supabase/server";
import { complete as llmComplete } from "@/lib/llm/client";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runAgent, type AgentEvent } from "@/lib/dante/agent";
import { getAccessibleProjectIds } from "@/lib/vault/project-access";
import {
  buildDanteSystemPrompt,
  getAssistantName,
  getActivePromptVersion,
} from "@/lib/dante/system-prompt";
import { validateCitations } from "@/lib/dante/citation-validator";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit/limiter";
import { getVerticalSpecLoose } from "@/lib/industry/vertical-spec";
import { computeGroundingScore } from "@/lib/dante/grounding";
import { logAuditEvent } from "@/lib/audit/log";
import type { AgentStep, AgentToolEntry, StepLogEntry } from "@/lib/dante/workflow-types";

// Hard emoji strip — the system prompt says "never use emojis" but
// models occasionally ignore it during long structured outputs. This
// catches everything the prompt instruction misses.
const EMOJI_RE =
  /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}\u{1F7E0}-\u{1F7FF}\u{2B50}\u{2B55}\u{2934}\u{2935}\u{2B05}-\u{2B07}\u{2B1B}\u{2B1C}\u{2B06}\u{3030}\u{303D}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{231A}\u{231B}\u{25AA}\u{25AB}\u{25FB}-\u{25FE}\u{2611}\u{2614}\u{2615}\u{2648}-\u{2653}\u{267F}\u{2693}\u{2694}\u{2696}-\u{2699}\u{269B}\u{269C}\u{26A0}\u{26A1}\u{26AA}\u{26AB}\u{26B0}\u{26B1}\u{26BD}\u{26BE}\u{26C4}\u{26C5}\u{26CE}\u{26D4}\u{26EA}\u{26F2}\u{26F3}\u{26F5}\u{26FA}\u{26FD}]/gu;
function stripEmojis(text: string): string {
  return text.replace(EMOJI_RE, "").replace(/  +/g, " ");
}

export const dynamic = "force-dynamic";
// Vercel kills the SSE lambda at maxDuration. With a 10-step agent
// loop, multiple tool dispatches, and the auto-mode embed pre-flight,
// 60s was leaving runs on the table — the stream would close before
// the model emitted final text and the UI would render "(no response)"
// with no error to debug from. 300s gives a comfortable ceiling for
// deep mode (20 steps) without sacrificing tail-latency budget.
// Vercel Hobby caps function duration at 60s regardless of declared
// value. Setting to 60 explicitly so we don't silently get clamped
// (which produced "(no response)" failures with no log line because
// the kill happens before pending logs flush). When upgrading to
// Pro, bump this to 300.
export const maxDuration = 300;

// Fallback for workspaces with no industry set yet. Per-vertical
// tool whitelists come from lib/industry/vertical-spec.ts and are
// resolved per-request below — keeps the chat surface aligned with
// whatever the workspace's vertical specifies.
const DEFAULT_TOOLS: AgentToolEntry[] = [
  "memory.search",
  "archive.search",
  "vault.cite",
  "clients.query",
  "properties.query",
  "properties.create",
  "properties.update",
  "skill.run",
  "file_index.search",
  "file_index.ingest",
  "file_index.list_folder",
  "reminder.schedule",
  "workflow.propose",
  "workflow.run",
  "workflow.list",
  "workflow.update",
  "workflow.list_templates",
  "workflow.clone_template",
  "site_scan.search",
  "site_scan.detail",
  "site_scan.listings",
  "site_scan.void_analysis",
  "survey_area",
  "document.create",
  "document.edit",
  "document.list_templates",
  "document.save_template",
];

// System prompt is now built per-workspace inside POST() so realtor
// workspaces get the Vergil/realtor flavor instead of advisor copy.
// See lib/dante/system-prompt.ts.

export async function POST(req: NextRequest) {
  const auth = await getSessionUser();
  if (!auth) return jsonError(401, "unauthorized");
  const { user, supabase } = auth;

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) return jsonError(400, "no workspace");

  const { isAdmin: isUserAdmin, projectIds: userProjectIds } =
    await getAccessibleProjectIds(supabase, user.id, profile.workspace_id);

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
    /** Scope retrieval (archive.search, vault.cite) to one vault project. */
    context_project_id?: string;
    /** File attachments — extracted in the Electron main process
     *  so bytes never leave the user's machine. The text gets
     *  inlined into the agent's objective and the whole turn is
     *  forced to local_only (Hermes), since by definition this
     *  content didn't come through the cloud Vault pipeline.
     *  Image attachments carry base64 data + media_type for
     *  Claude vision — these stay on cloud (need the vision API). */
    attachments?: Array<{
      name: string;
      ext?: string;
      text: string;
      truncated?: boolean;
      /** Base64 image data (no data-URL prefix). */
      image_data?: string;
      /** MIME type for images: image/png, image/jpeg, etc. */
      media_type?: string;
    }>;
  };
  const message = (body.message || "").trim();
  if (!message) return jsonError(400, "message required");
  const deep = body.deep === true;
  const attachments = Array.isArray(body.attachments)
    ? body.attachments
        .filter(
          (a) => a && typeof a.name === "string" && typeof a.text === "string",
        )
        .map((a) => ({
          name: String(a.name).slice(0, 256),
          ext: typeof a.ext === "string" ? a.ext.slice(0, 16) : "",
          text: String(a.text).slice(0, 200_000),
          truncated: a.truncated === true,
          image_data: typeof a.image_data === "string" ? a.image_data : undefined,
          media_type: typeof a.media_type === "string" ? a.media_type : undefined,
        }))
    : [];
  // Hard cap so the objective doesn't balloon past Hermes' context.
  const cappedAttachments = attachments.slice(0, 8);
  // Split image vs text attachments — images need Claude vision (cloud),
  // text-only attachments route through Hermes (local_only).
  const imageAttachments = cappedAttachments.filter((a) => a.image_data && a.media_type);
  const textAttachments = cappedAttachments.filter((a) => !a.image_data);
  // If there are images, we need cloud (vision API). If text-only, local_only.
  const forcedProcessingMode: "cloud" | "local_only" | undefined =
    imageAttachments.length > 0
      ? "cloud"
      : textAttachments.length > 0
        ? "local_only"
        : undefined;

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
  const contextProjectId = body.context_project_id?.trim() || null;

  // Resolve chat — create or verify ownership of existing.
  let chatId = body.chat_id;
  if (chatId) {
    const { data: chat } = await supabaseAdmin
      .from("dante_chats")
      .select("id, user_id, workspace_id")
      .eq("id", chatId)
      .is("deleted_at", null)
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
  const { error: userMsgErr } = await supabaseAdmin.from("dante_chat_messages").insert({
    chat_id: chatId,
    role: "user",
    content: message,
  });
  if (userMsgErr) {
    return jsonError(500, `save user message: ${userMsgErr.message}`);
  }

  // Pull prior turns for context. 30 turns gives enough runway for
  // involved multi-turn research without blowing the context budget.
  const { data: priorMessages } = await supabaseAdmin
    .from("dante_chat_messages")
    .select("role, content")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true })
    .limit(30);

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
  if (contextProjectId) {
    contextLine += `\n\nCONTEXT: this conversation is scoped to vault project (id: ${contextProjectId}). When calling archive.search or vault.cite, restrict retrieval to that project's documents unless the user explicitly asks to search across all projects.`;
  }

  // Inline text attachments into the objective as <attachment> blocks
  // so the agent sees them as first-class context. Truncation
  // marker tells it to ask for the rest of the file if needed.
  // Image attachments are passed separately as vision content blocks.
  const attachmentBlock =
    textAttachments.length > 0
      ? "\n\nThe user attached the following files. Their full extracted text is below. Treat these as confidential local-machine content; cite filenames when referring to them.\n\n" +
        textAttachments
          .map(
            (a) =>
              `<attachment name="${a.name}"${a.ext ? ` ext="${a.ext}"` : ""}${a.truncated ? ' truncated="true"' : ""}>\n${a.text}\n</attachment>`,
          )
          .join("\n\n")
      : "";

  // Image attachments — described in the objective text so the
  // model knows files were attached, but the actual pixel data
  // goes through Claude's vision API as content blocks.
  const imageNote =
    imageAttachments.length > 0
      ? `\n\nThe user also attached ${imageAttachments.length} image${imageAttachments.length > 1 ? "s" : ""}: ${imageAttachments.map((a) => a.name).join(", ")}. The image data is included in the message for you to analyze visually.`
      : "";

  const objective = priorTranscript
    ? `Previous turns in this conversation:\n\n${priorTranscript}${contextLine}\n\n---\n\nLatest user message: ${message}${attachmentBlock}${imageNote}`
    : `${message}${contextLine}${attachmentBlock}${imageNote}`;

  // Deep research bumps the agent's tool-call budget and nudges the
  // system prompt toward iterative refinement — the model is told to
  // re-search with narrower queries when initial results are thin
  // rather than answering with what it has after one shot.
  const deepNote = deep
    ? "\n\nDEEP RESEARCH MODE: take more time. If a tool call returns thin results, refine the query and try again. Cross-check across memory and the vault before writing the final answer. Aim for thoroughness over speed."
    : "";

  // Inject the current UTC time so the agent can resolve relative
  // phrasings ("in 3 minutes", "tomorrow at 3pm") without guessing
  // from its training cutoff. Without this, reminder.schedule and
  // any time-sensitive tool gets passed timestamps from months ago
  // and rejects them — the loop retries and times out.
  const nowIso = new Date().toISOString();
  const timeNote = `\n\n---\n\nCurrent UTC time: ${nowIso}\nUse this as your anchor for any "now"-relative or "in X minutes/hours/days" computation. Do not guess the time from your training data.`;

  // Fetch connected integrations so Dante knows what data sources
  // are available. Without this, it says "I don't have a Google Maps
  // integration" even when the key is stored and site_scan uses it.
  let integrationsNote = "";
  try {
    const { data: connections } = await supabaseAdmin
      .from("integration_connections")
      .select("provider, display_name, provider_kind")
      .eq("workspace_id", profile.workspace_id)
      .eq("status", "connected");
    if (connections && connections.length > 0) {
      const names = connections.map((c) => `${c.display_name || c.provider} (${c.provider_kind || "data"})`);
      integrationsNote = `\n\n---\n\nCONNECTED INTEGRATIONS: This workspace has the following data integrations active: ${names.join(", ")}. Your tools (site_scan, void analysis, parcel detail, etc.) automatically use these connected APIs when relevant. When a user asks whether you can use one of these services, confirm that it is connected and available through your tools.`;
    }
  } catch {
    // Non-fatal — proceed without integration context
  }

  // Pull recent chat summaries so Dante has continuity across
  // conversations. We grab the last 5 chats (excluding the current
  // one) with their most recent user+assistant exchange. This gives
  // the model a lightweight "what we've discussed recently" context
  // without burning excessive tokens.
  let recentChatsNote = "";
  try {
    const { data: recentChats } = await supabaseAdmin
      .from("dante_chats")
      .select("id, title, updated_at")
      .eq("workspace_id", profile.workspace_id)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .neq("id", chatId)
      .order("updated_at", { ascending: false })
      .limit(5);

    if (recentChats && recentChats.length > 0) {
      // For each recent chat, grab the last user message as a summary
      const chatSummaries: string[] = [];
      for (const rc of recentChats) {
        const { data: lastMsg } = await supabaseAdmin
          .from("dante_chat_messages")
          .select("role, content")
          .eq("chat_id", rc.id)
          .eq("role", "assistant")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const snippet = lastMsg?.content
          ? lastMsg.content.slice(0, 150).replace(/\n/g, " ") + (lastMsg.content.length > 150 ? "..." : "")
          : "";
        chatSummaries.push(`- "${rc.title}"${snippet ? `: ${snippet}` : ""}`);
      }
      recentChatsNote = `\n\n---\n\nRECENT CONVERSATIONS (for continuity — the user may refer back to these):\n${chatSummaries.join("\n")}`;
    }
  } catch {
    // Non-fatal — proceed without recent chat context
  }

  const systemPrompt = buildDanteSystemPrompt({ industry }) + timeNote + integrationsNote + recentChatsNote;

  // Per-vertical tool whitelist (Phase 3 W3.5). Defaults match
  // DEFAULT_TOOLS but the indirection is live so future vertical-
  // specific tools (mls.search for realtor; portfolio.summarize
  // for advisor) drop in here without route surgery.
  //
  // MCP servers from the vertical spec are merged in as `{ mcp: name }`
  // entries — the agent loop expands them into one tool def per
  // published tool. Workspaces that haven't approved a given server
  // get an empty catalog from the registry, so this is safe to list
  // unconditionally.
  const verticalSpec = getVerticalSpecLoose(industry);
  const builtinTools = verticalSpec.toolWhitelist.builtin as AgentToolEntry[];
  const mcpTools: AgentToolEntry[] = (verticalSpec.toolWhitelist.mcp_servers || []).map(
    (name) => ({ mcp: name }),
  );
  const tools: AgentToolEntry[] = [...builtinTools, ...mcpTools];

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
      console.log(`[ask] stream opened; runId=${runId} chatId=${chatId} tools=${builtinTools.length}+${mcpTools.length}mcp`);

      let assistantContent = "";
      let runError: string | null = null;

      try {
        const t0 = Date.now();
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
          // Processing-mode resolution context: the agent walks
          // workspace → contact → doc → chat (most restrictive
          // wins) to decide whether this loop runs against local
          // Hermes or cloud OpenAI. Doc context is unset here
          // because chat-level scoping doesn't bind to a single
          // doc; per-tool calls (vault.cite) carry their own
          // doc_id and would resolve at that layer.
          contactId: contextContactId,
          chatId,
          projectId: contextProjectId,
          accessibleProjectIds: isUserAdmin ? null : userProjectIds,
          forcedProcessingMode,
          imageBlocks: imageAttachments.length > 0
            ? imageAttachments
                .filter((a): a is typeof a & { image_data: string; media_type: string } =>
                  Boolean(a.image_data && a.media_type))
                .map((a) => ({
                  data: a.image_data,
                  media_type: a.media_type,
                }))
            : undefined,
          onEvent: (event: AgentEvent) => {
            // Strip emojis from any text the model produces mid-stream
            if ("summary" in event && event.summary) {
              event = { ...event, summary: stripEmojis(event.summary) };
            }
            send(event);
          },
        });
        console.log(`[ask] runAgent finished in ${Date.now() - t0}ms; runId=${runId}`);
        assistantContent = stripEmojis(result.text || "");
        // Empty-text without a thrown error has happened in prod —
        // typically the model called tools but never returned a final
        // answer message, or a streaming chunk got dropped. Don't let
        // the UI silently render "(no response)" with no signal.
        if (!assistantContent.trim()) {
          const stepCount = log.length;
          const lastStepName =
            (log[log.length - 1] as { step_name?: string } | undefined)
              ?.step_name || "(none)";
          runError = "empty_model_output";
          assistantContent = `Something went wrong — the AI didn't produce a response. This is usually a transient issue. Please try again, and if it keeps happening let us know.`;
          send({ type: "error", error: runError });
          console.warn(
            `[ask] empty model output after ${stepCount} steps; runId=${runId} chatId=${chatId} lastStep=${lastStepName}`,
          );
        }
      } catch (err) {
        runError = err instanceof Error ? err.message : "agent_failed";
        assistantContent = `I hit an error and couldn't complete that. ${runError}`;
        send({ type: "error", error: runError });
        console.error(
          `[ask] agent loop threw; runId=${runId} chatId=${chatId} err=${runError}`,
          err,
        );
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
      const { data: persisted, error: persistErr } = await supabaseAdmin
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

      if (persistErr) {
        console.error("[ask] assistant message persist failed:", persistErr.message);
      }

      // Audit: log every Dante chat completion so it surfaces in /audit.
      // Include the user prompt (truncated) and message ID so compliance
      // reviewers can see what was asked and trace to the full response.
      logAuditEvent({
        workspaceId: profile.workspace_id!,
        actorUserId: user.id,
        actorKind: "user",
        action: "dante.chat",
        entityType: "dante_chat",
        entityId: chatId,
        metadata: {
          deep,
          grounding_score: grounding.score,
          grounding_tier: grounding.tier,
          tools_used: (log as Array<{ step_name?: string }>)
            .map((s) => s.step_name)
            .filter(Boolean),
          model: "claude-sonnet-4-6",
          prompt_version: promptVersion,
          user_prompt: message.length > 500 ? message.slice(0, 497) + "..." : message,
          assistant_message_id: persisted?.id || null,
          response_length: assistantContent.length,
          citation_count: report?.counts?.total || 0,
          citation_valid: report?.counts?.valid || 0,
          ...(runError ? { error: runError } : {}),
        },
        request: req,
      });

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
      // later. One small llmComplete call. Failures here are silent;
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
  const verticalNoun = "commercial real estate professional";

  const result = await llmComplete({
    model: "claude-sonnet-4-6",
    responseFormat: { type: "json_object" },
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
    maxTokens: 400,
    feature: "ask.followups",
  });
  const raw = typeof result.message.content === "string" ? result.message.content : null;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { questions?: unknown };
    if (!Array.isArray(parsed.questions)) return [];
    return parsed.questions
      .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
      .slice(0, 4)
      .map((q) => stripEmojis(q.trim()));
  } catch {
    return [];
  }
}
