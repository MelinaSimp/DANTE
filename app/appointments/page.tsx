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
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-4">Appointments</h1>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Error loading profile: {profileError.message}</p>
        </div>
      </div>
    );
  }

  if (!profile?.workspace_id) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-4">Appointments</h1>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800">No workspace found. Please contact your administrator.</p>
          <p className="text-sm text-yellow-600 mt-2">Profile data: {JSON.stringify(profile)}</p>
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
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="mb-6 text-3xl font-semibold text-white">Appointments</h1>
      <AppointmentsClient 
        initialAppointments={appointments || []} 
        workspaceId={profile.workspace_id}
      />
    </div>
  );
}
