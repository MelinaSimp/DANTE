import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isWorkspaceAdmin } from "@/lib/rbac";
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

  const { data: knowledgeEntries } = await supabase
    .from("knowledge_base")
    .select("*")
    .eq("workspace_id", profile.workspace_id)
    .order("created_at", { ascending: false });

  let auditLogs: any[] = [];
  if (isAdmin) {
    const { data } = await supabaseAdmin
      .from("audit_logs")
      .select(
        "id, actor_id, actor_email, action, target_type, target_id, target_label, metadata, ip_address, created_at"
      )
      .eq("workspace_id", profile.workspace_id)
      .order("created_at", { ascending: false })
      .limit(100);
    auditLogs = data ?? [];
  }

  return (
    <SettingsOrbClient
      isAdmin={isAdmin}
      workspaceId={profile.workspace_id}
      initialKnowledgeEntries={knowledgeEntries ?? []}
      initialAuditLogs={auditLogs}
    />
  );
}
