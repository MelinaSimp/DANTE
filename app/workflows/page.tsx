import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isOwner } from "@/lib/rbac";
import { hasSuperadminAccess } from "@/lib/superadmin";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import WorkflowsPageClient from "./WorkflowsPageClient";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
  const ctx = await getShellContext();
  if (!ctx) redirect("/auth");
  if (!ctx.features.includes("dante")) redirect("/dashboard");

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: profile } = await supabase.from("profiles")
    .select("workspace_id, role, is_superadmin").eq("id", user.id).maybeSingle();
  if (!profile?.workspace_id) redirect("/dashboard");

  const archiveCountResp = await supabaseAdmin
    .from("dante_archive_documents").select("id", { count: "exact", head: true })
    .eq("workspace_id", profile.workspace_id).eq("status", "ready");
  const archiveReady = archiveCountResp.error ? 0 : (archiveCountResp.count ?? 0);

  const canManageArchive =
    isOwner(profile.role) ||
    hasSuperadminAccess(user.email, profile.is_superadmin);

  return (
    <AppShell {...ctx}>
      <WorkflowsPageClient archiveReady={archiveReady} canManageArchive={canManageArchive} />
    </AppShell>
  );
}
