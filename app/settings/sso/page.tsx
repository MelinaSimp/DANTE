import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase/server";
import { isWorkspaceAdmin } from "@/lib/rbac";
import SSOSetupClient from "./SSOSetupClient";

export const dynamic = "force-dynamic";

export default async function SSOPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.workspace_id) redirect("/select");

  if (!isWorkspaceAdmin(profile.role)) {
    return (
      <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)] flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h1 className="heading-display text-3xl text-[var(--ink)] mb-3">
            Admins only
          </h1>
          <p className="text-sm text-[var(--ink-muted)] mb-6">
            SSO configuration is only available to workspace admins and owners.
          </p>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 bg-[var(--ink)] text-[var(--canvas)] px-4 py-2 rounded-[4px] text-sm font-medium hover:bg-[var(--ink)]/90 transition"
          >
            Back to settings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <div className="border-b border-[var(--rule)] bg-[var(--canvas)] px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="heading-display text-xl text-[var(--ink)]">Drift</span>
            <span className="label-section text-[var(--ink-muted)]">SSO</span>
          </div>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
            Back to settings
          </Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-8 py-8">
        <div className="mb-6">
          <div className="label-section mb-2">Enterprise</div>
          <h1 className="heading-display text-4xl text-[var(--ink)] mb-1">
            Single sign-on (SSO)
          </h1>
          <p className="text-sm text-[var(--ink-muted)] max-w-xl">
            Configure SAML 2.0 or OpenID Connect for your workspace. SSO is
            available on the Enterprise plan. After you save your IdP details
            below, reach out to sales to activate it for your workspace.
          </p>
        </div>
        <SSOSetupClient workspaceId={profile.workspace_id} />
      </div>
    </div>
  );
}
