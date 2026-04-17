import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasSuperadminAccess } from "@/lib/superadmin";
import { DEFAULT_QUOTA } from "@/lib/usage/quota";

export const dynamic = "force-dynamic";

async function verifySuperadmin(): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return false;
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", auth.user.id)
    .maybeSingle();
  return hasSuperadminAccess(auth.user.email, profile?.is_superadmin);
}

const EDITABLE_FIELDS = [
  "plan_name",
  "llm_tokens_monthly",
  "emails_monthly",
  "sms_monthly",
  "voice_minutes_monthly",
  "overage_llm_cents_per_1k",
  "overage_email_cents",
  "overage_sms_cents",
  "overage_voice_cents_per_min",
  "stripe_subscription_item_id",
  "stripe_customer_id",
  "stripe_meter_event_name",
  "hard_cap",
] as const;

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  if (!(await verifySuperadmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { workspaceId } = await params;
  const body = await req.json().catch(() => ({}));

  const patch: Record<string, unknown> = { workspace_id: workspaceId };
  for (const key of EDITABLE_FIELDS) {
    if (key in body) patch[key] = body[key];
  }
  patch.updated_at = new Date().toISOString();

  const insertRow = { ...DEFAULT_QUOTA, ...patch };
  const { data, error } = await supabaseAdmin
    .from("workspace_quotas")
    .upsert(insertRow, { onConflict: "workspace_id" })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
