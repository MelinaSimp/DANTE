// /admin/usage/global — the "should I be worried" dashboard.
// Total MRR, total AI cost, gross margin, MoM delta, top customers
// by spend and by % of allowance.

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasSuperadminAccess } from "@/lib/superadmin";
import AppShell from "@/components/shell/AppShell";
import { getWorkspaceFeatures } from "@/lib/features/server";
import GlobalUsageClient from "./GlobalUsageClient";

export const dynamic = "force-dynamic";

export default async function AdminGlobalUsagePage() {
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
    <AppShell workspaceName="Drift Admin" industry={undefined} features={features} isSuperadmin={true}>
      <div className="max-w-6xl mx-auto px-6 md:px-10 py-10">
        <div className="mb-6">
          <div className="label-section mb-2">Admin · global</div>
          <h1 className="heading-display text-3xl mb-1">AI cost & margin</h1>
          <p className="prose-body text-[var(--ink-muted)] text-sm">
            Drift-wide AI spend vs. customer revenue. Excludes fixed
            platform costs (Vercel, Supabase, Sentry, EasyAudit).
          </p>
        </div>
        <GlobalUsageClient />
      </div>
    </AppShell>
  );
}
