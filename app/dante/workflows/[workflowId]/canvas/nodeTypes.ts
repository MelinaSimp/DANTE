// app/dante/workflows/[workflowId]/canvas/nodeTypes.ts
//
// Static metadata for every node type the canvas can render.
// One place to change icons / labels / default configs so the
// palette, the node renderer, and the config drawer stay in sync.

import type { LucideIcon } from "lucide-react";
import type { StepType, WorkflowStep } from "@/lib/dante/workflow-types";
import {
  Hand, Clock4, Webhook, Globe, Sparkles, Users, Pencil, Mail, GitBranch, Clock,
  BookOpen, Building2, FileSearch, Search,
  TrendingUp, Calculator, ScrollText,
  MessageSquare, Bot, CalendarClock, Cpu, Database, Wrench,
  Plug, FileText, Repeat,
  UserCheck, CalendarX2, ArrowRightLeft,
  Shuffle, SquareFunction, Workflow,
  StickyNote,
  Code2,
} from "lucide-react";

export type NodeCategory =
  | "trigger"
  | "data"
  | "ai"
  | "communication"
  | "control"
  | "cre"
  | "utility";

export interface NodeTypeMeta {
  type: StepType;
  label: string;
  hint: string;
  icon: LucideIcon;
  group: "trigger" | "action";
  category: NodeCategory;
  accent: "verified" | "ink" | "accent" | "flag";
  default: (id: string) => WorkflowStep;
}

function mk<T extends WorkflowStep>(s: T): T { return s; }

