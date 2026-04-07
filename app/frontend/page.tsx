// app/frontend/page.tsx - Frontend Agent Page with Radial Orb Navigation + Panel Overlay
"use client";

import { useEffect, useState, useRef, useCallback, lazy, Suspense } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useFeatures } from "@/hooks/useFeatures";
import type { FeatureId } from "@/lib/features";
import Link from "next/link";
import { Bot, Calendar, FileText, CalendarClock, ArrowLeft, Phone, Palette, Mail, Inbox, Settings, Shield } from "lucide-react";
import AgentOrb from "@/components/frontend/AgentOrb";
import PanelShell from "@/components/panels/PanelShell";
import GLSLWaves from "@/components/ui/glsl-waves";

const SchedulePanel = lazy(() => import("@/components/panels/SchedulePanel"));
const InboxPanel = lazy(() => import("@/components/panels/InboxPanel"));
const SalesPanel = lazy(() => import("@/components/panels/SalesPanel"));
const EmailPanel = lazy(() => import("@/components/panels/EmailPanel"));
const PlannerPanel = lazy(() => import("@/components/panels/PlannerPanel"));
const ClientsPanel = lazy(() => import("@/components/panels/ClientsPanel"));

interface Agent {
  id: string;
  name: string;
  description?: string;
  gradient_color?: string;
  status: string;
}

type PanelId = "calendar" | "clients" | "planner" | "sales" | "email" | "inbox";

const PANEL_TITLES: Record<PanelId, string> = {
  calendar: "Schedule",
  clients: "Clients",
  planner: "Meeting Planner",
  sales: "Sales",
  email: "Email",
  inbox: "Inbox",
};

const WIDE_PANELS: PanelId[] = ["planner", "email", "sales"];

const GRADIENT_PRESETS: string[][] = [
  ["#FF6B6B", "#4ECDC4", "#45B7D1"],
  ["#A8E6CF", "#FFD93D", "#FF6B9D"],
  ["#C471ED", "#F64F59", "#FBD786"],
  ["#30E8BF", "#FF8235", "#FF6E7F"],
  ["#667EEA", "#764BA2", "#F093FB"],
  ["#F093FB", "#F5576C", "#4FACFE"],
  ["#43E97B", "#38F9D7", "#667EEA"],
  ["#FA709A", "#FEE140", "#30CFC0"],
  ["#4158D0", "#C850C0", "#FFCC70"],
  ["#0093E9", "#80D0C7", "#A9E4D7"],
  ["#8EC5FC", "#E0C3FC", "#F5D5EE"],
  ["#D9AFD9", "#97D9E1", "#B8E9C2"],
];

function generateGradientColor(seed: string): string {
  const index = seed.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) % GRADIENT_PRESETS.length;
  return JSON.stringify(GRADIENT_PRESETS[index]);
}

interface RadialNavItem {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  panelId: PanelId;
  featureId?: FeatureId;
}

