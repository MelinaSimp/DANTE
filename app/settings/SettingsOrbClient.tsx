"use client";

import { useState, useEffect, lazy, Suspense } from "react";
import Link from "next/link";
import {
  CreditCard,
  Download,
  Phone,
  Video,
  ArrowLeft,
  Bot,
  ArrowUpRight,
  Mail,
} from "lucide-react";

const PhoneNumbersCard = lazy(() => import("./PhoneNumbersCard"));
const ZoomCard = lazy(() => import("./ZoomCard"));
const GoogleCard = lazy(() => import("./GoogleCard"));

import BillingCard from "./BillingCard";
import ExportDataCard from "./ExportDataCard";

type PanelId = "phone_numbers" | "zoom" | "google" | "billing" | "export";

const PANEL_TITLES: Record<PanelId, string> = {
  phone_numbers: "Phone numbers",
  zoom: "Zoom integration",
  google: "Google integration",
  billing: "Billing & subscription",
  export: "Export data",
};

const PANEL_SUBTITLES: Record<PanelId, string> = {
  phone_numbers:
    "Connect your Twilio account and route numbers to agents.",
  zoom:
    "Launch cloud-recorded client meetings that auto-transcribe into the client's timeline.",
  google:
    "Connect Gmail and Google Calendar so Dante has context on client conversations and meetings.",
  billing: "Manage subscription, payment methods, and invoices.",
  export: "Download all workspace records as a single JSON file.",
};

interface NavItem {
  name: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  panelId: PanelId;
  adminOnly?: boolean;
  // Feature ID this panel requires. Panels without a feature are
  // always-on (billing, export) — core workspace surfaces.
  feature?: string;
  group: "Workspace" | "Administration";
}

const ALL_NAV_ITEMS: NavItem[] = [
  { name: "Phone numbers", icon: Phone, panelId: "phone_numbers", feature: "ai_receptionist", adminOnly: true, group: "Workspace" },
  { name: "Zoom", icon: Video, panelId: "zoom", group: "Workspace" },
  { name: "Google", icon: Mail, panelId: "google", group: "Workspace" },
  { name: "Billing", icon: CreditCard, panelId: "billing", group: "Workspace" },
  { name: "Export", icon: Download, panelId: "export", adminOnly: true, group: "Administration" },
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
  features: string[];
}

export default function SettingsOrbClient({
  isAdmin,
  workspaceId,
  features,
}: Props) {
  // Pick a sensible default: first entitled + visible panel. If the
  // workspace has no Knowledge entitlement we fall through to Billing,
  // which is always-on.
  const navItems = ALL_NAV_ITEMS.filter(
    (item) =>
      (!item.adminOnly || isAdmin) &&
      (!item.feature || features.includes(item.feature)),
  );

  const defaultPanel: PanelId = (navItems[0]?.panelId as PanelId) ?? "billing";
  const [activePanel, setActivePanel] = useState<PanelId>(defaultPanel);

  useEffect(() => {
    document.documentElement.style.setProperty("background", "var(--canvas)");
    document.body.style.background = "var(--canvas)";
    document.body.style.color = "var(--ink)";
  }, []);

  const groupedNav = navItems.reduce<Record<string, NavItem[]>>((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {});

  const renderPanel = () => {
    switch (activePanel) {
      case "phone_numbers":
        return <PhoneNumbersCard />;
      case "zoom":
        return <ZoomCard isAdmin={isAdmin} workspaceId={workspaceId} />;
      case "google":
        return <GoogleCard />;
      case "billing":
        return <BillingCard />;
      case "export":
        return <ExportDataCard />;
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
                {/* External links sit under Workspace — they leave the
                    orb rather than opening a panel. Kept as Links so
                    they behave like the rest of the app nav. */}
                {group === "Workspace" && features.includes("ai_receptionist") && (
                  <>
                    <Link
                      href="/agent"
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-[4px] transition text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)]"
                    >
                      <Bot className="w-4 h-4" strokeWidth={1.5} />
                      <span className="flex-1 text-left">Voice AI config</span>
                      <ArrowUpRight className="w-3 h-3 text-[var(--ink-subtle)]" strokeWidth={1.5} />
                    </Link>
                  </>
                )}
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
