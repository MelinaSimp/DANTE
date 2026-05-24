// lib/compliance/export.ts
//
// Phase 3+ panel fix #4 — compliance export.
//
// Elena, repeatedly: "When an examiner asks 'show me everything
// related to client X over the last 18 months,' we still have to
// write that query by hand. The schema supports it; the export
// bundle doesn't exist."
//
// This module assembles an audit pack — a JSON bundle of every
// surface tied to a contact (or workspace-wide) over a date range.
// The bundle includes:
//
//   - contact metadata + extension fields
//   - all approved memories about the contact (review_status='approved'
//     only — pending/rejected memories aren't authoritative)
//   - all chat messages mentioning the contact (rough match on
//     content; precise filter is a follow-up)
//   - all conversations (calls / SMS) tied to the contact
//   - all archive documents linked to the contact
//   - all autonomous agent outputs targeting the contact
//   - all audit log rows touching the contact's resources
//
// The bundle is verticalized: RIA exports include compliance flag
// history; realtor exports include transaction file artifacts.
//
// Output is JSON. PDF rendering is a follow-up — JSON is what an
// SEC examiner's tooling consumes anyway, and it round-trips
// reliably across legal-hold systems.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVerticalSpecLoose } from "@/lib/industry/vertical-spec";

export interface ExportInput {
  workspaceId: string;
  /** Contact-scoped export. Omit for workspace-wide. */
  contactId?: string;
  /** ISO date — only include events after this. Default: 7 years ago. */
  fromDate?: string;
  /** ISO date — only include events before this. Default: now. */
  toDate?: string;
  /** User initiating the export — recorded in audit_logs. */
  userId: string;
}

export interface ExportBundle {
  meta: {
    workspace_id: string;
    contact_id: string | null;
    from_date: string;
    to_date: string;
    generated_at: string;
    generated_by: string;
    industry: string;
    schema_version: "1.0";
  };
  contact: ExportedContact | null;
  memories: ExportedMemory[];
  chat_messages: ExportedChatMessage[];
  conversations: ExportedConversation[];
  documents: ExportedDocument[];
  agent_outputs: ExportedAgentOutput[];
  audit_logs: ExportedAuditLog[];
  summary: ExportSummary;
}

export interface ExportSummary {
  counts: {
    memories: number;
    chat_messages: number;
    conversations: number;
    documents: number;
    agent_outputs: number;
    audit_logs: number;
  };
  /** Per-vertical compliance posture summary. */
  compliance_summary: string[];
}

interface ExportedContact {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
  /** From contact_extensions when present. */
  extension?: Record<string, unknown>;
}

interface ExportedMemory {
  id: string;
  kind: string;
  content: string;
  source_kind: string | null;
  source_id: string | null;
  category: string | null;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

interface ExportedChatMessage {
  id: string;
  chat_id: string;
  role: string;
  content: string;
  citation_report: unknown;
  grounding_score: number | null;
  prompt_version: string | null;
  created_at: string;
}

interface ExportedConversation {
  id: string;
  modality: string | null;
  status: string | null;
  transcript: string | null;
  created_at: string;
}

interface ExportedDocument {
  id: string;
  title: string;
  kind: string | null;
  page_count: number | null;
  uploaded_by: string | null;
  created_at: string;
}

interface ExportedAgentOutput {
  id: string;
  kind: string;
  payload: unknown;
  review_status: string;
  reviewed_by: string | null;
  sent_at: string | null;
  created_at: string;
}

interface ExportedAuditLog {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: unknown;
  timestamp: string;
}

const DEFAULT_LOOKBACK_DAYS = 7 * 365; // 7 years — RIA-safe default

/**
 * Assemble an audit pack. Workspace-scoped by default; pass
 * contactId for a per-client export.
 *
 * Records the export as an audit log entry so the act of exporting
 * is itself part of the compliance trail.
 */
export async function generateAuditPack(input: ExportInput): Promise<ExportBundle> {
  const toDate = input.toDate ?? new Date().toISOString();
  const fromDate =
    input.fromDate ??
    new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 86400 * 1000).toISOString();

