// /api/dante/web-scrape
//
// Streaming endpoint that uses Claude + the web_search server-side
// tool to research web content. Emits the same SSE shape as
// /api/dante/ask so streamClient.tsx works unchanged.
//
// Previous version used the Anthropic Managed Agent Sessions API
// (client.beta.sessions) which was hanging on session creation.
// This rewrite uses the standard Messages API with the web_search
// tool — Claude handles the search server-side within a single
// streaming call. No agent loop, no session lifecycle.

import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import Anthropic from "@anthropic-ai/sdk";
import { computeCostCents } from "@/lib/dante/model-router";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MODEL = "claude-sonnet-4-6";

const EMOJI_RE =
  /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}\u{1F7E0}-\u{1F7FF}\u{2B50}\u{2B55}\u{2934}\u{2935}\u{2B05}-\u{2B07}\u{2B1B}\u{2B1C}\u{2B06}\u{3030}\u{303D}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{231A}\u{231B}\u{25AA}\u{25AB}\u{25FB}-\u{25FE}\u{2611}\u{2614}\u{2615}\u{2648}-\u{2653}\u{267F}\u{2693}\u{2694}\u{2696}-\u{2699}\u{269B}\u{269C}\u{26A0}\u{26A1}\u{26AA}\u{26AB}\u{26B0}\u{26B1}\u{26BD}\u{26BE}\u{26C4}\u{26C5}\u{26CE}\u{26D4}\u{26EA}\u{26F2}\u{26F3}\u{26F5}\u{26FA}\u{26FD}]/gu;
function stripEmojis(text: string): string {
  return text.replace(EMOJI_RE, "").replace(/  +/g, " ");
}

const SYSTEM_PROMPT = `You are a web research assistant for Drift, a platform for commercial real estate professionals.

When asked to research a topic, URL, company, or data point:
1. Use the web_search tool to find relevant, current information.
2. Synthesize your findings into a clear, well-organized summary.
3. Cite every factual claim with its source URL.
4. If a specific URL or domain was mentioned, search for content on that site.

Focus on facts and data useful for CRE brokers, developers, and investors. Be thorough but concise.

CRITICAL RULE FOR VOID ANALYSIS: When the user asks for a void analysis, your job is to identify and report VOIDS -- which business categories are missing or underserved in the trade area. Report what IS there, what is NOT there, the demographics, the traffic, the competitive supply, and the rent comps. If you recommend tenants, you MUST first verify against real data that the recommended brand or category does not already exist within 3 miles of the site. Never recommend a business that already operates nearby -- that is a disqualifying error.`;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  return new Anthropic({ apiKey, timeout: 120_000 });
}

interface PostBody {
  message: string;
  chat_id?: string;
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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

