// app/dante/workflows/[workflowId]/impact/page.tsx
//
// Server shell for the impact view. All data-fetch happens client-side
// from the /impact API, which aggregates run logs on demand.

import { redirect, notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import WorkflowImpactClient from "./WorkflowImpactClient";

export const dynamic = "force-dynamic";

export default async function WorkflowImpactPage({
  params,
}: {
  params: Promise<{ workflowId: string }>;
}) {
  const { workflowId } = await params;
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

  const { data: workflow } = await supabaseAdmin
    .from("dante_workflows")
    .select("id, name, description")
    .eq("id", workflowId)
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();

  if (!workflow) notFound();

  return <WorkflowImpactClient workflowId={workflowId} />;
}
