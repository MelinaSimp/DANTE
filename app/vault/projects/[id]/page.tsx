// app/vault/projects/[id]/page.tsx — single project detail. The
// special id 'loose' is intercepted client-side to show items with
// no project_id; otherwise we fetch the project + its items.

import { redirect, notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import ProjectDetailClient from "./ProjectDetailClient";

export const dynamic = "force-dynamic";

export default async function VaultProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  // 'loose' is a virtual project — items with project_id=null. No
  // server-side existence check; client renders directly.
  if (id === "loose") {
    return <ProjectDetailClient projectId="loose" />;
  }

  const { data: row } = await supabase
    .from("vault_projects")
    .select("id")
    .eq("id", id)
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();
  if (!row) notFound();

  return <ProjectDetailClient projectId={id} />;
}
