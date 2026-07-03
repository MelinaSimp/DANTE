// lib/dante/agent-catalog.ts
//
// The platform-neutral subset of tools and skills the Agent Architect
// is allowed to suggest when building an agent from a description.
//
// Tool ids mirror keys in the runtime tool registry (lib/dante/agent.ts).
// CRE-specific tools (cre.calculate, properties.*, site_scan.*,
// regulatory.*) are intentionally excluded — they belong to the future
// Drift CRE template, not the horizontal default.
//
// Skill slugs mirror the generic seeds in lib/industry/skills.ts.

export interface CatalogTool {
  id: string;
  /** Short label for the config preview UI. */
  label: string;
  /** One-line description the architect LLM reads when choosing tools. */
  description: string;
}

export interface CatalogSkill {
  slug: string;
  label: string;
  description: string;
}

export const GENERIC_TOOLS: CatalogTool[] = [
  { id: "memory.search", label: "Search memory", description: "Recall stored facts about a contact — preferences, commitments, past conversations." },
  { id: "memory.write", label: "Write memory", description: "Persist a new fact about a contact for future conversations." },
  { id: "archive.search", label: "Search documents", description: "Search the workspace document vault for relevant passages." },
  { id: "vault.cite", label: "Cite a document", description: "Retrieve an exact document passage with a citation marker for grounded answers." },
  { id: "clients.query", label: "Query contacts", description: "Look up contacts by structured filters (stage, last-contacted date, tags)." },
  { id: "clients.create", label: "Create contact", description: "Add a new contact record from conversation details." },
  { id: "clients.update", label: "Update contact", description: "Update fields on an existing contact record." },
  { id: "email.send", label: "Send email", description: "Draft and send an email (queued for review unless auto-send is enabled)." },
  { id: "reminder.schedule", label: "Schedule reminder", description: "Schedule a follow-up reminder for the user." },
  { id: "web.search", label: "Web search", description: "Search the public web for current information." },
  { id: "http.fetch", label: "Fetch a URL", description: "Fetch and read the contents of a public URL." },
  { id: "document.create", label: "Generate document", description: "Generate a branded PDF document from structured sections." },
  { id: "workflow.list", label: "List workflows", description: "List the workspace's automation workflows." },
  { id: "workflow.run", label: "Run a workflow", description: "Trigger one of the workspace's automation workflows." },
  { id: "skill.run", label: "Run a skill", description: "Invoke one of the workspace's named skills (see skills catalog)." },
];

export const GENERIC_SKILLS: CatalogSkill[] = [
  { slug: "draft_follow_up_email", label: "Draft follow-up email", description: "Draft a follow-up email grounded in memory and vault documents." },
  { slug: "summarize_recent_emails", label: "Summarize recent emails", description: "Roll up the last 14 days of correspondence with a contact into a 4-bullet brief." },
  { slug: "prep_meeting_briefing", label: "Prep meeting briefing", description: "Assemble a pre-meeting brief: who the contact is, history, open items, talking points." },
];

const TOOL_IDS = new Set(GENERIC_TOOLS.map((t) => t.id));
const SKILL_SLUGS = new Set(GENERIC_SKILLS.map((s) => s.slug));

export function isKnownTool(id: string): boolean {
  return TOOL_IDS.has(id);
}

export function isKnownSkill(slug: string): boolean {
  return SKILL_SLUGS.has(slug);
}

export function filterKnownTools(ids: string[]): string[] {
  return ids.filter((id) => TOOL_IDS.has(id));
}

export function filterKnownSkills(slugs: string[]): string[] {
  return slugs.filter((s) => SKILL_SLUGS.has(s));
}
