import { redirect } from "next/navigation";
import Link from "next/link";
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
      <div className="min-h-screen bg-[#242423] text-white flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold mb-3">Admins only</h1>
          <p className="text-white/60 mb-6">
            SSO configuration is only available to workspace admins and owners.
          </p>
          <Link
            href="/settings"
            className="px-4 py-2 rounded-xl bg-[#3351ff] hover:bg-[#4a64ff] text-white text-sm font-medium transition"
          >
            Back to settings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#242423] text-white">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link
          href="/settings"
          className="inline-flex items-center gap-2 text-sm font-medium text-white/40 hover:text-white/70 transition mb-6"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to settings
        </Link>
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.35em] text-white/40">Enterprise</p>
          <h1 className="mt-3 text-3xl font-semibold">Single sign-on (SSO)</h1>
          <p className="mt-3 text-white/50 text-sm max-w-xl">
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