  // Pull prior turns so multi-turn web research has context.
  const { data: priorMessages } = await supabaseAdmin
    .from("dante_chat_messages")
    .select("role, content")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true })
    .limit(20);
  const priorTurns = (priorMessages || []).slice(0, -1);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      send({ type: "chat_started", chat_id: chatId });

      let assistantContent = "";
      let runError: string | null = null;
      const trace: Array<{
        step_id: string;
        step_name: string;
        status: string;
        output?: unknown;
      }> = [];

      let inputTokens = 0;
      let outputTokens = 0;
      let cacheReadTokens = 0;
      let cacheCreationTokens = 0;

      try {
        const client = getClient();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        // Build message history: prior turns + current user message
        const apiMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
        for (const m of priorTurns) {
          if (m.role === "user" || m.role === "assistant") {
            apiMessages.push({ role: m.role, content: m.content });
          }
        }
        apiMessages.push({ role: "user", content: message });

        const apiStream = client.messages.stream({
          model: MODEL,
          max_tokens: 16384,
          system: SYSTEM_PROMPT,
          messages: apiMessages,
          tools: [
            { type: "web_search_20250305", name: "web_search", max_uses: 5 },
          ],
        } as any);

        const blockMeta = new Map<number, { type: string; id?: string; name?: string }>();
        let toolCount = 0;
        let currentToolInput = "";

        for await (const event of apiStream) {
          if (event.type === "message_start") {
            const usage = (event as any).message?.usage;
            if (usage) {
              inputTokens = usage.input_tokens || 0;
              cacheReadTokens = usage.cache_read_input_tokens || 0;
              cacheCreationTokens = usage.cache_creation_input_tokens || 0;
            }
          } else if (event.type === "content_block_start") {
            const block = (event as any).content_block;
            if (!block) continue;
            blockMeta.set((event as any).index, {
              type: block.type,
              id: block.id,
              name: block.name,
            });

            if (block.type === "server_tool_use") {
              toolCount++;
              currentToolInput = "";
              const subId = block.id || `ws_${toolCount}`;
              trace.push({
                step_id: subId,
                step_name: block.name || "web_search",
                status: "running",
              });
              send({
                type: "iteration_thinking",
                iteration: toolCount,
                summary: "Searching the web…",
              });
              send({
                type: "tool_start",
                sub_id: subId,
                tool_name: block.name || "web_search",
                args: {},
              });
            } else if (block.type === "web_search_tool_result") {
              const toolUseId = block.tool_use_id;
              const entry = trace.find(
                (t) => t.step_id === toolUseId && t.status === "running",
              );
              if (entry) {
                entry.status = "success";
                const results = Array.isArray(block.content) ? block.content : [];
                const count = results.filter(
                  (r: any) => r.type === "web_search_result",
                ).length;
                entry.output = { result_count: count };
                send({
                  type: "tool_end",
                  sub_id: entry.step_id,
                  tool_name: "web_search",
                  status: "success",
                  output: { result_count: count },
                });
                if (count > 0) {
                  send({
                    type: "iteration_thinking",
                    iteration: toolCount,
                    summary: `Found ${count} result${count === 1 ? "" : "s"}`,
                  });
                }
              }
            }
          } else if (event.type === "content_block_delta") {
            const delta = (event as any).delta;
            if (delta?.type === "text_delta" && delta.text) {
              assistantContent += delta.text;
            } else if (delta?.type === "input_json_delta") {
              currentToolInput += delta.partial_json || "";
            }
          } else if (event.type === "content_block_stop") {
            const meta = blockMeta.get((event as any).index);
            if (meta?.type === "server_tool_use" && currentToolInput) {
              try {
                const input = JSON.parse(currentToolInput);
                if (input.query) {
                  send({
                    type: "iteration_thinking",
                    iteration: toolCount,
                    summary: `Searching: "${input.query}"`,
                  });
                }
              } catch {
                /* partial JSON — ignored */
              }
            }
          } else if (event.type === "message_delta") {
            outputTokens = (event as any).usage?.output_tokens || 0;
          }
        }

        for (const t of trace) {
          if (t.status === "running") t.status = "success";
        }

        if (!assistantContent.trim()) {
          runError = "empty_model_output";
          assistantContent =
            "The search finished without returning anything. Try rephrasing your request.";
          send({ type: "error", error: runError });
        }
      } catch (err) {
        runError = err instanceof Error ? err.message : "scrape_failed";
        assistantContent =
          assistantContent || `Couldn't complete the search. ${runError}`;
        send({ type: "error", error: runError });
        console.error("[web-scrape] stream error:", err);
      }

      assistantContent = stripEmojis(assistantContent);

      const { data: persisted, error: persistErr } = await supabaseAdmin
        .from("dante_chat_messages")
        .insert({
          chat_id: chatId,
          role: "assistant",
          content: assistantContent,
          trace,
        })
        .select("id")
        .single();

      if (persistErr) {
        console.error("[web-scrape] assistant message persist failed:", persistErr.message);
      }

      send({
        type: "final",
        chat_id: chatId,
        message_id: persisted?.id,
        content: assistantContent,
        trace,
        error: runError,
      });

      if (profile.workspace_id && (inputTokens > 0 || outputTokens > 0)) {
        const totalInput = inputTokens + cacheReadTokens + cacheCreationTokens;
        const cost_cents = computeCostCents(MODEL, {
          inputTokens: totalInput,
          cachedInputTokens: cacheReadTokens,
          outputTokens,
        });
        void supabaseAdmin
          .from("dante_usage_ledger")
          .insert({
            workspace_id: profile.workspace_id,
            model: MODEL,
            input_tokens: totalInput,
            cached_input_tokens: cacheReadTokens,
            output_tokens: outputTokens,
            cost_cents,
            feature: "web_scrape",
          })
          .then((res) => {
            if (res.error)
              console.error("[web-scrape] ledger insert failed:", res.error.message);
          });
      }

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
