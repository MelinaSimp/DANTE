// app/dante/workflows/page.tsx
//
// Dante · Workflows — list of every workflow in the workspace with
// last-run status and a "New workflow" CTA. Detail + step editor
// lives at /dante/workflows/[workflowId].

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import DanteWorkflowsClient from "./DanteWorkflowsClient";

export const dynamic = "force-dynamic";

export default async function DanteWorkflowsPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: profile } = await supabase.from("profiles")
    .select("workspace_id").eq("id", user.id).maybeSingle();
  if (!profile?.workspace_id) redirect("/dashboard");

  return <DanteWorkflowsClient />;
}
