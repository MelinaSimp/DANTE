"use client";

import { useEffect, useState, useRef, useCallback, lazy, Suspense } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import Link from "next/link";
import {
  FileText, Calendar, Shield, Database, User, Gauge, Code, Rocket,
  Palette, ArrowLeft, Home,
} from "lucide-react";
import AgentOrb from "@/components/frontend/AgentOrb";
import PanelShell from "@/components/panels/PanelShell";

const InstructionsPanel = lazy(() => import("@/components/panels/backend/InstructionsPanel"));
const ScheduleBPanel = lazy(() => import("@/components/panels/backend/ScheduleBPanel"));
const PoliciesBPanel = lazy(() => import("@/components/panels/backend/PoliciesBPanel"));
const DataSourcesBPanel = lazy(() => import("@/components/panels/backend/DataSourcesBPanel"));
const PersonalizationBPanel = lazy(() => import("@/components/panels/backend/PersonalizationBPanel"));
const EvaluationBPanel = lazy(() => import("@/components/panels/backend/EvaluationBPanel"));
const AdvancedBPanel = lazy(() => import("@/components/panels/backend/AdvancedBPanel"));

interface Agent {
  id: string;
  name: string;
  description?: string;
  gradient_color?: string;
  status: string;
  modality?: string;
}

type PanelId = "instructions" | "schedule" | "policies" | "data-sources" | "personalization" | "evaluation" | "advanced";

const PANEL_TITLES: Record<PanelId, string> = {
  instructions: "Rules & Instructions",
  schedule: "Schedule",
  policies: "Policies",
  "data-sources": "Data Sources",
  personalization: "Personalization",
  evaluation: "Evaluation",
  advanced: "Advanced",
};

const WIDE_PANELS: PanelId[] = ["instructions", "data-sources", "evaluation"];

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
  const index = seed.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % GRADIENT_PRESETS.length;
  return JSON.stringify(GRADIENT_PRESETS[index]);
}

interface RadialNavItem {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  panelId: PanelId;
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
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const agentGradient = JSON.parse(agent.gradient_color || generateGradientColor(agent.id)) as string[];

  const orbSize = 160;
  const orbitRadius = 140;