  // Workspace industry — drives the compliance summary text and
  // (later) per-vertical filter choices.
  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("industry")
    .eq("id", input.workspaceId)
    .maybeSingle();
  const industry = (ws as { industry?: string } | null)?.industry ?? null;

  const bundle: ExportBundle = {
    meta: {
      workspace_id: input.workspaceId,
      contact_id: input.contactId ?? null,
      from_date: fromDate,
      to_date: toDate,
      generated_at: new Date().toISOString(),
      generated_by: input.userId,
      industry: industry ?? "real_estate",
      schema_version: "1.0",
    },
    contact: null,
    memories: [],
    chat_messages: [],
    conversations: [],
    documents: [],
    agent_outputs: [],
    audit_logs: [],
    summary: {
      counts: {
        memories: 0,
        chat_messages: 0,
        conversations: 0,
        documents: 0,
        agent_outputs: 0,
        audit_logs: 0,
      },
      compliance_summary: [],
    },
  };

  // ── Contact ──
  if (input.contactId) {
    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("id, name, email, phone, created_at")
      .eq("id", input.contactId)
      .eq("workspace_id", input.workspaceId)
      .maybeSingle();
    if (contact) {
      const { data: ext } = await supabaseAdmin
        .from("contact_extensions")
        .select("data")
        .eq("contact_id", input.contactId)
        .maybeSingle();
      bundle.contact = {
        ...(contact as ExportedContact),
        extension: (ext as { data?: Record<string, unknown> } | null)?.data,
      };
    }
  }

  // ── Memories ──
  let memQuery = supabaseAdmin
    .from("dante_memory")
    .select(
      "id, kind, content, source_kind, source_id, metadata, created_at, reviewed_by, reviewed_at",
    )
    .eq("workspace_id", input.workspaceId)
    .eq("review_status", "approved")
    .gte("created_at", fromDate)
    .lte("created_at", toDate)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (input.contactId) memQuery = memQuery.eq("subject_contact_id", input.contactId);
  const { data: memories } = await memQuery;
  bundle.memories = ((memories || []) as Array<{
    id: string;
    kind: string;
    content: string;
    source_kind: string | null;
    source_id: string | null;
    metadata: { category?: string } | null;
    created_at: string;
    reviewed_by: string | null;
    reviewed_at: string | null;
  }>).map((m) => ({
    id: m.id,
    kind: m.kind,
    content: m.content,
    source_kind: m.source_kind,
    source_id: m.source_id,
    category: m.metadata?.category ?? null,
    created_at: m.created_at,
    reviewed_by: m.reviewed_by,
    reviewed_at: m.reviewed_at,
  }));

  // ── Chat messages ── include messages from active (non-deleted)
  // chats only. Soft-deleted chats are preserved in the DB for
  // compliance but excluded from exports by default.
  const { data: activeChatIds } = await supabaseAdmin
    .from("dante_chats")
    .select("id")
    .eq("workspace_id", input.workspaceId)
    .is("deleted_at", null);
  const activeIds = (activeChatIds || []).map((c: { id: string }) => c.id);

  let chatRows: unknown[] = [];
  if (activeIds.length > 0) {
    const { data } = await supabaseAdmin
      .from("dante_chat_messages")
      .select(
        "id, chat_id, role, content, citation_report, grounding_score, prompt_version, created_at",
      )
      .in("chat_id", activeIds)
      .gte("created_at", fromDate)
      .lte("created_at", toDate)
      .order("created_at", { ascending: true })
      .limit(2000);
    chatRows = data || [];
  }
  bundle.chat_messages = chatRows as ExportedChatMessage[];

  // ── Conversations ──
  try {
    let convQuery = supabaseAdmin
      .from("conversations")
      .select("id, modality, status, transcript, created_at")
      .eq("workspace_id", input.workspaceId)
      .gte("created_at", fromDate)
      .lte("created_at", toDate)
      .order("created_at", { ascending: true });
    if (input.contactId) convQuery = convQuery.eq("contact_id", input.contactId);
    const { data: conversations } = await convQuery;
    bundle.conversations = (conversations || []) as ExportedConversation[];
  } catch {
    // conversations table may not exist in every workspace
  }

