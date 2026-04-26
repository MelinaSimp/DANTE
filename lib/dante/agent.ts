// lib/dante/agent.ts
//
// The agent-loop runner. Used by the "agent" workflow node — model
// picks tools itself inside one node, looping until it has a final
// answer or hits max_steps.
//
// Tool adapters here are intentionally thin wrappers over executors
// that already exist in workflow-runner.ts (or in the helpers under
// lib/dante/memory and lib/dante/archive). The whole point of this
// module is to *not* introduce new capability — it just gives the
// model the keys to capabilities the runner already has.
//
// Logging contract: each iteration of the loop appends a StepLogEntry
// to the caller-supplied log array, so the run timeline shows
// `<agent-id>:0`, `<agent-id>:1`, ... entries with input/output for
// each tool call. Without this the agent node would be a black box,
// which defeats the whole "Dante feels too scripted" fix.
//
// Safety rails:
//   - max_steps hard cap of 20 (configurable below it)
//   - per-tool budgets: email.send max 3, http.fetch max 10
//   - simulate flag threads through to mutating tools
//   - only tools whitelisted in step.config.tools are exposed

import { supabaseAdmin } from "@/lib/supabase/admin";
import { searchMemory, formatMemoryHitsForPrompt } from "@/lib/dante/memory/search";
import { remember } from "@/lib/dante/memory/write";
import { searchArchive, formatHitsForPrompt } from "@/lib/dante/archive/search";
import { expandMcpTools, callMcpTool, parseMcpToolName } from "@/lib/mcp/registry";
import { runSkill } from "@/lib/dante/skills";
import type { MemoryKind } from "@/lib/dante/memory/types";
import type {
  AgentStep,
  AgentToolName,
  AgentToolEntry,
  StepLogEntry,
} from "./workflow-types";

// ── OpenAI tool definitions ───────────────────────────────────
// Standard JSON-Schema specs the chat-completions API accepts.
// Keeping each definition small and well-documented because the
// model's first-pass tool selection depends entirely on the
// description string here.

interface ToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: object;
  };
}

const TOOL_DEFS: Record<AgentToolName, ToolDef> = {
  "memory.search": {
    type: "function",
    function: {
      name: "memory_search",
      description:
        "Search the workspace's persistent memory store for facts, summaries, or transcript chunks (episodes) about a contact or topic. Use this FIRST whenever you need background on a client — facts (e.g. spouse's name, risk tolerance) live here.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Natural-language query." },
          contact_id: {
            type: "string",
            description: "Optional contact UUID to narrow to one subject.",
          },
          kinds: {
            type: "array",
            items: { type: "string", enum: ["fact", "summary", "episode"] },
            description: "Optional kind filter; default is all three.",
          },
          k: { type: "number", description: "Top-K (1-25, default 8)." },
        },
        required: ["query"],
      },
    },
  },
  "memory.write": {
    type: "function",
    function: {
      name: "memory_write",
      description:
        "Save a new fact, summary, or episode to memory. Only use when you've LEARNED something durable (e.g. user mentions wife's name; advisor confirms a preference). Don't write speculation.",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["fact", "summary", "episode"] },
          content: { type: "string" },
          contact_id: { type: "string", description: "Subject contact UUID." },
        },
        required: ["kind", "content"],
      },
    },
  },
  "archive.search": {
    type: "function",
    function: {
      name: "archive_search",
      description:
        "Vector-search the workspace's uploaded document archive (PDFs, contracts, policy docs). Use for grounded citations — outputs include page numbers.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          k: { type: "number", description: "Top-K (1-20, default 5)." },
          kind: { type: "string", description: "Optional ArchiveKind filter." },
        },
        required: ["query"],
      },
    },
  },
  "clients.query": {
    type: "function",
    function: {
      name: "clients_query",
      description:
        "Query the contacts (clients) table with simple equality filters. Returns id, name, email, phone, created_at.",
      parameters: {
        type: "object",
        properties: {
          filter: {
            type: "object",
            description: "Column→value equality filters.",
            additionalProperties: { type: "string" },
          },
          limit: { type: "number", description: "1-500, default 25." },
        },
      },
    },
  },
  "clients.update": {
    type: "function",
    function: {
      name: "clients_update",
      description: "Patch a single contact row by id.",
      parameters: {
        type: "object",
        properties: {
          contact_id: { type: "string" },
          patch: { type: "object", additionalProperties: true },
        },
        required: ["contact_id", "patch"],
      },
    },
  },
  "email.send": {
    type: "function",
    function: {
      name: "email_send",
      description:
        "Send an email via Resend. Use sparingly — there's a 3-send budget per agent run.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string" },
          subject: { type: "string" },
          html: { type: "string" },
          text: { type: "string" },
        },
        required: ["to", "subject"],
      },
    },
  },
  "http.fetch": {
    type: "function",
    function: {
      name: "http_fetch",
      description: "Fetch a URL. Budget: 10 calls/run.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string" },
          method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
          headers: { type: "object", additionalProperties: { type: "string" } },
          body: {},
        },
        required: ["url"],
      },
    },
  },
  "vault.cite": {
    type: "function",
    function: {
      name: "vault_cite",
      description:
        "Search the workspace's document vault and return citation-ready snippets you can quote inline in an email or memo. Returns an array of { marker, quote, source, page } objects — drop the marker into your draft and footnote `source` at the bottom.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          k: { type: "number", description: "Number of citations to return (1-10, default 3)." },
        },
        required: ["query"],
      },
    },
  },
  "skill.run": {
    type: "function",
    function: {
      name: "skill_run",
      description:
        "Invoke a named workspace skill (a stored agent recipe with a fixed tool set and prompt). Use for higher-level moves that have a registered skill, e.g. `draft_review_meeting_recap`. Returns whatever the skill returns.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Skill name." },
          input: { type: "object", description: "Skill-specific input args.", additionalProperties: true },
        },
        required: ["name"],
      },
    },
  },
};