export const NODE_TYPES: NodeTypeMeta[] = [
  // ── Triggers ──
  {
    type: "trigger_manual", label: "Manual trigger", hint: "Run from the UI button",
    icon: Hand, group: "trigger", category: "trigger", accent: "verified",
    default: (id) => mk({ id, type: "trigger_manual", name: "Manual trigger", config: {} }),
  },
  {
    type: "trigger_cron", label: "Schedule", hint: "Crontab (UTC)",
    icon: Clock4, group: "trigger", category: "trigger", accent: "verified",
    default: (id) => mk({ id, type: "trigger_cron", name: "Schedule", config: { cron: "0 9 * * *" } }),
  },
  {
    type: "trigger_webhook", label: "Webhook", hint: "External POST fires the run",
    icon: Webhook, group: "trigger", category: "trigger", accent: "verified",
    default: (id) => mk({ id, type: "trigger_webhook", name: "Webhook", config: {} }),
  },
  {
    type: "trigger_at", label: "Scheduled fire", hint: "One-shot at a specific time",
    icon: CalendarClock, group: "trigger", category: "trigger", accent: "verified",
    default: (id) => mk({ id, type: "trigger_at", name: "Scheduled fire",
      config: { scheduled_for: new Date().toISOString() } }),
  },
  {
    type: "trigger_lease_expiry", label: "Lease expiry", hint: "Fires when leases expire within N days",
    icon: CalendarX2, group: "trigger", category: "trigger", accent: "verified",
    default: (id) => mk({ id, type: "trigger_lease_expiry", name: "Lease expiry",
      config: { days_before: 90 } }),
  },
  {
    type: "trigger_deal_stage", label: "Deal stage change", hint: "Fires on pipeline stage transition",
    icon: ArrowRightLeft, group: "trigger", category: "trigger", accent: "verified",
    default: (id) => mk({ id, type: "trigger_deal_stage", name: "Deal stage change",
      config: {} }),
  },
  // ── Data ──
  {
    type: "query_clients", label: "Query contacts", hint: "Select rows from contacts",
    icon: Users, group: "action", category: "data", accent: "ink",
    default: (id) => mk({ id, type: "query_clients", name: "Query contacts",
      config: { filter: {}, limit: 25 } }),
  },
  {
    type: "update_contact", label: "Update contact", hint: "Patch one contact row",
    icon: Pencil, group: "action", category: "data", accent: "ink",
    default: (id) => mk({ id, type: "update_contact", name: "Update contact",
      config: { contact_id: "", patch: {} } }),
  },
  {
    type: "http", label: "HTTP request", hint: "Fetch any URL",
    icon: Globe, group: "action", category: "data", accent: "ink",
    default: (id) => mk({ id, type: "http", name: "HTTP request",
      config: { url: "https://", method: "GET", headers: {}, body: null } }),
  },
  {
    type: "transform", label: "Transform", hint: "Set / rename / map fields",
    icon: Shuffle, group: "action", category: "data", accent: "ink",
    default: (id) => mk({ id, type: "transform", name: "Transform",
      config: { operations: [{ action: "set", field: "result", value: "" }] } }),
  },
  {
    type: "integration_query", label: "Integration query", hint: "Query a connected integration",
    icon: Plug, group: "action", category: "data", accent: "accent",
    default: (id) => mk({ id, type: "integration_query", name: "Integration query",
      config: { provider: "", endpoint: "", method: "GET" } }),
  },
  // ── AI / LLM ──
  {
    type: "openai", label: "OpenAI prompt", hint: "Chat completion -> text",
    icon: Sparkles, group: "action", category: "ai", accent: "accent",
    default: (id) => mk({ id, type: "openai", name: "OpenAI prompt",
      config: { model: "gpt-4o-mini", system: "", prompt: "", max_tokens: 800 } }),
  },
  {
    type: "agent", label: "Agent", hint: "Autonomous LLM loop with tools",
    icon: Bot, group: "action", category: "ai", accent: "accent",
    default: (id) => mk({ id, type: "agent", name: "Agent",
      config: { objective: "", tools: [], max_steps: 8 } }),
  },
  {
    type: "archive_lookup", label: "Archive lookup",
    hint: "Vector-search the firm's archive",
    icon: BookOpen, group: "action", category: "ai", accent: "accent",
    default: (id) => mk({ id, type: "archive_lookup", name: "Archive lookup",
      config: { query: "", k: 5 } }),
  },
  {
    type: "web_search", label: "Web search", hint: "Search the web via Tavily",
    icon: Search, group: "action", category: "ai", accent: "accent",
    default: (id) => mk({ id, type: "web_search", name: "Web search",
      config: { query: "", max_results: 5, search_depth: "basic" } }),
  },
  {
    type: "chat_model", label: "Chat model", hint: "The agent's brain — wire into an Agent",
    icon: Cpu, group: "action", category: "ai", accent: "accent",
    default: (id) => mk({ id, type: "chat_model", name: "Chat model",
      config: { model: "claude-sonnet-4-6" } }),
  },
  {
    type: "agent_memory", label: "Memory", hint: "Let the agent remember across the run",
    icon: Database, group: "action", category: "ai", accent: "accent",
    default: (id) => mk({ id, type: "agent_memory", name: "Memory",
      config: { kind: "conversation" } }),
  },
  {
    type: "agent_tool", label: "Tool", hint: "Give the agent one Drift tool",
    icon: Wrench, group: "action", category: "ai", accent: "accent",
    default: (id) => mk({ id, type: "agent_tool", name: "Tool",
      config: { tool: "vault.cite" } }),
  },
  // ── Communication ──
  {
    type: "send_email", label: "Send email", hint: "Resend transactional send",
    icon: Mail, group: "action", category: "communication", accent: "ink",
    default: (id) => mk({ id, type: "send_email", name: "Send email",
      config: { to: "", subject: "", html: "", text: "" } }),
  },
  {
    type: "send_sms", label: "Send SMS", hint: "iMessage / SMS via SendBlue",
    icon: MessageSquare, group: "action", category: "communication", accent: "ink",
    default: (id) => mk({ id, type: "send_sms", name: "Send SMS",
      config: { to_phone: "", body: "" } }),
  },
  {
    type: "generate_document", label: "Generate document", hint: "Branded PDF report",
    icon: FileText, group: "action", category: "communication", accent: "accent",
    default: (id) => mk({ id, type: "generate_document", name: "Generate document",
      config: { title: "", sections: [] } }),
  },
  // ── Control flow ──
  {
    type: "condition", label: "Condition", hint: "Branch on true / false",
    icon: GitBranch, group: "action", category: "control", accent: "flag",
    default: (id) => mk({ id, type: "condition", name: "Condition",
      config: { expression: "", on_false: "stop" } }),
  },
  {
    type: "switch", label: "Switch", hint: "Multi-branch on expression",
    icon: SquareFunction, group: "action", category: "control", accent: "flag",
    default: (id) => mk({ id, type: "switch", name: "Switch",
      config: { expression: "", cases: [{ value: "a", label: "Case A" }, { value: "b", label: "Case B" }], default_case: "__default__" } }),
  },
  {
    type: "for_each", label: "For each", hint: "Iterate array, apply action per item",
    icon: Repeat, group: "action", category: "control", accent: "flag",
    default: (id) => mk({ id, type: "for_each", name: "For each",
      config: { items: "{{steps.trigger.input.items}}", action_type: "send_email", action_config: {} } }),
  },
  {
    type: "delay", label: "Delay", hint: "Pause up to 60s",
    icon: Clock, group: "action", category: "control", accent: "ink",
    default: (id) => mk({ id, type: "delay", name: "Delay",
      config: { seconds: 5 } }),
  },
  {
    type: "approval", label: "Approval", hint: "Pause for human approve / reject",
    icon: UserCheck, group: "action", category: "control", accent: "flag",
    default: (id) => mk({ id, type: "approval", name: "Approval",
      config: { message: "Please review and approve this workflow step.", timeout_hours: 72 } }),
  },
  {
    type: "sub_workflow", label: "Sub-workflow", hint: "Run another workflow as a step",
    icon: Workflow, group: "action", category: "control", accent: "accent",
    default: (id) => mk({ id, type: "sub_workflow", name: "Sub-workflow",
      config: { workflow_id: "", input: {} } }),
  },
  // ── CRE ──
  {
    type: "query_properties", label: "Query properties", hint: "Select from properties table",
    icon: Building2, group: "action", category: "cre", accent: "accent",
    default: (id) => mk({ id, type: "query_properties", name: "Query properties",
      config: { filter: {}, limit: 25 } }),
  },
  {
    type: "lease_lookup", label: "Lease lookup", hint: "Fetch abstracted lease terms",
    icon: FileSearch, group: "action", category: "cre", accent: "accent",
    default: (id) => mk({ id, type: "lease_lookup", name: "Lease lookup",
      config: { status: "completed", limit: 10 } }),
  },
  {
    type: "market_comps", label: "Market comps", hint: "Imported sales comparables",
    icon: TrendingUp, group: "action", category: "cre", accent: "accent",
    default: (id) => mk({ id, type: "market_comps", name: "Market comps",
      config: { property_type: "", limit: 50 } }),
  },
  {
    type: "underwrite", label: "Underwrite", hint: "DCF model on a rent roll",
    icon: Calculator, group: "action", category: "cre", accent: "accent",
    default: (id) => mk({ id, type: "underwrite", name: "Underwrite",
      config: { vault_item_id: "{{steps.trigger.input.vault_item_id}}" } }),
  },
  {
    type: "lease_abstract", label: "Lease abstract", hint: "AI lease term extraction",
    icon: ScrollText, group: "action", category: "cre", accent: "accent",
    default: (id) => mk({ id, type: "lease_abstract", name: "Lease abstract",
      config: { vault_item_id: "{{steps.trigger.input.vault_item_id}}" } }),
  },
  {
    type: "code", label: "Code", hint: "Custom JavaScript logic",
    icon: Code2, group: "action", category: "data", accent: "ink",
    default: (id) => mk({ id, type: "code", name: "Code", config: { language: "javascript", code: "// Access prior steps via steps object\n// Return an object with your output\nreturn { result: 'hello' };" } }),
  },
  // ── Utility ──
  {
    type: "sticky_note", label: "Sticky note", hint: "Canvas annotation",
    icon: StickyNote, group: "action", category: "utility", accent: "ink",
    default: (id) => mk({ id, type: "sticky_note", name: "Note",
      config: { content: "" } }),
  },
];

