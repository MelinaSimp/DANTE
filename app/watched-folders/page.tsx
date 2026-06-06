import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import WatchedFoldersClient from "./WatchedFoldersClient";

export const dynamic = "force-dynamic";

export default async function WatchedFoldersPage() {
  const ctx = await getShellContext();
  if (!ctx) redirect("/auth");

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
  if (!profile?.workspace_id) redirect("/home");

  return (
    <AppShell {...ctx}>
      <WatchedFoldersClient />
    </AppShell>
  );
}
