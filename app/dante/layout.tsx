// /dante is feature-gated. A workspace without the `dante` entitlement
// gets bounced to /dashboard (with ?gated=dante so the dashboard can
// surface a "not part of your plan" nudge later). This check runs once
// per request thanks to the layout; children can assume access.

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireFeature } from "@/lib/features/server";

export const dynamic = "force-dynamic";

export default async function DanteLayout({ children }: { children: React.ReactNode }) {
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

  await requireFeature(profile.workspace_id, "dante");

  return <>{children}</>;
}
