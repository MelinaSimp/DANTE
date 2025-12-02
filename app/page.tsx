// app/page.tsx
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createServerSupabase();
  
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If user is signed in, check if they're a superadmin or owner
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_superadmin, role")
      .eq("id", user.id)
      .maybeSingle();

    // If superadmin or owner, redirect to admin page
    if (profile?.is_superadmin || profile?.role?.toLowerCase() === "owner") {
      redirect("/admin");
    } else {
      // Regular user, redirect to the personalized home hub
      redirect("/home");
    }
  }
  
  // If user is NOT signed in, redirect to auth page
  redirect("/auth");
}
