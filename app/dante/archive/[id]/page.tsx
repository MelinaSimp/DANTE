// app/dante/archive/[id]/page.tsx
//
// Archive document detail — server shell. Auth gate + workspace
// check only; real UI is in DanteDocDetailClient, which pulls the
// document, chunks, and a signed URL via /api/dante/archive/[id].

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { resolveArchiveAccess } from "@/lib/dante/archive/guard";
import DanteDocDetailClient from "./DanteDocDetailClient";

export const dynamic = "force-dynamic";

export default async function Page(
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const access = await resolveArchiveAccess(supabase);
  if (access.reason === "unauthenticated") redirect("/auth");
  if (access.reason === "no_workspace") redirect("/home");
  // Owner-only — see the main archive page for the rationale.
  if (!access.allowed) redirect("/dante");

  return <DanteDocDetailClient documentId={id} />;
}
