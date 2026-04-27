// app/dante/page.tsx
//
// Dante's front door. Singular focus — the chat IS the page.
//
// Earlier iterations had a "Surfaces" strip at the bottom (Churn /
// Workflows / Archive / Templates / Secrets) for direct navigation
// into bulk views. We dropped that strip to remove visual contention
// with the chat surface; those routes are still accessible directly
// or via the dashboard.

import Link from "next/link";
import DanteGateLink from "@/components/dante/DanteGateLink";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { ArrowLeft } from "lucide-react";
import AskDante from "./AskDante";
import { getIndustryConfig } from "@/lib/industry/config";

export const dynamic = "force-dynamic";

export default async function DantePage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) redirect("/dashboard");

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("industry")
    .eq("id", profile.workspace_id)
    .maybeSingle();
  const assistantName = getIndustryConfig(workspace?.industry).assistantName;

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
          <DanteGateLink variant="breadcrumb-static" label={assistantName} />
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
        {/* Singular focus — chat is the page. Surfaces (churn,
            workflows, archive, templates, secrets) are still
            reachable via direct URLs and the breadcrumb top nav,
            but no longer compete with the chat for attention. */}
        <AskDante assistantName={assistantName} />
      </div>
    </div>
  );
}
