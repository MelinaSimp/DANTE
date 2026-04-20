// app/email/page.tsx
//
// Workspace-level entry point for outbound email. Most RIAs run one
// agent, so we auto-redirect to that agent's emailing view. If a
// workspace has multiple agents, we show a short picker. The full
// composer / template / history UI still lives under
// /frontend/agent/[id]/emailing for now — moving that interface
// wholesale is a separate task; this route exists so "Email" can live
// on the dashboard nav without forcing users through an agent picker.

import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EmailPage() {
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

  if (!profile?.workspace_id) redirect("/join");

  // Fetch this workspace's agents. We're just using this to decide
  // whether to redirect (single agent) or render a small picker
  // (multi-agent). The record shape doesn't matter beyond id+name.
  const { data: agents } = await supabase
    .from("agents")
    .select("id, name")
    .eq("workspace_id", profile.workspace_id)
    .order("created_at", { ascending: true });

  const list = agents ?? [];

  // Typical path — one agent, skip the picker.
  if (list.length === 1) {
    redirect(`/frontend/agent/${list[0].id}/emailing`);
  }

  // Zero-agent state: tell the user where to create one instead of
  // dumping them on a broken composer.
  if (list.length === 0) {
    return (
      <div className="bg-[var(--canvas)] min-h-screen text-[var(--ink)]">
        <div className="max-w-3xl mx-auto px-6 md:px-10 py-10">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition mb-6"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
            Dashboard
          </Link>
          <div className="label-section mb-2">Workspace</div>
          <h1 className="heading-display text-4xl md:text-5xl text-[var(--ink)] mb-3">Email</h1>
          <p className="prose-body text-[var(--ink-muted)] mb-8">
            Outbound email runs through a Drift agent. You don&rsquo;t have one yet.
          </p>
          <Link
            href="/dashboard/agents"
            className="inline-flex items-center gap-2 rounded-[4px] bg-[var(--ink)] px-4 py-2 text-sm font-medium text-[var(--canvas)] hover:bg-[var(--ink)]/90 transition"
          >
            <Mail className="w-4 h-4" strokeWidth={1.5} />
            Set up an agent
          </Link>
        </div>
      </div>
    );
  }

  // Multi-agent workspaces — small Harvey picker, then route through.
  return (
    <div className="bg-[var(--canvas)] min-h-screen text-[var(--ink)]">
      <div className="max-w-3xl mx-auto px-6 md:px-10 py-10">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition mb-6"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
          Dashboard
        </Link>
        <div className="label-section mb-2">Workspace</div>
        <h1 className="heading-display text-4xl md:text-5xl text-[var(--ink)] mb-3">Email</h1>
        <p className="prose-body text-[var(--ink-muted)] mb-8">
          Pick an agent to send mail from.
        </p>
        <div className="border-t border-b border-[var(--rule)]">
          {list.map((a) => (
            <Link
              key={a.id}
              href={`/frontend/agent/${a.id}/emailing`}
              className="flex items-center justify-between gap-4 px-4 py-4 border-b border-[var(--rule)] last:border-b-0 transition hover:bg-[var(--canvas-subtle)]"
            >
              <span className="text-[15px] font-medium text-[var(--ink)]">
                {a.name}
              </span>
              <span className="text-sm text-[var(--ink-muted)]">Open →</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
