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
      <div className="bg-[var(--canvas)] min-h-screen text-[var(--ink)]">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <h1 className="heading-display text-4xl text-[var(--ink)] mb-4">Schedule & Tasks</h1>
          <div className="card-flat p-4 border-[var(--flag)] bg-[var(--flag-soft)]">
            <p className="text-[var(--ink)]">No workspace found. Please contact your administrator.</p>
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
        phone,
        email
      )
    `)
    .eq("workspace_id", profile.workspace_id)
    .order("scheduled_at", { ascending: true });

  return (
    <div className="bg-[var(--canvas)] min-h-screen text-[var(--ink)]">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <a
            href="/frontend"
            className="p-2 rounded-[6px] hover:bg-[var(--canvas-subtle)] transition-colors"
            title="Back"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[var(--ink-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </a>
          <h1 className="heading-display text-4xl text-[var(--ink)]">Schedule & Tasks</h1>
        </div>
        <ScheduleClient
          initialAppointments={(appointments as any[]) || []}
          workspaceId={profile.workspace_id}
        />
      </div>
    </div>
  );
}
