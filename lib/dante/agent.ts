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
import {
  detectInconsistencies,
  formatInconsistenciesForPrompt,
} from "@/lib/dante/tools/inconsistency-detect";
import { expandMcpTools, callMcpTool, parseMcpToolName } from "@/lib/mcp/registry";
import { runSkill } from "@/lib/dante/skills";
import { generateWorkflow } from "@/lib/dante/workflow-ai";
import { generateN8nWorkflow } from "@/lib/dante/n8n-workflow-ai";
import * as n8nBridge from "@/lib/dante/n8n-bridge";
import {
  handleSiteScanSearch,
  handleSiteScanDetail,
  handleSiteScanListings,
  handleSiteScanVoidAnalysis,
  handleSurveyArea,
} from "@/lib/site-scan/tools";
import { handleTenantSiteSearch } from "@/lib/dante/tools/tenant-site-search";
import { calculateCre, AVAILABLE_METRICS } from "@/lib/dante/calculators/cre";
import { getWorkspaceModel } from "@/lib/dante/model";
import { complete as llmComplete } from "@/lib/llm/client";
import {
  resolveProcessingMode,
  logResolution,
} from "@/lib/llm/processing-mode";
import { detectAutoLocalMode } from "@/lib/dante/auto-mode";
import type { LlmMessage, LlmToolDef, LlmContentBlock } from "@/lib/llm/types";
import type { MemoryKind } from "@/lib/dante/memory/types";
import type {
  AgentStep,
  AgentToolName,
  AgentToolEntry,
  StepLogEntry,
} from "./workflow-types";
import { log as rootLog } from "@/lib/logging";

