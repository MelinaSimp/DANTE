import { SupabaseClient } from "@supabase/supabase-js";

export async function getAccessibleProjectIds(
  supabase: SupabaseClient,
  userId: string,
  workspaceId: string,
): Promise<{ isAdmin: boolean; projectIds: string[] | null }> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (profile?.role === "admin" || profile?.role === "owner") {
    return { isAdmin: true, projectIds: null };
  }

  const { data: access } = await supabase
    .from("vault_project_access")
    .select("project_id")
    .eq("profile_id", userId);

  return {
    isAdmin: false,
    projectIds: (access || []).map((a) => a.project_id),
  };
}

export async function canAccessProject(
  supabase: SupabaseClient,
  userId: string,
  workspaceId: string,
  projectId: string,
): Promise<boolean> {
  const { isAdmin, projectIds } = await getAccessibleProjectIds(
    supabase,
    userId,
    workspaceId,
  );
  if (isAdmin) return true;
  return projectIds!.includes(projectId);
}
