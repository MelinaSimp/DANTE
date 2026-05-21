// app/dante/templates/page.tsx
//
// Dante · Workflow templates — Harvey-for-advisors starter pack.
// Server shell that auth-gates; the gallery itself (categories, cards,
// clone buttons) lives in DanteTemplatesClient.

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isOwner } from "@/lib/rbac";
import { hasSuperadminAccess } from "@/lib/superadmin";
import DanteTemplatesClient from "./DanteTemplatesClient";

export const dynamic = "force-dynamic";

export default async function DanteTemplatesPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: profile } = await supabase.from("profiles")
    .select("workspace_id, role, is_superadmin").eq("id", user.id).maybeSingle();
  if (!profile?.workspace_id) redirect("/dashboard");

  const vaultCountResp = await supabaseAdmin
    .from("vault_items").select("id", { count: "exact", head: true })
    .eq("workspace_id", profile.workspace_id);
  const vaultReady = vaultCountResp.error ? 0 : (vaultCountResp.count ?? 0);

  const canManageVault =
    isOwner(profile.role) ||
    hasSuperadminAccess(user.email, profile.is_superadmin);

  return <DanteTemplatesClient vaultReady={vaultReady} canManageVault={canManageVault} />;
}
