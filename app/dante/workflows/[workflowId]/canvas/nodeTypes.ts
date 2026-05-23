// app/dante/workflows/[workflowId]/canvas/nodeTypes.ts
//
// Static metadata for every node type the canvas can render.
// One place to change icons / labels / default configs so the
// palette, the node renderer, and the config drawer stay in sync.

import type { LucideIcon } from "lucide-react";
import type { StepType, WorkflowStep } from "@/lib/dante/workflow-types";
import {
  Hand, Clock4, Webhook, Globe, Sparkles, Users, Pencil, Mail, GitBranch, Clock,
  BookOpen, Building2, ListChecks, Handshake, FileSearch, Search,
  MessageSquare, Bot, CalendarClock,
  Plug, ShieldCheck, FileText, Repeat,
  UserCheck, CalendarX2, ArrowRightLeft,
} from "lucide-react";

export interface NodeTypeMeta {
  type: StepType;
  label: string;
  hint: string;
  icon: LucideIcon;
  group: "trigger" | "action";
  // Accent color used on the node card's icon chip + selected outline.
  accent: "verified" | "ink" | "accent" | "flag";
  default: (id: string) => WorkflowStep;
}

function mk<T extends WorkflowStep>(s: T): T { return s; }

export const NODE_TYPES: NodeTypeMeta[] = [
  // ── Triggers ──
  {
    type: "trigger_manual", label: "Manual trigger", hint: "Run from the UI button",
    icon: Hand, group: "trigger", accent: "verified",
    default: (id) => mk({ id, type: "trigger_manual", name: "Manual trigger", config: {} }),
  },
  {
    type: "trigger_cron", label: "Schedule", hint: "Crontab (UTC)",
    icon: Clock4, group: "trigger", accent: "verified",
    default: (id) => mk({ id, type: "trigger_cron", name: "Schedule", config: { cron: "0 9 * * *" } }),
  },
  {
    type: "trigger_webhook", label: "Webhook", hint: "External POST fires the run",
    icon: Webhook, group: "trigger", accent: "verified",
    default: (id) => mk({ id, type: "trigger_webhook", name: "Webhook", config: {} }),
  },
  // ── Actions ──
  {
    type: "http", label: "HTTP request", hint: "Fetch any URL",
    icon: Globe, group: "action", accent: "ink",
    default: (id) => mk({ id, type: "http", name: "HTTP request",
      config: { url: "https://", method: "GET", headers: {}, body: null } }),
  },
  {
    type: "openai", label: "OpenAI prompt", hint: "Chat completion → text",
    icon: Sparkles, group: "action", accent: "accent",
    default: (id) => mk({ id, type: "openai", name: "OpenAI prompt",
      config: { model: "gpt-4o-mini", system: "", prompt: "", max_tokens: 800 } }),
  },
  {
    type: "query_clients", label: "Query contacts", hint: "Select rows from contacts",
    icon: Users, group: "action", accent: "ink",
    default: (id) => mk({ id, type: "query_clients", name: "Query contacts",
      config: { filter: {}, limit: 25 } }),
  },
  {
    type: "update_contact", label: "Update contact", hint: "Patch one contact row",
    icon: Pencil, group: "action", accent: "ink",
    default: (id) => mk({ id, type: "update_contact", name: "Update contact",
      config: { contact_id: "", patch: {} } }),
  },
  {
    type: "send_email", label: "Send email", hint: "Resend transactional send",
    icon: Mail, group: "action", accent: "ink",
    default: (id) => mk({ id, type: "send_email", name: "Send email",
      config: { to: "", subject: "", html: "", text: "" } }),
  },
  {
    type: "condition", label: "Condition", hint: "Branch on true / false",
    icon: GitBranch, group: "action", accent: "flag",
    default: (id) => mk({ id, type: "condition", name: "Condition",
      config: { expression: "", on_false: "stop" } }),
  },
  {
    type: "delay", label: "Delay", hint: "Pause up to 60s",
    icon: Clock, group: "action", accent: "ink",
    default: (id) => mk({ id, type: "delay", name: "Delay",
      config: { seconds: 5 } }),
  },
  {
    type: "archive_lookup", label: "Archive lookup",
    hint: "Vector-search the firm's archive",
    icon: BookOpen, group: "action", accent: "accent",
    default: (id) => mk({ id, type: "archive_lookup", name: "Archive lookup",
      config: { query: "", k: 5 } }),
  },
  // ── CRE nodes ──
  {
    type: "query_properties", label: "Query properties", hint: "Select from properties table",
    icon: Building2, group: "action", accent: "accent",
    default: (id) => mk({ id, type: "query_properties", name: "Query properties",
      config: { filter: {}, limit: 25 } }),
  },
  {
    type: "query_listings", label: "Query listings", hint: "Select from active listings",
    icon: ListChecks, group: "action", accent: "accent",
    default: (id) => mk({ id, type: "query_listings", name: "Query listings",
      config: { filter: {}, limit: 25 } }),
  },
  {
    type: "query_offers", label: "Query offers", hint: "Select from offers table",
    icon: Handshake, group: "action", accent: "ink",
    default: (id) => mk({ id, type: "query_offers", name: "Query offers",
      config: { filter: {}, limit: 25 } }),
  },
  {
    type: "lease_lookup", label: "Lease lookup", hint: "Fetch abstracted lease terms",
    icon: FileSearch, group: "action", accent: "accent",
    default: (id) => mk({ id, type: "lease_lookup", name: "Lease lookup",
      config: { status: "completed", limit: 10 } }),
  },
  {
    type: "web_search", label: "Web search", hint: "Search the web via Tavily",
    icon: Search, group: "action", accent: "accent",
    default: (id) => mk({ id, type: "web_search", name: "Web search",
      config: { query: "", max_results: 5, search_depth: "basic" } }),
  },
  {
    type: "send_sms", label: "Send SMS", hint: "iMessage / SMS via SendBlue",
    icon: MessageSquare, group: "action", accent: "ink",
    default: (id) => mk({ id, type: "send_sms", name: "Send SMS",
      config: { to_phone: "", body: "" } }),
  },
  {
    type: "agent", label: "Agent", hint: "Autonomous LLM loop with tools",
    icon: Bot, group: "action", accent: "accent",
    default: (id) => mk({ id, type: "agent", name: "Agent",
      config: { objective: "", tools: [], max_steps: 8 } }),
  },
  {
    type: "trigger_at", label: "Scheduled fire", hint: "One-shot at a specific time",
    icon: CalendarClock, group: "trigger", accent: "verified",
    default: (id) => mk({ id, type: "trigger_at", name: "Scheduled fire",
      config: { scheduled_for: new Date().toISOString() } }),
  },
  // ── Integration + data source nodes ──
  {
    type: "integration_query", label: "Integration query", hint: "Query a connected integration",
    icon: Plug, group: "action", accent: "accent",
    default: (id) => mk({ id, type: "integration_query", name: "Integration query",
      config: { provider: "", endpoint: "", method: "GET" } }),
  },
  {
    type: "due_diligence", label: "Due diligence", hint: "Census + BLS + FEMA + EPA lookup",
    icon: ShieldCheck, group: "action", accent: "accent",
    default: (id) => mk({ id, type: "due_diligence", name: "Due diligence",
      config: { latitude: 0, longitude: 0, state_fips: "", county_fips: "" } }),
  },
  {
    type: "generate_document", label: "Generate document", hint: "Branded PDF report",
    icon: FileText, group: "action", accent: "accent",
    default: (id) => mk({ id, type: "generate_document", name: "Generate document",
      config: { title: "", sections: [] } }),
  },
  {
    type: "for_each", label: "For each", hint: "Iterate array, apply action per item",
    icon: Repeat, group: "action", accent: "flag",
    default: (id) => mk({ id, type: "for_each", name: "For each",
      config: { items: "{{steps.trigger.input.items}}", action_type: "send_email", action_config: {} } }),
  },
  {
    type: "approval", label: "Approval", hint: "Pause for human approve / reject",
    icon: UserCheck, group: "action", accent: "flag",
    default: (id) => mk({ id, type: "approval", name: "Approval",
      config: { message: "Please review and approve this workflow step.", timeout_hours: 72 } }),
  },
  // ── Event-driven triggers ──
  {
    type: "trigger_lease_expiry", label: "Lease expiry", hint: "Fires when leases expire within N days",
    icon: CalendarX2, group: "trigger", accent: "verified",
    default: (id) => mk({ id, type: "trigger_lease_expiry", name: "Lease expiry",
      config: { days_before: 90 } }),
  },
  {
    type: "trigger_deal_stage", label: "Deal stage change", hint: "Fires on pipeline stage transition",
    icon: ArrowRightLeft, group: "trigger", accent: "verified",
    default: (id) => mk({ id, type: "trigger_deal_stage", name: "Deal stage change",
      config: {} }),
  },
];

export function getMeta(type: StepType): NodeTypeMeta | undefined {
  return NODE_TYPES.find((t) => t.type === type);
}

export function isTriggerType(t: StepType): boolean {
  return t.startsWith("trigger_");
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
