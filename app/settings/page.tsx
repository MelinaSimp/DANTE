import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { isWorkspaceAdmin } from "@/lib/rbac";
import { getWorkspaceFeatures } from "@/lib/features/server";
import SettingsOrbClient from "./SettingsOrbClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, role, is_superadmin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.workspace_id) redirect("/select");

  const isAdmin = isWorkspaceAdmin(profile.role);
  const features = await getWorkspaceFeatures(profile.workspace_id);

  return (
    <SettingsOrbClient
      isAdmin={isAdmin}
      workspaceId={profile.workspace_id}
      features={features}
    />
  );
}
