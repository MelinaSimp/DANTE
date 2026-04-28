import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import NewReviewTableClient from "./NewReviewTableClient";

export const dynamic = "force-dynamic";

export default async function NewReviewTablePage() {
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
  return <NewReviewTableClient />;
}
