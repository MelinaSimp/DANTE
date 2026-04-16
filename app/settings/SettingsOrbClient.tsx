"use client";

import { useState, useCallback, lazy, Suspense } from "react";
import Link from "next/link";
import {
  Settings, BookOpen, CreditCard, ScrollText, Download, Shield,
  ArrowLeft, Home, Code,
} from "lucide-react";
import AgentOrb from "@/components/frontend/AgentOrb";
import PanelShell from "@/components/panels/PanelShell";
import GLSLWaves from "@/components/ui/glsl-waves";

const KnowledgeSetupClient = lazy(() => import("./knowledge/KnowledgeSetupClient"));
const AuditLogClient = lazy(() => import("./audit-log/AuditLogClient"));
const SSOSetupClient = lazy(() => import("./sso/SSOSetupClient"));

import BillingCard from "./BillingCard";
import ExportDataCard from "./ExportDataCard";

type PanelId = "knowledge" | "billing" | "audit" | "export" | "sso";

const PANEL_TITLES: Record<PanelId, string> = {
  knowledge: "AI Knowledge Base",
  billing: "Billing & Subscription",
  audit: "Audit Log",
  export: "Export Data",
  sso: "Single Sign-On",
};

const WIDE_PANELS: PanelId[] = ["knowledge", "audit"];

const DRIFT_COLORS = ["#34d399", "#10b981", "#6ee7b7"];

interface NavItem {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  panelId: PanelId;
  adminOnly?: boolean;
}

const ALL_NAV_ITEMS: NavItem[] = [
  { name: "Knowledge", icon: BookOpen, panelId: "knowledge" },
  { name: "Billing", icon: CreditCard, panelId: "billing" },
  { name: "Audit Log", icon: ScrollText, panelId: "audit", adminOnly: true },
  { name: "Export", icon: Download, panelId: "export", adminOnly: true },
  { name: "SSO", icon: Shield, panelId: "sso", adminOnly: true },
];

function PanelLoader() {
  return (
    <div className="flex items-center justify-center h-64 text-white/40 text-sm">
      Loading…
    </div>
  );
}

interface Props {
  isAdmin: boolean;
  workspaceId: string;
  initialKnowledgeEntries: any[];
  initialAuditLogs: any[];
}

