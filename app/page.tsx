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
  
  // If user is NOT signed in, show marketing page
  return (
    <main className="min-h-screen minimal-bg" style={{ background: '#ffffff', color: '#1f2937' }}>
      <header className="mx-auto max-w-6xl px-4 pt-16 text-center">
        <h1 className="mt-8 text-4xl md:text-5xl font-bold text-gray-900">
          AI Receptionist for Service Companies
        </h1>
        <p className="mt-4 text-lg md:text-xl text-gray-600 max-w-3xl mx-auto">
          Never miss another call. Our AI receptionist answers calls, captures caller details, 
          schedules appointments, and manages your customer interactions 24/7.
        </p>

        <div className="mt-8 flex items-center justify-center gap-4">
          <a
            href="/auth"
            className="btn-primary px-6 py-3 text-base font-semibold rounded-lg"
          >
            Start Free Trial
          </a>
          <a
            href="/compiled"
            className="btn-secondary px-6 py-3 text-base font-semibold rounded-lg"
          >
            See How It Works
          </a>
        </div>
      </header>
    </main>
  );
}
