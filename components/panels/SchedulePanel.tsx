"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import ScheduleClient from "@/app/schedule/ScheduleClient";

interface SchedulePanelProps {
  agentId: string;
}

export default function SchedulePanel({ agentId }: SchedulePanelProps) {
  const [appointments, setAppointments] = useState<any[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: profile } = await supabase.from("profiles").select("workspace_id").eq("id", user.id).maybeSingle();
        if (profile?.workspace_id) {
          setWorkspaceId(profile.workspace_id);
          const res = await fetch("/api/appointments");
          if (res.ok) setAppointments(await res.json() || []);
        }
      } catch {} finally {
        setLoading(false);
      }
    }
    load();
  }, [agentId]);

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Loading schedule...</div>;
  if (!workspaceId) return <div className="flex items-center justify-center h-64 text-gray-500 text-sm">No workspace found</div>;

  return (
    <div className="h-full p-4">
      <ScheduleClient initialAppointments={appointments} workspaceId={workspaceId} theme="white" />
    </div>
  );
}