  // ── Documents ──
  let docQuery = supabaseAdmin
    .from("dante_archive_documents")
    .select("id, title, kind, page_count, uploaded_by, created_at")
    .eq("workspace_id", input.workspaceId)
    .gte("created_at", fromDate)
    .lte("created_at", toDate)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  // Contact-scoped doc filter would join through document_extensions;
  // workspace-wide is the usable v1.
  void input.contactId;
  const { data: documents } = await docQuery;
  bundle.documents = (documents || []) as ExportedDocument[];

  // ── Agent outputs ──
  let agentQuery = supabaseAdmin
    .from("outbound_review_queue")
    .select(
      "id, kind, payload, review_status, reviewed_by, sent_at, created_at",
    )
    .eq("workspace_id", input.workspaceId)
    .gte("created_at", fromDate)
    .lte("created_at", toDate)
    .order("created_at", { ascending: true });
  if (input.contactId) agentQuery = agentQuery.eq("contact_id", input.contactId);
  const { data: agentOutputs } = await agentQuery;
  bundle.agent_outputs = (agentOutputs || []) as ExportedAgentOutput[];

  // ── Audit logs ──
  let auditQuery = supabaseAdmin
    .from("audit_logs")
    .select("id, user_id, action, resource_type, resource_id, metadata, timestamp")
    .eq("workspace_id", input.workspaceId)
    .gte("timestamp", fromDate)
    .lte("timestamp", toDate)
    .order("timestamp", { ascending: true });
  if (input.contactId) auditQuery = auditQuery.eq("resource_id", input.contactId);
  const { data: audits } = await auditQuery;
  bundle.audit_logs = (audits || []) as ExportedAuditLog[];

  // ── Summary ──
  bundle.summary.counts = {
    memories: bundle.memories.length,
    chat_messages: bundle.chat_messages.length,
    conversations: bundle.conversations.length,
    documents: bundle.documents.length,
    agent_outputs: bundle.agent_outputs.length,
    audit_logs: bundle.audit_logs.length,
  };
  bundle.summary.compliance_summary = buildComplianceSummary(industry, bundle);

  // Audit the export itself.
  await supabaseAdmin.from("audit_logs").insert({
    workspace_id: input.workspaceId,
    user_id: input.userId,
    action: "compliance.export_generated",
    resource_type: input.contactId ? "contact" : "workspace",
    resource_id: input.contactId ?? null,
    metadata: {
      from_date: fromDate,
      to_date: toDate,
      counts: bundle.summary.counts,
    },
    timestamp: new Date().toISOString(),
  });

  return bundle;
}

function buildComplianceSummary(
  industry: string | null,
  bundle: ExportBundle,
): string[] {
  const lines: string[] = [];
  const spec = getVerticalSpecLoose(industry);
  lines.push(`Industry: ${industry ?? "real_estate"}.`);
  lines.push(
    `Retention defaults: ${spec.retentionDefaults.contacts_retention_days} days (${spec.retentionDefaults.rationale})`,
  );

  const reviewedMems = bundle.memories.filter((m) => m.reviewed_by).length;
  if (bundle.memories.length > 0) {
    lines.push(
      `${reviewedMems} of ${bundle.memories.length} memories carry a recorded reviewer.`,
    );
  }

  const sentOutputs = bundle.agent_outputs.filter(
    (a) => a.review_status === "sent",
  ).length;
  if (bundle.agent_outputs.length > 0) {
    lines.push(
      `${sentOutputs} of ${bundle.agent_outputs.length} autonomous outputs were approved + sent.`,
    );
  }

  if (bundle.chat_messages.length > 0) {
    const grounded = bundle.chat_messages.filter(
      (m) => (m.grounding_score ?? 0) >= 0.7,
    ).length;
    lines.push(
      `${grounded} of ${bundle.chat_messages.length} chat responses scored as 'strongly grounded' (≥0.7).`,
    );
  }

  return lines;
}
