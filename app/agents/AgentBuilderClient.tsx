"use client";

// Agent Builder shell — sidebar + top bar + tabs + canvas/test pane.
// Harvey-ized Apr 2026: pure white canvas, 1px rules, editorial heading
// for the agent name, mono for metadata. No glassmorphism, no gradient
// avatars, no dark theme. The layout bones match what was already here
// (sidebar is 64 units wide, header has deploy button + status chip,
// tabs switch between Canvas and Test Results) — only the skin changed.

import { useState, useEffect } from "react";
import {
  Search,
  FileText,
  Database,
  User,
  Gauge,
  Code,
  Rocket,
  CheckCircle2,
  MoreHorizontal,
  MessageSquare,
  Phone,
  Layers,
  ChevronDown,
  ChevronRight,
  Edit3,
  RefreshCw,
  Zap,
  Bot,
  Plus,
} from "lucide-react";
import AgentCanvas from "./AgentCanvas";
import CreateAgentModal from "./CreateAgentModal";
import TestResults from "./TestResults";
import { toast } from "@/components/ui/toast";

interface Agent {
  id: string;
  name: string;
  modality: "chat" | "voice" | "multi-modal";
  status: "draft" | "deployed" | "archived";
  description?: string;
  created_at: string;
  updated_at: string;
}

interface AgentBuilderClientProps {
  workspaceId: string;
  initialAgents: Agent[];
}

