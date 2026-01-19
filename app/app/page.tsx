// app/app/page.tsx
// This is the "Backend" interface for managing agents (GigaAI Client)
// Users can access this from the /select page by clicking "Backend"
export const dynamic = "force-dynamic";

import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import GigaAIClient from "../gigaai/GigaAIClient";
import { ThemeProvider } from "../gigaai/ThemeProvider";

export default async function AppPage({
  searchParams,
}: {
  searchParams?: { error?: string; success?: string; message?: string };
}) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If user is not signed in, redirect to auth
  if (!user) {
    redirect("/auth");
  }

  // Check backend password authentication
  // This is a simple check - in production you might want more robust session management
  const cookieStore = await cookies();
  const backendAuth = cookieStore.get("backend_authenticated");
  
  // If not authenticated, redirect to select page
  // Note: We'll set this cookie when password is verified
  if (!backendAuth || backendAuth.value !== "true") {
    redirect("/select?backend=required");
  }

  // Show Drift interface with theme provider
  // This is the "Backend" interface for managing agents
  return (
    <ThemeProvider>
      <GigaAIClient 
        initialError={searchParams?.error}
        initialSuccess={searchParams?.success}
        initialMessage={searchParams?.message}
      />
    </ThemeProvider>
  );
}

