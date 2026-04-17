import { supabaseAdmin } from "@/lib/supabase/admin";

export interface QuotaRow {
  workspace_id: string;
  plan_name: string;
  llm_tokens_monthly: number;
  emails_monthly: number;
  sms_monthly: number;
  voice_minutes_monthly: number;
  overage_llm_cents_per_1k: number;
  overage_email_cents: number;
  overage_sms_cents: number;
  overage_voice_cents_per_min: number;
  stripe_subscription_item_id: string | null;
  stripe_customer_id: string | null;
  stripe_meter_event_name: string | null;
  hard_cap: boolean;
}

// Default quotas so a workspace without an explicit row still gets
// metered consistently. Mirrors the migration defaults.
export const DEFAULT_QUOTA: Omit<QuotaRow, "workspace_id"> = {
  plan_name: "starter",
  llm_tokens_monthly: 100_000,
  emails_monthly: 500,
  sms_monthly: 100,
  voice_minutes_monthly: 30,
  overage_llm_cents_per_1k: 2,
  overage_email_cents: 1,
  overage_sms_cents: 2,
  overage_voice_cents_per_min: 15,
  stripe_subscription_item_id: null,
  stripe_customer_id: null,
  stripe_meter_event_name: null,
  hard_cap: false,
};

export async function getQuota(workspaceId: string): Promise<QuotaRow> {
  const { data } = await supabaseAdmin
    .from("workspace_quotas")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (data) return data as QuotaRow;
  return { workspace_id: workspaceId, ...DEFAULT_QUOTA };
}

export interface UsageSummary {
  workspace_id: string;
  workspace_name: string;
  llm_tokens: number;
  emails_sent: number;
  sms_sent: number;
  voice_minutes: number;
  total_cost_cents: number;
  event_count: number;
}

export async function getCurrentMonthUsage(workspaceId: string): Promise<UsageSummary | null> {
  const { data } = await supabaseAdmin
    .from("workspace_usage_current_month")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  return (data as UsageSummary) ?? null;
}

export async function getAllCurrentMonthUsage(): Promise<UsageSummary[]> {
  const { data } = await supabaseAdmin
    .from("workspace_usage_current_month")
    .select("*")
    .order("total_cost_cents", { ascending: false });
  return (data as UsageSummary[]) ?? [];
}

export interface OverageBreakdown {
  llm_over: number;
  emails_over: number;
  sms_over: number;
  voice_over: number;
  overage_cents: number;
  any_over: boolean;
}

export function computeOverage(quota: QuotaRow, usage: UsageSummary): OverageBreakdown {
  const llmOver = Math.max(0, usage.llm_tokens - quota.llm_tokens_monthly);
  const emailsOver = Math.max(0, usage.emails_sent - quota.emails_monthly);
  const smsOver = Math.max(0, usage.sms_sent - quota.sms_monthly);
  const voiceOver = Math.max(0, usage.voice_minutes - quota.voice_minutes_monthly);

  const overageCents =
    (llmOver / 1000) * Number(quota.overage_llm_cents_per_1k) +
    emailsOver * Number(quota.overage_email_cents) +
    smsOver * Number(quota.overage_sms_cents) +
    voiceOver * Number(quota.overage_voice_cents_per_min);

  return {
    llm_over: llmOver,
    emails_over: emailsOver,
    sms_over: smsOver,
    voice_over: voiceOver,
    overage_cents: overageCents,
    any_over: llmOver > 0 || emailsOver > 0 || smsOver > 0 || voiceOver > 0,
  };
}

// Called from rate-limiter path. Returns true if the workspace is
// over its hard cap and further billable actions must be blocked.
export async function isHardCapped(workspaceId: string): Promise<boolean> {
  const [quota, usage] = await Promise.all([
    getQuota(workspaceId),
    getCurrentMonthUsage(workspaceId),
  ]);
  if (!quota.hard_cap || !usage) return false;
  const o = computeOverage(quota, usage);
  return o.any_over;
}