export default function AgentBuilderClient({
  workspaceId,
  initialAgents,
}: AgentBuilderClientProps) {
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"canvas" | "test">("canvas");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (agents.length > 0 && !selectedAgent) {
      setSelectedAgent(agents[0]);
    }
  }, [agents, selectedAgent]);

  const filteredAgents = agents.filter((agent) =>
    agent.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateAgent = async (agentData: {
    name: string;
    modality: "chat" | "voice" | "multi-modal";
    description?: string;
  }) => {
    try {
      const response = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agentData),
      });

      if (!response.ok) throw new Error("Failed to create agent");

      const newAgent = await response.json();
      setAgents([newAgent, ...agents]);
      setSelectedAgent(newAgent);
      setShowCreateModal(false);
    } catch (error) {
      console.error("Error creating agent:", error);
      toast.error("Failed to create agent");
    }
  };

  const getModalityIcon = (modality: string) => {
    const common = { className: "h-3.5 w-3.5", style: { color: "var(--ink-muted)" } };
    switch (modality) {
      case "chat":
        return <MessageSquare {...common} />;
      case "voice":
        return <Phone {...common} />;
      case "multi-modal":
        return <Layers {...common} />;
      default:
        return <MessageSquare {...common} />;
    }
  };

  const getModalityLabel = (modality: string) => {
    switch (modality) {
      case "chat":
        return "Chat";
      case "voice":
        return "Voice";
      case "multi-modal":
        return "Multi-modal";
      default:
        return modality;
    }
  };

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: "var(--canvas)", color: "var(--ink)" }}
    >
      {/* Left Sidebar */}
      <aside
        className="w-64 flex flex-col"
        style={{
          borderRight: "1px solid var(--rule)",
          background: "var(--canvas)",
        }}
      >
        {/* Brand */}
        <div
          className="px-4 py-4"
          style={{ borderBottom: "1px solid var(--rule)" }}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 flex items-center justify-center"
              style={{
                border: "1px solid var(--ink)",
                borderRadius: "var(--r-input)",
                color: "var(--ink)",
              }}
            >
              <Bot className="h-3.5 w-3.5" />
            </div>
            <span
              className="heading-display"
              style={{ fontSize: 20, color: "var(--ink)" }}
            >
              Drift
            </span>
          </div>
        </div>

        {/* Search */}
        <div
          className="px-4 py-3"
          style={{ borderBottom: "1px solid var(--rule)" }}
        >
          <div className="relative">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5"
              style={{ color: "var(--ink-subtle)" }}
            />
            <input
              type="text"
              placeholder="Search…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-10 py-1.5 text-sm outline-none"
              style={{
                background: "var(--canvas)",
                border: "1px solid var(--rule)",
                borderRadius: "var(--r-input)",
                color: "var(--ink)",
              }}
            />
            <span
              className="mono absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px]"
              style={{ color: "var(--ink-subtle)" }}
            >
              ⌘K
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3">
          <div className="px-2 space-y-0.5">
            <NavItem icon={FileText} label="Policies" />
            <NavItem icon={Database} label="Data sources" />
            <NavItem icon={User} label="Personalization" />
            <NavItem icon={Gauge} label="Evaluation" />
            <NavItem icon={Code} label="Advanced" />
          </div>

          <div className="mt-4">
            <NavSection
              label="Scenarios"
              action={
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="p-1"
                  style={{ color: "var(--ink-muted)" }}
                  title="Create agent"
                >
                  <Plus className="h-3 w-3" />
                </button>
              }
              items={filteredAgents.map((agent) => ({
                id: agent.id,
                label: agent.name,
                active: selectedAgent?.id === agent.id,
                onClick: () => setSelectedAgent(agent),
              }))}
              emptyLabel="No agents yet"
            />
          </div>

          <div className="mt-4">
            <NavSection
              label="Supporting docs"
              items={[
                { id: "1", label: "Compliance guidelines.pdf", active: false, onClick: () => {} },
                { id: "2", label: "ID verification.csv", active: false, onClick: () => {} },
                { id: "3", label: "Escalation flowchart.png", active: false, onClick: () => {} },
              ]}
            />
          </div>
        </nav>

        {/* Bottom Info */}
        <div
          className="px-4 py-3 space-y-1.5 text-xs"
          style={{
            borderTop: "1px solid var(--rule)",
            color: "var(--ink-muted)",
          }}
        >
          <div className="flex items-center justify-between">
            <span className="label-section" style={{ color: "var(--ink-subtle)" }}>
              Brand
            </span>
            <span className="mono" style={{ color: "var(--ink-muted)" }}>
              Rules
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="label-section" style={{ color: "var(--ink-subtle)" }}>
              Memory
            </span>
            <span
              className="chip-verified"
              style={{ fontSize: 10, padding: "1px 8px" }}
            >
              High
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="label-section" style={{ color: "var(--ink-subtle)" }}>
              Last lock
            </span>
            <span className="mono" style={{ color: "var(--ink-muted)" }}>
              system
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        {selectedAgent ? (
          <div
            className="px-8 py-4"
            style={{
              borderBottom: "1px solid var(--rule)",
              background: "var(--canvas)",
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 min-w-0">
                <div
                  className="w-9 h-9 flex items-center justify-center flex-shrink-0"
                  style={{
                    border: "1px solid var(--rule)",
                    borderRadius: "var(--r-card)",
                    background: "var(--canvas-subtle)",
                    color: "var(--ink-muted)",
                  }}
                >
                  <Bot className="h-4 w-4" />
                </div>

                <div className="min-w-0">
                  <div
                    className="label-section mb-0.5"
                    style={{ color: "var(--ink-subtle)" }}
                  >
                    Agent
                  </div>
                  <div className="flex items-center gap-3 min-w-0">
                    <h1
                      className="heading-display truncate"
                      style={{ fontSize: 22, color: "var(--ink)" }}
                    >
                      {selectedAgent.name}
                    </h1>
                    <span
                      className="mono flex items-center gap-1 text-xs"
                      style={{ color: "var(--ink-muted)" }}
                    >
                      {getModalityIcon(selectedAgent.modality)}
                      {getModalityLabel(selectedAgent.modality)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] mono"
                  style={{
                    background: "var(--canvas-subtle)",
                    border: "1px solid var(--rule)",
                    borderRadius: "var(--r-chip)",
                    color: "var(--ink-muted)",
                  }}
                >
                  <Edit3 className="h-2.5 w-2.5" />
                  {selectedAgent.status}
                </span>
                <span
                  className="inline-flex items-center gap-1 text-[11px]"
                  style={{ color: "var(--ink-subtle)" }}
                >
                  <CheckCircle2
                    className="h-3 w-3"
                    style={{ color: "var(--verified)" }}
                  />
                  updated a min ago
                </span>

                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs transition ml-2"
                  style={{
                    background: "var(--ink)",
                    color: "var(--canvas)",
                    borderRadius: "var(--r-input)",
                    fontWeight: 500,
                  }}
                >
                  <Rocket className="h-3.5 w-3.5" />
                  Deploy
                  <ChevronDown className="h-3 w-3" />
                </button>
                <IconButton title="Refresh">
                  <RefreshCw className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton title="Actions">
                  <Zap className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton title="More">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </IconButton>
              </div>
            </div>
          </div>
        ) : null}

        {/* Tabs */}
        {selectedAgent && (
          <div
            className="px-8"
            style={{
              borderBottom: "1px solid var(--rule)",
              background: "var(--canvas)",
            }}
          >
            <div className="flex gap-6">
              <TabHeader
                label="Agent canvas"
                active={activeTab === "canvas"}
                onClick={() => setActiveTab("canvas")}
              />
              <TabHeader
                label="Test results"
                active={activeTab === "test"}
                onClick={() => setActiveTab("test")}
              />
            </div>
          </div>
        )}

        {/* Content Area */}
        <div
          className="flex-1 overflow-y-auto"
          style={{ background: "var(--canvas-subtle)" }}
        >
          {!selectedAgent ? (
            <div className="flex items-center justify-center h-full">
              <div
                className="text-center max-w-md px-8 py-12 card-flat"
                style={{ background: "var(--canvas)" }}
              >
                <div
                  className="w-10 h-10 mx-auto mb-4 flex items-center justify-center"
                  style={{
                    border: "1px solid var(--rule)",
                    borderRadius: "var(--r-card)",
                    color: "var(--ink-muted)",
                  }}
                >
                  <Bot className="h-5 w-5" />
                </div>
                <div
                  className="label-section mb-2"
                  style={{ color: "var(--ink-subtle)" }}
                >
                  No agent selected
                </div>
                <h2
                  className="heading-display mb-3"
                  style={{ fontSize: 28, color: "var(--ink)" }}
                >
                  Build your first agent.
                </h2>
                <p
                  className="text-sm mb-6"
                  style={{ color: "var(--ink-muted)", lineHeight: 1.55 }}
                >
                  Agents handle structured workflows — client intake, meeting
                  prep, follow-up scripts. Each step is traceable to a source.
                </p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm transition"
                  style={{
                    background: "var(--ink)",
                    color: "var(--canvas)",
                    borderRadius: "var(--r-input)",
                    fontWeight: 500,
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  New agent
                </button>
              </div>
            </div>
          ) : activeTab === "canvas" ? (
            <AgentCanvas agentId={selectedAgent.id} workspaceId={workspaceId} />
          ) : (
            <TestResults agentId={selectedAgent.id} />
          )}
        </div>
      </div>

      {showCreateModal && (
        <CreateAgentModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateAgent}
        />
      )}
    </div>
  );
}

function NavItem({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: any;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-2 py-1.5 text-sm transition"
      style={{
        color: active ? "var(--ink)" : "var(--ink-muted)",
        background: active ? "var(--canvas-subtle)" : "transparent",
        borderRadius: "var(--r-input)",
        fontWeight: active ? 500 : 400,
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "var(--canvas-subtle)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      <Icon className="h-3.5 w-3.5 flex-shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function NavSection({
  label,
  items,
  action,
  emptyLabel,
}: {
  label: string;
  items: Array<{
    id: string;
    label: string;
    active: boolean;
    onClick: () => void;
  }>;
  action?: React.ReactNode;
  emptyLabel?: string;
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="px-2">
      <div
        className="flex items-center justify-between px-2 py-1 group"
        style={{ color: "var(--ink-subtle)" }}
      >
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1.5 label-section"
          style={{ color: "var(--ink-subtle)" }}
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          {label}
        </button>
        {action}
      </div>

      {isExpanded && (
        <div className="mt-0.5 space-y-0.5">
          {items.length === 0 && emptyLabel ? (
            <div
              className="px-2 py-1.5 text-xs"
              style={{ color: "var(--ink-subtle)" }}
            >
              {emptyLabel}
            </div>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                onClick={item.onClick}
                className="w-full text-left px-2 py-1.5 text-sm flex items-center gap-2 transition truncate"
                style={{
                  color: item.active ? "var(--ink)" : "var(--ink-muted)",
                  background: item.active
                    ? "var(--canvas-subtle)"
                    : "transparent",
                  borderRadius: "var(--r-input)",
                  fontWeight: item.active ? 500 : 400,
                  borderLeft: item.active
                    ? "2px solid var(--accent)"
                    : "2px solid transparent",
                }}
                onMouseEnter={(e) => {
                  if (!item.active)
                    e.currentTarget.style.background = "var(--canvas-subtle)";
                }}
                onMouseLeave={(e) => {
                  if (!item.active)
                    e.currentTarget.style.background = "transparent";
                }}
              >
                <FileText className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function IconButton({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      title={title}
      className="p-1.5 transition"
      style={{
        color: "var(--ink-muted)",
        borderRadius: "var(--r-input)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--canvas-subtle)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}

function TabHeader({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="py-3 text-sm transition"
      style={{
        color: active ? "var(--ink)" : "var(--ink-muted)",
        fontWeight: active ? 500 : 400,
        borderBottom: active
          ? "2px solid var(--ink)"
          : "2px solid transparent",
        marginBottom: -1,
      }}
    >
      {label}
    </button>
  );
}
