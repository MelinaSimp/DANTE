import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasSuperadminAccess } from "@/lib/superadmin";
import { Shield } from "lucide-react";
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

  if (!hasSuperadminAccess(auth.user.email, me?.is_superadmin)) redirect("/home");

  return (
    <div className="px-8 py-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <Shield className="h-6 w-6 text-purple-500" />
          <h1 className="text-3xl font-bold text-white">Feature Management</h1>
        </div>
        <p className="text-white/40 text-sm ml-9">Toggle features and set plan status per workspace</p>
      </div>
      <WorkspaceFeatureManager />
    </div>
  );
}
