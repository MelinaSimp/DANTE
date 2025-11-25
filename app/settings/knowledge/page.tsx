// app/settings/knowledge/page.tsx
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
      <div className="mx-auto max-w-3xl px-4 py-12 text-white">
        <h1 className="text-3xl font-semibold">AI Setup</h1>
        <div className="mt-6 rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-5 text-sm text-yellow-200">
          No workspace found. Please contact your administrator.
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
    <div className="relative mx-auto max-w-5xl px-4 py-12 text-white">
      <div className="absolute inset-0 -z-10 opacity-35">
        <div className="absolute left-20 top-28 h-72 w-72 rounded-full bg-gradient-to-br from-[#3351ff]/35 via-transparent to-transparent blur-[140px]" />
        <div className="absolute bottom-12 right-24 h-[22rem] w-[22rem] rounded-full bg-gradient-to-tr from-[#1b3b6f]/40 via-transparent to-transparent blur-[170px]" />
      </div>

      <div className="mb-10 space-y-3">
        <p className="text-xs uppercase tracking-[0.4em] text-white/40">Knowledge base</p>
        <h1 className="text-4xl font-semibold tracking-tight">AI Setup</h1>
        <p className="max-w-2xl text-sm text-white/60">
          Give Drift the context it needs—services, pricing, FAQs, and scheduling rules—so callers get
          accurate answers and your team stays in sync.
        </p>
      </div>

      <KnowledgeSetupClient initialEntries={knowledgeEntries || []} workspaceId={profile.workspace_id} />
    </div>
  );
}
