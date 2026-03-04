import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasSuperadminAccess } from "@/lib/superadmin";

export const dynamic = "force-dynamic";

async function verifySuperadmin() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", user.id)
    .maybeSingle();

  if (!hasSuperadminAccess(user.email, profile?.is_superadmin)) return null;
  return user;
}

function maskKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 7) + "•".repeat(12) + key.slice(-4);
}

export async function GET() {
  const admin = await verifySuperadmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: rows } = await supabaseAdmin
    .from("app_settings")
    .select("key, value, updated_at")
    .in("key", ["stripe_secret_key", "stripe_webhook_secret"]);

  const settings: Record<string, { masked: string; updated_at: string | null; is_set: boolean }> = {
    stripe_secret_key: { masked: "", updated_at: null, is_set: false },
    stripe_webhook_secret: { masked: "", updated_at: null, is_set: false },
  };

  for (const row of rows || []) {
    settings[row.key] = {
      masked: maskKey(row.value),
      updated_at: row.updated_at,
      is_set: true,
    };
  }

  // Also check env vars as fallback
  if (!settings.stripe_secret_key.is_set && process.env.STRIPE_SECRET_KEY) {
    settings.stripe_secret_key = { masked: maskKey(process.env.STRIPE_SECRET_KEY), updated_at: null, is_set: true };
  }
  if (!settings.stripe_webhook_secret.is_set && process.env.STRIPE_WEBHOOK_SECRET) {
    settings.stripe_webhook_secret = { masked: maskKey(process.env.STRIPE_WEBHOOK_SECRET), updated_at: null, is_set: true };
  }

  return NextResponse.json(settings);
}

export async function PATCH(req: NextRequest) {
  const admin = await verifySuperadmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { stripe_secret_key, stripe_webhook_secret } = body;

  const updates: { key: string; value: string }[] = [];

  if (stripe_secret_key && typeof stripe_secret_key === "string" && stripe_secret_key.startsWith("sk_")) {
    updates.push({ key: "stripe_secret_key", value: stripe_secret_key });
  }
  if (stripe_webhook_secret && typeof stripe_webhook_secret === "string" && stripe_webhook_secret.startsWith("whsec_")) {
    updates.push({ key: "stripe_webhook_secret", value: stripe_webhook_secret });
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "No valid keys provided. Secret key must start with sk_, webhook secret with whsec_" }, { status: 400 });
  }

  for (const { key, value } of updates) {
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, updated: updates.map((u) => u.key) });
}