export const CATEGORY_LABELS: Record<NodeCategory, string> = {
  trigger: "Triggers",
  data: "Data",
  ai: "AI / LLM",
  communication: "Communication",
  control: "Control flow",
  cre: "Commercial RE",
  utility: "Utility",
};

export const CATEGORY_ORDER: NodeCategory[] = [
  "trigger", "data", "ai", "communication", "control", "cre", "utility",
];

export function getMeta(type: StepType): NodeTypeMeta | undefined {
  return NODE_TYPES.find((t) => t.type === type);
}

export function isTriggerType(t: StepType): boolean {
  return t.startsWith("trigger_");
}

// Workflows authored or synced via n8n are stored with n8n-native node type
// names (e.g. "n8n-nodes-drift-cre.driftAiAgent"), not Drift step types. The
// editor styles a node by resolving its type to the Drift equivalent for
// icon / label / kind / sizing. This is DISPLAY ONLY — the stored type is
// left untouched so the n8n execution graph round-trips unchanged on save.
const N8N_TO_DRIFT: Record<string, StepType> = {
  "n8n-nodes-base.webhook": "trigger_webhook",
  "n8n-nodes-base.scheduleTrigger": "trigger_cron",
  "n8n-nodes-base.manualTrigger": "trigger_manual",
  "n8n-nodes-base.httpRequest": "http",
  "n8n-nodes-base.if": "condition",
  "n8n-nodes-base.switch": "switch",
  "n8n-nodes-base.wait": "delay",
  "n8n-nodes-base.splitInBatches": "for_each",
  "n8n-nodes-base.code": "code",
  "n8n-nodes-base.emailSend": "send_email",
  "n8n-nodes-base.twilio": "send_sms",
  "n8n-nodes-base.executeWorkflow": "sub_workflow",
  "@n8n/n8n-nodes-langchain.openAi": "openai",
  "@n8n/n8n-nodes-langchain.agent": "agent",
  "n8n-nodes-drift-cre.driftAiAgent": "agent",
  "n8n-nodes-drift-cre.driftQueryContacts": "query_clients",
  "n8n-nodes-drift-cre.driftUpdateContact": "update_contact",
  "n8n-nodes-drift-cre.driftQueryProperties": "query_properties",
  "n8n-nodes-drift-cre.driftLeaseLookup": "lease_lookup",
  "n8n-nodes-drift-cre.driftMarketComps": "market_comps",
  "n8n-nodes-drift-cre.driftUnderwriter": "underwrite",
  "n8n-nodes-drift-cre.driftLeaseAbstractor": "lease_abstract",
  "n8n-nodes-drift-cre.driftVaultSearch": "archive_lookup",
  "n8n-nodes-drift-cre.driftWebSearch": "web_search",
  "n8n-nodes-drift-cre.driftGenerateDocument": "generate_document",
  "n8n-nodes-drift-cre.driftApprovalGate": "approval",
};

