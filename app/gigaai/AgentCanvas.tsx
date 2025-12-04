"use client";

import { useState, useEffect } from "react";
import { MessageSquare, FileText, GitBranch, Code, Zap, ArrowRight, ArrowDown, X, Plus, Trash2, Calendar, CheckCircle, HelpCircle, Repeat, UserCheck, Phone, Eye, Play, GitMerge, MoreVertical } from "lucide-react";
import ConfirmationModal from "./ConfirmationModal";
import { useTheme } from "./ThemeProvider";

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
  { type: "branch", label: "Branch", description: "Splits into two paths", icon: GitMerge },
  { type: "call", label: "Call", description: "AI agent has been called", icon: Phone },
  { type: "transfer", label: "Transfer", description: "Transfer to another agent", icon: UserCheck },
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
  
  // Debug: Log deployment status
  useEffect(() => {
    console.log("[AgentCanvas] isDeployed:", isDeployed);
  }, [isDeployed]);
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
            stepsData.map(async (step: any) => {
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
    setDraggedOver(false);
    console.log("[AgentCanvas] handleDrop - isDeployed:", isDeployed);
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
    const type = event.dataTransfer.getData("step-type") as StepType;
    console.log("[AgentCanvas] Dropped step type:", type);
    if (!type) {
      console.log("[AgentCanvas] No step type in dataTransfer");
      return;
    }

    try {
      const message = defaultMessage(type);
      const response = await fetch(`/api/scenarios/${scenarioId}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: message,
          type,
          ai_message: type === "say" ? message : null,
        }),
      });

      if (response.ok) {
        const newStepData = await response.json();
        let initialBranches: Branch[] | undefined = undefined;
        
        // For branch steps, automatically create True and False branches
        if (type === "branch") {
          try {
            // Create True branch
            const trueBranchResponse = await fetch(`/api/steps/${newStepData.id}/branches`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                condition: "Condition is true",
                condition_tag: "true",
                target: "Next step",
              }),
            });
            
            // Create False branch
            const falseBranchResponse = await fetch(`/api/steps/${newStepData.id}/branches`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                condition: "Condition is false",
                condition_tag: "false",
                target: "Next step",
              }),
            });
            
            if (trueBranchResponse.ok && falseBranchResponse.ok) {
              const trueBranch = await trueBranchResponse.json();
              const falseBranch = await falseBranchResponse.json();
              initialBranches = [
                {
                  id: trueBranch.id,
                  condition: trueBranch.condition,
                  condition_tag: trueBranch.condition_tag,
                  target: trueBranch.target,
                  next_step_id: trueBranch.next_step_id,
                  next_scenario_id: trueBranch.next_scenario_id,
                },
                {
                  id: falseBranch.id,
                  condition: falseBranch.condition,
                  condition_tag: falseBranch.condition_tag,
                  target: falseBranch.target,
                  next_step_id: falseBranch.next_step_id,
                  next_scenario_id: falseBranch.next_scenario_id,
                },
              ];
            }
          } catch (branchError) {
            console.error("Failed to create initial branches:", branchError);
          }
        }
        
        const newStep: Step = {
          id: newStepData.id,
          type: newStepData.type as StepType,
          name: newStepData.name,
          ai_message: newStepData.ai_message,
          message: newStepData.ai_message || newStepData.name,
          branches: initialBranches || (type === "say" ? [] : undefined),
          sort_order: newStepData.sort_order,
        };

        setScenario((prev) => ({
          ...prev,
          steps: [...prev.steps, newStep].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
        }));
      }
    } catch (error) {
      console.error("Failed to create step:", error);
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

  const deleteStep = (stepId: string) => {
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
          const response = await fetch(`/api/steps/${stepId}`, {
            method: "DELETE",
          });

          if (response.ok) {
            setScenario((prev) => ({
              ...prev,
              steps: prev.steps.filter((step) => step.id !== stepId),
            }));
            if (editingStepId === stepId) {
              setEditingStepId(null);
              setEditingText("");
            }
          }
        } catch (error) {
          console.error("Failed to delete step:", error);
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
        {/* Workflow Header */}
        <div className={`border-b ${colors.border} ${colors.bg} px-6 py-4`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className={`text-base font-semibold ${colors.text}`}>Workflow: {scenarioName}</h2>
            </div>
          </div>
        </div>

        {/* Fullscreen Content */}
        <div className={`flex-1 overflow-y-auto bg-[#ffffff]`} style={{ background: '#ffffff', backgroundImage: 'none' }}>
          <div className="max-w-6xl mx-auto px-8 py-8">
            <div className="mb-8">
              {/* Scenario Title */}
              <h3 className={`text-xs font-semibold ${colors.text} mb-6`}>
                Workflow: "{scenarioName}"
              </h3>

              {/* Drop Zone + Steps - ONE BOX for all steps - Smaller box, centered */}
              <div
                className={`rounded-3xl border border-[#e5e7eb] bg-[#ffffff] px-4 py-4 max-w-4xl mx-auto transition ${
                  draggedOver
                    ? "border-[#3166bf] bg-[#3166bf]/10"
                    : ""
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDraggedOver(true);
                }}
                onDragLeave={() => setDraggedOver(false)}
                onDrop={handleDrop}
              >
                {loading ? (
                  <div className={`text-center ${colors.textTertiary} text-sm py-12`}>
                    <div className="mb-2">Loading steps...</div>
                  </div>
                ) : scenario.steps.length === 0 ? (
                  <div className={`text-center ${colors.textTertiary} text-sm py-12`}>
                    <div className="mb-2">👆</div>
                    <div>Drag a function from above to create the first step</div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Warning for missing greeting message */}
                    {(() => {
                      const firstSayStep = scenario.steps.find(s => s.type === "say");
                      if (firstSayStep && (!firstSayStep.ai_message || firstSayStep.ai_message.trim().length === 0)) {
                        return (
                          <div className="mb-4 p-3 rounded-2xl bg-[#fffbeb] border border-[#fbbf24]/30 flex items-start gap-2">
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
                    {scenario.steps.map((step, stepIdx) => {
                      const stepCategory = getStepCategory(step.type);
                      const paletteItem = FUNCTION_PALETTE.find(p => p.type === step.type);
                      const StepIcon = paletteItem?.icon || FileText;
                      
                      return (
                      <div key={step.id} className="relative mb-8">
                        {/* Connecting Arrow from previous step */}
                        {stepIdx > 0 && (
                          <div className="flex justify-center mb-3">
                            <ArrowDown className="h-6 w-6 text-[#70d4b4]" />
                          </div>
                        )}
                        
                        {/* Category Label */}
                        <div className="mb-1.5">
                          <span className={`text-[10px] font-medium ${getCategoryColor(stepCategory)} uppercase tracking-wide`}>
                            {stepCategory}
                          </span>
                        </div>
                        
                        {/* Step Card */}
                        <div className="relative bg-[#f0fdf4] border border-[#e5e7eb] rounded-2xl p-4 hover:shadow-md transition">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              {/* Step Icon */}
                              <div className="flex-shrink-0 mt-0.5">
                                <StepIcon className="h-5 w-5 text-[#151515]" />
                              </div>
                              
                              {/* Step Content */}
                              <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-semibold text-[#151515] mb-1">
                                  {paletteItem?.label || step.type}
                                </h4>
                                <p className="text-xs text-[#151515]/70">
                                  {editingStepId === step.id ? (
                                    <textarea
                                      value={editingText}
                                      onChange={(e) => setEditingText(e.target.value)}
                                      rows={2}
                                      className="w-full rounded-lg border border-[#3166bf] bg-white px-2 py-1 text-xs text-[#151515] focus:border-[#3166bf] focus:outline-none"
                                      autoFocus
                                    />
                                  ) : (
                                    <span 
                                      className="cursor-pointer hover:text-[#151515]"
                                      onClick={() => startEditing(step)}
                                    >
                                      {step.message || step.ai_message || defaultMessage(step.type)}
                                    </span>
                                  )}
                                </p>
                              </div>
                            </div>
                            
                            {/* Menu Button */}
                            <button
                              className="p-1 hover:bg-white/50 rounded-lg transition flex-shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm("Delete this step?")) {
                                  deleteStep(step.id);
                                }
                              }}
                              title="Delete step"
                            >
                              <MoreVertical className="h-4 w-4 text-[#151515]/50 hover:text-[#151515]" />
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
                        
                        {/* Branch Paths - Show True/False paths side-by-side with steps */}
                        {step.type === "branch" && step.branches && step.branches.length > 0 && (
                          <div className="mt-6 flex gap-8">
                            {step.branches.map((branch, branchIdx) => {
                              // Find steps that follow this branch by following the sequence
                              const branchSteps: Step[] = [];
                              if (branch.next_step_id) {
                                const startStep = scenario.steps.find(s => s.id === branch.next_step_id);
                                if (startStep) {
                                  branchSteps.push(startStep);
                                  // Find subsequent steps in this branch path
                                  // Get all steps after the branch step, sorted by sort_order
                                  const branchStepIndex = scenario.steps.findIndex(s => s.id === step.id);
                                  const allStepsAfterBranch = scenario.steps
                                    .filter((s, idx) => idx > branchStepIndex)
                                    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
                                  
                                  // For now, show steps that come after the branch in sequence
                                  // In a full implementation, you'd track which steps belong to which branch path
                                  const nextSteps = allStepsAfterBranch.slice(0, 3); // Show up to 3 steps per branch
                                  branchSteps.push(...nextSteps.filter(s => !branchSteps.find(bs => bs.id === s.id)));
                                }
                              }
                              
                              return (
                                <div key={branch.id} className="flex-1">
                                  {/* Branch Label with connecting line */}
                                  <div className="flex items-center gap-2 mb-4">
                                    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                      branchIdx === 0 
                                        ? "bg-[#f0fdf4] text-[#70d4b4] border border-[#70d4b4]"
                                        : "bg-[#fef2f2] text-[#f0494a] border border-[#f0494a]"
                                    }`}>
                                      {branchIdx === 0 ? (
                                        <>
                                          <CheckCircle className="h-3 w-3" />
                                          True
                                        </>
                                      ) : (
                                        <>
                                          <X className="h-3 w-3" />
                                          False
                                        </>
                                      )}
                                    </div>
                                    <div className="h-px bg-[#e5e7eb] flex-1"></div>
                                  </div>
                                  
                                  {/* Steps in this branch path */}
                                  <div className="space-y-4">
                                    {branchSteps.length > 0 ? (
                                      branchSteps.map((branchStep) => {
                                        const branchStepCategory = getStepCategory(branchStep.type);
                                        const branchPaletteItem = FUNCTION_PALETTE.find(p => p.type === branchStep.type);
                                        const BranchStepIcon = branchPaletteItem?.icon || FileText;
                                        
                                        return (
                                          <div key={branchStep.id} className="relative">
                                            {/* Connecting Arrow */}
                                            <div className="flex justify-center mb-2">
                                              <ArrowDown className="h-6 w-6 text-[#70d4b4]" />
                                            </div>
                                            
                                            {/* Category Label */}
                                            <div className="mb-2">
                                              <span className={`text-[10px] font-medium ${getCategoryColor(branchStepCategory)} uppercase tracking-wide`}>
                                                {branchStepCategory}
                                              </span>
                                            </div>
                                            
                                            {/* Step Card */}
                                            <div className="relative bg-[#f0fdf4] border border-[#e5e7eb] rounded-2xl p-4 hover:shadow-md transition">
                                              <div className="flex items-start justify-between">
                                                <div className="flex items-start gap-3 flex-1">
                                                  <div className="flex-shrink-0 mt-0.5">
                                                    <BranchStepIcon className="h-5 w-5 text-[#151515]" />
                                                  </div>
                                                  <div className="flex-1 min-w-0">
                                                    <h4 className="text-sm font-semibold text-[#151515] mb-1">
                                                      {branchPaletteItem?.label || branchStep.type}
                                                    </h4>
                                                    <p className="text-xs text-[#151515]/70">
                                                      {branchStep.message || branchStep.ai_message || defaultMessage(branchStep.type)}
                                                    </p>
                                                  </div>
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })
                                    ) : (
                                      <div className="text-xs text-[#151515]/40 italic pl-4 py-2">
                                        {branch.condition || "No condition set"}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
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
