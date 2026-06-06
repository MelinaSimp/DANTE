// app/calendar/page.tsx
//
// Unified calendar. Collapses the old /appointments (simple list) and
// /schedule (day-grid with AI slot-suggestion) into one route with the
// richer ScheduleClient. Old routes 301 here.

import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import ScheduleClient from "../schedule/ScheduleClient";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const ctx = await getShellContext();
  if (!ctx) redirect("/auth");

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user!.id)
    .maybeSingle();

  if (!profile?.workspace_id) {
    return (
      <AppShell {...ctx}>
        <div className="bg-[var(--canvas)] min-h-screen text-[var(--ink)]">
          <div className="max-w-4xl mx-auto px-6 py-10">
            <h1 className="heading-display text-4xl text-[var(--ink)] mb-4">Calendar</h1>
            <div className="card-flat p-4 border-[var(--flag)] bg-[var(--flag-soft)]">
              <p className="text-[var(--ink)] text-sm">
                No workspace found. Please contact your administrator.
              </p>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  const { data: appointments } = await supabase
    .from("appointments")
    .select(
      `
      id,
      scheduled_at,
      duration_minutes,
      service_type,
      status,
      notes,
      caller_name,
      caller_phone,
      contacts (
        id,
        name,
        phone,
        email
      )
    `
    )
    .eq("workspace_id", profile.workspace_id)
    .order("scheduled_at", { ascending: true });

  return (
    <AppShell {...ctx}>
      <div className="bg-[var(--canvas)] min-h-screen text-[var(--ink)]">
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-10">
          <div className="mb-8">
            <div className="label-section mb-2">Workspace</div>
            <h1 className="heading-display text-4xl md:text-5xl text-[var(--ink)]">Calendar</h1>
            <p className="prose-body text-[var(--ink-muted)] mt-2">
              Appointments, meetings, and tasks on a single timeline.
            </p>
          </div>
          <ScheduleClient
            initialAppointments={(appointments as any[]) || []}
            workspaceId={profile.workspace_id}
          />
        </div>
      </div>
    </AppShell>
  );
}
