// /admin/customers — Drift's per-customer pricing operator UI.
//
// The lever you operate. Lists every workspace with: contracted MRR,
// included AI allowance, MTD AI spend, % of allowance, YTD overage,
// and a health pill. Sorted with over-allowance customers first so
// the at-risk row floats to the top.
//
// Click any row → /admin/customers/[id] for the detail/edit view.

import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasSuperadminAccess } from "@/lib/superadmin";
import AppShell from "@/components/shell/AppShell";
import { getWorkspaceFeatures } from "@/lib/features/server";
import CustomersTable from "./CustomersTable";

export const dynamic = "force-dynamic";

export default async function AdminCustomersPage() {
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
      <div className="max-w-6xl mx-auto px-6 md:px-10 py-10">
        <div className="mb-6">
          <div className="label-section mb-2">Admin · per-customer pricing</div>
          <h1 className="heading-display text-3xl mb-1">Customers</h1>
          <p className="prose-body text-[var(--ink-muted)] text-sm">
            Each row is one workspace's contract. Click to edit pricing,
            allowance, model routing.
          </p>
        </div>
        <CustomersTable />
      </div>
    </AppShell>
  );
}