// Inverse map: function-name string → AgentToolName. The OpenAI API
// gives us back the function name, but our config and budget tracking
// is keyed by the dotted form.
const NAME_TO_TOOL: Record<string, AgentToolName> = {
  memory_search: "memory.search",
  memory_write: "memory.write",
  archive_search: "archive.search",
  vault_cite: "vault.cite",
  clients_query: "clients.query",
  clients_update: "clients.update",
  email_send: "email.send",
  http_fetch: "http.fetch",
  skill_run: "skill.run",
};

// ── Tool executor adapters ────────────────────────────────────

interface AgentToolCtx {
  workspaceId: string;
  simulate: boolean;
  /**
   * Per-tool counters; the loop checks these against PER_TOOL_BUDGET
   * before dispatch and returns a budget-exceeded error if over.
   */
  budgetUsed: Record<AgentToolName, number>;
  /** Run id (for source_id when the agent writes to memory). */
  runId: string;
  /** Caller-supplied log array, for skill.run to append sub-entries. */
  log: StepLogEntry[];
  /** Step id of the calling agent — used as a prefix for skill sub-runs. */
  parentStepId: string;
}

const PER_TOOL_BUDGET: Partial<Record<AgentToolName, number>> = {
  "email.send": 3,
  "http.fetch": 10,
  "memory.write": 20,
  "skill.run": 5,        // skills can be expensive; 5 is generous
  "vault.cite": 10,
};

