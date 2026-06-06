// app/dante/settings/secrets/page.tsx
//
// Dante · Settings · Secrets — workspace-scoped vault for API keys
// and other credentials that workflow steps need. Server shell only
// guards auth + workspace; the UI is a client component that talks
// to /api/dante/secrets.

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import DanteSecretsClient from "./DanteSecretsClient";

export const dynamic = "force-dynamic";

export default async function DanteSecretsPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: profile } = await supabase.from("profiles")
    .select("workspace_id").eq("id", user.id).maybeSingle();
  if (!profile?.workspace_id) redirect("/home");

  return <DanteSecretsClient />;
}
