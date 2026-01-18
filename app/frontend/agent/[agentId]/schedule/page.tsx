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
    // Override global dark theme styles for Apple-style light theme
    const html = document.documentElement;
    const body = document.body;
    const main = document.querySelector('main');
    
    const originalHtmlBg = html.style.background;
    const originalBodyBg = body.style.background;
    const originalBodyColor = body.style.color;
    const originalMainBg = main ? (main as HTMLElement).style.background : null;
    
    html.style.setProperty('background', '#f5f5f7', 'important');
    body.style.setProperty('background', '#f5f5f7', 'important');
    body.style.setProperty('color', '#111827', 'important');
    if (main) {
      (main as HTMLElement).style.setProperty('background', '#f5f5f7', 'important');
    }

    return () => {
      html.style.setProperty('background', originalHtmlBg, 'important');
      body.style.setProperty('background', originalBodyBg, 'important');
      body.style.setProperty('color', originalBodyColor, 'important');
      if (main && originalMainBg !== null) {
        (main as HTMLElement).style.setProperty('background', originalMainBg, 'important');
      }
    };
  }, []);

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
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center" style={{ background: '#f5f5f7' }}>
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!workspaceId) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center" style={{ background: '#f5f5f7' }}>
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-gray-900 mb-4">No workspace found</h1>
          <button
            onClick={() => router.push("/frontend")}
            className="px-6 py-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7]" style={{ background: '#f5f5f7' }}>
      <div className="max-w-7xl mx-auto px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push(`/frontend/agent/${agentId}`)}
            className="text-gray-600 hover:text-gray-900 mb-6 transition-colors text-sm font-medium flex items-center gap-2"
          >
            ← Back
          </button>
          <h1 className="text-3xl font-semibold text-gray-900 mb-2">Schedule</h1>
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