async function dispatchTool(
  toolName: AgentToolName,
  args: Record<string, unknown>,
  ctx: AgentToolCtx,
): Promise<unknown> {
  // Enforce per-tool budget BEFORE the call.
  const cap = PER_TOOL_BUDGET[toolName];
  if (cap != null && ctx.budgetUsed[toolName] >= cap) {
    return { error: `Tool budget exceeded for ${toolName} (cap ${cap})` };
  }
  ctx.budgetUsed[toolName] = (ctx.budgetUsed[toolName] || 0) + 1;

  switch (toolName) {
    case "memory.search": {
      const hits = await searchMemory({
        workspaceId: ctx.workspaceId,
        query: String(args.query || ""),
        contactId: args.contact_id ? String(args.contact_id) : undefined,
        kinds: Array.isArray(args.kinds) ? (args.kinds as MemoryKind[]) : undefined,
        k: Number(args.k) || 8,
      });
      return {
        hits,
        formatted: formatMemoryHitsForPrompt(hits),
      };
    }
    case "memory.write": {
      if (ctx.simulate) {
        return {
          simulated: true,
          would_have: { action: "memory.write", kind: args.kind, content: args.content },
        };
      }
      const result = await remember({
        workspaceId: ctx.workspaceId,
        kind: String(args.kind) as MemoryKind,
        content: String(args.content || ""),
        subjectContactId: args.contact_id ? String(args.contact_id) : undefined,
        sourceKind: "workflow",
        sourceId: ctx.runId,
      });
      return result;
    }
    case "archive.search": {
      const hits = await searchArchive({
        workspaceId: ctx.workspaceId,
        query: String(args.query || ""),
        k: Number(args.k) || 5,
        kindFilter: args.kind ? String(args.kind) : undefined,
      });
      return { hits, formatted: formatHitsForPrompt(hits) };
    }
    case "clients.query": {
      let q = supabaseAdmin
        .from("contacts")
        .select("id, name, email, phone, created_at")
        .eq("workspace_id", ctx.workspaceId);
      const filter = (args.filter as Record<string, string>) || {};
      for (const [k, v] of Object.entries(filter)) {
        if (v == null || v === "") continue;
        q = q.eq(k, v);
      }
      q = q.limit(Math.min(Math.max(Number(args.limit) || 25, 1), 500));
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { contacts: data || [], count: data?.length ?? 0 };
    }
    case "clients.update": {
      if (ctx.simulate) {
        return {
          simulated: true,
          would_have: { action: "clients.update", contact_id: args.contact_id, patch: args.patch },
        };
      }
      const { data, error } = await supabaseAdmin
        .from("contacts")
        .update(args.patch as Record<string, unknown>)
        .eq("id", String(args.contact_id))
        .eq("workspace_id", ctx.workspaceId)
        .select()
        .single();
      if (error) return { error: error.message };
      return { contact: data };
    }
    case "email.send": {
      if (ctx.simulate) {
        return {
          simulated: true,
          would_have: { action: "email.send", to: args.to, subject: args.subject },
        };
      }
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) return { error: "RESEND_API_KEY not configured" };
      const from = process.env.RESEND_FROM_EMAIL || "noreply@driftai.studio";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: args.to,
          subject: args.subject,
          html: args.html,
          text: args.text,
        }),
      });
      const json = await res.json();
      if (!res.ok) return { error: json?.message || `Resend ${res.status}` };
      return { email_id: json.id };
    }
    case "http.fetch": {
      const method = String(args.method || "GET").toUpperCase();
      if (ctx.simulate && method !== "GET") {
        return {
          simulated: true,
          would_have: { action: "http.fetch", method, url: args.url },
        };
      }
      const res = await fetch(String(args.url), {
        method,
        headers: {
          "Content-Type": "application/json",
          ...((args.headers as Record<string, string>) || {}),
        },
        body:
          args.body !== undefined && method !== "GET"
            ? typeof args.body === "string"
              ? (args.body as string)
              : JSON.stringify(args.body)
            : undefined,
      });
      const text = await res.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
      return { status: res.status, ok: res.ok, body: parsed };
    }
    case "vault.cite": {
      // Wraps archive.search but reformats hits so the model can drop
      // them straight into a draft. Markers like [v1], [v2] are stable
      // within a single tool call so the model can reference them in
      // the email body without re-listing the source.
      const hits = await searchArchive({
        workspaceId: ctx.workspaceId,
        query: String(args.query || ""),
        k: Math.min(Math.max(Number(args.k) || 3, 1), 10),
      });
      return {
        citations: hits.map((h, i) => ({
          marker: `[v${i + 1}]`,
          quote: h.content.trim().slice(0, 400),
          source: h.document_title,
          page: h.page_number,
          document_id: h.document_id,
        })),
      };
    }
    case "skill.run": {
      const skillName = String(args.name || "");
      const skillInput = (args.input as Record<string, unknown>) || {};
      if (!skillName) return { error: "skill.run: missing name" };
      try {
        const result = await runSkill({
          workspaceId: ctx.workspaceId,
          name: skillName,
          input: skillInput,
          simulate: ctx.simulate,
          runId: ctx.runId,
          log: ctx.log,
          parentStepId: ctx.parentStepId,
        });
        return result;
      } catch (err) {
        return { error: err instanceof Error ? err.message : "skill error" };
      }
    }
  }
}

// ── The loop ──────────────────────────────────────────────────

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export type AgentEvent =
  | { type: "tool_start"; sub_id: string; tool_name: string; args: Record<string, unknown> }
  | { type: "tool_end"; sub_id: string; tool_name: string; status: "success" | "error"; output: unknown; error?: string }
  | { type: "iteration_thinking"; iteration: number };

