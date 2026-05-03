// app/settings/billing/page.tsx
//
// Billing + plan tier surface. Phase 5 W5.6.
//
// Shows current tier, seats, renewal date. Three tier cards with
// "Upgrade to X" buttons that POST /api/billing/checkout and
// redirect to Stripe Checkout. After checkout completes, Stripe
// redirects back here with ?session_id=... — the webhook flips
// plan_tier behind the scenes.

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import BillingClient from "./BillingClient";

export const dynamic = "force-dynamic";

export default async function BillingSettingsPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, role, is_superadmin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) redirect("/onboarding");

  const { data: workspace } = await supabaseAdmin
    .from("workspaces")
    .select("id, name, industry, plan_tier, plan_seats, plan_renewed_at")
    .eq("id", profile.workspace_id)
    .maybeSingle();

  const role = ((profile as { role?: string }).role ?? "advisor") as string;
  const canManage =
    !!(profile as { is_superadmin?: boolean }).is_superadmin ||
    role === "admin" ||
    role === "supervisor";

  return (
    <BillingClient
      workspace={
        workspace as {
          id: string;
          name: string;
          industry: string | null;
          plan_tier: "starter" | "pro" | "enterprise";
          plan_seats: number;
          plan_renewed_at: string | null;
        }
      }
      canManage={canManage}
      userEmail={user.email ?? ""}
    />
  );
}
