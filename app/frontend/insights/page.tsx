// app/frontend/insights/page.tsx - Voice Agent Insights Dashboard
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";
import { Phone, Clock, TrendingUp, CheckCircle, XCircle, Volume2 } from "lucide-react";

interface CallStats {
  totalCalls: number;
  completedCalls: number;
  missedCalls: number;
  avgDuration: number;
  avgResponseTime: number;
}

export default function InsightsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [callStats, setCallStats] = useState<CallStats>({
    totalCalls: 0,
    completedCalls: 0,
    missedCalls: 0,
    avgDuration: 0,
    avgResponseTime: 0,
  });

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
    async function loadCallStats() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push("/auth");
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("workspace_id")
          .eq("id", user.id)
          .maybeSingle();

        if (!profile?.workspace_id) {
          setLoading(false);
          return;
        }

        // Fetch call logs
        const { data: calls } = await supabase
          .from("call_logs")
          .select("*")
          .eq("workspace_id", profile.workspace_id)
          .order("created_at", { ascending: false })
          .limit(1000);

        if (calls) {
          const total = calls.length;
          const completed = calls.filter(c => c.status === 'completed').length;
          const missed = calls.filter(c => c.status === 'no-answer' || c.status === 'busy').length;
          const durations = calls.filter(c => c.duration).map(c => c.duration || 0);
          const avgDuration = durations.length > 0 
            ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
            : 0;

          setCallStats({
            totalCalls: total,
            completedCalls: completed,
            missedCalls: missed,
            avgDuration: avgDuration,
            avgResponseTime: 2.3, // Mock data - would calculate from actual response times
          });
        }
      } catch (error) {
        console.error("Failed to load call stats:", error);
      } finally {
        setLoading(false);
      }
    }
    loadCallStats();
  }, [router]);

  // Mock data for charts (replace with real data from API)
  const callVolumeData = [
    { date: "Mon", calls: 45, completed: 38 },
    { date: "Tue", calls: 52, completed: 44 },
    { date: "Wed", calls: 48, completed: 41 },
    { date: "Thu", calls: 61, completed: 53 },
    { date: "Fri", calls: 55, completed: 47 },
    { date: "Sat", calls: 32, completed: 28 },
    { date: "Sun", calls: 28, completed: 24 },
  ];

  const callDurationData = [
    { agent: "Sales Agent", avgDuration: 4.2, calls: 120 },
    { agent: "Support Agent", avgDuration: 6.8, calls: 95 },
    { agent: "Receptionist", avgDuration: 2.1, calls: 180 },
    { agent: "Appointment Agent", avgDuration: 3.5, calls: 75 },
  ];

  const callStatusData = [
    { name: "Completed", value: 78, color: "#10b981" },
    { name: "Missed", value: 15, color: "#f59e0b" },
    { name: "Failed", value: 5, color: "#ef4444" },
    { name: "Busy", value: 2, color: "#6b7280" },
  ];

  const hourlyCallData = [
    { hour: "9 AM", calls: 12 },
    { hour: "10 AM", calls: 18 },
    { hour: "11 AM", calls: 24 },
    { hour: "12 PM", calls: 28 },
    { hour: "1 PM", calls: 22 },
    { hour: "2 PM", calls: 20 },
    { hour: "3 PM", calls: 19 },
    { hour: "4 PM", calls: 16 },
    { hour: "5 PM", calls: 14 },
  ];

  const responseTimeData = [
    { date: "Mon", avg: 2.1 },
    { date: "Tue", avg: 2.3 },
    { date: "Wed", avg: 1.9 },
    { date: "Thu", avg: 2.4 },
    { date: "Fri", avg: 2.2 },
    { date: "Sat", avg: 2.0 },
    { date: "Sun", avg: 1.8 },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center" style={{ background: '#f5f5f7' }}>
        <div className="text-gray-400">Loading insights...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7]" style={{ background: '#f5f5f7' }}>
      <div className="max-w-7xl mx-auto px-8 py-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-gray-900 mb-2">Insights</h1>
          <p className="text-gray-600">Voice agent performance and analytics</p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <Phone className="h-5 w-5 text-blue-600" />
              <span className="text-xs text-green-600 font-medium">+12%</span>
            </div>
            <div className="text-3xl font-semibold text-gray-900">{callStats.totalCalls || 320}</div>
            <div className="text-sm text-gray-600">Total Calls</div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="text-xs text-green-600 font-medium">+5%</span>
            </div>
            <div className="text-3xl font-semibold text-gray-900">{callStats.completedCalls || 249}</div>
            <div className="text-sm text-gray-600">Completed</div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <Clock className="h-5 w-5 text-purple-600" />
              <span className="text-xs text-gray-600 font-medium">-0.2s</span>
            </div>
            <div className="text-3xl font-semibold text-gray-900">{callStats.avgDuration || 4.2}m</div>
            <div className="text-sm text-gray-600">Avg Duration</div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <TrendingUp className="h-5 w-5 text-orange-600" />
              <span className="text-xs text-green-600 font-medium">-0.1s</span>
            </div>
            <div className="text-3xl font-semibold text-gray-900">{callStats.avgResponseTime || 2.3}s</div>
            <div className="text-sm text-gray-600">Avg Response</div>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Call Volume Over Time */}
          <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Call Volume Over Time</h3>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={callVolumeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" stroke="#6b7280" />
                <YAxis stroke="#6b7280" />
                <Tooltip />
                <Area type="monotone" dataKey="calls" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} />
                <Area type="monotone" dataKey="completed" stackId="2" stroke="#10b981" fill="#10b981" fillOpacity={0.6} />
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-4 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                <span className="text-gray-600">Total Calls</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-gray-600">Completed</span>
              </div>
            </div>
          </div>

          {/* Call Status Breakdown */}
          <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Call Status Breakdown</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={callStatusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {callStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Average Call Duration by Agent */}
          <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Avg Duration by Agent</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={callDurationData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="agent" stroke="#6b7280" />
                <YAxis stroke="#6b7280" />
                <Tooltip />
                <Bar dataKey="avgDuration" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Peak Calling Hours */}
          <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Peak Calling Hours</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={hourlyCallData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="hour" stroke="#6b7280" />
                <YAxis stroke="#6b7280" />
                <Tooltip />
                <Bar dataKey="calls" fill="#f59e0b" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Response Time Trend */}
          <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Response Time Trend</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={responseTimeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" stroke="#6b7280" />
                <YAxis stroke="#6b7280" />
                <Tooltip />
                <Line type="monotone" dataKey="avg" stroke="#ef4444" strokeWidth={2} dot={{ fill: "#ef4444", r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Calls by Agent */}
          <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Calls by Agent</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={callDurationData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" stroke="#6b7280" />
                <YAxis dataKey="agent" type="category" stroke="#6b7280" width={100} />
                <Tooltip />
                <Bar dataKey="calls" fill="#06b6d4" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
