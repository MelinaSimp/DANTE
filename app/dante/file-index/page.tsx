import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import FileIndexClient from "./FileIndexClient";

export const dynamic = "force-dynamic";

export default async function FileIndexPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) redirect("/home");

  return <FileIndexClient />;
}
