// app/dante/churn/page.tsx
//
// Dante · Churn — the ranked at-risk client dashboard. Server shell
// gates auth and hands off to the client component, which is where
// the live "recompute" button and signal drill-down live.

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import DanteChurnClient from "./DanteChurnClient";

export const dynamic = "force-dynamic";

export default async function DanteChurnPage() {
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

  return <DanteChurnClient />;
}
