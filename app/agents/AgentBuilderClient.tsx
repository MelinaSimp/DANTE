"use client";

import { useState, useEffect } from "react";
import { Plus, Search, FileText, Database, User, Gauge, Code, Rocket, CheckCircle, Clock, MoreVertical, MessageSquare, Phone, Layers, ChevronDown, Edit, RefreshCw, Zap } from "lucide-react";
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

export default function AgentBuilderClient({ workspaceId, initialAgents }: AgentBuilderClientProps) {
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"canvas" | "test">("canvas");
  const [searchQuery, setSearchQuery] = useState("");

  // Auto-select first agent if available
  useEffect(() => {
    if (agents.length > 0 && !selectedAgent) {
      setSelectedAgent(agents[0]);
    }
  }, [agents, selectedAgent]);

  const filteredAgents = agents.filter((agent) =>
    agent.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateAgent = async (agentData: { name: string; modality: "chat" | "voice" | "multi-modal"; description?: string }) => {
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
    switch (modality) {
      case "chat":
        return <MessageSquare className="h-4 w-4 text-orange-400" />;
      case "voice":
        return <Phone className="h-4 w-4 text-white" />;
      case "multi-modal":
        return <Layers className="h-4 w-4 text-orange-400" />;
      default:
        return <MessageSquare className="h-4 w-4" />;
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
    <div className="flex h-screen overflow-hidden text-white bg-[#1a1612]">
      {/* Left Sidebar - Drift Style */}
      <div className="w-64 border-r border-white/10 bg-[#1a1612]/80 backdrop-blur flex flex-col">
        {/* Top Logo/Brand */}
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 via-purple-500 to-blue-500 flex items-center justify-center">
            </div>
            <span className="text-lg font-semibold">Drift</span>
          </div>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-white/10">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <input
              type="text"
              placeholder="Search…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 rounded-lg bg-black/40 border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/20"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/30 font-mono">⌘K</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          <NavItem icon={FileText} label="Policies" />
          <NavItem icon={Database} label="Data sources" />
          <NavItem icon={User} label="Personalization" />
          <NavItem icon={Gauge} label="Evaluation" />
          <NavItem icon={Code} label="Advanced" />
          
          <div className="mt-4">
            <NavSection
              icon={Layers}
              label="Scenarios"
              items={filteredAgents.map((agent) => ({
                id: agent.id,
                label: agent.name,
                active: selectedAgent?.id === agent.id,
                onClick: () => setSelectedAgent(agent),
              }))}
            />
          </div>

          <div className="mt-4">
            <NavSection
              icon={FileText}
              label="Supporting docs"
              items={[
                { id: "1", label: "Compliance guidelines.pdf", active: false, onClick: () => {} },
                { id: "2", label: "ID verification.csv", active: false, onClick: () => {} },
                { id: "3", label: "Escalation flowchart.png", active: false, onClick: () => {} },
              ]}
              collapsed={false}
            />
          </div>
        </nav>

        {/* Bottom Info */}
        <div className="p-4 border-t border-white/10 space-y-2 text-xs text-white/60">
          <div className="flex items-center justify-between">
            <span>Brand</span>
            <span className="text-white/40">Rules</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Remaining memory</span>
            <span className="text-green-400">High</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Last locked by</span>
            <span className="text-white/40">Internal system</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#1a1612]">
        {/* Top Header - GigaAI Style */}
        {selectedAgent && (
          <div className="border-b border-white/10 bg-[#1a1612]/80 backdrop-blur px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {/* Agent Icon */}
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 via-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0">
                </div>
                
                {/* Agent Info */}
                <div className="flex items-center gap-3">
                  <div>
                    <h1 className="text-lg font-semibold text-white">{selectedAgent.name}</h1>
                    <div className="flex items-center gap-2 text-sm text-white/60">
                      <span className="flex items-center gap-1">
                        {getModalityIcon(selectedAgent.modality)}
                        {getModalityLabel(selectedAgent.modality)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Side Actions */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="flex items-center gap-1 px-2 py-1 rounded bg-white/10 text-white/70 text-xs">
                    <Edit className="h-3 w-3" />
                    draft
                  </span>
                  <span className="flex items-center gap-1 text-white/60 text-xs">
                    <CheckCircle className="h-3 w-3" />
                    updated a min ago
                  </span>
                </div>
                <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#3351ff] hover:bg-[#4a64ff] text-white text-sm font-medium transition">
                  <Rocket className="h-4 w-4" />
                  Deploy agent
                  <ChevronDown className="h-3 w-3" />
                </button>
                <button className="p-2 hover:bg-white/5 rounded-lg transition">
                  <RefreshCw className="h-4 w-4 text-white/60" />
                </button>
                <button className="p-2 hover:bg-white/5 rounded-lg transition">
                  <Zap className="h-4 w-4 text-white/60" />
                </button>
                <button className="p-2 hover:bg-white/5 rounded-lg transition">
                  <MoreVertical className="h-4 w-4 text-white/60" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tabs - GigaAI Style */}
        {selectedAgent && (
          <div className="border-b border-white/10 bg-[#1a1612]/80 backdrop-blur px-6">
            <div className="flex gap-1">
              <button
                onClick={() => setActiveTab("canvas")}
                className={`px-4 py-2 text-sm font-medium transition ${
                  activeTab === "canvas"
                    ? "text-white border-b-2 border-[#3351ff]"
                    : "text-white/60 hover:text-white"
                }`}
              >
                Agent Canvas
              </button>
              <button
                onClick={() => setActiveTab("test")}
                className={`px-4 py-2 text-sm font-medium transition ${
                  activeTab === "test"
                    ? "text-white border-b-2 border-[#3351ff]"
                    : "text-white/60 hover:text-white"
                }`}
              >
                Test Results
              </button>
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          {!selectedAgent ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-white/60 mb-4">Select an agent to start building</p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-6 py-3 rounded-lg bg-[#3351ff] hover:bg-[#4a64ff] text-white font-medium transition"
                >
                  Create New Agent
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

      {/* Create Agent Modal */}
      {showCreateModal && (
        <CreateAgentModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateAgent}
        />
      )}
    </div>
  );
}

function NavItem({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-white/70 hover:bg-white/5 hover:text-white transition text-sm">
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function NavSection({
  icon: Icon,
  label,
  items,
  collapsed = false,
}: {
  icon: any;
  label: string;
  items: Array<{ id: string; label: string; active: boolean; onClick: () => void }>;
  collapsed?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(!collapsed);

  return (
    <div>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-white/70 hover:bg-white/5 hover:text-white transition text-sm"
      >
        <div className="flex items-center gap-3">
          <Icon className="h-4 w-4" />
          {label}
        </div>
        <span className="text-xs">{isExpanded ? "▲" : "▼"}</span>
      </button>
      {isExpanded && items.length > 0 && (
        <div className="ml-4 mt-1 space-y-1">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={item.onClick}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition flex items-center justify-between ${
                item.active
                  ? "bg-white/10 text-white"
                  : "text-white/60 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-2">
                <FileText className="h-3 w-3" />
                {item.label}
              </span>
              {item.active && <MoreVertical className="h-3 w-3" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
