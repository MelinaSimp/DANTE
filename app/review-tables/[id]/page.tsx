import { redirect, notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import ReviewTableDetailClient from "./ReviewTableDetailClient";

export const dynamic = "force-dynamic";

export default async function ReviewTableDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getShellContext();
  if (!ctx) redirect("/auth");

  // Existence check still uses the per-request supabase (RLS-aware)
  // so we 404 cleanly if the user pokes at a foreign id.
  const supabase = await createServerSupabase();
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", (await supabase.auth.getUser()).data.user!.id)
    .maybeSingle();
  const { data: row } = await supabase
    .from("review_tables")
    .select("id")
    .eq("id", id)
    .eq("workspace_id", profile!.workspace_id)
    .maybeSingle();
  if (!row) notFound();

  return (
    <AppShell {...ctx}>
      <ReviewTableDetailClient tableId={id} />
    </AppShell>
  );
}
