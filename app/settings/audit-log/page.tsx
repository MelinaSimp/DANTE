import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isWorkspaceAdmin } from "@/lib/rbac";
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

  const isAdmin = isWorkspaceAdmin(profile.role);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)] flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h1 className="heading-display text-3xl text-[var(--ink)] mb-3">
            Admins only
          </h1>
          <p className="text-sm text-[var(--ink-muted)] mb-6">
            Audit logs are only available to workspace admins and owners. Ask
            your workspace owner for access.
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

  const { data: logs } = await supabaseAdmin
    .from("audit_logs")
    .select(
      "id, actor_id, actor_email, action, target_type, target_id, target_label, metadata, ip_address, created_at"
    )
    .eq("workspace_id", profile.workspace_id)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <div className="border-b border-[var(--rule)] bg-[var(--canvas)] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="heading-display text-xl text-[var(--ink)]">Drift</span>
            <span className="label-section text-[var(--ink-muted)]">Audit log</span>
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
      <div className="max-w-5xl mx-auto px-8 py-8">
        <h1 className="heading-display text-4xl text-[var(--ink)] mb-1">
          Audit log
        </h1>
        <p className="text-sm text-[var(--ink-muted)] mb-6">
          Sensitive events in your workspace — who did what and when. Retained
          indefinitely. Only workspace admins and owners can view this page.
        </p>
        <AuditLogClient initialLogs={logs ?? []} />
      </div>
    </div>
  );
}
