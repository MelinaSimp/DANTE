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
  Brain,
  Shield,
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
import DataSourcesPage from "./DataSourcesPage";
import PersonalizationPage from "./PersonalizationPage";
import EvaluationPage from "./EvaluationPage";
import AdvancedPage from "./AdvancedPage";
import ConfirmationModal from "./ConfirmationModal";
import ChatInterface from "./ChatInterface";
import InboxPage from "./InboxPage";
import LLMPage from "./LLMPage";
import ValidationPanel from "./ValidationPanel";
import FlowTester from "./FlowTester";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, AgentListSkeleton } from "@/components/ui/skeleton";

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

interface GigaAIClientProps {
  initialError?: string;
  initialSuccess?: string;
  initialMessage?: string;
}

function GigaAIClient({ initialError, initialSuccess, initialMessage }: GigaAIClientProps = {}) {
  const { theme, setTheme, colors } = useTheme();
  const toast = useToast();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [selectedScenarioWithSteps, setSelectedScenarioWithSteps] = useState<any>(null);
  const [supportingDocs, setSupportingDocs] = useState<SupportingDoc[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditAgentModal, setShowEditAgentModal] = useState(false);
  const [showCreateScenarioModal, setShowCreateScenarioModal] = useState(false);
  const [showAddDocModal, setShowAddDocModal] = useState(false);
  const [editingScenarioId, setEditingScenarioId] = useState<string | null>(null);
  const [editingScenarioName, setEditingScenarioName] = useState("");
  const [activeTab, setActiveTab] = useState<"canvas" | "test">("canvas");
  const [activePage, setActivePage] = useState<"scenarios" | "schedule" | "policies" | "data-sources" | "personalization" | "evaluation" | "advanced" | "inbox" | "llm">("scenarios");
  const [searchQuery, setSearchQuery] = useState("");
  const [agentsExpanded, setAgentsExpanded] = useState(true);
  const [scenariosExpanded, setScenariosExpanded] = useState(true);
  const [docsExpanded, setDocsExpanded] = useState(true);
  const [showAgentMenu, setShowAgentMenu] = useState<string | null>(null);
  const [showScenarioMenu, setShowScenarioMenu] = useState<string | null>(null);
  const [showDocMenu, setShowDocMenu] = useState<string | null>(null);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string>("Drift");
  const [isSuperadmin, setIsSuperadmin] = useState<boolean>(false);
  const [showValidationPanel, setShowValidationPanel] = useState(false);
  const [showFlowTester, setShowFlowTester] = useState(false);
  const [hasTwilioCredentials, setHasTwilioCredentials] = useState(false);
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

  // Show OAuth error/success messages on mount
  useEffect(() => {
    if (initialError) {
      let title = "OAuth Error";
      let message = initialMessage || "Failed to connect Google Calendar";
      
      if (initialError === "oauth_config_missing") {
        title = "Configuration Missing";
        message = "Google OAuth credentials are not configured. Please contact your administrator or check your environment variables.";
      } else if (initialError === "oauth_failed") {
        message = initialMessage || "Failed to connect to Google Calendar. Please try again.";
      }
      
      setConfirmationModal({
        isOpen: true,
        title,
        message,
        confirmText: "OK",
        cancelText: "",
        variant: "warning",
        onConfirm: () => {
          setConfirmationModal({ isOpen: false, title: "", message: "", onConfirm: () => {} });
          // Clear URL params
          window.history.replaceState({}, "", "/app");
        },
      });
    } else if (initialSuccess === "oauth_connected") {
      setConfirmationModal({
        isOpen: true,
        title: "Successfully Connected",
        message: "Google Calendar has been successfully connected! You can now schedule appointments that will sync to your calendar.",
        confirmText: "OK",
        cancelText: "",
        variant: "info",
        onConfirm: () => {
          setConfirmationModal({ isOpen: false, title: "", message: "", onConfirm: () => {} });
          // Clear URL params
          window.history.replaceState({}, "", "/app");
        },
      });
    }
  }, [initialError, initialSuccess, initialMessage]);

  // Check superadmin status
  useEffect(() => {
    async function checkSuperadmin() {
      try {
        const response = await fetch("/api/me");
        if (response.ok) {
          const data = await response.json();
          const isAdmin = data.is_superadmin === true;
          console.log("[Admin] Superadmin check:", { isAdmin, data });
          setIsSuperadmin(isAdmin);
        } else {
          console.error("[Admin] Failed to fetch /api/me:", response.status);
        }
      } catch (error) {
        console.error("[Admin] Error checking superadmin status:", error);
      }
    }
    checkSuperadmin();
  }, []);

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
                const firstScenario = loadedScenarios[0];
                setSelectedScenario(firstScenario);
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

  // Load scenario steps when scenario is selected
  useEffect(() => {
    async function loadScenarioSteps() {
      if (!selectedScenario) {
        setSelectedScenarioWithSteps(null);
        return;
      }
      try {
        const response = await fetch(`/api/scenarios/${selectedScenario.id}/steps`);
        if (response.ok) {
          const stepsData = await response.json();
          
          // Load branches for each step
          const stepsWithBranches = await Promise.all(
            stepsData.map(async (step: any) => {
              try {
                const branchesResponse = await fetch(`/api/steps/${step.id}/branches`);
                const branches = branchesResponse.ok ? await branchesResponse.json() : [];
                return {
                  ...step,
                  branches: branches.map((b: any) => ({
                    id: b.id,
                    condition: b.condition,
                    condition_tag: b.condition_tag,
                    target: b.target,
                    next_step_id: b.next_step_id,
                    next_scenario_id: b.next_scenario_id,
                  })),
                };
              } catch (error) {
                return { ...step, branches: [] };
              }
            })
          );
          
          setSelectedScenarioWithSteps({
            ...selectedScenario,
            steps: stepsWithBranches.sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0)),
          });
        }
      } catch (error) {
        console.error("Failed to load scenario steps:", error);
      }
    }
    loadScenarioSteps();
  }, [selectedScenario]);

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
            toast.success("Agent created", `${newAgent.name} has been created successfully`);
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

    // Show validation panel first
    setShowValidationPanel(true);
  };

  const handleDeployAfterValidation = async () => {
    if (!selectedAgent) return;

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
            toast.success(
              "Agent Deployed",
              `"${selectedAgent.name}" is now live and ready to handle ${selectedAgent.modality} conversations!${
                selectedAgent.modality === "voice" && selectedAgent.phoneNumber
                  ? ` Calls to ${selectedAgent.phoneNumber} will be handled by this agent.`
                  : ""
              }`
            );
          } else {
            const error = await response.json();
            toast.error("Deployment Failed", error.error || "Failed to deploy agent. Please try again.");
          }
        } catch (error) {
          console.error("Failed to deploy agent:", error);
          toast.error("Deployment Failed", "An error occurred while deploying the agent. Please try again.");
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
            toast.success("Deployment Cancelled", `"${selectedAgent.name}" is now in draft mode. You can edit it again.`);
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

  // Dark theme sidebar colors
  const sidebarTextColor = "text-white";
  const sidebarTextSecondary = "text-white/90";
  const sidebarTextTertiary = "text-white/70";
  const sidebarBg = "bg-[#242423]";
  const sidebarBorder = "border-white/10";
  const sidebarIcon = "text-white";
  const sidebarIconSecondary = "text-white/70";

  return (
    <div className={`flex h-screen overflow-hidden ${themeClasses.textPrimary} bg-[#242423]`} style={{ background: '#242423', backgroundImage: 'none' }}>
      {/* Left Sidebar */}
      <div className={`w-64 border-r ${sidebarBorder} ${sidebarBg} flex flex-col`}>
        {/* Top Logo/Brand */}
        <div className={`p-4 border-b ${sidebarBorder}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
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
                  className={`w-full pl-9 pr-8 py-2 rounded-2xl bg-[#242423] border border-white/10 ${sidebarTextColor} text-xs placeholder:${sidebarTextTertiary} focus:outline-none focus:border-orange-500`}
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
                className={`w-full flex items-center justify-between px-3 py-2 rounded-2xl ${sidebarTextSecondary} hover:bg-[#242423] transition text-xs`}
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
                    {agents.length === 0 ? (
                      <EmptyState
                        icon={Folder}
                        title="No agents yet"
                        description="Create your first agent to get started"
                        action={{ label: "Create Agent", onClick: () => setShowCreateModal(true) }}
                        className="py-4"
                      />
                    ) : (
                      agents
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
                          ? "bg-[#242423] text-white border border-white/20"
                          : `${sidebarTextTertiary} hover:bg-[#242423]`
                      }`}
                    >
                      <span className="flex items-center gap-2 flex-1 min-w-0">
                        {getModalityIcon(agent.modality)}
                        <span className="truncate">{agent.name}</span>
                      </span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                        <Tooltip content="Agent options">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowAgentMenu(showAgentMenu === agent.id ? null : agent.id);
                            }}
                            className="p-1 hover:bg-white/10 rounded-full"
                          >
                            <MoreVertical className="h-3 w-3" />
                          </button>
                        </Tooltip>
                      </div>
                    </button>
                    {showAgentMenu === agent.id && (
                      <div className={`absolute right-0 top-full mt-1 z-20 bg-[#242423] border ${sidebarBorder} rounded-2xl shadow-lg min-w-[120px]`}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditAgentClick(agent);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm ${sidebarTextSecondary} hover:bg-[#2a2a2a] flex items-center gap-2`}
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
                ))
                      )}
                    {agents.length > 0 && (
                      <Tooltip content="Create a new agent">
                        <button
                          onClick={() => setShowCreateModal(true)}
                          className={`w-full text-left px-3 py-2 rounded-2xl text-xs ${sidebarTextTertiary} hover:bg-[#242423] flex items-center gap-2 border border-dashed ${sidebarBorder}`}
                        >
                          <Plus className={`h-3 w-3 ${sidebarIconSecondary}`} />
                          Add agent
                        </button>
                      </Tooltip>
                    )}
              </div>
            )}
          </div>

          {/* Navigation - Only show when agent is selected */}
          {selectedAgent && (
            <nav className="p-4 space-y-1 border-t border-white/10">
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
              <NavItem
                icon={Database}
                label="Data Sources"
                active={activePage === "data-sources"}
                onClick={() => setActivePage("data-sources")}
              />
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
              <NavItem
                icon={Brain}
                label="LLM"
                active={activePage === "llm"}
                onClick={() => setActivePage("llm")}
              />
              {/* Inbox only for chat and multi-modal agents */}
              {(selectedAgent.modality === "chat" || selectedAgent.modality === "multi-modal") && (
                <NavItem
                  icon={MessageSquare}
                  label="Inbox"
                  active={activePage === "inbox"}
                  onClick={() => setActivePage("inbox")}
                />
              )}
              {/* Admin link for superadmins - always show at bottom */}
              {isSuperadmin && (
                <NavItem
                  icon={Shield}
                  label="Admin"
                  active={false}
                  onClick={() => {
                    window.location.href = "/admin";
                  }}
                />
              )}
            </nav>
          )}
          
          {/* Admin link for superadmins - show even when no agent selected */}
          {!selectedAgent && isSuperadmin && (
            <nav className="p-4 space-y-1 border-t border-white/10">
              <NavItem
                icon={Shield}
                label="Admin"
                active={false}
                onClick={() => {
                  window.location.href = "/admin";
                }}
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
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-2xl ${sidebarTextSecondary} hover:bg-[#242423] transition text-xs`}
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
                          <div className={`flex items-center gap-2 p-2 rounded-2xl bg-[#242423] border ${sidebarBorder}`}>
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
                              className={`flex-1 px-2 py-1 rounded-2xl bg-[#242423] border border-white/10 text-xs ${sidebarTextColor} focus:border-[#f97316] focus:outline-none`}
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
                                ? "bg-[#383939] text-white border border-white/20"
                                : `${sidebarTextTertiary} hover:bg-[#383939]`
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
                                    className={`p-1 hover:bg-[#242423] rounded-full`}
                                  >
                                    <MoreVertical className={`h-3 w-3 ${sidebarIconSecondary}`} />
                              </button>
                            </div>
                            {showScenarioMenu === scenario.id && (
                              <div className={`absolute right-0 top-full mt-1 z-10 bg-[#242423] border ${sidebarBorder} rounded-2xl shadow-lg min-w-[120px]`}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditScenario(scenario);
                                  }}
                                  className={`w-full text-left px-3 py-2 text-sm ${sidebarTextSecondary} hover:bg-[#2a2a2a] flex items-center gap-2`}
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
                        className={`w-full text-left px-3 py-2 rounded-2xl text-xs ${sidebarTextTertiary} hover:bg-[#242423] flex items-center gap-2 border border-dashed ${sidebarBorder}`}
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
                className={`w-full flex items-center justify-between px-3 py-2 rounded-2xl ${sidebarTextSecondary} hover:bg-[#242423] transition text-xs`}
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
                            <button className={`w-full text-left px-3 py-2 rounded-2xl text-sm ${sidebarTextTertiary} hover:bg-[#383939] flex items-center justify-between`}>
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
                                <div className={`absolute right-0 top-full mt-1 z-10 bg-[#242423] border ${sidebarBorder} rounded-2xl shadow-lg min-w-[120px]`}>
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
                        className={`w-full text-left px-3 py-2 rounded-2xl text-xs ${sidebarTextTertiary} hover:bg-[#242423] flex items-center gap-2 border border-dashed ${sidebarBorder}`}
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
      <div className={`flex-1 flex flex-col overflow-hidden bg-[#242423]`} style={{ background: '#242423', backgroundImage: 'url(/backgrounds/dunes.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}>
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
                    className={`flex items-center gap-2 px-4 py-2 rounded-3xl bg-black border border-white/20 text-white text-xs font-medium transition hover:bg-white/10`}
                  >
                    <Rocket className="h-3 w-3" />
                    Deploy agent
                    <div className="w-px h-4 bg-white/20 mx-1"></div>
                    <ChevronDown className="h-3 w-3" />
                  </button>
                ) : (
                  <button
                    onClick={handleCancelDeployment}
                    className={`group flex items-center gap-2 px-4 py-2 rounded-3xl bg-green-500/20 border border-green-500/30 text-green-300 hover:bg-red-500/20 hover:border-red-500/30 hover:text-red-300 text-xs font-medium transition`}
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
              <div className={`flex items-center gap-2 px-4 py-2 rounded-2xl bg-yellow-500/20 border border-yellow-500/30 text-yellow-300 text-xs`}>
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
                    ? "border-orange-600 bg-orange-600/20 text-orange-600"
                    : `border-white/10 ${themeClasses.textTertiary} hover:border-white/20 hover:${themeClasses.textSecondary}`
                }`}
              >
                Agent Canvas
              </button>
              <button
                onClick={() => setActiveTab("test")}
                className={`px-4 py-2 min-h-[40px] rounded-3xl border-2 transition text-sm font-medium flex items-center justify-center whitespace-nowrap leading-none ${
                  activeTab === "test"
                    ? "border-orange-600 bg-orange-600/20 text-orange-600"
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
                      onTestFlow={() => setShowFlowTester(true)}
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
                      {scenarios.length === 0 ? (
                        <EmptyState
                          icon={Layers}
                          title="No scenarios yet"
                          description="Create a scenario to start building your agent flow"
                          action={{ label: "Create Scenario", onClick: () => setShowCreateScenarioModal(true) }}
                        />
                      ) : (
                        <EmptyState
                          icon={Layers}
                          title="No scenario selected"
                          description="Select a scenario or create a new one"
                          action={{ label: "Create Scenario", onClick: () => setShowCreateScenarioModal(true) }}
                        />
                      )}
                      {scenarios.length > 0 && (
                        <div className="space-y-3 max-w-md mx-auto">
                          {scenarios.map((scenario) => (
                            <button
                              key={scenario.id}
                              onClick={() => setSelectedScenario(scenario)}
                              className={`w-full px-6 py-3 rounded-2xl border border-white/10 bg-[#242423] text-white hover:bg-[#242423]/80 transition text-left text-xs`}
                            >
                              {scenario.name}
                            </button>
                          ))}
                          <Tooltip content="Create a new scenario">
                            <button
                              onClick={() => setShowCreateScenarioModal(true)}
                              className={`w-full px-6 py-3 rounded-3xl bg-[#f97316] hover:bg-[#ea580c] text-white font-medium transition`}
                            >
                              + Create new scenario
                            </button>
                          </Tooltip>
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
                  ) : activePage === "data-sources" ? (
                    selectedAgent ? <DataSourcesPage agentId={selectedAgent.id} /> : null
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
                  ) : activePage === "inbox" ? (
                    selectedAgent && (selectedAgent.modality === "chat" || selectedAgent.modality === "multi-modal") ? (
                      <InboxPage agentId={selectedAgent.id} />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                          <MessageSquare className="h-16 w-16 mx-auto mb-4 text-white/50" />
                          <h2 className="text-2xl font-semibold text-white mb-2">Inbox Not Available</h2>
                          <p className="text-white/70 text-sm">
                            The Inbox feature is only available for chat and multi-modal agents.
                          </p>
                        </div>
                      </div>
                    )
                  ) : activePage === "llm" ? (
                    <LLMPage agentId={selectedAgent?.id} />
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

      {/* Validation Panel */}
      {selectedAgent && (
        <ValidationPanel
          agent={selectedAgent}
          scenarios={scenarios}
          isOpen={showValidationPanel}
          onClose={() => setShowValidationPanel(false)}
          onFixIssue={(error) => {
            // Navigate to the issue location
            if (error.location) {
              const parts = error.location.split(":");
              if (parts[0] === "scenario") {
                const scenario = scenarios.find((s) => s.id === parts[1]);
                if (scenario) {
                  setSelectedScenario(scenario);
                  setActivePage("scenarios");
                }
              }
            }
          }}
          onProceedWithDeployment={handleDeployAfterValidation}
          hasTwilioCredentials={hasTwilioCredentials}
        />
      )}

      {/* Flow Tester */}
      {selectedAgent && selectedScenario && selectedScenarioWithSteps && (
        <FlowTester
          agentId={selectedAgent.id}
          scenarioId={selectedScenario.id}
          scenario={selectedScenarioWithSteps}
          isOpen={showFlowTester}
          onClose={() => setShowFlowTester(false)}
          agentModality={selectedAgent.modality}
        />
      )}
    </div>
  );
}

// Wrap with ToastProvider
function GigaAIClientWithToast(props: GigaAIClientProps) {
  return (
    <ToastProvider>
      <GigaAIClient {...props} />
    </ToastProvider>
  );
}

export default GigaAIClientWithToast;

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
  const bgActive = "bg-[#242423] text-white";
  const bgInactive = "text-white/90 hover:bg-[#242423]";
  const iconColorClass = active ? "text-[#FF9838]" : "text-white/70";
  
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
