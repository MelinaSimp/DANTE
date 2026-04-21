// app/onboarding/page.tsx
//
// First-run welcome wizard. A brand-new workspace lands here straight
// out of /auth/callback so the dashboard never greets them with a wall
// of zeros. Three lightweight steps: practice profile, knowledge seed,
// done. Everything is skippable — we'd rather the user enter the
// product than bounce at step 1 of a 10-step form.
//
// Completion stamps `workspaces.onboarded_at` so we never show this to
// the same workspace twice. Skip also stamps it — explicit "I'm good"
// is an answer.

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import OnboardingClient from "./OnboardingClient";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, first_name, full_name, company_category")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.workspace_id) redirect("/join");

  // Read workspace to see if this user has already been through the
  // wizard. Done-means-done — no nagging.
  const { data: workspace } = await supabaseAdmin
    .from("workspaces")
    .select("id, name, onboarded_at")
    .eq("id", profile.workspace_id)
    .maybeSingle();

  if (workspace?.onboarded_at) redirect("/dashboard");

  const firstName =
    profile.first_name?.trim() ||
    profile.full_name?.split(" ")[0] ||
    user.email?.split("@")[0] ||
    "there";

  const category =
    profile.company_category === "restaurant" ? "restaurant" : "service";

  return (
    <OnboardingClient
      firstName={firstName}
      initialFirmName={workspace?.name || ""}
      category={category}
    />
  );
}
