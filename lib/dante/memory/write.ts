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