  useEffect(() => {
    if (!showColorPicker) return;
    const handler = (e: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) setShowColorPicker(false);
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
          style={{ borderColor: hovered ? "rgba(255,255,255,0.12)" : "transparent", margin: 56 }}
        />

        {/* Nav items */}
        {navItems.map((item, i) => {
          const angle = startAngle + (i / count) * Math.PI * 2;
          const cx = orbitRadius + 56;
          const cy = orbitRadius + 56;
          const x = cx + Math.cos(angle) * orbitRadius - 28;
          const y = cy + Math.sin(angle) * orbitRadius - 28;
          const Icon = item.icon;

          return (
            <button
              key={item.name}
              onClick={() => onOpenPanel(item.panelId)}
              className="absolute flex flex-col items-center gap-1 transition-all duration-500 group/nav"
              style={{
                left: x, top: y, width: 56,
                opacity: hovered ? 1 : 0,
                transform: hovered ? "scale(1)" : "scale(0.3)",
                pointerEvents: hovered ? "auto" : "none",
              }}
            >
              <div className="w-11 h-11 rounded-2xl bg-white/10 border border-white/20 backdrop-blur-sm flex items-center justify-center group-hover/nav:bg-white/20 group-hover/nav:scale-110 group-hover/nav:border-white/30 transition-all duration-200">
                <Icon className="w-5 h-5 text-white/70 group-hover/nav:text-white transition-colors" />
              </div>
              <span className="text-[10px] font-medium text-white/50 group-hover/nav:text-white/90 transition-colors text-center leading-tight whitespace-nowrap">
                {item.name}
              </span>
            </button>
          );
        })}

        {/* Center orb */}
        <div className="absolute cursor-pointer" style={{ left: orbitRadius + 56 - orbSize / 2, top: orbitRadius + 56 - orbSize / 2 }}>
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
            className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-white/10 border-2 border-white/20 shadow-md flex items-center justify-center text-white/40 hover:text-white/80 hover:border-white/40 transition-all hover:scale-110 z-20"
          >
            <Palette className="h-3.5 w-3.5" />
          </button>

          {showColorPicker && (
            <div ref={colorPickerRef} className="absolute top-full left-1/2 -translate-x-1/2 mt-4 z-50" onClick={e => e.stopPropagation()}>
              <div className="bg-[#1a1a1a] rounded-2xl shadow-2xl border border-white/10 p-4 w-64">
                <p className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-3">Color Scheme</p>
                <div className="grid grid-cols-4 gap-2">
                  {GRADIENT_PRESETS.map((preset, i) => {
                    const isActive = JSON.stringify(preset) === JSON.stringify(agentGradient);
                    return (
                      <button
                        key={i}
                        type="button"
                        disabled={savingColor}
                        onClick={e => { e.stopPropagation(); onChangeColor(agent.id, preset); }}
                        className={`w-12 h-12 rounded-xl transition-all hover:scale-110 disabled:opacity-50 ${isActive ? "ring-2 ring-[#f97316] ring-offset-2 ring-offset-[#1a1a1a] scale-110" : "hover:ring-2 hover:ring-white/30 hover:ring-offset-1 hover:ring-offset-[#1a1a1a]"}`}
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
        <h3 className="text-xl font-bold text-white mb-1">{agent.name}</h3>
        <span className={`text-xs px-3 py-1 rounded-full font-medium ${agent.status === "deployed" ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-white/10 text-white/60 border border-white/20"}`}>
          {agent.status}
        </span>
        {agent.description && <p className="text-sm text-white/50 mt-3 max-w-xs mx-auto">{agent.description}</p>}
        <p className="text-xs text-white/30 mt-3">Hover over the orb to configure</p>
      </div>
    </div>
  );
}

function PanelLoader() {
  return <div className="flex items-center justify-center h-64 text-white/40 text-sm">Loading...</div>;
}

export default function BackendOrbClient() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingColor, setSavingColor] = useState(false);
  const [activePanel, setActivePanel] = useState<PanelId | null>(null);

  const selectedAgentId = agents.length > 0 ? agents[0].id : "";

  const handleChangeGradient = async (agentId: string, gradient: string[]) => {
    setSavingColor(true);
    try {
      const gj = JSON.stringify(gradient);
      const r = await fetch(`/api/agents/${agentId}/gradient`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ gradient_color: gj }) });
      if (r.ok) setAgents(prev => prev.map(a => a.id === agentId ? { ...a, gradient_color: gj } : a));
    } catch {} finally { setSavingColor(false); }
  };

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push("/auth"); return; }
        const r = await fetch("/api/agents");
        if (r.ok) {
          const data = await r.json();
          setAgents((data || []).map((a: any) => ({
            id: a.id, name: a.name, description: a.description,
            gradient_color: a.gradient_color || generateGradientColor(a.id),
            status: a.status, modality: a.modality,
          })));
        } else { setLoadError("Failed to load agents"); }
      } catch { setLoadError("Failed to load agents"); }
      finally { setLoading(false); }
    }
    load();
  }, [router]);

  const openPanel = useCallback((id: PanelId) => setActivePanel(id), []);
  const closePanel = useCallback(() => setActivePanel(null), []);

  if (loading) {
    return <div className="min-h-screen bg-black flex items-center justify-center"><div className="text-white/40">Loading...</div></div>;
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center"><p className="text-white/50 mb-3">{loadError}</p><button onClick={() => window.location.reload()} className="text-sm text-[#f97316] hover:underline">Retry</button></div>
      </div>
    );
  }

  const navItems: RadialNavItem[] = [
    { name: "Instructions", icon: FileText, panelId: "instructions" },
    { name: "Schedule", icon: Calendar, panelId: "schedule" },
    { name: "Policies", icon: Shield, panelId: "policies" },
    { name: "Data Sources", icon: Database, panelId: "data-sources" },
    { name: "Personalize", icon: User, panelId: "personalization" },
    { name: "Evaluation", icon: Gauge, panelId: "evaluation" },
    { name: "Advanced", icon: Code, panelId: "advanced" },
  ];

  const renderPanel = () => {
    if (!activePanel || !selectedAgentId) return null;
    switch (activePanel) {
      case "instructions": return <InstructionsPanel agentId={selectedAgentId} />;
      case "schedule": return <ScheduleBPanel />;
      case "policies": return <PoliciesBPanel agentId={selectedAgentId} />;
      case "data-sources": return <DataSourcesBPanel agentId={selectedAgentId} />;
      case "personalization": return <PersonalizationBPanel agentId={selectedAgentId} />;
      case "evaluation": return <EvaluationBPanel agentId={selectedAgentId} />;
      case "advanced": return <AdvancedBPanel agentId={selectedAgentId} />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4">
        <Link href="/app" className="flex items-center gap-2">
          <img src="/brand/logo-circle.png" alt="Drift" className="w-6 h-6 rounded-full object-cover" />
          <span className="text-sm font-semibold text-white">Drift</span>
          <span className="text-xs text-white/30 ml-1">Backend</span>
        </Link>
        <div className="flex items-center gap-1">
          <Link href="/frontend" className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition text-sm font-medium">
            <Home className="w-4 h-4" />
            <span className="hidden sm:inline">Frontend</span>
          </Link>
          <Link href="/admin" className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition text-sm font-medium">
            <Shield className="w-4 h-4" />
            <span className="hidden sm:inline">Admin</span>
          </Link>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex items-center justify-center px-4 pb-12">
        {agents.length === 0 ? (
          <div className="text-center">
            <Rocket className="h-16 w-16 text-white/20 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">No agents found</h2>
            <p className="text-white/50 text-sm mb-6">Create an agent to get started.</p>
          </div>
        ) : agents.length === 1 ? (
          <RadialAgentCard agent={agents[0]} navItems={navItems} onChangeColor={handleChangeGradient} onOpenPanel={openPanel} savingColor={savingColor} />
        ) : (
          <div className="flex flex-wrap justify-center gap-16">
            {agents.map(agent => (
              <RadialAgentCard key={agent.id} agent={agent} navItems={navItems} onChangeColor={handleChangeGradient} onOpenPanel={openPanel} savingColor={savingColor} />
            ))}
          </div>
        )}
      </div>

      {/* Panel overlay */}
      {activePanel && (
        <PanelShell title={PANEL_TITLES[activePanel]} onClose={closePanel} wide={WIDE_PANELS.includes(activePanel)} dark>
          <Suspense fallback={<PanelLoader />}>
            {renderPanel()}
          </Suspense>
        </PanelShell>
      )}
    </div>
  );
}
