// app/dante/archive/page.tsx
//
// Dante · Archive — Harvey-style Vault for financial-advisor firms.
// Server shell that checks auth + workspace; the real UI (upload,
// search, list, doc detail links) lives in DanteArchiveClient.

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import DanteArchiveClient from "./DanteArchiveClient";

export const dynamic = "force-dynamic";

export default async function DanteArchivePage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: profile } = await supabase.from("profiles")
    .select("workspace_id").eq("id", user.id).maybeSingle();
  if (!profile?.workspace_id) redirect("/dashboard");

  return <DanteArchiveClient />;
}
