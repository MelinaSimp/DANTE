// app/vault/[id]/page.tsx — single-item gate; data fetched client-side.

import { redirect, notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import VaultItemDetailClient from "./VaultItemDetailClient";

export const dynamic = "force-dynamic";

export default async function VaultItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getShellContext();
  if (!ctx) redirect("/auth");

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
    .from("vault_items")
    .select("id")
    .eq("id", id)
    .eq("workspace_id", profile!.workspace_id)
    .maybeSingle();
  if (!row) notFound();

  return (
    <AppShell {...ctx}>
      <VaultItemDetailClient itemId={id} />
    </AppShell>
  );
}
