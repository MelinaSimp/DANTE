// app/app/page.tsx
// Backend interface with radial orb navigation
export const dynamic = "force-dynamic";

import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasSuperadminAccess } from "@/lib/superadmin";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import BackendOrbClient from "./BackendOrbClient";

export default async function AppPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("workspace_id, is_superadmin")
    .eq("id", user.id)
    .maybeSingle();

  const isSuperadmin = hasSuperadminAccess(user.email, profile?.is_superadmin);

  if (!profile?.workspace_id && !isSuperadmin) {
    redirect("/join");
  }

  const cookieStore = await cookies();
  const backendAuth = cookieStore.get("backend_authenticated");

  if (!backendAuth || backendAuth.value !== "true") {
    redirect("/select?backend=required");
  }

  return <BackendOrbClient />;
}
