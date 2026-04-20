// lib/dante/templates.ts
//
// Pre-built workflow templates for financial advisors. These are the
// "Harvey for FAs" starter pack — each template defines a real
// WorkflowGraph that users can clone with one click into their own
// workspace, then tweak.
//
// Kept in code (vs a DB table) so templates are version-controlled
// alongside the runner and can evolve with step-type changes. The
// /api/dante/templates/[slug]/clone endpoint reads this module and
// inserts a fresh dante_workflows row with the graph copied.
//
// Each graph must:
//   • have exactly one trigger node
//   • use only step types the runner knows about (see workflow-types.ts)
//   • reference archive_lookup context as {{steps.<id>.context}} in
//     downstream openai prompts — that's the Harvey citation pattern.

import type { WorkflowGraph } from "./workflow-types";

export interface WorkflowTemplate {
  slug: string;
  name: string;
  description: string;
  category: "Client communication" | "Compliance" | "Operations" | "Prospecting" | "Research";
  /** Lucide icon name — looked up by the gallery at render time. */
  icon: string;
  /** Color chip on the card — maps to our accent token. */
  accent: "verified" | "ink" | "accent" | "flag";
  /** Human label for the trigger shown on the card. */
  triggerLabel: string;
  /** Does this template rely on the Archive? UI shows a "needs archive" pill. */
  requiresArchive?: boolean;
  graph: WorkflowGraph;
}

// ── Graph helpers ─────────────────────────────────────────────
// Keep the raw graph literals legible. `row(y)` stacks nodes
// top-to-bottom at the same x so the cloned canvas is tidy.

const X = 60;
const row = (i: number) => ({ x: X, y: 40 + i * 150 });
const edge = (src: string, dst: string, handle?: "true" | "false") => ({
  id: `${src}->${dst}${handle ? `-${handle}` : ""}`,
  source: src,
  target: dst,
  ...(handle ? { sourceHandle: handle } : {}),
});

// ══════════════════════════════════════════════════════════════
// 1 · Meeting-prep packet (cron, archive-aware)
// ══════════════════════════════════════════════════════════════

const meetingPrepGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_cron", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_cron", name: "Nightly at 7pm ET",
        config: { cron: "0 23 * * 1-5", timezone: "America/New_York" },
      } },
    },
    {
      id: "tomorrow", type: "query_clients", position: row(1),
      data: { step: {
        id: "tomorrow", type: "query_clients", name: "Pull tomorrow's client list",
        config: { filter: {}, limit: 10 },
      } },
    },
    {
      id: "lookup", type: "archive_lookup", position: row(2),
      data: { step: {
        id: "lookup", type: "archive_lookup", name: "Discussion topics from IPS",
        config: {
          query: "What review topics and fiduciary obligations should be covered in a quarterly client meeting?",
          k: 5, kind: "ips",
        },
      } },
    },
    {
      id: "draft", type: "openai", position: row(3),
      data: { step: {
        id: "draft", type: "openai", name: "Compose the prep packet",
        config: {
          model: "gpt-4o-mini",
          system: "You are a meticulous senior financial advisor preparing a 1-page meeting brief. Always cite any archive excerpts by number like [1].",
          prompt:
            "Tomorrow's meetings (contact rows):\n{{steps.tomorrow.contacts}}\n\n" +
            "Firm IPS / policy excerpts to reference:\n{{steps.lookup.context}}\n\n" +
            "Write a 1-page prep packet: top agenda items per client, compliance reminders drawn from the excerpts, and a 'what to ask' block.",
          max_tokens: 1200,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(4),
      data: { step: {
        id: "email", type: "send_email", name: "Email the packet to the advisor",
        config: {
          to: "{{secrets.advisor_email}}",
          subject: "Meeting prep — {{steps.trigger.input.fired_at}}",
          text: "{{steps.draft.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "tomorrow"),
    edge("tomorrow", "lookup"),
    edge("lookup", "draft"),
    edge("draft", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 2 · Post-meeting follow-up draft (webhook)
// ══════════════════════════════════════════════════════════════

const postMeetingGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_webhook", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_webhook", name: "Meeting-note webhook",
        config: {},
      } },
    },
    {
      id: "lookup", type: "archive_lookup", position: row(1),
      data: { step: {
        id: "lookup", type: "archive_lookup", name: "Pull relevant firm policy",
        config: {
          query: "Policies on meeting documentation, disclosures, and required follow-up actions",
          k: 4, kind: "policy",
        },
      } },
    },
    {
      id: "draft", type: "openai", position: row(2),
      data: { step: {
        id: "draft", type: "openai", name: "Draft the follow-up email",
        config: {
          model: "gpt-4o-mini",
          system: "You write warm, concise follow-up emails from a financial advisor to a client. Reference the client's own words where possible and flag any action items. Keep the tone professional-but-human.",
          prompt:
            "Meeting note / transcript:\n{{steps.trigger.input.note}}\n\n" +
            "Client name: {{steps.trigger.input.client_name}}\n\n" +
            "Relevant firm policy to stay consistent with:\n{{steps.lookup.context}}\n\n" +
            "Draft the follow-up email. End with a bulleted list of action items.",
          max_tokens: 800,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(3),
      data: { step: {
        id: "email", type: "send_email", name: "Send to client",
        config: {
          to: "{{steps.trigger.input.client_email}}",
          subject: "Following up on our conversation",
          text: "{{steps.draft.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "lookup"),
    edge("lookup", "draft"),
    edge("draft", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 3 · Quarterly review reminder (cron)
// ══════════════════════════════════════════════════════════════

const qbrGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_cron", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_cron", name: "Mondays 8am ET",
        config: { cron: "0 12 * * 1" },
      } },
    },
    {
      id: "clients", type: "query_clients", position: row(1),
      data: { step: {
        id: "clients", type: "query_clients", name: "All active clients",
        config: { filter: {}, limit: 500 },
      } },
    },
    {
      id: "digest", type: "openai", position: row(2),
      data: { step: {
        id: "digest", type: "openai", name: "Identify clients past QBR window",
        config: {
          model: "gpt-4o-mini",
          system: "You are an operations assistant. Return JSON only.",
          prompt:
            "Today is {{steps.trigger.input.fired_at}}. Here are the firm's clients:\n{{steps.clients.contacts}}\n\n" +
            "Return a JSON array of contacts whose last touchpoint (created_at as proxy) is older than 90 days. Each item: { id, name, email, days_since }.",
          max_tokens: 700,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(3),
      data: { step: {
        id: "email", type: "send_email", name: "Mail the digest",
        config: {
          to: "{{secrets.advisor_email}}",
          subject: "QBR reminder — clients overdue",
          text: "Clients past their 90-day QBR window:\n\n{{steps.digest.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "clients"),
    edge("clients", "digest"),
    edge("digest", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 4 · Life-event scanner (webhook, archive-aware)
// ══════════════════════════════════════════════════════════════

const lifeEventGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_webhook", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_webhook", name: "Transcript webhook",
        config: {},
      } },
    },
    {
      id: "classify", type: "openai", position: row(1),
      data: { step: {
        id: "classify", type: "openai", name: "Classify life events",
        config: {
          model: "gpt-4o-mini",
          system: "You detect major life events in meeting transcripts. Return JSON: { event: string|null, confidence: 0-1, quote: string }.",
          prompt:
            "Transcript:\n{{steps.trigger.input.transcript}}\n\n" +
            "Detect any of: marriage, divorce, birth, retirement, inheritance, new job, house purchase, college funding need. " +
            "If none, event=null.",
          max_tokens: 300,
        },
      } },
    },
    {
      id: "branch", type: "condition", position: row(2),
      data: { step: {
        id: "branch", type: "condition", name: "Event detected?",
        config: {
          expression: "{{steps.classify.text}} contains \"event\"",
          on_false: "stop",
        },
      } },
    },
    {
      id: "playbook", type: "archive_lookup", position: row(3),
      data: { step: {
        id: "playbook", type: "archive_lookup", name: "Planning playbook",
        config: {
          query: "Planning guidance for {{steps.classify.text}}",
          k: 5, kind: "memo",
        },
      } },
    },
    {
      id: "draft", type: "openai", position: row(4),
      data: { step: {
        id: "draft", type: "openai", name: "Draft advisor briefing",
        config: {
          model: "gpt-4o-mini",
          system: "You draft a short advisor-facing briefing explaining the detected event, the relevant planning moves, and suggested next actions.",
          prompt:
            "Client: {{steps.trigger.input.client_name}}\n" +
            "Classifier output: {{steps.classify.text}}\n" +
            "Playbook excerpts:\n{{steps.playbook.context}}\n\n" +
            "Draft the briefing.",
          max_tokens: 800,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(5),
      data: { step: {
        id: "email", type: "send_email", name: "Alert the advisor",
        config: {
          to: "{{secrets.advisor_email}}",
          subject: "Life event flagged for {{steps.trigger.input.client_name}}",
          text: "{{steps.draft.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "classify"),
    edge("classify", "branch"),
    edge("branch", "playbook", "true"),
    edge("playbook", "draft"),
    edge("draft", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 5 · Birthday & anniversary touch (cron)
// ══════════════════════════════════════════════════════════════

const birthdayGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_cron", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_cron", name: "1st of every month",
        config: { cron: "0 13 1 * *" },
      } },
    },
    {
      id: "clients", type: "query_clients", position: row(1),
      data: { step: {
        id: "clients", type: "query_clients", name: "All clients",
        config: { filter: {}, limit: 500 },
      } },
    },
    {
      id: "pick", type: "openai", position: row(2),
      data: { step: {
        id: "pick", type: "openai", name: "This month's milestones",
        config: {
          model: "gpt-4o-mini",
          system: "You return a JSON list. Nothing else.",
          prompt:
            "This month is {{steps.trigger.input.fired_at}}. From the contact list below, return every client whose birthday or firm-anniversary falls in this month. Shape: [{ id, name, email, milestone, date }].\n\n{{steps.clients.contacts}}",
          max_tokens: 600,
        },
      } },
    },
    {
      id: "drafts", type: "openai", position: row(3),
      data: { step: {
        id: "drafts", type: "openai", name: "Personalize a touch for each",
        config: {
          model: "gpt-4o-mini",
          system: "Write warm, short (3-4 sentence) personal notes from a financial advisor — never salesy, never mentioning markets or products.",
          prompt:
            "For each milestone, write a note. Return JSON: [{ id, name, email, body }].\n\n{{steps.pick.text}}",
          max_tokens: 1200,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(4),
      data: { step: {
        id: "email", type: "send_email", name: "Send to advisor for review",
        config: {
          to: "{{secrets.advisor_email}}",
          subject: "This month's birthday & anniversary notes",
          text: "Review & send the drafts below:\n\n{{steps.drafts.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "clients"),
    edge("clients", "pick"),
    edge("pick", "drafts"),
    edge("drafts", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 6 · Cash-drag weekly sweep (cron, webhook-fed positions)
// ══════════════════════════════════════════════════════════════

const cashDragGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_cron", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_cron", name: "Mondays 9am ET",
        config: { cron: "0 13 * * 1" },
      } },
    },
    {
      id: "positions", type: "http", position: row(1),
      data: { step: {
        id: "positions", type: "http", name: "Fetch accounts from custodian",
        config: {
          url: "{{secrets.custodian_positions_url}}",
          method: "GET",
          headers: { Authorization: "Bearer {{secrets.custodian_token}}" },
        },
      } },
    },
    {
      id: "analyze", type: "openai", position: row(2),
      data: { step: {
        id: "analyze", type: "openai", name: "Flag cash-heavy accounts",
        config: {
          model: "gpt-4o-mini",
          system: "You return a JSON array. No prose.",
          prompt:
            "Accounts payload:\n{{steps.positions.body}}\n\n" +
            "Return [{ account_id, client_name, cash_pct, excess_cash_usd }] for accounts where cash_pct > 8% AND excess is > $10k. Sort by excess desc.",
          max_tokens: 800,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(3),
      data: { step: {
        id: "email", type: "send_email", name: "Email the advisor",
        config: {
          to: "{{secrets.advisor_email}}",
          subject: "Cash drag report — {{steps.trigger.input.fired_at}}",
          text: "Accounts with sweep-worthy cash this week:\n\n{{steps.analyze.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "positions"),
    edge("positions", "analyze"),
    edge("analyze", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 7 · Market-volatility client comms (manual, archive-aware)
// ══════════════════════════════════════════════════════════════

const volatilityGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_manual", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_manual", name: "Advisor triggers manually",
        config: {},
      } },
    },
    {
      id: "clients", type: "query_clients", position: row(1),
      data: { step: {
        id: "clients", type: "query_clients", name: "All clients",
        config: { filter: {}, limit: 500 },
      } },
    },
    {
      id: "firmView", type: "archive_lookup", position: row(2),
      data: { step: {
        id: "firmView", type: "archive_lookup", name: "Firm volatility stance",
        config: {
          query: "Firm's official perspective on market volatility, staying the course, historical recoveries",
          k: 5, kind: "memo",
        },
      } },
    },
    {
      id: "compose", type: "openai", position: row(3),
      data: { step: {
        id: "compose", type: "openai", name: "Per-client reassurance note",
        config: {
          model: "gpt-4o-mini",
          system: "Write calm, non-alarmist, fiduciary-tone notes. Never predict. Always reference the client's plan. Reference firm memos by citation number.",
          prompt:
            "Headline: {{steps.trigger.input.headline}}\n\nClients:\n{{steps.clients.contacts}}\n\nFirm view:\n{{steps.firmView.context}}\n\nReturn JSON: [{ id, name, email, body }] — one short, personalized note per client.",
          max_tokens: 1500,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(4),
      data: { step: {
        id: "email", type: "send_email", name: "Email advisor for review",
        config: {
          to: "{{secrets.advisor_email}}",
          subject: "Volatility comms — drafts ready",
          text: "Review, personalize, and send:\n\n{{steps.compose.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "clients"),
    edge("clients", "firmView"),
    edge("firmView", "compose"),
    edge("compose", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 8 · RMD-window reminder (cron, archive-aware)
// ══════════════════════════════════════════════════════════════

const rmdGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_cron", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_cron", name: "1st of October",
        config: { cron: "0 13 1 10 *" },
      } },
    },
    {
      id: "rules", type: "archive_lookup", position: row(1),
      data: { step: {
        id: "rules", type: "archive_lookup", name: "RMD rules from archive",
        config: {
          query: "Current RMD age thresholds, deadlines, and first-year deferral rules",
          k: 4, kind: "regulation",
        },
      } },
    },
    {
      id: "clients", type: "query_clients", position: row(2),
      data: { step: {
        id: "clients", type: "query_clients", name: "All clients",
        config: { filter: {}, limit: 500 },
      } },
    },
    {
      id: "identify", type: "openai", position: row(3),
      data: { step: {
        id: "identify", type: "openai", name: "Filter clients in RMD window",
        config: {
          model: "gpt-4o-mini",
          system: "Return JSON only. Apply the cited RMD rules precisely.",
          prompt:
            "RMD rules excerpts:\n{{steps.rules.context}}\n\nClients (assume birth_date field when present):\n{{steps.clients.contacts}}\n\nReturn [{ id, name, email, age, required_action, deadline }] for clients who must take an RMD by Dec 31.",
          max_tokens: 900,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(4),
      data: { step: {
        id: "email", type: "send_email", name: "Send digest to advisor",
        config: {
          to: "{{secrets.advisor_email}}",
          subject: "RMD window — clients requiring distributions",
          text: "{{steps.identify.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "rules"),
    edge("rules", "clients"),
    edge("clients", "identify"),
    edge("identify", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 9 · Tax-document intake (webhook)
// ══════════════════════════════════════════════════════════════

const taxIntakeGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_webhook", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_webhook", name: "Tax doc upload webhook",
        config: {},
      } },
    },
    {
      id: "extract", type: "openai", position: row(1),
      data: { step: {
        id: "extract", type: "openai", name: "Extract structured fields",
        config: {
          model: "gpt-4o-mini",
          system: "You extract structured data from tax documents. Return JSON only.",
          prompt:
            "OCR / text from uploaded document:\n{{steps.trigger.input.text}}\n\n" +
            "Identify the form type (1099-DIV, 1099-INT, 1099-B, W-2, K-1, other). Return { form_type, tax_year, taxpayer_name, taxpayer_tin_masked, account_id, key_amounts: {...} }.",
          max_tokens: 700,
        },
      } },
    },
    {
      id: "guidance", type: "archive_lookup", position: row(2),
      data: { step: {
        id: "guidance", type: "archive_lookup", name: "Firm tax-doc retention policy",
        config: {
          query: "Document retention and client-communication policy for tax documents",
          k: 3, kind: "policy",
        },
      } },
    },
    {
      id: "notify", type: "send_email", position: row(3),
      data: { step: {
        id: "notify", type: "send_email", name: "Notify advisor with summary",
        config: {
          to: "{{secrets.advisor_email}}",
          subject: "Tax doc received: {{steps.trigger.input.client_name}}",
          text:
            "Extracted:\n{{steps.extract.text}}\n\n" +
            "Retention policy excerpts:\n{{steps.guidance.context}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "extract"),
    edge("extract", "guidance"),
    edge("guidance", "notify"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 10 · Annual beneficiary audit (cron)
// ══════════════════════════════════════════════════════════════

const beneficiaryGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_cron", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_cron", name: "Every January 15th",
        config: { cron: "0 13 15 1 *" },
      } },
    },
    {
      id: "rules", type: "archive_lookup", position: row(1),
      data: { step: {
        id: "rules", type: "archive_lookup", name: "Beneficiary review policy",
        config: {
          query: "Annual beneficiary review requirements, life-event triggers, and disclosure language",
          k: 4, kind: "policy",
        },
      } },
    },
    {
      id: "clients", type: "query_clients", position: row(2),
      data: { step: {
        id: "clients", type: "query_clients", name: "All clients",
        config: { filter: {}, limit: 500 },
      } },
    },
    {
      id: "drafts", type: "openai", position: row(3),
      data: { step: {
        id: "drafts", type: "openai", name: "Draft annual outreach",
        config: {
          model: "gpt-4o-mini",
          system: "You write audit-friendly, fiduciary-tone outreach. Always reference the cited firm policy by number.",
          prompt:
            "Policy excerpts:\n{{steps.rules.context}}\n\n" +
            "Clients:\n{{steps.clients.contacts}}\n\n" +
            "For each client, draft a 4-sentence email asking them to confirm or update beneficiaries this year. Return JSON: [{ id, name, email, body }].",
          max_tokens: 2000,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(4),
      data: { step: {
        id: "email", type: "send_email", name: "Send batch to advisor",
        config: {
          to: "{{secrets.advisor_email}}",
          subject: "Annual beneficiary audit — drafts ready",
          text: "{{steps.drafts.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "rules"),
    edge("rules", "clients"),
    edge("clients", "drafts"),
    edge("drafts", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 11 · New-client onboarding sequence (webhook)
// ══════════════════════════════════════════════════════════════

const onboardingGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_webhook", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_webhook", name: "New-client webhook",
        config: {},
      } },
    },
    {
      id: "welcome", type: "openai", position: row(1),
      data: { step: {
        id: "welcome", type: "openai", name: "Personal welcome note",
        config: {
          model: "gpt-4o-mini",
          system: "You write warm, personal welcome emails from a financial advisor to a newly signed client. Professional but human, 4-6 sentences.",
          prompt:
            "Client name: {{steps.trigger.input.client_name}}\n" +
            "Why they signed on: {{steps.trigger.input.signing_reason}}\n\n" +
            "Write the welcome email. End by mentioning that a planning questionnaire will arrive in a couple of days.",
          max_tokens: 500,
        },
      } },
    },
    {
      id: "welcomeEmail", type: "send_email", position: row(2),
      data: { step: {
        id: "welcomeEmail", type: "send_email", name: "Send welcome",
        config: {
          to: "{{steps.trigger.input.client_email}}",
          subject: "Welcome to the practice",
          text: "{{steps.welcome.text}}",
        },
      } },
    },
    {
      id: "pause", type: "delay", position: row(3),
      data: { step: {
        id: "pause", type: "delay", name: "Pause 60s (demo)",
        config: { seconds: 60 },
      } },
    },
    {
      id: "policy", type: "archive_lookup", position: row(4),
      data: { step: {
        id: "policy", type: "archive_lookup", name: "IPS + intake policy",
        config: {
          query: "New-client intake questionnaire items and fiduciary data-collection requirements",
          k: 5, kind: "ips",
        },
      } },
    },
    {
      id: "questionnaire", type: "openai", position: row(5),
      data: { step: {
        id: "questionnaire", type: "openai", name: "Draft intake questionnaire",
        config: {
          model: "gpt-4o-mini",
          system: "You produce a tidy HTML email with a numbered list of planning questions. Cite firm policy excerpts with [1], [2] style citations.",
          prompt:
            "Client: {{steps.trigger.input.client_name}}\n\n" +
            "Firm IPS / intake policy excerpts:\n{{steps.policy.context}}\n\n" +
            "Draft the intake questionnaire email — 8-12 questions covering goals, risk tolerance, liquidity needs, legacy, and tax situation.",
          max_tokens: 1200,
        },
      } },
    },
    {
      id: "questionnaireEmail", type: "send_email", position: row(6),
      data: { step: {
        id: "questionnaireEmail", type: "send_email", name: "Send questionnaire",
        config: {
          to: "{{steps.trigger.input.client_email}}",
          subject: "A few questions before our next meeting",
          html: "{{steps.questionnaire.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "welcome"),
    edge("welcome", "welcomeEmail"),
    edge("welcomeEmail", "pause"),
    edge("pause", "policy"),
    edge("policy", "questionnaire"),
    edge("questionnaire", "questionnaireEmail"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 12 · Year-end tax-loss harvesting scan (cron, archive-aware)
// ══════════════════════════════════════════════════════════════

const taxLossGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_cron", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_cron", name: "December 1st annually",
        config: { cron: "0 14 1 12 *" },
      } },
    },
    {
      id: "positions", type: "http", position: row(1),
      data: { step: {
        id: "positions", type: "http", name: "Pull positions from custodian",
        config: {
          url: "{{secrets.custodian_positions_url}}",
          method: "GET",
          headers: { Authorization: "Bearer {{secrets.custodian_token}}" },
        },
      } },
    },
    {
      id: "policy", type: "archive_lookup", position: row(2),
      data: { step: {
        id: "policy", type: "archive_lookup", name: "Firm TLH policy",
        config: {
          query: "Tax-loss harvesting policy, wash-sale guardrails, and substantially-identical replacement rules",
          k: 5, kind: "policy",
        },
      } },
    },
    {
      id: "scan", type: "openai", position: row(3),
      data: { step: {
        id: "scan", type: "openai", name: "Flag harvesting opportunities",
        config: {
          model: "gpt-4o-mini",
          system: "You return a strict JSON array — no prose. You apply wash-sale rules precisely as cited.",
          prompt:
            "Positions:\n{{steps.positions.body}}\n\n" +
            "Firm policy:\n{{steps.policy.context}}\n\n" +
            "Return [{ account_id, client_name, symbol, unrealized_loss_usd, replacement_suggestion, risk_notes }] for every lot with an unrealized loss > $500 that's clear of a 30-day wash window.",
          max_tokens: 1200,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(4),
      data: { step: {
        id: "email", type: "send_email", name: "Send digest to advisor",
        config: {
          to: "{{secrets.advisor_email}}",
          subject: "Tax-loss harvesting opportunities — year-end",
          text: "Candidates flagged per firm policy:\n\n{{steps.scan.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "positions"),
    edge("positions", "policy"),
    edge("policy", "scan"),
    edge("scan", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 13 · Post-meeting referral ask (webhook)
// ══════════════════════════════════════════════════════════════

const referralGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_webhook", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_webhook", name: "Post-meeting NPS webhook",
        config: {},
      } },
    },
    {
      id: "branch", type: "condition", position: row(1),
      data: { step: {
        id: "branch", type: "condition", name: "Highly satisfied?",
        config: {
          expression: "{{steps.trigger.input.nps}} >= 9",
          on_false: "stop",
        },
      } },
    },
    {
      id: "draft", type: "openai", position: row(2),
      data: { step: {
        id: "draft", type: "openai", name: "Draft referral ask",
        config: {
          model: "gpt-4o-mini",
          system: "You write tasteful, non-pushy referral-request emails from a financial advisor. Thank the client for their feedback, reference something specific from the meeting, then ask if they know one person who'd benefit from similar guidance. Keep it to 4 sentences.",
          prompt:
            "Client: {{steps.trigger.input.client_name}}\n" +
            "Meeting highlight to reference: {{steps.trigger.input.meeting_highlight}}\n" +
            "NPS score: {{steps.trigger.input.nps}}\n\n" +
            "Draft the email.",
          max_tokens: 400,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(3),
      data: { step: {
        id: "email", type: "send_email", name: "Queue draft to advisor",
        config: {
          to: "{{secrets.advisor_email}}",
          subject: "Referral ask ready: {{steps.trigger.input.client_name}}",
          text: "Review and send:\n\n{{steps.draft.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "branch"),
    edge("branch", "draft", "true"),
    edge("draft", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 14 · FOMC decision plain-English commentary (webhook, archive-aware)
// ══════════════════════════════════════════════════════════════

const fomcGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_webhook", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_webhook", name: "Fed-decision webhook",
        config: {},
      } },
    },
    {
      id: "firmView", type: "archive_lookup", position: row(1),
      data: { step: {
        id: "firmView", type: "archive_lookup", name: "Firm rates + duration stance",
        config: {
          query: "Firm's current view on Fed policy, rate path, duration positioning, and messaging discipline",
          k: 5, kind: "memo",
        },
      } },
    },
    {
      id: "clients", type: "query_clients", position: row(2),
      data: { step: {
        id: "clients", type: "query_clients", name: "All clients",
        config: { filter: {}, limit: 500 },
      } },
    },
    {
      id: "compose", type: "openai", position: row(3),
      data: { step: {
        id: "compose", type: "openai", name: "Plain-English commentary",
        config: {
          model: "gpt-4o-mini",
          system: "You translate Fed decisions into plain, calm, non-predictive client commentary. Always cite firm memos by number. Never forecast.",
          prompt:
            "Fed decision summary: {{steps.trigger.input.decision_summary}}\n" +
            "Clients to address:\n{{steps.clients.contacts}}\n\n" +
            "Firm view:\n{{steps.firmView.context}}\n\n" +
            "Return JSON: [{ id, name, email, body }] — one 5-sentence note per client that explains the decision and what (if anything) it changes for them.",
          max_tokens: 1500,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(4),
      data: { step: {
        id: "email", type: "send_email", name: "Deliver drafts to advisor",
        config: {
          to: "{{secrets.advisor_email}}",
          subject: "Fed commentary — drafts ready",
          text: "{{steps.compose.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "firmView"),
    edge("firmView", "clients"),
    edge("clients", "compose"),
    edge("compose", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 15 · Portfolio drift rebalance alert (webhook, archive-aware)
// ══════════════════════════════════════════════════════════════

const driftGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_webhook", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_webhook", name: "Drift-exceeds-threshold webhook",
        config: {},
      } },
    },
    {
      id: "policy", type: "archive_lookup", position: row(1),
      data: { step: {
        id: "policy", type: "archive_lookup", name: "Rebalance policy",
        config: {
          query: "Rebalancing bands, trade-size minimums, tax-aware sequencing, and client-notification requirements",
          k: 4, kind: "policy",
        },
      } },
    },
    {
      id: "recommend", type: "openai", position: row(2),
      data: { step: {
        id: "recommend", type: "openai", name: "Compose rebalance plan",
        config: {
          model: "gpt-4o-mini",
          system: "You produce a precise, policy-cited rebalance recommendation. No speculation. Cite policy excerpts by [1], [2], etc.",
          prompt:
            "Account: {{steps.trigger.input.account_id}}\n" +
            "Client: {{steps.trigger.input.client_name}}\n" +
            "Target allocation: {{steps.trigger.input.target_allocation}}\n" +
            "Current drift: {{steps.trigger.input.drift_summary}}\n\n" +
            "Firm policy:\n{{steps.policy.context}}\n\n" +
            "Draft the rebalance plan (trades + rationale + client-facing talking points).",
          max_tokens: 900,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(3),
      data: { step: {
        id: "email", type: "send_email", name: "Alert advisor",
        config: {
          to: "{{secrets.advisor_email}}",
          subject: "Drift alert — {{steps.trigger.input.client_name}}",
          text: "{{steps.recommend.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "policy"),
    edge("policy", "recommend"),
    edge("recommend", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 16 · Annual review prep chaser (cron)
// ══════════════════════════════════════════════════════════════

const reviewPrepGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_cron", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_cron", name: "Every Wednesday 10am ET",
        config: { cron: "0 14 * * 3" },
      } },
    },
    {
      id: "clients", type: "query_clients", position: row(1),
      data: { step: {
        id: "clients", type: "query_clients", name: "All clients",
        config: { filter: {}, limit: 500 },
      } },
    },
    {
      id: "policy", type: "archive_lookup", position: row(2),
      data: { step: {
        id: "policy", type: "archive_lookup", name: "Annual-review doc list",
        config: {
          query: "Documents the firm asks clients to bring to an annual review (tax return, statements, insurance, estate docs)",
          k: 4, kind: "policy",
        },
      } },
    },
    {
      id: "drafts", type: "openai", position: row(3),
      data: { step: {
        id: "drafts", type: "openai", name: "Per-client doc-request emails",
        config: {
          model: "gpt-4o-mini",
          system: "You return a JSON array of short, friendly doc-request emails. Reference the firm's policy by number. Never sound bureaucratic.",
          prompt:
            "Today: {{steps.trigger.input.fired_at}}\n" +
            "Assume any client whose next review falls in the next 2-3 weeks needs this note.\n\n" +
            "Clients:\n{{steps.clients.contacts}}\n\n" +
            "Firm review-prep policy:\n{{steps.policy.context}}\n\n" +
            "Return [{ id, name, email, body }].",
          max_tokens: 1500,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(4),
      data: { step: {
        id: "email", type: "send_email", name: "Send batch to advisor",
        config: {
          to: "{{secrets.advisor_email}}",
          subject: "Annual review prep — doc chasers ready",
          text: "{{steps.drafts.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "clients"),
    edge("clients", "policy"),
    edge("policy", "drafts"),
    edge("drafts", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 17 · Form ADV annual amendment reminder (cron, archive-aware)
// ══════════════════════════════════════════════════════════════

const advGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_cron", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_cron", name: "February 1st annually",
        config: { cron: "0 14 1 2 *" },
      } },
    },
    {
      id: "rules", type: "archive_lookup", position: row(1),
      data: { step: {
        id: "rules", type: "archive_lookup", name: "Current ADV rules",
        config: {
          query: "Form ADV annual updating amendment deadlines, material changes, delivery requirements",
          k: 4, kind: "regulation",
        },
      } },
    },
    {
      id: "current", type: "archive_lookup", position: row(2),
      data: { step: {
        id: "current", type: "archive_lookup", name: "Firm's existing Form ADV",
        config: {
          query: "Firm's most recent Form ADV filings, Part 2 brochure, and any interim amendments",
          k: 5, kind: "form_adv",
        },
      } },
    },
    {
      id: "checklist", type: "openai", position: row(3),
      data: { step: {
        id: "checklist", type: "openai", name: "Draft amendment checklist",
        config: {
          model: "gpt-4o-mini",
          system: "You are a compliance analyst. You produce a clear, cited checklist. Always cite excerpts by number.",
          prompt:
            "Regulatory rules:\n{{steps.rules.context}}\n\n" +
            "Firm's current Form ADV (excerpts):\n{{steps.current.context}}\n\n" +
            "Produce: (a) the 90-day filing deadline, (b) a checklist of sections to review for material changes, (c) any language in the current ADV that looks stale vs the cited rules.",
          max_tokens: 900,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(4),
      data: { step: {
        id: "email", type: "send_email", name: "Email compliance kickoff",
        config: {
          to: "{{secrets.advisor_email}}",
          subject: "Form ADV annual amendment — kickoff checklist",
          text: "{{steps.checklist.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "rules"),
    edge("rules", "current"),
    edge("current", "checklist"),
    edge("checklist", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// 18 · Social Security optimization windows (cron, archive-aware)
// ══════════════════════════════════════════════════════════════

const socialSecurityGraph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger", type: "trigger_cron", position: row(0),
      data: { step: {
        id: "trigger", type: "trigger_cron", name: "Quarterly — 15th Jan/Apr/Jul/Oct",
        config: { cron: "0 14 15 1,4,7,10 *" },
      } },
    },
    {
      id: "rules", type: "archive_lookup", position: row(1),
      data: { step: {
        id: "rules", type: "archive_lookup", name: "Social Security playbook",
        config: {
          query: "Social Security claiming strategies, full retirement age by birth year, delayed retirement credits, spousal and survivor rules",
          k: 5, kind: "memo",
        },
      } },
    },
    {
      id: "clients", type: "query_clients", position: row(2),
      data: { step: {
        id: "clients", type: "query_clients", name: "All clients",
        config: { filter: {}, limit: 500 },
      } },
    },
    {
      id: "windows", type: "openai", position: row(3),
      data: { step: {
        id: "windows", type: "openai", name: "Find clients in claiming windows",
        config: {
          model: "gpt-4o-mini",
          system: "You return JSON only. Apply the cited rules precisely.",
          prompt:
            "Playbook excerpts:\n{{steps.rules.context}}\n\n" +
            "Clients (use birth_date when present):\n{{steps.clients.contacts}}\n\n" +
            "Return [{ id, name, email, age, next_window, decision_points }] for any client within 6 months of ages 62, 66-67 (FRA), or 70.",
          max_tokens: 900,
        },
      } },
    },
    {
      id: "email", type: "send_email", position: row(4),
      data: { step: {
        id: "email", type: "send_email", name: "Brief the advisor",
        config: {
          to: "{{secrets.advisor_email}}",
          subject: "Social Security — clients approaching claiming windows",
          text: "{{steps.windows.text}}",
        },
      } },
    },
  ],
  edges: [
    edge("trigger", "rules"),
    edge("rules", "clients"),
    edge("clients", "windows"),
    edge("windows", "email"),
  ],
};

// ══════════════════════════════════════════════════════════════
// Registry
// ══════════════════════════════════════════════════════════════

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    slug: "meeting-prep-packet",
    name: "Meeting-prep packet",
    description: "Every weekday at 7pm, Dante pulls tomorrow's meetings, cites the firm's IPS, and emails the advisor a 1-page prep brief.",
    category: "Client communication",
    icon: "ClipboardList",
    accent: "accent",
    triggerLabel: "Nightly at 7pm ET",
    requiresArchive: true,
    graph: meetingPrepGraph,
  },
  {
    slug: "post-meeting-followup",
    name: "Post-meeting follow-up",
    description: "Webhook receives a meeting note; Dante writes a warm, policy-consistent follow-up email and sends it to the client.",
    category: "Client communication",
    icon: "MailCheck",
    accent: "verified",
    triggerLabel: "On meeting-note webhook",
    requiresArchive: true,
    graph: postMeetingGraph,
  },
  {
    slug: "qbr-reminder",
    name: "Quarterly review reminder",
    description: "Every Monday morning, surfaces every client past their 90-day QBR window with days-since-contact.",
    category: "Operations",
    icon: "CalendarClock",
    accent: "ink",
    triggerLabel: "Mondays 8am ET",
    graph: qbrGraph,
  },
  {
    slug: "life-event-scanner",
    name: "Life-event scanner",
    description: "Scans incoming meeting transcripts for marriage, retirement, inheritance, and new-job signals — then pulls the matching planning playbook from the archive.",
    category: "Research",
    icon: "Eye",
    accent: "accent",
    triggerLabel: "On transcript webhook",
    requiresArchive: true,
    graph: lifeEventGraph,
  },
  {
    slug: "birthday-anniversary",
    name: "Birthday & anniversary touch",
    description: "First of every month, drafts a personal note for each client with a birthday or firm anniversary and queues them for the advisor to review.",
    category: "Client communication",
    icon: "Cake",
    accent: "verified",
    triggerLabel: "1st of every month",
    graph: birthdayGraph,
  },
  {
    slug: "cash-drag-sweep",
    name: "Cash-drag weekly sweep",
    description: "Pulls account positions from your custodian every Monday, flags accounts over 8% cash with >$10k excess, and emails the advisor.",
    category: "Operations",
    icon: "Coins",
    accent: "flag",
    triggerLabel: "Mondays 9am ET",
    graph: cashDragGraph,
  },
  {
    slug: "volatility-client-comms",
    name: "Market-volatility client comms",
    description: "Manual trigger — advisor provides a headline; Dante drafts a personalized, non-alarmist note per client citing the firm's official stance.",
    category: "Client communication",
    icon: "TrendingDown",
    accent: "flag",
    triggerLabel: "Manual (one-click)",
    requiresArchive: true,
    graph: volatilityGraph,
  },
  {
    slug: "rmd-window-reminder",
    name: "RMD-window reminder",
    description: "Every October 1st, checks RMD rules from the archive and surfaces every client who must take a distribution by year-end.",
    category: "Compliance",
    icon: "CalendarDays",
    accent: "flag",
    triggerLabel: "October 1st annually",
    requiresArchive: true,
    graph: rmdGraph,
  },
  {
    slug: "tax-doc-intake",
    name: "Tax-document intake",
    description: "Webhook receives an uploaded 1099 / W-2 / K-1; Dante extracts structured fields, checks retention policy, and notifies the advisor.",
    category: "Operations",
    icon: "FileSpreadsheet",
    accent: "ink",
    triggerLabel: "On upload webhook",
    requiresArchive: true,
    graph: taxIntakeGraph,
  },
  {
    slug: "beneficiary-audit",
    name: "Annual beneficiary audit",
    description: "Every January 15th, drafts audit-friendly outreach to every client asking them to confirm beneficiary designations for the year.",
    category: "Compliance",
    icon: "UserCheck",
    accent: "verified",
    triggerLabel: "January 15th annually",
    requiresArchive: true,
    graph: beneficiaryGraph,
  },
  {
    slug: "new-client-onboarding",
    name: "New-client onboarding sequence",
    description: "On sign-up, Dante sends a personal welcome, waits, pulls the firm's intake policy, and delivers a tailored planning questionnaire.",
    category: "Client communication",
    icon: "UserPlus",
    accent: "verified",
    triggerLabel: "On new-client webhook",
    requiresArchive: true,
    graph: onboardingGraph,
  },
  {
    slug: "tax-loss-harvesting",
    name: "Year-end tax-loss harvesting scan",
    description: "Every December 1st, pulls positions from your custodian, applies the firm's wash-sale policy, and flags harvestable lots with replacement ideas.",
    category: "Operations",
    icon: "Calculator",
    accent: "flag",
    triggerLabel: "December 1st annually",
    requiresArchive: true,
    graph: taxLossGraph,
  },
  {
    slug: "post-meeting-referral",
    name: "Post-meeting referral ask",
    description: "When a meeting rates NPS 9+, Dante drafts a tasteful, specific referral-request email for the advisor to review and send.",
    category: "Prospecting",
    icon: "Share2",
    accent: "accent",
    triggerLabel: "On post-meeting NPS webhook",
    graph: referralGraph,
  },
  {
    slug: "fomc-commentary",
    name: "FOMC decision commentary",
    description: "On every Fed decision webhook, Dante pulls the firm's rates stance and drafts a calm, non-predictive note for every client.",
    category: "Client communication",
    icon: "Landmark",
    accent: "ink",
    triggerLabel: "On Fed-decision webhook",
    requiresArchive: true,
    graph: fomcGraph,
  },
  {
    slug: "portfolio-drift-alert",
    name: "Portfolio drift rebalance alert",
    description: "When an account breaches its drift bands, Dante cites your rebalance policy and drafts a trade plan plus client-facing talking points.",
    category: "Operations",
    icon: "RefreshCw",
    accent: "flag",
    triggerLabel: "On drift-threshold webhook",
    requiresArchive: true,
    graph: driftGraph,
  },
  {
    slug: "annual-review-prep",
    name: "Annual review prep chaser",
    description: "Every Wednesday, Dante identifies clients with upcoming annual reviews and drafts friendly doc-request emails citing firm policy.",
    category: "Client communication",
    icon: "CalendarCheck",
    accent: "accent",
    triggerLabel: "Wednesdays 10am ET",
    requiresArchive: true,
    graph: reviewPrepGraph,
  },
  {
    slug: "form-adv-amendment",
    name: "Form ADV annual amendment",
    description: "Every February 1st, Dante pulls current ADV rules and the firm's existing filing, then drafts a material-change checklist for compliance.",
    category: "Compliance",
    icon: "ScrollText",
    accent: "flag",
    triggerLabel: "February 1st annually",
    requiresArchive: true,
    graph: advGraph,
  },
  {
    slug: "social-security-windows",
    name: "Social Security claiming windows",
    description: "Quarterly, Dante identifies clients within 6 months of ages 62, FRA, or 70, citing the firm's claiming playbook for each case.",
    category: "Research",
    icon: "PiggyBank",
    accent: "verified",
    triggerLabel: "Quarterly (15th Jan/Apr/Jul/Oct)",
    requiresArchive: true,
    graph: socialSecurityGraph,
  },
];

export function getTemplate(slug: string): WorkflowTemplate | null {
  return WORKFLOW_TEMPLATES.find((t) => t.slug === slug) || null;
}
