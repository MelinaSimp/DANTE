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
    redirect("/select");
  }
  
  // If user is NOT signed in, redirect to auth page
  redirect("/auth");
}
