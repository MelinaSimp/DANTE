import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import SiteScanClient from "./SiteScanClient";

export default async function SiteScanPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  return <SiteScanClient />;
}
