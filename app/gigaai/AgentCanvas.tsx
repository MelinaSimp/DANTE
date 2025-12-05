"use client";

import { useState, useEffect, useRef } from "react";
import { MessageSquare, FileText, GitBranch, Code, Zap, ArrowRight, ArrowDown, X, Plus, Trash2, Calendar, CheckCircle, HelpCircle, Repeat, UserCheck, Phone, Eye, Play, GitMerge, MoreVertical } from "lucide-react";
import ConfirmationModal from "./ConfirmationModal";
import { useTheme } from "./ThemeProvider";
import ConnectionLine from "./ConnectionLine";

type StepType = "trigger" | "say" | "gather" | "code" | "api_call" | "schedule" | "qa" | "loop" | "send_sms" | "transfer" | "branch" | "call";

interface Branch {
  id: string;
  condition: string;
  condition_tag?: string;
  target?: string;
  next_step_id?: string;
  next_scenario_id?: string;
}

interface Step {
  id: string;
  type: StepType;
  name: string;
  ai_message?: string;
  message: string; // For display, derived from ai_message or name
  branches?: Branch[];
  sort_order?: number;
  selected_data_source_ids?: string[];
  x?: number; // Canvas position
  y?: number; // Canvas position
  connections?: Array<{ fromSide: "top" | "bottom" | "left" | "right"; toStepId: string; toSide: "top" | "bottom" | "left" | "right" }>; // Connections from this step
}

interface Scenario {
  id: string;
  name: string;
  steps: Step[];
}

interface AgentCanvasProps {
  agentId: string;
  scenarioId: string;
  scenarioName: string;
  onStepSelect?: (step: any) => void;
  theme?: "dark-gray" | "white";
  isDeployed?: boolean;
}

// Right sidebar blocks - draggable functions
const DRAGGABLE_BLOCKS: { type: StepType; label: string; description: string; icon: any }[] = [
  { type: "say", label: "Say", description: "AI model says something", icon: MessageSquare },
  { type: "gather", label: "Gather", description: "Collect user input", icon: FileText },
  { type: "qa", label: "Q/A", description: "Answer question using data sources", icon: HelpCircle },
  { type: "branch", label: "Branch", description: "Splits into two paths", icon: GitMerge },
  { type: "call", label: "Call", description: "AI agent has been called", icon: Phone },
  { type: "transfer", label: "Transfer", description: "Transfer to another agent", icon: UserCheck },
  { type: "code", label: "Code", description: "Run custom code", icon: Code },
  { type: "api_call", label: "API Call", description: "Call an external API", icon: Zap },
  { type: "schedule", label: "Schedule", description: "Schedule an appointment", icon: Calendar },
  { type: "loop", label: "Loop", description: "Repeat a sequence of steps", icon: Repeat },
  { type: "send_sms", label: "Send SMS", description: "Send text message to customer", icon: Phone },
];

// Legacy function palette (keeping for backward compatibility)
const FUNCTION_PALETTE: { type: StepType; label: string; description: string; icon: any; category: string }[] = [
  { type: "trigger", label: "Trigger", description: "Start the workflow when an event occurs", icon: Play, category: "Trigger" },
  { type: "branch", label: "Branch", description: "Create conditional paths based on conditions", icon: GitMerge, category: "Branch" },
  { type: "say", label: "Say", description: "Send a message to the user", icon: MessageSquare, category: "AI" },
  { type: "gather", label: "Gather", description: "Collect user input", icon: FileText, category: "Contact" },
  { type: "qa", label: "Q/A", description: "Answer question using data sources", icon: HelpCircle, category: "AI" },
  { type: "code", label: "Code", description: "Run custom code", icon: Code, category: "Code" },
  { type: "api_call", label: "API Call", description: "Call an external API", icon: Zap, category: "API" },
  { type: "schedule", label: "Schedule", description: "Schedule an appointment", icon: Calendar, category: "Schedule" },
  { type: "loop", label: "Loop", description: "Repeat a sequence of steps", icon: Repeat, category: "Loop" },
  { type: "send_sms", label: "Send SMS", description: "Send text message to customer", icon: Phone, category: "Contact" },
  { type: "transfer", label: "Transfer", description: "Route to specialist agent", icon: UserCheck, category: "Transfer" },
  { type: "call", label: "Call", description: "AI agent has been called", icon: Phone, category: "Call" },
];

const AVAILABLE_TAGS = [
  "@info_confirmed",
  "@info_not_provided",
  "verify_identity_check",
  "@customer_provides_info",
  "@customer_refuses",
  "@upload_successful",
  "@upload_failed",
  "If Statement",
];

function defaultMessage(type: StepType): string {
  switch (type) {
    case "trigger":
      return "Workflow starts when this event occurs";
    case "branch":
      return "Check condition and branch workflow";
    case "say":
      return "Welcome! How can I help you today?";
    case "call":
      return "AI agent has been called";
    case "gather":
      return "What information would you like to collect?";
    case "qa":
      return "Answer customer question using data sources";
    case "loop":
      return "Loop configuration";
    case "send_sms":
      return "Send SMS message";
    case "transfer":
      return "Transfer to another agent with its separate workflow";
    case "code":
      return "// Write your code here";
    case "api_call":
      return "Call API endpoint";
    case "schedule":
      return "Schedule appointment confirmation message";
    default:
      return "New step";
  }
}

function getStepCategory(type: StepType): string {
  const paletteItem = FUNCTION_PALETTE.find(p => p.type === type);
  return paletteItem?.category || "Step";
}

function getCategoryColor(category: string): string {
  switch (category) {
    case "Trigger":
      return "text-[#3166bf]";
    case "Branch":
      return "text-[#9333ea]";
    case "AI":
      return "text-[#70d4b4]";
    case "Contact":
      return "text-[#9ca3af]";
    case "Transfer":
      return "text-[#9ca3af]";
    default:
      return "text-[#6b7280]";
  }
}

