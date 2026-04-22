// Returns the caller's workspace billing state so the Subscribe /
// Manage billing card in /settings can render without guessing.
//
// Shape:
//   {
//     priceCents: number | null,       // workspaces.billing_amount
//     interval: "month" | "year",      // from billing_cycle
//     planStatus: string,              // workspaces.plan_status
//     hasSubscription: boolean,        // has a stripe_subscription_id
//     workspaceName: string | null,
//   }
//
// Custom pricing is configured per-workspace in /admin → Workspaces
// → "Set pricing". There's no public pricing page.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.workspace_id) {
    return NextResponse.json({
      priceCents: null,
      interval: "month",
      planStatus: "inactive",
      hasSubscription: false,
      workspaceName: null,
    });
  }

  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("name, billing_amount, billing_cycle, plan_status, stripe_subscription_id")
    .eq("id", profile.workspace_id)
    .maybeSingle();

  return NextResponse.json({
    priceCents: ws?.billing_amount ?? null,
    interval: ws?.billing_cycle === "yearly" ? "year" : "month",
    planStatus: ws?.plan_status ?? "inactive",
    hasSubscription: !!ws?.stripe_subscription_id,
    workspaceName: ws?.name ?? null,
  });
}
