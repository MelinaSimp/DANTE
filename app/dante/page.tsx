// app/dante/page.tsx
//
// Dante's front door. Restructured around a Harvey-style chat surface:
// the primary interaction is a single "Ask Dante anything" textarea
// at the top, with quick-prompt pills and a recent-chats sidebar.
//
// The four legacy surfaces (Churn, Workflows, Archive, Templates)
// are demoted to a "Surfaces" strip at the bottom — they're still
// one click away, but they're no longer the first thing advisors
// see when they arrive. Most asks should resolve through chat;
// surfaces are for power-user navigation into bulk views.

import Link from "next/link";
import DanteGateLink from "@/components/dante/DanteGateLink";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isOwner } from "@/lib/rbac";
import { hasSuperadminAccess } from "@/lib/superadmin";
import {
  ArrowLeft,
  TrendingDown,
  Zap,
  Vault,
  BookOpen,
  Key,
  ShieldCheck,
} from "lucide-react";
import AskDante from "./AskDante";

export const dynamic = "force-dynamic";

export default async function DantePage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, role, is_superadmin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) redirect("/dashboard");

  const canSeeArchive =
    isOwner(profile.role) ||
    hasSuperadminAccess(user.email, profile.is_superadmin);

  // Lightweight count summary for the surface strip below the chat.
  // We keep these so the strip isn't dead links — but we don't put
  // them in the visual hero anymore.
  const [
    { count: criticalCount },
    { count: workflowCount },
    archiveCountResp,
    secretCountResp,
  ] = await Promise.all([
    supabaseAdmin
      .from("dante_churn_scores")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", profile.workspace_id)
      .eq("tier", "critical"),
    supabaseAdmin
      .from("dante_workflows")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", profile.workspace_id),
    supabaseAdmin
      .from("dante_archive_documents")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", profile.workspace_id)
      .eq("status", "ready"),
    supabaseAdmin
      .from("dante_secrets")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", profile.workspace_id),
  ]);
  const archiveCount = archiveCountResp.error ? 0 : archiveCountResp.count ?? 0;
  const secretCount = secretCountResp.error ? 0 : secretCountResp.count ?? 0;

  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      {/* Top bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-6 md:px-8 py-4 bg-[var(--canvas)] border-b border-[var(--rule)]">
        <div className="flex items-center gap-3">
          <img
            src="/brand/logo-circle.png"
            alt="Drift"
            className="w-6 h-6 rounded-full object-cover"
          />
          <span className="text-sm font-semibold text-[var(--ink)]">Drift</span>
          <span className="text-xs text-[var(--ink-subtle)]">/</span>
          <Link
            href="/dashboard"
            className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
          >
            Dashboard
          </Link>
          <span className="text-xs text-[var(--ink-subtle)]">/</span>
          <DanteGateLink variant="breadcrumb-static" />
        </div>
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 px-3 py-2 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
          <span className="hidden sm:inline">Dashboard</span>
        </Link>
      </div>

      <div className="px-6 md:px-8 py-16 md:py-20 max-w-[1100px] mx-auto">
        {/* Centered chat hero — Harvey-style. AskDante owns the
            wordmark + scope row + input + history collapsible. */}
        <AskDante />

        {/* ── Surfaces strip — demoted from the hero ─────────────── */}
        <div className="mt-16 pt-8 border-t border-[var(--rule)]">
          <div className="label-section mb-4 text-center">Surfaces</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <SurfaceLink
              href="/dante/churn"
              icon={<TrendingDown className="w-4 h-4" strokeWidth={1.5} />}
              label="Churn prediction"
              detail={
                criticalCount && criticalCount > 0
                  ? `${criticalCount} critical`
                  : "Ranked at-risk clients"
              }
            />
            <SurfaceLink
              href="/dante/workflows"
              icon={<Zap className="w-4 h-4" strokeWidth={1.5} />}
              label="Workflows"
              detail={`${workflowCount ?? 0} workflow${(workflowCount ?? 0) === 1 ? "" : "s"}`}
            />
            {canSeeArchive && (
              <SurfaceLink
                href="/dante/archive"
                icon={<Vault className="w-4 h-4" strokeWidth={1.5} />}
                label="Archive"
                detail={`${archiveCount} indexed`}
                badge="owner-only"
              />
            )}
            <SurfaceLink
              href="/dante/templates"
              icon={<BookOpen className="w-4 h-4" strokeWidth={1.5} />}
              label="Templates"
              detail="Pre-built workflows"
            />
          </div>

          <div className="mt-3">
            <SurfaceLink
              href="/dante/settings/secrets"
              icon={<Key className="w-4 h-4" strokeWidth={1.5} />}
              label="Secrets vault"
              detail={`${secretCount} stored`}
              badge="service-role only"
              wide
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SurfaceLink({
  href,
  icon,
  label,
  detail,
  badge,
  wide,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  detail: string;
  badge?: string;
  wide?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group flex items-center gap-3 rounded-[4px] border border-[var(--rule)] bg-[var(--canvas-subtle)] hover:bg-[var(--canvas)] hover:border-[var(--ink-subtle)] px-3 py-2.5 transition ${
        wide ? "" : ""
      }`}
    >
      <div className="border border-[var(--rule)] bg-[var(--canvas)] rounded-[4px] p-1.5 text-[var(--ink-muted)] group-hover:text-[var(--ink)]">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-[var(--ink)] font-medium truncate">{label}</span>
          {badge && (
            <span className="inline-flex items-center gap-0.5 rounded-[3px] bg-[var(--verified-soft)] text-[var(--verified)] text-[9px] px-1 py-0.5">
              <ShieldCheck className="w-2 h-2" strokeWidth={1.5} />
              {badge}
            </span>
          )}
        </div>
        <div className="text-[11px] text-[var(--ink-subtle)] truncate">{detail}</div>
      </div>
    </Link>
  );
}
