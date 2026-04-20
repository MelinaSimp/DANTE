// app/dante/archive/[id]/page.tsx
//
// Archive document detail — server shell. Auth gate + workspace
// check only; real UI is in DanteDocDetailClient, which pulls the
// document, chunks, and a signed URL via /api/dante/archive/[id].

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import DanteDocDetailClient from "./DanteDocDetailClient";

export const dynamic = "force-dynamic";

export default async function Page(
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: profile } = await supabase.from("profiles")
    .select("workspace_id").eq("id", user.id).maybeSingle();
  if (!profile?.workspace_id) redirect("/dashboard");

  return <DanteDocDetailClient documentId={id} />;
}
