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
import {
  searchRegulatoryCorpus,
  formatRegulatoryHitsForPrompt,
} from "@/lib/dante/regulatory/search";
import {
  agenticSearchRegulatoryCorpus,
  formatAgenticHitsForPrompt,
} from "@/lib/dante/regulatory/agentic-search";
import { calculateRmd } from "@/lib/dante/calculators/rmd";
import {
  detectInconsistencies,
  formatInconsistenciesForPrompt,
} from "@/lib/dante/tools/inconsistency-detect";
import { expandMcpTools, callMcpTool, parseMcpToolName } from "@/lib/mcp/registry";
import { runSkill } from "@/lib/dante/skills";
import { generateWorkflow } from "@/lib/dante/workflow-ai";
import { getWorkspaceModel } from "@/lib/dante/model";
import { complete as llmComplete } from "@/lib/llm/client";
import {
  resolveProcessingMode,
  logResolution,
} from "@/lib/llm/processing-mode";
import { detectAutoLocalMode } from "@/lib/dante/auto-mode";
import type { LlmMessage, LlmToolDef } from "@/lib/llm/types";
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
  "regulatory.search": {
    type: "function",
    function: {
      name: "regulatory_search",
      description:
        "Vector-search Drift's workspace-shared regulatory corpus — SEC litigation releases, IRS rulings, DOL ERISA opinions, HUD fair-housing enforcement, etc. Use this when the user asks 'what does the SEC say about X', 'has anyone been charged for Y', 'is Z compliant', or anytime your answer would benefit from a primary-source regulatory citation. Cite results inline as [reg:N] and let the user click through to the canonical source URL. Industry filtering is automatic based on the workspace vertical (financial advisor sees SEC/IRS/DOL/FINRA; realtor sees HUD/state RE plus shared SEC/FTC). Set `agentic: true` for hard or open-ended questions where the first query might not surface everything — the search will iterate (up to 4 rounds), refining the query against gaps in the results before returning. Costs slightly more but typically lifts recall noticeably; use it for the harder questions, not every lookup.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Natural-language query — describe the situation or rule, not just keywords." },
          k: { type: "number", description: "Top-K (1-25, default 5)." },
          agentic: { type: "boolean", description: "Enable iterative refinement (3-4 rounds, refines the query against gaps). Default false. Use for hard questions; skip for direct lookups." },
        },
        required: ["query"],
      },
    },
  },
  "inconsistency.detect": {
    type: "function",
    function: {
      name: "inconsistency_detect",
      description:
        "Compare 2-8 vault documents for contradictions on a specific question. Use this when the user asks 'are these consistent?', 'do these match?', 'is there a beneficiary mismatch across X / Y / Z', or any 'compare these docs' question. Harvey explicitly says it cannot detect inconsistencies across multiple documents — this tool exists specifically to do that. Returns structured findings with severity (high/medium/low), per-document quotes, and recommended actions. Use vault.cite or archive.search FIRST to identify which doc IDs are relevant; pass them in. The tool only flags real contradictions — empty findings means the docs are consistent on the question, not that the tool is broken.",
      parameters: {
        type: "object",
        properties: {
          doc_ids: {
            type: "array",
            items: { type: "string" },
            description: "Vault document IDs (vault_items.id, UUIDs). 2-8 docs. Identify these via vault.cite or archive.search first.",
          },
          question: {
            type: "string",
            description: "The dimension to compare on — 'beneficiary designations', 'fee schedules', 'termination clauses', 'distribution standard', etc. Without this the tool has to guess what to compare.",
          },
        },
        required: ["doc_ids", "question"],
      },
    },
  },
  "rmd.calculate": {
    type: "function",
    function: {
      name: "rmd_calculate",
      description:
        "Compute a Required Minimum Distribution (RMD) deterministically. Returns the exact dollar amount, the IRS table used (Uniform Lifetime / Joint & Last Survivor / Single Life), the divisor, citations to IRS Pub 590-B and Treas. Reg. §1.401(a)(9), and any caveats (inherited-IRA 10-year rule, year-of-death RMD, EDB stretch). Use this whenever the user asks 'what's the RMD', 'how much does X have to take this year', or for inherited-IRA edge cases. Do NOT estimate or compute manually — call this tool, then quote the explanation and citations verbatim. The tool handles SECURE Act 1.0 + 2.0 (RMD age 73 from 2023, 75 from 2033), spousal-beneficiary >10y younger Joint table selection, and inherited-IRA branches. For account_kind='inherited_ira_non_edb' the tool flags the 10-year rule and whether annual RMDs apply during years 1-9.",
      parameters: {
        type: "object",
        properties: {
          date_of_birth: { type: "string", description: "Account holder's DOB (YYYY-MM-DD). For inherited IRAs, this is the BENEFICIARY's DOB; pass decedent_date_of_birth separately." },
          tax_year: { type: "number", description: "Tax year for which we're computing the RMD (e.g. 2026)." },
          prior_year_end_balance: { type: "number", description: "Account balance on Dec 31 of the prior year, in dollars." },
          account_kind: { type: "string", enum: ["traditional_ira", "sep_ira", "simple_ira", "401k", "403b", "457b", "inherited_ira_edb", "inherited_ira_non_edb"] },
          beneficiary_kind: { type: "string", enum: ["spouse_sole", "spouse_sole_younger_10", "non_spouse", "trust", "estate", "none"], description: "Optional. Drives Joint & Last Survivor selection when spouse_sole_younger_10." },
          spouse_date_of_birth: { type: "string", description: "Required when beneficiary_kind=spouse_sole_younger_10." },
          decedent_date_of_death: { type: "string", description: "Required for inherited_ira_* account_kind. YYYY-MM-DD." },
          decedent_date_of_birth: { type: "string", description: "Inherited-IRA only — needed to determine if decedent had reached RBD before death." },
        },
        required: ["date_of_birth", "tax_year", "prior_year_end_balance", "account_kind"],
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
  "reminder.schedule": {
    type: "function",
    function: {
      name: "reminder_schedule",
      description:
        "Schedule a one-shot self-reminder for the user via SMS / iMessage. CALL THIS IMMEDIATELY when the user asks to be reminded at any time — do NOT ask the user to confirm time or content first. Resolve relative phrasings ('in 2 minutes', 'tomorrow at 3pm', 'end of day') against the current UTC time yourself, assuming the user's local timezone if relevant, and just fire the call. After the tool returns, summarize what you scheduled (e.g. 'Set — I'll text you at 2:56 PM ET'). Only ask the user to clarify if the time is genuinely ambiguous (e.g. 'remind me later' with no specific window). v1 supports recipient='self' only; for client-facing reminders refuse and explain that supervisor review wiring isn't built yet.",
      parameters: {
        type: "object",
        properties: {
          when: {
            type: "string",
            description:
              "ISO 8601 UTC timestamp the reminder should fire. Compute this BEFORE calling — do not pass a relative phrasing. Must be at least 30 seconds in the future.",
          },
          body: {
            type: "string",
            description:
              "The text the user will receive. First-person from the user's perspective, short, action-oriented ('Read rent rolls in Medina before first meeting').",
          },
          recipient: {
            type: "string",
            enum: ["self"],
            description:
              "Always 'self' in v1. The reminder is delivered to the authenticated user's sms_phone on file.",
          },
          channel: {
            type: "string",
            enum: ["sms"],
            description:
              "Always 'sms' in v1. SendBlue handles iMessage/SMS routing automatically.",
          },
        },
        required: ["when", "body", "recipient"],
      },
    },
  },
  "workflow.propose": {
    type: "function",
    function: {
      name: "workflow_propose",
      description:
        "Draft a persistent workflow for the user to accept or decline. CALL THIS whenever the user asks for recurring monitoring, future-dated outreach, or 'let me know if X' — anything that needs to keep working when the app is closed. The workflow is created with enabled=false and proposal_state='pending'; it does NOT fire until the user accepts it on the dashboard or in /reminders. Don't promise to do persistent things yourself — you only run while the app is open. Use reminder.schedule for one-shot self-SMS; use workflow.propose for everything else (recurring, multi-step, conditional, client-facing).",
      parameters: {
        type: "object",
        properties: {
          intent: {
            type: "string",
            description:
              "Plain-English description of what the workflow should do, written for the materializer. Include trigger frequency ('every Monday at 9am', 'on 2026-12-31', 'when a webhook fires'), action(s) ('email Mrs. Chen with subject ... and body ...'), and any condition logic. Do NOT pass the user's raw question — translate it into an unambiguous spec the materializer can turn into a graph.",
          },
          summary: {
            type: "string",
            description:
              "One short sentence the user will see as the proposal title in /reminders. ≤80 chars. E.g. 'Weekly check-in with Mrs. Chen until RMD is filed.'",
          },
        },
        required: ["intent", "summary"],
      },
    },
  },

  "file_index.search": {
    type: "function",
    function: {
      name: "file_index_search",
      description:
        "Search the workspace's file index across all connected file servers. Returns file metadata (name, path, size, extension, last modified) and ingest status. Use this when the user references a file by name, asks you to find a document on their file server, or when you need to locate a file before reading its contents. Files marked 'indexed' have metadata only — call file_index.ingest to retrieve their full content into the vault so you can search it.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query — matches against filename and path. Use keywords the filename would contain.",
          },
          extensions: {
            type: "array",
            items: { type: "string" },
            description: "Optional extension filter, e.g. ['pdf', 'docx']. Omit to search all file types.",
          },
          limit: {
            type: "number",
            description: "Max results (1-50, default 10).",
          },
        },
        required: ["query"],
      },
    },
  },

  "file_index.ingest": {
    type: "function",
    function: {
      name: "file_index_ingest",
      description:
        "Request on-demand content retrieval for an indexed file. Use AFTER file_index.search finds a relevant file with ingest_status='indexed' (metadata only). The system requests the file content from the user's local file watcher, extracts text, and ingests into the vault. Returns the vault_item_id once ready, which you can then search with vault.cite. May take 10-30 seconds for the watcher to extract and upload the content. If the file is already ingested, returns the existing vault_item_id immediately.",
      parameters: {
        type: "object",
        properties: {
          index_entry_id: {
            type: "string",
            description: "The watched_file_index ID from file_index.search results.",
          },
        },
        required: ["index_entry_id"],
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
  regulatory_search: "regulatory.search",
  rmd_calculate: "rmd.calculate",
  inconsistency_detect: "inconsistency.detect",
  vault_cite: "vault.cite",
  clients_query: "clients.query",
  clients_update: "clients.update",
  email_send: "email.send",
  http_fetch: "http.fetch",
  skill_run: "skill.run",
  reminder_schedule: "reminder.schedule",
  workflow_propose: "workflow.propose",
  file_index_search: "file_index.search",
  file_index_ingest: "file_index.ingest",
};

// ── Tool executor adapters ────────────────────────────────────

interface AgentToolCtx {
  workspaceId: string;
  /** Optional authenticated user driving the run. See AgentRunInput. */
  userId?: string;
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
  /** When set, archive.search and vault.cite scope to this project. */
  projectId?: string;
  /** For non-admin users, the project IDs they can access. null = unrestricted. */
  accessibleProjectIds?: string[] | null;
}

const PER_TOOL_BUDGET: Partial<Record<AgentToolName, number>> = {
  "email.send": 3,
  "http.fetch": 10,
  "memory.write": 20,
  "skill.run": 5,        // skills can be expensive; 5 is generous
  "vault.cite": 10,
  "reminder.schedule": 5, // bound the runaway-reminders failure mode
  "regulatory.search": 8, // bounded: a single answer rarely needs >3-4 SEC/IRS lookups
  "rmd.calculate": 10,    // a multi-account briefing might compute several at once
  "inconsistency.detect": 4, // expensive (full doc content in prompt); rarely needs more
  "workflow.propose": 2,  // one ask = one proposal; cap covers a "and also..." follow-up
  "file_index.search": 5,
  "file_index.ingest": 3,
};

/**
 * Recipient allowlist for the email.send tool. Returns true iff the
 * address belongs to a contact in the workspace or to the
 * authenticated user driving the run. Used to block prompt-injection-
 * driven exfiltration to attacker-controlled addresses.
 */
async function isAllowedEmailRecipient(
  toLower: string,
  ctx: AgentToolCtx,
): Promise<boolean> {
  // 1. Authenticated user's own email (via auth.users — email lives
  //    there, not on the public profiles table).
  if (ctx.userId) {
    try {
      const { data } = await supabaseAdmin.auth.admin.getUserById(ctx.userId);
      const userEmail = data.user?.email;
      if (userEmail && userEmail.toLowerCase() === toLower) return true;
    } catch {
      // fall through — auth lookup failure shouldn't grant access,
      // but it also shouldn't block a legitimate contact recipient.
    }
  }
  // 2. Known contact in this workspace.
  const { data: contact } = await supabaseAdmin
    .from("contacts")
    .select("id")
    .eq("workspace_id", ctx.workspaceId)
    .ilike("email", toLower)
    .limit(1)
    .maybeSingle();
  return Boolean(contact);
}

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
      const requestedProject = args.project_id ? String(args.project_id) : ctx.projectId;
      if (requestedProject && ctx.accessibleProjectIds && !ctx.accessibleProjectIds.includes(requestedProject)) {
        return { hits: [], formatted: "(no access to this project)" };
      }
      let hits = await searchArchive({
        workspaceId: ctx.workspaceId,
        query: String(args.query || ""),
        k: Number(args.k) || 5,
        kindFilter: args.kind ? String(args.kind) : undefined,
        projectId: requestedProject,
      });
      if (!requestedProject && ctx.accessibleProjectIds) {
        const allowed = new Set(ctx.accessibleProjectIds);
        hits = hits.filter((h) => !h.project_id || allowed.has(h.project_id));
      }
      return { hits, formatted: formatHitsForPrompt(hits) };
    }
    case "regulatory.search": {
      // Industry filter so a realtor workspace doesn't get FINRA OBA
      // guidance and an advisor workspace doesn't get HUD fair-
      // housing case law. One small lookup per call, bounded by the
      // tool budget (8) so cost is negligible.
      const { data: ws } = await supabaseAdmin
        .from("workspaces")
        .select("industry")
        .eq("id", ctx.workspaceId)
        .maybeSingle();
      const industry =
        (ws as { industry?: string | null } | null)?.industry === "real_estate"
          ? "real_estate"
          : "financial_advisor";
      const k = Number(args.k) || 5;
      // When the agent flags this as a hard question, run the
      // iterative refinement loop (Patrick's call: free recall lift
      // before custom embeddings ever land). Default path remains
      // the single-shot search.
      if (args.agentic === true) {
        const result = await agenticSearchRegulatoryCorpus({
          query: String(args.query || ""),
          industry,
          k,
        });
        return {
          hits: result.hits,
          rounds: result.rounds,
          stop_reason: result.stop_reason,
          formatted: formatAgenticHitsForPrompt(result),
        };
      }
      const hits = await searchRegulatoryCorpus({
        query: String(args.query || ""),
        industry,
        k,
      });
      return { hits, formatted: formatRegulatoryHitsForPrompt(hits) };
    }
    case "inconsistency.detect": {
      // Cross-document contradiction detection — the thing Harvey
      // explicitly disclaims. See lib/dante/tools/inconsistency-
      // detect.ts for the design rationale.
      try {
        const docIds = Array.isArray(args.doc_ids)
          ? (args.doc_ids as unknown[]).map((x) => String(x)).filter(Boolean)
          : [];
        const question = String(args.question || "");
        const result = await detectInconsistencies({
          workspaceId: ctx.workspaceId,
          doc_ids: docIds,
          question,
        });
        return {
          ...result,
          formatted: formatInconsistenciesForPrompt(result),
        };
      } catch (err) {
        return {
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }
    case "rmd.calculate": {
      // Deterministic math — no LLM, no DB, just IRS-table lookup.
      // Wrap in try/catch so missing-table-entry errors surface as
      // structured tool errors instead of crashing the agent loop.
      try {
        const result = calculateRmd({
          date_of_birth: String(args.date_of_birth || ""),
          tax_year: Number(args.tax_year),
          prior_year_end_balance: Number(args.prior_year_end_balance) || 0,
          account_kind: String(args.account_kind) as Parameters<
            typeof calculateRmd
          >[0]["account_kind"],
          beneficiary_kind: args.beneficiary_kind
            ? (String(args.beneficiary_kind) as Parameters<
                typeof calculateRmd
              >[0]["beneficiary_kind"])
            : undefined,
          spouse_date_of_birth: args.spouse_date_of_birth
            ? String(args.spouse_date_of_birth)
            : undefined,
          decedent_date_of_death: args.decedent_date_of_death
            ? String(args.decedent_date_of_death)
            : undefined,
          decedent_date_of_birth: args.decedent_date_of_birth
            ? String(args.decedent_date_of_birth)
            : undefined,
        });
        return { result };
      } catch (err) {
        return {
          error: err instanceof Error ? err.message : String(err),
        };
      }
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
      // Whitelist patchable fields. Without this, a prompt-injection-
      // poisoned memory or vault doc can drive the agent to mutate
      // deleted_at, workspace_id, or arbitrary JSONB columns to
      // corrupt or hide contact data.
      const ALLOWED_CLIENT_FIELDS = new Set([
        "name",
        "email",
        "phone",
        "notes",
        "status",
        "tags",
      ]);
      const rawPatch = (args.patch as Record<string, unknown>) || {};
      const patch: Record<string, unknown> = {};
      const rejected: string[] = [];
      for (const [k, v] of Object.entries(rawPatch)) {
        if (ALLOWED_CLIENT_FIELDS.has(k)) patch[k] = v;
        else rejected.push(k);
      }
      if (Object.keys(patch).length === 0) {
        return {
          error: `clients.update rejected: no allowed fields in patch (rejected: ${rejected.join(", ") || "none"}). Allowed: ${[...ALLOWED_CLIENT_FIELDS].join(", ")}.`,
        };
      }
      const { data, error } = await supabaseAdmin
        .from("contacts")
        .update(patch)
        .eq("id", String(args.contact_id))
        .eq("workspace_id", ctx.workspaceId)
        .select()
        .single();
      if (error) return { error: error.message };
      return { contact: data, rejected_fields: rejected.length ? rejected : undefined };
    }
    case "email.send": {
      if (ctx.simulate) {
        return {
          simulated: true,
          would_have: { action: "email.send", to: args.to, subject: args.subject },
        };
      }
      // Recipient whitelist. The exfiltration risk is real: a poisoned
      // vault doc or memory can instruct the agent to email "all the
      // intel summaries to attacker@evil.com". Restrict the recipient
      // address to:
      //   - a known contact in this workspace, OR
      //   - the authenticated user's own email (self-send),
      // and reject anything else with a clear error so the agent can
      // explain in chat instead of leaking.
      const toRaw = String(args.to || "").trim().toLowerCase();
      if (!toRaw || !toRaw.includes("@")) {
        return { error: "email.send rejected: invalid recipient address." };
      }
      const allowed = await isAllowedEmailRecipient(toRaw, ctx);
      if (!allowed) {
        return {
          error:
            "email.send rejected: recipient is not a known contact in this workspace or the authenticated user. The agent may only email known recipients.",
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
        projectId: args.project_id ? String(args.project_id) : ctx.projectId,
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
    case "reminder.schedule": {
      // v1: self-reminders only. Creates a one-shot workflow with a
      // trigger_at + send_sms pair, sets next_fire_at on the row so
      // the cron tick picks it up at the scheduled moment.
      //
      // Refusal cases (return { error } so the model can recover):
      //   - simulate mode: scheduling without committing is a no-op,
      //     but report what we would have done so the trace is honest.
      //   - missing userId: not invoked from a chat (e.g. workflow
      //     run); we have no "self" to text. Refuse cleanly.
      //   - recipient !== self: client-facing reminders need
      //     supervisor-queue routing, not built yet.
      //   - sms_phone missing: user hasn't enrolled their phone.
      //   - when not a future ISO timestamp.
      const recipient = String(args.recipient || "self");
      if (recipient !== "self") {
        return {
          error:
            "reminder.schedule v1 supports recipient='self' only. Client-facing reminders need principal review wiring (not yet built). Tell the user this and offer to draft an email or memo instead.",
        };
      }
      const channel = String(args.channel || "sms");
      if (channel !== "sms") {
        return { error: "reminder.schedule v1 supports channel='sms' only." };
      }
      const whenStr = String(args.when || "");
      const when = new Date(whenStr);
      if (!whenStr || Number.isNaN(when.getTime())) {
        return { error: "reminder.schedule: 'when' must be an ISO 8601 timestamp." };
      }
      if (when.getTime() <= Date.now() + 30_000) {
        return {
          error:
            "reminder.schedule: 'when' must be at least 30 seconds in the future.",
        };
      }
      const body = String(args.body || "").trim();
      if (!body) return { error: "reminder.schedule: 'body' required." };

      if (!ctx.userId) {
        return {
          error:
            "reminder.schedule: no authenticated user in this run, cannot schedule a self-reminder. Tell the user this needs to be requested from a Dante chat, not a workflow.",
        };
      }

      // Look up the user's enrolled phone. profiles.sms_phone is set
      // via /settings → Phone enrollment + verification flow.
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("sms_phone, full_name")
        .eq("id", ctx.userId)
        .maybeSingle();
      const phone = (prof as { sms_phone?: string } | null)?.sms_phone;
      if (!phone) {
        return {
          error:
            "reminder.schedule: this user hasn't enrolled an SMS phone number. Tell them to set one up in Settings → SMS & iMessage, then ask again.",
        };
      }

      // NOTE: this tool deliberately ignores ctx.simulate.
      // The chat route runs the agent with simulate=true so unsafe
      // tools (email.send, update_contact, memory.write) don't take
      // real action during a Q&A turn. reminder.schedule is the
      // exception — it's a tool the user EXPLICITLY asked to fire
      // ("text me in 3 minutes"), and the action is internal-only
      // (a row in dante_workflows targeting the user's own phone).
      // Its own guardrails — recipient must be "self", target time
      // must be >= 30s future, sms_phone must be verified — already
      // make it safe to commit. Without this override, the agent
      // would always return simulated:true, the model would summarize
      // "Set!", and no workflow would be created.

      // Build the workflow graph: trigger_at → send_sms.
      const triggerId = `trig_${ctx.runId.slice(0, 6)}`;
      const sendId = `sms_${ctx.runId.slice(0, 6)}`;
      const graph = {
        nodes: [
          {
            id: triggerId,
            type: "trigger_at" as const,
            position: { x: 100, y: 100 },
            data: {
              step: {
                id: triggerId,
                type: "trigger_at" as const,
                name: "Scheduled fire",
                config: { scheduled_for: when.toISOString() },
              },
            },
          },
          {
            id: sendId,
            type: "send_sms" as const,
            position: { x: 320, y: 100 },
            data: {
              step: {
                id: sendId,
                type: "send_sms" as const,
                name: "Send reminder",
                config: { to_phone: phone, body },
              },
            },
          },
        ],
        edges: [
          { id: `${triggerId}-${sendId}`, source: triggerId, target: sendId },
        ],
      };
      const name = `Reminder · ${when.toISOString().slice(0, 16).replace("T", " ")} UTC`;

      const { data: wf, error: insertErr } = await supabaseAdmin
        .from("dante_workflows")
        .insert({
          workspace_id: ctx.workspaceId,
          created_by: ctx.userId,
          name,
          description: body.slice(0, 200),
          enabled: true,
          trigger: { type: "trigger_at" },
          steps: graph.nodes.map((n) => n.data.step),
          graph,
          next_fire_at: when.toISOString(),
        })
        .select("id")
        .single();
      if (insertErr) {
        return { error: `reminder.schedule: ${insertErr.message}` };
      }
      return {
        ok: true,
        workflow_id: (wf as { id: string }).id,
        delivery: "self_sms",
        scheduled_for: when.toISOString(),
        message:
          "Scheduled. The user can edit or cancel from /reminders.",
      };
    }
    case "workflow.propose": {
      // Materializes a persistent workflow proposal. The graph is
      // generated from the model's natural-language `intent`, then
      // inserted with enabled=false + proposal_state='pending' so
      // cron/tick will NOT fire it until the user accepts. The
      // dashboard / /reminders UI shows pending proposals with
      // Accept and Decline buttons.
      const intent = String(args.intent || "").trim();
      const summary = String(args.summary || "").trim();
      if (!intent) return { error: "workflow.propose: 'intent' required." };
      if (!summary) return { error: "workflow.propose: 'summary' required." };

      if (ctx.simulate) {
        return {
          simulated: true,
          would_have: { action: "workflow.propose", intent, summary },
        };
      }

      let generated;
      try {
        generated = await generateWorkflow(intent);
      } catch (err) {
        return {
          error: `workflow.propose: graph generation failed — ${
            err instanceof Error ? err.message : String(err)
          }`,
        };
      }

      const triggerNode = generated.graph.nodes.find((n) =>
        n.type.startsWith("trigger_"),
      );
      const triggerType = triggerNode
        ? (triggerNode.type as "trigger_manual" | "trigger_cron" | "trigger_at" | "trigger_webhook")
        : "trigger_manual";

      // trigger_at workflows store next_fire_at on the row so the
      // tick can pick them up — but for proposals we leave it null
      // until accept flips proposal_state to NULL and computes it.
      const insertPayload: Record<string, unknown> = {
        workspace_id: ctx.workspaceId,
        created_by: ctx.userId ?? null,
        name: summary.slice(0, 80) || generated.name,
        description: generated.description || intent.slice(0, 280),
        enabled: false,
        proposal_state: "pending",
        trigger: { type: triggerType.replace("trigger_", "") },
        steps: generated.graph.nodes.map((n) => n.data.step),
        graph: generated.graph,
      };

      const { data: wf, error: insertErr } = await supabaseAdmin
        .from("dante_workflows")
        .insert(insertPayload)
        .select("id")
        .single();
      if (insertErr) {
        return { error: `workflow.propose: ${insertErr.message}` };
      }

      return {
        ok: true,
        proposal_id: (wf as { id: string }).id,
        title: insertPayload.name,
        trigger_type: triggerType,
        message:
          "Drafted as a pending proposal. The user can Accept or Decline from /reminders or the dashboard.",
      };
    }

    case "file_index.search": {
      const q = String(args.query || "").trim();
      if (!q) return { error: "file_index.search: 'query' required." };
      const k = Math.min(50, Math.max(1, Number(args.limit) || 10));
      const exts: string[] = Array.isArray(args.extensions) ? args.extensions : [];

      const params = new URLSearchParams({ q, limit: String(k) });
      if (exts.length) params.set("extensions", exts.join(","));

      const query = supabaseAdmin
        .from("watched_file_index")
        .select("id, file_name, file_path, file_extension, file_size_bytes, ingest_status, vault_item_id, last_seen_at")
        .eq("workspace_id", ctx.workspaceId)
        .is("deleted_at", null)
        .textSearch("search_tsv", q, { type: "websearch" })
        .order("last_seen_at", { ascending: false })
        .limit(k);

      if (exts.length) {
        query.in("file_extension", exts);
      }

      const { data: files, error: searchErr } = await query;
      if (searchErr) return { error: `file_index.search: ${searchErr.message}` };

      return {
        results: (files || []).map((f) => ({
          id: f.id,
          name: f.file_name,
          path: f.file_path,
          extension: f.file_extension,
          size_bytes: f.file_size_bytes,
          status: f.ingest_status,
          vault_item_id: f.vault_item_id,
        })),
        total: (files || []).length,
        hint: "Files with status='indexed' have metadata only. Call file_index.ingest to retrieve their content into the vault.",
      };
    }

    case "file_index.ingest": {
      const entryId = String(args.index_entry_id || "").trim();
      if (!entryId) return { error: "file_index.ingest: 'index_entry_id' required." };

      const { data: entry } = await supabaseAdmin
        .from("watched_file_index")
        .select("id, folder_id, file_path, file_name, ingest_status, vault_item_id")
        .eq("id", entryId)
        .eq("workspace_id", ctx.workspaceId)
        .maybeSingle();

      if (!entry) return { error: "file_index.ingest: index entry not found." };

      if (entry.ingest_status === "ingested" && entry.vault_item_id) {
        return {
          already_ingested: true,
          vault_item_id: entry.vault_item_id,
          message: `${entry.file_name} is already in the vault. Use vault.cite with this vault_item_id to search its contents.`,
        };
      }

      if (entry.ingest_status === "ingest_requested" || entry.ingest_status === "ingesting") {
        // Already in progress — poll for completion
      } else {
        const { error: crErr } = await supabaseAdmin
          .from("content_requests")
          .insert({
            workspace_id: ctx.workspaceId,
            folder_id: entry.folder_id,
            index_entry_id: entry.id,
            file_path: entry.file_path,
            requested_by: `dante:${ctx.runId}`,
          });
        if (crErr) return { error: `file_index.ingest: ${crErr.message}` };

        await supabaseAdmin
          .from("watched_file_index")
          .update({ ingest_status: "ingest_requested" })
          .eq("id", entryId);
      }

      // Poll up to 30s for the watcher to fulfill the request
      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const { data: check } = await supabaseAdmin
          .from("watched_file_index")
          .select("ingest_status, vault_item_id")
          .eq("id", entryId)
          .maybeSingle();
        if (check?.ingest_status === "ingested" && check.vault_item_id) {
          return {
            ingested: true,
            vault_item_id: check.vault_item_id,
            message: `${entry.file_name} has been ingested into the vault. Use vault.cite with this vault_item_id to search its contents.`,
          };
        }
        if (check?.ingest_status === "ingest_failed") {
          return { error: `Ingest failed for ${entry.file_name}. The file watcher could not retrieve or process the file.` };
        }
      }

      return {
        pending: true,
        message: `Content retrieval for ${entry.file_name} is still in progress. The file watcher may be offline or busy. Ask the user to check that their Drift desktop app or watcher daemon is running, then try again.`,
      };
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
  | {
      type: "iteration_thinking";
      iteration: number;
      /**
       * Natural-language description of what the agent is about to
       * do this iteration, parsed from the assistant message that
       * preceded the tool calls. Empty when the model didn't write a
       * preamble (rare with the system prompt below, but possible).
       */
      summary?: string;
    };

export interface AgentRunInput {
  step: AgentStep;
  workspaceId: string;
  /** The authenticated user driving this run, when applicable.
   *  Populated by /api/dante/ask (chat owner). Workflow / cron runs
   *  leave it undefined — anything the agent does that requires
   *  "self" identity (e.g. reminder.schedule with recipient="self")
   *  refuses to execute when this isn't set. */
  userId?: string;
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
  /**
   * Optional context for processing-mode resolution. When the agent
   * runs inside a chat scoped to a contact / vault doc / chat
   * thread, the resolver walks workspace → contact → doc → chat
   * (most-restrictive wins) to decide whether this loop should
   * route to local Hermes or cloud OpenAI.
   *
   * Workflow / cron runs typically only set workspace context, so
   * the resolver falls back to the workspace default.
   */
  contactId?: string | null;
  docId?: string | null;
  chatId?: string | null;
  /**
   * Hard override for the processing mode. When set, both the
   * static resolver and the auto-detector are bypassed and the
   * agent runs in this mode. Used by /api/dante/ask when the
   * user attaches a file to their question — bytes are sensitive
   * by definition (they came from disk and weren't ingested
   * through Vault), so we route the turn through Hermes.
   */
  forcedProcessingMode?: "cloud" | "local_only";
  /** When set, archive.search and vault.cite default to this project. */
  projectId?: string | null;
  /** For non-admin users, restrict search to these project IDs. null = unrestricted. */
  accessibleProjectIds?: string[] | null;
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
  // Workspace-set model wins over the per-step config so an admin can
  // flip the dial in Settings → Agent model without touching code.
  const workspaceModel = await getWorkspaceModel(input.workspaceId);
  const model = workspaceModel || cfg.model || "claude-sonnet-4-6";

  // Resolve the binding processing mode for this run. Two
  // signals compose, most-restrictive wins:
  //
  //  1. Static hierarchy — workspace → contact → doc → chat. Set
  //     by user/admin choice (Settings → Privacy mode, per-doc
  //     local_only flags, etc.).
  //
  //  2. Auto-detection — embed the user's most recent question,
  //     find the top-K vault hits, check whether any of those
  //     hits live in vault items flagged local_only. If yes,
  //     force local_only for the turn. This is what closes the
  //     "client asked Dante about a local file → it should
  //     route to Hermes" gap; the static resolver can't see the
  //     question, only ambient state.
  //
  // We log every local_only decision (cloud is the default and
  // would explode audit volume).
  const modeCtx = {
    workspaceId: input.workspaceId,
    contactId: input.contactId ?? null,
    docId: input.docId ?? null,
    chatId: input.chatId ?? null,
  };
  // Forced mode short-circuits everything — used when the caller
  // already knows the answer (e.g. attached a file to the chat,
  // so the bytes are sensitive by construction).
  let staticMode: Awaited<ReturnType<typeof resolveProcessingMode>> = {
    mode: "cloud",
    decided_by: "workspace_default",
  };
  let autoMode: { mode: "cloud" | "local_only"; reason: string; triggering_doc_title?: string } = {
    mode: "cloud",
    reason: "skipped",
  };
  let processingMode: "cloud" | "local_only";

  if (input.forcedProcessingMode) {
    processingMode = input.forcedProcessingMode;
  } else {
    staticMode = await resolveProcessingMode(modeCtx);

    // Auto-detection: only run when the static resolver said cloud
    // (otherwise we already know we're going local). And only when
    // we actually have a user message to inspect — workflow / cron
    // runs without user input skip this step.
    const lastUserMsg =
      typeof cfg.objective === "string" && cfg.objective.trim()
        ? cfg.objective
        : "";
    if (staticMode.mode === "cloud" && lastUserMsg) {
      try {
        autoMode = await detectAutoLocalMode({
          workspaceId: input.workspaceId,
          query: lastUserMsg,
        });
      } catch {
        /* fail-safe to cloud */
      }
    }

    processingMode =
      staticMode.mode === "local_only" || autoMode.mode === "local_only"
        ? "local_only"
        : "cloud";
  }

  if (processingMode === "local_only") {
    await logResolution(
      modeCtx,
      { mode: "local_only", decided_by: staticMode.decided_by },
      {
        run_id: input.runId,
        step_id: input.step.id,
        feature: "agent.loop",
        forced: input.forcedProcessingMode || null,
        static_mode: staticMode.mode,
        static_decided_by: staticMode.decided_by,
        auto_mode: autoMode.mode,
        auto_reason: autoMode.reason,
        auto_triggering_doc: autoMode.triggering_doc_title || null,
      },
    );
  }

  const messages: ChatMessage[] = [];
  const systemPrompt = [
    cfg.system?.trim() || "You are Dante, an AI assistant for a financial advisor.",
    "",
    "You operate inside a workflow as an agent loop. You can call the listed tools to gather information or take actions. When you have enough to answer the objective, return a plain assistant message with the final answer — do NOT call further tools at that point.",
    "",
    // Harvey-style live trace: the user sees what we're doing as we
    // do it. Forcing a one-line plan before each tool batch gives the
    // streaming UI something readable to render. Without this the
    // trace shows raw tool names, which feels mechanical.
    "Whenever you call tools, write a single short sentence (5-12 words, no markdown, present continuous) describing what you're about to do, BEFORE the tool calls. Examples: 'Searching memory for Aaron's recent activity.' or 'Looking up the firm's investment policy in the vault.' Skip this preamble only when delivering a final answer.",
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
    userId: input.userId,
    simulate: input.simulate,
    runId: input.runId,
    log: input.log,
    parentStepId: input.step.id,
    projectId: input.projectId || undefined,
    accessibleProjectIds: input.accessibleProjectIds ?? null,
    budgetUsed: {
      "memory.search": 0,
      "memory.write": 0,
      "archive.search": 0,
      "regulatory.search": 0,
      "rmd.calculate": 0,
      "inconsistency.detect": 0,
      "vault.cite": 0,
      "clients.query": 0,
      "clients.update": 0,
      "email.send": 0,
      "http.fetch": 0,
      "skill.run": 0,
      "reminder.schedule": 0,
      "workflow.propose": 0,
      "file_index.search": 0,
      "file_index.ingest": 0,
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
    const thisIteration = iterationIdx++;
    const completion = await llmComplete({
      model,
      messages: messages as LlmMessage[],
      tools: tools.length > 0 ? (tools as LlmToolDef[]) : undefined,
      toolChoice: tools.length > 0 ? "auto" : undefined,
      feature: "agent.loop",
      workspaceId: input.workspaceId,
      processingMode,
    });

    let assistantMsg = completion.message as ChatMessage;

    // Guard: if the very first iteration returns empty content with no
    // tool calls, retry once. Transient API hiccups (empty response,
    // content-filter edge case, overloaded endpoint) occasionally
    // produce this; a single retry resolves it >90% of the time.
    if (
      thisIteration === 0 &&
      !assistantMsg.content?.trim() &&
      (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0)
    ) {
      console.warn(
        `[agent] empty first response from ${model}; retrying once. ` +
        `finishReason=${completion.finishReason} runId=${input.runId}`,
      );
      const retry = await llmComplete({
        model,
        messages: messages as LlmMessage[],
        tools: tools.length > 0 ? (tools as LlmToolDef[]) : undefined,
        toolChoice: tools.length > 0 ? "auto" : undefined,
        feature: "agent.loop.retry",
        workspaceId: input.workspaceId,
        processingMode,
      });
      assistantMsg = retry.message as ChatMessage;
    }

    messages.push(assistantMsg);

    // No tool calls → the model has produced a final answer. Done.
    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      finalText = (assistantMsg.content as string) || "";
      break;
    }

    // The system prompt asks the model to write a one-line preamble
    // before each tool batch. Pull it out of the assistant message
    // and emit as the iteration summary so the streaming UI can
    // render Harvey-style "Searching memory for X..." headings.
    const preamble = trimPreamble(assistantMsg.content);
    const iterationSummary = preamble || synthesizeSummary(assistantMsg.tool_calls);
    await fire({
      type: "iteration_thinking",
      iteration: thisIteration,
      summary: iterationSummary,
    });
    // Persist the preamble alongside the tool calls so the post-hoc
    // ReasoningDisclosure can render the agent's narrative rationale
    // (not just the per-tool engineer log). step_type "thinking" is
    // filtered out of the AgentPlan view by name and surfaced by the
    // reasoning component instead.
    {
      const tsNow = new Date().toISOString();
      input.log.push({
        step_id: `${input.step.id}:thinking:${thisIteration}`,
        step_type: "agent",
        step_name: `${input.step.name || "agent"} → thinking`,
        status: "success",
        started_at: tsNow,
        finished_at: tsNow,
        output: { summary: iterationSummary, iteration: thisIteration },
      });
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
    try {
      const wrap = await llmComplete({
        model,
        messages: messages as LlmMessage[],
        toolChoice: "none",
        feature: "agent.loop.truncated",
        workspaceId: input.workspaceId,
        processingMode,
      });
      finalText = (wrap.message.content as string) || "";
    } catch (err) {
      console.warn("[agent] truncated wrap-up failed:", err);
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

// ── Iteration summary helpers ────────────────────────────────────

/**
 * Strip leading punctuation/markdown and clamp the model's preamble
 * to a single sentence. Models occasionally write longer plans
 * ("First I'll search memory, then..."); we keep just the first.
 */
function trimPreamble(content: string | null | undefined): string {
  if (!content) return "";
  const cleaned = content
    .trim()
    .replace(/^[#*_>-]+\s*/, "")
    .replace(/^\s*"|"\s*$/g, "")
    .trim();
  if (!cleaned) return "";
  // First sentence only.
  const firstSentence = cleaned.split(/(?<=[.!?])\s+/)[0];
  return firstSentence.length <= 200 ? firstSentence : firstSentence.slice(0, 197) + "…";
}

/**
 * Fallback summary derived from tool names when the model skipped
 * the preamble. Keeps the trace from showing a blank step.
 */
function synthesizeSummary(
  toolCalls: Array<{ function: { name: string } }>,
): string {
  const names = toolCalls.map((c) => c.function.name);
  if (names.includes("memory_search")) return "Checking memory…";
  if (names.includes("archive_search") || names.includes("vault_cite")) return "Searching the vault…";
  if (names.includes("file_index_search")) return "Searching the file index…";
  if (names.includes("file_index_ingest")) return "Retrieving file content…";
  if (names.includes("clients_query")) return "Looking up contacts…";
  if (names.includes("skill_run")) return "Running a skill…";
  if (names.some((n) => n.startsWith("mcp__"))) return "Calling an external tool…";
  return "Working…";
}
