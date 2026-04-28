// app/properties/[id]/page.tsx
//
// Single-property detail. Auth gate + 404 guard, then renders the
// client surface inside the persistent AppShell.

import { redirect, notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import PropertyDetailClient from "./PropertyDetailClient";

export const dynamic = "force-dynamic";

export default async function PropertyDetailPage({
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
    .from("properties")
    .select("id")
    .eq("id", id)
    .eq("workspace_id", profile!.workspace_id)
    .maybeSingle();
  if (!row) notFound();

  return (
    <AppShell {...ctx}>
      <PropertyDetailClient propertyId={id} />
    </AppShell>
  );
}
