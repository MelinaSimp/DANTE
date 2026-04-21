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

  // Only fetch knowledge entries when the workspace is actually
  // entitled to the Knowledge panel — no point hitting the table for
  // a surface we're about to hide.
  let knowledgeEntries: any[] = [];
  if (features.includes("knowledge_base")) {
    const { data } = await supabase
      .from("knowledge_base")
      .select("*")
      .eq("workspace_id", profile.workspace_id)
      .order("created_at", { ascending: false });
    knowledgeEntries = data ?? [];
  }

  return (
    <SettingsOrbClient
      isAdmin={isAdmin}
      workspaceId={profile.workspace_id}
      initialKnowledgeEntries={knowledgeEntries}
      features={features}
    />
  );
}
