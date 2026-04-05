import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasSuperadminAccess } from "@/lib/superadmin";
import AdminOrbClient from "./AdminOrbClient";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/auth");

  const { data: me } = await supabase
    .from("profiles")
    .select("id, is_superadmin, full_name")
    .eq("id", auth.user.id)
    .maybeSingle();

  const isAdmin = hasSuperadminAccess(auth.user.email, me?.is_superadmin);
  if (!isAdmin) redirect("/home");

  return <AdminOrbClient userName={me?.full_name || auth.user.email || undefined} />;
}
