// app/vault/page.tsx
//
// Vault — workspace-scoped store of templates and documents. Auth
// gate only; data fetched client-side from /api/vault.

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import VaultClient from "./VaultClient";

export const dynamic = "force-dynamic";

export default async function VaultPage() {
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

  return <VaultClient />;
}
