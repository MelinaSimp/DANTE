// app/page.tsx
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function Home() {
  const supabase = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/download");

  // Mirror the branching in /auth/callback so any path landing on "/"
  // (e.g. the invite-token signup that ends with redirect("/"), or a
  // user clicking the logo) respects the onboarding state.
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.workspace_id) redirect("/join");

  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("onboarded_at")
    .eq("id", profile.workspace_id)
    .maybeSingle();

  redirect(ws?.onboarded_at ? "/dashboard" : "/onboarding");
}
