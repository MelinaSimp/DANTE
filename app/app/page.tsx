// app/app/page.tsx
export const dynamic = "force-dynamic";

import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AppPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If user is not signed in, redirect to auth
  if (!user) {
    redirect("/auth");
  }

  // Redirect to agents page
  redirect("/agents");
}

