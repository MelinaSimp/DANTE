// app/properties/page.tsx
//
// Properties list. Currently surfaced primarily for real-estate
// workspaces — financial-advisor workspaces won't see the nav link
// from the dashboard, but the route is workspace-isolated so an FA
// who finds the URL won't see anyone else's data.

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import PropertiesClient from "./PropertiesClient";

export const dynamic = "force-dynamic";

export default async function PropertiesPage() {
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

  return <PropertiesClient />;
}
