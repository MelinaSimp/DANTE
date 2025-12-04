"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  Search,
  FileText,
  Database,
  User,
  Gauge,
  Code,
  Rocket,
  CheckCircle,
  Edit,
  RefreshCw,
  Zap,
  MoreVertical,
  MessageSquare,
  Phone,
  Layers,
  ChevronDown,
  ChevronUp,
  Folder,
  Plus,
  X,
  Trash2,
  Moon,
  Sun,
  Calendar,
  Clock,
  Sparkles,
} from "lucide-react";
import { useTheme } from "./ThemeProvider";
import AgentCanvas from "./AgentCanvas";
import CreateAgentModal from "./CreateAgentModal";
import EditAgentModal from "./EditAgentModal";
import CreateScenarioModal from "./CreateScenarioModal";
import AddDocModal from "./AddDocModal";
import TestResults from "./TestResults";
import SchedulePage from "./SchedulePage";
import PoliciesPage from "./PoliciesPage";
// REMOVED: DataSourcesPage - Data sources are now managed inline within Q/A steps
import PersonalizationPage from "./PersonalizationPage";
import EvaluationPage from "./EvaluationPage";
import AdvancedPage from "./AdvancedPage";
import ConfirmationModal from "./ConfirmationModal";
import ChatInterface from "./ChatInterface";

interface Agent {
  id: string;
  name: string;
  modality: "chat" | "voice" | "multi-modal";
  status: "draft" | "deployed" | "archived";
  description?: string;
  phoneNumber?: string;
  elevenlabsVoiceId?: string | null;
  created_at: string;
  updated_at: string;
}

interface Scenario {
  id: string;
  name: string;
  agentId: string;
  created_at: string;
  updated_at: string;
}

interface SupportingDoc {
  id: string;
  name: string;
  type: "file" | "text";
  agentId: string;
  created_at: string;
}

