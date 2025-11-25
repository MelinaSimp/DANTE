// app/page.tsx
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import Image from "next/image";
import Link from "next/link";

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
        <Image
          src="/brand/logo.png"
          alt="Drift AI Receptionist"
          width={180}
          height={180}
          className="mx-auto h-32 w-auto"
          priority
        />
        <h1 className="mt-8 text-4xl md:text-5xl font-bold text-gray-900">
          AI Receptionist for Service Companies
        </h1>
        <p className="mt-4 text-lg md:text-xl text-gray-600 max-w-3xl mx-auto">
          Never miss another call. Our AI receptionist answers calls, captures caller details, 
          schedules appointments, and manages your customer interactions 24/7.
        </p>

        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/auth"
            className="btn-primary px-6 py-3 text-base font-semibold rounded-lg"
          >
            Start Free Trial
          </Link>
          <Link
            href="/compiled"
            className="btn-secondary px-6 py-3 text-base font-semibold rounded-lg"
          >
            See How It Works
          </Link>
        </div>
      </header>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 pb-20 pt-16">
        <div className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
            Everything you need to manage calls
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Our AI receptionist handles your calls professionally while you focus on your business.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Call Management */}
          <div className="card group p-6 flex flex-col items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 text-white">
              <Image src="/icons/phone.png" alt="" width={32} height={32} className="" />
            </div>
            <div>
              <h3 className="text-gray-900 font-semibold text-lg mb-2">Call Management</h3>
              <p className="text-gray-600 text-sm">
                View all incoming calls and caller details.
              </p>
            </div>
          </div>

          {/* Contact Insights */}
          <div className="card group p-6 flex flex-col items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 text-white">
              <Image src="/icons/brain.png" alt="" width={32} height={32} className="" />
            </div>
            <div>
              <h3 className="text-gray-900 font-semibold text-lg mb-2">Contact Insights</h3>
              <p className="text-gray-600 text-sm">
                AI-powered customer interaction analysis.
              </p>
            </div>
          </div>

          {/* Appointments */}
          <div className="card group p-6 flex flex-col items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 text-white">
              <Image src="/icons/calendar.png" alt="" width={32} height={32} className="" />
            </div>
            <div>
              <h3 className="text-gray-900 font-semibold text-lg mb-2">Appointments</h3>
              <p className="text-gray-600 text-sm">
                AI-scheduled appointments and bookings.
              </p>
            </div>
          </div>

          {/* Schedule & Tasks */}
          <div className="card group p-6 flex flex-col items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 text-white">
              <Image src="/icons/clock.png" alt="" width={32} height={32} className="" />
            </div>
            <div>
              <h3 className="text-gray-900 font-semibold text-lg mb-2">Schedule & Tasks</h3>
              <p className="text-gray-600 text-sm">
                Task management and calendar overview.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
