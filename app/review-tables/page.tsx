// app/review-tables/page.tsx — auth gate; data fetched client-side.

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import ReviewTablesListClient from "./ReviewTablesListClient";

export const dynamic = "force-dynamic";

export default async function ReviewTablesPage() {
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
  return <ReviewTablesListClient />;
}
