"use client";

import { useState, useEffect, lazy, Suspense } from "react";
import Link from "next/link";
import {
  BookOpen,
  CreditCard,
  ScrollText,
  Download,
  Shield,
  ArrowLeft,
} from "lucide-react";

const KnowledgeSetupClient = lazy(() => import("./knowledge/KnowledgeSetupClient"));
const AuditLogClient = lazy(() => import("./audit-log/AuditLogClient"));
const SSOSetupClient = lazy(() => import("./sso/SSOSetupClient"));

import BillingCard from "./BillingCard";
import ExportDataCard from "./ExportDataCard";

type PanelId = "knowledge" | "billing" | "audit" | "export" | "sso";

const PANEL_TITLES: Record<PanelId, string> = {
  knowledge: "Knowledge base",
  billing: "Billing & subscription",
  audit: "Audit log",
  export: "Export data",
  sso: "Single sign-on",
};

const PANEL_SUBTITLES: Record<PanelId, string> = {
  knowledge: "Context Drift uses when it answers your callers.",
  billing: "Manage subscription, payment methods, and invoices.",
  audit: "Sensitive events in your workspace — who did what and when.",
  export: "Download all workspace records as a single JSON file.",
  sso: "Configure SAML 2.0 or OpenID Connect for your workspace.",
};

interface NavItem {
  name: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  panelId: PanelId;
  adminOnly?: boolean;
  group: "Workspace" | "Administration";
}

const ALL_NAV_ITEMS: NavItem[] = [
  { name: "Knowledge", icon: BookOpen, panelId: "knowledge", group: "Workspace" },
  { name: "Billing", icon: CreditCard, panelId: "billing", group: "Workspace" },
  { name: "Audit log", icon: ScrollText, panelId: "audit", adminOnly: true, group: "Administration" },
  { name: "Export", icon: Download, panelId: "export", adminOnly: true, group: "Administration" },
  { name: "SSO", icon: Shield, panelId: "sso", adminOnly: true, group: "Administration" },
];

function PanelLoader() {
  return (
    <div className="flex items-center justify-center h-64 text-[var(--ink-subtle)] text-sm">
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
  const [activePanel, setActivePanel] = useState<PanelId>("knowledge");

  useEffect(() => {
    document.documentElement.style.setProperty("background", "var(--canvas)");
    document.body.style.background = "var(--canvas)";
    document.body.style.color = "var(--ink)";
  }, []);

  const navItems = ALL_NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  const groupedNav = navItems.reduce<Record<string, NavItem[]>>((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {});

  const renderPanel = () => {
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
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-[var(--rule)] bg-[var(--canvas)] px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="heading-display text-xl text-[var(--ink)]">Drift</span>
          <span className="label-section text-[var(--ink-muted)]">Settings</span>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
          Back to dashboard
        </Link>
      </div>

      <div className="flex flex-1">
        {/* Left nav */}
        <aside className="w-60 border-r border-[var(--rule)] bg-[var(--canvas)] px-4 py-6">
          {Object.entries(groupedNav).map(([group, items]) => (
            <div key={group} className="mb-6">
              <div className="label-section mb-3 px-3">{group}</div>
              <nav className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activePanel === item.panelId;
                  return (
                    <button
                      key={item.panelId}
                      onClick={() => setActivePanel(item.panelId)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-[4px] transition ${
                        isActive
                          ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                          : "text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)]"
                      }`}
                    >
                      <Icon className="w-4 h-4" strokeWidth={1.5} />
                      {item.name}
                    </button>
                  );
                })}
              </nav>
            </div>
          ))}
        </aside>

        {/* Right content */}
        <main className="flex-1 px-8 py-8 max-w-3xl">
          <h1 className="heading-display text-4xl text-[var(--ink)] mb-1">
            {PANEL_TITLES[activePanel]}
          </h1>
          <p className="text-sm text-[var(--ink-muted)] mb-6">
            {PANEL_SUBTITLES[activePanel]}
          </p>
          <Suspense fallback={<PanelLoader />}>{renderPanel()}</Suspense>
        </main>
      </div>
    </div>
  );
}