export default function AgentCanvas({ agentId, scenarioId, scenarioName, onStepSelect, isDeployed = false }: AgentCanvasProps) {
  const { theme, colors } = useTheme();
  const canvasRef = useRef<HTMLDivElement>(null);
  
  // Debug: Log deployment status
  useEffect(() => {
    console.log("[AgentCanvas] Component mounted/updated - isDeployed:", isDeployed, "agentId:", agentId, "scenarioId:", scenarioId);
  }, [isDeployed, agentId, scenarioId]);
  const [scenario, setScenario] = useState<Scenario>({
    id: scenarioId,
    name: scenarioName,
    steps: [],
  });

  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [draggedOver, setDraggedOver] = useState(false);
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [selectedStepForBranch, setSelectedStepForBranch] = useState<{ scenarioId: string; stepId: string; branchId: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [draggingStep, setDraggingStep] = useState<{ stepId: string; offsetX: number; offsetY: number; startX: number; startY: number } | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<{ stepId: string; side: "top" | "bottom" | "left" | "right" } | null>(null);
  const [dataSourceModal, setDataSourceModal] = useState<{
    isOpen: boolean;
    stepId: string | null;
  }>({
    isOpen: false,
    stepId: null,
  });
  const [availableDataSources, setAvailableDataSources] = useState<Array<{ id: string; name: string; type: string; file_url?: string; file_type?: string; content?: string }>>([]);
  const [selectedDataSourceIds, setSelectedDataSourceIds] = useState<string[]>([]);
  const [loadingDataSources, setLoadingDataSources] = useState(false);
  const [showAddDataSource, setShowAddDataSource] = useState(false);
  const [addDataSourceType, setAddDataSourceType] = useState<"text" | "file">("text");
  const [newDataSourceName, setNewDataSourceName] = useState("");
  const [newDataSourceContent, setNewDataSourceContent] = useState("");
  const [addingDataSource, setAddingDataSource] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [previewModal, setPreviewModal] = useState<{
    isOpen: boolean;
    dataSource: { id: string; name: string; type: string; file_url?: string; file_type?: string; content?: string } | null;
    content: string | null;
    loading: boolean;
  }>({
    isOpen: false,
    dataSource: null,
    content: null,
    loading: false,
  });
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

  // Load steps and branches from API
  useEffect(() => {
    async function loadSteps() {
      setLoading(true);
      try {
        const response = await fetch(`/api/scenarios/${scenarioId}/steps`);
        if (response.ok) {
          const stepsData = await response.json();
          
          // Load branches for each step
          const stepsWithBranches = await Promise.all(
            stepsData.map(async (step: any, idx: number) => {
              const branchesResponse = await fetch(`/api/steps/${step.id}/branches`);
              const branches = branchesResponse.ok ? await branchesResponse.json() : [];
              return {
                id: step.id,
                type: step.type as StepType,
                name: step.name,
                ai_message: step.ai_message,
                message: step.ai_message || step.name,
                branches: branches.map((b: any) => ({
                  id: b.id,
                  condition: b.condition,
                  condition_tag: b.condition_tag,
                  target: b.target,
                  next_step_id: b.next_step_id,
                  next_scenario_id: b.next_scenario_id,
                })),
                sort_order: step.sort_order,
                selected_data_source_ids: step.selected_data_source_ids || [],
                x: step.x ?? 200, // Default x position
                y: step.y ?? (200 + idx * 180), // Default y position with spacing
              };
            })
          );

          setScenario({
            id: scenarioId,
            name: scenarioName,
            steps: stepsWithBranches.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
          });
        }
      } catch (error) {
        console.error("Failed to load steps:", error);
      } finally {
        setLoading(false);
      }
    }
    loadSteps();
  }, [scenarioId, scenarioName]);

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDraggedOver(false);
    console.log("[AgentCanvas] handleDrop - isDeployed:", isDeployed, "agentId:", agentId);
    if (isDeployed) {
      console.log("[AgentCanvas] Blocking drop - agent is deployed");
      setConfirmationModal({
        isOpen: true,
        title: "Cannot Edit",
        message: "This agent is deployed. Please cancel deployment to make changes.",
        confirmText: "OK",
        cancelText: "",
        variant: "warning",
        onConfirm: () => setConfirmationModal({ ...confirmationModal, isOpen: false }),
      });
      return;
    }
    console.log("[AgentCanvas] Proceeding with drop - agent is not deployed");
    const type = event.dataTransfer.getData("step-type") as StepType;
    console.log("[AgentCanvas] Dropped step type:", type);
    if (!type) {
      console.log("[AgentCanvas] No step type in dataTransfer");
      return;
    }

    // Calculate drop position relative to the canvas
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) {
      console.error("[AgentCanvas] Canvas ref not available");
      return;
    }

    const dropX = event.clientX - canvasRect.left + (canvasRef.current?.scrollLeft || 0);
    const dropY = event.clientY - canvasRect.top + (canvasRef.current?.scrollTop || 0);

    try {
      const message = defaultMessage(type);
      const response = await fetch(`/api/scenarios/${scenarioId}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: message,
          type,
          ai_message: type === "say" ? message : null,
          x: dropX - 160, // Center the block on drop (half of 320px width)
          y: dropY - 20, // Adjust for potential header/cursor offset
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        console.error("Failed to create step:", errorData);
        setConfirmationModal({
          isOpen: true,
          title: "Failed to Create Step",
          message: errorData?.error || "Failed to create step. Please try again.",
          confirmText: "OK",
          cancelText: "",
          variant: "error",
          onConfirm: () => setConfirmationModal({ ...confirmationModal, isOpen: false }),
        });
        return;
      }

        const newStepData = await response.json();
      
      // Always create the step immediately, then create branches asynchronously
        const newStep: Step = {
          id: newStepData.id,
          type: newStepData.type as StepType,
          name: newStepData.name,
          ai_message: newStepData.ai_message,
          message: newStepData.ai_message || newStepData.name,
        branches: type === "branch" ? [] : (type === "say" ? [] : undefined), // Initialize with empty array for branch steps
          sort_order: newStepData.sort_order,
        x: newStepData.x ?? dropX - 160, // Use x from API or fallback to calculated position
        y: newStepData.y ?? dropY - 20, // Use y from API or fallback to calculated position
        };

      // Add step to canvas immediately
        setScenario((prev) => ({
          ...prev,
          steps: [...prev.steps, newStep].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
        }));
      
      // For branch steps, create True and False branches asynchronously (don't block UI)
      if (type === "branch") {
        // Create branches in background without blocking - wrap in IIFE to handle errors
        (async () => {
          try {
            const [trueResponse, falseResponse] = await Promise.all([
              fetch(`/api/steps/${newStepData.id}/branches`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  condition: "Condition is true",
                  condition_tag: "true",
                }),
              }),
              fetch(`/api/steps/${newStepData.id}/branches`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  condition: "Condition is false",
                  condition_tag: "false",
                }),
              }),
            ]);

            if (trueResponse.ok && falseResponse.ok) {
              try {
                const trueBranchData = await trueResponse.json();
                const falseBranchData = await falseResponse.json();
                
                // Validate that we have the required fields
                if (trueBranchData?.id && falseBranchData?.id) {
                  // Update step with branches - map API response to Branch interface
                  setScenario((prev) => ({
                    ...prev,
                    steps: prev.steps.map((s) =>
                      s.id === newStepData.id
                        ? {
                            ...s,
                            branches: [
                              {
                                id: trueBranchData.id,
                                condition: trueBranchData.condition || "Condition is true",
                                condition_tag: trueBranchData.condition_tag || "true",
                                next_step_id: trueBranchData.next_step_id || undefined,
                                next_scenario_id: trueBranchData.next_scenario_id || undefined,
                              },
                              {
                                id: falseBranchData.id,
                                condition: falseBranchData.condition || "Condition is false",
                                condition_tag: falseBranchData.condition_tag || "false",
                                next_step_id: falseBranchData.next_step_id || undefined,
                                next_scenario_id: falseBranchData.next_scenario_id || undefined,
                              },
                            ],
                          }
                        : s
                    ),
                  }));
                }
              } catch (parseError) {
                console.error("Error parsing branch response:", parseError);
              }
            } else {
              const trueErrorText = trueResponse.ok ? null : await trueResponse.text().catch(() => "Unknown error");
              const falseErrorText = falseResponse.ok ? null : await falseResponse.text().catch(() => "Unknown error");
              console.error("Failed to create branches:", { 
                trueStatus: trueResponse.status,
                trueError: trueErrorText,
                falseStatus: falseResponse.status,
                falseError: falseErrorText
              });
            }
          } catch (error) {
            console.error("Error creating branches:", error);
          }
        })();
      }
    } catch (error: any) {
      console.error("Failed to create step:", error);
      setConfirmationModal({
        isOpen: true,
        title: "Failed to Create Step",
        message: error?.message || "An unexpected error occurred while creating the step. Please try again.",
        confirmText: "OK",
        cancelText: "",
        variant: "error",
        onConfirm: () => setConfirmationModal({ ...confirmationModal, isOpen: false }),
      });
    }
  };

  const startEditing = (step: Step) => {
    if (isDeployed) {
      setConfirmationModal({
        isOpen: true,
        title: "Cannot Edit",
        message: "This agent is deployed. Please cancel deployment to make changes.",
        confirmText: "OK",
        cancelText: "",
        variant: "warning",
        onConfirm: () => setConfirmationModal({ ...confirmationModal, isOpen: false }),
      });
      return;
    }
    setEditingStepId(step.id);
    setEditingText(step.message);
  };

  const saveEditing = async () => {
    if (!editingStepId) return;
    if (isDeployed) {
      setConfirmationModal({
        isOpen: true,
        title: "Cannot Edit",
        message: "This agent is deployed. Please cancel deployment to make changes.",
        confirmText: "OK",
        cancelText: "",
        variant: "warning",
        onConfirm: () => setConfirmationModal({ ...confirmationModal, isOpen: false }),
      });
      return;
    }
    
    try {
      const step = scenario.steps.find((s) => s.id === editingStepId);
      if (!step) return;

      const response = await fetch(`/api/steps/${editingStepId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ai_message: editingText,
          name: editingText.substring(0, 100), // Use first 100 chars as name
        }),
      });

      if (response.ok) {
        setScenario((prev) => ({
          ...prev,
          steps: prev.steps.map((s) =>
            s.id === editingStepId
              ? { ...s, message: editingText, ai_message: editingText }
              : s
          ),
        }));
        setEditingStepId(null);
        setEditingText("");
      }
    } catch (error) {
      console.error("Failed to save step:", error);
    }
  };

  // Update step configuration (transfer_config, loop_config, sms_config, etc.)
  const updateStepConfig = async (stepId: string, configKey: string, configValue: any) => {
    if (isDeployed) {
      setConfirmationModal({
        isOpen: true,
        title: "Cannot Edit",
        message: "This agent is deployed. Please cancel deployment to make changes.",
        confirmText: "OK",
        cancelText: "",
        variant: "warning",
        onConfirm: () => setConfirmationModal({ ...confirmationModal, isOpen: false }),
      });
      return;
    }

    try {
      const step = scenario.steps.find((s) => s.id === stepId);
      if (!step) return;

      // Get current step data
      const currentStep = step as any;
      const currentConfig = currentStep[configKey] || {};

      // Merge new config
      const updatedConfig = { ...currentConfig, ...configValue };

      const response = await fetch(`/api/steps/${stepId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [configKey]: updatedConfig,
        }),
      });

      if (response.ok) {
        // Update local state
        setScenario((prev) => ({
          ...prev,
          steps: prev.steps.map((s) =>
            s.id === stepId
              ? { ...s, [configKey]: updatedConfig }
              : s
          ),
        }));
      }
    } catch (error) {
      console.error(`Failed to update step ${configKey}:`, error);
    }
  };

  const addBranch = async (stepId: string) => {
    if (isDeployed) {
      setConfirmationModal({
        isOpen: true,
        title: "Cannot Edit",
        message: "This agent is deployed. Please cancel deployment to make changes.",
        confirmText: "OK",
        cancelText: "",
        variant: "warning",
        onConfirm: () => setConfirmationModal({ ...confirmationModal, isOpen: false }),
      });
      return;
    }
    try {
      const response = await fetch(`/api/steps/${stepId}/branches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          condition: "New condition",
          condition_tag: "@tag",
          target: "Next step",
        }),
      });

      if (response.ok) {
        const newBranchData = await response.json();
        const newBranch: Branch = {
          id: newBranchData.id,
          condition: newBranchData.condition,
          condition_tag: newBranchData.condition_tag,
          target: newBranchData.target,
          next_step_id: newBranchData.next_step_id,
          next_scenario_id: newBranchData.next_scenario_id,
        };

        setScenario((prev) => ({
          ...prev,
          steps: prev.steps.map((step) =>
            step.id === stepId
              ? {
                  ...step,
                  branches: [...(step.branches || []), newBranch],
                }
              : step
          ),
        }));

        // Open workspace for editing this branch
        setSelectedStepForBranch({ scenarioId: scenarioId, stepId, branchId: newBranch.id });
      }
    } catch (error) {
      console.error("Failed to create branch:", error);
    }
  };

  const updateBranch = async (stepId: string, branchId: string, updates: Partial<Branch>) => {
    if (isDeployed) {
      setConfirmationModal({
        isOpen: true,
        title: "Cannot Edit",
        message: "This agent is deployed. Please cancel deployment to make changes.",
        confirmText: "OK",
        cancelText: "",
        variant: "warning",
        onConfirm: () => setConfirmationModal({ ...confirmationModal, isOpen: false }),
      });
      return;
    }
    // Optimistically update UI
    setScenario((prev) => ({
      ...prev,
      steps: prev.steps.map((step) =>
        step.id === stepId
          ? {
              ...step,
              branches: step.branches?.map((branch) =>
                branch.id === branchId ? { ...branch, ...updates } : branch
              ),
            }
          : step
      ),
    }));

    // Save to API
    try {
      const updatePayload: Record<string, any> = {};
      if (updates.condition !== undefined) updatePayload.condition = updates.condition;
      if (updates.condition_tag !== undefined) updatePayload.condition_tag = updates.condition_tag;
      if (updates.target !== undefined) updatePayload.target = updates.target;

      await fetch(`/api/steps/${stepId}/branches/${branchId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatePayload),
      });
    } catch (error) {
      console.error("Failed to update branch:", error);
    }
  };

  const deleteBranch = async (stepId: string, branchId: string) => {
    if (isDeployed) {
      setConfirmationModal({
        isOpen: true,
        title: "Cannot Edit",
        message: "This agent is deployed. Please cancel deployment to make changes.",
        confirmText: "OK",
        cancelText: "",
        variant: "warning",
        onConfirm: () => setConfirmationModal({ ...confirmationModal, isOpen: false }),
      });
      return;
    }
    try {
      const response = await fetch(`/api/steps/${stepId}/branches/${branchId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setScenario((prev) => ({
          ...prev,
          steps: prev.steps.map((step) =>
            step.id === stepId
              ? {
                  ...step,
                  branches: step.branches?.filter((b) => b.id !== branchId),
                }
              : step
          ),
        }));
        if (selectedStepForBranch?.branchId === branchId) {
          setSelectedStepForBranch(null);
        }
      }
    } catch (error) {
      console.error("Failed to delete branch:", error);
    }
  };

  const deleteStep = async (stepId: string) => {
    console.log("[AgentCanvas] deleteStep - isDeployed:", isDeployed, "stepId:", stepId);
    if (isDeployed) {
      setConfirmationModal({
        isOpen: true,
        title: "Cannot Edit",
        message: "This agent is deployed. Please cancel deployment to make changes.",
        confirmText: "OK",
        cancelText: "",
        variant: "warning",
        onConfirm: () => setConfirmationModal({ ...confirmationModal, isOpen: false }),
      });
      return;
    }
    setConfirmationModal({
      isOpen: true,
      title: "Delete Step",
      message: "Are you sure you want to delete this step? This action cannot be undone.",
      confirmText: "Delete",
      cancelText: "Cancel",
      variant: "danger",
      onConfirm: async () => {
        setConfirmationModal({ ...confirmationModal, isOpen: false });
        try {
          console.log("[AgentCanvas] Attempting to delete step:", stepId);
          const response = await fetch(`/api/steps/${stepId}`, {
            method: "DELETE",
          });

          console.log("[AgentCanvas] Delete response status:", response.status);
          if (response.ok) {
            console.log("[AgentCanvas] Step deleted successfully");
            setScenario((prev) => ({
              ...prev,
              steps: prev.steps.filter((step) => step.id !== stepId),
            }));
            if (editingStepId === stepId) {
              setEditingStepId(null);
              setEditingText("");
            }
          } else {
            const errorText = await response.text().catch(() => "Unknown error");
            let errorData;
            try {
              errorData = JSON.parse(errorText);
            } catch {
              errorData = { error: errorText || "Unknown error" };
            }
            console.error("[AgentCanvas] Failed to delete step - Status:", response.status, "Error:", errorData);
            setConfirmationModal({
              isOpen: true,
              title: "Delete Failed",
              message: errorData.error || `Failed to delete step (Status: ${response.status}). Please try again.`,
              confirmText: "OK",
              cancelText: "",
              variant: "danger",
              onConfirm: () => setConfirmationModal({ ...confirmationModal, isOpen: false }),
            });
          }
        } catch (error: any) {
          console.error("[AgentCanvas] Failed to delete step:", error);
          setConfirmationModal({
            isOpen: true,
            title: "Delete Failed",
            message: error?.message || "An error occurred while deleting the step. Please try again.",
            confirmText: "OK",
            cancelText: "",
            variant: "danger",
            onConfirm: () => setConfirmationModal({ ...confirmationModal, isOpen: false }),
          });
        }
      },
    });
  };

  const selectTag = (tag: string) => {
    if (!selectedStepForBranch) return;
    updateBranch(
      selectedStepForBranch.stepId,
      selectedStepForBranch.branchId,
      { condition_tag: tag }
    );
  };

  const selectTargetStep = (targetName: string) => {
    if (!selectedStepForBranch) return;
    updateBranch(
      selectedStepForBranch.stepId,
      selectedStepForBranch.branchId,
      { target: targetName }
    );
  };

  const handleConnectionPointClick = (stepId: string, side: "top" | "bottom" | "left" | "right") => {
    if (isDeployed) {
      setConfirmationModal({
        isOpen: true,
        title: "Cannot Edit",
        message: "This agent is deployed. Please cancel deployment to make changes.",
        confirmText: "OK",
        cancelText: "",
        variant: "warning",
        onConfirm: () => setConfirmationModal({ ...confirmationModal, isOpen: false }),
      });
      return;
    }

    if (!connectingFrom) {
      // Start a new connection
      setConnectingFrom({ stepId, side });
    } else {
      // Complete the connection
      if (connectingFrom.stepId === stepId) {
        // Clicked the same step - cancel connection
        setConnectingFrom(null);
      } else {
        // Connect from connectingFrom to this step
        const fromStep = scenario.steps.find(s => s.id === connectingFrom.stepId);
        if (fromStep) {
          const newConnection = {
            fromSide: connectingFrom.side,
            toStepId: stepId,
            toSide: side,
          };
          
          // Update local state
          setScenario(prev => ({
            ...prev,
            steps: prev.steps.map(s => 
              s.id === connectingFrom.stepId
                ? { 
                    ...s, 
                    connections: [...(s.connections || []), newConnection]
                  }
                : s
            )
          }));
          
          // TODO: Save connection to API
          setConnectingFrom(null);
        }
      }
    }
  };

  const getCurrentBranch = () => {
    if (!selectedStepForBranch) return null;
    const step = scenario.steps.find((s) => s.id === selectedStepForBranch.stepId);
    if (!step) return null;
    return step.branches?.find((b) => b.id === selectedStepForBranch.branchId);
  };

  const getAvailableSteps = () => {
    return scenario.steps.map((step, idx) => ({
      id: step.id,
      name: `Step ${idx + 1}`,
      message: step.message.substring(0, 50),
    }));
  };

  const currentBranch = getCurrentBranch();
  const availableSteps = getAvailableSteps();

  const previewDataSource = async (dataSource: { id: string; name: string; type: string; file_url?: string; file_type?: string; content?: string }) => {
    setPreviewModal({
      isOpen: true,
      dataSource,
      content: null,
      loading: true,
    });

    if (dataSource.type === "text") {
      setPreviewModal({
        isOpen: true,
        dataSource,
        content: dataSource.content || "",
        loading: false,
      });
    } else if (dataSource.file_url) {
      try {
        const fileType = dataSource.file_type || "";
        const isPDF = fileType === "application/pdf" || fileType.endsWith("pdf") || dataSource.name.toLowerCase().endsWith('.pdf');
        const isImage = fileType.startsWith("image/");
        const isText = fileType.startsWith("text/");
        
        if (isPDF) {
          setPreviewModal({
            isOpen: true,
            dataSource,
            content: "PDF_PREVIEW",
            loading: false,
          });
        } else if (isImage) {
          setPreviewModal({
            isOpen: true,
            dataSource,
            content: dataSource.file_url,
            loading: false,
          });
        } else if (isText) {
          const response = await fetch(dataSource.file_url);
          if (response.ok) {
            const text = await response.text();
            setPreviewModal({
              isOpen: true,
              dataSource,
              content: text,
              loading: false,
            });
          } else {
            setPreviewModal({
              isOpen: true,
              dataSource,
              content: "Unable to load file preview.",
              loading: false,
            });
          }
        } else {
          const response = await fetch(dataSource.file_url);
          if (response.ok) {
            const contentType = response.headers.get("content-type") || "";
            
            if (contentType.startsWith("text/")) {
              const text = await response.text();
              setPreviewModal({
                isOpen: true,
                dataSource,
                content: text,
                loading: false,
              });
            } else if (contentType.startsWith("image/")) {
              setPreviewModal({
                isOpen: true,
                dataSource,
                content: dataSource.file_url,
                loading: false,
              });
            } else if (contentType === "application/pdf" || contentType.includes("pdf")) {
              setPreviewModal({
                isOpen: true,
                dataSource,
                content: "PDF_PREVIEW",
                loading: false,
              });
            } else {
              setPreviewModal({
                isOpen: true,
                dataSource,
                content: `File type: ${dataSource.file_type || contentType}\n\nPreview not available for this file type. Click download to view.`,
                loading: false,
              });
            }
          } else {
            setPreviewModal({
              isOpen: true,
              dataSource,
              content: "Unable to load file preview.",
              loading: false,
            });
          }
        }
      } catch (error) {
        console.error("Failed to load file preview:", error);
        setPreviewModal({
          isOpen: true,
          dataSource,
          content: "Error loading file preview.",
          loading: false,
        });
      }
    } else {
      setPreviewModal({
        isOpen: true,
        dataSource,
        content: "No preview available.",
        loading: false,
      });
    }
  };

  const handleFileUpload = async (files: File[]) => {
    if (!agentId || files.length === 0) return;
    
    setUploadingFile(true);
    setUploadError(null);
    
    for (const file of files) {
      try {
        // Upload file
        const formData = new FormData();
        formData.append("file", file);
        formData.append("agentId", agentId);
        formData.append("category", "data-sources");

        const uploadResponse = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!uploadResponse.ok) {
          const errorData = await uploadResponse.json().catch(() => ({ error: "Upload failed" }));
          throw new Error(errorData.error || `Upload failed: ${uploadResponse.statusText}`);
        }

        const uploadData = await uploadResponse.json();
        
        // Create data source record
        const response = await fetch(`/api/agents/${agentId}/data-sources`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: file.name,
            type: "file",
            file_url: uploadData.url,
            file_size: uploadData.fileSize,
            file_type: uploadData.fileType,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Failed to create data source" }));
          throw new Error(errorData.error || "Failed to create data source record");
        }

        const newDataSource = await response.json();
        setAvailableDataSources([...availableDataSources, {
          id: newDataSource.id,
          name: newDataSource.name,
          type: newDataSource.type,
        }]);
      } catch (error: any) {
        console.error("Failed to upload file:", error);
        setUploadError(error.message || `Failed to upload ${file.name}`);
      }
    }
    
    setUploadingFile(false);
  };

  return (
    <div className={`h-full flex bg-[#ffffff]`} style={{ background: '#ffffff', backgroundImage: 'none' }}>
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#ffffff]">
          {/* Fullscreen Content - Infinite/Pageless Canvas (n8n-style, white theme) */}
          <div 
            ref={canvasRef}
            className={`flex-1 overflow-auto relative`} 
            style={{
              background: '#ffffff',
              backgroundImage: `
                linear-gradient(to right, #e5e7eb 1px, transparent 1px),
                linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)
              `,
              backgroundSize: '20px 20px',
              backgroundPosition: '0 0'
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDraggedOver(true);
            }}
            onDragLeave={(e) => {
              // Only set draggedOver to false if we're actually leaving the canvas
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDraggedOver(false);
              }
            }}
            onDrop={handleDrop}
            onMouseMove={(e) => {
              if (draggingStep) {
                // Calculate distance moved from initial click
                const dx = e.clientX - draggingStep.startX;
                const dy = e.clientY - draggingStep.startY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                // Only start dragging if mouse moved more than 5 pixels (prevents accidental drag on click)
                if (distance > 5) {
                  e.preventDefault();
                  const canvasRect = e.currentTarget.getBoundingClientRect();
                  const scrollLeft = e.currentTarget.scrollLeft;
                  const scrollTop = e.currentTarget.scrollTop;
                  
                  // Calculate new position relative to canvas
                  const newX = e.clientX - canvasRect.left + scrollLeft - 160; // 160 = half of block width
                  const newY = e.clientY - canvasRect.top + scrollTop - 50; // Offset for header
                  
                  setDraggingStep({
                    ...draggingStep,
                    offsetX: newX,
                    offsetY: newY,
                  });
                }
              }
            }}
          onMouseUp={() => {
            if (draggingStep) {
              // Save position to API
              const step = scenario.steps.find(s => s.id === draggingStep.stepId);
              if (step) {
                // Update local state
                setScenario(prev => ({
                  ...prev,
                  steps: prev.steps.map(s => 
                    s.id === draggingStep.stepId 
                      ? { ...s, x: draggingStep.offsetX, y: draggingStep.offsetY }
                      : s
                  )
                }));
                // TODO: Save to API
              }
              setDraggingStep(null);
            }
          }}
          onMouseLeave={() => {
            if (draggingStep) {
              setDraggingStep(null);
            }
          }}
        >
          {/* Infinite canvas container - truly pageless like n8n */}
          <div className="absolute" style={{ 
            width: '10000px',
            height: '10000px',
            minWidth: '100vw',
            minHeight: '100vh'
          }}>
            {/* Drop Zone + Steps - Truly infinite pageless canvas */}
            <div
              className={`absolute inset-0 transition ${
                  draggedOver
                  ? "border-2 border-dashed border-[#3166bf] bg-[#3166bf]/5"
                    : ""
                }`}
              >
                {loading ? (
                  <div className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center ${colors.textTertiary} text-sm`}>
                    <div className="mb-2">Loading steps...</div>
                  </div>
                ) : scenario.steps.length === 0 ? (
                  <div className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center ${colors.textTertiary} text-sm`}>
                    <div className="mb-2">👆</div>
                    <div>Drag a block or tag from the right sidebar to create the first step</div>
                  </div>
                ) : (
                  <div className="relative" style={{ padding: '200px', width: 'fit-content', minWidth: '400px' }}>
                    {/* Warning for missing greeting message */}
                    {(() => {
                      const firstSayStep = scenario.steps.find(s => s.type === "say");
                      if (firstSayStep && (!firstSayStep.ai_message || firstSayStep.ai_message.trim().length === 0)) {
                        return (
                          <div className="absolute top-4 left-4 max-w-md p-3 rounded-2xl bg-[#fffbeb] border border-[#fbbf24]/30 flex items-start gap-2 z-10">
                            <div className="h-4 w-4 rounded-full border-2 border-[#fbbf24] flex items-center justify-center flex-shrink-0 mt-0.5">
                              <span className="text-[10px] text-[#fbbf24]">!</span>
                            </div>
                            <div className="flex-1">
                              <div className={`text-xs font-medium text-[#fbbf24] mb-1`}>
                                Greeting Message Missing
                              </div>
                              <div className={`text-[10px] text-[#fbbf24]/80`}>
                                Your first "Co Say" step doesn't have a message configured. Click on it to add your greeting message, otherwise callers will hear the default greeting.
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}
                    {/* Render connection lines between connected blocks */}
                    {scenario.steps.flatMap((step) => {
                      if (!step.connections || step.connections.length === 0) return [];
                      return step.connections.map((connection, connIdx) => {
                        const toStep = scenario.steps.find(s => s.id === connection.toStepId);
                        if (!toStep) return null;
                        
                        const fromStepX = draggingStep?.stepId === step.id 
                          ? draggingStep.offsetX 
                          : (step.x ?? 200);
                        const fromStepY = draggingStep?.stepId === step.id 
                          ? draggingStep.offsetY 
                          : (step.y ?? 200);
                        const toStepX = draggingStep?.stepId === toStep.id 
                          ? draggingStep.offsetX 
                          : (toStep.x ?? 200);
                        const toStepY = draggingStep?.stepId === toStep.id 
                          ? draggingStep.offsetY 
                          : (toStep.y ?? 200);
                        
                        // Calculate positions for connection points
                        const blockHeight = 100; // Approximate block height
                        const blockWidth = 320;
                        
                        let fromX = fromStepX + blockWidth / 2;
                        let fromY = fromStepY;
                        if (connection.fromSide === "top") {
                          fromY = fromStepY - 2;
                        } else if (connection.fromSide === "bottom") {
                          fromY = fromStepY + blockHeight;
                        } else if (connection.fromSide === "left") {
                          fromX = fromStepX - 2;
                          fromY = fromStepY + blockHeight / 2;
                        } else if (connection.fromSide === "right") {
                          fromX = fromStepX + blockWidth + 2;
                          fromY = fromStepY + blockHeight / 2;
                        }
                        
                        let toX = toStepX + blockWidth / 2;
                        let toY = toStepY;
                        if (connection.toSide === "top") {
                          toY = toStepY - 2;
                        } else if (connection.toSide === "bottom") {
                          toY = toStepY + blockHeight;
                        } else if (connection.toSide === "left") {
                          toX = toStepX - 2;
                          toY = toStepY + blockHeight / 2;
                        } else if (connection.toSide === "right") {
                          toX = toStepX + blockWidth + 2;
                          toY = toStepY + blockHeight / 2;
                        }
                        
                        const dx = toX - fromX;
                        const dy = toY - fromY;
                        const minX = Math.min(fromX, toX);
                        const minY = Math.min(fromY, toY);
                        const svgWidth = Math.abs(dx) + 20;
                        const svgHeight = Math.abs(dy) + 20;
                        
                        // Calculate relative coordinates within the SVG
                        const relFromX = fromX - minX + 10;
                        const relFromY = fromY - minY + 10;
                        const relToX = toX - minX + 10;
                        const relToY = toY - minY + 10;
                        
                        return (
                          <svg
                            key={`conn-${step.id}-${connection.toStepId}-${connIdx}`}
                            className="absolute pointer-events-none z-0"
                            style={{
                              left: `${minX - 10}px`,
                              top: `${minY - 10}px`,
                              width: `${svgWidth}px`,
                              height: `${svgHeight}px`,
                            }}
                          >
                            <line
                              x1={relFromX}
                              y1={relFromY}
                              x2={relToX}
                              y2={relToY}
                              stroke="#70d4b4"
                              strokeWidth="2"
                              markerEnd={`url(#arrowhead-${step.id}-${connIdx})`}
                            />
                            <defs>
                              <marker
                                id={`arrowhead-${step.id}-${connIdx}`}
                                markerWidth="10"
                                markerHeight="10"
                                refX="9"
                                refY="3"
                                orient="auto"
                              >
                                <polygon points="0 0, 10 3, 0 6" fill="#70d4b4" />
                              </marker>
                            </defs>
                          </svg>
                        );
                      }).filter(Boolean);
                    })}
                    {scenario.steps.map((step, stepIdx) => {
                      const stepCategory = getStepCategory(step.type);
                      const paletteItem = FUNCTION_PALETTE.find(p => p.type === step.type);
                      const StepIcon = paletteItem?.icon || FileText;
                      
                      const stepX = draggingStep?.stepId === step.id 
                        ? draggingStep.offsetX 
                        : (step.x ?? 200);
                      const stepY = draggingStep?.stepId === step.id 
                        ? draggingStep.offsetY 
                        : (step.y ?? (200 + stepIdx * 180));
                      
                      return (
                      <div 
                        key={step.id} 
                        className="absolute cursor-move select-none" 
                        style={{ 
                          left: `${stepX}px`,
                          top: `${stepY}px`,
                          width: '320px',
                          zIndex: draggingStep?.stepId === step.id ? 1000 : 1
                        }}
                        onMouseDown={(e) => {
                          if (isDeployed) return;
                          
                          // Check if the click is on an interactive element
                          const target = e.target as HTMLElement;
                          const isButton = target instanceof HTMLButtonElement || 
                                          target.closest('button') !== null ||
                                          target.closest('[role="button"]') !== null;
                          const isTextarea = target instanceof HTMLTextAreaElement || 
                                            target.closest('textarea') !== null;
                          const isInput = target instanceof HTMLInputElement || 
                                         target.closest('input') !== null;
                          // Check for connection points (blue circles)
                          const isConnectionPoint = target.classList.contains('rounded-full') && 
                                                   (target.classList.contains('bg-[#3166bf]') || 
                                                    target.classList.contains('bg-[#9333ea]'));
                          // Check if clicking on SVG icon inside button
                          const isIconInButton = target.closest('svg') && target.closest('button') !== null;
                          
                          if (isButton || isTextarea || isInput || isConnectionPoint || isIconInButton) {
                            return;
                          }
                          
                          e.preventDefault();
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          const canvasContainer = e.currentTarget.closest('[class*="overflow"]') as HTMLElement;
                          if (canvasContainer) {
                            const canvasRect = canvasContainer.getBoundingClientRect();
                            // Store initial mouse position and current block position
                            setDraggingStep({
                              stepId: step.id,
                              offsetX: stepX, // Keep current position until drag threshold is met
                              offsetY: stepY,
                              startX: e.clientX, // Store initial mouse X
                              startY: e.clientY, // Store initial mouse Y
                            });
                          }
                        }}
                      >
                        {/* Connecting Line from previous step */}
                        {stepIdx > 0 && (
                          <div className="flex justify-center mb-3 relative" style={{ height: '32px' }}>
                            <ConnectionLine 
                              from="bottom" 
                              to="top" 
                              length={32}
                              color="#70d4b4"
                              strokeWidth={2}
                            />
                                  </div>
                                )}
                        
                        {/* Category Tag - Above the block */}
                        <div className="mb-2">
                          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold ${
                            stepCategory === "Trigger" 
                              ? "bg-[#3166bf] text-white border border-[#2a5aa8]"
                              : stepCategory === "Branch"
                              ? "bg-[#9333ea] text-white border border-[#7e22ce]"
                              : stepCategory === "AI"
                              ? "bg-[#70d4b4] text-white border border-[#5bb99a]"
                              : "bg-[#9ca3af] text-white border border-[#6b7280]"
                          }`}>
                            {stepCategory === "Trigger" && <Zap className="h-3 w-3" />}
                            {stepCategory === "Branch" && <GitMerge className="h-3 w-3" />}
                            {stepCategory === "AI" && <MessageSquare className="h-3 w-3" />}
                            {stepCategory !== "Trigger" && stepCategory !== "Branch" && stepCategory !== "AI" && <FileText className="h-3 w-3" />}
                            <span>{stepCategory}</span>
                              </div>
                          </div>
                        
                        {/* Step Card */}
                        <div className="relative bg-white border border-[#70d4b4] rounded-xl p-4 hover:shadow-md transition" style={{ width: '320px', maxWidth: '320px', flexShrink: 0 }}>
                          {/* Connection Points - Top, Bottom, Left, Right */}
                          {/* Top connection point */}
                          <div 
                            className={`absolute -top-2 left-1/2 transform -translate-x-1/2 w-4 h-4 rounded-full border-2 border-white cursor-pointer hover:scale-110 transition z-20 ${
                              connectingFrom?.stepId === step.id && connectingFrom?.side === "top"
                                ? "bg-[#9333ea] scale-125"
                                : "bg-[#3166bf] hover:bg-[#2a5aa8]"
                            }`}
                            title={connectingFrom ? "Click another connection point to connect" : "Click to start connection"}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isDeployed) return;
                              handleConnectionPointClick(step.id, "top");
                            }}
                          />
                          {/* Bottom connection point */}
                          <div 
                            className={`absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-4 h-4 rounded-full border-2 border-white cursor-pointer hover:scale-110 transition z-20 ${
                              connectingFrom?.stepId === step.id && connectingFrom?.side === "bottom"
                                ? "bg-[#9333ea] scale-125"
                                : "bg-[#3166bf] hover:bg-[#2a5aa8]"
                            }`}
                            title={connectingFrom ? "Click another connection point to connect" : "Click to start connection"}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isDeployed) return;
                              handleConnectionPointClick(step.id, "bottom");
                            }}
                          />
                          {/* Left connection point */}
                          <div 
                            className={`absolute top-1/2 -left-2 transform -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white cursor-pointer hover:scale-110 transition z-20 ${
                              connectingFrom?.stepId === step.id && connectingFrom?.side === "left"
                                ? "bg-[#9333ea] scale-125"
                                : "bg-[#3166bf] hover:bg-[#2a5aa8]"
                            }`}
                            title={connectingFrom ? "Click another connection point to connect" : "Click to start connection"}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isDeployed) return;
                              handleConnectionPointClick(step.id, "left");
                            }}
                          />
                          {/* Right connection point */}
                          <div 
                            className={`absolute top-1/2 -right-2 transform -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white cursor-pointer hover:scale-110 transition z-20 ${
                              connectingFrom?.stepId === step.id && connectingFrom?.side === "right"
                                ? "bg-[#9333ea] scale-125"
                                : "bg-[#3166bf] hover:bg-[#2a5aa8]"
                            }`}
                            title={connectingFrom ? "Click another connection point to connect" : "Click to start connection"}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isDeployed) return;
                              handleConnectionPointClick(step.id, "right");
                            }}
                          />
                          
                          <div className="flex items-start justify-between gap-3 relative z-0">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              {/* Step Icon - In rounded square */}
                              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                                <StepIcon className="h-5 w-5 text-[#151515]" />
                        </div>

                              {/* Step Content */}
                              <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-semibold text-[#151515] mb-0.5">
                          {editingStepId === step.id ? (
                              <textarea
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                      rows={1}
                                      className="w-full rounded-lg border border-[#3166bf] bg-white px-2 py-1 text-sm font-semibold text-[#151515] focus:border-[#3166bf] focus:outline-none"
                                      autoFocus
                                      placeholder={paletteItem?.label || step.type}
                                    />
                                  ) : (
                                    <span 
                                      className="cursor-pointer hover:text-[#151515]"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        startEditing(step);
                                      }}
                                    >
                                      {step.name || paletteItem?.label || step.type}
                                    </span>
                                  )}
                                </h4>
                                <p className="text-xs text-[#6b7280] mt-0.5">
                                  {editingStepId === step.id ? (
                                    <textarea
                                      value={editingText}
                                      onChange={(e) => setEditingText(e.target.value)}
                                      rows={2}
                                      className="w-full rounded-lg border border-[#3166bf] bg-white px-2 py-1 text-xs text-[#6b7280] focus:border-[#3166bf] focus:outline-none"
                                      placeholder={step.message || step.ai_message || defaultMessage(step.type)}
                                    />
                                  ) : (
                                    <span 
                                      className="cursor-pointer hover:text-[#151515]"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        startEditing(step);
                                      }}
                                    >
                                      {step.message || step.ai_message || defaultMessage(step.type)}
                                    </span>
                                  )}
                                </p>
                              </div>
                            </div>
                            
                            {/* Options Menu (Three dots) */}
                            <button
                              className="p-1.5 hover:bg-[#f3f4f6] rounded-lg transition flex-shrink-0 z-10 relative"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                // TODO: Show options menu (delete, duplicate, etc.)
                                console.log("[AgentCanvas] Options menu clicked for step:", step.id);
                                deleteStep(step.id);
                              }}
                              title={`Options for ${paletteItem?.label || step.type}`}
                              type="button"
                            >
                              <MoreVertical className="h-4 w-4 text-[#6b7280] hover:text-[#151515]" />
                            </button>
                          </div>
                          
                          {/* Edit Actions */}
                          {editingStepId === step.id && (
                            <div className="flex gap-2 mt-3 pt-3 border-t border-[#e5e7eb]">
                                <button
                                  onClick={saveEditing}
                                className="px-3 py-1.5 rounded-lg bg-[#3166bf] hover:bg-[#2a5aa8] text-white text-xs font-medium"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingStepId(null);
                                    setEditingText("");
                                  }}
                                className="px-3 py-1.5 rounded-lg border border-[#e5e7eb] bg-white text-[#151515] text-xs font-medium hover:bg-[#f3f4f6]"
                                >
                                  Cancel
                                </button>
                              </div>
                          )}
                        </div>

                        {/* Branch Paths - Show True/False paths with curved connectors */}
                        {step.type === "branch" && step.branches && step.branches.length > 0 && (
                          <div className="mt-8 relative">
                            {/* Smooth curved connectors from branch block to True/False nodes */}
                            <div className="absolute top-0 left-0 right-0" style={{ height: '140px', zIndex: 0 }}>
                              {step.branches.map((branch, branchIdx) => {
                                const isTrue = branchIdx === 0;
                                const color = isTrue ? "#70d4b4" : "#9ca3af";
                                const horizontalOffset = isTrue ? -180 : 180; // True goes left, False goes right - wider spread
                                
                                return (
                                  <svg
                                    key={`branch-connector-${branch.id}`}
                                    className="absolute top-0 left-1/2 transform -translate-x-1/2"
                                    style={{ width: '600px', height: '140px', pointerEvents: 'none' }}
                                    viewBox="0 0 600 140"
                                  >
                                    {/* Path: start vertical, small curve transitioning to horizontal, then straight horizontal, then smooth curve down, then straight vertical */}
                                    <path
                                      d={`M 300 0 L 300 15 C ${300 + horizontalOffset * 0.2} 20, ${300 + horizontalOffset * 0.5} 25, ${300 + horizontalOffset * 0.7} 30 L ${300 + horizontalOffset} 30 Q ${300 + horizontalOffset} 30, ${300 + horizontalOffset} 40 L ${300 + horizontalOffset} 140`}
                                      stroke={color}
                                      strokeWidth="2"
                                      fill="none"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      markerEnd={`url(#arrow-${branch.id})`}
                                    />
                                    <defs>
                                      <marker
                                        id={`arrow-${branch.id}`}
                                        markerWidth="10"
                                        markerHeight="10"
                                        refX="9"
                                        refY="3"
                                        orient="auto"
                                      >
                                        <polygon points="0 0, 10 3, 0 6" fill={color} />
                                      </marker>
                                    </defs>
                                  </svg>
                                );
                              })}
                              </div>
                            
                            {/* True/False nodes positioned horizontally - wider spread */}
                            <div className="flex gap-36 justify-center mt-32 relative z-10">
                              {step.branches.map((branch, branchIdx) => {
                                const isTrue = branchIdx === 0;
                                
                                return (
                                  <div key={branch.id} className="flex flex-col items-center" style={{ minWidth: '200px' }}>
                                    {/* True/False Button Node */}
                                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium ${
                                      isTrue 
                                        ? "bg-[#f3f4f6] border-[#e5e7eb] text-[#151515]"
                                        : "bg-[#f3f4f6] border-[#e5e7eb] text-[#151515]"
                                    }`}>
                                      {isTrue ? (
                                        <>
                                          <div className="w-5 h-5 rounded-full bg-[#70d4b4] flex items-center justify-center">
                                            <CheckCircle className="h-3 w-3 text-white" />
                              </div>
                                          <span>True</span>
                                        </>
                                      ) : (
                                        <>
                                          <div className="w-5 h-5 rounded-full bg-[#f0494a] flex items-center justify-center">
                                            <X className="h-3 w-3 text-white" />
                            </div>
                                          <span>False</span>
                                        </>
                                      )}
                                    </div>
                                    
                                    {/* Smooth curved connector down from True/False node */}
                                    <div className="mt-4 mb-4 relative" style={{ height: branch.next_step_id ? '60px' : '40px' }}>
                                      <svg
                                        className="absolute left-1/2 transform -translate-x-1/2"
                                        style={{ width: '4px', height: '100%', pointerEvents: 'none' }}
                                        viewBox={`0 0 4 ${branch.next_step_id ? 60 : 40}`}
                                        preserveAspectRatio="none"
                                      >
                                        <path
                                          d={`M 2 0 C 2 ${(branch.next_step_id ? 60 : 40) * 0.3}, 2 ${(branch.next_step_id ? 60 : 40) * 0.7}, 2 ${branch.next_step_id ? 60 : 40}`}
                                          stroke={isTrue ? '#70d4b4' : '#9ca3af'}
                                          strokeWidth="2"
                                          fill="none"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          markerEnd={`url(#arrow-down-${branch.id})`}
                                        />
                                        <defs>
                                          <marker
                                            id={`arrow-down-${branch.id}`}
                                            markerWidth="10"
                                            markerHeight="10"
                                            refX="5"
                                            refY="3"
                                            orient="auto"
                                          >
                                            <polygon points="0 0, 10 3, 0 6" fill={isTrue ? '#70d4b4' : '#9ca3af'} />
                                          </marker>
                                        </defs>
                                      </svg>
                            </div>
                                    
                                    {/* Steps in this branch path */}
                                    <div className="w-full space-y-4">
                                      {branch.next_step_id ? (
                                        (() => {
                                          const nextStep = scenario.steps.find(s => s.id === branch.next_step_id);
                                          if (!nextStep) return null;
                                          
                                          const branchStepCategory = getStepCategory(nextStep.type);
                                          const branchPaletteItem = FUNCTION_PALETTE.find(p => p.type === nextStep.type);
                                          const BranchStepIcon = branchPaletteItem?.icon || FileText;
                                          
                                          return (
                                            <div key={nextStep.id} className="relative">
                                              {/* Step Card */}
                                              <div 
                                                className="relative bg-white border border-[#70d4b4] rounded-xl p-4 hover:shadow-md transition"
                                                style={{ width: '320px', maxWidth: '320px' }}
                                              >
                                                <div className="flex items-start justify-between gap-3">
                                                  <div className="flex items-start gap-3 flex-1 min-w-0">
                                                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                                                      <BranchStepIcon className="h-5 w-5 text-[#151515]" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                      <h4 className="text-sm font-semibold text-[#151515] mb-0.5">
                                                        {nextStep.name || branchPaletteItem?.label || nextStep.type}
                                                      </h4>
                                                      <p className="text-xs text-[#6b7280] mt-0.5">
                                                        {nextStep.message || nextStep.ai_message || defaultMessage(nextStep.type)}
                              </p>
                            </div>
                                                  </div>
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        })()
                                      ) : (
                                        <div className="text-xs text-[#151515]/40 italic text-center py-4">
                                          Drop a block here
                          </div>
                        )}
                                    </div>
                                  </div>
                                );
                              })}
                                  </div>
                                </div>
                        )}
                      </div>
                    );
                    })}
                          </div>
                        )}
              </div>
          </div>
        </div>
                      </div>

      {/* Right Sidebar - Draggable Blocks and Tags */}
      <div className="w-80 border-l border-[#151515] bg-white flex flex-col">
        {/* Section 1: Draggable Blocks */}
        <div className="p-4 border-b border-[#e5e7eb]">
          <h3 className="text-xs font-semibold text-[#151515] mb-3 uppercase tracking-wide">BLOCKS</h3>
          <div className="space-y-2">
            {DRAGGABLE_BLOCKS.map((block) => {
              const Icon = block.icon;
              return (
                <div
                  key={block.type}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("step-type", block.type);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  className="flex items-center gap-3 p-3 rounded-lg border border-[#e5e7eb] bg-white hover:border-[#3166bf] hover:bg-[#f0fdf4] cursor-grab active:cursor-grabbing transition"
                >
                  <Icon className="h-4 w-4 text-[#151515] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#151515]">{block.label}</div>
                    <div className="text-xs text-[#151515]/60 mt-0.5">{block.description}</div>
                          </div>
                      </div>
              );
            })}
                  </div>
              </div>

        {/* Section 2: Trigger and Branch Tags */}
        <div className="p-4">
          <h3 className="text-xs font-semibold text-[#151515] mb-3 uppercase tracking-wide">TAGS</h3>
          <div className="space-y-2">
            <div
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("step-type", "trigger");
                e.dataTransfer.effectAllowed = "move";
              }}
              className="flex items-center justify-center gap-2 p-3 rounded-lg border-2 border-[#3166bf] bg-[#3166bf]/10 cursor-grab active:cursor-grabbing transition hover:bg-[#3166bf]/20"
            >
              <Play className="h-4 w-4 text-[#3166bf]" />
              <span className="text-sm font-semibold text-[#3166bf]">Trigger</span>
              </div>
            <div
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("step-type", "branch");
                e.dataTransfer.effectAllowed = "move";
              }}
              className="flex items-center justify-center gap-2 p-3 rounded-lg border-2 border-[#9333ea] bg-[#9333ea]/10 cursor-grab active:cursor-grabbing transition hover:bg-[#9333ea]/20"
            >
              <GitMerge className="h-4 w-4 text-[#9333ea]" />
              <span className="text-sm font-semibold text-[#9333ea]">Branch</span>
            </div>
          </div>
        </div>

        {/* Branch Editing Workspace - Only show when editing a branch */}
      {selectedStepForBranch && (
          <div className="flex-1 border-t border-[#e5e7eb] overflow-y-auto flex flex-col">
            <div className="border-b border-[#e5e7eb] px-4 py-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#151515]">New Condition</h3>
            <button
              onClick={() => setSelectedStepForBranch(null)}
                className="p-1 hover:bg-[#f3f4f6] rounded transition"
            >
                <X className="h-4 w-4 text-[#151515]/50" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Natural Language Condition Input */}
            <div>
              <label className={`block text-[10px] font-medium ${colors.textSecondary} mb-2`}>
                If <span className={colors.textTertiary}>(description of an outcome)</span>
              </label>
              <textarea
                value={currentBranch?.condition || ""}
                onChange={(e) => {
                  if (selectedStepForBranch) {
                    updateBranch(
                      selectedStepForBranch.stepId,
                      selectedStepForBranch.branchId,
                      { condition: e.target.value }
                    );
                  }
                }}
                rows={3}
                    className={`w-full rounded-2xl border border-[#3166bf] bg-[#ffffff] px-3 py-2 text-xs ${colors.text} placeholder:${colors.textTertiary} focus:border-[#3166bf] focus:outline-none resize-none`}
                placeholder="Customer provides their full name and date of birth"
              />
              <p className={`text-[10px] ${colors.textTertiary} mt-1`}>
                Describe the outcome or condition in natural language
              </p>
            </div>

            {/* Tags List - Optional */}
            <div>
              <label className={`block text-[10px] font-medium ${colors.textSecondary} mb-2`}>
                Tags <span className={colors.textTertiary}>(optional)</span>
              </label>
              <div className="space-y-2">
                {AVAILABLE_TAGS.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => selectTag(tag)}
                    className={`w-full text-left px-3 py-2 rounded-2xl border transition text-sm ${
                      currentBranch?.condition_tag === tag
                          ? `border-[#3166bf] bg-[#3166bf]/20 ${colors.text}`
                          : `border-[#e5e7eb] bg-[#ffffff] ${colors.textSecondary} hover:bg-[#f3f4f6]`
                    }`}
                  >
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-mono ${
                        tag.startsWith("@")
                            ? "bg-[#3166bf]/20 text-[#3166bf] border border-[#3166bf]/30"
                          : tag === "If Statement"
                            ? "bg-[#aeb8c9]/20 text-[#3166bf] border border-[#aeb8c9]/30"
                            : "bg-[#ebf9ef] text-[#70d4b4] border border-[#70d4b4]/30"
                      }`}
                    >
                      {tag}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Proceed To Input */}
            <div>
              <label className={`block text-[10px] font-medium ${colors.textSecondary} mb-2`}>
                proceed to <span className={colors.textTertiary}>(could be text or another question)</span>
              </label>
              <textarea
                value={currentBranch?.target || ""}
                onChange={(e) => {
                  if (selectedStepForBranch) {
                    updateBranch(
                      selectedStepForBranch.stepId,
                      selectedStepForBranch.branchId,
                      { target: e.target.value }
                    );
                  }
                }}
                rows={3}
                  className={`w-full rounded-2xl border border-[#3166bf] bg-[#ffffff] ${colors.text} placeholder:${colors.textTertiary} focus:border-[#3166bf] focus:outline-none resize-none px-3 py-2 text-sm`}
                placeholder="Identity Verification step"
              />
              <p className={`text-[10px] ${colors.textTertiary} mt-1`}>
                Describe the next step or action in natural language
              </p>
            </div>

            {/* Quick Step Suggestions */}
            {availableSteps.length > 0 && (
              <div>
                <label className={`block text-[10px] font-medium ${colors.textSecondary} mb-2`}>
                  Quick select from existing steps
                </label>
                <div className="space-y-2">
                  {availableSteps.map((step) => (
                    <button
                      key={step.id}
                      onClick={() => selectTargetStep(step.message.substring(0, 50))}
                      className={`w-full text-left px-3 py-2 rounded-2xl border ${colors.border} ${colors.cardBg} ${colors.textSecondary} ${colors.hover} transition text-xs`}
                    >
                      <div className="font-medium text-[10px]">{step.name}</div>
                      <div className={`text-[10px] ${colors.textTertiary} mt-1 line-clamp-2`}>
                        {step.message}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      </div>

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

      {/* Data Source Selector Modal */}
      {dataSourceModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className={`w-full max-w-2xl max-h-[80vh] rounded-3xl ${colors.bg} ${colors.border} border-2 shadow-2xl flex flex-col`}>
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <h3 className={`text-lg font-semibold ${colors.text}`}>Select Data Sources</h3>
              <button
                onClick={() => setDataSourceModal({ isOpen: false, stepId: null })}
                className={`p-2 rounded-full ${colors.hover} ${colors.textSecondary} hover:${colors.text}`}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              {loadingDataSources ? (
                <div className={`text-center ${colors.textSecondary} py-8`}>Loading data sources...</div>
              ) : (
                <div className="space-y-4">
                  {/* Add Data Source Section */}
                  {!showAddDataSource ? (
                    <div className="space-y-2">
                      <button
                        onClick={() => {
                          setShowAddDataSource(true);
                          setAddDataSourceType("text");
                        }}
                        className={`w-full p-4 rounded-2xl border-2 border-dashed ${colors.border} ${colors.bgSecondary} hover:border-[#3351ff]/50 transition text-left`}
                      >
                        <div className="flex items-center gap-2">
                          <Plus className={`h-5 w-5 ${colors.textSecondary}`} />
                          <span className={`font-medium ${colors.text}`}>Add Text Data Source</span>
                        </div>
                        <p className={`text-xs ${colors.textTertiary} mt-1 ml-7`}>
                          Add text content or knowledge base entries
                        </p>
                      </button>
                      <button
                        onClick={() => {
                          setShowAddDataSource(true);
                          setAddDataSourceType("file");
                        }}
                        className={`w-full p-4 rounded-2xl border-2 border-dashed ${colors.border} ${colors.bgSecondary} hover:border-[#3351ff]/50 transition text-left`}
                      >
                        <div className="flex items-center gap-2">
                          <Plus className={`h-5 w-5 ${colors.textSecondary}`} />
                          <span className={`font-medium ${colors.text}`}>Upload File (PDF, DOCX, etc.)</span>
                        </div>
                        <p className={`text-xs ${colors.textTertiary} mt-1 ml-7`}>
                          Upload PDFs, documents, or other files
                        </p>
                      </button>
                    </div>
                  ) : (
                    <div className={`p-4 rounded-2xl border ${colors.border} ${colors.bgSecondary} space-y-3`}>
                      <div className="flex items-center justify-between">
                        <h4 className={`font-medium ${colors.text}`}>
                          {addDataSourceType === "text" ? "Add Text Data Source" : "Upload File"}
                        </h4>
                        <div className="flex items-center gap-2">
                          {addDataSourceType === "file" && (
                            <button
                              onClick={() => {
                                setAddDataSourceType("text");
                                setUploadError(null);
                              }}
                              className={`px-3 py-1 rounded-xl text-xs ${colors.textSecondary} ${colors.hover} border ${colors.border}`}
                            >
                              Switch to Text
                            </button>
                          )}
                          {addDataSourceType === "text" && (
                            <button
                              onClick={() => {
                                setAddDataSourceType("file");
                                setUploadError(null);
                              }}
                              className={`px-3 py-1 rounded-xl text-xs ${colors.textSecondary} ${colors.hover} border ${colors.border}`}
                            >
                              Switch to File
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setShowAddDataSource(false);
                              setNewDataSourceName("");
                              setNewDataSourceContent("");
                              setUploadError(null);
                            }}
                            className={`p-1 rounded-full ${colors.hover} ${colors.textSecondary}`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {addDataSourceType === "text" ? (
                        <>
                          <input
                            type="text"
                            value={newDataSourceName}
                            onChange={(e) => setNewDataSourceName(e.target.value)}
                            placeholder="Data source name (e.g., 'Product Catalog', 'FAQ')"
                            className={`w-full rounded-2xl border ${colors.border} ${colors.inputBg} px-3 py-2 text-sm ${colors.text} placeholder:${colors.textTertiary} focus:border-[#3351ff] focus:outline-none`}
                          />
                          <textarea
                            value={newDataSourceContent}
                            onChange={(e) => setNewDataSourceContent(e.target.value)}
                            placeholder="Enter the content for this data source..."
                            rows={4}
                            className={`w-full rounded-2xl border ${colors.border} ${colors.inputBg} px-3 py-2 text-sm ${colors.text} placeholder:${colors.textTertiary} focus:border-[#3351ff] focus:outline-none resize-none`}
                          />
                          <button
                            onClick={async () => {
                              if (!newDataSourceName.trim() || !newDataSourceContent.trim()) return;
                              setAddingDataSource(true);
                              setUploadError(null);
                              try {
                                const response = await fetch(`/api/agents/${agentId}/data-sources`, {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    name: newDataSourceName.trim(),
                                    type: "text",
                                    content: newDataSourceContent.trim(),
                                  }),
                                });
                                if (response.ok) {
                                  const newDataSource = await response.json();
                                  setAvailableDataSources([...availableDataSources, {
                                    id: newDataSource.id,
                                    name: newDataSource.name,
                                    type: newDataSource.type,
                                  }]);
                                  setNewDataSourceName("");
                                  setNewDataSourceContent("");
                                  setShowAddDataSource(false);
                                } else {
                                  const errorData = await response.json().catch(() => ({ error: "Failed to add data source" }));
                                  setUploadError(errorData.error || "Failed to add data source");
                                }
                              } catch (error: any) {
                                console.error("Failed to add data source:", error);
                                setUploadError(error.message || "Failed to add data source");
                              } finally {
                                setAddingDataSource(false);
                              }
                            }}
                            disabled={addingDataSource || !newDataSourceName.trim() || !newDataSourceContent.trim()}
                            className={`w-full px-4 py-2 rounded-2xl ${colors.buttonPrimary} ${colors.buttonPrimaryHover} text-white text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            {addingDataSource ? "Adding..." : "Add Data Source"}
                          </button>
                        </>
                      ) : (
                        <>
                          <div
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onDrop={async (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
                              await handleFileUpload(Array.from(e.dataTransfer.files));
                            }}
                            className={`border-2 border-dashed ${colors.border} rounded-2xl p-6 text-center ${colors.hover}`}
                          >
                            <input
                              type="file"
                              id="file-upload-modal"
                              multiple
                              onChange={async (e) => {
                                if (e.target.files && e.target.files.length > 0) {
                                  await handleFileUpload(Array.from(e.target.files));
                                  e.target.value = "";
                                }
                              }}
                              className="hidden"
                            />
                            <label
                              htmlFor="file-upload-modal"
                              className="cursor-pointer block"
                            >
                              <div className={`flex flex-col items-center gap-2`}>
                                <FileText className={`h-8 w-8 ${colors.textSecondary}`} />
                                <div>
                                  <span className={`font-medium ${colors.text}`}>
                                    Drop files here or click to browse
                                  </span>
                                  <p className={`text-xs ${colors.textTertiary} mt-1`}>
                                    Supports PDF, DOCX, TXT, and other document formats
                                  </p>
                                </div>
                              </div>
                            </label>
                          </div>
                          {uploadError && (
                            <div className={`p-3 rounded-2xl bg-red-500/10 border border-red-500/30`}>
                              <p className={`text-sm text-red-400`}>{uploadError}</p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Data Sources List */}
                  {availableDataSources.length === 0 && !showAddDataSource ? (
                    <div className={`text-center ${colors.textSecondary} py-8`}>
                      <p className="mb-2">No data sources available.</p>
                      <p className="text-xs">Click "Add New Data Source" above to create one.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {availableDataSources.map((ds) => (
                        <label
                          key={ds.id}
                          className={`flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition ${
                            selectedDataSourceIds.includes(ds.id)
                              ? `border-[#3351ff] bg-blue-500/10`
                              : `${colors.border} ${colors.bgSecondary} hover:border-[#3351ff]/50`
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedDataSourceIds.includes(ds.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedDataSourceIds([...selectedDataSourceIds, ds.id]);
                              } else {
                                setSelectedDataSourceIds(selectedDataSourceIds.filter(id => id !== ds.id));
                              }
                            }}
                            className="w-5 h-5 rounded border-gray-600 text-[#3351ff] focus:ring-2 focus:ring-[#3351ff] focus:ring-offset-2 focus:ring-offset-gray-900"
                          />
                          <div className="flex-1 flex items-center justify-between">
                            <div>
                              <div className={`font-medium ${colors.text}`}>{ds.name}</div>
                              <div className={`text-xs ${colors.textTertiary} mt-1`}>
                                {ds.type === "text" ? "Text Knowledge Base" : `File: ${ds.file_type || ds.type}`}
                              </div>
                            </div>
                            {(ds.type === "file" || ds.file_url) && (
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  previewDataSource(ds);
                                }}
                                className={`p-2 rounded-full ${colors.hover} ${colors.textSecondary} hover:${colors.text} transition`}
                                title="Preview"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-800">
              <button
                onClick={() => {
                  setDataSourceModal({ isOpen: false, stepId: null });
                  setShowAddDataSource(false);
                  setNewDataSourceName("");
                  setNewDataSourceContent("");
                  setUploadError(null);
                }}
                className={`px-4 py-2 rounded-2xl border ${colors.border} ${colors.bgSecondary} ${colors.textSecondary} ${colors.hover} text-sm font-medium transition`}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!dataSourceModal.stepId) return;
                  
                  try {
                    const response = await fetch(`/api/steps/${dataSourceModal.stepId}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        selected_data_source_ids: selectedDataSourceIds,
                      }),
                    });

                    if (response.ok) {
                      // Update local state
                      setScenario((prev) => ({
                        ...prev,
                        steps: prev.steps.map((s) =>
                          s.id === dataSourceModal.stepId
                            ? { ...s, selected_data_source_ids: selectedDataSourceIds }
                            : s
                        ),
                      }));
                      setDataSourceModal({ isOpen: false, stepId: null });
                    }
                  } catch (error) {
                    console.error("Failed to save data source selection:", error);
                  }
                }}
                className={`px-4 py-2 rounded-2xl ${colors.buttonPrimary} ${colors.buttonPrimaryHover} text-white text-sm font-medium transition`}
              >
                Save Selection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewModal.isOpen && previewModal.dataSource && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className={`w-full max-w-4xl max-h-[90vh] rounded-3xl ${colors.bg} ${colors.border} border-2 shadow-2xl flex flex-col`}>
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <div>
                <h3 className={`text-lg font-semibold ${colors.text}`}>{previewModal.dataSource.name}</h3>
                <p className={`text-sm ${colors.textTertiary} mt-1`}>
                  {previewModal.dataSource.type === "text" ? "Text Knowledge Base" : `File: ${previewModal.dataSource.file_type || "Unknown type"}`}
                </p>
              </div>
              <button
                onClick={() => setPreviewModal({ isOpen: false, dataSource: null, content: null, loading: false })}
                className={`p-2 rounded-full ${colors.hover} ${colors.textSecondary} hover:${colors.text}`}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              {previewModal.loading ? (
                <div className={`text-center ${colors.textTertiary} py-8`}>Loading preview...</div>
              ) : previewModal.content ? (
                <div>
                  {previewModal.content === "PDF_PREVIEW" && previewModal.dataSource.file_url ? (
                    <iframe
                      src={previewModal.dataSource.file_url}
                      className="w-full h-[600px] rounded-2xl border border-gray-700"
                      title={previewModal.dataSource.name}
                    />
                  ) : previewModal.dataSource.type === "file" && 
                    previewModal.dataSource.file_type?.startsWith("image/") ? (
                    <img
                      src={previewModal.content} 
                      alt={previewModal.dataSource.name}
                      className="max-w-full h-auto rounded-2xl"
                    />
                  ) : (
                    <pre className={`whitespace-pre-wrap ${colors.text} text-sm font-mono bg-gray-900/50 p-4 rounded-2xl overflow-auto max-h-[600px]`}>
                      {previewModal.content}
                    </pre>
                  )}
                </div>
              ) : (
                <div className={`text-center ${colors.textTertiary}`}>No preview available</div>
              )}
            </div>

            {previewModal.dataSource.file_url && (
              <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-800">
                <a
                  href={previewModal.dataSource.file_url}
                  download
                  className={`px-4 py-2 rounded-2xl border ${colors.border} ${colors.bgSecondary} ${colors.textSecondary} ${colors.hover} text-sm font-medium transition`}
                >
                  Download
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
