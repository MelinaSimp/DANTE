// app/frontend/agent/[agentId]/schedule/page.tsx - Schedule Page
"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import ScheduleClient from "@/app/schedule/ScheduleClient";

export default function SchedulePage() {
  const router = useRouter();
  const params = useParams();
  const agentId = params.agentId as string;
  const [appointments, setAppointments] = useState<any[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
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
          const response = await fetch("/api/appointments");
          if (response.ok) {
            const data = await response.json();
            setAppointments(data || []);
          }
        }
      } catch (error) {
        console.error("Failed to load data:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!workspaceId) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-light text-black mb-4">No workspace found</h1>
          <button
            onClick={() => router.push("/frontend")}
            className="px-6 py-3 rounded-2xl bg-black text-white hover:bg-gray-800 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-12">
          <button
            onClick={() => router.push(`/frontend/agent/${agentId}`)}
            className="text-gray-400 hover:text-black mb-6 transition-colors text-lg"
          >
            ← Back
          </button>
          <h1 className="text-5xl font-light text-black mb-8">Schedule</h1>
        </div>

        {/* Schedule Client */}
        <ScheduleClient 
          initialAppointments={appointments} 
          workspaceId={workspaceId}
          theme="white"
        />
      </div>
    </div>
  );
}
