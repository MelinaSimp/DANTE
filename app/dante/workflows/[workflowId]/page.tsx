// app/dante/workflows/[workflowId]/page.tsx
//
// Server shell for the workflow editor. Client does all the heavy
// lifting (step editing, run trigger, run history polling).

import { redirect, notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import WorkflowEditorClient from "./WorkflowEditorClient";

export const dynamic = "force-dynamic";

export default async function WorkflowEditorPage({
  params,
}: {
  params: Promise<{ workflowId: string }>;
}) {
  const { workflowId } = await params;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id").eq("id", user.id).maybeSingle();
  if (!profile?.workspace_id) redirect("/home");

  const { data: workflow } = await supabaseAdmin
    .from("dante_workflows")
    .select("*")
    .eq("id", workflowId)
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();

  if (!workflow) notFound();

  return <WorkflowEditorClient workflow={workflow} />;
}