export interface AgentRunInput {
  step: AgentStep;
  workspaceId: string;
  simulate: boolean;
  runId: string;
  /**
   * Caller-supplied log array. The loop appends one entry per
   * tool call so the run timeline shows the full reasoning trace.
   */
  log: StepLogEntry[];
  /**
   * Optional callback fired at each agent-loop boundary. Used by the
   * /api/dante/ask SSE handler to push tool calls to the client live
   * — without this, the chat UI sits silent for ~10s before the
   * full response lands. Synchronous or async; we await each call so
   * the stream stays ordered with the actual loop progress.
   */
  onEvent?: (event: AgentEvent) => void | Promise<void>;
}

export interface AgentRunResult {
  /** The agent's final assistant message — what the rest of the
   *  graph reads via {{steps.<id>.text}} or .output. */
  text: string;
  output: unknown;
  steps_taken: number;
  /** True if the loop exited because of max_steps rather than a
   *  natural final answer. */
  truncated: boolean;
}

const HARD_MAX_STEPS = 20;

export async function runAgent(input: AgentRunInput): Promise<AgentRunResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const cfg = input.step.config;
  const entries: AgentToolEntry[] = cfg.tools || [];

  // Split built-ins from MCP entries. Built-ins use TOOL_DEFS; MCP
  // entries get expanded via the registry so each server's catalog
  // shows up as one OpenAI tool def per published tool.
  const builtinNames: AgentToolName[] = [];
  const mcpServers: string[] = [];
  for (const e of entries) {
    if (typeof e === "string") builtinNames.push(e);
    else if (e && typeof e === "object" && "mcp" in e) mcpServers.push(e.mcp);
  }

  const allowedTools = new Set<AgentToolName>(builtinNames);
  const builtinDefs: ToolDef[] = builtinNames.map((t) => TOOL_DEFS[t]).filter(Boolean);
  const mcpDefs = await expandMcpTools(input.workspaceId, mcpServers);
  const tools: ToolDef[] = [...builtinDefs, ...mcpDefs];

  const maxSteps = Math.min(Math.max(Number(cfg.max_steps) || 8, 1), HARD_MAX_STEPS);
  const model = cfg.model || "gpt-4o";

  const messages: ChatMessage[] = [];
  const systemPrompt = [
    cfg.system?.trim() || "You are Dante, an AI assistant for a financial advisor.",
    "",
    "You operate inside a workflow as an agent loop. You can call the listed tools to gather information or take actions. When you have enough to answer the objective, return a plain assistant message with the final answer — do NOT call further tools at that point.",
    cfg.output_schema
      ? `Final answer must be a JSON object validating against this schema: ${JSON.stringify(cfg.output_schema)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: cfg.objective });

  const ctx: AgentToolCtx = {
    workspaceId: input.workspaceId,
    simulate: input.simulate,
    runId: input.runId,
    log: input.log,
    parentStepId: input.step.id,
    budgetUsed: {
      "memory.search": 0,
      "memory.write": 0,
      "archive.search": 0,
      "vault.cite": 0,
      "clients.query": 0,
      "clients.update": 0,
      "email.send": 0,
      "http.fetch": 0,
      "skill.run": 0,
    },
  };

  let stepIdx = 0;
  let finalText = "";
  let iterationIdx = 0;

  // Tiny helper so callsites stay readable. Swallows handler errors
  // — a broken stream consumer should never abort the agent loop.
  const fire = async (event: AgentEvent) => {
    if (!input.onEvent) return;
    try {
      await input.onEvent(event);
    } catch (err) {
      console.warn("[agent] onEvent handler threw:", err);
    }
  };

  while (stepIdx < maxSteps) {
    await fire({ type: "iteration_thinking", iteration: iterationIdx++ });
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        // tool_choice="auto" is the default; explicit for clarity.
        tool_choice: tools.length > 0 ? "auto" : undefined,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`OpenAI ${res.status}: ${errBody.slice(0, 400)}`);
    }
    const json = (await res.json()) as {
      choices: Array<{
        message: ChatMessage;
        finish_reason: string;
      }>;
    };

    const choice = json.choices?.[0];
    if (!choice) throw new Error("OpenAI returned no choices");
    const assistantMsg = choice.message;
    messages.push(assistantMsg);

    // No tool calls → the model has produced a final answer. Done.
    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      finalText = (assistantMsg.content as string) || "";
      break;
    }

    // Otherwise dispatch each tool call. The loop appends a log
    // entry per call BEFORE the actual call so a thrown error still
    // shows up in the timeline (we patch the entry afterward).
    for (const call of assistantMsg.tool_calls) {
      const toolName = NAME_TO_TOOL[call.function.name];
      const started_at = new Date().toISOString();
      const subId = `${input.step.id}:${stepIdx}`;

      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(call.function.arguments || "{}");
      } catch {
        // Model returned malformed JSON — surface to the model as a
        // tool error rather than crashing the run.
      }

      // Fire tool_start before dispatch so the client can render
      // "Searching memory..." while we're actually doing it.
      await fire({
        type: "tool_start",
        sub_id: subId,
        tool_name: call.function.name,
        args: parsedArgs,
      });

      let toolOutput: unknown;
      let errored = false;
      let errorMessage = "";

      // Three dispatch paths:
      //   1. Built-in tool name in our whitelist → dispatchTool
      //   2. MCP-namespaced name (mcp__server__tool) and the server
      //      was in the configured MCP entries → callMcpTool
      //   3. Anything else → reject as not whitelisted
      const mcpParsed = parseMcpToolName(call.function.name);
      if (toolName && allowedTools.has(toolName)) {
        try {
          toolOutput = await dispatchTool(toolName, parsedArgs, ctx);
        } catch (err) {
          errored = true;
          errorMessage = err instanceof Error ? err.message : String(err);
          toolOutput = { error: errorMessage };
        }
      } else if (mcpParsed && mcpServers.includes(mcpParsed.server)) {
        try {
          toolOutput = await callMcpTool(
            input.workspaceId,
            mcpParsed.server,
            mcpParsed.tool,
            parsedArgs,
          );
        } catch (err) {
          errored = true;
          errorMessage = err instanceof Error ? err.message : String(err);
          toolOutput = { error: errorMessage };
        }
      } else {
        toolOutput = { error: `Tool not whitelisted: ${call.function.name}` };
        errored = true;
        errorMessage = `Tool not whitelisted: ${call.function.name}`;
      }

      input.log.push({
        step_id: subId,
        step_type: "agent",
        step_name: `${input.step.name || "agent"} → ${call.function.name}`,
        status: errored ? "error" : "success",
        started_at,
        finished_at: new Date().toISOString(),
        output: { args: parsedArgs, result: toolOutput },
        error: errored ? errorMessage : undefined,
      });

      await fire({
        type: "tool_end",
        sub_id: subId,
        tool_name: call.function.name,
        status: errored ? "error" : "success",
        output: toolOutput,
        error: errored ? errorMessage : undefined,
      });

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(toolOutput).slice(0, 16000), // cap to keep ctx bounded
      });
      stepIdx += 1;
      if (stepIdx >= maxSteps) break;
    }
  }

  const truncated = stepIdx >= maxSteps && !finalText;

  // If we ran out of steps without a final answer, force one last
  // pass that explicitly forbids tools so the model summarizes what
  // it has. This is the "graceful degradation" path the design doc
  // talks about — partial answer beats blank output.
  if (truncated) {
    messages.push({
      role: "user",
      content:
        "You've hit your tool-call budget. Give your best final answer using only what you've gathered so far. Do not call any more tools.",
    });
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, tool_choice: "none" }),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        choices: Array<{ message: ChatMessage }>;
      };
      finalText = (json.choices?.[0]?.message?.content as string) || "";
    }
  }

  // Parse against output_schema if requested. We do a single permissive
  // pass — strict JSON-schema validation is a follow-up; for now we just
  // try JSON.parse() and surface the parsed object. If it fails, the
  // raw text still ships in `text` so callers can recover.
  let output: unknown = { text: finalText };
  if (cfg.output_schema) {
    try {
      const parsed = JSON.parse(finalText);
      output = parsed;
    } catch {
      output = { text: finalText, parse_error: "Output did not parse as JSON" };
    }
  } else {
    output = { text: finalText };
  }

  return {
    text: finalText,
    output,
    steps_taken: stepIdx,
    truncated,
  };
}
