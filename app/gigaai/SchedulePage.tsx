"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import ScheduleClient from "../schedule/ScheduleClient";
import { useTheme } from "./ThemeProvider";

export default function SchedulePage() {
  const { colors } = useTheme();
  const router = useRouter();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSchedule() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
          if (!user) {
            router.push("/auth");
            return;
          }

          // Get workspace
          const { data: profile } = await supabase
            .from("profiles")
            .select("workspace_id")
            .eq("id", user.id)
            .maybeSingle();

          if (profile?.workspace_id) {
            setWorkspaceId(profile.workspace_id);
            
            // Get appointments
            const { data: appointmentsData } = await supabase
              .from("appointments")
              .select(`
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
              `)
              .eq("workspace_id", profile.workspace_id)
              .order("scheduled_at", { ascending: true });

            setAppointments(appointmentsData || []);
          }
      } catch (error) {
        console.error("Failed to load schedule:", error);
      } finally {
        setLoading(false);
      }
    }
    loadSchedule();
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className={colors.textTertiary}>Loading schedule...</div>
        </div>
      </div>
    );
  }

  if (!workspaceId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className={colors.textTertiary}>No workspace found</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: '#000000' }}>
      <ScheduleClient 
        initialAppointments={appointments} 
        workspaceId={workspaceId}
      />
    </div>
  );
}

