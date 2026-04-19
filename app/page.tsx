// app/page.tsx
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createServerSupabase();
  
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    // Advisor hub: dashboard-first. /select (orbital hub) is still
    // reachable if anyone links to it but is no longer the default
    // landing for authenticated users.
    redirect("/dashboard");
  }
  
  // If user is NOT signed in, redirect to auth page
  redirect("/auth");
}
