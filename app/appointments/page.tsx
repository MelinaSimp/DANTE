// app/appointments/page.tsx
import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AppointmentsClient from "./AppointmentsClient";

export default async function AppointmentsPage() {
  const supabase = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  // Get user's workspace
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("Profile error:", profileError);
    return (
      <div className="bg-[var(--canvas)] min-h-screen text-[var(--ink)]">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <h1 className="heading-display text-4xl text-[var(--ink)] mb-6">Appointments</h1>
          <div className="card-flat p-5 border-[var(--danger)] bg-[var(--danger-soft)]">
            <p className="text-[var(--danger)] text-sm">Error loading profile: {profileError.message}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!profile?.workspace_id) {
    return (
      <div className="bg-[var(--canvas)] min-h-screen text-[var(--ink)]">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <h1 className="heading-display text-4xl text-[var(--ink)] mb-6">Appointments</h1>
          <div className="card-flat p-5 border-[var(--flag)] bg-[var(--flag-soft)]">
            <p className="text-[var(--ink)] text-sm">No workspace found. Please contact your administrator.</p>
            <p className="mono text-sm text-[var(--ink-muted)] mt-2">Profile data: {JSON.stringify(profile)}</p>
          </div>
        </div>
      </div>
    );
  }

  // Get appointments for this workspace
  const { data: appointments } = await supabase
    .from("appointments")
    .select(`
      id,
      scheduled_at,
      duration_minutes,
      service_type,
      status,
      notes,
      contacts (
        id,
        name,
        phone
      )
    `)
    .eq("workspace_id", profile.workspace_id)
    .order("scheduled_at", { ascending: true });

  return (
    <div className="bg-[var(--canvas)] min-h-screen text-[var(--ink)]">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="heading-display text-4xl text-[var(--ink)] mb-6">Appointments</h1>
        <AppointmentsClient
          initialAppointments={appointments || []}
          workspaceId={profile.workspace_id}
        />
      </div>
    </div>
  );
}
