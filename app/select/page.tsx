"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Monitor, Server, Shield, LogOut } from "lucide-react";
import AgentOrb from "@/components/frontend/AgentOrb";
import GLSLWaves from "@/components/ui/glsl-waves";

const DRIFT_COLORS = ["#B4A0D6", "#9B8EC4", "#C7B8E0"];

interface NavItem {
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
  requiresSuperadmin?: boolean;
}

export default function SelectPage() {
  const router = useRouter();
  const [showBackendPassword, setShowBackendPassword] = useState(false);
  const [backendPassword, setBackendPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [clickedNav, setClickedNav] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const passwordRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push("/auth"); return; }
      fetch("/api/me", { credentials: "include" })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data) return;
          if (data.is_superadmin) setIsSuperadmin(true);
          if (!data.workspace_id && !data.is_superadmin) {
            router.push("/join");
            return;
          }
          setReady(true);
        })
        .catch(() => {});
    });
  }, [router]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const main = document.querySelector("main");
    html.style.setProperty("background", "#f5f5f7", "important");
    body.style.setProperty("background", "#f5f5f7", "important");
    body.style.setProperty("color", "#111827", "important");
    if (main) (main as HTMLElement).style.setProperty("background", "#f5f5f7", "important");
    return () => {
      html.style.removeProperty("background");
      body.style.removeProperty("background");
      body.style.removeProperty("color");
      if (main) (main as HTMLElement).style.removeProperty("background");
    };
  }, []);

  useEffect(() => {
    if (!showBackendPassword) return;
    const h = (e: MouseEvent) => {
      if (passwordRef.current && !passwordRef.current.contains(e.target as Node)) {
        setShowBackendPassword(false);
        setBackendPassword("");
        setPasswordError("");
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showBackendPassword]);

  const handleBackendAccess = async () => {
    if (!backendPassword.trim()) { setPasswordError("Please enter a password"); return; }
    try {
      const r = await fetch("/api/backend/verify-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: backendPassword }),
      });
      if (r.ok) {
        const data = await r.json();
        if (data.valid) { sessionStorage.setItem("backend_authenticated", "true"); router.push("/app"); }
        else setPasswordError("Incorrect password");
      } else setPasswordError("Error verifying password");
    } catch { setPasswordError("Error verifying password"); }
  };

  const navItems: NavItem[] = [
    { name: "Frontend", description: "Interact with agents", icon: Monitor, action: () => router.push("/frontend") },
    { name: "Backend", description: "Configure agents", icon: Server, action: () => setShowBackendPassword(true) },
    { name: "Admin", description: "Manage workspace", icon: Shield, action: () => router.push("/admin"), requiresSuperadmin: true },
  ];

  const visibleItems = navItems.filter(item => !item.requiresSuperadmin || isSuperadmin);
  const count = visibleItems.length;
  const orbSize = 140;
  const orbitRadius = 130;
  const startAngle = -Math.PI / 2;

  if (!ready) {
    return <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center" style={{ background: "#f5f5f7" }}><div className="text-gray-400 text-sm">Loading...</div></div>;
  }

  return (
    <div className="relative min-h-screen bg-[#f5f5f7] flex flex-col overflow-hidden" style={{ background: "#f5f5f7" }}>
      <div className="absolute inset-0 z-0 opacity-20">
        <GLSLWaves mode="hills" speed={0.3} />
      </div>
      <div className="absolute inset-0 z-0 bg-gradient-to-t from-[#f5f5f7]/70 via-transparent to-[#f5f5f7]/40 pointer-events-none" />

      {/* Top bar */}
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

      {/* Main */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 pb-16">
        {/* Radial container */}
        <div
          className="relative"
          style={{ width: (orbitRadius + 56) * 2, height: (orbitRadius + 56) * 2 }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {/* Orbit ring */}
          <div
            className="absolute inset-0 rounded-full border border-dashed transition-all duration-500"
            style={{ borderColor: hovered ? "rgba(0,0,0,0.08)" : "transparent", margin: 56 }}
          />

          {/* Nav items */}
          {visibleItems.map((item, i) => {
            const angle = startAngle + (i / count) * Math.PI * 2;
            const cx = orbitRadius + 56;
            const cy = orbitRadius + 56;
            const x = cx + Math.cos(angle) * orbitRadius - 28;
            const y = cy + Math.sin(angle) * orbitRadius - 28;
            const Icon = item.icon;
            const isClicked = clickedNav === item.name;

            const handleClick = () => {
              if (clickedNav) return;
              if (item.name === "Backend") {
                setClickedNav(item.name);
                setTimeout(() => { setClickedNav(null); item.action(); }, 450);
              } else {
                setClickedNav(item.name);
                setTimeout(() => { setClickedNav(null); item.action(); }, 450);
              }
            };

            return (
              <button
                key={item.name}
                onClick={handleClick}
                className="absolute flex flex-col items-center gap-1.5 transition-all duration-500 group/nav"
                style={{
                  left: x, top: y, width: 56,
                  opacity: hovered ? 1 : 0,
                  transform: hovered ? (isClicked ? "scale(1.35)" : "scale(1)") : "scale(0.3)",
                  pointerEvents: hovered ? "auto" : "none",
                  zIndex: isClicked ? 50 : undefined,
                }}
              >
                <div className="relative">
                  {isClicked && (
                    <>
                      <div className="absolute inset-0 rounded-2xl bg-black/10 animate-ping" />
                      <div className="absolute -inset-3 rounded-full border-2 border-gray-400/60 animate-ping" style={{ animationDuration: "0.6s" }} />
                    </>
                  )}
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 ${
                    isClicked
                      ? "bg-black text-white shadow-xl shadow-black/30 scale-110 border-2 border-black"
                      : "bg-white shadow-md border border-gray-200 group-hover/nav:shadow-lg group-hover/nav:scale-110 group-hover/nav:border-gray-300"
                  }`}>
                    <Icon className={`w-5 h-5 transition-colors ${isClicked ? "text-white" : "text-gray-600 group-hover/nav:text-black"}`} />
                  </div>
                </div>
                <span className={`text-[10px] font-medium transition-all text-center leading-tight whitespace-nowrap ${
                  isClicked ? "text-gray-900 font-bold scale-110" : "text-gray-500 group-hover/nav:text-gray-900"
                }`}>
                  {item.name}
                </span>
              </button>
            );
          })}

          {/* Center orb with Drift logo */}
          <div
            className="absolute"
            style={{ left: orbitRadius + 56 - orbSize / 2, top: orbitRadius + 56 - orbSize / 2 }}
          >
            <div className="relative inline-flex items-center justify-center" style={{ width: orbSize, height: orbSize }}>
              <AgentOrb
                colors={DRIFT_COLORS}
                size={orbSize}
                className="rounded-full"
                interactive
                pulsing={hovered}
              />
              {/* Logo overlay */}
              <img
                src="/brand/logo-circle.png"
                alt="Drift"
                className="absolute z-10 rounded-full object-cover select-none pointer-events-none"
                style={{
                  width: orbSize * 0.45,
                  height: orbSize * 0.45,
                  filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.3))",
                  transition: "transform 0.3s ease",
                  transform: hovered ? "scale(1.05)" : "scale(1)",
                }}
              />
            </div>
          </div>
        </div>

        {/* Info below orb */}
        <div className="text-center -mt-2">
          <h2 className="text-xl font-bold text-gray-900 mb-1">Welcome to Drift</h2>
          <p className="text-xs text-gray-400">Hover over the orb to get started</p>
        </div>

        {/* Backend password popover */}
        {showBackendPassword && (
          <div ref={passwordRef} className="mt-6 bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 w-80" style={{ animation: "panelSlideUp 0.2s ease-out" }}>
            <style>{`@keyframes panelSlideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
            <label className="block text-sm font-medium text-gray-900 mb-2">Backend Password</label>
            <input
              type="password"
              value={backendPassword}
              onChange={e => { setBackendPassword(e.target.value); setPasswordError(""); }}
              onKeyDown={e => { if (e.key === "Enter") handleBackendAccess(); }}
              placeholder="Enter password"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-gray-300"
              autoFocus
            />
            {passwordError && <p className="text-xs text-red-500 mt-2">{passwordError}</p>}
            <button onClick={handleBackendAccess} className="w-full mt-3 px-4 py-2.5 rounded-xl bg-black text-white text-sm font-medium hover:bg-gray-800 transition">
              Access Backend
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
