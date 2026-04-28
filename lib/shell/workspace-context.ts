// lib/shell/workspace-context.ts
//
// Server-side fetch of the props every authenticated page needs to
// render <AppShell>: workspace name, industry, enabled features, and
// whether the signed-in user is a superadmin. Returns null when the
// user isn't signed in or has no workspace — pages should redirect
// to /auth or /dashboard accordingly.
//
// Centralizing this means each page does one shape of fetch instead
// of reinventing the auth + workspace lookup.

import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasSuperadminAccess } from "@/lib/superadmin";

export interface ShellContext {
  workspaceName: string;
  industry: string | null;
  features: string[];
  isSuperadmin: boolean;
}

export async function getShellContext(): Promise<ShellContext | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, is_superadmin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) return null;

  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("name, industry, enabled_features")
    .eq("id", profile.workspace_id)
    .maybeSingle();

  return {
    workspaceName: ws?.name || "Drift",
    industry: ws?.industry || null,
    features: (ws?.enabled_features as string[]) || [],
    isSuperadmin: hasSuperadminAccess(user.email, profile.is_superadmin),
  };
}
