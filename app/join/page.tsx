"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { KeyRound, ArrowRight, Loader2, LogOut } from "lucide-react";
import AgentOrb from "@/components/frontend/AgentOrb";
import GLSLWaves from "@/components/ui/glsl-waves";

const DRIFT_COLORS = ["#B4A0D6", "#9B8EC4", "#C7B8E0"];

export default function JoinPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push("/auth");
    });
  }, [router]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.style.setProperty("background", "#f5f5f7", "important");
    body.style.setProperty("background", "#f5f5f7", "important");
    body.style.setProperty("color", "#111827", "important");
    return () => {
      html.style.removeProperty("background");
      body.style.removeProperty("background");
      body.style.removeProperty("color");
    };
  }, []);

  const handleJoin = async () => {
    if (!code.trim()) { setError("Please enter an invite code"); return; }
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/workspace/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await r.json();
      if (r.ok && data.success) {
        setSuccess(data.workspace_name || "Workspace");
        setTimeout(() => router.push("/select"), 1500);
      } else {
        setError(data.error || "Invalid invite code");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#f5f5f7] flex flex-col overflow-hidden" style={{ background: "#f5f5f7" }}>
      <div className="absolute inset-0 z-0 opacity-20">
        <GLSLWaves mode="hills" speed={0.3} />
      </div>
      <div className="absolute inset-0 z-0 bg-gradient-to-t from-[#f5f5f7]/70 via-transparent to-[#f5f5f7]/40 pointer-events-none" />

      <div className="relative z-10 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <img src="/brand/logo-circle.png" alt="Drift" className="w-6 h-6 rounded-full object-cover" />
          <span className="text-sm font-semibold text-gray-900">Drift</span>
        </div>
        <button
          onClick={async () => { await supabase.auth.signOut(); router.push("/auth"); }}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 pb-16">
        <div className="relative inline-flex items-center justify-center mb-8" style={{ width: 120, height: 120 }}>
          <AgentOrb colors={DRIFT_COLORS} size={120} className="rounded-full" interactive pulsing={!!success} />
          <img
            src="/brand/logo-circle.png"
            alt="Drift"
            className="absolute z-10 rounded-full object-cover select-none pointer-events-none"
            style={{ width: 54, height: 54, filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.3))" }}
          />
        </div>

        <h2 className="text-2xl font-bold text-gray-900 mb-2">Join a Workspace</h2>
        <p className="text-sm text-gray-400 mb-8 text-center max-w-xs">
          Enter the invite code provided by your admin to join their workspace.
        </p>

        {success ? (
          <div className="bg-green-50 border border-green-200 rounded-2xl px-6 py-4 text-center" style={{ animation: "panelSlideUp 0.2s ease-out" }}>
            <p className="text-sm font-medium text-green-700">Joined {success}!</p>
            <p className="text-xs text-green-500 mt-1">Redirecting...</p>
          </div>
        ) : (
          <div className="w-full max-w-sm" style={{ animation: "panelSlideUp 0.2s ease-out" }}>
            <style>{`@keyframes panelSlideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6">
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                <input
                  type="text"
                  value={code}
                  onChange={e => { setCode(e.target.value.toUpperCase()); setError(""); }}
                  onKeyDown={e => { if (e.key === "Enter") handleJoin(); }}
                  placeholder="DRIFT-XXXXXX"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-gray-300 placeholder:text-gray-300"
                  autoFocus
                />
              </div>
              {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
              <button
                onClick={handleJoin}
                disabled={loading}
                className="w-full mt-4 px-4 py-3 rounded-xl bg-black text-white text-sm font-medium hover:bg-gray-800 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><span>Join Workspace</span><ArrowRight className="h-4 w-4" /></>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
