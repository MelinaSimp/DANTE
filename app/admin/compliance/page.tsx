// app/admin/compliance/page.tsx
//
// Phase 5 W5.9 — compliance export UI.
//
// Server-rendered page that gates on workspace admin / supervisor.
// Renders the export form (date range + optional contact filter).
// Submits to /api/admin/compliance/export which downloads a JSON
// audit pack.
//
// Enterprise-tier-gated — lower tiers see a tier-upgrade prompt.

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { tierHasFeature } from "@/lib/billing/plan-tiers";
import ComplianceExportClient from "./ComplianceExportClient";

export const dynamic = "force-dynamic";

export default async function ComplianceExportPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, role, is_superadmin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) redirect("/onboarding");

  const role = ((profile as { role?: string }).role ?? "advisor") as string;
  const isSuper = !!(profile as { is_superadmin?: boolean }).is_superadmin;
  if (!isSuper && role !== "admin" && role !== "supervisor") {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <p className="text-sm text-[var(--ink-muted)]">
          Compliance exports are restricted to workspace admins and supervisors.
        </p>
      </div>
    );
  }

  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("plan_tier")
    .eq("id", profile.workspace_id)
    .maybeSingle();
  const tier = (ws as { plan_tier?: "starter" | "pro" | "enterprise" } | null)?.plan_tier ?? "starter";
  const hasFeature = tierHasFeature(tier, "compliance.export") || isSuper;

  // Pull the 200 most recent contacts for the optional contact-scoped
  // export dropdown. RLS scopes to this workspace.
  const { data: contacts } = await supabaseAdmin
    .from("contacts")
    .select("id, name")
    .eq("workspace_id", profile.workspace_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <ComplianceExportClient
      hasFeature={hasFeature}
      currentTier={tier}
      contacts={(contacts ?? []) as Array<{ id: string; name: string | null }>}
    />
  );
}
