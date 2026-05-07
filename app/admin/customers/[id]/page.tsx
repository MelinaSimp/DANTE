import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasSuperadminAccess } from "@/lib/superadmin";
import AppShell from "@/components/shell/AppShell";
import { getWorkspaceFeatures } from "@/lib/features/server";
import CustomerDetailClient from "./CustomerDetailClient";

export const dynamic = "force-dynamic";

export default async function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createServerSupabase();
  const auth = await supabase.auth.getUser();
  if (!auth.data.user) redirect("/auth");
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, is_superadmin")
    .eq("id", auth.data.user.id)
    .maybeSingle();
  if (!hasSuperadminAccess(auth.data.user.email, profile?.is_superadmin)) {
    redirect("/select");
  }

  const features = await getWorkspaceFeatures(profile?.workspace_id);

  return (
    <AppShell
      workspaceName="Drift Admin"
      industry={undefined}
      features={features}
      isSuperadmin={true}
    >
      <div className="max-w-4xl mx-auto px-6 md:px-10 py-10">
        <CustomerDetailClient workspaceId={id} />
      </div>
    </AppShell>
  );
}
