import { supabaseAdmin } from "@/lib/supabase/admin";
import { llmCostCents } from "./pricing";

type UsageKind =
  | "llm_tokens_input"
  | "llm_tokens_output"
  | "email_sent"
  | "sms_sent"
  | "voice_minutes";

interface RecordUsageOpts {
  workspaceId: string;
  userId?: string | null;
  kind: UsageKind;
  quantity: number;
  costCents?: number;
  model?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

// Fire-and-forget usage logger. Never throws — billing must never
// break a user-facing request. All failures are logged to stderr.
export function recordUsage(opts: RecordUsageOpts): void {
  const quantity = Number.isFinite(opts.quantity) ? opts.quantity : 0;
  if (quantity <= 0 || !opts.workspaceId) return;

  const row = {
    workspace_id: opts.workspaceId,
    user_id: opts.userId ?? null,
    kind: opts.kind,
    quantity,
    cost_cents: Number.isFinite(opts.costCents) ? opts.costCents : 0,
    model: opts.model ?? null,
    source: opts.source ?? null,
    metadata: opts.metadata ?? {},
    stripe_reported: false,
  };

  supabaseAdmin
    .from("usage_events")
    .insert(row)
    .then(({ error }) => {
      if (error) {
        console.error("[usage] failed to record event:", error.message, {
          workspace: opts.workspaceId,
          kind: opts.kind,
        });
      }
    });
}

// Convenience for OpenAI chat completions. Pass the usage block
// straight from `json.usage` in the OpenAI response.
export function recordLlmUsage(params: {
  workspaceId: string;
  userId?: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  source?: string;
  metadata?: Record<string, unknown>;
}): void {
  const { workspaceId, userId, model, inputTokens, outputTokens, source, metadata } = params;
  if (!workspaceId) return;
  const totalCost = llmCostCents(model, inputTokens, outputTokens);

  if (inputTokens > 0) {
    recordUsage({
      workspaceId,
      userId,
      kind: "llm_tokens_input",
      quantity: inputTokens,
      costCents: (totalCost * inputTokens) / Math.max(inputTokens + outputTokens, 1),
      model,
      source,
      metadata,
    });
  }
  if (outputTokens > 0) {
    recordUsage({
      workspaceId,
      userId,
      kind: "llm_tokens_output",
      quantity: outputTokens,
      costCents: (totalCost * outputTokens) / Math.max(inputTokens + outputTokens, 1),
      model,
      source,
      metadata,
    });
  }
}

export function recordEmailUsage(params: {
  workspaceId: string;
  userId?: string | null;
  recipientCount: number;
  source?: string;
  metadata?: Record<string, unknown>;
}): void {
  recordUsage({
    workspaceId: params.workspaceId,
    userId: params.userId,
    kind: "email_sent",
    quantity: params.recipientCount,
    costCents: params.recipientCount * 0.1,
    source: params.source,
    metadata: params.metadata,
  });
}

export function recordSmsUsage(params: {
  workspaceId: string;
  userId?: string | null;
  messageCount?: number;
  source?: string;
  metadata?: Record<string, unknown>;
}): void {
  const count = params.messageCount ?? 1;
  recordUsage({
    workspaceId: params.workspaceId,
    userId: params.userId,
    kind: "sms_sent",
    quantity: count,
    costCents: count * 0.79,
    source: params.source,
    metadata: params.metadata,
  });
}

export function recordVoiceUsage(params: {
  workspaceId: string;
  userId?: string | null;
  minutes: number;
  source?: string;
  metadata?: Record<string, unknown>;
}): void {
  if (!Number.isFinite(params.minutes) || params.minutes <= 0) return;
  recordUsage({
    workspaceId: params.workspaceId,
    userId: params.userId,
    kind: "voice_minutes",
    quantity: params.minutes,
    costCents: params.minutes * 15,
    source: params.source,
    metadata: params.metadata,
  });
}