export default function GigaAIClient() {
  const { theme, setTheme, colors } = useTheme();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [supportingDocs, setSupportingDocs] = useState<SupportingDoc[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditAgentModal, setShowEditAgentModal] = useState(false);
  const [showCreateScenarioModal, setShowCreateScenarioModal] = useState(false);
  const [showAddDocModal, setShowAddDocModal] = useState(false);
  const [editingScenarioId, setEditingScenarioId] = useState<string | null>(null);
  const [editingScenarioName, setEditingScenarioName] = useState("");
  const [activeTab, setActiveTab] = useState<"canvas" | "test">("canvas");
  const [activePage, setActivePage] = useState<"scenarios" | "schedule" | "policies" | "personalization" | "evaluation" | "advanced">("scenarios");
  const [searchQuery, setSearchQuery] = useState("");
  const [agentsExpanded, setAgentsExpanded] = useState(true);
  const [scenariosExpanded, setScenariosExpanded] = useState(true);
  const [docsExpanded, setDocsExpanded] = useState(true);
  const [showAgentMenu, setShowAgentMenu] = useState<string | null>(null);
  const [showScenarioMenu, setShowScenarioMenu] = useState<string | null>(null);
  const [showDocMenu, setShowDocMenu] = useState<string | null>(null);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string>("Drift");
  const [confirmationModal, setConfirmationModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    variant?: "danger" | "warning" | "info";
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const agentMenuRef = useRef<HTMLDivElement>(null);
  const scenarioMenuRef = useRef<HTMLDivElement>(null);
  const docMenuRef = useRef<HTMLDivElement>(null);

  // Load workspace name
  useEffect(() => {
    async function loadWorkspace() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("workspace_id")
          .eq("id", user.id)
          .maybeSingle();

        if (profile?.workspace_id) {
          const { data: workspace } = await supabase
            .from("workspaces")
            .select("name")
            .eq("id", profile.workspace_id)
            .maybeSingle();

          if (workspace?.name) {
            setWorkspaceName(workspace.name);
          }
        }
      } catch (error) {
        console.error("Failed to load workspace:", error);
      }
    }
    loadWorkspace();
  }, []);

  // Load initial agents from API
  useEffect(() => {
    async function loadAgents() {
      try {
        const response = await fetch("/api/agents");
        if (response.ok) {
          const data = await response.json();
          setAgents(data.map((a: any) => ({
            id: a.id,
            name: a.name,
            modality: a.modality,
            status: a.status,
            description: a.description,
            phoneNumber: a.phone_number,
            elevenlabsVoiceId: a.elevenlabs_voice_id,
            created_at: a.created_at,
            updated_at: a.updated_at,
          })));
        }
      } catch (error) {
        console.error("Failed to load agents:", error);
      }
    }
    loadAgents();
  }, []);

      // Load scenarios and docs when agent is selected
      useEffect(() => {
        async function loadAgentData() {
          if (!selectedAgent) return;
          
          try {
            // Load scenarios
            const scenariosResponse = await fetch(`/api/agents/${selectedAgent.id}/scenarios`);
            if (scenariosResponse.ok) {
              const scenariosData = await scenariosResponse.json();
              const loadedScenarios = scenariosData.map((s: any) => ({
                id: s.id,
                name: s.name,
                agentId: s.agent_id,
                created_at: s.created_at,
                updated_at: s.updated_at,
              }));
              setScenarios(loadedScenarios);
              
              // Auto-select first scenario if none selected and we're on scenarios page
              if (activePage === "scenarios" && loadedScenarios.length > 0 && !selectedScenario) {
                setSelectedScenario(loadedScenarios[0]);
              }
            }

        // Load supporting docs
        const docsResponse = await fetch(`/api/agents/${selectedAgent.id}/supporting-docs`);
        if (docsResponse.ok) {
          const docsData = await docsResponse.json();
          setSupportingDocs(docsData.map((d: any) => ({
            id: d.id,
            name: d.name,
            type: d.type,
            agentId: d.agent_id,
            created_at: d.created_at,
          })));
        }
      } catch (error) {
        console.error("Failed to load agent data:", error);
      }
    }
    loadAgentData();
  }, [selectedAgent, activePage, selectedScenario]);

  const handleCreateAgent = async (agentData: { name: string; modality: "chat" | "voice" | "multi-modal"; description?: string }) => {
    try {
      const response = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agentData),
      });
      if (response.ok) {
        const data = await response.json();
        const newAgent: Agent = {
          id: data.id,
          name: data.name,
          modality: data.modality,
          status: data.status,
          description: data.description,
          phoneNumber: data.phone_number,
          created_at: data.created_at,
          updated_at: data.updated_at,
        };
        setAgents([newAgent, ...agents]);
        setSelectedAgent(newAgent);
        setShowCreateModal(false);
      } else {
        console.error("Failed to create agent");
      }
    } catch (error) {
      console.error("Failed to create agent:", error);
    }
  };

  const handleUpdateAgentPhoneNumber = async (phoneNumber: string) => {
    if (!selectedAgent) return;
    
    try {
      const response = await fetch(`/api/agents/${selectedAgent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number: phoneNumber.trim() || null }),
      });
      if (response.ok) {
        const data = await response.json();
        const updatedAgent: Agent = {
          id: data.id,
          name: data.name,
          modality: data.modality,
          status: data.status,
          description: data.description,
          phoneNumber: data.phone_number,
          created_at: data.created_at,
          updated_at: data.updated_at,
        };
        setSelectedAgent(updatedAgent);
        setAgents((prev) =>
          prev.map((agent) => (agent.id === selectedAgent.id ? updatedAgent : agent))
        );
      }
    } catch (error) {
      console.error("Failed to update phone number:", error);
    }
  };

  const handleSaveAgent = async (agentData: { name: string; modality: "chat" | "voice" | "multi-modal"; description?: string; phoneNumber?: string; elevenlabsVoiceId?: string | null }) => {
    if (!selectedAgent) return;
    
    try {
      const response = await fetch(`/api/agents/${selectedAgent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: agentData.name,
          modality: agentData.modality,
          description: agentData.description,
          phone_number: agentData.phoneNumber,
          elevenlabs_voice_id: agentData.elevenlabsVoiceId || null,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        const updatedAgent: Agent = {
          id: data.id,
          name: data.name,
          modality: data.modality,
          status: data.status,
          description: data.description,
          phoneNumber: data.phone_number,
          elevenlabsVoiceId: data.elevenlabs_voice_id,
          created_at: data.created_at,
          updated_at: data.updated_at,
        };
        setSelectedAgent(updatedAgent);
        setAgents((prev) =>
          prev.map((agent) => (agent.id === selectedAgent.id ? updatedAgent : agent))
        );
        setShowEditAgentModal(false);
      } else {
        console.error("Failed to save agent");
      }
    } catch (error) {
      console.error("Failed to save agent:", error);
    }
  };

  const handleCreateScenario = async (name: string) => {
    if (!selectedAgent) return;
    if (!name || !name.trim()) return;

    try {
      const response = await fetch(`/api/agents/${selectedAgent.id}/scenarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (response.ok) {
        const data = await response.json();
        const newScenario: Scenario = {
          id: data.id,
          name: data.name,
          agentId: data.agent_id,
          created_at: data.created_at,
          updated_at: data.updated_at,
        };
        setScenarios([...scenarios, newScenario]);
        setSelectedScenario(newScenario);
        setShowCreateScenarioModal(false);
        setActivePage("scenarios");
      } else {
        console.error("Failed to create scenario");
      }
    } catch (error) {
      console.error("Failed to create scenario:", error);
    }
  };

  const handleEditScenario = (scenario: Scenario) => {
    setEditingScenarioId(scenario.id);
    setEditingScenarioName(scenario.name);
    setShowScenarioMenu(null);
  };

  const handleSaveScenarioEdit = async () => {
    if (!editingScenarioId || !editingScenarioName.trim()) return;
    
    try {
      const response = await fetch(`/api/scenarios/${editingScenarioId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingScenarioName.trim() }),
      });
      if (response.ok) {
        const data = await response.json();
        setScenarios((prev) =>
          prev.map((s) =>
            s.id === editingScenarioId
              ? { ...s, name: data.name, updated_at: data.updated_at }
              : s
          )
        );
        if (selectedScenario?.id === editingScenarioId) {
          setSelectedScenario({ ...selectedScenario, name: data.name });
        }
        setEditingScenarioId(null);
        setEditingScenarioName("");
      } else {
        console.error("Failed to update scenario");
      }
    } catch (error) {
      console.error("Failed to update scenario:", error);
    }
  };

  const handleDeleteScenario = async (scenarioId: string) => {
    setConfirmationModal({
      isOpen: true,
      title: "Delete Scenario",
      message: "Are you sure you want to delete this scenario? This action cannot be undone.",
      confirmText: "Delete",
      cancelText: "Cancel",
      variant: "danger",
      onConfirm: async () => {
        setConfirmationModal({ ...confirmationModal, isOpen: false });
        try {
          const response = await fetch(`/api/scenarios/${scenarioId}`, {
            method: "DELETE",
          });
          if (response.ok) {
            setScenarios((prev) => prev.filter((s) => s.id !== scenarioId));
            if (selectedScenario?.id === scenarioId) {
              setSelectedScenario(null);
            }
            setShowScenarioMenu(null);
          } else {
            console.error("Failed to delete scenario");
          }
        } catch (error) {
          console.error("Failed to delete scenario:", error);
        }
      },
    });
  };

  const handleAddDoc = async (name: string, type: "file" | "text", content?: string, fileUrl?: string, fileSize?: number, fileType?: string) => {
    if (!selectedAgent || !name.trim()) return;
    
    try {
      const response = await fetch(`/api/agents/${selectedAgent.id}/supporting-docs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          type,
          content: type === "text" ? content : null,
          file_url: type === "file" ? fileUrl : null,
          file_size: type === "file" ? fileSize : null,
          file_type: type === "file" ? fileType : null,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        const newDoc: SupportingDoc = {
          id: data.id,
          name: data.name,
          type: data.type,
          agentId: data.agent_id,
          created_at: data.created_at,
        };
        setSupportingDocs([...supportingDocs, newDoc]);
        setShowAddDocModal(false);
      } else {
        console.error("Failed to add document");
      }
    } catch (error) {
      console.error("Failed to add document:", error);
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!selectedAgent) return;
    
    setConfirmationModal({
      isOpen: true,
      title: "Delete Document",
      message: "Are you sure you want to delete this document? This action cannot be undone.",
      confirmText: "Delete",
      cancelText: "Cancel",
      variant: "danger",
      onConfirm: async () => {
        setConfirmationModal({ ...confirmationModal, isOpen: false });
        try {
          const response = await fetch(`/api/agents/${selectedAgent.id}/supporting-docs/${docId}`, {
            method: "DELETE",
          });
          if (response.ok) {
            setSupportingDocs((prev) => prev.filter((d) => d.id !== docId));
            setShowDocMenu(null);
          } else {
            console.error("Failed to delete document");
          }
        } catch (error) {
          console.error("Failed to delete document:", error);
        }
      },
    });
  };

  const handleDeleteAgent = async (agentId: string) => {
    setConfirmationModal({
      isOpen: true,
      title: "Delete Agent",
      message: "Are you sure you want to delete this agent? This will delete all scenarios, steps, and related data. This action cannot be undone.",
      confirmText: "Delete",
      cancelText: "Cancel",
      variant: "danger",
      onConfirm: async () => {
        setConfirmationModal({ ...confirmationModal, isOpen: false });
        try {
          const response = await fetch(`/api/agents/${agentId}`, {
            method: "DELETE",
          });
          if (response.ok) {
            setAgents((prev) => prev.filter((a) => a.id !== agentId));
            if (selectedAgent?.id === agentId) {
              setSelectedAgent(null);
              setScenarios([]);
              setSelectedScenario(null);
              setSupportingDocs([]);
            }
            setShowAgentMenu(null);
          } else {
            console.error("Failed to delete agent");
            setConfirmationModal({
              isOpen: true,
              title: "Error",
              message: "Failed to delete agent. Please try again.",
              confirmText: "OK",
              cancelText: "",
              variant: "warning",
              onConfirm: () => setConfirmationModal({ ...confirmationModal, isOpen: false }),
            });
          }
        } catch (error) {
          console.error("Failed to delete agent:", error);
          setConfirmationModal({
            isOpen: true,
            title: "Error",
            message: "Failed to delete agent. Please try again.",
            confirmText: "OK",
            cancelText: "",
            variant: "warning",
            onConfirm: () => setConfirmationModal({ ...confirmationModal, isOpen: false }),
          });
        }
      },
    });
  };

  const handleEditAgentClick = (agent: Agent) => {
    setSelectedAgent(agent);
    setShowEditAgentModal(true);
    setShowAgentMenu(null);
  };

  const handleDeployAgent = async () => {
    if (!selectedAgent) return;

    // Validate agent has required configuration
    if (selectedAgent.modality === "voice" && !selectedAgent.phoneNumber) {
      setConfirmationModal({
        isOpen: true,
        title: "Cannot Deploy",
        message: "Voice agents require a phone number. Please add a phone number in Advanced settings.",
        confirmText: "OK",
        cancelText: "",
        variant: "warning",
        onConfirm: () => setConfirmationModal({ ...confirmationModal, isOpen: false }),
      });
      return;
    }

    // Check if agent has scenarios
    if (scenarios.length === 0) {
      setConfirmationModal({
        isOpen: true,
        title: "Cannot Deploy",
        message: "Agent must have at least one scenario before deployment.",
        confirmText: "OK",
        cancelText: "",
        variant: "warning",
        onConfirm: () => setConfirmationModal({ ...confirmationModal, isOpen: false }),
      });
      return;
    }

    setConfirmationModal({
      isOpen: true,
      title: "Deploy Agent",
      message: `Are you sure you want to deploy "${selectedAgent.name}"? This will make the agent live and ready to handle ${selectedAgent.modality} conversations.`,
      confirmText: "Deploy",
      cancelText: "Cancel",
      variant: "info",
      onConfirm: async () => {
        setConfirmationModal({ ...confirmationModal, isOpen: false });
        try {
          const response = await fetch(`/api/agents/${selectedAgent.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "deployed" }),
          });
          if (response.ok) {
            const data = await response.json();
            const updatedAgent = { ...selectedAgent, status: data.status };
            setSelectedAgent(updatedAgent);
            setAgents((prev) =>
              prev.map((agent) => (agent.id === selectedAgent.id ? updatedAgent : agent))
            );
            
            // Show success message
            setConfirmationModal({
              isOpen: true,
              title: "Agent Deployed",
              message: `"${selectedAgent.name}" is now live and ready to handle ${selectedAgent.modality} conversations!${
                selectedAgent.modality === "voice" && selectedAgent.phoneNumber
                  ? ` Calls to ${selectedAgent.phoneNumber} will be handled by this agent.`
                  : ""
              }`,
              confirmText: "OK",
              cancelText: "",
              variant: "info",
              onConfirm: () => setConfirmationModal({ ...confirmationModal, isOpen: false }),
            });
          } else {
            const error = await response.json();
            setConfirmationModal({
              isOpen: true,
              title: "Deployment Failed",
              message: error.error || "Failed to deploy agent. Please try again.",
              confirmText: "OK",
              cancelText: "",
              variant: "warning",
              onConfirm: () => setConfirmationModal({ ...confirmationModal, isOpen: false }),
            });
          }
        } catch (error) {
          console.error("Failed to deploy agent:", error);
          setConfirmationModal({
            isOpen: true,
            title: "Deployment Failed",
            message: "An error occurred while deploying the agent. Please try again.",
            confirmText: "OK",
            cancelText: "",
            variant: "warning",
            onConfirm: () => setConfirmationModal({ ...confirmationModal, isOpen: false }),
          });
        }
      },
    });
  };

  const handleCancelDeployment = async () => {
    if (!selectedAgent) return;

    setConfirmationModal({
      isOpen: true,
      title: "Cancel Deployment",
      message: `Are you sure you want to cancel deployment for "${selectedAgent.name}"? This will make the agent inactive and allow you to edit it again.`,
      confirmText: "Cancel Deployment",
      cancelText: "Keep Deployed",
      variant: "warning",
      onConfirm: async () => {
        setConfirmationModal({ ...confirmationModal, isOpen: false });
        try {
          const response = await fetch(`/api/agents/${selectedAgent.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "draft" }),
          });
          if (response.ok) {
            const data = await response.json();
            const updatedAgent = { ...selectedAgent, status: data.status };
            setSelectedAgent(updatedAgent);
            setAgents((prev) =>
              prev.map((agent) => (agent.id === selectedAgent.id ? updatedAgent : agent))
            );
            
            // Show success message
            setConfirmationModal({
              isOpen: true,
              title: "Deployment Cancelled",
              message: `"${selectedAgent.name}" is now in draft mode. You can edit it again.`,
              confirmText: "OK",
              cancelText: "",
              variant: "info",
              onConfirm: () => setConfirmationModal({ ...confirmationModal, isOpen: false }),
            });
          } else {
            const error = await response.json();
            setConfirmationModal({
              isOpen: true,
              title: "Cancel Failed",
              message: error.error || "Failed to cancel deployment. Please try again.",
              confirmText: "OK",
              cancelText: "",
              variant: "warning",
              onConfirm: () => setConfirmationModal({ ...confirmationModal, isOpen: false }),
            });
          }
        } catch (error) {
          console.error("Failed to cancel deployment:", error);
          setConfirmationModal({
            isOpen: true,
            title: "Cancel Failed",
            message: "An error occurred while cancelling deployment. Please try again.",
            confirmText: "OK",
            cancelText: "",
            variant: "warning",
            onConfirm: () => setConfirmationModal({ ...confirmationModal, isOpen: false }),
          });
        }
      },
    });
  };

  const getModalityIcon = (modality: string) => {
    const iconColor = colors.icon;
    switch (modality) {
      case "chat":
        return <MessageSquare className={`h-4 w-4 ${iconColor}`} />;
      case "voice":
        return <Phone className={`h-4 w-4 ${iconColor}`} />;
      case "multi-modal":
        return <Layers className={`h-4 w-4 ${iconColor}`} />;
      default:
        return <MessageSquare className={`h-4 w-4 ${iconColor}`} />;
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

  // Use theme colors from ThemeProvider
  const themeClasses = {
    bgMain: colors.bg,
    bgSidebar: colors.bgSecondary,
    bgInput: colors.inputBg,
    bgHover: colors.hover,
    bgSelected: colors.selected,
    menuBg: colors.cardBg,
    textPrimary: colors.text,
    textSecondary: colors.textSecondary,
    textTertiary: colors.textTertiary,
    border: colors.border,
    icon: colors.iconSecondary,
    iconActive: colors.iconActive,
    selected: colors.selected,
    menuItem: colors.textSecondary + " " + colors.hover,
    bgActive: colors.bgTertiary,
    btnPrimary: colors.buttonPrimary + " " + colors.buttonPrimaryHover + " text-white",
    bgCard: colors.cardBg,
    textQuaternary: colors.textTertiary,
  };

  // Light theme sidebar colors
  const sidebarTextColor = "text-[#151515]";
  const sidebarTextSecondary = "text-[#151515]/90";
  const sidebarTextTertiary = "text-[#151515]/70";
  const sidebarBg = "bg-[#ffffff]";
  const sidebarBorder = "border-[#151515]";
  const sidebarIcon = "text-[#151515]";
  const sidebarIconSecondary = "text-[#151515]/70";

  return (
    <div className={`flex h-screen overflow-hidden ${themeClasses.textPrimary} bg-[#ffffff]`} style={{ background: '#ffffff', backgroundImage: 'none' }}>
      {/* Left Sidebar */}
      <div className={`w-64 border-r border-[#151515] ${sidebarBg} flex flex-col`}>
        {/* Top Logo/Brand */}
        <div className={`p-4 border-b ${sidebarBorder}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center flex-shrink-0">
              </div>
              <span className={`text-lg font-semibold ${sidebarTextColor}`}>{workspaceName}</span>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className={`p-4 border-b ${themeClasses.border}`}>
          <div className="relative">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${themeClasses.icon}`} />
                  <input
                  type="text"
                  placeholder="Search agents, scenario ⌘K"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full pl-9 pr-8 py-2 rounded-2xl bg-[#ffffff] border border-[#3166bf] ${sidebarTextColor} text-xs placeholder:${sidebarTextTertiary} focus:outline-none focus:border-[#3166bf]`}
                />
          </div>
        </div>

        {/* Scrollable Sidebar Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Agents Section - Always visible, at the top */}
          <div className="p-4">
            <div className="flex items-center justify-between mb-1">
              <button
                onClick={() => setAgentsExpanded(!agentsExpanded)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-2xl ${sidebarTextSecondary} hover:bg-[#f3f4f6] transition text-xs`}
                  >
                    <div className="flex items-center gap-3">
                      <Folder className={`h-4 w-4 ${sidebarIconSecondary}`} />
                      Agents
                </div>
                {agentsExpanded ? (
                  <ChevronUp className={`h-3 w-3 ${sidebarIconSecondary}`} />
                ) : (
                  <ChevronDown className={`h-3 w-3 ${sidebarIconSecondary}`} />
                )}
              </button>
            </div>
            {agentsExpanded && (
              <div className="ml-4 mt-1 space-y-1">
                {agents
                  .filter((agent) => 
                    !searchQuery || 
                    agent.name.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map((agent) => (
                  <div key={agent.id} className="relative group" ref={agentMenuRef}>
                    <button
                      onClick={() => {
                        setSelectedAgent(agent);
                        setActivePage("scenarios");
                      }}
                      className={`w-full text-left px-3 py-2 rounded-2xl text-sm transition flex items-center justify-between ${
                        selectedAgent?.id === agent.id
                          ? "bg-[#70d4b4] text-[#151515] border border-[#151515]"
                          : `${sidebarTextTertiary} hover:bg-[#f3f4f6]`
                      }`}
                    >
                      <span className="flex items-center gap-2 flex-1 min-w-0">
                        {getModalityIcon(agent.modality)}
                        <span className="truncate">{agent.name}</span>
                      </span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowAgentMenu(showAgentMenu === agent.id ? null : agent.id);
                          }}
                          className="p-1 hover:bg-white/10 rounded-full"
                        >
                          <MoreVertical className="h-3 w-3" />
                        </button>
                      </div>
                    </button>
                    {showAgentMenu === agent.id && (
                      <div className={`absolute right-0 top-full mt-1 z-20 bg-[#ffffff] border border-[#e5e7eb] rounded-2xl shadow-lg min-w-[120px]`}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditAgentClick(agent);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm ${sidebarTextSecondary} hover:bg-[#f3f4f6] flex items-center gap-2`}
                        >
                          <Edit className="h-3 w-3" />
                          Edit
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteAgent(agent.id);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/20 flex items-center gap-2`}
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => setShowCreateModal(true)}
                      className={`w-full text-left px-3 py-2 rounded-2xl text-xs ${sidebarTextTertiary} hover:bg-[#f3f4f6] flex items-center gap-2 border border-dashed border-[#e5e7eb]`}
                    >
                      <Plus className={`h-3 w-3 ${sidebarIconSecondary}`} />
                      Add agent
                    </button>
              </div>
            )}
          </div>

          {/* Navigation - Only show when agent is selected */}
          {selectedAgent && (
            <nav className="p-4 space-y-1 border-t border-[#151515]">
              <NavItem
                icon={FileText}
                label="Scenarios"
                active={activePage === "scenarios"}
                onClick={() => {
                  setActivePage("scenarios");
                  // Auto-select first scenario if available
                  if (selectedAgent && scenarios.length > 0 && !selectedScenario) {
                    setSelectedScenario(scenarios[0]);
                  }
                }}
              />
              <NavItem
                icon={Calendar}
                label="Schedule"
                active={activePage === "schedule"}
                onClick={() => setActivePage("schedule")}
              />
              <NavItem
                icon={FileText}
                label="Policies"
                active={activePage === "policies"}
                onClick={() => setActivePage("policies")}
              />
              {/* REMOVED: Data sources tab - Data sources are now managed inline within Q/A steps */}
              <NavItem
                icon={User}
                label="Personalization"
                active={activePage === "personalization"}
                onClick={() => setActivePage("personalization")}
              />
              <NavItem
                icon={Gauge}
                label="Evaluation"
                active={activePage === "evaluation"}
                onClick={() => setActivePage("evaluation")}
              />
              <NavItem
                icon={Code}
                label="Advanced"
                active={activePage === "advanced"}
                onClick={() => setActivePage("advanced")}
              />
            </nav>
          )}

          {/* Scenarios Section - Only show when agent is selected */}
          {selectedAgent && (
            <div className="p-4 border-t border-white/10">
              <div className="mt-4">
              <div className="flex items-center justify-between mb-1">
                  <button
                      onClick={() => setScenariosExpanded(!scenariosExpanded)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-2xl ${sidebarTextSecondary} hover:bg-[#f3f4f6] transition text-xs`}
                  >
                    <div className="flex items-center gap-3">
                      <Folder className={`h-4 w-4 ${sidebarIconSecondary}`} />
                      Scenarios
                    </div>
                    {scenariosExpanded ? (
                      <ChevronUp className={`h-3 w-3 ${sidebarIconSecondary}`} />
                    ) : (
                      <ChevronDown className={`h-3 w-3 ${sidebarIconSecondary}`} />
                    )}
                  </button>
              </div>
              {scenariosExpanded && (
                <div className="ml-4 mt-1 space-y-1">
                  {/* Scenarios List */}
                  {scenarios
                    .filter((scenario) =>
                      !searchQuery ||
                      scenario.name.toLowerCase().includes(searchQuery.toLowerCase())
                    )
                    .map((scenario) => (
                      <div key={scenario.id} className="relative">
                        {editingScenarioId === scenario.id ? (
                          <div className={`flex items-center gap-2 p-2 rounded-2xl bg-[#ffffff] border border-[#e5e7eb]`}>
                            <input
                              type="text"
                              value={editingScenarioName}
                              onChange={(e) => setEditingScenarioName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  handleSaveScenarioEdit();
                                } else if (e.key === "Escape") {
                                  setEditingScenarioId(null);
                                  setEditingScenarioName("");
                                }
                              }}
                              className={`flex-1 px-2 py-1 rounded-2xl bg-[#ffffff] border border-[#3166bf] text-xs ${sidebarTextColor} focus:border-[#3166bf] focus:outline-none`}
                              autoFocus
                            />
                            <button
                              onClick={handleSaveScenarioEdit}
                              className={`p-1 ${themeClasses.bgHover} rounded-full`}
                            >
                              <CheckCircle className="h-4 w-4 text-green-400" />
                            </button>
                            <button
                              onClick={() => {
                                setEditingScenarioId(null);
                                setEditingScenarioName("");
                              }}
                              className={`p-1 ${themeClasses.bgHover} rounded-full`}
                            >
                              <X className={`h-4 w-4 ${themeClasses.textTertiary}`} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setSelectedScenario(scenario);
                              setActivePage("scenarios");
                            }}
                            className={`w-full text-left px-3 py-2 rounded-2xl text-sm transition flex items-center justify-between group ${
                              selectedScenario?.id === scenario.id
                                ? "bg-[#70d4b4] text-[#151515] border border-[#151515]"
                                : `${sidebarTextTertiary} hover:bg-[#f3f4f6]`
                            }`}
                          >
                            <span className="flex items-center gap-2 flex-1 min-w-0">
                              <FileText className={`h-3 w-3 flex-shrink-0 ${themeClasses.icon}`} />
                              <span className="truncate">{scenario.name}</span>
                            </span>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowScenarioMenu(showScenarioMenu === scenario.id ? null : scenario.id);
                                }}
                                    className={`p-1 hover:bg-[#f3f4f6] rounded-full`}
                                  >
                                    <MoreVertical className={`h-3 w-3 ${sidebarIconSecondary}`} />
                              </button>
                            </div>
                            {showScenarioMenu === scenario.id && (
                              <div className={`absolute right-0 top-full mt-1 z-10 bg-[#ffffff] border border-[#e5e7eb] rounded-2xl shadow-lg min-w-[120px]`}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditScenario(scenario);
                                  }}
                                  className={`w-full text-left px-3 py-2 text-sm ${sidebarTextSecondary} hover:bg-[#f3f4f6] flex items-center gap-2`}
                                >
                                  <Edit className="h-3 w-3" />
                                  Edit
                                </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteScenario(scenario.id);
                                    }}
                                    className={`w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/20 flex items-center gap-2`}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                    Delete
                                  </button>
                                </div>
                              )}
                          </button>
                        )}
                      </div>
                    ))}
                  {/* Add Scenario Button */}
                      <button
                        onClick={() => setShowCreateScenarioModal(true)}
                        className={`w-full text-left px-3 py-2 rounded-2xl text-xs ${sidebarTextTertiary} hover:bg-[#f3f4f6] flex items-center gap-2 border border-dashed border-[#e5e7eb]`}
                      >
                        <Plus className={`h-3 w-3 ${sidebarIconSecondary}`} />
                        Add scenario
                      </button>
                </div>
              )}
              </div>
            </div>
          )}

          {/* Supporting Docs Section - Only show when agent is selected */}
          {selectedAgent && (
            <div className="p-4 border-t border-white/10">
              <div className="mt-4">
              <button
                onClick={() => setDocsExpanded(!docsExpanded)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-2xl ${sidebarTextSecondary} hover:bg-[#f3f4f6] transition text-xs`}
              >
                <div className="flex items-center gap-3">
                  <Folder className={`h-4 w-4 ${sidebarIconSecondary}`} />
                  Supporting docs
                </div>
                {docsExpanded ? (
                  <ChevronUp className={`h-3 w-3 ${sidebarIconSecondary}`} />
                ) : (
                  <ChevronDown className={`h-3 w-3 ${sidebarIconSecondary}`} />
                )}
              </button>
              {docsExpanded && (
                <div className="ml-4 mt-1 space-y-1">
                {supportingDocs.length === 0 ? (
                        <div className={`text-xs ${sidebarTextTertiary} px-3 py-2`}>
                          No documents yet
                        </div>
                ) : (
                  supportingDocs.map((doc) => (
                    <div key={doc.id} className="relative group">
                            <button className={`w-full text-left px-3 py-2 rounded-2xl text-sm ${sidebarTextTertiary} hover:bg-[#f3f4f6] flex items-center justify-between`}>
                              <span className="flex items-center gap-2 flex-1 min-w-0">
                                <FileText className={`h-3 w-3 flex-shrink-0 ${sidebarIconSecondary}`} />
                                <span className="truncate">{doc.name}</span>
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowDocMenu(showDocMenu === doc.id ? null : doc.id);
                                }}
                                className={`p-1 hover:bg-gray-100 rounded-full opacity-0 group-hover:opacity-100 transition`}
                              >
                                <MoreVertical className={`h-3 w-3 ${sidebarIconSecondary}`} />
                              </button>
                              {showDocMenu === doc.id && (
                                <div className={`absolute right-0 top-full mt-1 z-10 bg-[#ffffff] border border-[#e5e7eb] rounded-2xl shadow-lg min-w-[120px]`}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteDoc(doc.id);
                                    }}
                                    className={`w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/20 flex items-center gap-2`}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                    Delete
                                  </button>
                                </div>
                              )}
                            </button>
                    </div>
                  ))
                )}
                      <button
                        onClick={() => setShowAddDocModal(true)}
                        className={`w-full text-left px-3 py-2 rounded-2xl text-xs ${sidebarTextTertiary} hover:bg-[#f3f4f6] flex items-center gap-2 border border-dashed border-[#e5e7eb]`}
                      >
                        <Plus className={`h-3 w-3 ${sidebarIconSecondary}`} />
                        Add document
                      </button>
                </div>
              )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className={`flex-1 flex flex-col overflow-hidden bg-[#ffffff]`} style={{ background: '#ffffff', backgroundImage: 'none' }}>
        {/* Top Header */}
        {selectedAgent && (
          <div className={`border-b ${themeClasses.border} ${themeClasses.bgSidebar} px-6 py-3`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {/* Agent Icon - Colorful gradient sphere */}
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 via-pink-400 to-orange-400 flex items-center justify-center flex-shrink-0">
                </div>

                {/* Agent Info */}
                <div className="flex items-center gap-2">
                  <h1 className={`text-base font-semibold ${themeClasses.textPrimary}`}>{selectedAgent.name}</h1>
                  <span className="text-[#FF9838] text-xs">Co</span>
                  <span className={`text-xs ${themeClasses.textTertiary}`}>{getModalityLabel(selectedAgent.modality)}</span>
                </div>
              </div>

              {/* Right Side Actions */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-3 text-xs">
                  <span className={`flex items-center gap-1 ${selectedAgent.status === "deployed" ? "text-green-400" : themeClasses.textPrimary}`}>
                    {selectedAgent.status === "deployed" ? (
                      <CheckCircle className="h-3 w-3 text-green-400" />
                    ) : (
                      <Edit className="h-3 w-3" />
                    )}
                    {selectedAgent.status}
                  </span>
                  <span className={`flex items-center gap-1 ${themeClasses.textTertiary}`}>
                    <CheckCircle className="h-3 w-3 text-green-400" />
                    updated a min ago
                  </span>
                </div>
                {selectedAgent.status !== "deployed" ? (
                  <button 
                    onClick={handleDeployAgent}
                    className={`flex items-center gap-2 px-4 py-2 rounded-3xl bg-[#3166bf] border border-[#3166bf] text-white text-xs font-medium transition hover:bg-[#2a5aa8]`}
                  >
                    <Rocket className="h-3 w-3" />
                    Deploy agent
                    <div className="w-px h-4 bg-white/20 mx-1"></div>
                    <ChevronDown className="h-3 w-3" />
                  </button>
                ) : (
                  <button
                    onClick={handleCancelDeployment}
                    className={`group flex items-center gap-2 px-4 py-2 rounded-3xl bg-[#ebf9ef] border border-[#70d4b4] text-[#e8f6f3] hover:bg-[#fef2f2] hover:border-[#f0494a] hover:text-[#f0494a] text-xs font-medium transition`}
                  >
                    <CheckCircle className="h-3 w-3 group-hover:hidden" />
                    <X className="h-3 w-3 hidden group-hover:block" />
                    <span className="group-hover:hidden">Deployed</span>
                    <span className="hidden group-hover:inline">Cancel Deployment</span>
                  </button>
                )}
                <button className={`p-2 ${themeClasses.bgHover} rounded-2xl transition`}>
                  <RefreshCw className={`h-3 w-3 ${themeClasses.iconSecondary}`} />
                </button>
                <button className={`p-2 ${themeClasses.bgHover} rounded-2xl transition`}>
                  <Clock className={`h-3 w-3 ${themeClasses.iconSecondary}`} />
                </button>
                <button className={`p-2 ${themeClasses.bgHover} rounded-2xl transition`}>
                  <Sparkles className={`h-3 w-3 ${themeClasses.iconSecondary}`} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Warning Banner for Voice Agents */}
        {selectedAgent && selectedAgent.modality === "voice" && (
          (!selectedAgent.phoneNumber || selectedAgent.status !== "deployed") && (
            <div className={`px-6 py-3 ${themeClasses.bgSidebar} border-b ${themeClasses.border}`}>
              <div className={`flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#fffbeb] border border-[#fbbf24]/30 text-[#fbbf24] text-xs`}>
                {!selectedAgent.phoneNumber ? (
                  <>
                    <Phone className="h-4 w-4" />
                    <span>Voice agent requires a phone number. Add one in <strong>Advanced</strong> settings.</span>
                  </>
                ) : selectedAgent.status !== "deployed" ? (
                  <>
                    <Rocket className="h-4 w-4" />
                    <span>Agent is not deployed. Click <strong>Deploy agent</strong> to make it live.</span>
                  </>
                ) : null}
              </div>
            </div>
          )
        )}

        {/* Tabs */}
        {selectedAgent && (
          <div className={`border-b ${themeClasses.border} ${themeClasses.bgSidebar} px-6 py-4`}>
            <div className="flex gap-4 items-baseline">
              <button
                onClick={() => setActiveTab("canvas")}
                className={`px-4 py-2 min-h-[40px] rounded-3xl border-2 transition text-sm font-medium flex items-center justify-center whitespace-nowrap leading-none ${
                  activeTab === "canvas"
                    ? "border-[#3166bf] bg-[#3166bf]/20 text-[#3166bf]"
                    : `border-[#e5e7eb] ${themeClasses.textTertiary} hover:border-[#3166bf] hover:${themeClasses.textSecondary}`
                }`}
              >
                Agent Canvas
              </button>
              <button
                onClick={() => setActiveTab("test")}
                className={`px-4 py-2 min-h-[40px] rounded-3xl border-2 transition text-sm font-medium flex items-center justify-center whitespace-nowrap leading-none ${
                  activeTab === "test"
                    ? "border-blue-600 bg-blue-600/20 text-blue-600"
                    : `border-white/10 ${themeClasses.textTertiary} hover:border-white/20 hover:${themeClasses.textSecondary}`
                }`}
              >
                Test Results
              </button>
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className={`flex-1 overflow-y-auto relative ${colors.text}`} style={{ background: '#242423', backgroundImage: 'url(/backgrounds/dunes.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}>
            {activePage === "scenarios" ? (
                // Scenarios page - full page, no gradient background
                selectedAgent && selectedScenario ? (
                  activeTab === "canvas" ? (
                    <AgentCanvas
                      agentId={selectedAgent.id}
                      scenarioId={selectedScenario.id}
                      scenarioName={selectedScenario.name}
                      isDeployed={selectedAgent?.status?.toLowerCase() === "deployed"}
                    />
                  ) : activeTab === "test" ? (
                    selectedAgent.modality === "chat" ? (
                      <ChatInterface agentId={selectedAgent.id} />
                    ) : (
                      <TestResults agentId={selectedAgent.id} />
                    )
                  ) : null
                ) : selectedAgent ? (
                  <div className="flex items-center justify-center h-full bg-[#242423]" style={{ background: '#242423' }}>
                    <div className="text-center max-w-md">
                      <div className="mb-6">
                        <Folder className={`h-16 w-16 text-white/50 mx-auto mb-4`} />
                        <h2 className={`text-2xl font-semibold text-white mb-2`}>No scenario selected</h2>
                        <p className={`text-white/70 text-sm`}>
                          {scenarios.length === 0
                            ? "Create a scenario to start building your agent flow"
                            : "Select a scenario or create a new one"}
                        </p>
                      </div>
                      {scenarios.length === 0 ? (
                        <button
                          onClick={() => setShowCreateScenarioModal(true)}
                          className={`px-8 py-4 rounded-3xl bg-[#3351ff] hover:bg-[#4a64ff] text-white font-medium transition text-lg`}
                        >
                          Create your first scenario
                        </button>
                      ) : (
                        <div className="space-y-3">
                          {scenarios.map((scenario) => (
                            <button
                              key={scenario.id}
                              onClick={() => setSelectedScenario(scenario)}
                              className={`w-full px-6 py-3 rounded-2xl border border-white/10 bg-[#242423] text-white hover:bg-[#242423]/80 transition text-left text-xs`}
                            >
                              {scenario.name}
                            </button>
                          ))}
                          <button
                            onClick={() => setShowCreateScenarioModal(true)}
                            className={`w-full px-6 py-3 rounded-3xl bg-[#3351ff] hover:bg-[#4a64ff] text-white font-medium transition`}
                          >
                            + Create new scenario
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : null
              ) : (
                // All other pages
                <div className={`h-full ${colors.bg} ${colors.text}`}>
                  {activePage === "schedule" ? (
                    <SchedulePage />
                  ) : activePage === "policies" ? (
                    selectedAgent ? <PoliciesPage agentId={selectedAgent.id} /> : null
                  ) : activePage === "personalization" ? (
                    <PersonalizationPage agentId={selectedAgent?.id} />
                  ) : activePage === "evaluation" ? (
                    selectedAgent ? <EvaluationPage agentId={selectedAgent.id} /> : null
                  ) : activePage === "advanced" ? (
                    selectedAgent ? (
                      <AdvancedPage
                        agentId={selectedAgent.id}
                        phoneNumber={selectedAgent.phoneNumber || ""}
                        onPhoneNumberChange={handleUpdateAgentPhoneNumber}
                      />
                    ) : null
                  ) : null}
                </div>
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

      {/* Create Scenario Modal */}
      {showCreateScenarioModal && (
        <CreateScenarioModal
          onClose={() => setShowCreateScenarioModal(false)}
          onCreate={handleCreateScenario}
        />
      )}

      {/* Add Document Modal */}
          {showAddDocModal && selectedAgent && (
            <AddDocModal
              onClose={() => setShowAddDocModal(false)}
              onAdd={handleAddDoc}
              agentId={selectedAgent.id}
            />
          )}

      {/* Edit Agent Modal */}
      {showEditAgentModal && selectedAgent && (
        <EditAgentModal
          agent={selectedAgent}
          onClose={() => setShowEditAgentModal(false)}
          onSave={handleSaveAgent}
        />
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmationModal.isOpen}
        title={confirmationModal.title}
        message={confirmationModal.message}
        confirmText={confirmationModal.confirmText}
        cancelText={confirmationModal.cancelText}
        variant={confirmationModal.variant}
        onConfirm={confirmationModal.onConfirm}
        onCancel={() => setConfirmationModal({ ...confirmationModal, isOpen: false })}
      />
    </div>
  );
}

function NavItem({
  icon: Icon,
  label,
  active = false,
  onClick,
}: {
  icon: any;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const bgActive = "bg-[#70d4b4] text-[#151515]";
  const bgInactive = "text-[#151515]/90 hover:bg-[#f3f4f6]";
  const iconColorClass = active ? "text-[#3166bf]" : "text-[#151515]/70";
  
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-2xl transition text-xs ${
        active ? bgActive : bgInactive
      }`}
    >
      <Icon className={`h-4 w-4 ${iconColorClass}`} />
      {label}
    </button>
  );
}