function RadialAgentCard({
  agent,
  navItems,
  onChangeColor,
  onOpenPanel,
  savingColor,
}: {
  agent: Agent;
  navItems: RadialNavItem[];
  onChangeColor: (agentId: string, preset: string[]) => void;
  onOpenPanel: (panelId: PanelId) => void;
  savingColor: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [clickedNav, setClickedNav] = useState<PanelId | null>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const agentGradient = JSON.parse(agent.gradient_color || generateGradientColor(agent.id)) as string[];

  const orbSize = 160;
  const orbitRadius = 140;

  const handleNavClick = (panelId: PanelId) => {
    if (clickedNav) return;
    setClickedNav(panelId);
    setTimeout(() => {
      setClickedNav(null);
      onOpenPanel(panelId);
    }, 450);
  };

  useEffect(() => {
    if (!showColorPicker) return;
    const handler = (e: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setShowColorPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showColorPicker]);

  const count = navItems.length;
  const startAngle = -Math.PI / 2;

  return (
    <div className="flex flex-col items-center gap-6">
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

        {/* Nav items in orbit */}
        {navItems.map((item, i) => {
          const angle = startAngle + (i / count) * Math.PI * 2;
          const centerX = orbitRadius + 56;
          const centerY = orbitRadius + 56;
          const x = centerX + Math.cos(angle) * orbitRadius - 28;
          const y = centerY + Math.sin(angle) * orbitRadius - 28;
          const Icon = item.icon;
          const isClicked = clickedNav === item.panelId;

          return (
            <button
              key={item.name}
              onClick={() => handleNavClick(item.panelId)}
              className="absolute flex flex-col items-center gap-1 transition-all duration-500 group/nav"
              style={{
                left: x,
                top: y,
                width: 56,
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
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-300 ${
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

        {/* Center orb */}
        <div
          className="absolute cursor-pointer"
          style={{ left: orbitRadius + 56 - orbSize / 2, top: orbitRadius + 56 - orbSize / 2 }}
        >
          <AgentOrb
            colors={agentGradient}
            size={orbSize}
            letter={agent.name.charAt(0).toUpperCase()}
            className="rounded-full"
            interactive
            pulsing={hovered}
          />

          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowColorPicker(!showColorPicker); }}
            className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-white border-2 border-gray-200 shadow-md flex items-center justify-center text-gray-400 hover:text-gray-700 hover:border-gray-300 transition-all hover:scale-110 z-20"
          >
            <Palette className="h-3.5 w-3.5" />
          </button>

          {showColorPicker && (
            <div ref={colorPickerRef} className="absolute top-full left-1/2 -translate-x-1/2 mt-4 z-50" onClick={(e) => e.stopPropagation()}>
              <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-4 w-64">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Color Scheme</p>
                <div className="grid grid-cols-4 gap-2">
                  {GRADIENT_PRESETS.map((preset, i) => {
                    const isActive = JSON.stringify(preset) === JSON.stringify(agentGradient);
                    return (
                      <button
                        key={i}
                        type="button"
                        disabled={savingColor}
                        onClick={(e) => { e.stopPropagation(); onChangeColor(agent.id, preset); }}
                        className={`w-12 h-12 rounded-xl transition-all hover:scale-110 disabled:opacity-50 ${isActive ? "ring-2 ring-blue-500 ring-offset-2 scale-110" : "hover:ring-2 hover:ring-gray-300 hover:ring-offset-1"}`}
                        style={{ background: `linear-gradient(135deg, ${preset[0]} 0%, ${preset[1]} 50%, ${preset[2] || preset[1]} 100%)` }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Agent info */}
      <div className="text-center -mt-2">
        <h3 className="text-xl font-bold text-gray-900 mb-1">{agent.name}</h3>
        <span className={`text-xs px-3 py-1 rounded-full font-medium ${agent.status === "deployed" ? "bg-green-100 text-green-700 border border-green-200" : "bg-gray-100 text-gray-600 border border-gray-200"}`}>
          {agent.status}
        </span>
        {agent.description && <p className="text-sm text-gray-500 mt-3 max-w-xs mx-auto">{agent.description}</p>}
        <p className="text-xs text-gray-400 mt-3">Hover over the orb to navigate</p>
      </div>
    </div>
  );
}

function PanelLoader() {
  return <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Loading...</div>;
}

export default function FrontendPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingColor, setSavingColor] = useState(false);
  const [activePanel, setActivePanel] = useState<PanelId | null>(null);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const { features } = useFeatures();

  const selectedAgentId = agents.length > 0 ? agents[0].id : "";

  const handleChangeGradient = async (agentId: string, gradient: string[]) => {
    setSavingColor(true);
    try {
      const gradientJson = JSON.stringify(gradient);
      const res = await fetch(`/api/agents/${agentId}/gradient`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ gradient_color: gradientJson }),
      });
      if (res.ok) setAgents((prev) => prev.map((a) => (a.id === agentId ? { ...a, gradient_color: gradientJson } : a)));
    } catch {} finally { setSavingColor(false); }
  };

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const main = document.querySelector("main");
    const origHtml = html.style.background;
    const origBody = body.style.background;
    const origColor = body.style.color;
    const origMain = main ? (main as HTMLElement).style.background : null;
    html.style.setProperty("background", "#f5f5f7", "important");
    body.style.setProperty("background", "#f5f5f7", "important");
    body.style.setProperty("color", "#111827", "important");
    if (main) (main as HTMLElement).style.setProperty("background", "#f5f5f7", "important");
    return () => {
      html.style.setProperty("background", origHtml, "important");
      body.style.setProperty("background", origBody, "important");
      body.style.setProperty("color", origColor, "important");
      if (main && origMain !== null) (main as HTMLElement).style.setProperty("background", origMain, "important");
    };
  }, []);

  useEffect(() => {
    async function loadAgents() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push("/auth"); return; }
        const { data: profile } = await supabase.from("profiles").select("workspace_id, is_superadmin").eq("id", user.id).maybeSingle();
        setIsSuperadmin(!!profile?.is_superadmin);
        if (!profile?.workspace_id) { setLoading(false); return; }
        const response = await fetch("/api/agents");
        if (response.ok) {
          const data = await response.json();
          setAgents((data || []).map((a: any) => ({
            id: a.id, name: a.name, description: a.description,
            gradient_color: a.gradient_color || generateGradientColor(a.id),
            status: a.status,
          })));
        } else {
          setLoadError("Failed to load agents");
        }
      } catch {
        setLoadError("Failed to load agents");
      } finally {
        setLoading(false);
      }
    }
    loadAgents();
  }, [router]);

  const openPanel = useCallback((panelId: PanelId) => {
    setActivePanel(panelId);
  }, []);

  const closePanel = useCallback(() => {
    setActivePanel(null);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center" style={{ background: "#f5f5f7" }}>
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center" style={{ background: "#f5f5f7" }}>
        <div className="text-center">
          <p className="text-gray-500 mb-3">{loadError}</p>
          <button onClick={() => window.location.reload()} className="text-sm text-blue-600 hover:underline">Retry</button>
        </div>
      </div>
    );
  }

  const getNavItems = (agentId: string): RadialNavItem[] => {
    const all: RadialNavItem[] = [
      { name: "Calendar", icon: Calendar, panelId: "calendar", featureId: "calendar" },
      { name: "Clients", icon: FileText, panelId: "clients", featureId: "client_details" },
      { name: "Planner", icon: CalendarClock, panelId: "planner", featureId: "meeting_planner" },
      { name: "Sales", icon: Phone, panelId: "sales", featureId: "sales" },
      { name: "Email", icon: Mail, panelId: "email", featureId: "emailing" },
      { name: "Inbox", icon: Inbox, panelId: "inbox", featureId: "inbox" },
    ];
    return all.filter((item) => !item.featureId || features.includes(item.featureId));
  };

  const renderPanelContent = () => {
    if (!activePanel || !selectedAgentId) return null;
    switch (activePanel) {
      case "calendar": return <SchedulePanel agentId={selectedAgentId} />;
      case "inbox": return <InboxPanel agentId={selectedAgentId} />;
      case "sales": return <SalesPanel agentId={selectedAgentId} />;
      case "email": return <EmailPanel agentId={selectedAgentId} />;
      case "planner": return <PlannerPanel agentId={selectedAgentId} />;
      case "clients": return <ClientsPanel agentId={selectedAgentId} />;
      default: return null;
    }
  };

  return (
    <div className="relative min-h-screen bg-[#f5f5f7] flex flex-col overflow-hidden" style={{ background: "#f5f5f7" }}>
      <div className="absolute inset-0 z-0 opacity-60">
        <GLSLWaves mode="ocean" speed={0.4} />
      </div>
      <div className="absolute inset-0 z-0 bg-gradient-to-t from-[#f5f5f7]/80 via-transparent to-[#f5f5f7]/50 pointer-events-none" />

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-6 py-4">
        <Link href="/frontend" className="flex items-center gap-2">
          <img src="/brand/logo-circle.png" alt="Drift" className="w-6 h-6 rounded-full object-cover" />
          <span className="text-sm font-semibold text-gray-900">Drift</span>
        </Link>
        <div className="flex items-center gap-1">
          <Link href="/select" className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-gray-500 hover:text-gray-800 hover:bg-gray-200/50 transition text-sm font-medium">
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Hub</span>
          </Link>
          <Link href="/app" className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-gray-500 hover:text-gray-800 hover:bg-gray-200/50 transition text-sm font-medium">
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">Backend</span>
          </Link>
          {isSuperadmin && (
            <Link href="/admin" className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-gray-500 hover:text-gray-800 hover:bg-gray-200/50 transition text-sm font-medium">
              <Shield className="w-4 h-4" />
              <span className="hidden sm:inline">Admin</span>
            </Link>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-4 pb-12">
        {agents.length === 0 ? (
          <div className="text-center">
            <Bot className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No agents found</h2>
            <p className="text-gray-500 text-sm mb-6">Create an agent in the backend first.</p>
            <button onClick={() => router.push("/select")} className="px-5 py-2.5 rounded-xl bg-black text-white text-sm font-medium hover:bg-gray-800 transition">
              Go Back
            </button>
          </div>
        ) : agents.length === 1 ? (
          <RadialAgentCard
            agent={agents[0]}
            navItems={getNavItems(agents[0].id)}
            onChangeColor={handleChangeGradient}
            onOpenPanel={openPanel}
            savingColor={savingColor}
          />
        ) : (
          <div className="flex flex-wrap justify-center gap-16">
            {agents.map((agent) => (
              <RadialAgentCard
                key={agent.id}
                agent={agent}
                navItems={getNavItems(agent.id)}
                onChangeColor={handleChangeGradient}
                onOpenPanel={openPanel}
                savingColor={savingColor}
              />
            ))}
          </div>
        )}
      </div>

      {/* Panel overlay */}
      {activePanel && (() => {
        const agent = agents.find(a => a.id === selectedAgentId);
        const gradient = agent ? JSON.parse(agent.gradient_color || generateGradientColor(agent.id)) as string[] : [];
        const accent = gradient[0] || undefined;
        return (
          <PanelShell
            title={PANEL_TITLES[activePanel]}
            onClose={closePanel}
            wide={WIDE_PANELS.includes(activePanel)}
            accentColor={accent}
          >
            <Suspense fallback={<PanelLoader />}>
              {renderPanelContent()}
            </Suspense>
          </PanelShell>
        );
      })()}
    </div>
  );
}
