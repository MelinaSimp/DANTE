// app/dante/page.tsx
//
// Dante — the CRM's autonomous reasoning layer. Two surfaces live
// under this umbrella:
//
//   • Churn prediction — ranks every client by the risk they'll
//     leave, blending meeting attendance, call sentiment, recency,
//     and contact-gap trajectory into a single 0–100 score.
//   • Workflows — chain HTTP calls, OpenAI prompts, and CRM actions
//     into reusable automations (an n8n-style step runner). Visual
//     node canvas ships in phase 2 on top of the same engine.

import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isOwner } from "@/lib/rbac";
import { hasSuperadminAccess } from "@/lib/superadmin";
import {
  ArrowLeft, TrendingDown, Zap, ArrowUpRight, Flame,
  Activity, AlertTriangle, Key, ShieldCheck, Archive, BookOpen,
  FileText, Sparkles,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DantePage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: profile } = await supabase.from("profiles")
    .select("workspace_id, role, is_superadmin").eq("id", user.id).maybeSingle();
  if (!profile?.workspace_id) redirect("/dashboard");

  // The Archive tile is owner-only (legal/compliance documents — see
  // lib/dante/archive/guard.ts for the full rationale). Members and
  // admins don't even see it in nav; templates that reference the
  // archive still work for them because the runner uses service-role.
  const canSeeArchive =
    isOwner(profile.role) ||
    hasSuperadminAccess(user.email, profile.is_superadmin);

  // Pull summary counts so the landing page isn't just two dead links.
  // Secrets count is wrapped in a try/catch so a missing table (pre-migration)
  // doesn't break the page — the runner already no-ops on 42P01.
  const [{ count: criticalCount }, { count: atRiskCount }, { count: workflowCount }, { data: latestScore }, secretCountResp, archiveCountResp] = await Promise.all([
    supabaseAdmin.from("dante_churn_scores").select("id", { count: "exact", head: true })
      .eq("workspace_id", profile.workspace_id).eq("tier", "critical"),
    supabaseAdmin.from("dante_churn_scores").select("id", { count: "exact", head: true })
      .eq("workspace_id", profile.workspace_id).eq("tier", "at_risk"),
    supabaseAdmin.from("dante_workflows").select("id", { count: "exact", head: true })
      .eq("workspace_id", profile.workspace_id),
    supabaseAdmin.from("dante_churn_scores").select("computed_at")
      .eq("workspace_id", profile.workspace_id)
      .order("computed_at", { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from("dante_secrets").select("id", { count: "exact", head: true })
      .eq("workspace_id", profile.workspace_id),
    supabaseAdmin.from("dante_archive_documents").select("id", { count: "exact", head: true })
      .eq("workspace_id", profile.workspace_id).eq("status", "ready"),
  ]);
  const secretCount = secretCountResp.error ? 0 : (secretCountResp.count ?? 0);
  const archiveCount = archiveCountResp.error ? 0 : (archiveCountResp.count ?? 0);

  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      {/* Top bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-6 md:px-8 py-4 bg-[var(--canvas)] border-b border-[var(--rule)]">
        <div className="flex items-center gap-3">
          <img src="/brand/logo-circle.png" alt="Drift" className="w-6 h-6 rounded-full object-cover" />
          <span className="text-sm font-semibold text-[var(--ink)]">Drift</span>
          <span className="text-xs text-[var(--ink-subtle)]">/</span>
          <Link href="/dashboard" className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] transition">Dashboard</Link>
          <span className="text-xs text-[var(--ink-subtle)]">/</span>
          <span className="text-xs text-[var(--ink)]">Dante</span>
        </div>
        <Link href="/dashboard" className="flex items-center gap-1.5 px-3 py-2 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition text-sm font-medium">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
          <span className="hidden sm:inline">Dashboard</span>
        </Link>
      </div>

      <div className="px-6 md:px-8 py-12 max-w-[1100px] mx-auto">
        {/* Header */}
        <div className="mb-12">
          <div className="label-section mb-3">Dante</div>
          <h1 className="heading-display text-5xl text-[var(--ink)] mb-4">
            Signals &amp; automations, working behind the desk.
          </h1>
          <p className="text-base text-[var(--ink-muted)] max-w-2xl leading-relaxed">
            Dante watches what happens between every client touch — meetings
            kept, calls answered, summaries written — and quietly builds the
            two things every advisor wishes they had time to maintain: a ranked
            list of who&apos;s about to leave, and a toolbox of automations that
            turn repetitive follow-ups into one-click runs.
          </p>
        </div>

        {/* Surface cards — four primary pillars */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Churn */}
          <Link href="/dante/churn"
            className="group card-flat card-flat-hover p-6 flex flex-col">
            <div className="flex items-start justify-between mb-4">
              <div className="border border-[var(--rule)] bg-[var(--canvas)] rounded-[4px] p-2.5">
                <TrendingDown className="w-5 h-5 text-[var(--ink)]" strokeWidth={1.5} />
              </div>
              <ArrowUpRight className="w-4 h-4 text-[var(--ink-subtle)] group-hover:text-[var(--ink)] transition" strokeWidth={1.5} />
            </div>
            <h2 className="text-lg font-semibold text-[var(--ink)] mb-1">Churn prediction</h2>
            <p className="text-sm text-[var(--ink-muted)] mb-5 leading-relaxed">
              A 0–100 risk score for every client, derived from meeting attendance,
              call sentiment, recency, and contact-gap trajectory. Click any row
              to see the signal breakdown.
            </p>
            <div className="mt-auto flex items-center gap-4 text-xs">
              <span className="inline-flex items-center gap-1.5 text-[var(--danger)]">
                <Flame className="w-3.5 h-3.5" strokeWidth={1.5} />
                <strong className="font-semibold">{criticalCount ?? 0}</strong> critical
              </span>
              <span className="inline-flex items-center gap-1.5 text-[var(--flag)]">
                <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.5} />
                <strong className="font-semibold">{atRiskCount ?? 0}</strong> at risk
              </span>
              {latestScore?.computed_at && (
                <span className="ml-auto text-[var(--ink-subtle)]">
                  {new Date(latestScore.computed_at).toLocaleDateString()}
                </span>
              )}
            </div>
          </Link>

          {/* Workflows */}
          <Link href="/dante/workflows"
            className="group card-flat card-flat-hover p-6 flex flex-col">
            <div className="flex items-start justify-between mb-4">
              <div className="border border-[var(--rule)] bg-[var(--canvas)] rounded-[4px] p-2.5">
                <Zap className="w-5 h-5 text-[var(--ink)]" strokeWidth={1.5} />
              </div>
              <ArrowUpRight className="w-4 h-4 text-[var(--ink-subtle)] group-hover:text-[var(--ink)] transition" strokeWidth={1.5} />
            </div>
            <h2 className="text-lg font-semibold text-[var(--ink)] mb-1">Workflows</h2>
            <p className="text-sm text-[var(--ink-muted)] mb-5 leading-relaxed">
              Chain HTTP calls, OpenAI prompts, archive lookups, and CRM
              actions into reusable automations. Start from a template or
              build one from the visual canvas.
            </p>
            <div className="mt-auto flex items-center gap-4 text-xs">
              <span className="inline-flex items-center gap-1.5 text-[var(--ink-muted)]">
                <Activity className="w-3.5 h-3.5" strokeWidth={1.5} />
                <strong className="font-semibold text-[var(--ink)]">{workflowCount ?? 0}</strong> workflow{(workflowCount ?? 0) === 1 ? "" : "s"}
              </span>
            </div>
          </Link>

          {/* Archive — owner/superadmin only */}
          {canSeeArchive && (
            <Link href="/dante/archive"
              className="group card-flat card-flat-hover p-6 flex flex-col">
              <div className="flex items-start justify-between mb-4">
                <div className="border border-[var(--rule)] bg-[var(--canvas)] rounded-[4px] p-2.5">
                  <Archive className="w-5 h-5 text-[var(--ink)]" strokeWidth={1.5} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[3px] bg-[var(--verified-soft)] text-[var(--verified)] text-[10px] font-medium">
                    <ShieldCheck className="w-2.5 h-2.5" strokeWidth={1.5} />
                    owner-only
                  </span>
                  <ArrowUpRight className="w-4 h-4 text-[var(--ink-subtle)] group-hover:text-[var(--ink)] transition" strokeWidth={1.5} />
                </div>
              </div>
              <h2 className="text-lg font-semibold text-[var(--ink)] mb-1">Archive</h2>
              <p className="text-sm text-[var(--ink-muted)] mb-5 leading-relaxed">
                The firm&apos;s document vault. Drop in Form ADVs, IPS templates,
                client agreements, and compliance memos — every file becomes
                searchable and citable by workflows with page-level precision.
              </p>
              <div className="mt-auto flex items-center gap-4 text-xs">
                <span className="inline-flex items-center gap-1.5 text-[var(--ink-muted)]">
                  <FileText className="w-3.5 h-3.5" strokeWidth={1.5} />
                  <strong className="font-semibold text-[var(--ink)]">{archiveCount}</strong> indexed
                </span>
              </div>
            </Link>
          )}

          {/* Templates */}
          <Link href="/dante/templates"
            className="group card-flat card-flat-hover p-6 flex flex-col">
            <div className="flex items-start justify-between mb-4">
              <div className="border border-[var(--rule)] bg-[var(--canvas)] rounded-[4px] p-2.5">
                <BookOpen className="w-5 h-5 text-[var(--ink)]" strokeWidth={1.5} />
              </div>
              <ArrowUpRight className="w-4 h-4 text-[var(--ink-subtle)] group-hover:text-[var(--ink)] transition" strokeWidth={1.5} />
            </div>
            <h2 className="text-lg font-semibold text-[var(--ink)] mb-1">Workflow templates</h2>
            <p className="text-sm text-[var(--ink-muted)] mb-5 leading-relaxed">
              Pre-built automations for the advisor&apos;s day — meeting prep,
              follow-up drafts, quarterly-review reminders, life-event
              scanners, and more. One click clones any of them into your
              workflows list.
            </p>
            <div className="mt-auto flex items-center gap-4 text-xs">
              <span className="inline-flex items-center gap-1.5 text-[var(--ink-muted)]">
                <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
                Advisor-specific, archive-aware
              </span>
            </div>
          </Link>
        </div>

        {/* Settings strip — single full-width row so it doesn't compete
            visually with the two primary surfaces above. */}
        <div className="mt-4">
          <Link href="/dante/settings/secrets"
            className="group card-flat card-flat-hover p-5 flex items-center gap-4">
            <div className="border border-[var(--rule)] bg-[var(--canvas)] rounded-[4px] p-2.5">
              <Key className="w-4 h-4 text-[var(--ink)]" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <h2 className="text-sm font-semibold text-[var(--ink)]">Secrets vault</h2>
                <span className="inline-flex items-center gap-1 text-[10px] text-[var(--ink-subtle)]">
                  <ShieldCheck className="w-3 h-3" strokeWidth={1.5} />
                  service-role only
                </span>
              </div>
              <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
                API keys and tokens for workflow steps. Reference as <code className="text-[var(--ink)]">{"{{secrets.key}}"}</code> and the runner redacts them from logs before insert.
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-[var(--ink-muted)]">
              <span><strong className="font-semibold text-[var(--ink)]">{secretCount}</strong> stored</span>
              <ArrowUpRight className="w-4 h-4 text-[var(--ink-subtle)] group-hover:text-[var(--ink)] transition" strokeWidth={1.5} />
            </div>
          </Link>
        </div>

      </div>
    </div>
  );
}
