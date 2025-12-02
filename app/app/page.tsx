// app/app/page.tsx
export const dynamic = "force-dynamic";

import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import GigaAIClient from "../gigaai/GigaAIClient";
import { ThemeProvider } from "../gigaai/ThemeProvider";

export default async function AppPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If user is not signed in, redirect to auth
  if (!user) {
    redirect("/auth");
  }

  // Show Drift interface with theme provider
  return (
    <ThemeProvider>
      <GigaAIClient />
    </ThemeProvider>
  );
}

