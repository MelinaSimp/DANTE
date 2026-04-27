// app/properties/[id]/page.tsx
//
// Single-property detail. Auth gate only — all data is fetched
// client-side from /api/properties/[id] so the workspace-isolation
// logic stays in one place.

import { redirect, notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import PropertyDetailClient from "./PropertyDetailClient";

export const dynamic = "force-dynamic";

export default async function PropertyDetailPage({
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

  // Existence check on the server so a wrong/foreign id 404s without
  // flashing the empty client shell first.
  const { data: row } = await supabase
    .from("properties")
    .select("id")
    .eq("id", id)
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();
  if (!row) notFound();

  return <PropertyDetailClient propertyId={id} />;
}
