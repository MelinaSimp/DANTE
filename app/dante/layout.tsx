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
import AppShell from "@/components/shell/AppShell";
import { getShellContext } from "@/lib/shell/workspace-context";

export const dynamic = "force-dynamic";

// Browser-tab favicon swaps with the workspace's assistant — gate for
// Dante, echo for Vergil — so a user with multiple Drift tabs open can
// still tell at a glance which workspace they're in.
export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { icons: { icon: "/brand/dante-double-gate-black.png" } };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return { icons: { icon: "/brand/dante-double-gate-black.png" } };
  }
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("industry")
    .eq("id", profile.workspace_id)
    .maybeSingle();
  const iconPath = getIndustryConfig(workspace?.industry).assistantIconPath;
  return { icons: { icon: iconPath, apple: iconPath } };
}

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
  const config = getIndustryConfig(workspace?.industry);

  // Mount AppShell at the layout level so every /dante/* sub-route
  // (archive, workflows, templates, churn, settings, etc.) gets the
  // AppTopBar's "Ask Dante" button without each page wrapping
  // separately. /dante/page.tsx used to wrap its own AppShell — that
  // now happens here, and the page just renders content. Pages that
  // need to know feature flags read from getShellContext themselves.
  const shellCtx = await getShellContext();

  return (
    <AssistantNameProvider
      name={config.assistantName}
      iconPath={config.assistantIconPath}
    >
      {shellCtx ? (
        <AppShell {...shellCtx}>{children}</AppShell>
      ) : (
        children
      )}
    </AssistantNameProvider>
  );
}
