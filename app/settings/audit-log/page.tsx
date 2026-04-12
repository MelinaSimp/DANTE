import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import AuditLogClient from "./AuditLogClient";

export const dynamic = "force-dynamic";

export default async function AuditLogPage() {
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

  if (!profile?.workspace_id) {
    redirect("/select");
  }

  const isAdmin = profile.role === "admin" || profile.role === "owner";

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#242423] text-white flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold mb-3">Admins only</h1>
          <p className="text-white/60 mb-6">
            Audit logs are only available to workspace admins and owners. Ask
            your workspace owner for access.
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

  const { data: logs } = await supabaseAdmin
    .from("audit_logs")
    .select(
      "id, actor_id, actor_email, action, target_type, target_id, target_label, metadata, ip_address, created_at"
    )
    .eq("workspace_id", profile.workspace_id)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="min-h-screen bg-[#242423] text-white">
      <div className="max-w-5xl mx-auto px-6 py-12">
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
          <h1 className="text-3xl font-semibold">Audit log</h1>
          <p className="text-white/50 text-sm mt-2">
            Sensitive events in your workspace — who did what and when. Retained
            indefinitely. Only workspace admins and owners can view this page.
          </p>
        </div>
        <AuditLogClient initialLogs={logs ?? []} />
      </div>
    </div>
  );
}
