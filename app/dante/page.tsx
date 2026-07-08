import { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import AskDante from "./AskDante";
import SourceViewerLayout from "@/components/dante/source-viewer/SourceViewerLayout";
import { getIndustryConfig } from "@/lib/industry/config";

export const metadata: Metadata = {
  title: "Dante AI — Drift",
  description: "AI assistant for any business. Build agents, voice assistants, and workflows on a low-hallucination, citation-grounded LLM.",
};

export const dynamic = "force-dynamic";

export default async function DantePage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, full_name")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) redirect("/home");

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("industry")
    .eq("id", profile.workspace_id)
    .maybeSingle();
  const assistantName = getIndustryConfig(workspace?.industry).assistantName;
  const firstName = (profile.full_name || user.email?.split("@")[0] || "").split(" ")[0];

  return (
    <div className="h-full">
      <SourceViewerLayout>
        <AskDante assistantName={assistantName} userName={firstName} />
      </SourceViewerLayout>
    </div>
  );
}
