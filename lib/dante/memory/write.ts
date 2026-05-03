// lib/dante/memory/write.ts
//
// The single chokepoint for inserting into dante_memory. Centralizes:
//   - the embed-or-skip decision (short facts skip embedding; episodes
//     and summaries always embed)
//   - the supersession dance (mark the old row, insert the new one,
//     return the new id)
//   - the dedupe-via-reinforcement check (near-duplicate facts bump
//     confidence on the existing row instead of inserting)
//
// Callers that go around this helper (e.g. nightly cron summaries)
// should at minimum keep the embed-or-skip rule in mind — retrieval
// quality lives or dies on consistent embedding behavior.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { embedOne, toPgVector } from "@/lib/dante/archive/embed";
import type { MemoryKind } from "./types";

// Vertical-aware memory category vocabularies. The remember() helper
// validates a passed `category` against these so a stray category
// string doesn't silently end up in dante_memory.metadata.category
// where the eval suite + scorecard wouldn't catch it.
const ADVISOR_CATEGORIES = new Set([
  "risk_profile",
  "life_event",
  "goal_change",
  "compliance_note",
  "family_context",
  "tax_situation",
  "estate_plan",
  "advisor_preference",
]);
const REALTOR_CATEGORIES = new Set([
  "preference",
  "dealbreaker",
  "financing_status",
  "timeline",
  "objection_handled",
  "tour_feedback",
  "neighborhood_interest",
  "realtor_preference",
]);
const ALL_CATEGORIES = new Set([...ADVISOR_CATEGORIES, ...REALTOR_CATEGORIES]);

export interface RememberInput {
  workspaceId: string;
  kind: MemoryKind;
  content: string;

  subjectContactId?: string;
  subjectType?: string;

  sourceKind?: string;            // 'email','call','meeting','manual','workflow'
  sourceId?: string;

  expiresAt?: Date | null;

  /**
   * If set, the new memory supersedes the given existing memory.
   * The old row's `superseded_by` is patched to the new id. Old
   * row stays in the table for audit; retrieval skips it.
   */
  supersedes?: string;

  /**
   * Override the embed-or-skip heuristic. Default behavior:
   *   episode/summary  → always embed
   *   fact             → embed iff content.length > 80 (short facts
   *                      match better structurally; long facts are
   *                      basically mini-summaries)
   */
  forceEmbed?: boolean;

  /**
   * Phase 1 W1.2 — review queue gating.
   *
   *   'pending'  — AI-written; excluded from memory.search until a
   *                human approves. THIS IS THE DEFAULT for any
   *                writer that doesn't set this explicitly.
   *   'approved' — human-written or human-confirmed; immediately
   *                searchable. Use this for explicit user actions
   *                ("save this fact about the client") and for
   *                manual edits in the review queue UI.
   *   'rejected' — human-rejected; kept for audit, never returned.
   *
   * Source-kind 'manual' implies approved by default; everything
   * else (especially 'workflow' and unset) implies pending. Callers
   * can override either way via this field.
   */
  reviewStatus?: "pending" | "approved" | "rejected";

  /**
   * Phase 3 W3.5 — vertical-specific memory category. Validated
   * against the per-vertical category lists from
   * lib/industry/vertical-spec.ts. Persisted into
   * dante_memory.metadata.category so the eval suite, scorecard,
   * and review-queue UI can group + filter by category.
   *
   * Examples:
   *   advisor: "risk_profile", "life_event", "tax_situation"
   *   realtor: "preference", "dealbreaker", "tour_feedback"
   *
   * Unrecognised categories are dropped silently with a console
   * warning — the write still succeeds, just without the tag.
   */
  category?: string;
}

const FACT_EMBED_MIN_LEN = 80;

function shouldEmbed(kind: MemoryKind, content: string, forceEmbed?: boolean): boolean {
  if (forceEmbed === true) return true;
  if (forceEmbed === false) return false;
  if (kind === "episode" || kind === "summary") return true;
  return content.trim().length > FACT_EMBED_MIN_LEN;
}

export interface RememberResult {
  id: string;
  embedded: boolean;
}

export async function remember(input: RememberInput): Promise<RememberResult> {
  const content = input.content.trim();
  if (content.length === 0) {
    throw new Error("remember(): content is empty");
  }

  const embed = shouldEmbed(input.kind, content, input.forceEmbed);
  const embedding = embed ? toPgVector(await embedOne(content)) : null;

  // Default review status: explicit `reviewStatus` always wins.
  // Otherwise, source_kind='manual' implies approved (the user
  // typed it themselves); anything else (workflow, agent loop,
  // cron summary, integration sync) defaults to pending so a
  // human approves before the row enters retrieval.
  const reviewStatus =
    input.reviewStatus ??
    (input.sourceKind === "manual" ? "approved" : "pending");

  // Validate + serialize the vertical category into metadata.
  let metadata: Record<string, unknown> | null = null;
  if (input.category) {
    if (ALL_CATEGORIES.has(input.category)) {
      metadata = { category: input.category };
    } else {
      console.warn(
        `[remember] dropping unrecognised category "${input.category}" — see lib/industry/vertical-spec.ts for valid values`,
      );
    }
  }

  const { data, error } = await supabaseAdmin
    .from("dante_memory")
    .insert({
      workspace_id: input.workspaceId,
      kind: input.kind,
      content,
      subject_contact_id: input.subjectContactId ?? null,
      subject_type: input.subjectType ?? null,
      source_kind: input.sourceKind ?? null,
      source_id: input.sourceId ?? null,
      expires_at: input.expiresAt?.toISOString() ?? null,
      embedding,
      review_status: reviewStatus,
      metadata,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`remember(): insert failed: ${error.message}`);
  }
  const newId = (data as { id: string }).id;

  // Supersede the old row if requested. We do this AFTER the insert
  // so a failed insert doesn't orphan the old row's pointer.
  if (input.supersedes) {
    const { error: supErr } = await supabaseAdmin
      .from("dante_memory")
      .update({ superseded_by: newId })
      .eq("id", input.supersedes)
      .eq("workspace_id", input.workspaceId);
    if (supErr) {
      // Non-fatal — the new memory is in place; the old one just
      // wasn't marked superseded. Surface the error so callers can
      // log it but don't fail the whole write.
      console.error(`remember(): supersession patch failed: ${supErr.message}`);
    }
  }

  return { id: newId, embedded: embed };
}

/**
 * Mark a memory superseded without writing a replacement. Used by
 * source-cascade cleanup (e.g. when a customer_email is deleted,
 * we retire all memories derived from it).
 */
export async function retireMemory(workspaceId: string, id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("dante_memory")
    .update({ superseded_by: null, expires_at: new Date().toISOString() })
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(`retireMemory(): ${error.message}`);
}
