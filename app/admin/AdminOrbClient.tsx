"use client";

import { useEffect, useState, lazy, Suspense } from "react";
import Link from "next/link";
import {
  Shield,
  Building2,
  CreditCard,
  UserPlus,
  BarChart3,
  Gauge,
  FlaskConical,
  MessageSquareWarning,
  ArrowLeft,
  Users,
  Activity,
  Bot,
} from "lucide-react";
import PanelShell from "@/components/panels/PanelShell";

const FeaturesAPanel = lazy(() => import("@/components/panels/admin/FeaturesAPanel"));
const WorkspacesAPanel = lazy(() => import("@/components/panels/admin/WorkspacesAPanel"));
const BillingAPanel = lazy(() => import("@/components/panels/admin/BillingAPanel"));
const InvitesAPanel = lazy(() => import("@/components/panels/admin/InvitesAPanel"));
const AnalyticsAPanel = lazy(() => import("@/components/panels/admin/AnalyticsAPanel"));
const UsageAPanel = lazy(() => import("@/components/panels/admin/UsageAPanel"));

type PanelId = "features" | "workspaces" | "billing" | "invites" | "analytics" | "usage";

const PANEL_TITLES: Record<PanelId, string> = {
  features: "Feature Management",
  workspaces: "All Workspaces",
  billing: "Billing & Stripe",
  invites: "Manage Invites",
  analytics: "Analytics & Reports",
  usage: "Usage & Billing Meters",
};

const WIDE_PANELS: PanelId[] = ["workspaces", "features", "usage"];

interface NavItem {
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  href?: string;
  panelId?: PanelId;
}

const navItems: NavItem[] = [
  {
    name: "Features",
    description: "Toggle plans and feature flags per workspace.",
    icon: Shield,
    panelId: "features",
  },
  {
    name: "Workspaces",
    description: "Browse all workspaces, add users, delete.",
    icon: Building2,
    panelId: "workspaces",
  },
  {
    name: "Billing",
    description: "Stripe keys, webhook, subscription status.",
    icon: CreditCard,
    panelId: "billing",
  },
  {
    name: "Usage",
    description: "Per-workspace meters and quotas.",
    icon: Gauge,
    panelId: "usage",
  },
  {
    name: "Invites",
    description: "Send and revoke workspace invitations.",
    icon: UserPlus,
    panelId: "invites",
  },
  {
    name: "Analytics",
    description: "Platform expenses and reporting.",
    icon: BarChart3,
    panelId: "analytics",
  },
  {
    name: "Evals",
    description: "FiduciaryBench runs, Dante eval suites, human grading.",
    icon: FlaskConical,
    href: "/admin/evals",
  },
  {
    name: "Feedback",
    description: "Triage chat feedback into eval cases.",
    icon: MessageSquareWarning,
    href: "/admin/feedback",
  },
];

function PanelLoader() {
  return (
    <div className="flex items-center justify-center h-64 text-[var(--ink-subtle)] text-sm">
      Loading...
    </div>
  );
}

interface DashboardStats {
  workspaces: number;
  activeWorkspaces: number;
  users: number;
  deployedAgents: number;
  totalAgents: number;
  recentConversations: number;
}

