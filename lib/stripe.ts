import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";

let _stripe: Stripe | null = null;
let _cachedKey: string | null = null;

export async function getStripeKey(): Promise<string | null> {
  // Prefer env var
  if (process.env.STRIPE_SECRET_KEY) return process.env.STRIPE_SECRET_KEY;

  // Fall back to DB
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "stripe_secret_key")
    .maybeSingle();

  return data?.value || null;
}

export async function getWebhookSecret(): Promise<string | null> {
  if (process.env.STRIPE_WEBHOOK_SECRET) return process.env.STRIPE_WEBHOOK_SECRET;

  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "stripe_webhook_secret")
    .maybeSingle();

  return data?.value || null;
}

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
    _stripe = new Stripe(key, { apiVersion: "2026-02-25.clover" as any });
  }
  return _stripe;
}

export async function getStripeAsync(): Promise<Stripe> {
  const key = await getStripeKey();
  if (!key) throw new Error("Stripe is not configured. Add your API key in Admin > Billing.");

  if (_stripe && _cachedKey === key) return _stripe;

  _stripe = new Stripe(key, { apiVersion: "2026-02-25.clover" as any });
  _cachedKey = key;
  return _stripe;
}
