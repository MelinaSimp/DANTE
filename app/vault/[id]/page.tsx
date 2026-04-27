// app/vault/[id]/page.tsx — single-item gate; data fetched client-side.

import { redirect, notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import VaultItemDetailClient from "./VaultItemDetailClient";

export const dynamic = "force-dynamic";

export default async function VaultItemPage({
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

  const { data: row } = await supabase
    .from("vault_items")
    .select("id")
    .eq("id", id)
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();
  if (!row) notFound();

  return <VaultItemDetailClient itemId={id} />;
}