export default function AdminOrbClient({ userName }: { userName?: string }) {
  const [activePanel, setActivePanel] = useState<PanelId | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  // Force Harvey canvas background (override any dark theme).
  useEffect(() => {
    const prevHtml = document.documentElement.style.background;
    const prevBody = document.body.style.background;
    document.documentElement.style.background = "var(--canvas)";
    document.body.style.background = "var(--canvas)";
    return () => {
      document.documentElement.style.background = prevHtml;
      document.body.style.background = prevBody;
    };
  }, []);

  useEffect(() => {
    fetch("/api/admin/dashboard-stats", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setStats(data))
      .catch(() => {});
  }, []);

  const renderPanel = () => {
    if (!activePanel) return null;
    switch (activePanel) {
      case "features":
        return <FeaturesAPanel />;
      case "workspaces":
        return <WorkspacesAPanel />;
      case "billing":
        return <BillingAPanel />;
      case "invites":
        return <InvitesAPanel />;
      case "analytics":
        return <AnalyticsAPanel />;
      case "usage":
        return <UsageAPanel />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[var(--canvas)] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--rule)] bg-[var(--canvas)]">
        <div className="flex items-baseline gap-2">
          <span className="text-base font-semibold text-[var(--ink)]">Drift</span>
          <span className="label-section">Admin</span>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 px-3 py-2 rounded-[4px] text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
            <span className="hidden sm:inline">Dashboard</span>
          </Link>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 px-8 py-12 max-w-6xl w-full mx-auto">
        <div className="mb-10">
          <div className="label-section mb-2">Admin</div>
          <h1 className="heading-display text-4xl text-[var(--ink)] mb-2">Control panel</h1>
          {userName ? (
            <p className="text-sm text-[var(--ink-muted)]">Signed in as {userName}.</p>
          ) : null}
        </div>

        {/* Platform health stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="card-flat p-4">
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="w-3.5 h-3.5 text-[var(--ink-subtle)]" strokeWidth={1.5} />
                <span className="label-section">Workspaces</span>
              </div>
              <div className="text-2xl font-semibold text-[var(--ink)]">{stats.activeWorkspaces}</div>
              <div className="text-xs text-[var(--ink-muted)] mt-0.5">{stats.workspaces} total</div>
            </div>
            <div className="card-flat p-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-3.5 h-3.5 text-[var(--ink-subtle)]" strokeWidth={1.5} />
                <span className="label-section">Users</span>
              </div>
              <div className="text-2xl font-semibold text-[var(--ink)]">{stats.users}</div>
              <div className="text-xs text-[var(--ink-muted)] mt-0.5">All profiles</div>
            </div>
            <div className="card-flat p-4">
              <div className="flex items-center gap-2 mb-1">
                <Bot className="w-3.5 h-3.5 text-[var(--ink-subtle)]" strokeWidth={1.5} />
                <span className="label-section">Agents</span>
              </div>
              <div className="text-2xl font-semibold text-[var(--ink)]">{stats.deployedAgents}</div>
              <div className="text-xs text-[var(--ink-muted)] mt-0.5">{stats.totalAgents} total</div>
            </div>
            <div className="card-flat p-4">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="w-3.5 h-3.5 text-[var(--ink-subtle)]" strokeWidth={1.5} />
                <span className="label-section">7d Conversations</span>
              </div>
              <div className="text-2xl font-semibold text-[var(--ink)]">{stats.recentConversations}</div>
              <div className="text-xs text-[var(--ink-muted)] mt-0.5">Last 7 days</div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const inner = (
              <div className="card-flat card-flat-hover p-5 h-full flex flex-col gap-3 cursor-pointer">
                <div className="flex items-center gap-3">
                  <Icon
                    className="w-5 h-5 text-[var(--ink-muted)]"
                    strokeWidth={1.5}
                  />
                  <span className="text-[15px] font-medium text-[var(--ink)]">
                    {item.name}
                  </span>
                </div>
                <p className="text-sm text-[var(--ink-muted)] leading-relaxed">
                  {item.description}
                </p>
              </div>
            );
            if (item.href) {
              return (
                <Link key={item.name} href={item.href} className="block h-full">
                  {inner}
                </Link>
              );
            }
            return (
              <button
                key={item.name}
                onClick={() => item.panelId && setActivePanel(item.panelId)}
                className="text-left h-full"
              >
                {inner}
              </button>
            );
          })}
        </div>
      </div>

      {/* Panel overlay */}
      {activePanel && (
        <PanelShell
          title={PANEL_TITLES[activePanel]}
          onClose={() => setActivePanel(null)}
          wide={WIDE_PANELS.includes(activePanel)}
        >
          <Suspense fallback={<PanelLoader />}>{renderPanel()}</Suspense>
        </PanelShell>
      )}
    </div>
  );
}
