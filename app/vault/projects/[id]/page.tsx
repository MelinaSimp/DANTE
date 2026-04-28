// app/vault/projects/[id]/page.tsx — single project detail. The
// special id 'loose' is intercepted client-side to show items with
// no project_id; otherwise we fetch the project + its items.

import { redirect, notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import ProjectDetailClient from "./ProjectDetailClient";

export const dynamic = "force-dynamic";

export default async function VaultProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getShellContext();
  if (!ctx) redirect("/auth");

  if (id === "loose") {
    return (
      <AppShell {...ctx}>
        <ProjectDetailClient projectId="loose" />
      </AppShell>
    );
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user!.id)
    .maybeSingle();
  const { data: row } = await supabase
    .from("vault_projects")
    .select("id")
    .eq("id", id)
    .eq("workspace_id", profile!.workspace_id)
    .maybeSingle();
  if (!row) notFound();

  return (
    <AppShell {...ctx}>
      <ProjectDetailClient projectId={id} />
    </AppShell>
  );
}
