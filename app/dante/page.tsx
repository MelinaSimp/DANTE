import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
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
    <div className="h-full bg-white">
      <AskDante assistantName={assistantName} />
    </div>
  );
}
