// /dante is feature-gated. A workspace without the `dante` entitlement
// gets bounced to /dashboard (with ?gated=dante so the dashboard can
// surface a "not part of your plan" nudge later). This check runs once
// per request thanks to the layout; children can assume access.
//
// Metadata on this layout also swaps the browser-tab favicon to the
// double-gate mark for every /dante/* route, so an advisor with
// multiple tabs open can tell at a glance which one is Dante without
// reading the titles.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireFeature } from "@/lib/features/server";
import { getIndustryConfig } from "@/lib/industry/config";
import { AssistantNameProvider } from "@/components/dante/AssistantNameProvider";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  icons: {
    icon: "/brand/dante-double-gate-black.png",
    apple: "/brand/dante-double-gate-black.png",
  },
};

export default async function DanteLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.workspace_id) redirect("/dashboard");

  await requireFeature(profile.workspace_id, "dante");

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("industry")
    .eq("id", profile.workspace_id)
    .maybeSingle();
  const assistantName = getIndustryConfig(workspace?.industry).assistantName;

  return (
    <AssistantNameProvider name={assistantName}>{children}</AssistantNameProvider>
  );
}
