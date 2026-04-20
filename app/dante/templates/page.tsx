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

  // Surface the archive-ready count so we can show a "needs archive"
  // warning inline when the user tries to clone a template that relies
  // on vector lookups against an empty vault.
  const archiveCountResp = await supabaseAdmin
    .from("dante_archive_documents").select("id", { count: "exact", head: true })
    .eq("workspace_id", profile.workspace_id).eq("status", "ready");
  const archiveReady = archiveCountResp.error ? 0 : (archiveCountResp.count ?? 0);

  // The Archive itself is owner-only; we pass the flag down so the
  // empty-archive warning can either link to the archive page (for
  // owners) or tell a member to ask their owner (everyone else).
  const canManageArchive =
    isOwner(profile.role) ||
    hasSuperadminAccess(user.email, profile.is_superadmin);

  return <DanteTemplatesClient archiveReady={archiveReady} canManageArchive={canManageArchive} />;
}
