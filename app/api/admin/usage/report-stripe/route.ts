import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getStripeAsync } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Reports aggregated usage to Stripe as meter events (the modern Stripe
// billing meters API). Only runs for workspaces that have both
// `stripe_customer_id` and `stripe_meter_event_name` configured on their
// quota row. Auth: CRON_SECRET bearer.
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let stripe;
  try {
    stripe = await getStripeAsync();
  } catch (err: any) {
    return NextResponse.json({ error: err.message, reported: 0 }, { status: 503 });
  }

  const { data: quotas } = await supabaseAdmin
    .from("workspace_quotas")
    .select("workspace_id, stripe_customer_id, stripe_meter_event_name")
    .not("stripe_customer_id", "is", null)
    .not("stripe_meter_event_name", "is", null);

  if (!quotas?.length) {
    return NextResponse.json({ reported: 0, message: "No metered workspaces" });
  }

  const results: Array<{ workspace_id: string; reported: number; error?: string }> = [];

  for (const q of quotas) {
    const customerId = q.stripe_customer_id as string;
    const eventName = q.stripe_meter_event_name as string;

    const { data: events } = await supabaseAdmin
      .from("usage_events")
      .select("id, quantity, kind")
      .eq("workspace_id", q.workspace_id)
      .eq("stripe_reported", false)
      .limit(1000);

    if (!events?.length) {
      results.push({ workspace_id: q.workspace_id, reported: 0 });
      continue;
    }

    const totalQuantity = Math.round(
      events.reduce((sum, e) => sum + Number(e.quantity), 0)
    );
    if (totalQuantity <= 0) {
      results.push({ workspace_id: q.workspace_id, reported: 0 });
      continue;
    }

    try {
      await (stripe as any).billing.meterEvents.create({
        event_name: eventName,
        payload: {
          stripe_customer_id: customerId,
          value: String(totalQuantity),
        },
      });

      const ids = events.map((e) => e.id);
      await supabaseAdmin
        .from("usage_events")
        .update({ stripe_reported: true })
        .in("id", ids);

      results.push({ workspace_id: q.workspace_id, reported: events.length });
    } catch (err: any) {
      console.error(`[usage/report-stripe] ${q.workspace_id} failed:`, err.message);
      results.push({ workspace_id: q.workspace_id, reported: 0, error: err.message });
    }
  }

  return NextResponse.json({
    reported: results.reduce((s, r) => s + r.reported, 0),
    workspaces: results.length,
    results,
  });
}