export default function SettingsOrbClient({
  isAdmin,
  workspaceId,
  initialKnowledgeEntries,
  initialAuditLogs,
}: Props) {
  const [hovered, setHovered] = useState(false);
  const [activePanel, setActivePanel] = useState<PanelId | null>(null);
  const [clickedNav, setClickedNav] = useState<PanelId | null>(null);

  const orbSize = 160;
  const orbitRadius = 140;

  const openPanel = useCallback((id: PanelId) => setActivePanel(id), []);
  const closePanel = useCallback(() => setActivePanel(null), []);

  const handleNavClick = (panelId: PanelId) => {
    if (clickedNav) return;
    setClickedNav(panelId);
    setTimeout(() => {
      setClickedNav(null);
      openPanel(panelId);
    }, 450);
  };

  const navItems = ALL_NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);
  const count = navItems.length;
  const startAngle = -Math.PI / 2;

  const renderPanel = () => {
    if (!activePanel) return null;
    switch (activePanel) {
      case "knowledge":
        return (
          <KnowledgeSetupClient
            initialEntries={initialKnowledgeEntries}
            workspaceId={workspaceId}
          />
        );
      case "billing":
        return <BillingCard />;
      case "audit":
        return <AuditLogClient initialLogs={initialAuditLogs} />;
      case "export":
        return <ExportDataCard />;
      case "sso":
        return <SSOSetupClient workspaceId={workspaceId} />;
      default:
        return null;
    }
  };

  return (
    <div className="relative min-h-screen bg-black flex flex-col overflow-hidden">
      <div className="absolute inset-0 z-0 opacity-50">
        <GLSLWaves mode="nebula" speed={0.25} />
      </div>
      <div className="absolute inset-0 z-0 bg-gradient-to-t from-black/60 via-transparent to-black/50 pointer-events-none" />

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center">
            <Settings className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold text-white">Drift</span>
          <span className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider ml-0.5">
            Settings
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href="/select"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Hub</span>
          </Link>
          <Link
            href="/frontend"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition text-sm font-medium"
          >
            <Home className="w-4 h-4" />
            <span className="hidden sm:inline">Frontend</span>
          </Link>
          <Link
            href="/app"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition text-sm font-medium"
          >
            <Code className="w-4 h-4" />
            <span className="hidden sm:inline">Backend</span>
          </Link>
        </div>
      </div>

      {/* Main */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 pb-16">
        <div
          className="relative"
          style={{ width: (orbitRadius + 56) * 2, height: (orbitRadius + 56) * 2 }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {/* Orbit ring */}
          <div
            className="absolute inset-0 rounded-full border border-dashed transition-all duration-500"
            style={{
              borderColor: hovered ? "rgba(52,211,153,0.2)" : "transparent",
              margin: 56,
            }}
          />

          {/* Nav items */}
          {navItems.map((item, i) => {
            const angle = startAngle + (i / count) * Math.PI * 2;
            const cx = orbitRadius + 56;
            const cy = orbitRadius + 56;
            const x = cx + Math.cos(angle) * orbitRadius - 28;
            const y = cy + Math.sin(angle) * orbitRadius - 28;
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
                  transform: hovered
                    ? isClicked
                      ? "scale(1.35)"
                      : "scale(1)"
                    : "scale(0.3)",
                  pointerEvents: hovered ? "auto" : "none",
                  zIndex: isClicked ? 50 : undefined,
                }}
              >
                <div className="relative">
                  {isClicked && (
                    <>
                      <div className="absolute inset-0 rounded-2xl bg-emerald-500/30 animate-ping" />
                      <div
                        className="absolute -inset-3 rounded-full border-2 border-emerald-400/50 animate-ping"
                        style={{ animationDuration: "0.6s" }}
                      />
                    </>
                  )}
                  <div
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-300 ${
                      isClicked
                        ? "bg-emerald-600 text-white shadow-xl shadow-emerald-600/30 scale-110 border-2 border-emerald-400"
                        : "bg-emerald-500/10 border border-emerald-500/20 backdrop-blur-sm group-hover/nav:bg-emerald-500/20 group-hover/nav:scale-110 group-hover/nav:border-emerald-500/40"
                    }`}
                  >
                    <Icon
                      className={`w-5 h-5 transition-colors ${
                        isClicked
                          ? "text-white"
                          : "text-emerald-400/70 group-hover/nav:text-emerald-300"
                      }`}
                    />
                  </div>
                </div>
                <span
                  className={`text-[10px] font-medium transition-all text-center leading-tight whitespace-nowrap ${
                    isClicked
                      ? "text-emerald-300 font-bold scale-110"
                      : "text-white/50 group-hover/nav:text-emerald-300"
                  }`}
                >
                  {item.name}
                </span>
              </button>
            );
          })}

          {/* Center orb */}
          <div
            className="absolute"
            style={{
              left: orbitRadius + 56 - orbSize / 2,
              top: orbitRadius + 56 - orbSize / 2,
            }}
          >
            <div
              className="relative inline-flex items-center justify-center"
              style={{ width: orbSize, height: orbSize }}
            >
              <AgentOrb
                colors={DRIFT_COLORS}
                size={orbSize}
                className="rounded-full"
                interactive
                pulsing={hovered}
              />
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
          <h2 className="text-xl font-bold text-white mb-1">Workspace Settings</h2>
          <p className="text-xs text-white/30">Hover over the orb to configure</p>
        </div>
      </div>

      {/* Panel overlay */}
      {activePanel && (
        <PanelShell
          title={PANEL_TITLES[activePanel]}
          onClose={closePanel}
          wide={WIDE_PANELS.includes(activePanel)}
          dark
          accentColor="#34d399"
        >
          <Suspense fallback={<PanelLoader />}>{renderPanel()}</Suspense>
        </PanelShell>
      )}
    </div>
  );
}
