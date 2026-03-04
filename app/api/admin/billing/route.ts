import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasSuperadminAccess } from "@/lib/superadmin";
import Stripe from "stripe";

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

// GET — retrieve current Stripe config status
export async function GET() {
  const admin = await verifySuperadmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("key, value")
    .in("key", ["stripe_secret_key", "stripe_webhook_secret"]);

  const keyRow = settings?.find(s => s.key === "stripe_secret_key");
  const whRow = settings?.find(s => s.key === "stripe_webhook_secret");

  const hasKey = !!(process.env.STRIPE_SECRET_KEY || keyRow?.value);
  const hasWebhook = !!(process.env.STRIPE_WEBHOOK_SECRET || whRow?.value);

  // Mask the key for display
  const maskedKey = keyRow?.value
    ? `${keyRow.value.slice(0, 7)}...${keyRow.value.slice(-4)}`
    : process.env.STRIPE_SECRET_KEY
    ? `${process.env.STRIPE_SECRET_KEY.slice(0, 7)}...${process.env.STRIPE_SECRET_KEY.slice(-4)}`
    : null;

  // Fetch products if connected
  let products: any[] = [];
  const activeKey = keyRow?.value || process.env.STRIPE_SECRET_KEY;
  if (activeKey) {
    try {
      const stripe = new Stripe(activeKey, { apiVersion: "2026-02-25.clover" as any });
      const res = await stripe.products.list({ active: true, limit: 20, expand: ["data.default_price"] });
      products = res.data.map(p => ({
        id: p.id,
        name: p.name,
        active: p.active,
        priceId: (p.default_price as any)?.id || null,
        priceAmount: (p.default_price as any)?.unit_amount || null,
        priceCurrency: (p.default_price as any)?.currency || null,
        priceInterval: (p.default_price as any)?.recurring?.interval || null,
      }));
    } catch {
      // Invalid key or API error
    }
  }

  return NextResponse.json({ hasKey, hasWebhook, maskedKey, products });
}

// POST — save Stripe keys
export async function POST(req: NextRequest) {
  const admin = await verifySuperadmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { stripe_secret_key, stripe_webhook_secret } = await req.json();

  if (stripe_secret_key) {
    // Validate the key by making a test call
    try {
      const stripe = new Stripe(stripe_secret_key, { apiVersion: "2026-02-25.clover" as any });
      await stripe.accounts.retrieve();
    } catch {
      return NextResponse.json({ error: "Invalid Stripe secret key" }, { status: 400 });
    }

    await supabaseAdmin
      .from("app_settings")
      .upsert({ key: "stripe_secret_key", value: stripe_secret_key }, { onConflict: "key" });
  }

  if (stripe_webhook_secret) {
    await supabaseAdmin
      .from("app_settings")
      .upsert({ key: "stripe_webhook_secret", value: stripe_webhook_secret }, { onConflict: "key" });
  }

  return NextResponse.json({ success: true });
}

// PUT — create a product + price in Stripe
export async function PUT(req: NextRequest) {
  const admin = await verifySuperadmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { name, amount, interval } = await req.json();
  if (!name || !amount) return NextResponse.json({ error: "name and amount required" }, { status: 400 });

  const { data: keyRow } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "stripe_secret_key")
    .maybeSingle();

  const activeKey = keyRow?.value || process.env.STRIPE_SECRET_KEY;
  if (!activeKey) return NextResponse.json({ error: "Stripe not configured" }, { status: 400 });

  try {
    const stripe = new Stripe(activeKey, { apiVersion: "2026-02-25.clover" as any });

    const product = await stripe.products.create({ name });
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(amount * 100),
      currency: "usd",
      recurring: { interval: interval || "month" },
    });

    await stripe.products.update(product.id, { default_price: price.id });

    return NextResponse.json({
      product: { id: product.id, name: product.name },
      price: { id: price.id, amount: price.unit_amount, interval: price.recurring?.interval },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