/** Resolve a raw node type (Drift- or n8n-native) to the Drift step type used
 *  for styling. Drift types pass through unchanged. */
export function resolveStepType(type: string): StepType {
  if (N8N_TO_DRIFT[type]) return N8N_TO_DRIFT[type];
  if (type.startsWith("@n8n/n8n-nodes-langchain.")) {
    if (/memory/i.test(type)) return "agent_memory";
    if (/tool|vectorstore|retriever/i.test(type)) return "agent_tool";
    if (/lmchat|chatmodel|chat/i.test(type)) return "chat_model";
    if (/agent/i.test(type)) return "agent";
  }
  if (type.endsWith("Trigger") || type.endsWith(".webhook")) return "trigger_webhook";
  return type as StepType;
}

/** Accent → (bg, fg, border) tuple of CSS var strings. */
export function accentClasses(accent: NodeTypeMeta["accent"]): {
  iconWrap: string; selectedOutline: string;
} {
  switch (accent) {
    case "verified":
      return { iconWrap: "bg-[var(--verified-soft)] text-[var(--verified)]",
               selectedOutline: "ring-[var(--verified)]" };
    case "accent":
      return { iconWrap: "bg-[var(--accent-soft)] text-[var(--accent)]",
               selectedOutline: "ring-[var(--accent)]" };
    case "flag":
      return { iconWrap: "bg-[var(--flag-soft)] text-[var(--flag)]",
               selectedOutline: "ring-[var(--flag)]" };
    case "ink":
    default:
      return { iconWrap: "bg-[var(--canvas-subtle)] text-[var(--ink)]",
               selectedOutline: "ring-[var(--ink)]" };
  }
}
