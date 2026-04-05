"use client";

import { useState, useCallback, lazy, Suspense } from "react";
import Link from "next/link";
import {
  LayoutDashboard, Shield, Building2, CreditCard, UserPlus, BarChart3,
  Home, Code,
} from "lucide-react";
import AgentOrb from "@/components/frontend/AgentOrb";
import PanelShell from "@/components/panels/PanelShell";

const DashboardAPanel = lazy(() => import("@/components/panels/admin/DashboardAPanel"));
const FeaturesAPanel = lazy(() => import("@/components/panels/admin/FeaturesAPanel"));
const WorkspacesAPanel = lazy(() => import("@/components/panels/admin/WorkspacesAPanel"));
const BillingAPanel = lazy(() => import("@/components/panels/admin/BillingAPanel"));
const InvitesAPanel = lazy(() => import("@/components/panels/admin/InvitesAPanel"));
const AnalyticsAPanel = lazy(() => import("@/components/panels/admin/AnalyticsAPanel"));

type PanelId = "dashboard" | "features" | "workspaces" | "billing" | "invites" | "analytics";

const PANEL_TITLES: Record<PanelId, string> = {
  dashboard: "Dashboard",
  features: "Feature Management",
  workspaces: "All Workspaces",
  billing: "Billing & Stripe",
  invites: "Manage Invites",
  analytics: "Analytics & Reports",
};

const WIDE_PANELS: PanelId[] = ["workspaces", "features"];

const PURPLE_GRADIENT = ["#8B5CF6", "#A78BFA", "#C4B5FD"];

interface NavItem {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  panelId: PanelId;
}

const navItems: NavItem[] = [
  { name: "Dashboard", icon: LayoutDashboard, panelId: "dashboard" },
  { name: "Features", icon: Shield, panelId: "features" },
  { name: "Workspaces", icon: Building2, panelId: "workspaces" },
  { name: "Billing", icon: CreditCard, panelId: "billing" },
  { name: "Invites", icon: UserPlus, panelId: "invites" },
  { name: "Analytics", icon: BarChart3, panelId: "analytics" },
];

function PanelLoader() {
  return <div className="flex items-center justify-center h-64 text-white/40 text-sm">Loading...</div>;
}

export default function AdminOrbClient({ userName }: { userName?: string }) {
  const [hovered, setHovered] = useState(false);
  const [activePanel, setActivePanel] = useState<PanelId | null>(null);

  const orbSize = 160;
  const orbitRadius = 140;

  const openPanel = useCallback((id: PanelId) => setActivePanel(id), []);
  const closePanel = useCallback(() => setActivePanel(null), []);

  const count = navItems.length;
  const startAngle = -Math.PI / 2;

  const renderPanel = () => {
    if (!activePanel) return null;
    switch (activePanel) {
      case "dashboard": return <DashboardAPanel />;
      case "features": return <FeaturesAPanel />;
      case "workspaces": return <WorkspacesAPanel />;
      case "billing": return <BillingAPanel />;
      case "invites": return <InvitesAPanel />;
      case "analytics": return <AnalyticsAPanel />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-purple-500 flex items-center justify-center">
            <Shield className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold text-white">Drift</span>
          <span className="text-[10px] text-purple-400 font-semibold uppercase tracking-wider ml-0.5">Admin</span>
        </div>
        <div className="flex items-center gap-1">
          <Link href="/frontend" className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition text-sm font-medium">
            <Home className="w-4 h-4" />
            <span className="hidden sm:inline">Frontend</span>
          </Link>
          <Link href="/app" className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition text-sm font-medium">
            <Code className="w-4 h-4" />
            <span className="hidden sm:inline">Backend</span>
          </Link>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 pb-16">
        <div
          className="relative"
          style={{ width: (orbitRadius + 56) * 2, height: (orbitRadius + 56) * 2 }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {/* Orbit ring */}
          <div
            className="absolute inset-0 rounded-full border border-dashed transition-all duration-500"
            style={{ borderColor: hovered ? "rgba(139,92,246,0.2)" : "transparent", margin: 56 }}
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
                onClick={() => openPanel(item.panelId)}
                className="absolute flex flex-col items-center gap-1 transition-all duration-500 group/nav"
                style={{
                  left: x, top: y, width: 56,
                  opacity: hovered ? 1 : 0,
                  transform: hovered ? "scale(1)" : "scale(0.3)",
                  pointerEvents: hovered ? "auto" : "none",
                }}
              >
                <div className="w-11 h-11 rounded-2xl bg-purple-500/10 border border-purple-500/20 backdrop-blur-sm flex items-center justify-center group-hover/nav:bg-purple-500/20 group-hover/nav:scale-110 group-hover/nav:border-purple-500/40 transition-all duration-200">
                  <Icon className="w-5 h-5 text-purple-400/70 group-hover/nav:text-purple-300 transition-colors" />
                </div>
                <span className="text-[10px] font-medium text-white/50 group-hover/nav:text-purple-300 transition-colors text-center leading-tight whitespace-nowrap">
                  {item.name}
                </span>
              </button>
            );
          })}

          {/* Center orb */}
          <div className="absolute" style={{ left: orbitRadius + 56 - orbSize / 2, top: orbitRadius + 56 - orbSize / 2 }}>
            <div className="relative inline-flex items-center justify-center" style={{ width: orbSize, height: orbSize }}>
              <AgentOrb
                colors={PURPLE_GRADIENT}
                size={orbSize}
                className="rounded-full"
                interactive
                pulsing={hovered}
              />
              <div
                className="absolute z-10 flex items-center justify-center select-none pointer-events-none"
                style={{
                  width: orbSize * 0.4,
                  height: orbSize * 0.4,
                  filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.3))",
                  transition: "transform 0.3s ease",
                  transform: hovered ? "scale(1.05)" : "scale(1)",
                }}
              >
                <Shield className="w-full h-full text-white/90" />
              </div>
            </div>
          </div>
        </div>

        {/* Info below orb */}
        <div className="text-center -mt-2">
          <h2 className="text-xl font-bold text-white mb-1">Admin Panel</h2>
          {userName && <p className="text-xs text-purple-400/60 mb-1">Welcome, {userName}</p>}
          <p className="text-xs text-white/30">Hover over the orb to manage</p>
        </div>
      </div>

      {/* Panel overlay */}
      {activePanel && (
        <PanelShell
          title={PANEL_TITLES[activePanel]}
          onClose={closePanel}
          wide={WIDE_PANELS.includes(activePanel)}
          dark
          accentColor="#8B5CF6"
        >
          <Suspense fallback={<PanelLoader />}>
            {renderPanel()}
          </Suspense>
        </PanelShell>
      )}
    </div>
  );
}
