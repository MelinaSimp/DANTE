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
import {
  ArrowLeft, TrendingDown, Zap, ArrowUpRight, Flame,
  Activity, AlertTriangle,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DantePage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: profile } = await supabase.from("profiles")
    .select("workspace_id").eq("id", user.id).maybeSingle();
  if (!profile?.workspace_id) redirect("/dashboard");

  // Pull summary counts so the landing page isn't just two dead links.
  const [{ count: criticalCount }, { count: atRiskCount }, { count: workflowCount }, { data: latestScore }] = await Promise.all([
    supabaseAdmin.from("dante_churn_scores").select("id", { count: "exact", head: true })
      .eq("workspace_id", profile.workspace_id).eq("tier", "critical"),
    supabaseAdmin.from("dante_churn_scores").select("id", { count: "exact", head: true })
      .eq("workspace_id", profile.workspace_id).eq("tier", "at_risk"),
    supabaseAdmin.from("dante_workflows").select("id", { count: "exact", head: true })
      .eq("workspace_id", profile.workspace_id),
    supabaseAdmin.from("dante_churn_scores").select("computed_at")
      .eq("workspace_id", profile.workspace_id)
      .order("computed_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

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

        {/* Two surface cards */}
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
              Chain HTTP calls, OpenAI prompts, and CRM actions into reusable
              automations. Each step can template off the previous step&apos;s
              output. Run them from the editor; visual node canvas is next.
            </p>
            <div className="mt-auto flex items-center gap-4 text-xs">
              <span className="inline-flex items-center gap-1.5 text-[var(--ink-muted)]">
                <Activity className="w-3.5 h-3.5" strokeWidth={1.5} />
                <strong className="font-semibold text-[var(--ink)]">{workflowCount ?? 0}</strong> workflow{(workflowCount ?? 0) === 1 ? "" : "s"}
              </span>
            </div>
          </Link>
        </div>

        {/* Phase 2 roadmap note */}
        <div className="mt-12 card-flat p-5 bg-[var(--canvas-subtle)]">
          <div className="label-section mb-2">Phase 2 roadmap</div>
          <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
            Visual node canvas for workflows (drag-drop, wires, branching).
            Cron + webhook triggers. Nightly churn recompute with score-over-time
            sparklines. ML model trained on observed churn, layered over the
            current rule-based baseline. More integrations (Slack, Stripe,
            Sheets, Notion).
          </p>
        </div>
      </div>
    </div>
  );
}
