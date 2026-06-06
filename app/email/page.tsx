// app/email/page.tsx
//
// Workspace-level email composer. Replaces the old per-agent
// /frontend/agent/[id]/emailing route, which dragged a frontend-orb
// sidebar onto every email view. Now: one workspace URL, Harvey shell,
// no leaked agent-selector rail.
//
// We still need an agentId on the client — the LLM rewrite endpoint
// scopes by agent, and recent-sent is keyed by agent so different
// agents don't bleed email history. We pick the workspace's first agent
// server-side. Zero-agent workspaces see a CTA to create one instead of
// a broken composer; multi-agent is fine because the picked agent only
// changes which recent-sent log is shown and which LLM prompt context
// is used for drafting, not anything a user will notice day-to-day.
// Moving to a proper agent picker in the top bar is future work.

import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Mail } from "lucide-react";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import EmailClient from "./EmailClient";

export const dynamic = "force-dynamic";

export default async function EmailPage() {
  const ctx = await getShellContext();
  if (!ctx) redirect("/auth");

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user!.id)
    .maybeSingle();

  if (!profile?.workspace_id) redirect("/join");

  const { data: agents } = await supabase
    .from("agents")
    .select("id")
    .eq("workspace_id", profile.workspace_id)
    .order("created_at", { ascending: true });

  const list = agents ?? [];

  if (list.length === 0) {
    return (
      <AppShell {...ctx}>
        <div className="bg-[var(--canvas)] min-h-screen text-[var(--ink)]">
          <div className="max-w-3xl mx-auto px-6 md:px-10 py-10">
            <div className="label-section mb-2">Workspace</div>
            <h1 className="heading-display text-4xl md:text-5xl text-[var(--ink)] mb-3">
              Email
            </h1>
            <p className="prose-body text-[var(--ink-muted)] mb-8">
              Outbound email runs through a Drift agent. You don&rsquo;t have
              one yet.
            </p>
            <Link
              href="/agent"
              className="inline-flex items-center gap-2 rounded-[4px] bg-[var(--ink)] px-4 py-2 text-sm font-medium text-[var(--canvas)] hover:bg-[var(--ink)]/90 transition"
            >
              <Mail className="w-4 h-4" strokeWidth={1.5} />
              Set up an agent
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell {...ctx}>
      <EmailClient agentId={list[0].id} />
    </AppShell>
  );
}
