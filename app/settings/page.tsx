import { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { isWorkspaceAdmin } from "@/lib/rbac";
import { getWorkspaceFeatures } from "@/lib/features/server";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import SettingsOrbClient from "./SettingsOrbClient";

export const metadata: Metadata = {
  title: "Settings — Drift AI",
  description: "Workspace settings, integrations, billing, and team management.",
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ctx = await getShellContext();
  if (!ctx) redirect("/auth");

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, role, is_superadmin")
    .eq("id", user!.id)
    .maybeSingle();

  if (!profile?.workspace_id) redirect("/select");

  const isAdmin = isWorkspaceAdmin(profile.role);
  const features = await getWorkspaceFeatures(profile.workspace_id);

  return (
    <AppShell {...ctx}>
      <SettingsOrbClient
        isAdmin={isAdmin}
        workspaceId={profile.workspace_id}
        features={features}
      />
    </AppShell>
  );
}
