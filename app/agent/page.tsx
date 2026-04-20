// app/agent/page.tsx
//
// Workspace-level entry to "the agent." Most RIAs run one — in that
// case this route redirects straight to the agent's detail view, so
// the "Agent" dashboard nav item feels like a direct link. Multi-agent
// workspaces see a small picker. Zero-agent workspaces get sent to the
// agent-creation flow in the dashboard. The full agent detail lives
// under /frontend/agent/[id] today; this shell just chooses which one.

import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Bot, Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AgentPage() {
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

  const { data: agents } = await supabase
    .from("agents")
    .select("id, name, description")
    .eq("workspace_id", profile.workspace_id)
    .order("created_at", { ascending: true });

  const list = agents ?? [];

  if (list.length === 1) {
    redirect(`/frontend/agent/${list[0].id}/llm`);
  }

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
          <h1 className="heading-display text-4xl md:text-5xl text-[var(--ink)] mb-3">Agent</h1>
          <p className="prose-body text-[var(--ink-muted)] mb-8">
            No agent configured yet. An agent handles inbound calls, drafts
            emails, and runs the workflows that feed your CRM.
          </p>
          <Link
            href="/dashboard/agents"
            className="inline-flex items-center gap-2 rounded-[4px] bg-[var(--ink)] px-4 py-2 text-sm font-medium text-[var(--canvas)] hover:bg-[var(--ink)]/90 transition"
          >
            <Plus className="w-4 h-4" strokeWidth={1.5} />
            Create your first agent
          </Link>
        </div>
      </div>
    );
  }

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
        <h1 className="heading-display text-4xl md:text-5xl text-[var(--ink)] mb-3">Agents</h1>
        <p className="prose-body text-[var(--ink-muted)] mb-8">
          Open an agent to configure its LLM, sales, schedule, and data
          sources.
        </p>
        <div className="border-t border-b border-[var(--rule)]">
          {list.map((a) => (
            <Link
              key={a.id}
              href={`/frontend/agent/${a.id}/llm`}
              className="flex items-center justify-between gap-4 px-4 py-4 border-b border-[var(--rule)] last:border-b-0 transition hover:bg-[var(--canvas-subtle)]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Bot className="w-4 h-4 text-[var(--ink-muted)] shrink-0" strokeWidth={1.5} />
                <div className="min-w-0">
                  <div className="text-[15px] font-medium text-[var(--ink)] truncate">
                    {a.name}
                  </div>
                  {a.description && (
                    <div className="text-sm text-[var(--ink-muted)] truncate">
                      {a.description}
                    </div>
                  )}
                </div>
              </div>
              <span className="text-sm text-[var(--ink-muted)] shrink-0">Open →</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