const agentLog = rootLog.child({ component: "agent" });

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
        "Save a new fact, summary, or episode to memory. Only use when you've LEARNED something durable (e.g. a tenant's move-out date; broker confirms a preference). Don't write speculation.",
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
        "Vector-search Drift's workspace-shared regulatory corpus — HUD fair-housing enforcement, state real-estate commission rulings, SEC/FTC releases relevant to CRE, etc. Use this when the user asks 'what does HUD say about X', 'has anyone been charged for Y', 'is Z compliant', or anytime your answer would benefit from a primary-source regulatory citation. Cite results inline as [reg:N] and let the user click through to the canonical source URL. Set `agentic: true` for hard or open-ended questions where the first query might not surface everything — the search will iterate (up to 4 rounds), refining the query against gaps in the results before returning. Costs slightly more but typically lifts recall noticeably; use it for the harder questions, not every lookup.",
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
  "clients.create": {
    type: "function",
    function: {
      name: "clients_create",
      description:
        "Create a new contact (client) record. At minimum, provide name. " +
        "Use this when you've extracted contact data from files (lease " +
        "abstractions, intake forms, tenant rosters, vendor lists) and " +
        "need to populate the Clients page. Phone is unique within the " +
        "workspace — duplicates will be rejected (use clients.query first " +
        "if you suspect the contact already exists).",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Full name (required)." },
          email: { type: "string", description: "Primary email address." },
          phone: {
            type: "string",
            description:
              "E.164 preferred (+15551234567). Unique within the workspace.",
          },
          stage: {
            type: "string",
            enum: ["lead", "prospect", "active", "inactive", "archived"],
            description: "Pipeline stage. Default: lead.",
          },
          date_of_birth: { type: "string", description: "ISO date (YYYY-MM-DD)." },
          spouse_date_of_birth: { type: "string", description: "ISO date (YYYY-MM-DD)." },
          state_code: {
            type: "string",
            description: "Two-letter US state abbreviation (e.g. OH, CA).",
          },
          is_planning_subject: {
            type: "boolean",
            description:
              "Whether this contact is a planning subject (default true).",
          },
        },
        required: ["name"],
      },
    },
  },
  "properties.query": {
    type: "function",
    function: {
      name: "properties_query",
      description:
        "Query the properties table. Returns id, address, city, state, zip, " +
        "beds, baths, sqft, kind, list_price_cents, status, listed_at, " +
        "sold_at, notes, description, year_built, lot_size_sqft, lease fields, " +
        "transaction_stage, and linked clients. Use when the user references " +
        "their properties, asks about a specific address, or before updating.",
      parameters: {
        type: "object",
        properties: {
          filter: {
            type: "object",
            description:
              "Column=value equality filters. Common: {\"status\": \"active\"}, " +
              "{\"kind\": \"commercial\"}, {\"city\": \"Willoughby\"}.",
            additionalProperties: { type: "string" },
          },
          search: {
            type: "string",
            description:
              "Free-text search against address_line1. Use when the user says " +
              "'my Euclid Ave property' or references an address by name.",
          },
          limit: { type: "number", description: "1-100, default 25." },
        },
      },
    },
  },
  "properties.create": {
    type: "function",
    function: {
      name: "properties_create",
      description:
        "Create a new property record. At minimum, provide address_line1. " +
        "Use this when you've extracted property data from files, lease " +
        "abstractions, or user instructions and need to populate the " +
        "Properties page. Currency fields are in cents (e.g. $500,000 = 50000000).",
      parameters: {
        type: "object",
        properties: {
          address_line1: { type: "string", description: "Street address (required)." },
          address_line2: { type: "string", description: "Suite, unit, floor." },
          city: { type: "string" },
          state: { type: "string", description: "Two-letter abbreviation." },
          zip: { type: "string" },
          beds: { type: "number" },
          baths: { type: "number" },
          sqft: { type: "number" },
          kind: {
            type: "string",
            enum: ["residential", "commercial", "rental", "land", "other"],
          },
          list_price_cents: { type: "number", description: "Price in cents." },
          status: {
            type: "string",
            enum: ["active", "pending", "sold", "withdrawn", "off_market"],
            description: "Default: active.",
          },
          notes: { type: "string" },
          description: { type: "string" },
          year_built: { type: "number" },
          lot_size_sqft: { type: "number" },
          lease_term_months: { type: "number" },
          lease_start_date: { type: "string", description: "ISO date." },
          lease_end_date: { type: "string", description: "ISO date." },
          monthly_rent_cents: { type: "number", description: "Monthly rent in cents." },
          interior_features: {
            type: "array",
            items: { type: "string" },
            description: "E.g. ['hardwood floors', 'elevator', 'sprinklers'].",
          },
          exterior_features: {
            type: "array",
            items: { type: "string" },
            description: "E.g. ['loading dock', 'fenced lot', 'corner lot'].",
          },
        },
        required: ["address_line1"],
      },
    },
  },
  "properties.update": {
    type: "function",
    function: {
      name: "properties_update",
      description:
        "Update an existing property record. Call properties.query first " +
        "to get the property id. All fields from properties.create are " +
        "patchable, plus transaction_stage and expected_close_date.",
      parameters: {
        type: "object",
        properties: {
          property_id: { type: "string", description: "Property UUID." },
          patch: {
            type: "object",
            additionalProperties: true,
            description:
              "Fields to update. Same schema as properties.create, plus " +
              "transaction_stage (listed|showing|offer|pending|closed|" +
              "withdrawn|expired) and expected_close_date (ISO date).",
          },
        },
        required: ["property_id", "patch"],
      },
    },
  },
  "email.send": {
    type: "function",
    function: {
      name: "email_send",
      description:
        "Compose and queue an email. Self-sends (to the authenticated user's own email) are delivered immediately. Contact-facing emails are staged into the supervisor review queue and require approval before sending. After calling, tell the user the email is queued for review. Budget: 3 sends per agent run.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email. Must be a known workspace contact or the authenticated user." },
          subject: { type: "string", description: "Email subject line." },
          html: { type: "string", description: "HTML body of the email." },
          text: { type: "string", description: "Plain text body (fallback)." },
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
        "Schedule a one-shot reminder via SMS / iMessage. Two modes:\n\n" +
        "1. recipient='self' — immediate delivery to the authenticated user's phone. No review required.\n" +
        "2. recipient='contact' — client-facing message. Stages the SMS into the supervisor review queue; a workspace owner/supervisor must approve before it sends. Requires contact_id of a known workspace contact with a phone number on file.\n\n" +
        "CALL THIS IMMEDIATELY when the user asks to be reminded or to text a contact — do NOT ask them to confirm time or content first. Resolve relative phrasings ('in 2 minutes', 'tomorrow at 3pm', 'end of day') against the current UTC time yourself, assuming the user's local timezone if relevant, and just fire the call. After the tool returns, summarize what you scheduled. When recipient='contact', tell the user it's queued for supervisor approval. Only ask the user to clarify if the time is genuinely ambiguous.",
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
              "The text to deliver. For self-reminders: first-person, action-oriented ('Read rent rolls in Medina before first meeting'). For contact messages: second-person from the workspace, professional.",
          },
          recipient: {
            type: "string",
            enum: ["self", "contact"],
            description:
              "'self' delivers to the authenticated user's sms_phone. 'contact' stages a client-facing SMS for supervisor review.",
          },
          contact_id: {
            type: "string",
            description:
              "Required when recipient='contact'. The UUID of a workspace contact to message. Must have a phone number on file.",
          },
          channel: {
            type: "string",
            enum: ["sms"],
            description:
              "Always 'sms'. SendBlue handles iMessage/SMS routing automatically.",
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
        "Create and activate a persistent workflow. CALL THIS whenever the user asks for recurring monitoring, future-dated outreach, or 'let me know if X' -- anything that needs to keep working when the app is closed. The workflow is created as enabled and immediately active. IMPORTANT: before calling, describe what the workflow will do and ASK the user for confirmation ('Want me to set that up?'). Only call after the user says yes. Don't promise to do persistent things yourself -- you only run while the app is open. Use reminder.schedule for one-shot self-SMS; use workflow.propose for everything else (recurring, multi-step, conditional, client-facing).",
      parameters: {
        type: "object",
        properties: {
          intent: {
            type: "string",
            description:
              "Plain-English description of what the workflow should do, written for the materializer. Include trigger frequency ('every Monday at 9am', 'on 2026-12-31', 'when a webhook fires'), action(s) ('email Mrs. Chen with subject ... and body ...'), and any condition logic. Do NOT pass the user's raw question -- translate it into an unambiguous spec the materializer can turn into a graph.",
          },
          summary: {
            type: "string",
            description:
              "Short title for the workflow. 80 chars max. E.g. 'Weekly check-in with Mrs. Chen until RMD is filed.'",
          },
        },
        required: ["intent", "summary"],
      },
    },
  },

  "workflow.run": {
    type: "function",
    function: {
      name: "workflow_run",
      description:
        "Trigger an existing workflow by name, passing structured input. Use this when the user asks you to 'run the acquisition deep-dive on X', 'kick off the meeting prep for Y', or any phrasing that implies running an existing workflow with specific parameters. The workflow's trigger node exposes input fields via {{steps.trigger.input.<field>}} — pass the fields the workflow expects. If you're unsure which fields a workflow needs, call with just the name to see its expected inputs.",
      parameters: {
        type: "object",
        properties: {
          workflow_name: {
            type: "string",
            description: "Name (or partial name) of the workflow to run. Fuzzy-matched against existing workflows in the workspace.",
          },
          input: {
            type: "object",
            description: "Key-value input to pass to the workflow trigger. Fields depend on the workflow — e.g. { address, city, state } for an acquisition workflow.",
            additionalProperties: true,
          },
        },
        required: ["workflow_name"],
      },
    },
  },
  "workflow.list_templates": {
    type: "function",
    function: {
      name: "workflow_list_templates",
      description:
        "List all available pre-built workflow templates. Returns each template's slug, name, description, category, and trigger type. Use this to show the user what templates are available before cloning. Call this first when the user asks about templates, wants to see what's available, or asks to set up standard workflows.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description: "Optional filter by category: 'Deal pipeline', 'Lease management', 'Client communication', 'Operations', 'Prospecting', 'Site intelligence', 'Due diligence', 'Risk management'. Omit to list all.",
          },
        },
      },
    },
  },
  "workflow.clone_template": {
    type: "function",
    function: {
      name: "workflow_clone_template",
      description:
        "Clone a pre-built workflow template into the user's workspace. The template becomes a fully editable workflow, enabled and ready to run. Use this when the user says 'set up the lease expiry alerts', 'clone all the DD templates', 'add the pipeline digest workflow', or anything that implies installing a template. Call workflow.list_templates first if you need to find the right slug.",
      parameters: {
        type: "object",
        properties: {
          slug: {
            type: "string",
            description: "The template slug to clone. Get this from workflow.list_templates.",
          },
        },
        required: ["slug"],
      },
    },
  },
  "workflow.list": {
    type: "function",
    function: {
      name: "workflow_list",
      description:
        "List all workflows in the user's workspace. Returns each workflow's " +
        "id, name, description, enabled status, trigger type, and a summary " +
        "of its nodes (step types and key config like email recipients, cron " +
        "schedules, SMS numbers). Use when the user asks 'what workflows do " +
        "I have?', 'show me my automations', 'which reminders are set up?', " +
        "or before using workflow.update to find the workflow id.",
      parameters: {
        type: "object",
        properties: {
          include_disabled: {
            type: "boolean",
            description: "Include disabled workflows (default false).",
          },
        },
        required: [],
      },
    },
  },
  "workflow.update": {
    type: "function",
    function: {
      name: "workflow_update",
      description:
        "Update an existing workflow's settings or node configuration. " +
        "Use this to change email recipients, SMS numbers, cron schedules, " +
        "enable/disable workflows, rename them, or edit any node's config. " +
        "Call workflow.list first to get the workflow id and see its current " +
        "structure. Provide node_updates to surgically edit specific nodes " +
        "within the workflow graph.",
      parameters: {
        type: "object",
        properties: {
          workflow_id: {
            type: "string",
            description: "The workflow id to update (from workflow.list).",
          },
          name: {
            type: "string",
            description: "New workflow name (optional).",
          },
          description: {
            type: "string",
            description: "New description (optional).",
          },
          enabled: {
            type: "boolean",
            description: "Enable or disable the workflow (optional).",
          },
          node_updates: {
            type: "array",
            items: {
              type: "object",
              properties: {
                node_id: {
                  type: "string",
                  description: "The node/step id within the workflow graph.",
                },
                config_patch: {
                  type: "object",
                  description:
                    "Key-value pairs to merge into the node's config. " +
                    "For example, {\"to\": \"new@email.com\"} to change " +
                    "an email recipient, or {\"body\": \"new text\"} to " +
                    "change an SMS body.",
                },
              },
              required: ["node_id", "config_patch"],
            },
            description:
              "Surgical edits to specific nodes in the workflow graph. " +
              "Each entry patches one node's config without touching others.",
          },
        },
        required: ["workflow_id"],
      },
    },
  },
  "workflow.execution_status": {
    type: "function",
    function: {
      name: "workflow_execution_status",
      description:
        "Check the execution status of a workflow run. Returns the current " +
        "status (running, completed, failed) and per-node execution traces " +
        "showing what each node produced. Use when the user asks 'did my " +
        "workflow finish?', 'what happened with that run?', or 'show me " +
        "the execution results'. Provide either a run_id (from workflow.run) " +
        "or a workflow_name to get the most recent execution.",
      parameters: {
        type: "object",
        properties: {
          run_id: {
            type: "string",
            description: "The execution/run ID returned by workflow.run.",
          },
          workflow_name: {
            type: "string",
            description: "Workflow name to get the most recent execution for.",
          },
        },
        required: [],
      },
    },
  },
  "workflow.migrate": {
    type: "function",
    function: {
      name: "workflow_migrate",
      description:
        "Migrate all legacy workflows in this workspace to the n8n engine. " +
        "Converts each workflow from the old Drift format to n8n, validates " +
        "the conversion, and pushes to n8n. Returns a per-workflow report. " +
        "Use dry_run=true first to preview what would happen without making " +
        "changes. Owner-only operation.",
      parameters: {
        type: "object",
        properties: {
          dry_run: {
            type: "boolean",
            description: "If true, validate only without pushing to n8n. Default false.",
          },
        },
        required: [],
      },
    },
  },
  "secrets.set": {
    type: "function",
    function: {
      name: "secrets_set",
      description:
        "Create or update a workspace secret used by workflow templates. " +
        "Secrets are referenced in workflow configs as {{secrets.<key>}}. " +
        "Common keys: broker_email (delivery address for workflow emails), " +
        "corridor_anchors, target_use, target_zoning. Use this when the " +
        "user asks you to change a workflow email recipient and the 'to' " +
        "field uses a {{secrets.*}} template, or when setting up a new " +
        "workflow that needs configuration values. Keys must be valid " +
        "identifiers (letters, digits, underscore; no leading digit).",
      parameters: {
        type: "object",
        properties: {
          key: {
            type: "string",
            description: "The secret key (e.g. 'broker_email', 'corridor_anchors').",
          },
          value: {
            type: "string",
            description: "The secret value (e.g. 'john@example.com').",
          },
          description: {
            type: "string",
            description: "Optional human-readable description of what this secret is for.",
          },
        },
        required: ["key", "value"],
      },
    },
  },
  "secrets.list": {
    type: "function",
    function: {
      name: "secrets_list",
      description:
        "List all workspace secrets (keys and masked previews only -- " +
        "raw values are never returned). Use this to check which secrets " +
        "exist before deciding whether to set one, or to diagnose a " +
        "workflow failure caused by a missing {{secrets.*}} reference.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
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
  "file_index.list_folder": {
    type: "function",
    function: {
      name: "file_index_list_folder",
      description:
        "List all files inside a watched folder (or subfolder path). Use when the user asks 'what files are in the X folder' or 'show me everything in /path/to/folder'. Returns every file in that folder tree with name, path, extension, size, and ingest status.",
      parameters: {
        type: "object",
        properties: {
          folder_path: {
            type: "string",
            description: "Full or partial folder path to list, e.g. '/Volumes/Server/Clients/Patel' or 'Medina'. Matches against file_path using contains/prefix matching.",
          },
          limit: {
            type: "number",
            description: "Max results (1-200, default 50).",
          },
        },
        required: ["folder_path"],
      },
    },
  },
  "site_scan.search": {
    type: "function",
    function: {
      name: "site_scan_search",
      description:
        "Search for parcels matching location, zoning, and size criteria. " +
        "Returns parcel summaries from county public records with assessed values, " +
        "zoning classifications, and acreage. Use when the user asks to find " +
        "sites, parcels, or properties in a specific area.",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description:
              "Location to search -- address, intersection, city, or zip code",
          },
          zoning: {
            type: "array",
            items: { type: "string" },
            description:
              "Zoning types: use natural terms (retail, industrial, office, " +
              "mixed_use, residential, vacant) or specific codes (C-2, M-1)",
          },
          acreage_min: {
            type: "number",
            description: "Minimum parcel size in acres",
          },
          acreage_max: {
            type: "number",
            description: "Maximum parcel size in acres",
          },
          land_use: {
            type: "string",
            description:
              "Land use filter -- e.g. 'vacant' for undeveloped parcels",
          },
          max_results: {
            type: "number",
            description: "Max results (default 20)",
          },
        },
        required: ["location"],
      },
    },
  },
  "site_scan.detail": {
    type: "function",
    function: {
      name: "site_scan_detail",
      description:
        "Get full intelligence on a specific parcel: auditor record, tax estimate, " +
        "demographics, environmental check, and any linked vault documents. " +
        "Use when the user asks about a specific property, address, or parcel. " +
        "After retrieving, check vault.cite for any user-uploaded documents " +
        "related to the same address or parcel.",
      parameters: {
        type: "object",
        properties: {
          parcel_number: {
            type: "string",
            description: "County parcel number",
          },
          address: {
            type: "string",
            description:
              "Street address (alternative to parcel number)",
          },
          county: { type: "string", description: "County name" },
          state: {
            type: "string",
            description: "Two-letter state code",
          },
        },
      },
    },
  },
  "site_scan.listings": {
    type: "function",
    function: {
      name: "site_scan_listings",
      description:
        "Search for active commercial real estate listings near a location. " +
        "Returns listings with address, size, asking price, and listing broker. " +
        "All listing data is unverified -- status may have changed. " +
        "Use when the user asks what's available or on the market.",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description:
              "Address, city, or zip to search near",
          },
          radius_miles: {
            type: "number",
            description: "Search radius in miles (default 3)",
          },
          property_type: {
            type: "string",
            description:
              "retail, industrial, office, land, multifamily",
          },
          sf_min: {
            type: "number",
            description: "Minimum square footage",
          },
          sf_max: {
            type: "number",
            description: "Maximum square footage",
          },
        },
        required: ["location"],
      },
    },
  },
  "web.search": {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web for market intelligence, news, listings, regulations, " +
        "or any publicly available information. Returns an AI-generated summary " +
        "answer plus individual source URLs with snippets. Use for competitive " +
        "research, market data, zoning regulations, recent transactions, or " +
        "any question that benefits from current web information.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query",
          },
          max_results: {
            type: "number",
            description: "Number of results to return (1-20, default 5)",
          },
          search_depth: {
            type: "string",
            enum: ["basic", "advanced"],
            description:
              "basic (fast) or advanced (slower, more thorough). Default basic.",
          },
          include_domains: {
            type: "array",
            items: { type: "string" },
            description: "Only search these domains (e.g. loopnet.com)",
          },
          exclude_domains: {
            type: "array",
            items: { type: "string" },
            description: "Skip these domains",
          },
        },
        required: ["query"],
      },
    },
  },
  "site_scan.void_analysis": {
    type: "function",
    function: {
      name: "site_scan_void_analysis",
      description:
        "Void analysis: identify what business categories are MISSING from a " +
        "corridor or trade area, and find candidate parcels that could fill " +
        "those gaps. Provide 2-5 search points along the target area " +
        "(intersections, town centers, zip codes) and the tool scans a " +
        "10-mile radius around each. Returns two things: (1) market_gap " +
        "data showing which categories (restaurant, medical, fitness, etc.) " +
        "have no presence in each corridor segment -- these are the voids; " +
        "(2) a ranked shortlist of parcels scored by vacancy, acreage, and " +
        "zoning fit. Report the voids you find. You may recommend tenants " +
        "for confirmed void categories, but you MUST first call survey_area " +
        "to verify the recommended brand does not already exist within 3 miles.",
      parameters: {
        type: "object",
        properties: {
          locations: {
            type: "array",
            items: { type: "string" },
            description:
              "2-5 search anchor points along the target corridor or area. " +
              "Use intersections, town names, or zip codes spaced evenly.",
          },
          target_use: {
            type: "string",
            description:
              "What the sites would be used for -- e.g. 'retail strip center', " +
              "'industrial warehouse', 'mixed-use development', 'medical office'",
          },
          zoning: {
            type: "array",
            items: { type: "string" },
            description:
              "Zoning types: natural terms (retail, industrial, office, " +
              "mixed_use, vacant) or specific codes (C-2, M-1)",
          },
          acreage_min: {
            type: "number",
            description: "Minimum parcel size in acres",
          },
          acreage_max: {
            type: "number",
            description: "Maximum parcel size in acres",
          },
          max_sites: {
            type: "number",
            description: "Number of top sites to return (default 20, max 30)",
          },
          prefer_vacant: {
            type: "boolean",
            description:
              "Prioritize vacant/undeveloped parcels (default true)",
          },
        },
        required: ["locations"],
      },
    },
  },
  "survey_area": {
    type: "function",
    function: {
      name: "survey_area",
      description:
        "Survey all businesses near an address using Google Places API. " +
        "Returns every business within specified radii (default 1 mile " +
        "and 3 miles), organized by CRE-relevant category: restaurants, " +
        "grocery, medical, fitness, retail, financial, education, services, " +
        "entertainment, lodging, childcare. Each result includes name, " +
        "address, distance, rating, and radius band. Use this BEFORE " +
        "writing void analysis conclusions -- it replaces guesswork with " +
        "real geospatial data. The tool also flags categories with zero " +
        "or very few results as void indicators.",
      parameters: {
        type: "object",
        properties: {
          address: {
            type: "string",
            description:
              "Street address, intersection, or location to survey " +
              "(e.g. '38000 Euclid Ave, Willoughby OH')",
          },
          radii_miles: {
            type: "array",
            items: { type: "number" },
            description:
              "Search radii in miles (default [1, 3]). Max 3 radii, " +
              "max 5 miles each. Example: [1, 3, 5]",
          },
          categories: {
            type: "array",
            items: { type: "string" },
            description:
              "Filter to specific categories: restaurants, grocery, " +
              "medical, fitness, retail, financial, education, services, " +
              "entertainment, lodging, childcare. Omit to survey all.",
          },
        },
        required: ["address"],
      },
    },
  },
  "cre.calculate": {
    type: "function",
    function: {
      name: "cre_calculate",
      description:
        "Run CRE financial calculations. Deterministic math -- no AI involved. " +
        "Pass one or more metric names and the required numeric inputs. The tool " +
        "returns computed results with formulas shown. Use this for due diligence, " +
        "underwriting, deal screening, and investment analysis.\n\n" +
        "Available metrics: noi, cap_rate, cash_on_cash, dscr, grm, price_per_sf, " +
        "rent_per_sf, ltv, debt_yield, opex_ratio, break_even_occupancy, debt_service, " +
        "equity_multiple, irr, deal_score.\n\n" +
        "deal_score computes a composite 0-100 score across 7 dimensions (cap rate vs " +
        "target, DSCR, cash-on-cash, LTV, break-even occupancy, debt yield, OpEx ratio) " +
        "with A-F grades. Provide as many inputs as available -- it redistributes weights " +
        "across available dimensions. Optional: target_cap_rate (default 0.07).\n\n" +
        "You can request multiple metrics in one call (e.g. [\"noi\", \"cap_rate\", \"deal_score\"]) " +
        "and they all compute against the same inputs. For IRR, pass cash flows as " +
        "cash_flow_0 (negative initial investment), cash_flow_1, cash_flow_2, etc.\n\n" +
        "Common input keys: gross_potential_rent, vacancy_rate, other_income, " +
        "operating_expenses, purchase_price, market_value, noi, annual_debt_service, " +
        "total_cash_invested, gross_annual_rent, building_sf, rentable_sf, loan_amount, " +
        "interest_rate (decimal, e.g. 0.065), amortization_years, appraised_value.",
      parameters: {
        type: "object",
        properties: {
          metrics: {
            type: "array",
            items: { type: "string" },
            description:
              "Which metrics to compute. One or more of: noi, cap_rate, cash_on_cash, " +
              "dscr, grm, price_per_sf, rent_per_sf, ltv, debt_yield, opex_ratio, " +
              "break_even_occupancy, debt_service, equity_multiple, irr, deal_score.",
          },
          inputs: {
            type: "object",
            description:
              "Numeric inputs keyed by name. All values must be numbers. " +
              "For percentages/rates, use decimals (0.05 = 5%, 0.065 = 6.5%). " +
              "For currency, use full dollar amounts (not cents).",
            additionalProperties: { type: "number" },
          },
        },
        required: ["metrics", "inputs"],
      },
    },
  },
  "document.create": {
    type: "function",
    function: {
      name: "document_create",
      description:
        "Generate a branded PDF or DOCX document from structured sections and save it to the workspace vault. Use this when the user asks you to create a report, memo, letter, deal summary, lease abstract, market analysis, or any other professional document. The document will be branded with the workspace's logo and colors. Returns a vault item ID and download URL the user can access immediately.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Document title (appears in header)." },
          subtitle: { type: "string", description: "Optional subtitle (appears below title)." },
          sections: {
            type: "array",
            items: {
              type: "object",
              properties: {
                heading: { type: "string", description: "Section heading." },
                body: { type: "string", description: "Section body text. Supports plain text with newlines for paragraph breaks." },
              },
              required: ["heading", "body"],
            },
            description: "Document sections in order. Each section has a heading and body.",
          },
          format: {
            type: "string",
            enum: ["pdf", "docx"],
            description: "Output format. Use 'pdf' for final deliverables the broker will share with clients. Use 'docx' for editable drafts the broker can modify in Word.",
          },
          template_id: {
            type: "string",
            description: "Optional template ID (from document.list_templates). Pre-fills section headings from the template; the agent supplies body content for each section.",
          },
        },
        required: ["title", "sections", "format"],
      },
    },
  },
  "document.edit": {
    type: "function",
    function: {
      name: "document_edit",
      description:
        "Modify an existing Dante-generated document by appending, replacing, or deleting sections, then re-render and save the updated version. Only works on documents that Dante originally created (they have section metadata stored). Use this when the user wants to revise, update, or add to a document you previously generated.",
      parameters: {
        type: "object",
        properties: {
          vault_item_id: {
            type: "string",
            description: "The vault item ID of the document to edit (returned by document.create).",
          },
          operations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: ["append_section", "replace_section", "delete_section", "set_title", "set_subtitle"],
                  description: "Operation type.",
                },
                heading: { type: "string", description: "Section heading (for append_section and replace_section)." },
                body: { type: "string", description: "Section body (for append_section and replace_section)." },
                index: { type: "number", description: "Zero-based section index (for replace_section and delete_section)." },
                title: { type: "string", description: "New title (for set_title)." },
                subtitle: { type: "string", description: "New subtitle (for set_subtitle)." },
              },
              required: ["type"],
            },
            description: "Ordered list of edit operations to apply.",
          },
        },
        required: ["vault_item_id", "operations"],
      },
    },
  },
  "document.list_templates": {
    type: "function",
    function: {
      name: "document_list_templates",
      description:
        "List all saved document templates in the workspace. Use this when the user asks 'what templates do I have?', 'show me my document templates', or before creating a document when you want to check if a relevant template exists. Returns template names, descriptions, section headings, and preferred format.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  "document.save_template": {
    type: "function",
    function: {
      name: "document_save_template",
      description:
        "Save a document's section structure as a reusable template. Use when the user says 'save this as a template', 'make this a template', or 'I want to reuse this format'. Two modes: (1) provide vault_item_id to extract the structure from an existing Dante-generated document, or (2) provide sections directly to define a new template from scratch. Templates store section headings only — body content is filled by the agent each time the template is used.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Template name (e.g. 'Void Analysis Report', 'Deal Memo')." },
          description: { type: "string", description: "Brief description of when to use this template." },
          vault_item_id: {
            type: "string",
            description: "Vault item ID of a Dante-generated document to extract the template from. Mutually exclusive with sections.",
          },
          sections: {
            type: "array",
            items: {
              type: "object",
              properties: {
                heading: { type: "string" },
              },
              required: ["heading"],
            },
            description: "Section headings for the template. Used when creating a template from scratch (no vault_item_id).",
          },
          format: {
            type: "string",
            enum: ["pdf", "docx"],
            description: "Default output format for documents using this template.",
          },
        },
        required: ["name"],
      },
    },
  },
  "agent.delegate": {
    type: "function",
    function: {
      name: "agent_delegate",
      description:
        "Spawn a focused sub-agent to handle a specific sub-task. The sub-agent " +
        "runs with its own tool set and step budget, then returns its result to " +
        "you. Use this when a task has clearly separable sub-problems — e.g. " +
        "'research the market AND draft the memo' can be split into a research " +
        "sub-agent and a drafting sub-agent. The sub-agent inherits your workspace " +
        "context but has its own conversation history. Max 3 delegations per run.",
      parameters: {
        type: "object",
        properties: {
          objective: {
            type: "string",
            description: "Clear, specific objective for the sub-agent. Be precise about what output you need back.",
          },
          tools: {
            type: "array",
            items: { type: "string" },
            description:
              "Which tools the sub-agent can use. Pick only what it needs. " +
              "Available: memory.search, memory.write, archive.search, vault.cite, " +
              "clients.query, properties.query, site_scan.search, site_scan.detail, " +
              "site_scan.void_analysis, survey_area, web.search, cre.calculate, " +
              "file_index.search, regulatory.search.",
          },
          max_steps: {
            type: "number",
            description: "Maximum iterations for the sub-agent (1-10, default 5).",
          },
          context: {
            type: "string",
            description: "Additional context to pass to the sub-agent (e.g. prior findings, constraints).",
          },
        },
        required: ["objective", "tools"],
      },
    },
  },
  "tenant_site_search": {
    type: "function",
    function: {
      name: "tenant_site_search",
      description:
        "Search for locations that match a tenant's site criteria. Inverse of " +
        "void analysis -- instead of finding tenants for a site, finds sites " +
        "for a tenant. Provide the tenant name, business category, and one or " +
        "more target markets. The tool geocodes each market, surveys competitor " +
        "density using Google Places API, pulls Census demographics, and scores " +
        "each location against the criteria. Returns ranked matches with " +
        "competitor counts, population estimates, median household income, and " +
        "category status (void / underserved / adequate / saturated). Use this " +
        "when a broker asks 'where should [tenant] open next?', 'find me sites " +
        "for a Chipotle', or 'which of these markets has the least competition " +
        "for [category]?'",
      parameters: {
        type: "object",
        properties: {
          tenant_name: {
            type: "string",
            description:
              "Tenant or brand name (e.g. 'Chipotle', 'CVS Pharmacy', 'Planet Fitness').",
          },
          category: {
            type: "string",
            description:
              "Business category (e.g. 'Fast Casual', 'Pharmacy', 'Coffee', " +
              "'Grocery', 'Fitness', 'Medical', 'Retail').",
          },
          min_population_3mi: {
            type: "number",
            description:
              "Minimum estimated population within 3 miles of the site.",
          },
          max_competitors_3mi: {
            type: "number",
            description:
              "Maximum number of same-category businesses within 3 miles.",
          },
          min_median_hhi: {
            type: "number",
            description:
              "Minimum median household income in the surrounding census tract.",
          },
          max_rent_psf: {
            type: "number",
            description:
              "Maximum rent per square foot per year (for filtering; not scored).",
          },
          min_sf: {
            type: "number",
            description: "Minimum square footage the tenant needs.",
          },
          max_sf: {
            type: "number",
            description: "Maximum square footage the tenant needs.",
          },
          target_markets: {
            type: "array",
            items: { type: "string" },
            description:
              "Markets to evaluate (e.g. ['Austin, TX', 'Dallas, TX', " +
              "'San Antonio, TX']). Max 10 per search.",
          },
          require_void: {
            type: "boolean",
            description:
              "If true, only return locations where the category is a void " +
              "or underserved (0-2 competitors within 3 miles).",
          },
        },
        required: ["tenant_name", "category", "target_markets"],
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
  inconsistency_detect: "inconsistency.detect",
  vault_cite: "vault.cite",
  clients_query: "clients.query",
  clients_update: "clients.update",
  clients_create: "clients.create",
  properties_query: "properties.query",
  properties_create: "properties.create",
  properties_update: "properties.update",
  email_send: "email.send",
  http_fetch: "http.fetch",
  skill_run: "skill.run",
  reminder_schedule: "reminder.schedule",
  workflow_propose: "workflow.propose",
  workflow_run: "workflow.run",
  workflow_list_templates: "workflow.list_templates",
  workflow_clone_template: "workflow.clone_template",
  workflow_list: "workflow.list",
  workflow_update: "workflow.update",
  workflow_execution_status: "workflow.execution_status",
  workflow_migrate: "workflow.migrate",
  secrets_set: "secrets.set",
  secrets_list: "secrets.list",
  file_index_search: "file_index.search",
  file_index_ingest: "file_index.ingest",
  file_index_list_folder: "file_index.list_folder",
  site_scan_search: "site_scan.search",
  site_scan_detail: "site_scan.detail",
  site_scan_listings: "site_scan.listings",
  site_scan_void_analysis: "site_scan.void_analysis",
  survey_area: "survey_area",
  tenant_site_search: "tenant_site_search",
  web_search: "web.search",
  cre_calculate: "cre.calculate",
  document_create: "document.create",
  document_edit: "document.edit",
  document_list_templates: "document.list_templates",
  document_save_template: "document.save_template",
  agent_delegate: "agent.delegate",
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

  // ── Void analysis enforcement state ──
  /** Set to true when site_scan.void_analysis is called during this run. */
  voidAnalysisCalled?: boolean;
  /** The address used in the void analysis (for auto-calling survey_area). */
  voidAnalysisAddress?: string;
  /** Set to true when survey_area is called during this run. */
  surveyAreaCalled?: boolean;
  /** The raw survey_area result for post-validation of recommendations. */
  surveyAreaResult?: SurveyAreaResult | null;
  /** The raw void_analysis result for dashboard construction. */
  voidAnalysisResult?: VoidAnalysisResult | null;
  /** Stashed copy of model finalText before dashboard rewrite, so
   *  buildVoidDashboard can extract tenant names from the prose. */
  _finalTextForTenantExtraction?: string;
  /** Optional event emitter — tools can push SSE events to the client
   *  (e.g. needs_input for configuration prompts). */
  onEvent?: (event: Record<string, unknown>) => void | Promise<void>;
}

/** Minimal shape of survey_area output needed for brand validation. */
interface SurveyAreaResult {
  address_resolved?: string;
  survey_center?: { lat: number; lng: number };
  summary?: { total_unique: number; by_radius: Record<string, number>; by_category: Record<string, number> };
  by_category: Record<string, Array<{ name: string; distance_miles: number; address?: string; rating?: number; radius_band?: string }>>;
  void_indicators: Array<{ category: string; count: number; level: string }>;
}

/** Minimal shape of void_analysis output for dashboard construction. */
interface VoidAnalysisResult {
  search_points?: string[];
  target_use?: string;
  sites?: Array<{
    address: string;
    zoning?: string;
    acreage?: number;
    assessed_value?: number | null;
    score?: number;
  }>;
  market_gap?: {
    corridor_coverage?: unknown;
    void_segments?: unknown;
    market_density?: unknown;
  };
}

const PER_TOOL_BUDGET: Partial<Record<AgentToolName, number>> = {
  "properties.query": 10,    // read-only; cheap
  "properties.create": 20,   // "fill out properties from my files" can create many
  "properties.update": 20,   // bulk update scenario
  "clients.create": 20,      // bulk-populate contacts from intake forms / rosters
  "email.send": 3,
  "http.fetch": 10,
  "memory.write": 20,
  "skill.run": 5,        // skills can be expensive; 5 is generous
  "vault.cite": 18,       // lease abstraction needs 14+ passes; 18 gives retry headroom
  "reminder.schedule": 5, // bound the runaway-reminders failure mode
  "regulatory.search": 8, // bounded: a single answer rarely needs >3-4 SEC/IRS lookups
  "inconsistency.detect": 4, // expensive (full doc content in prompt); rarely needs more
  "workflow.propose": 2,  // one ask = one proposal; cap covers a "and also..." follow-up
  "workflow.run": 3,      // trigger existing workflows; 3 covers multi-step asks
  "workflow.list_templates": 3,
  "workflow.clone_template": 40, // cloning all 33 templates in one go is a valid ask
  "workflow.list": 3,            // read-only; cheap
  "workflow.update": 10,         // bulk email swap needs one per workflow
  "workflow.execution_status": 5, // status checks; read-only
  "workflow.migrate": 2,        // migration is heavy; once dry-run + once real
  "secrets.set": 10,            // setting up secrets for workflow configs
  "secrets.list": 3,            // read-only; cheap
  "file_index.search": 5,
  "file_index.ingest": 3,
  "file_index.list_folder": 5,
  "site_scan.search": 5,
  "site_scan.detail": 5,
  "site_scan.listings": 3,
  "site_scan.void_analysis": 3,
  "survey_area": 3,
  "tenant_site_search": 3,
  "web.search": 10,
  "cre.calculate": 10, // cheap (pure math), but cap to prevent runaway loops
  "document.create": 5,  // each creates a file in storage + vault row; 5 is generous
  "document.edit": 5,    // re-renders + re-uploads; match create budget
  "document.list_templates": 3, // read-only; cheap
  "document.save_template": 3,  // one save per request is typical
  "agent.delegate": 3,          // sub-agent spawns are expensive; 3 max per run
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

/**
 * Returns true if the email address belongs to the authenticated user
 * (self-send). Used by email.send to decide whether to skip the
 * supervisor review queue.
 */
async function isUserOwnEmail(
  toLower: string,
  ctx: AgentToolCtx,
): Promise<boolean> {
  if (!ctx.userId) return false;
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(ctx.userId);
    const userEmail = data.user?.email;
    return Boolean(userEmail && userEmail.toLowerCase() === toLower);
  } catch {
    return false;
  }
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
      const hasRealContent = hits.some((h) => !h.content.startsWith("[File ") && !h.content.startsWith("[Document "));
      const hasPendingFiles = hits.some((h) => h.content.includes("ingestion was triggered automatically"));
      const note = !hasRealContent && hasPendingFiles
        ? "\n\nNOTE: file ingestion is in progress. Call vault.cite with the same query to check if content is now available."
        : "";
      return { hits, formatted: formatHitsForPrompt(hits) + note };
    }
    case "regulatory.search": {
      // Industry filter scopes regulatory results to CRE-relevant
      // bodies (HUD, state RE commissions, SEC/FTC). One small lookup
      // per call, bounded by the tool budget (8) so cost is negligible.
      const { data: ws } = await supabaseAdmin
        .from("workspaces")
        .select("industry")
        .eq("id", ctx.workspaceId)
        .maybeSingle();
      const industry = "real_estate" as const;
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
      try {
        let docIds = Array.isArray(args.doc_ids)
          ? (args.doc_ids as unknown[]).map((x) => String(x)).filter(Boolean)
          : [];
        if (docIds.length > 0 && ctx.accessibleProjectIds) {
          const { data: docRows } = await supabaseAdmin
            .from("vault_items")
            .select("id, project_id")
            .in("id", docIds)
            .eq("workspace_id", ctx.workspaceId);
          const allowed = new Set(ctx.accessibleProjectIds);
          docIds = (docRows || [])
            .filter((d: any) => !d.project_id || allowed.has(d.project_id))
            .map((d: any) => d.id);
        }
        if (docIds.length < 2) {
          return { findings: [], formatted: "(need at least 2 accessible documents to compare)" };
        }
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
    case "clients.create": {
      const name = String(args.name || "").trim();
      if (!name) return { error: "clients.create: name is required." };

      if (ctx.simulate) {
        return { simulated: true, would_have: { action: "clients.create", name } };
      }

      const VALID_STAGES = ["lead", "prospect", "active", "inactive", "archived"];
      const insert: Record<string, unknown> = {
        workspace_id: ctx.workspaceId,
        name,
        email: args.email ? String(args.email).trim().toLowerCase() : null,
        phone: args.phone ? String(args.phone).trim() : null,
        stage:
          typeof args.stage === "string" && VALID_STAGES.includes(args.stage)
            ? args.stage
            : "lead",
        date_of_birth:
          typeof args.date_of_birth === "string" ? args.date_of_birth : null,
        spouse_date_of_birth:
          typeof args.spouse_date_of_birth === "string" ? args.spouse_date_of_birth : null,
        state_code:
          typeof args.state_code === "string"
            ? args.state_code.trim().toUpperCase().slice(0, 2) || null
            : null,
        is_planning_subject:
          typeof args.is_planning_subject === "boolean"
            ? args.is_planning_subject
            : true,
      };

      const { data: created, error: createErr } = await supabaseAdmin
        .from("contacts")
        .insert(insert)
        .select("id, name, email, phone, stage")
        .single();
      if (createErr) {
        // Phone-uniqueness collisions are the common case — surface a
        // clear message so the agent can fall back to clients.query +
        // clients.update on the existing row.
        if (createErr.code === "23505") {
          return {
            error:
              `clients.create: a contact with this phone already exists in the workspace. ` +
              `Use clients.query to find the existing contact then clients.update to patch it.`,
          };
        }
        return { error: `clients.create: ${createErr.message}` };
      }
      return {
        ok: true,
        contact: created,
        message: `Created contact ${name}.`,
      };
    }
    case "properties.query": {
      const PROPERTY_COLS =
        "id, address_line1, address_line2, city, state, zip, beds, baths, sqft, " +
        "kind, list_price_cents, status, listed_at, sold_at, notes, description, " +
        "year_built, lot_size_sqft, lease_term_months, lease_start_date, " +
        "lease_end_date, monthly_rent_cents, transaction_stage, " +
        "expected_close_date, updated_at";
      let pq = supabaseAdmin
        .from("properties")
        .select(PROPERTY_COLS)
        .eq("workspace_id", ctx.workspaceId)
        .order("updated_at", { ascending: false });
      const pFilter = (args.filter as Record<string, string>) || {};
      for (const [k, v] of Object.entries(pFilter)) {
        if (v == null || v === "") continue;
        pq = pq.eq(k, v);
      }
      if (args.search && typeof args.search === "string") {
        pq = pq.ilike("address_line1", `%${args.search}%`);
      }
      pq = pq.limit(Math.min(Math.max(Number(args.limit) || 25, 1), 100));
      const { data: pData, error: pErr } = await pq;
      if (pErr) return { error: pErr.message };
      return { properties: pData || [], count: pData?.length ?? 0 };
    }

    case "properties.create": {
      const addr = String(args.address_line1 || "").trim();
      if (!addr) return { error: "properties.create: address_line1 is required." };

      if (ctx.simulate) {
        return { simulated: true, would_have: { action: "properties.create", address: addr } };
      }

      const VALID_STATUSES = ["active", "pending", "sold", "withdrawn", "off_market"];
      const VALID_KINDS = ["residential", "commercial", "rental", "land", "other"];

      const insert: Record<string, unknown> = {
        workspace_id: ctx.workspaceId,
        created_by: ctx.userId ?? null,
        address_line1: addr,
        address_line2: args.address_line2 ? String(args.address_line2).trim() : null,
        city: args.city ? String(args.city).trim() : null,
        state: args.state ? String(args.state).trim() : null,
        zip: args.zip ? String(args.zip).trim() : null,
        beds: typeof args.beds === "number" ? args.beds : null,
        baths: typeof args.baths === "number" ? args.baths : null,
        sqft: typeof args.sqft === "number" ? args.sqft : null,
        kind: typeof args.kind === "string" && VALID_KINDS.includes(args.kind) ? args.kind : null,
        list_price_cents: typeof args.list_price_cents === "number" ? args.list_price_cents : null,
        status: typeof args.status === "string" && VALID_STATUSES.includes(args.status) ? args.status : "active",
        notes: args.notes ? String(args.notes).trim() : null,
        description: args.description ? String(args.description).trim() : null,
        year_built: typeof args.year_built === "number" ? args.year_built : null,
        lot_size_sqft: typeof args.lot_size_sqft === "number" ? args.lot_size_sqft : null,
        lease_term_months: typeof args.lease_term_months === "number" ? args.lease_term_months : null,
        lease_start_date: typeof args.lease_start_date === "string" ? args.lease_start_date : null,
        lease_end_date: typeof args.lease_end_date === "string" ? args.lease_end_date : null,
        monthly_rent_cents: typeof args.monthly_rent_cents === "number" ? args.monthly_rent_cents : null,
      };
      if (Array.isArray(args.interior_features)) {
        insert.interior_features = (args.interior_features as string[]).map(String).filter(Boolean).slice(0, 40);
      }
      if (Array.isArray(args.exterior_features)) {
        insert.exterior_features = (args.exterior_features as string[]).map(String).filter(Boolean).slice(0, 40);
      }

      const { data: created, error: createErr } = await supabaseAdmin
        .from("properties")
        .insert(insert)
        .select("id, address_line1, city, state, kind, status")
        .single();
      if (createErr) return { error: `properties.create: ${createErr.message}` };
      return {
        ok: true,
        property: created,
        message: `Created property at ${addr}.`,
      };
    }

    case "properties.update": {
      const propId = String(args.property_id || "").trim();
      if (!propId) return { error: "properties.update: property_id required. Call properties.query first." };

      if (ctx.simulate) {
        return { simulated: true, would_have: { action: "properties.update", property_id: propId, patch: args.patch } };
      }

      const ALLOWED_PROPERTY_FIELDS = new Set([
        "address_line1", "address_line2", "city", "state", "zip",
        "beds", "baths", "sqft", "kind", "list_price_cents", "status",
        "notes", "description", "year_built", "lot_size_sqft",
        "lease_term_months", "lease_start_date", "lease_end_date",
        "monthly_rent_cents", "transaction_stage", "expected_close_date",
        "interior_features", "exterior_features", "listed_at", "sold_at",
      ]);
      const rawPropPatch = (args.patch as Record<string, unknown>) || {};
      const propPatch: Record<string, unknown> = {};
      const propRejected: string[] = [];
      for (const [k, v] of Object.entries(rawPropPatch)) {
        if (ALLOWED_PROPERTY_FIELDS.has(k)) propPatch[k] = v;
        else propRejected.push(k);
      }
      if (Object.keys(propPatch).length === 0) {
        return {
          error: `properties.update: no allowed fields (rejected: ${propRejected.join(", ") || "none"}). Allowed: ${[...ALLOWED_PROPERTY_FIELDS].join(", ")}.`,
        };
      }

      // Auto-stamp lifecycle timestamps
      if (propPatch.status === "sold" && !propPatch.sold_at) {
        propPatch.sold_at = new Date().toISOString();
      }
      if (propPatch.transaction_stage) {
        propPatch.stage_entered_at = new Date().toISOString();
      }

      const { data: updatedProp, error: updatePropErr } = await supabaseAdmin
        .from("properties")
        .update(propPatch)
        .eq("id", propId)
        .eq("workspace_id", ctx.workspaceId)
        .select("id, address_line1, city, state, status, transaction_stage")
        .single();
      if (updatePropErr) return { error: `properties.update: ${updatePropErr.message}` };
      return {
        ok: true,
        property: updatedProp,
        updated_fields: Object.keys(propPatch),
        rejected_fields: propRejected.length ? propRejected : undefined,
      };
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

      // Route through the supervisor review queue. All agent-initiated
      // emails go through review -- the supervisor's approval click is
      // the compliance event. This is intentionally different from the
      // old fire-and-forget path: even though the user typed the
      // instruction in chat, the actual email content is model-generated
      // and should be reviewed.
      //
      // Self-sends (user emailing themselves) bypass the queue -- there
      // is no supervision concern when you email yourself.
      const isSelfSend = await isUserOwnEmail(toRaw, ctx);
      if (isSelfSend) {
        // Direct send for self-emails (no review needed)
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

      // Contact email: resolve the contact_id for the review queue
      const { data: emailContact } = await supabaseAdmin
        .from("contacts")
        .select("id, full_name")
        .eq("workspace_id", ctx.workspaceId)
        .ilike("email", toRaw)
        .maybeSingle();

      const { stageForReview } = await import("@/lib/review-queue/stage");

      const staged = await stageForReview({
        workspaceId: ctx.workspaceId,
        kind: "email",
        payload: {
          to: args.to,
          to_name: (emailContact as { full_name?: string } | null)?.full_name || args.to,
          subject: args.subject,
          body: args.text || args.html || "",
          html: args.html,
          text: args.text,
        },
        sourceKind: "agent",
        sourceId: ctx.runId,
        contactId: (emailContact as { id?: string } | null)?.id || undefined,
        sendCallback: {
          route: "/api/review/send-callback",
          data: {
            kind: "email",
            to_email: args.to,
            subject: args.subject,
            html: args.html,
            text: args.text,
            workspace_id: ctx.workspaceId,
            user_id: ctx.userId,
          },
        },
      });

      return {
        ok: true,
        review_queue_id: staged.id,
        delivery: "email_queued",
        to: args.to,
        subject: args.subject,
        message:
          "Email queued for supervisor review. A workspace owner or supervisor must approve before it sends. The user can check the review queue at /review.",
      };
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
      const citeProject = args.project_id ? String(args.project_id) : ctx.projectId;
      if (citeProject && ctx.accessibleProjectIds && !ctx.accessibleProjectIds.includes(citeProject)) {
        return { citations: [] };
      }
      let citeHits = await searchArchive({
        workspaceId: ctx.workspaceId,
        query: String(args.query || ""),
        k: Math.min(Math.max(Number(args.k) || 3, 1), 10),
        projectId: citeProject,
      });
      if (!citeProject && ctx.accessibleProjectIds) {
        const allowed = new Set(ctx.accessibleProjectIds);
        citeHits = citeHits.filter((h) => !h.project_id || allowed.has(h.project_id));
      }
      // Filter out placeholder hits — vault.cite should only return
      // citable content, not "ingestion in progress" stubs.
      citeHits = citeHits.filter(
        (h) => !h.content.startsWith("[File ") && !h.content.startsWith("[Document "),
      );
      return {
        citations: citeHits.map((h, i) => ({
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
    case "agent.delegate": {
      // Spawn a focused sub-agent with a limited tool set and step
      // budget. The sub-agent runs to completion and returns its
      // final text. This enables multi-agent orchestration: the
      // parent agent can break complex tasks into focused sub-tasks.
      const subObjective = String(args.objective || "").trim();
      if (!subObjective) return { error: "agent.delegate: 'objective' is required" };

      const subToolNames = (args.tools as string[] || []).filter(
        (t): t is AgentToolName =>
          typeof t === "string" && t in TOOL_DEFS,
      );
      if (subToolNames.length === 0) {
        return { error: "agent.delegate: at least one valid tool name is required in 'tools'" };
      }

      // Safety: sub-agents cannot delegate further (no recursion bomb)
      const filteredTools = subToolNames.filter((t) => t !== "agent.delegate");

      const subMaxSteps = Math.min(Math.max(Number(args.max_steps) || 5, 1), 10);
      const subContext = args.context ? String(args.context) : "";

      const subObjectiveFull = subContext
        ? `Context from parent agent:\n${subContext}\n\nYour objective:\n${subObjective}`
        : subObjective;

      try {
        agentLog.info("delegating to sub-agent", {
          objective: subObjective.slice(0, 200),
          tools: filteredTools,
          maxSteps: subMaxSteps,
        });

        const subResult = await runAgent({
          step: {
            id: `${ctx.parentStepId}:delegate:${Date.now()}`,
            type: "agent",
            name: "sub-agent",
            config: {
              objective: subObjectiveFull,
              tools: filteredTools,
              max_steps: subMaxSteps,
              model: undefined, // inherit workspace model
            },
          },
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          simulate: ctx.simulate,
          runId: ctx.runId,
          log: ctx.log,
        });

        const outputText = typeof subResult.output === "string"
          ? subResult.output
          : subResult.text || JSON.stringify(subResult.output);
        return {
          status: "completed",
          output: outputText.slice(0, 8000) || "(no output)",
          steps_used: subResult.steps_taken,
          truncated: subResult.truncated,
        };
      } catch (err) {
        agentLog.warn("sub-agent delegation failed", {
          error: err instanceof Error ? err.message : String(err),
        });
        return { error: `delegation failed: ${err instanceof Error ? err.message : String(err)}` };
      }
    }
    case "reminder.schedule": {
      // v2: self-reminders fire immediately via workflow; contact
      // messages stage through the supervisor review queue.
      //
      // Refusal cases (return { error } so the model can recover):
      //   - missing userId: not invoked from a chat
      //   - sms_phone missing (for self): user hasn't enrolled
      //   - when not a future ISO timestamp
      //   - contact_id invalid or no phone on file (for contact)
      const recipient = String(args.recipient || "self");
      if (recipient !== "self" && recipient !== "contact") {
        return { error: "reminder.schedule: recipient must be 'self' or 'contact'." };
      }
      const channel = String(args.channel || "sms");
      if (channel !== "sms") {
        return { error: "reminder.schedule: only channel='sms' is supported." };
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
            "reminder.schedule: no authenticated user in this run, cannot schedule. Tell the user this needs to be requested from a Dante chat, not a workflow.",
        };
      }

      // ── Contact path: stage for supervisor review ──────────────
      if (recipient === "contact") {
        const contactId = String(args.contact_id || "").trim();
        if (!contactId) {
          return {
            error:
              "reminder.schedule: contact_id is required when recipient='contact'. Look up the contact first with contacts.search.",
          };
        }

        // Verify the contact belongs to this workspace and has a phone
        const { data: contact } = await supabaseAdmin
          .from("contacts")
          .select("id, full_name, phone")
          .eq("id", contactId)
          .eq("workspace_id", ctx.workspaceId)
          .maybeSingle();
        if (!contact) {
          return {
            error:
              "reminder.schedule: contact not found in this workspace. Verify the contact_id.",
          };
        }
        const contactPhone = (contact as { phone?: string }).phone;
        if (!contactPhone) {
          return {
            error: `reminder.schedule: ${(contact as { full_name?: string }).full_name || "this contact"} has no phone number on file. Ask the user to add one first.`,
          };
        }

        // Import stageForReview dynamically to avoid circular deps
        const { stageForReview } = await import("@/lib/review-queue/stage");

        const staged = await stageForReview({
          workspaceId: ctx.workspaceId,
          kind: "sms",
          payload: {
            to: contactPhone,
            to_name: (contact as { full_name?: string }).full_name || "Contact",
            body,
            scheduled_for: when.toISOString(),
          },
          sourceKind: "agent",
          sourceId: ctx.runId,
          contactId,
          sendCallback: {
            route: "/api/review/send-callback",
            data: {
              kind: "sms",
              to_phone: contactPhone,
              body,
              workspace_id: ctx.workspaceId,
              user_id: ctx.userId,
              contact_id: contactId,
            },
          },
        });

        return {
          ok: true,
          review_queue_id: staged.id,
          delivery: "contact_sms_queued",
          contact_name: (contact as { full_name?: string }).full_name,
          scheduled_for: when.toISOString(),
          message:
            "Queued for supervisor review. A workspace owner or supervisor must approve before the SMS is sent. The user can check the review queue at /review.",
        };
      }

      // ── Self path: create workflow directly (no review needed) ──

      // Look up the user's enrolled phone. profiles.sms_phone is set
      // via /settings -> Phone enrollment + verification flow.
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("sms_phone, full_name")
        .eq("id", ctx.userId)
        .maybeSingle();
      const phone = (prof as { sms_phone?: string } | null)?.sms_phone;
      if (!phone) {
        return {
          error:
            "reminder.schedule: this user hasn't enrolled an SMS phone number. Tell them to set one up in Settings, then ask again.",
        };
      }

      // NOTE: this tool deliberately ignores ctx.simulate.
      // The chat route runs the agent with simulate=true so unsafe
      // tools (email.send, update_contact, memory.write) don't take
      // real action during a Q&A turn. reminder.schedule is the
      // exception -- it's a tool the user EXPLICITLY asked to fire
      // ("text me in 3 minutes"), and the action is internal-only
      // (a row in dante_workflows targeting the user's own phone).
      // Its own guardrails -- recipient must be "self", target time
      // must be >= 30s future, sms_phone must be verified -- already
      // make it safe to commit. Without this override, the agent
      // would always return simulated:true, the model would summarize
      // "Set!", and no workflow would be created.

      // Build the workflow graph: trigger_at -> send_sms.
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
          "Scheduled. The user can view or cancel it from Workflows.",
      };
    }
    case "workflow.propose": {
      // Creates and activates a persistent workflow. The n8n workflow
      // JSON is generated from the model's natural-language `intent`,
      // pushed to n8n (active), and inserted into dante_workflows
      // with enabled=true. The chat prompt instructs the model to ask
      // for user confirmation before calling this tool.
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

      // Check which integrations this workspace has connected so the
      // generated workflow can include integration_query nodes for
      // available providers and skip ones that aren't set up.
      const { data: connections } = await supabaseAdmin
        .from("integration_connections")
        .select("provider, provider_kind, display_name")
        .eq("workspace_id", ctx.workspaceId)
        .eq("status", "connected");

      let generated;
      try {
        generated = await generateN8nWorkflow({
          prompt: intent,
          connectedIntegrations: (connections || []).map((c: { provider: string; provider_kind: string | null; display_name: string | null }) => ({
            provider: c.provider,
            provider_kind: c.provider_kind,
            display_name: c.display_name,
          })),
        });
      } catch (err) {
        return {
          error: `workflow.propose: graph generation failed -- ${
            err instanceof Error ? err.message : String(err)
          }`,
        };
      }

      // Determine trigger type from the n8n workflow nodes
      const triggerNode = generated.workflow.nodes.find((n) =>
        n.type.includes("Trigger") || n.type.includes("trigger") || n.type.includes("webhook"),
      );
      const triggerType = triggerNode
        ? triggerNode.type.includes("scheduleTrigger") ? "cron"
          : triggerNode.type.includes("webhook") ? "webhook"
          : "manual"
        : "manual";

      // Push to n8n as active -- the user already confirmed in chat
      let n8nWorkflowId: string | undefined;
      try {
        n8nWorkflowId = await n8nBridge.createWorkspaceWorkflow(
          ctx.workspaceId,
          { ...generated.workflow, active: true },
        );
      } catch (err) {
        agentLog.warn("workflow.propose: n8n push failed, saving locally", {
          err: err instanceof Error ? err.message : String(err),
        });
      }

      const insertPayload: Record<string, unknown> = {
        workspace_id: ctx.workspaceId,
        created_by: ctx.userId ?? null,
        name: summary.slice(0, 80) || generated.name,
        description: generated.description || intent.slice(0, 280),
        enabled: true,
        proposal_state: null,
        trigger: { type: triggerType },
        steps: generated.workflow.nodes.map((n) => ({
          id: n.id,
          type: n.type,
          name: n.name,
          parameters: n.parameters,
        })),
        graph: generated.workflow,
        n8n_workflow_id: n8nWorkflowId || null,
      };

      const { data: wf, error: insertErr } = await supabaseAdmin
        .from("dante_workflows")
        .insert(insertPayload)
        .select("id")
        .single();
      if (insertErr) {
        return { error: `workflow.propose: ${insertErr.message}` };
      }

      // Patch the webhook trigger path to use the Drift workflow ID,
      // then activate so n8n registers the webhook endpoint. Without
      // this step, the trigger has a placeholder path ("trigger" or
      // "{{DRIFT_WORKFLOW_ID}}") and workflow.run hits a 405.
      const driftWfId = (wf as { id: string }).id;
      if (n8nWorkflowId) {
        try {
          await n8nBridge.ensureWebhookTrigger(n8nWorkflowId, driftWfId);
        } catch (err) {
          agentLog.warn("workflow.propose: webhook patch failed", {
            n8nWorkflowId,
            driftWfId,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return {
        ok: true,
        workflow_id: driftWfId,
        title: insertPayload.name,
        trigger_type: triggerType,
        n8n_synced: !!n8nWorkflowId,
        message:
          "Workflow created and activated. It will run on its schedule automatically.",
      };
    }

    case "workflow.run": {
      const nameQuery = String(args.workflow_name || "").trim();
      if (!nameQuery) return { error: "workflow.run: 'workflow_name' required." };

      // Fetch workflows including n8n_workflow_id for the bridge
      const { data: workflows } = await supabaseAdmin
        .from("dante_workflows")
        .select("id, name, graph, enabled, n8n_workflow_id")
        .eq("workspace_id", ctx.workspaceId)
        .is("proposal_state", null)
        .order("updated_at", { ascending: false });

      if (!workflows || workflows.length === 0) {
        return { error: "workflow.run: no workflows found in this workspace." };
      }

      const lowerQuery = nameQuery.toLowerCase();
      const match = workflows.find((w: any) => w.name.toLowerCase() === lowerQuery)
        || workflows.find((w: any) => w.name.toLowerCase().includes(lowerQuery));
      if (!match) {
        const available = workflows.slice(0, 10).map((w: any) => w.name);
        return {
          error: `workflow.run: no workflow matching "${nameQuery}". Available: ${available.join(", ")}`,
        };
      }

      const wfInput = (args.input as Record<string, unknown>) || {};

      // Pre-flight: scan workflow graph for {{secrets.*}} references
      // and check which ones are actually set. If any are missing,
      // return the list so the agent can ask the user and set them
      // via secrets.set before retrying.
      const graphJson = JSON.stringify(match.graph || {});
      const secretRefs = [...new Set(
        Array.from(graphJson.matchAll(/\{\{\s*secrets\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g))
          .map((m) => m[1]),
      )];

      if (secretRefs.length > 0) {
        const { loadWorkspaceSecrets } = await import("@/lib/dante/secrets");
        const currentSecrets = await loadWorkspaceSecrets(ctx.workspaceId);
        const missing = secretRefs.filter((k) => !currentSecrets[k]);
        if (missing.length > 0) {
          // Human-readable labels + placeholders for common secret keys
          const SECRET_LABELS: Record<string, { label: string; placeholder: string }> = {
            broker_email: { label: "Delivery email", placeholder: "you@company.com" },
            corridor_anchors: { label: "Corridor anchor points", placeholder: "e.g. US-30 & Rte 42, Medina OH; I-71 & Rte 18" },
            target_use: { label: "Target use", placeholder: "e.g. retail strip center, medical office, industrial" },
            target_zoning: { label: "Target zoning", placeholder: "e.g. C-2, I-1, mixed-use" },
            acreage_min: { label: "Minimum acreage", placeholder: "e.g. 1" },
            acreage_max: { label: "Maximum acreage", placeholder: "e.g. 10" },
          };
          const fields = missing.map((k) => ({
            key: k,
            label: SECRET_LABELS[k]?.label || k.replace(/_/g, " "),
            placeholder: SECRET_LABELS[k]?.placeholder || "",
          }));

          // Emit a needs_input event so the client renders an inline
          // configuration card instead of just showing an error message.
          if (ctx.onEvent) {
            ctx.onEvent({
              type: "needs_input",
              question: `"${match.name}" needs ${missing.length} value${missing.length === 1 ? "" : "s"} before it can run.`,
              fields,
              workflow_name: match.name,
            });
          }

          return {
            error: `workflow.run: workflow "${match.name}" requires ${missing.length} secret(s) ` +
              `that are not configured: ${missing.join(", ")}. ` +
              `Ask the user for these values and set them with secrets.set before running again.`,
            missing_secrets: missing,
            workflow_name: match.name,
            workflow_id: match.id,
          };
        }
      }

      // ── n8n execution path ──────────────────────────────────
      // All workflows execute via n8n. If this workflow has no
      // n8n_workflow_id yet, JIT-push it to n8n first.
      let n8nId = (match as any).n8n_workflow_id as string | null;

      if (!n8nId) {
        // JIT push: convert the graph and create in n8n
        try {
          const graph = match.graph as Record<string, unknown> | null;
          if (!graph || !Array.isArray((graph as any).nodes)) {
            return { error: `workflow.run: "${match.name}" has no graph definition. It needs to be re-created.` };
          }

          const hasEdges = Array.isArray(graph.edges);
          const hasConnections = !!graph.connections;
          const nodes = graph.nodes as Array<Record<string, unknown>>;
          const hasN8nNodeTypes = nodes.some(
            (n) => typeof n.type === "string" && (n.type as string).includes("."),
          );
          const isN8nNative = hasConnections || (!hasEdges && Array.isArray(nodes));
          const isDriftWrappedN8n = hasEdges && hasN8nNodeTypes;

          let n8nJson: import("@/lib/dante/n8n-types").N8nWorkflowJSON;

          if (isN8nNative) {
            n8nJson = graph as unknown as import("@/lib/dante/n8n-types").N8nWorkflowJSON;
          } else if (isDriftWrappedN8n) {
            const { restructureDriftWrappedN8n } = await import("@/lib/dante/n8n-migration");
            n8nJson = restructureDriftWrappedN8n(graph, match.id);
          } else {
            const { convertDriftToN8n } = await import("@/lib/dante/n8n-converter");
            const conversion = convertDriftToN8n(
              graph as unknown as import("@/lib/dante/workflow-types").WorkflowGraph,
              match.name || "Untitled",
            );
            n8nJson = conversion.workflow;
          }

          n8nBridge.patchGraphTrigger(n8nJson.nodes, match.id);
          n8nBridge.patchGraphCredentials(n8nJson.nodes);

          n8nId = await n8nBridge.createWorkspaceWorkflow(
            ctx.workspaceId,
            { ...n8nJson, active: true },
          );
          // Persist so we don't JIT-push again
          await supabaseAdmin
            .from("dante_workflows")
            .update({ n8n_workflow_id: n8nId })
            .eq("id", match.id);
        } catch (jitErr) {
          agentLog.error("workflow.run: JIT push to n8n failed", {
            err: jitErr instanceof Error ? jitErr.message : String(jitErr),
            workflowId: match.id,
          });
          return {
            error: `workflow.run: "${match.name}" has no n8n engine and auto-push failed: ${
              jitErr instanceof Error ? jitErr.message : String(jitErr)
            }`,
          };
        }
      }

      {
        const syncMode = !!args.wait_for_result;

        // The webhook path is always the Drift workflow ID —
        // patchGraphTrigger sets it during JIT push or initial creation.
        const webhookPath = match.id;

        try {
          // Ensure the workflow is active in n8n before executing
          await n8nBridge.activateWorkflow(n8nId!);

          let executionId: string;
          let executionResult: unknown = undefined;

          if (syncMode) {
            const execResult = await n8nBridge.executeSync(webhookPath, wfInput);
            executionId = execResult.id;
            executionResult = execResult.data;
          } else {
            executionId = await n8nBridge.executeAsync(webhookPath, wfInput);
          }

          // Record the run in dante_workflow_runs
          await supabaseAdmin.from("dante_workflow_runs").insert({
            workflow_id: match.id,
            workspace_id: ctx.workspaceId,
            status: "running",
            started_at: new Date().toISOString(),
            n8n_execution_id: executionId,
            result: { triggered_by: ctx.userId || null, input: wfInput },
          });

          return {
            ok: true,
            run_id: executionId,
            workflow_name: match.name,
            workflow_id: match.id,
            engine: "n8n",
            input_provided: wfInput,
            ...(executionResult ? { result: executionResult } : {}),
            message: syncMode
              ? `Workflow "${match.name}" completed.`
              : `Workflow "${match.name}" has been triggered via n8n. Results will be pushed back when complete.`,
          };
        } catch (err) {
          agentLog.error("workflow.run: n8n execution failed", {
            err: err instanceof Error ? err.message : String(err),
            n8nId,
          });
          return {
            error: `workflow.run: n8n execution failed — ${
              err instanceof Error ? err.message : String(err)
            }`,
          };
        }
      }
    }

    case "workflow.list_templates": {
      const { WORKFLOW_TEMPLATES } = await import("@/lib/dante/templates");
      const categoryFilter = args.category ? String(args.category) : null;
      const templates = WORKFLOW_TEMPLATES
        .filter((t) => !categoryFilter || t.category === categoryFilter)
        .map((t) => ({
          slug: t.slug,
          name: t.name,
          description: t.description,
          category: t.category,
          trigger: t.triggerLabel,
        }));
      return {
        templates,
        count: templates.length,
        categories: [...new Set(WORKFLOW_TEMPLATES.map((t) => t.category))],
      };
    }

    case "workflow.clone_template": {
      const slug = String(args.slug || "").trim();
      if (!slug) return { error: "workflow.clone_template: 'slug' required. Call workflow.list_templates first to see available slugs." };

      if (ctx.simulate) {
        return { simulated: true, would_have: { action: "workflow.clone_template", slug } };
      }

      // Check for n8n version first (Phase 1 — top 5 templates converted)
      const { getN8nTemplate } = await import("@/lib/dante/n8n-templates");
      const n8nTemplate = getN8nTemplate(slug);

      if (n8nTemplate) {
        // Clone via n8n: push to n8n, save reference in Drift DB
        const workflowJson = structuredClone(n8nTemplate.workflow);

        // Determine trigger type from n8n node types
        const triggerNode = workflowJson.nodes.find(
          (n) => n.type.includes("Trigger") || n.type.includes("trigger") || n.type.includes("webhook"),
        );
        const triggerType = triggerNode
          ? triggerNode.type.includes("scheduleTrigger") ? "cron"
            : triggerNode.type.includes("webhook") ? "webhook"
            : "manual"
          : "manual";

        // Push to n8n (active — template clones are ready to use)
        let n8nWorkflowId: string | undefined;
        try {
          n8nWorkflowId = await n8nBridge.createWorkspaceWorkflow(
            ctx.workspaceId,
            { ...workflowJson, active: true },
          );
        } catch (err) {
          agentLog.warn("workflow.clone_template: n8n push failed", {
            err: err instanceof Error ? err.message : String(err),
            slug,
          });
        }

        const { data: wf, error: insertErr } = await supabaseAdmin
          .from("dante_workflows")
          .insert({
            workspace_id: ctx.workspaceId,
            created_by: ctx.userId ?? null,
            name: n8nTemplate.name,
            description: n8nTemplate.description,
            trigger: { type: triggerType },
            steps: workflowJson.nodes.map((n) => ({
              id: n.id,
              type: n.type,
              name: n.name,
              parameters: n.parameters,
            })),
            graph: workflowJson,
            enabled: true,
            n8n_workflow_id: n8nWorkflowId || null,
          })
          .select("id")
          .single();

        if (insertErr) {
          return { error: `workflow.clone_template: ${insertErr.message}` };
        }

        // Patch webhook trigger path so workflow.run can hit it
        const clonedId = (wf as { id: string }).id;
        if (n8nWorkflowId) {
          try {
            await n8nBridge.ensureWebhookTrigger(n8nWorkflowId, clonedId);
          } catch (err) {
            agentLog.warn("workflow.clone_template: webhook patch failed", {
              n8nWorkflowId,
              clonedId,
              err: err instanceof Error ? err.message : String(err),
            });
          }
        }

        return {
          ok: true,
          workflow_id: clonedId,
          name: n8nTemplate.name,
          category: n8nTemplate.category,
          trigger: n8nTemplate.triggerLabel,
          engine: "n8n",
          n8n_synced: !!n8nWorkflowId,
          message: `Cloned "${n8nTemplate.name}" into your workspace. It's enabled and ready to use.`,
        };
      }

      // Fall back to legacy Drift-format template — auto-convert to n8n
      const { getTemplate } = await import("@/lib/dante/templates");
      const template = getTemplate(slug);
      if (!template) {
        return { error: `workflow.clone_template: unknown template "${slug}". Call workflow.list_templates to see available slugs.` };
      }

      // Auto-convert legacy template to n8n format
      const { convertDriftToN8n } = await import("@/lib/dante/n8n-converter");
      const conversion = convertDriftToN8n(template.graph, template.name);
      const workflowJson = conversion.workflow;

      // Determine trigger type from converted nodes
      const cvtTriggerNode = workflowJson.nodes.find(
        (n) => n.type.includes("Trigger") || n.type.includes("trigger") || n.type.includes("webhook"),
      );
      const triggerType = cvtTriggerNode
        ? cvtTriggerNode.type.includes("scheduleTrigger") ? "cron"
          : cvtTriggerNode.type.includes("webhook") ? "webhook"
          : "manual"
        : "manual";

      // Push to n8n
      let n8nWorkflowId: string | undefined;
      try {
        n8nWorkflowId = await n8nBridge.createWorkspaceWorkflow(
          ctx.workspaceId,
          { ...workflowJson, active: true },
        );
      } catch (err) {
        agentLog.warn("workflow.clone_template: n8n push failed (auto-converted)", {
          err: err instanceof Error ? err.message : String(err),
          slug,
          unmapped: conversion.unmappedTypes,
        });
      }

      const { data: wf, error: insertErr } = await supabaseAdmin
        .from("dante_workflows")
        .insert({
          workspace_id: ctx.workspaceId,
          created_by: ctx.userId ?? null,
          name: template.name,
          description: template.description,
          trigger: { type: triggerType },
          steps: workflowJson.nodes.map((n) => ({
            id: n.id,
            type: n.type,
            name: n.name,
            parameters: n.parameters,
          })),
          graph: workflowJson,
          enabled: true,
          n8n_workflow_id: n8nWorkflowId || null,
        })
        .select("id")
        .single();

      if (insertErr) {
        return { error: `workflow.clone_template: ${insertErr.message}` };
      }

      // Patch webhook trigger path so workflow.run can hit it
      const legacyClonedId = (wf as { id: string }).id;
      if (n8nWorkflowId) {
        try {
          await n8nBridge.ensureWebhookTrigger(n8nWorkflowId, legacyClonedId);
        } catch (err) {
          agentLog.warn("workflow.clone_template: webhook patch failed (auto-converted)", {
            n8nWorkflowId,
            legacyClonedId,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return {
        ok: true,
        workflow_id: legacyClonedId,
        name: template.name,
        category: template.category,
        trigger: template.triggerLabel,
        engine: "n8n",
        auto_converted: true,
        n8n_synced: !!n8nWorkflowId,
        warnings: conversion.warnings.length > 0 ? conversion.warnings : undefined,
        message: `Cloned "${template.name}" into your workspace (auto-converted to n8n). ${n8nWorkflowId ? "Synced and active." : "Saved locally; n8n sync pending."}`,
      };
    }

    case "workflow.list": {
      const includeDisabled = Boolean(args.include_disabled);
      let query = supabaseAdmin
        .from("dante_workflows")
        .select("id, name, description, enabled, trigger, graph, last_run_at, last_run_status, created_at, updated_at, n8n_workflow_id")
        .eq("workspace_id", ctx.workspaceId)
        .is("proposal_state", null)
        .order("updated_at", { ascending: false });
      if (!includeDisabled) {
        query = query.eq("enabled", true);
      }
      const { data: workflows, error: listErr } = await query;
      if (listErr) return { error: `workflow.list: ${listErr.message}` };
      if (!workflows || workflows.length === 0) {
        return { workflows: [], count: 0, message: "No workflows found in this workspace." };
      }

      // Summarize each workflow's nodes so the model can see what they do
      const items = workflows.map((w: Record<string, unknown>) => {
        const graph = w.graph as { nodes?: Array<{ id: string; type: string; data?: { step?: { name?: string; config?: Record<string, unknown> } } }> } | null;
        const nodes = graph?.nodes || [];
        const nodeSummary = nodes
          .filter((n) => !n.type.startsWith("trigger_"))
          .map((n) => {
            const cfg = n.data?.step?.config || {};
            const details: string[] = [];
            // Extract key config values that help identify what the node does
            if (cfg.to) details.push(`to: ${cfg.to}`);
            if (cfg.to_phone) details.push(`phone: ${cfg.to_phone}`);
            if (cfg.to_role) details.push(`role: ${cfg.to_role}`);
            if (cfg.subject) details.push(`subject: ${String(cfg.subject).slice(0, 60)}`);
            if (cfg.body) details.push(`body: ${String(cfg.body).slice(0, 80)}`);
            if (cfg.cron) details.push(`cron: ${cfg.cron}`);
            if (cfg.prompt) details.push(`prompt: ${String(cfg.prompt).slice(0, 60)}`);
            if (cfg.objective) details.push(`objective: ${String(cfg.objective).slice(0, 60)}`);
            return {
              node_id: n.id,
              type: n.type,
              name: n.data?.step?.name || n.type,
              config_summary: details.length > 0 ? details.join("; ") : undefined,
            };
          });

        const triggerNode = nodes.find((n) => n.type.startsWith("trigger_"));
        const triggerCfg = triggerNode?.data?.step?.config || {};

        return {
          id: w.id,
          name: w.name,
          description: w.description,
          enabled: w.enabled,
          engine: w.n8n_workflow_id ? "n8n" : "legacy",
          trigger_type: (w.trigger as { type?: string })?.type || "manual",
          trigger_config: Object.keys(triggerCfg).length > 0 ? triggerCfg : undefined,
          last_run_at: w.last_run_at,
          last_run_status: w.last_run_status,
          nodes: nodeSummary,
        };
      });

      return {
        workflows: items,
        count: items.length,
      };
    }

    case "workflow.update": {
      const workflowId = String(args.workflow_id || "").trim();
      if (!workflowId) return { error: "workflow.update: 'workflow_id' required. Call workflow.list first." };

      if (ctx.simulate) {
        return { simulated: true, would_have: { action: "workflow.update", workflow_id: workflowId, args } };
      }

      // Fetch the workflow and verify ownership
      const { data: wf, error: fetchErr } = await supabaseAdmin
        .from("dante_workflows")
        .select("id, workspace_id, graph, steps, n8n_workflow_id")
        .eq("id", workflowId)
        .eq("workspace_id", ctx.workspaceId)
        .is("proposal_state", null)
        .maybeSingle();

      if (fetchErr) return { error: `workflow.update: ${fetchErr.message}` };
      if (!wf) return { error: `workflow.update: workflow not found or not in this workspace.` };

      // Build the patch
      const patch: Record<string, unknown> = {};
      if (args.name) patch.name = String(args.name).slice(0, 120);
      if (args.description !== undefined) patch.description = String(args.description || "").slice(0, 500);
      if (args.enabled !== undefined) patch.enabled = Boolean(args.enabled);

      // Apply node-level config patches
      const nodeUpdates = Array.isArray(args.node_updates) ? args.node_updates as Array<{ node_id: string; config_patch: Record<string, unknown> }> : [];
      if (nodeUpdates.length > 0) {
        const graph = (wf.graph as { nodes: Array<{ id: string; data: { step: { config: Record<string, unknown> } } }>; edges: unknown[]; viewport?: unknown }) || { nodes: [], edges: [] };
        let patchedCount = 0;
        for (const update of nodeUpdates) {
          const node = graph.nodes.find((n) => n.id === update.node_id);
          if (node && node.data?.step?.config) {
            Object.assign(node.data.step.config, update.config_patch);
            patchedCount++;
          }
        }
        if (patchedCount === 0) {
          return { error: `workflow.update: none of the specified node_ids were found in the workflow graph.` };
        }
        patch.graph = graph;
        // Keep legacy steps array in sync
        patch.steps = graph.nodes.map((n: { data: { step: unknown } }) => n.data.step);
      }

      if (Object.keys(patch).length === 0) {
        return { error: "workflow.update: no changes specified. Provide name, description, enabled, or node_updates." };
      }

      patch.updated_at = new Date().toISOString();

      const { error: updateErr } = await supabaseAdmin
        .from("dante_workflows")
        .update(patch)
        .eq("id", workflowId);

      if (updateErr) return { error: `workflow.update: ${updateErr.message}` };

      // Sync changes to n8n
      let n8nWfId = (wf as any).n8n_workflow_id as string | null;
      if (n8nWfId) {
        try {
          // If graph was patched, push the updated graph to n8n
          if (patch.graph) {
            const graphObj = patch.graph as Record<string, unknown>;
            // Detect format and convert if needed
            const hasEdges = Array.isArray(graphObj.edges);
            const hasConnections = !!graphObj.connections;
            let n8nJson: Record<string, unknown>;
            if (hasConnections || !hasEdges) {
              n8nJson = graphObj;
            } else {
              // Drift format -- convert
              const { convertDriftToN8n: convert } = await import("@/lib/dante/n8n-converter");
              const conversion = convert(
                graphObj as unknown as import("@/lib/dante/workflow-types").WorkflowGraph,
                String(args.name || "Untitled"),
              );
              n8nJson = conversion.workflow as unknown as Record<string, unknown>;
            }
            const nodes = (n8nJson as Record<string, unknown>).nodes;
            if (Array.isArray(nodes)) {
              n8nBridge.patchGraphTrigger(nodes, workflowId);
              n8nBridge.patchGraphCredentials(nodes);
            }
            await n8nBridge.updateWorkflow(n8nWfId, n8nJson as unknown as import("@/lib/dante/n8n-types").N8nWorkflowJSON);
          }
          // Sync enable/disable state
          if (args.enabled !== undefined) {
            if (args.enabled) {
              await n8nBridge.activateWorkflow(n8nWfId);
            } else {
              await n8nBridge.deactivateWorkflow(n8nWfId);
            }
          }
          // Ensure the webhook is registered after any update
          try { await n8nBridge.ensureWebhookTrigger(n8nWfId, workflowId); } catch { /* non-fatal */ }
        } catch (syncErr) {
          agentLog.warn("workflow.update: n8n sync failed", {
            err: syncErr instanceof Error ? syncErr.message : String(syncErr),
            n8nWfId,
          });
        }
      } else if (patch.graph) {
        // JIT push: workflow has no n8n ID yet. Convert and create in n8n.
        try {
          const graphObj = patch.graph as Record<string, unknown>;
          const hasEdges = Array.isArray(graphObj.edges);
          const hasConnections = !!graphObj.connections;
          const nodes = (graphObj.nodes || []) as Array<Record<string, unknown>>;
          const hasN8nNodeTypes = nodes.some(
            (n) => typeof n.type === "string" && (n.type as string).includes("."),
          );
          const isN8nNative = hasConnections || (!hasEdges && Array.isArray(nodes));
          const isDriftWrappedN8n = hasEdges && hasN8nNodeTypes;

          let n8nJson: import("@/lib/dante/n8n-types").N8nWorkflowJSON;
          if (isN8nNative) {
            n8nJson = graphObj as unknown as import("@/lib/dante/n8n-types").N8nWorkflowJSON;
          } else if (isDriftWrappedN8n) {
            const { restructureDriftWrappedN8n } = await import("@/lib/dante/n8n-migration");
            n8nJson = restructureDriftWrappedN8n(graphObj, workflowId);
          } else {
            const { convertDriftToN8n: convert } = await import("@/lib/dante/n8n-converter");
            const conversion = convert(
              graphObj as unknown as import("@/lib/dante/workflow-types").WorkflowGraph,
              String(args.name || "Untitled"),
            );
            n8nJson = conversion.workflow;
          }

          n8nBridge.patchGraphTrigger(n8nJson.nodes, workflowId);
          n8nBridge.patchGraphCredentials(n8nJson.nodes);

          n8nWfId = await n8nBridge.createWorkspaceWorkflow(
            ctx.workspaceId,
            { ...n8nJson, active: Boolean(args.enabled ?? true) },
          );
          await supabaseAdmin
            .from("dante_workflows")
            .update({ n8n_workflow_id: n8nWfId })
            .eq("id", workflowId);
        } catch (jitErr) {
          agentLog.warn("workflow.update: JIT push to n8n failed", {
            err: jitErr instanceof Error ? jitErr.message : String(jitErr),
          });
        }
      }

      const changes: string[] = [];
      if (args.name) changes.push(`renamed to "${args.name}"`);
      if (args.description !== undefined) changes.push("description updated");
      if (args.enabled !== undefined) changes.push(args.enabled ? "enabled" : "disabled");
      if (nodeUpdates.length > 0) changes.push(`${nodeUpdates.length} node(s) updated`);

      return {
        ok: true,
        workflow_id: workflowId,
        changes,
        message: `Workflow updated: ${changes.join(", ")}.`,
      };
    }

    case "workflow.execution_status": {
      const runId = String(args.run_id || "").trim();
      const wfNameQuery = String(args.workflow_name || "").trim();

      if (!runId && !wfNameQuery) {
        return { error: "workflow.execution_status: provide either 'run_id' or 'workflow_name'." };
      }

      // If we have a run_id, look it up directly
      if (runId) {
        // Check local DB first (covers both n8n and legacy runs)
        const { data: run } = await supabaseAdmin
          .from("dante_workflow_runs")
          .select("id, workflow_id, status, started_at, finished_at, result, n8n_execution_id")
          .or(`id.eq.${runId},n8n_execution_id.eq.${runId}`)
          .eq("workspace_id", ctx.workspaceId)
          .maybeSingle();

        if (run) {
          // If this is an n8n execution and it's still running, fetch live status
          const n8nExecId = (run as any).n8n_execution_id as string | null;
          if (n8nExecId && run.status === "running") {
            try {
              const liveExec = await n8nBridge.getExecution(n8nExecId, true);
              return {
                ok: true,
                run_id: runId,
                status: liveExec.status,
                started_at: liveExec.startedAt,
                finished_at: liveExec.stoppedAt || null,
                engine: "n8n",
                node_traces: formatNodeTraces(liveExec),
              };
            } catch {
              // Fall through to DB record
            }
          }

          return {
            ok: true,
            run_id: run.id,
            status: run.status,
            started_at: run.started_at,
            finished_at: run.finished_at,
            result: run.result,
            engine: n8nExecId ? "n8n" : "legacy",
          };
        }

        // Not in DB — try n8n directly (for runs that haven't called back yet)
        try {
          const exec = await n8nBridge.getExecution(runId, true);
          return {
            ok: true,
            run_id: runId,
            status: exec.status,
            started_at: exec.startedAt,
            finished_at: exec.stoppedAt || null,
            engine: "n8n",
            node_traces: formatNodeTraces(exec),
          };
        } catch {
          return { error: `workflow.execution_status: run "${runId}" not found.` };
        }
      }

      // Look up by workflow name — get most recent run
      const { data: wfs } = await supabaseAdmin
        .from("dante_workflows")
        .select("id, name")
        .eq("workspace_id", ctx.workspaceId)
        .ilike("name", `%${wfNameQuery}%`)
        .limit(1);

      if (!wfs || wfs.length === 0) {
        return { error: `workflow.execution_status: no workflow matching "${wfNameQuery}".` };
      }

      const { data: latestRun } = await supabaseAdmin
        .from("dante_workflow_runs")
        .select("id, status, started_at, finished_at, result, n8n_execution_id")
        .eq("workflow_id", (wfs[0] as any).id)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!latestRun) {
        return {
          ok: true,
          workflow_name: (wfs[0] as any).name,
          message: "No executions found for this workflow.",
        };
      }

      // If n8n execution, fetch live trace data
      const n8nExecId = (latestRun as any).n8n_execution_id as string | null;
      if (n8nExecId) {
        try {
          const exec = await n8nBridge.getExecution(n8nExecId, true);
          return {
            ok: true,
            workflow_name: (wfs[0] as any).name,
            run_id: n8nExecId,
            status: exec.status,
            started_at: exec.startedAt,
            finished_at: exec.stoppedAt || null,
            engine: "n8n",
            node_traces: formatNodeTraces(exec),
          };
        } catch {
          // Fall through
        }
      }

      return {
        ok: true,
        workflow_name: (wfs[0] as any).name,
        run_id: latestRun.id,
        status: latestRun.status,
        started_at: latestRun.started_at,
        finished_at: latestRun.finished_at,
        result: latestRun.result,
        engine: n8nExecId ? "n8n" : "legacy",
      };
    }

    case "workflow.migrate": {
      if (ctx.simulate) {
        return { simulated: true, would_have: { action: "workflow.migrate", dry_run: Boolean(args.dry_run) } };
      }

      // Owner-only operation
      const { data: migProfile } = await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("id", ctx.userId)
        .maybeSingle();

      const migRole = (migProfile as { role?: string } | null)?.role || "advisor";
      if (migRole !== "owner") {
        return { error: "workflow.migrate: only workspace owners can run migrations." };
      }

      const dryRun = Boolean(args.dry_run);
      const { migrateWorkspace, sendMigrationReport } = await import("@/lib/dante/n8n-migration");
      const report = await migrateWorkspace(ctx.workspaceId, dryRun);

      // Send email report (non-blocking, real migrations only)
      if (!dryRun && report.migrated > 0) {
        sendMigrationReport(report).catch(() => {});
      }

      return {
        ok: true,
        dry_run: dryRun,
        total: report.total,
        migrated: report.migrated,
        skipped: report.skipped,
        failed: report.failed,
        dry_run_failed: report.dry_run_failed,
        results: report.results.map((r) => ({
          name: r.workflowName,
          status: r.status,
          n8n_id: r.n8nWorkflowId || null,
          warnings: r.warnings,
          error: r.error || null,
          nodes: r.dryRunResult?.nodeCount,
          connections: r.dryRunResult?.connectionCount,
          trigger: r.dryRunResult?.triggerType,
        })),
        message: dryRun
          ? `Dry run complete: ${report.migrated} would migrate, ${report.skipped} already on n8n, ${report.failed + report.dry_run_failed} would fail.`
          : `Migration complete: ${report.migrated} migrated to n8n, ${report.skipped} already migrated, ${report.failed} failed.`,
      };
    }

    case "secrets.set": {
      const key = String(args.key || "").trim();
      const value = String(args.value || "");
      const desc = args.description ? String(args.description) : null;

      if (!key) return { error: "secrets.set: 'key' required." };
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
        return { error: "secrets.set: key must be a valid identifier (letters, digits, underscore; no leading digit)." };
      }
      if (!value) return { error: "secrets.set: 'value' required." };

      if (ctx.simulate) {
        return { simulated: true, would_have: { action: "secrets.set", key, value_preview: value.slice(0, 4) + "..." } };
      }

      const { error: upsertErr } = await supabaseAdmin
        .from("dante_secrets")
        .upsert({
          workspace_id: ctx.workspaceId,
          key,
          value,
          description: desc,
          created_by: ctx.userId,
          updated_at: new Date().toISOString(),
        }, { onConflict: "workspace_id,key" });

      if (upsertErr) return { error: `secrets.set: ${upsertErr.message}` };

      return {
        ok: true,
        key,
        message: `Secret '${key}' saved. Workflows referencing {{secrets.${key}}} will now use this value.`,
      };
    }

    case "secrets.list": {
      const { data, error: listErr } = await supabaseAdmin
        .from("dante_secrets")
        .select("key, description, updated_at")
        .eq("workspace_id", ctx.workspaceId)
        .order("key", { ascending: true });

      if (listErr) return { error: `secrets.list: ${listErr.message}` };

      return {
        secrets: (data || []).map((s) => ({
          key: s.key,
          description: s.description,
          updated_at: s.updated_at,
        })),
        count: (data || []).length,
        tip: "Use secrets.set to create or update a secret. Workflow templates reference them as {{secrets.<key>}}.",
      };
    }

    case "file_index.search": {
      const q = String(args.query || "").trim();
      if (!q) return { error: "file_index.search: 'query' required." };
      const k = Math.min(50, Math.max(1, Number(args.limit) || 10));
      const exts: string[] = Array.isArray(args.extensions) ? args.extensions : [];

      const baseSelect = "id, file_name, file_path, file_extension, file_size_bytes, ingest_status, vault_item_id, last_seen_at";

      let tsvQuery = supabaseAdmin
        .from("watched_file_index")
        .select(baseSelect)
        .eq("workspace_id", ctx.workspaceId)
        .is("deleted_at", null)
        .textSearch("search_tsv", q, { type: "websearch" })
        .order("last_seen_at", { ascending: false })
        .limit(k);
      if (exts.length) tsvQuery = tsvQuery.in("file_extension", exts);

      const { data: tsvFiles, error: tsvErr } = await tsvQuery;
      if (tsvErr) return { error: `file_index.search: ${tsvErr.message}` };

      let files = tsvFiles || [];

      if (files.length === 0) {
        const FILE_INDEX_STOP = new Set([
          "the", "for", "and", "that", "this", "with", "from", "have",
          "what", "how", "can", "you", "about", "into", "know", "explain",
          "tell", "give", "show", "find", "get", "going", "need", "want",
          "does", "did", "has", "was", "are", "been", "will", "would",
        ]);
        const kws = q
          .replace(/[^\w\s]/g, " ")
          .split(/\s+/)
          .filter((w) => w.length > 2 && !FILE_INDEX_STOP.has(w.toLowerCase()))
          .map((w) => w.toLowerCase())
          .slice(0, 8);
        if (kws.length > 0) {
          const orClauses = kws.map((kw) => `file_name.ilike.%${kw}%`).join(",");
          let fallbackQ = supabaseAdmin
            .from("watched_file_index")
            .select(baseSelect)
            .eq("workspace_id", ctx.workspaceId)
            .is("deleted_at", null)
            .or(orClauses)
            .order("last_seen_at", { ascending: false })
            .limit(k);
          if (exts.length) fallbackQ = fallbackQ.in("file_extension", exts);
          const { data: fallbackFiles } = await fallbackQ;
          files = fallbackFiles || [];
        }
      }

      // Auto-ingest any files that have metadata only (status='indexed').
      // Fire content_requests so the watcher picks them up in the
      // background — the LLM shouldn't have to make a separate call.
      const needIngest = files.filter(
        (f) => f.ingest_status === "indexed" || (f.ingest_status === "ingest_failed"),
      );
      if (needIngest.length > 0) {
        const folderLookup = await supabaseAdmin
          .from("watched_file_index")
          .select("id, folder_id, file_path")
          .in("id", needIngest.map((f) => f.id));
        const folderMap = new Map(
          (folderLookup.data || []).map((r) => [r.id, r]),
        );

        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const requests = needIngest
          .filter((f) => folderMap.has(f.id))
          .map((f) => {
            const info = folderMap.get(f.id)!;
            return {
              workspace_id: ctx.workspaceId,
              folder_id: info.folder_id,
              index_entry_id: f.id,
              file_path: info.file_path,
              requested_by: `dante:${ctx.runId}`,
              expires_at: expires,
            };
          });

        if (requests.length > 0) {
          await supabaseAdmin.from("content_requests").insert(requests);
          await supabaseAdmin
            .from("watched_file_index")
            .update({ ingest_status: "ingest_requested" })
            .in("id", needIngest.map((f) => f.id));
        }

        // Brief poll (up to 8s) — gives the watcher a chance to
        // fulfill fast files so the LLM can cite them immediately.
        for (let tick = 0; tick < 4; tick++) {
          await new Promise((r) => setTimeout(r, 2000));
          const { data: refreshed } = await supabaseAdmin
            .from("watched_file_index")
            .select("id, ingest_status, vault_item_id")
            .in("id", needIngest.map((f) => f.id));
          if (refreshed) {
            for (const r of refreshed) {
              const orig = files.find((f) => f.id === r.id);
              if (orig) {
                (orig as any).ingest_status = r.ingest_status;
                (orig as any).vault_item_id = r.vault_item_id;
              }
            }
            if (refreshed.every((r) => r.ingest_status === "ingested" || r.ingest_status === "ingest_failed")) break;
          }
        }
      }

      return {
        results: files.map((f) => ({
          id: f.id,
          name: f.file_name,
          path: f.file_path,
          extension: f.file_extension,
          size_bytes: f.file_size_bytes,
          status: f.ingest_status,
          vault_item_id: f.vault_item_id,
        })),
        total: files.length,
        hint: needIngest.length > 0
          ? "Ingestion was automatically triggered for files that hadn't been indexed yet. Files with vault_item_id set can be searched with vault.cite."
          : undefined,
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
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
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

    case "file_index.list_folder": {
      const folderPath = String(args.folder_path || "").trim();
      if (!folderPath) return { error: "file_index.list_folder: 'folder_path' required." };
      const listLimit = Math.min(Math.max(Number(args.limit) || 50, 1), 200);

      const { data: files, error: listErr } = await supabaseAdmin
        .from("watched_file_index")
        .select("id, file_name, file_path, file_extension, file_size_bytes, ingest_status, vault_item_id, file_modified_at")
        .eq("workspace_id", ctx.workspaceId)
        .is("deleted_at", null)
        .ilike("file_path", `%${folderPath}%`)
        .order("file_path", { ascending: true })
        .limit(listLimit);

      if (listErr) return { error: `file_index.list_folder: ${listErr.message}` };
      if (!files || files.length === 0) {
        return { results: [], total: 0, message: `No files found matching folder path "${folderPath}".` };
      }

      const needIngest = files.filter(
        (f) => !f.vault_item_id && (f.ingest_status === "indexed" || f.ingest_status === "ingest_failed"),
      );
      if (needIngest.length > 0) {
        const folderLookup = await supabaseAdmin
          .from("watched_file_index")
          .select("id, folder_id, file_path")
          .in("id", needIngest.map((f) => f.id));
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const requests = (folderLookup.data || [])
          .filter((r) => r.folder_id)
          .map((r) => ({
            workspace_id: ctx.workspaceId,
            folder_id: r.folder_id,
            index_entry_id: r.id,
            file_path: r.file_path,
            requested_by: `dante:${ctx.runId}`,
            expires_at: expires,
          }));
        if (requests.length > 0) {
          await supabaseAdmin.from("content_requests").insert(requests);
          await supabaseAdmin
            .from("watched_file_index")
            .update({ ingest_status: "ingest_requested" })
            .in("id", needIngest.map((f) => f.id));
        }
      }

      return {
        results: files.map((f) => ({
          id: f.id,
          name: f.file_name,
          path: f.file_path,
          extension: f.file_extension,
          size_bytes: f.file_size_bytes,
          modified_at: f.file_modified_at,
          status: f.ingest_status,
          vault_item_id: f.vault_item_id,
        })),
        total: files.length,
        hint: needIngest.length > 0
          ? `Ingestion was triggered for ${needIngest.length} file(s) not yet in the vault. Files with vault_item_id can be searched with vault.cite.`
          : undefined,
      };
    }

    case "site_scan.search": {
      return JSON.parse(
        await handleSiteScanSearch(
          {
            location: String(args.location || ""),
            zoning: Array.isArray(args.zoning)
              ? (args.zoning as string[])
              : undefined,
            acreage_min: args.acreage_min
              ? Number(args.acreage_min)
              : undefined,
            acreage_max: args.acreage_max
              ? Number(args.acreage_max)
              : undefined,
            land_use: args.land_use
              ? String(args.land_use)
              : undefined,
            max_results: args.max_results
              ? Number(args.max_results)
              : undefined,
          },
          ctx.workspaceId,
        ),
      );
    }

    case "site_scan.detail": {
      return JSON.parse(
        await handleSiteScanDetail(
          {
            parcel_number: args.parcel_number
              ? String(args.parcel_number)
              : undefined,
            address: args.address ? String(args.address) : undefined,
            county: args.county ? String(args.county) : undefined,
            state: args.state ? String(args.state) : undefined,
          },
          ctx.workspaceId,
        ),
      );
    }

    case "site_scan.listings": {
      return JSON.parse(
        await handleSiteScanListings(
          {
            location: String(args.location || ""),
            radius_miles: args.radius_miles
              ? Number(args.radius_miles)
              : undefined,
            property_type: args.property_type
              ? String(args.property_type)
              : undefined,
            sf_min: args.sf_min ? Number(args.sf_min) : undefined,
            sf_max: args.sf_max ? Number(args.sf_max) : undefined,
          },
          ctx.workspaceId,
        ),
      );
    }

    case "site_scan.void_analysis": {
      return JSON.parse(
        await handleSiteScanVoidAnalysis(
          {
            locations: Array.isArray(args.locations)
              ? (args.locations as string[])
              : [String(args.locations || "")],
            target_use: args.target_use
              ? String(args.target_use)
              : undefined,
            zoning: Array.isArray(args.zoning)
              ? (args.zoning as string[])
              : undefined,
            acreage_min: args.acreage_min
              ? Number(args.acreage_min)
              : undefined,
            acreage_max: args.acreage_max
              ? Number(args.acreage_max)
              : undefined,
            max_sites: args.max_sites
              ? Number(args.max_sites)
              : undefined,
            prefer_vacant: args.prefer_vacant != null
              ? Boolean(args.prefer_vacant)
              : undefined,
          },
          ctx.workspaceId,
        ),
      );
    }

    case "survey_area": {
      return JSON.parse(
        await handleSurveyArea(
          {
            address: String(args.address || ""),
            radii_miles: Array.isArray(args.radii_miles)
              ? (args.radii_miles as number[])
              : undefined,
            categories: Array.isArray(args.categories)
              ? (args.categories as string[])
              : undefined,
          },
          ctx.workspaceId,
        ),
      );
    }

    case "tenant_site_search": {
      return JSON.parse(
        await handleTenantSiteSearch(
          {
            tenant_name: String(args.tenant_name || ""),
            category: String(args.category || ""),
            min_population_3mi: args.min_population_3mi
              ? Number(args.min_population_3mi)
              : undefined,
            max_competitors_3mi: args.max_competitors_3mi != null
              ? Number(args.max_competitors_3mi)
              : undefined,
            min_median_hhi: args.min_median_hhi
              ? Number(args.min_median_hhi)
              : undefined,
            max_rent_psf: args.max_rent_psf
              ? Number(args.max_rent_psf)
              : undefined,
            min_sf: args.min_sf
              ? Number(args.min_sf)
              : undefined,
            max_sf: args.max_sf
              ? Number(args.max_sf)
              : undefined,
            target_markets: Array.isArray(args.target_markets)
              ? (args.target_markets as string[])
              : undefined,
            require_void: args.require_void != null
              ? Boolean(args.require_void)
              : undefined,
          },
          ctx.workspaceId,
        ),
      );
    }

    case "web.search": {
      const query = String(args.query || "");
      if (!query) return JSON.stringify({ error: "query is required" });
      const apiKey = process.env.TAVILY_API_KEY;
      if (!apiKey) return JSON.stringify({ error: "TAVILY_API_KEY not configured" });
      if (ctx.simulate) return JSON.stringify({ answer: "(simulated)", results: [], query });
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: Math.min(Math.max(Number(args.max_results) || 5, 1), 20),
          search_depth: args.search_depth === "advanced" ? "advanced" : "basic",
          include_domains: Array.isArray(args.include_domains) ? args.include_domains : [],
          exclude_domains: Array.isArray(args.exclude_domains) ? args.exclude_domains : [],
          include_answer: true,
        }),
      });
      if (!res.ok) return JSON.stringify({ error: `Tavily ${res.status}: ${await res.text()}` });
      const data = await res.json();
      const results = (data.results || []).map((r: { title?: string; url?: string; content?: string }) => ({
        title: r.title, url: r.url, snippet: r.content,
      }));
      return JSON.stringify({ answer: data.answer || null, results, count: results.length, query });
    }

    case "cre.calculate": {
      const metrics = Array.isArray(args.metrics)
        ? (args.metrics as string[])
        : [String(args.metrics || "")];
      const inputs: Record<string, number> = {};
      if (args.inputs && typeof args.inputs === "object") {
        for (const [k, v] of Object.entries(args.inputs as Record<string, unknown>)) {
          const n = Number(v);
          if (!Number.isNaN(n)) inputs[k] = n;
        }
      }
      const results = calculateCre(metrics, inputs);
      return { results, metrics_computed: results.filter((r) => !("error" in r)).length };
    }
    case "document.create": {
      if (ctx.simulate) {
        return {
          simulated: true,
          would_have: { action: "document.create", title: args.title, format: args.format },
        };
      }
      const { createDocument } = await import("@/lib/dante/tools/document");
      const sections = Array.isArray(args.sections)
        ? (args.sections as Array<{ heading?: string; body?: string }>).map((s) => ({
            heading: String(s.heading || ""),
            body: String(s.body || ""),
          }))
        : [];
      const format = args.format === "docx" ? "docx" : "pdf";
      const result = await createDocument({
        workspaceId: ctx.workspaceId,
        title: String(args.title || "Untitled Document"),
        subtitle: args.subtitle ? String(args.subtitle) : undefined,
        sections,
        format,
        projectId: ctx.projectId,
        templateId: args.template_id ? String(args.template_id) : undefined,
      });
      return {
        ...result,
        formatted: `Document created: "${result.title}" (${result.format.toUpperCase()}, ${result.section_count} sections, ${Math.round(result.size_bytes / 1024)}KB). Saved to vault as ${result.vault_item_id}. Download: ${result.url || "(generating link...)"}`,
      };
    }
    case "document.edit": {
      if (ctx.simulate) {
        return {
          simulated: true,
          would_have: { action: "document.edit", vault_item_id: args.vault_item_id, operation_count: Array.isArray(args.operations) ? args.operations.length : 0 },
        };
      }
      const { editDocument } = await import("@/lib/dante/tools/document");
      const operations = Array.isArray(args.operations)
        ? (args.operations as Array<Record<string, unknown>>).map((op) => ({
            type: String(op.type || ""),
            heading: op.heading ? String(op.heading) : undefined,
            body: op.body ? String(op.body) : undefined,
            index: typeof op.index === "number" ? op.index : undefined,
            title: op.title ? String(op.title) : undefined,
            subtitle: op.subtitle ? String(op.subtitle) : undefined,
          }))
        : [];
      const result = await editDocument({
        workspaceId: ctx.workspaceId,
        vaultItemId: String(args.vault_item_id || ""),
        operations: operations as import("@/lib/dante/tools/document").EditOperation[],
      });
      return {
        ...result,
        formatted: `Document updated: "${result.title}" (${result.format.toUpperCase()}, ${result.section_count} sections, ${Math.round(result.size_bytes / 1024)}KB). New vault item: ${result.vault_item_id}. Download: ${result.url || "(generating link...)"}`,
      };
    }
    case "document.list_templates": {
      const { listTemplates } = await import("@/lib/dante/tools/document");
      const templates = await listTemplates(ctx.workspaceId);
      if (templates.length === 0) {
        return {
          templates: [],
          formatted: "No document templates saved yet. The user can ask you to save a document as a template after creating one.",
        };
      }
      const lines = templates.map((t, i) =>
        `${i + 1}. "${t.name}" (${t.format.toUpperCase()}) — ${t.section_headings.length} sections: ${t.section_headings.join(", ")}${t.description ? ` — ${t.description}` : ""}`,
      );
      return {
        templates,
        formatted: `${templates.length} template${templates.length === 1 ? "" : "s"} available:\n${lines.join("\n")}`,
      };
    }
    case "document.save_template": {
      if (ctx.simulate) {
        return {
          simulated: true,
          would_have: { action: "document.save_template", name: args.name },
        };
      }
      if (!ctx.userId) {
        return { error: "Cannot save templates without an authenticated user." };
      }
      const docTools = await import("@/lib/dante/tools/document");
      const name = String(args.name || "Untitled Template");
      const description = args.description ? String(args.description) : undefined;

      // Mode 1: extract from existing vault item
      if (args.vault_item_id) {
        const result = await docTools.saveTemplateFromDocument({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          vaultItemId: String(args.vault_item_id),
          name,
          description,
        });
        return {
          ...result,
          formatted: `Template "${result.name}" saved with ${result.section_count} sections. Use template_id "${result.template_id}" with document.create to generate documents using this structure.`,
        };
      }

      // Mode 2: define sections from scratch
      const sections = Array.isArray(args.sections)
        ? (args.sections as Array<{ heading?: string }>).map((s) => ({
            heading: String(s.heading || ""),
            body: "",
          }))
        : [];
      if (sections.length === 0) {
        return { error: "Provide either vault_item_id or sections to create a template." };
      }
      const format = args.format === "docx" ? "docx" : "pdf";
      const result = await docTools.saveTemplate({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        name,
        description,
        sections,
        format: format as "pdf" | "docx",
      });
      return {
        ...result,
        section_count: sections.length,
        formatted: `Template "${result.name}" saved with ${sections.length} sections. Use template_id "${result.template_id}" with document.create to generate documents using this structure.`,
      };
    }
  }
}

// ── The loop ──────────────────────────────────────────────────

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null | LlmContentBlock[];
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
  /** Image attachments for Claude vision. Each entry is a base64-
   *  encoded image + its MIME type. These get injected into the
   *  first user message as content blocks alongside the text
   *  objective, so the model can analyze them visually. */
  imageBlocks?: Array<{ data: string; media_type: string }>;
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

const HARD_MAX_STEPS = 30;  // raised from 20: lease abstraction needs 19+ vault.cite passes

// ── Void dashboard builder ──────────────────────────────────────
//
// Constructs the structured void_analysis JSON block from tool results.
// This runs post-loop — the model never needs to emit the block itself.

/** Demand thresholds: min households within 3mi for a category to be viable. */
const DEMAND_THRESHOLDS: Record<string, number> = {
  restaurants: 5000,
  grocery: 8000,
  medical: 8000,
  fitness: 8000,
  retail: 5000,
  financial: 8000,
  education: 5000,
  services: 3000,
  entertainment: 10000,
  lodging: 15000,
  childcare: 5000,
};

/**
 * Try to extract the model's own void_analysis JSON from the text so we
 * can salvage demographics, tenant recommendations, and rent comps the
 * model inferred even when buildVoidDashboard constructs the core data
 * from real tool results.
 */
/**
 * Extract per-node execution traces from an n8n execution response.
 * Returns a compact summary suitable for the agent to relay to the user.
 */
function formatNodeTraces(exec: import("@/lib/dante/n8n-types").N8nExecution): Array<{
  node: string;
  status: string;
  items?: number;
  duration_ms?: number;
  error?: string;
  output_preview?: unknown;
}> {
  const runData = exec.data?.resultData?.runData;
  if (!runData || typeof runData !== "object") return [];

  const traces: Array<{
    node: string;
    status: string;
    items?: number;
    duration_ms?: number;
    error?: string;
    output_preview?: unknown;
  }> = [];

  for (const [nodeName, runs] of Object.entries(runData)) {
    if (!Array.isArray(runs)) continue;
    for (const run of runs) {
      const trace: typeof traces[0] = {
        node: nodeName,
        status: run.executionStatus || "unknown",
      };
      if (run.executionTime !== undefined) trace.duration_ms = run.executionTime;
      if (run.error) trace.error = typeof run.error === "string" ? run.error : (run.error as any)?.message || String(run.error);

      // Extract output preview (first item, limited)
      const mainOutput = run.data?.main?.[0];
      if (Array.isArray(mainOutput) && mainOutput.length > 0) {
        trace.items = mainOutput.length;
        // Preview first item's json, truncated
        const firstJson = mainOutput[0]?.json;
        if (firstJson) {
          const preview = JSON.stringify(firstJson);
          trace.output_preview = preview.length > 500 ? JSON.parse(preview.slice(0, 500) + '..."') : firstJson;
        }
      }

      traces.push(trace);
    }
  }

  return traces;
}

function extractModelVoidJson(text: string): Record<string, unknown> | null {
  const m = text.match(/```void_analysis\s*\n([\s\S]*?)\n\s*```/);
  if (!m) return null;
  try {
    // Lenient parse: strip trailing commas, single-line comments
    const cleaned = m[1]
      .replace(/,\s*([}\]])/g, "$1")        // trailing commas
      .replace(/\/\/[^\n]*/g, "")            // single-line comments
      .replace(/\/\*[\s\S]*?\*\//g, "");     // block comments
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/**
 * Extract tenant recommendation names from the model's prose text.
 * Looks for patterns like "- **Brand Name** — ..." or "1. Brand Name:"
 * within recommendation sections.
 */
function extractTenantsFromText(
  text: string,
  categoryName: string,
  nearbyBrands: Set<string>,
): Array<Record<string, unknown>> {
  const tenants: Array<Record<string, unknown>> = [];
  // Look for bold brand mentions near the category name
  const catLower = categoryName.toLowerCase();
  // Find the section of text relevant to this category
  const lines = text.split("\n");
  let inCategorySection = false;
  for (const line of lines) {
    if (line.toLowerCase().includes(catLower)) {
      inCategorySection = true;
    } else if (/^#{1,3}\s/.test(line) && !line.toLowerCase().includes(catLower)) {
      // New heading that isn't our category — end the section
      if (inCategorySection) break;
    }
    if (!inCategorySection) continue;

    // Match "**Brand Name**" or "- Brand Name:" or "1. Brand Name"
    const brandMatch = line.match(/\*\*([^*]+)\*\*/) ||
      line.match(/^[-*]\s+([A-Z][^:—\-\n]{2,40})/) ||
      line.match(/^\d+\.\s+([A-Z][^:—\-\n]{2,40})/);
    if (!brandMatch) continue;

    const brand = brandMatch[1].trim();
    if (brand.length < 3 || brand.length > 50) continue;
    // Skip generic phrases
    if (/^(the|and|or|this|that|note|key|summary|see|per)\b/i.test(brand)) continue;

    const brandLower = brand.toLowerCase();
    const isVerifiedAbsent = !nearbyBrands.has(brandLower);

    // Extract SF requirement if mentioned
    const sfMatch = line.match(/(\d[\d,]*)\s*(?:SF|sq\s*ft|square\s*feet)/i);
    // Extract rationale — text after the brand name
    const afterBrand = line.slice(line.indexOf(brand) + brand.length);
    const rationale = afterBrand
      .replace(/^\s*[—\-:]+\s*/, "")
      .replace(/\*\*/g, "")
      .trim()
      .slice(0, 200) || undefined;

    tenants.push({
      brand,
      verified_absent: isVerifiedAbsent,
      ...(sfMatch && { sf_requirement: sfMatch[1].replace(/,/g, "") }),
      ...(rationale && rationale.length > 10 && { rationale }),
    });
  }

  return tenants;
}

function buildVoidDashboard(ctx: AgentToolCtx): Record<string, unknown> | null {
  const survey = ctx.surveyAreaResult;
  const hasSurvey = !!survey?.by_category;

  // Must have either survey data OR a void analysis address to build anything
  if (!hasSurvey && !ctx.voidAnalysisAddress) return null;

  // Build site info from whatever we have
  const site: Record<string, unknown> = {
    address: survey?.address_resolved || ctx.voidAnalysisAddress || "Unknown",
  };
  if (survey?.survey_center) {
    site.lat = survey.survey_center.lat;
    site.lng = survey.survey_center.lng;
  }
  // Pull zoning/acreage from void_analysis top site if available
  const topSite = ctx.voidAnalysisResult?.sites?.[0];
  if (topSite) {
    if (topSite.zoning) site.zoning = topSite.zoning;
    if (topSite.acreage) site.acreage = topSite.acreage;
    if (topSite.assessed_value) site.assessed_value = topSite.assessed_value;
  }

  // Build category density data
  const allCategories = [
    "restaurants", "grocery", "medical", "fitness", "retail",
    "financial", "education", "services", "entertainment", "lodging", "childcare",
  ];

  // Collect all nearby brand names for verified_absent checking
  const nearbyBrands = new Set<string>();
  if (hasSurvey) {
    for (const businesses of Object.values(survey!.by_category)) {
      for (const biz of businesses) {
        if (biz.distance_miles <= 3) {
          nearbyBrands.add(biz.name.toLowerCase().trim());
        }
      }
    }
  }

  const categories: Array<Record<string, unknown>> = [];
  for (const cat of allCategories) {
    const businesses = hasSurvey ? (survey!.by_category[cat] || []) : [];
    const count1mi = businesses.filter(
      (b) => b.distance_miles <= 1,
    ).length;
    const count3mi = businesses.length;
    const threshold = DEMAND_THRESHOLDS[cat] ? Math.ceil(DEMAND_THRESHOLDS[cat] / 3000) : 5;

    let status: string;
    if (count3mi <= 1) status = "void";
    else if (count3mi <= 3) status = "underserved";
    else if (count3mi >= threshold * 2) status = "saturated";
    else status = "adequate";

    // Capitalize category name
    const displayName = cat.charAt(0).toUpperCase() + cat.slice(1);

    categories.push({
      name: displayName,
      count_1mi: count1mi,
      count_3mi: count3mi,
      threshold,
      status,
    });
  }

  // Build voids — from survey void_indicators if available, else from
  // categories with status "void" or "underserved"
  const voids: Array<Record<string, unknown>> = [];
  if (hasSurvey && survey!.void_indicators?.length) {
    for (const vi of survey!.void_indicators) {
      const displayCat = vi.category.charAt(0).toUpperCase() + vi.category.slice(1);
      voids.push({
        category: displayCat,
        count_3mi: vi.count,
        evidence:
          vi.count === 0
            ? `No ${vi.category} businesses found within 3 miles`
            : `Only ${vi.count} ${vi.category} business(es) within 3 miles`,
        opportunity_level: vi.count === 0 ? "HIGH" : "MEDIUM",
        demand_met: true,
        recommended_tenants: extractTenantsFromText(
          ctx._finalTextForTenantExtraction || "",
          vi.category,
          nearbyBrands,
        ),
      });
    }
  } else {
    // No void indicators — derive from category statuses
    for (const c of categories) {
      if (c.status === "void" || c.status === "underserved") {
        voids.push({
          category: c.name as string,
          count_3mi: c.count_3mi as number,
          evidence:
            (c.count_3mi as number) === 0
              ? `No ${(c.name as string).toLowerCase()} businesses found within 3 miles`
              : `Only ${c.count_3mi} ${(c.name as string).toLowerCase()} business(es) within 3 miles`,
          opportunity_level: (c.count_3mi as number) === 0 ? "HIGH" : "MEDIUM",
          demand_met: true,
          recommended_tenants: extractTenantsFromText(
            ctx._finalTextForTenantExtraction || "",
            (c.name as string).toLowerCase(),
            nearbyBrands,
          ),
        });
      }
    }
  }

  // Strip voids with no recommended tenants from the extraction —
  // keep them all but filter empty tenant arrays
  for (const v of voids) {
    const tenants = v.recommended_tenants as Array<Record<string, unknown>> | undefined;
    if (!tenants || tenants.length === 0) {
      delete v.recommended_tenants;
    }
  }

  // Build competitive supply from void_analysis sites if available
  const competitiveSupply: Array<Record<string, unknown>> = [];
  if (ctx.voidAnalysisResult?.sites) {
    for (const s of ctx.voidAnalysisResult.sites.slice(0, 5)) {
      competitiveSupply.push({
        name: s.address,
        distance_mi: 0,
        sf_available: s.acreage ? Math.round(s.acreage * 43560 * 0.3) : undefined,
        risk: (s.score ?? 0) >= 4 ? "high" : (s.score ?? 0) >= 2 ? "moderate" : "low",
      });
    }
  }

  // Try to pull demographics and rent_comps from model's own JSON
  // (we don't have demographic APIs, so the model's inference is best-effort)
  const modelJson = extractModelVoidJson(ctx._finalTextForTenantExtraction || "");
  const demographics = modelJson?.demographics || undefined;
  const rentComps = modelJson?.rent_comps || undefined;

  return {
    site,
    ...(demographics && { demographics }),
    categories,
    voids,
    ...(rentComps && { rent_comps: rentComps }),
    ...(competitiveSupply.length > 0 && { competitive_supply: competitiveSupply }),
    accessed_at: new Date().toISOString(),
  };
}

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

  const _agentT0 = Date.now();
  const allowedTools = new Set<AgentToolName>(builtinNames);
  const builtinDefs: ToolDef[] = builtinNames.map((t) => TOOL_DEFS[t]).filter(Boolean);
  const mcpDefs = await expandMcpTools(input.workspaceId, mcpServers);
  const tools: ToolDef[] = [...builtinDefs, ...mcpDefs];
  agentLog.info("tools resolved", { durationMs: Date.now() - _agentT0, builtin: builtinDefs.length, mcp: mcpDefs.length });

  const maxSteps = Math.min(Math.max(Number(cfg.max_steps) || 8, 1), HARD_MAX_STEPS);
  const workspaceModel = await getWorkspaceModel(input.workspaceId);
  const model = workspaceModel || cfg.model || "claude-sonnet-4-6";
  agentLog.info("run config", { model, maxSteps });

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
    const _modeT0 = Date.now();
    staticMode = await resolveProcessingMode(modeCtx);
    agentLog.info("staticMode resolved", { mode: staticMode.mode, durationMs: Date.now() - _modeT0 });

    const lastUserMsg =
      typeof cfg.objective === "string" && cfg.objective.trim()
        ? cfg.objective
        : "";
    if (staticMode.mode === "cloud" && lastUserMsg) {
      try {
        const _autoT0 = Date.now();
        autoMode = await detectAutoLocalMode({
          workspaceId: input.workspaceId,
          query: lastUserMsg,
        });
        agentLog.info("autoMode resolved", { mode: autoMode.mode, reason: autoMode.reason, durationMs: Date.now() - _autoT0 });
      } catch (err) {
        agentLog.warn("autoMode detection failed", { durationMs: Date.now() - _modeT0, error: err instanceof Error ? err.message : String(err) });
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
    cfg.system?.trim() || "You are Dante, an AI assistant for a commercial real-estate brokerage.",
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

  // If the caller passed image blocks (vision), build a multi-modal
  // user message with text + image content blocks. Otherwise, plain
  // text as before.
  if (input.imageBlocks && input.imageBlocks.length > 0) {
    const contentBlocks: LlmContentBlock[] = [
      { type: "text", text: cfg.objective },
      ...input.imageBlocks.map((img) => ({
        type: "image" as const,
        data: img.data,
        media_type: img.media_type,
      })),
    ];
    messages.push({ role: "user", content: contentBlocks });
  } else {
    messages.push({ role: "user", content: cfg.objective });
  }

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
      "inconsistency.detect": 0,
      "vault.cite": 0,
      "clients.query": 0,
      "clients.update": 0,
      "clients.create": 0,
      "properties.query": 0,
      "properties.create": 0,
      "properties.update": 0,
      "email.send": 0,
      "http.fetch": 0,
      "skill.run": 0,
      "reminder.schedule": 0,
      "workflow.propose": 0,
      "workflow.run": 0,
      "workflow.list_templates": 0,
      "workflow.clone_template": 0,
      "workflow.list": 0,
      "workflow.update": 0,
      "workflow.execution_status": 0,
      "workflow.migrate": 0,
      "secrets.set": 0,
      "secrets.list": 0,
      "file_index.search": 0,
      "file_index.ingest": 0,
      "file_index.list_folder": 0,
      "site_scan.search": 0,
      "site_scan.detail": 0,
      "site_scan.listings": 0,
      "site_scan.void_analysis": 0,
      "survey_area": 0,
      "tenant_site_search": 0,
      "web.search": 0,
      "cre.calculate": 0,
      "document.create": 0,
      "document.edit": 0,
      "document.list_templates": 0,
      "document.save_template": 0,
      "agent.delegate": 0,
    },
    onEvent: input.onEvent ? async (event) => {
      try { await input.onEvent!(event as any); } catch { /* non-fatal */ }
    } : undefined,
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
      agentLog.warn("onEvent handler threw", { error: err instanceof Error ? err.message : String(err) });
    }
  };

  while (stepIdx < maxSteps) {
    const thisIteration = iterationIdx++;
    const _llmT0 = Date.now();
    agentLog.debug("llmComplete starting", { iteration: thisIteration, msgCount: messages.length, toolCount: tools.length });
    const completion = await llmComplete({
      model,
      messages: messages as LlmMessage[],
      tools: tools.length > 0 ? (tools as LlmToolDef[]) : undefined,
      toolChoice: tools.length > 0 ? "auto" : undefined,
      feature: "agent.loop",
      workspaceId: input.workspaceId,
      processingMode,
    });
    agentLog.info("llmComplete done", { iteration: thisIteration, durationMs: Date.now() - _llmT0, finishReason: completion.finishReason });

    let assistantMsg = completion.message as ChatMessage;

    // Guard: if the very first iteration returns empty content with no
    // tool calls, retry once. Transient API hiccups (empty response,
    // content-filter edge case, overloaded endpoint) occasionally
    // produce this; a single retry resolves it >90% of the time.
    const assistantText = typeof assistantMsg.content === "string" ? assistantMsg.content : null;
    if (
      thisIteration === 0 &&
      !assistantText?.trim() &&
      (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0)
    ) {
      agentLog.warn("empty first response, retrying once", { model, finishReason: completion.finishReason, runId: input.runId });
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
      finalText = (typeof assistantMsg.content === "string" ? assistantMsg.content : "") || "";

      // ── VOID ANALYSIS ENFORCEMENT ──
      // If the model ran void_analysis but never called survey_area,
      // force a survey_area call and make the model rewrite with real data.
      if (
        ctx.voidAnalysisCalled &&
        !ctx.surveyAreaCalled &&
        ctx.voidAnalysisAddress &&
        stepIdx < maxSteps - 1
      ) {
        agentLog.info("void enforcement: forcing survey_area", { address: ctx.voidAnalysisAddress });
        // Auto-run survey_area with the void analysis address
        let surveyOutput: unknown;
        try {
          const surveyJson = await handleSurveyArea(
            { address: ctx.voidAnalysisAddress },
            ctx.workspaceId,
          );
          surveyOutput = JSON.parse(surveyJson);
          ctx.surveyAreaCalled = true;
          if ((surveyOutput as any)?.by_category) {
            ctx.surveyAreaResult = surveyOutput as SurveyAreaResult;
          }
        } catch (err) {
          surveyOutput = { error: `survey_area auto-call failed: ${err}` };
        }

        // Inject the survey_area data and re-prompt
        messages.push({
          role: "user",
          content:
            `STOP. Your void analysis response is incomplete. You wrote tenant ` +
            `recommendations WITHOUT first verifying them against real business ` +
            `data. Here is the survey_area result for ${ctx.voidAnalysisAddress}:\n\n` +
            JSON.stringify(surveyOutput).slice(0, 14000) +
            `\n\nRewrite your response. For EVERY brand or business you recommend, ` +
            `cross-check it against the survey_area data above. If a brand already ` +
            `exists within 3 miles, REMOVE it from your recommendations. This is ` +
            `mandatory — recommending a business that already exists nearby is a ` +
            `disqualifying error that will lose the client.`,
        });

        // Let the model rewrite
        try {
          const rewrite = await llmComplete({
            model,
            messages: messages as LlmMessage[],
            toolChoice: "none",
            feature: "agent.loop.void_enforcement",
            workspaceId: input.workspaceId,
            processingMode,
          });
          finalText = rewrite.message.content || finalText;
        } catch (err) {
          agentLog.warn("void enforcement rewrite failed", { error: err instanceof Error ? err.message : String(err) });
          // Keep original finalText — still better than nothing
        }
        stepIdx += 1;
      }

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

      // ── Void analysis enforcement: track tool calls ──
      if (!errored && toolName === "site_scan.void_analysis") {
        ctx.voidAnalysisCalled = true;
        // Extract an address from the args for auto-survey fallback
        const locs = parsedArgs.locations as Array<string | { query?: string }> | undefined;
        if (locs?.[0]) {
          ctx.voidAnalysisAddress = typeof locs[0] === "string" ? locs[0] : locs[0].query;
        }
        // Capture the result for dashboard construction
        try {
          const parsed = typeof toolOutput === "string" ? JSON.parse(toolOutput) : toolOutput;
          if (parsed && !parsed.error) {
            ctx.voidAnalysisResult = parsed as VoidAnalysisResult;
          }
        } catch { /* non-critical */ }
      }
      if (!errored && toolName === "survey_area") {
        ctx.surveyAreaCalled = true;
        try {
          const parsed = typeof toolOutput === "string" ? JSON.parse(toolOutput) : toolOutput;
          if (parsed && parsed.by_category) {
            ctx.surveyAreaResult = parsed as SurveyAreaResult;
          }
        } catch { /* non-critical — validation just won't strip brands */ }
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
      finalText = wrap.message.content || "";
    } catch (err) {
      agentLog.warn("truncated wrap-up failed", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  // ── VOID ANALYSIS POST-PROCESSING ──
  // Three steps:
  //   (1) ALWAYS strip model's void_analysis block (it's usually invalid JSON)
  //   (2) Build the interactive dashboard from tool results + model prose
  //   (3) Scan for brand violations
  if (ctx.voidAnalysisCalled && finalText) {
    // Stash the original text so buildVoidDashboard can extract
    // tenant recommendations and demographics from the model's prose.
    ctx._finalTextForTenantExtraction = finalText;

    // Step 1: ALWAYS strip any model-emitted void_analysis block.
    // The model's JSON is unreliable (trailing commas, comments, etc.)
    // and renders as ugly raw text if we leave it. We rebuild from code.
    finalText = finalText.replace(/```void_analysis[\s\S]*?```/g, "").trim();

    // Step 2: Build the dashboard from real data + model prose.
    // Works with partial data — even without survey_area results,
    // we can build a site header + void cards from the model's text.
    const dashboard = buildVoidDashboard(ctx);
    if (dashboard) {
      const block = "```void_analysis\n" + JSON.stringify(dashboard) + "\n```\n\n";
      finalText = block + finalText;
    }

    // Step 3: Brand violation scan — flag businesses that exist within
    // 3 miles but appear in the model's text recommendations.
    if (ctx.surveyAreaResult?.by_category) {
      const nearbyBrands: Array<{ name: string; distance: number; category: string }> = [];
      for (const [cat, businesses] of Object.entries(ctx.surveyAreaResult.by_category)) {
        for (const biz of businesses) {
          if (biz.distance_miles <= 3) {
            nearbyBrands.push({ name: biz.name, distance: biz.distance_miles, category: cat });
          }
        }
      }

      const violations: Array<{ name: string; distance: number }> = [];
      const textLower = finalText.toLowerCase();
      for (const brand of nearbyBrands) {
        const brandLower = brand.name.toLowerCase().trim();
        if (brandLower.length < 6) continue;
        if (textLower.includes(brandLower)) {
          violations.push({ name: brand.name, distance: brand.distance });
        }
      }

      if (violations.length > 0) {
        const violationList = violations
          .map((v) => `- ${v.name} (${v.distance.toFixed(1)} mi away)`)
          .join("\n");
        agentLog.warn("void post-validation: brands in final text already nearby", { violationCount: violations.length });
        finalText +=
          `\n\n---\n\n**Correction:** The following businesses were flagged in ` +
          `recommendations but already operate within 3 miles of the site ` +
          `(per Google Places data). They should NOT be considered as tenant targets:\n\n` +
          violationList +
          `\n\nPlease disregard any recommendation of these businesses above.`;
      }
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

  // ── Completion rate instrumentation ────────────────────────
  // Track every agent run (completed, truncated, errored) so we
  // can surface success rates on the ops dashboard. Writes are
  // fire-and-forget — they must never block the response.
  const durationMs = Date.now() - _agentT0;
  const completionStatus = truncated ? "truncated" : "completed";
  try {
    const { supabaseAdmin: adminClient } = await import("@/lib/supabase/admin");
    adminClient.from("dante_workflow_run_checkpoints").insert({
      run_id: input.runId || `agent_${Date.now().toString(36)}`,
      node_id: `agent:${input.step.id}`,
      node_type: "agent",
      output: {
        status: completionStatus,
        steps_taken: stepIdx,
        duration_ms: durationMs,
        model,
        tools_used: stepIdx,
        truncated,
      },
      status: "success",
    }).then(() => {}, () => {});
  } catch {
    // Best-effort — never fail on instrumentation
  }
  agentLog.info("run complete", { status: completionStatus, durationMs, steps: stepIdx, model });

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
function trimPreamble(content: string | null | undefined | LlmContentBlock[]): string {
  if (!content || Array.isArray(content)) return "";
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
  if (names.includes("file_index_search")) return "Searching the file index...";
  if (names.includes("file_index_ingest")) return "Retrieving file content...";
  if (names.includes("file_index_list_folder")) return "Listing folder contents...";
  if (names.includes("clients_query")) return "Looking up contacts…";
  if (names.includes("skill_run")) return "Running a skill…";
  if (names.some((n) => n.startsWith("mcp__"))) return "Calling an external tool…";
  return "Working…";
}
