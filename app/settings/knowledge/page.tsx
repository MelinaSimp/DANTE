// app/settings/knowledge/page.tsx
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import KnowledgeSetupClient from "./KnowledgeSetupClient";

export default async function KnowledgeSetupPage() {
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

  if (!profile?.workspace_id) {
    return (
      <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
        <div className="mx-auto max-w-3xl px-8 py-8">
          <h1 className="heading-display text-4xl text-[var(--ink)] mb-1">
            AI setup
          </h1>
          <p className="text-sm text-[var(--ink-muted)] mb-6">
            Knowledge base configuration for your AI receptionist.
          </p>
          <div className="card-flat p-5 border-[var(--flag)]/30 bg-[var(--flag-soft)]">
            <p className="text-sm text-[var(--flag)]">
              No workspace found. Please contact your administrator.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { data: knowledgeEntries } = await supabase
    .from("knowledge_base")
    .select("*")
    .eq("workspace_id", profile.workspace_id)
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <div className="border-b border-[var(--rule)] bg-[var(--canvas)] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="heading-display text-xl text-[var(--ink)]">Drift</span>
            <span className="label-section text-[var(--ink-muted)]">Knowledge</span>
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

      <div className="mx-auto max-w-5xl px-8 py-8">
        <div className="mb-6">
          <div className="label-section mb-2">Knowledge base</div>
          <h1 className="heading-display text-4xl text-[var(--ink)] mb-1">
            AI setup
          </h1>
          <p className="text-sm text-[var(--ink-muted)] max-w-2xl">
            Give Drift the context it needs — services, pricing, FAQs, and
            scheduling rules — so callers get accurate answers and your team
            stays in sync.
          </p>
        </div>

        <KnowledgeSetupClient
          initialEntries={knowledgeEntries || []}
          workspaceId={profile.workspace_id}
        />
      </div>
    </div>
  );
}
