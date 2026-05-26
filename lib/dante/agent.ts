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
import {
  handleSiteScanSearch,
  handleSiteScanDetail,
  handleSiteScanListings,
  handleSiteScanVoidAnalysis,
} from "@/lib/site-scan/tools";
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
        "Directional void analysis: search a corridor or area for potential " +
        "development sites. Provide 2-5 search points along the target area " +
        "(intersections, town centers, zip codes) and the tool will scan a " +
        "10-mile radius around each, deduplicate, score parcels by fit, and " +
        "return a ranked shortlist of 15-20 candidate sites. Use when the user " +
        "asks to find potential sites, run a void analysis, identify development " +
        "opportunities, or locate land along a corridor.",
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
        "equity_multiple, irr.\n\n" +
        "You can request multiple metrics in one call (e.g. [\"noi\", \"cap_rate\", \"dscr\"]) " +
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
              "break_even_occupancy, debt_service, equity_multiple, irr.",
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
  email_send: "email.send",
  http_fetch: "http.fetch",
  skill_run: "skill.run",
  reminder_schedule: "reminder.schedule",
  workflow_propose: "workflow.propose",
  workflow_run: "workflow.run",
  workflow_list_templates: "workflow.list_templates",
  workflow_clone_template: "workflow.clone_template",
  file_index_search: "file_index.search",
  file_index_ingest: "file_index.ingest",
  file_index_list_folder: "file_index.list_folder",
  site_scan_search: "site_scan.search",
  site_scan_detail: "site_scan.detail",
  site_scan_listings: "site_scan.listings",
  site_scan_void_analysis: "site_scan.void_analysis",
  web_search: "web.search",
  cre_calculate: "cre.calculate",
  document_create: "document.create",
  document_edit: "document.edit",
  document_list_templates: "document.list_templates",
  document_save_template: "document.save_template",
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
  "vault.cite": 18,       // lease abstraction needs 14+ passes; 18 gives retry headroom
  "reminder.schedule": 5, // bound the runaway-reminders failure mode
  "regulatory.search": 8, // bounded: a single answer rarely needs >3-4 SEC/IRS lookups
  "inconsistency.detect": 4, // expensive (full doc content in prompt); rarely needs more
  "workflow.propose": 2,  // one ask = one proposal; cap covers a "and also..." follow-up
  "workflow.run": 3,      // trigger existing workflows; 3 covers multi-step asks
  "workflow.list_templates": 3,
  "workflow.clone_template": 40, // cloning all 33 templates in one go is a valid ask
  "file_index.search": 5,
  "file_index.ingest": 3,
  "file_index.list_folder": 5,
  "site_scan.search": 5,
  "site_scan.detail": 5,
  "site_scan.listings": 3,
  "site_scan.void_analysis": 3,
  "web.search": 10,
  "cre.calculate": 10, // cheap (pure math), but cap to prevent runaway loops
  "document.create": 5,  // each creates a file in storage + vault row; 5 is generous
  "document.edit": 5,    // re-renders + re-uploads; match create budget
  "document.list_templates": 3, // read-only; cheap
  "document.save_template": 3,  // one save per request is typical
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
      const hasRealContent = hits.some((h) => !h.content.startsWith("[File ") && !h.content.startsWith("[Document "));
      const hasPendingFiles = hits.some((h) => h.content.includes("ingestion was triggered automatically"));
      const note = !hasRealContent && hasPendingFiles
        ? "\n\nNOTE: file ingestion is in progress. Call vault.cite with the same query to check if content is now available."
        : "";
      return { hits, formatted: formatHitsForPrompt(hits) + note };
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
        generated = await generateWorkflow({
          prompt: intent,
          connectedIntegrations: (connections || []).map((c: { provider: string; provider_kind: string | null; display_name: string | null }) => ({
            provider: c.provider,
            provider_kind: c.provider_kind,
            display_name: c.display_name,
          })),
        });
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

    case "workflow.run": {
      const nameQuery = String(args.workflow_name || "").trim();
      if (!nameQuery) return { error: "workflow.run: 'workflow_name' required." };

      const { data: workflows } = await supabaseAdmin
        .from("dante_workflows")
        .select("id, name, graph, enabled")
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

      const { enqueueRun, kickQueueWorker } = await import("@/lib/dante/run-executor");
      const result = await enqueueRun({
        workflow_id: match.id,
        workspace_id: ctx.workspaceId,
        triggered_by: ctx.userId || null,
        payload: wfInput,
      });

      if ("error" in result) {
        return { error: `workflow.run: ${result.error}` };
      }

      const origin = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000";
      kickQueueWorker(origin);

      return {
        ok: true,
        run_id: result.run_id,
        workflow_name: match.name,
        workflow_id: match.id,
        input_provided: wfInput,
        message: `Workflow "${match.name}" has been triggered. It's now running in the background.`,
      };
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

      const { getTemplate } = await import("@/lib/dante/templates");
      const template = getTemplate(slug);
      if (!template) {
        return { error: `workflow.clone_template: unknown template "${slug}". Call workflow.list_templates to see available slugs.` };
      }

      const graph = structuredClone(template.graph);
      const triggerNode = graph.nodes.find((n: { type: string }) => n.type.startsWith("trigger_"));
      const triggerType = triggerNode?.type.replace("trigger_", "") || "manual";

      const { data: wf, error: insertErr } = await supabaseAdmin
        .from("dante_workflows")
        .insert({
          workspace_id: ctx.workspaceId,
          created_by: ctx.userId ?? null,
          name: template.name,
          description: template.description,
          trigger: { type: triggerType },
          steps: [],
          graph,
          enabled: true,
        })
        .select("id")
        .single();

      if (insertErr) {
        return { error: `workflow.clone_template: ${insertErr.message}` };
      }

      return {
        ok: true,
        workflow_id: (wf as { id: string }).id,
        name: template.name,
        category: template.category,
        trigger: template.triggerLabel,
        message: `Cloned "${template.name}" into your workspace. It's enabled and ready to use.`,
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
  console.log(`[agent] tools resolved in ${Date.now() - _agentT0}ms (${builtinDefs.length} builtin, ${mcpDefs.length} mcp)`);

  const maxSteps = Math.min(Math.max(Number(cfg.max_steps) || 8, 1), HARD_MAX_STEPS);
  const workspaceModel = await getWorkspaceModel(input.workspaceId);
  const model = workspaceModel || cfg.model || "claude-sonnet-4-6";
  console.log(`[agent] model=${model} maxSteps=${maxSteps}`);

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
    console.log(`[agent] staticMode=${staticMode.mode} in ${Date.now() - _modeT0}ms`);

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
        console.log(`[agent] autoMode=${autoMode.mode} (${autoMode.reason}) in ${Date.now() - _autoT0}ms`);
      } catch (err) {
        console.warn(`[agent] autoMode failed in ${Date.now() - _modeT0}ms:`, err);
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
      "email.send": 0,
      "http.fetch": 0,
      "skill.run": 0,
      "reminder.schedule": 0,
      "workflow.propose": 0,
      "workflow.run": 0,
      "workflow.list_templates": 0,
      "workflow.clone_template": 0,
      "file_index.search": 0,
      "file_index.ingest": 0,
      "file_index.list_folder": 0,
      "site_scan.search": 0,
      "site_scan.detail": 0,
      "site_scan.listings": 0,
      "site_scan.void_analysis": 0,
      "web.search": 0,
      "cre.calculate": 0,
      "document.create": 0,
      "document.edit": 0,
      "document.list_templates": 0,
      "document.save_template": 0,
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
    const _llmT0 = Date.now();
    console.log(`[agent] llmComplete iter=${thisIteration} starting (${messages.length} msgs, ${tools.length} tools)`);
    const completion = await llmComplete({
      model,
      messages: messages as LlmMessage[],
      tools: tools.length > 0 ? (tools as LlmToolDef[]) : undefined,
      toolChoice: tools.length > 0 ? "auto" : undefined,
      feature: "agent.loop",
      workspaceId: input.workspaceId,
      processingMode,
    });
    console.log(`[agent] llmComplete iter=${thisIteration} done in ${Date.now() - _llmT0}ms finish=${completion.finishReason}`);

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
      finalText = (typeof assistantMsg.content === "string" ? assistantMsg.content : "") || "";
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
      finalText = wrap.message.content || "";
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
