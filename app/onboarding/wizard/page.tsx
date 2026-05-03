// app/onboarding/wizard/page.tsx
//
// Phase 6 W6.10 — guided 30-minute onboarding wizard.
//
// Five steps that produce concrete value before the user closes
// the tab:
//   1. Confirm industry (already chosen at signup; reaffirm + show
//      what's different per-vertical).
//   2. Upload first 3 vault documents (or skip with samples seeded).
//   3. Add first contact.
//   4. Connect calendar (optional but enables agent suggestions).
//   5. Run first chat — pre-filled prompt the wizard guides.
//
// Once a user completes all 5, workspaces.onboarded_at is set and
// /dashboard becomes the default landing.

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import OnboardingWizardClient from "./OnboardingWizardClient";

export const dynamic = "force-dynamic";

export default async function OnboardingWizardPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, full_name")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) redirect("/onboarding");

  const { data: workspace } = await supabaseAdmin
    .from("workspaces")
    .select("id, name, industry, onboarded_at")
    .eq("id", profile.workspace_id)
    .maybeSingle();

  // Already onboarded? Skip to dashboard.
  if (workspace && (workspace as { onboarded_at?: string }).onboarded_at) {
    redirect("/dashboard");
  }

  // Compute initial step state — vault count, contact count, etc.
  const [vaultCount, contactCount, calendarCount] = await Promise.all([
    supabaseAdmin
      .from("vault_items")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", profile.workspace_id),
    supabaseAdmin
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", profile.workspace_id)
      .is("deleted_at", null),
    // Calendar integration check — optional. Best-effort.
    Promise.resolve({ count: 0 }),
  ]);

  return (
    <OnboardingWizardClient
      industry={(workspace?.industry as string | null) ?? "financial_advisor"}
      workspaceName={workspace?.name ?? "Your workspace"}
      userName={profile.full_name ?? user.email?.split("@")[0] ?? "there"}
      progress={{
        vault_count: vaultCount.count ?? 0,
        contact_count: contactCount.count ?? 0,
        calendar_connected: false,
      }}
    />
  );
}
