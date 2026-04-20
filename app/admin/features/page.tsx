import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasSuperadminAccess } from "@/lib/superadmin";
import WorkspaceFeatureManager from "@/components/admin/WorkspaceFeatureManager";

export const dynamic = "force-dynamic";

export default async function FeaturesPage() {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/auth");

  const { data: me } = await supabase
    .from("profiles")
    .select("id, is_superadmin")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (!hasSuperadminAccess(auth.user.email, me?.is_superadmin)) redirect("/select");

  return (
    <div className="px-8 py-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <div className="label-section mb-2">Admin</div>
        <h1 className="heading-display text-4xl text-[var(--ink)] mb-1">Feature management</h1>
        <p className="text-[var(--ink-muted)] text-sm">
          Toggle features and set plan status per workspace.
        </p>
      </div>
      <WorkspaceFeatureManager />
    </div>
  );
}
