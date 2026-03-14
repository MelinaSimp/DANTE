// app/schedule/page.tsx
import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ScheduleClient from "./ScheduleClient";

export default async function SchedulePage() {
  const supabase = await createServerSupabase();
  
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  // Get user's workspace
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.workspace_id) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-4">Schedule & Tasks</h1>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800">No workspace found. Please contact your administrator.</p>
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
        phone,
        email
      )
    `)
    .eq("workspace_id", profile.workspace_id)
    .order("scheduled_at", { ascending: true });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <a
          href="/frontend"
          className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          title="Back"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </a>
        <h1 className="text-2xl font-semibold text-white">Schedule & Tasks</h1>
      </div>
      <ScheduleClient 
        initialAppointments={appointments || []} 
        workspaceId={profile.workspace_id}
      />
    </div>
  );
}
