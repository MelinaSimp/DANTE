"use client";

import { useState, useEffect } from "react";
import { MessageSquare, FileText, GitBranch, Code, Zap, ArrowRight, X, Plus, Trash2, Calendar, CheckCircle, HelpCircle, Repeat, UserCheck, Phone, Eye, Edit } from "lucide-react";
import ConfirmationModal from "./ConfirmationModal";
import { useTheme } from "./ThemeProvider";

type StepType = "say" | "gather" | "code" | "api_call" | "schedule" | "qa" | "loop" | "send_sms" | "transfer";

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

const FUNCTION_PALETTE: { type: StepType; label: string; description: string; icon: any }[] = [
  { type: "say", label: "Say", description: "Send a message to the user", icon: MessageSquare },
  { type: "gather", label: "Gather", description: "Collect user input", icon: FileText },
  { type: "qa", label: "Q/A", description: "Answer question using data sources", icon: HelpCircle },
  // REMOVED: { type: "if", label: "If Statement", ... } - Use branches on Gather/Q/A instead
  { type: "code", label: "Code", description: "Run custom code", icon: Code },
  { type: "api_call", label: "API Call", description: "Call an external API", icon: Zap },
  { type: "schedule", label: "Schedule", description: "Schedule an appointment", icon: Calendar },
  // NEW STEP TYPES:
  { type: "loop", label: "Loop", description: "Repeat a sequence of steps", icon: Repeat },
  { type: "send_sms", label: "Send SMS", description: "Send text message to customer", icon: Phone },
  { type: "transfer", label: "Transfer", description: "Route to specialist agent", icon: UserCheck },
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
    case "say":
      return "Welcome! How can I help you today?";
    case "gather":
      return "What information would you like to collect?";
    case "qa":
      return "Answer customer question using data sources";
    // REMOVED: case "if" - If steps removed
    case "loop":
      return "Loop configuration";
    case "send_sms":
      return "Send SMS message";
    case "transfer":
      return "Transfer to specialist";
    case "code":
      return "// Write your code here";
    case "api_call":
      return "Call API endpoint";
    case "schedule":
      return "Schedule appointment confirmation message";
    case "loop":
      return "Loop configuration";
    case "send_sms":
      return "Send SMS message";
    case "transfer":
      return "Transfer to specialist";
    default:
      return "New step";
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
        const newStep: Step = {
          id: newStepData.id,
          type: newStepData.type as StepType,
          name: newStepData.name,
          ai_message: newStepData.ai_message,
          message: newStepData.ai_message || newStepData.name,
          branches: type === "say" ? [] : undefined,
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

  // Helper function to render a single step (used for nested steps in loops)
  const renderStepContent = (step: Step) => {
    return (
      <div className="pb-4">
        {/* Step Label */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-medium ${colors.textTertiary} uppercase tracking-wide`}>
              {step.type === "say"
                ? "Co Say"
                : step.type === "gather"
                ? "Gather"
                : step.type === "qa"
                ? "Q/A"
                : step.type === "schedule"
                ? "Schedule"
                : step.type === "code"
                ? "Code"
                : step.type === "api_call"
                ? "API Call"
                : step.type === "loop"
                ? "Loop"
                : step.type === "send_sms"
                ? "Send SMS"
                : step.type === "transfer"
                ? "Transfer"
                : "Step"}
            </span>
            {step.type === "say" && (
              <MessageSquare className={`h-3 w-3 ${colors.iconSecondary}`} />
            )}
            {step.type === "qa" && (
              <HelpCircle className={`h-3 w-3 ${colors.iconSecondary}`} />
            )}
            {step.type === "schedule" && (
              <Calendar className={`h-3 w-3 ${colors.iconSecondary}`} />
            )}
            {step.type === "say" && (
              <div className="flex items-center gap-1" title={step.ai_message && step.ai_message.trim().length > 0 ? "Message configured" : "No message configured - click to edit"}>
                {step.ai_message && step.ai_message.trim().length > 0 ? (
                  <CheckCircle className="h-3.5 w-3.5 text-green-400" />
                ) : (
                  <div className="h-3.5 w-3.5 rounded-full border-2 border-yellow-400 flex items-center justify-center">
                    <span className="text-[8px] text-yellow-400">!</span>
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => deleteStep(step.id)}
            className="p-1.5 hover:bg-red-500/20 rounded-full transition text-red-400/70 hover:text-red-400"
            title="Delete step"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Step Message */}
        <div className="mb-4">
          {editingStepId === step.id ? (
            <div className="space-y-3">
              <textarea
                value={editingText}
                onChange={(e) => setEditingText(e.target.value)}
                rows={3}
                className={`w-full rounded-2xl border ${colors.border} ${colors.inputBg} px-3 py-2 text-xs ${colors.text} placeholder:${colors.textTertiary} focus:border-[#3351ff] focus:outline-none`}
              />
              <div className="flex gap-2">
                <button
                  onClick={saveEditing}
                  className={`px-3 py-1.5 rounded-2xl ${colors.buttonPrimary} ${colors.buttonPrimaryHover} text-[10px] font-medium text-white`}
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setEditingStepId(null);
                    setEditingText("");
                  }}
                  className={`px-3 py-1.5 rounded-2xl border ${colors.border} ${colors.bgSecondary} text-[10px] ${colors.textSecondary} ${colors.hover}`}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p
              className={`text-sm ${colors.text} leading-relaxed cursor-pointer ${colors.hover} transition`}
              onClick={() => startEditing(step)}
            >
              "{step.message}"
            </p>
          )}
        </div>

        {/* Step-specific configurations - render all except loop config (since loop is handled separately) */}
        {step.type === "qa" && (
          <div className="mb-4 p-3 rounded-2xl border border-blue-500/30 bg-blue-500/10">
            <div className="flex items-center justify-between mb-2">
              <label className={`text-[10px] font-medium ${colors.textSecondary}`}>
                Data Sources
              </label>
              {!isDeployed && (
                <button
                  onClick={async () => {
                    setLoadingDataSources(true);
                    setShowAddDataSource(false);
                    setUploadError(null);
                    try {
                      const response = await fetch(`/api/agents/${agentId}/data-sources`);
                      if (response.ok) {
                        const data = await response.json();
                        setAvailableDataSources(data.map((ds: any) => ({
                          id: ds.id,
                          name: ds.name,
                          type: ds.type,
                          file_url: ds.file_url,
                          file_type: ds.file_type,
                          content: ds.content,
                          integration_type: ds.integration_type,
                        })));
                        const currentStep = scenario.steps.find(s => s.id === step.id);
                        setSelectedDataSourceIds(currentStep?.selected_data_source_ids || []);
                        setDataSourceModal({ isOpen: true, stepId: step.id });
                      }
                    } catch (error) {
                      console.error("Failed to load data sources:", error);
                    } finally {
                      setLoadingDataSources(false);
                    }
                  }}
                  className={`text-[10px] ${colors.textTertiary} ${colors.hover} underline`}
                >
                  Provided Data Sources
                </button>
              )}
            </div>
            <p className={`text-[10px] ${colors.textTertiary}`}>
              {step.selected_data_source_ids?.length > 0
                ? `${step.selected_data_source_ids.length} data source(s) selected`
                : "No data sources selected - AI will answer from general knowledge"}
            </p>
          </div>
        )}

        {/* Conditional Branches */}
        {(step.type === "say" || step.type === "gather" || step.type === "qa") && (
          <div className="space-y-2 ml-0">
            {step.branches && step.branches.length > 0 ? (
              step.branches.map((branch) => (
                <div key={branch.id} className="flex items-start gap-2 text-xs group">
                  <ArrowRight className={`h-4 w-4 ${colors.iconSecondary} flex-shrink-0 mt-0.5`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={colors.textSecondary}>If</span>
                      <span className={`${colors.text} font-medium`}>{branch.condition || "New condition"}</span>
                      {branch.condition_tag && (
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-mono ${
                            branch.condition_tag.startsWith("@")
                              ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                              : branch.condition_tag === "If Statement"
                              ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                              : "bg-green-500/20 text-green-300 border border-green-500/30"
                          }`}
                        >
                          {branch.condition_tag}
                        </span>
                      )}
                      <span className={colors.textSecondary}>proceed to</span>
                      <button
                        className={`${colors.text} font-semibold ${colors.hover} underline decoration-dotted`}
                        onClick={() => {
                          setSelectedStepForBranch({
                            scenarioId: scenarioId,
                            stepId: step.id,
                            branchId: branch.id,
                          });
                        }}
                      >
                        {branch.target || "Next step"}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={() => {
                        setSelectedStepForBranch({
                          scenarioId: scenarioId,
                          stepId: step.id,
                          branchId: branch.id,
                        });
                      }}
                      className={`p-1 ${colors.hover} rounded-full`}
                      title="Edit branch"
                    >
                      <Edit className={`h-3 w-3 ${colors.iconSecondary}`} />
                    </button>
                    <button
                      onClick={() => deleteBranch(step.id, branch.id)}
                      className={`p-1 ${colors.hover} rounded-full`}
                      title="Delete branch"
                    >
                      <Trash2 className={`h-3 w-3 ${colors.iconSecondary}`} />
                    </button>
                  </div>
                </div>
              ))
            ) : null}
            {(step.type === "gather" || step.type === "qa") && (
              <button
                onClick={() => {
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
                  addBranch(step.id);
                }}
                className={`text-[10px] ${colors.textTertiary} ${colors.hover} underline flex items-center gap-1`}
              >
                <ArrowRight className="h-3 w-3" />
                Add conditional branch
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`h-full flex ${colors.bg}`}>
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Scenario Header */}
        <div className={`border-b ${colors.border} ${colors.bg} px-6 py-4`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className={`text-base font-semibold ${colors.text}`}>Scenario: {scenarioName}</h2>
            </div>
          </div>
        </div>

        {/* Function Palette */}
        <div className={`border-b ${colors.border} ${colors.bg} px-6 py-4`}>
          <div className="max-w-6xl mx-auto">
            <p className={`text-[10px] ${colors.textTertiary} mb-3`}>Drag a function into the scenario below to create a step</p>
            <div className="flex items-center gap-3 overflow-x-auto pb-2">
              {FUNCTION_PALETTE.map((fn) => {
                const Icon = fn.icon;
                return (
                  <div
                    key={fn.type}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("step-type", fn.type);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    className={`flex-shrink-0 cursor-grab active:cursor-grabbing rounded-3xl border ${colors.border} ${colors.cardBg} px-4 py-3 text-xs ${colors.text} hover:border-[#3351ff]/50 ${colors.hover} transition`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${colors.iconSecondary}`} />
                      <div>
                        <div className={`font-semibold text-xs ${colors.text}`}>{fn.label}</div>
                        <div className={`text-[10px] ${colors.textTertiary}`}>{fn.description}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Fullscreen Content */}
        <div className={`flex-1 overflow-y-auto ${colors.bg}`} style={{ backgroundImage: 'url(/backgrounds/dunes.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}>
          <div className="max-w-6xl mx-auto px-8 py-8">
            <div className="mb-12">
              {/* Scenario Title */}
              <h3 className={`text-xs font-semibold ${colors.text} mb-4`}>
                Scenario 1: "{scenarioName}" Inquiry
              </h3>

              {/* Drop Zone + Steps - ONE BOX for all steps - Smaller box, centered */}
              <div
                className={`rounded-3xl border border-white/10 bg-[#242423]/90 backdrop-blur-sm px-4 py-4 max-w-4xl mx-auto transition ${
                  draggedOver
                    ? "border-[#3351ff] bg-[#3351ff]/10"
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
                          <div className="mb-4 p-3 rounded-2xl bg-yellow-500/20 border border-yellow-500/30 flex items-start gap-2">
                            <div className="h-4 w-4 rounded-full border-2 border-yellow-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <span className="text-[10px] text-yellow-400">!</span>
                            </div>
                            <div className="flex-1">
                              <div className={`text-xs font-medium text-yellow-300 mb-1`}>
                                Greeting Message Missing
                              </div>
                              <div className={`text-[10px] text-yellow-300/80`}>
                                Your first "Co Say" step doesn't have a message configured. Click on it to add your greeting message, otherwise callers will hear the default greeting.
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}
                    {(() => {
                      // Group steps by loops - find loop steps and their nested steps
                      const renderedSteps: Set<string> = new Set();
                      const result: JSX.Element[] = [];
                      
                      for (let i = 0; i < scenario.steps.length; i++) {
                        const step = scenario.steps[i];
                        if (renderedSteps.has(step.id)) continue;
                        
                        if (step.type === "loop") {
                          // Find all steps after this loop until the next loop or end
                          const nestedSteps: typeof scenario.steps = [];
                          for (let j = i + 1; j < scenario.steps.length; j++) {
                            const nextStep = scenario.steps[j];
                            if (nextStep.type === "loop") break; // Stop at next loop
                            nestedSteps.push(nextStep);
                            renderedSteps.add(nextStep.id);
                          }
                          
                          // Render loop with nested steps inside purple container
                          result.push(
                            <div key={step.id} className="rounded-3xl border-2 border-purple-500/50 bg-purple-500/15 p-6 space-y-6 shadow-lg shadow-purple-500/10">
                              {/* Loop Step Header */}
                              <div className="relative">
                                <div className="pb-4 border-b border-purple-500/20">
                                  {/* Loop Label */}
                                  <div className="mb-3 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className={`text-[10px] font-medium ${colors.textTertiary} uppercase tracking-wide`}>
                                        Loop
                                      </span>
                                      <Repeat className={`h-3 w-3 ${colors.iconSecondary}`} />
                                    </div>
                                    <button
                                      onClick={() => deleteStep(step.id)}
                                      className="p-1.5 hover:bg-red-500/20 rounded-full transition text-red-400/70 hover:text-red-400"
                                      title="Delete step"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                  
                                  {/* Loop Message */}
                                  <div className="mb-4">
                                    {editingStepId === step.id ? (
                                      <div className="space-y-3">
                                        <textarea
                                          value={editingText}
                                          onChange={(e) => setEditingText(e.target.value)}
                                          rows={3}
                                          className={`w-full rounded-2xl border ${colors.border} ${colors.inputBg} px-3 py-2 text-xs ${colors.text} placeholder:${colors.textTertiary} focus:border-[#3351ff] focus:outline-none`}
                                        />
                                        <div className="flex gap-2">
                                          <button
                                            onClick={saveEditing}
                                            className={`px-3 py-1.5 rounded-2xl ${colors.buttonPrimary} ${colors.buttonPrimaryHover} text-[10px] font-medium text-white`}
                                          >
                                            Save
                                          </button>
                                          <button
                                            onClick={() => {
                                              setEditingStepId(null);
                                              setEditingText("");
                                            }}
                                            className={`px-3 py-1.5 rounded-2xl border ${colors.border} ${colors.bgSecondary} text-[10px] ${colors.textSecondary} ${colors.hover}`}
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <p
                                        className={`text-sm ${colors.text} leading-relaxed cursor-pointer ${colors.hover} transition`}
                                        onClick={() => startEditing(step)}
                                      >
                                        "{step.message}"
                                      </p>
                                    )}
                                  </div>
                                  
                                  {/* Loop Configuration */}
                                  {step.type === "loop" && (
                                    <div className="mb-4 p-3 rounded-2xl border border-purple-500/40 bg-purple-500/20 space-y-3">
                                      <label className={`block text-[10px] font-medium ${colors.textSecondary}`}>
                                        Loop Configuration
                                      </label>
                                      <div className="space-y-2">
                                        <label className={`block text-[10px] ${colors.textTertiary}`}>
                                          Number of Iterations
                                        </label>
                                        <select
                                          className={`w-full rounded-2xl border ${colors.border} ${colors.inputBg} px-3 py-2 text-xs ${colors.text} focus:border-[#3351ff] focus:outline-none`}
                                          value={step.loop_config?.iterations || "1"}
                                          onChange={async (e) => {
                                            const newConfig = {
                                              ...(step.loop_config || {}),
                                              iterations: e.target.value === "infinity" ? "infinity" : parseInt(e.target.value) || 1
                                            };
                                            await updateStepConfig(step.id, "loop_config", newConfig);
                                          }}
                                        >
                                          <option value="1">1 time</option>
                                          <option value="2">2 times</option>
                                          <option value="3">3 times</option>
                                          <option value="infinity">Infinity</option>
                                        </select>
                                        <p className={`text-[9px] ${colors.textTertiary} mt-1`}>
                                          The steps below will be repeated {step.loop_config?.iterations === "infinity" ? "infinitely" : `${step.loop_config?.iterations || 1} time(s)`}.
                                        </p>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                              
                              {/* Nested Steps Inside Loop - Visually contained */}
                              {nestedSteps.length > 0 ? (
                                <div className="space-y-6">
                                  <div className={`text-[10px] font-medium ${colors.textTertiary} uppercase tracking-wide flex items-center gap-2`}>
                                    <div className="h-px flex-1 bg-purple-500/30"></div>
                                    <span>Steps in Loop</span>
                                    <div className="h-px flex-1 bg-purple-500/30"></div>
                                  </div>
                                  <div className="space-y-6 pl-4 border-l-2 border-purple-500/40">
                                    {nestedSteps.map((nestedStep) => (
                                      <div key={nestedStep.id} className="relative">
                                        {renderStepContent(nestedStep)}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <div className={`text-center py-8 ${colors.textTertiary} text-xs`}>
                                  <p>No steps in loop yet. Add steps after the Loop step to include them.</p>
                                </div>
                              )}
                            </div>
                          );
                          renderedSteps.add(step.id);
                        } else {
                          // Regular step (not part of a loop) - render normally
                          result.push(
                            <div key={step.id} className="relative">
                              <div className="pb-4">
                                {/* Step Label */}
                                <div className="mb-3 flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-[10px] font-medium ${colors.textTertiary} uppercase tracking-wide`}>
                                      {step.type === "say"
                                        ? "Co Say"
                                        : step.type === "gather"
                                        ? "Gather"
                                        : step.type === "qa"
                                        ? "Q/A"
                                        : step.type === "schedule"
                                        ? "Schedule"
                                        : step.type === "code"
                                        ? "Code"
                                        : step.type === "api_call"
                                        ? "API Call"
                                        : step.type === "loop"
                                        ? "Loop"
                                        : step.type === "send_sms"
                                        ? "Send SMS"
                                        : step.type === "transfer"
                                        ? "Transfer"
                                        : "Step"}
                                    </span>
                                    {step.type === "say" && (
                                      <MessageSquare className={`h-3 w-3 ${colors.iconSecondary}`} />
                                    )}
                                    {step.type === "qa" && (
                                      <HelpCircle className={`h-3 w-3 ${colors.iconSecondary}`} />
                                    )}
                                    {step.type === "schedule" && (
                                      <Calendar className={`h-3 w-3 ${colors.iconSecondary}`} />
                                    )}
                                    {step.type === "say" && (
                                      <div className="flex items-center gap-1" title={step.ai_message && step.ai_message.trim().length > 0 ? "Message configured" : "No message configured - click to edit"}>
                                        {step.ai_message && step.ai_message.trim().length > 0 ? (
                                          <CheckCircle className="h-3.5 w-3.5 text-green-400" />
                                        ) : (
                                          <div className="h-3.5 w-3.5 rounded-full border-2 border-yellow-400 flex items-center justify-center">
                                            <span className="text-[8px] text-yellow-400">!</span>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => deleteStep(step.id)}
                                    className="p-1.5 hover:bg-red-500/20 rounded-full transition text-red-400/70 hover:text-red-400"
                                    title="Delete step"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>

                                {/* Step Message */}
                                <div className="mb-4">
                                  {editingStepId === step.id ? (
                                    <div className="space-y-3">
                                      <textarea
                                        value={editingText}
                                        onChange={(e) => setEditingText(e.target.value)}
                                        rows={3}
                                        className={`w-full rounded-2xl border ${colors.border} ${colors.inputBg} px-3 py-2 text-xs ${colors.text} placeholder:${colors.textTertiary} focus:border-[#3351ff] focus:outline-none`}
                                      />
                                      <div className="flex gap-2">
                                        <button
                                          onClick={saveEditing}
                                          className={`px-3 py-1.5 rounded-2xl ${colors.buttonPrimary} ${colors.buttonPrimaryHover} text-[10px] font-medium text-white`}
                                        >
                                          Save
                                        </button>
                                        <button
                                          onClick={() => {
                                            setEditingStepId(null);
                                            setEditingText("");
                                          }}
                                          className={`px-3 py-1.5 rounded-2xl border ${colors.border} ${colors.bgSecondary} text-[10px] ${colors.textSecondary} ${colors.hover}`}
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <p
                                      className={`text-sm ${colors.text} leading-relaxed cursor-pointer ${colors.hover} transition`}
                                      onClick={() => startEditing(step)}
                                    >
                                      "{step.message}"
                                    </p>
                                  )}
                                </div>
                                
                                {/* Step-specific configurations */}
                                {step.type === "qa" && (
                                  <div className="mb-4 p-3 rounded-2xl border border-blue-500/30 bg-blue-500/10">
                                    <div className="flex items-center justify-between mb-2">
                                      <label className={`text-[10px] font-medium ${colors.textSecondary}`}>
                                        Data Sources
                                      </label>
                                      {!isDeployed && (
                                        <button
                                          onClick={async () => {
                                            setLoadingDataSources(true);
                                            setShowAddDataSource(false);
                                            setUploadError(null);
                                            try {
                                              const response = await fetch(`/api/agents/${agentId}/data-sources`);
                                              if (response.ok) {
                                                const data = await response.json();
                                                setAvailableDataSources(data.map((ds: any) => ({
                                                  id: ds.id,
                                                  name: ds.name,
                                                  type: ds.type,
                                                  file_url: ds.file_url,
                                                  file_type: ds.file_type,
                                                  content: ds.content,
                                                  integration_type: ds.integration_type,
                                                })));
                                                const currentStep = scenario.steps.find(s => s.id === step.id);
                                                setSelectedDataSourceIds(currentStep?.selected_data_source_ids || []);
                                                setDataSourceModal({ isOpen: true, stepId: step.id });
                                              }
                                            } catch (error) {
                                              console.error("Failed to load data sources:", error);
                                            } finally {
                                              setLoadingDataSources(false);
                                            }
                                          }}
                                          className={`text-[10px] ${colors.textTertiary} ${colors.hover} underline`}
                                        >
                                          Provided Data Sources
                                        </button>
                                      )}
                                    </div>
                                    <p className={`text-[10px] ${colors.textTertiary}`}>
                                      {step.selected_data_source_ids?.length > 0
                                        ? `${step.selected_data_source_ids.length} data source(s) selected`
                                        : "No data sources selected - AI will answer from general knowledge"}
                                    </p>
                                  </div>
                                )}

                                {/* Conditional Branches */}
                                {(step.type === "say" || step.type === "gather" || step.type === "qa") && (
                                  <div className="space-y-2 ml-0">
                                    {step.branches && step.branches.length > 0 ? (
                                      step.branches.map((branch) => (
                                        <div key={branch.id} className="flex items-start gap-2 text-xs group">
                                          <ArrowRight className={`h-4 w-4 ${colors.iconSecondary} flex-shrink-0 mt-0.5`} />
                                          <div className="flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <span className={colors.textSecondary}>If</span>
                                              <span className={`${colors.text} font-medium`}>{branch.condition || "New condition"}</span>
                                              {branch.condition_tag && (
                                                <span
                                                  className={`px-2 py-0.5 rounded text-xs font-mono ${
                                                    branch.condition_tag.startsWith("@")
                                                      ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                                                      : branch.condition_tag === "If Statement"
                                                      ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                                      : "bg-green-500/20 text-green-300 border border-green-500/30"
                                                  }`}
                                                >
                                                  {branch.condition_tag}
                                                </span>
                                              )}
                                              <span className={colors.textSecondary}>proceed to</span>
                                              <button
                                                className={`${colors.text} font-semibold ${colors.hover} underline decoration-dotted`}
                                                onClick={() => {
                                                  setSelectedStepForBranch({
                                                    scenarioId: scenarioId,
                                                    stepId: step.id,
                                                    branchId: branch.id,
                                                  });
                                                }}
                                              >
                                                {branch.target || "Next step"}
                                              </button>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                                            <button
                                              onClick={() => {
                                                setSelectedStepForBranch({
                                                  scenarioId: scenarioId,
                                                  stepId: step.id,
                                                  branchId: branch.id,
                                                });
                                              }}
                                              className={`p-1 ${colors.hover} rounded-full`}
                                              title="Edit branch"
                                            >
                                              <Edit className={`h-3 w-3 ${colors.iconSecondary}`} />
                                            </button>
                                            <button
                                              onClick={() => deleteBranch(step.id, branch.id)}
                                              className={`p-1 ${colors.hover} rounded-full`}
                                              title="Delete branch"
                                            >
                                              <Trash2 className={`h-3 w-3 ${colors.iconSecondary}`} />
                                            </button>
                                          </div>
                                        </div>
                                      ))
                                    ) : null}
                                    {(step.type === "gather" || step.type === "qa") && (
                                      <button
                                        onClick={() => {
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
                                          addBranch(step.id);
                                        }}
                                        className={`text-[10px] ${colors.textTertiary} ${colors.hover} underline flex items-center gap-1`}
                                      >
                                        <ArrowRight className="h-3 w-3" />
                                        Add conditional branch
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                          renderedSteps.add(step.id);
                        }
                      }
                      
                      return result;
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Right Sidebar Workspace */}
      {selectedStepForBranch && (
        <div className={`w-80 border-l ${colors.border} bg-[#242423] flex flex-col`}>
          <div className={`border-b ${colors.border} px-4 py-3 flex items-center justify-between`}>
            <h3 className={`text-sm font-semibold ${colors.text}`}>New Condition</h3>
            <button
              onClick={() => setSelectedStepForBranch(null)}
              className={`p-1 ${colors.hover} rounded transition`}
            >
              <X className={`h-4 w-4 ${colors.iconSecondary}`} />
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
                className={`w-full rounded-2xl border ${colors.border} ${colors.inputBg} px-3 py-2 text-xs ${colors.text} placeholder:${colors.textTertiary} focus:border-[#3351ff] focus:outline-none resize-none`}
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
                        ? `border-[#3351ff] bg-[#3351ff]/20 ${colors.text}`
                        : `${colors.border} ${colors.cardBg} ${colors.textSecondary} ${colors.hover}`
                    }`}
                  >
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-mono ${
                        tag.startsWith("@")
                          ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                          : tag === "If Statement"
                          ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                          : "bg-green-500/20 text-green-300 border border-green-500/30"
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
                className={`w-full rounded-2xl border ${colors.border} ${colors.inputBg} ${colors.text} placeholder:${colors.textTertiary} focus:border-[#3351ff] focus:outline-none resize-none px-3 py-2 text-sm`}
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
              <h3 className={`text-lg font-semibold ${colors.text}`}>Provided Data Sources</h3>
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
                  {/* Info message */}
                  <div className={`p-3 rounded-2xl bg-blue-500/10 border border-blue-500/30`}>
                    <p className={`text-xs ${colors.textSecondary}`}>
                      Select data sources from the <strong>Data Sources</strong> page. Go to the Data Sources tab to add PDFs, text, or API keys.
                    </p>
                  </div>
                  
                  {/* Data Sources List */}
                  {availableDataSources.length === 0 ? (
                    <div className={`text-center py-8 ${colors.textTertiary}`}>
                      <p className="text-sm mb-2">No data sources available</p>
                      <p className="text-xs">Add data sources in the Data Sources page</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {availableDataSources.map((ds) => (
                        <label
                          key={ds.id}
                          className={`flex items-center gap-3 p-3 rounded-2xl border ${colors.border} ${colors.bgSecondary} cursor-pointer hover:border-[#3351ff]/50 transition`}
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
                            className="rounded border-gray-600"
                          />
                          <div className="flex-1">
                            <div className={`text-sm font-medium ${colors.text}`}>{ds.name}</div>
                            <div className={`text-xs ${colors.textTertiary}`}>
                              {ds.type === "text" ? "Text" : ds.type === "api_key" ? "API Key" : ds.file_type || "File"}
                              {ds.integration_type && ` • ${ds.integration_type}`}
                            </div>
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
                className={`px-4 py-2 rounded-2xl border ${colors.border} ${colors.bgSecondary} ${colors.textSecondary} ${colors.hover} text-sm font-medium`}
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
                      const updatedStep = await response.json();
                      setScenario((prev) => ({
                        ...prev,
                        steps: prev.steps.map((s) =>
                          s.id === dataSourceModal.stepId
                            ? { ...s, selected_data_source_ids: updatedStep.selected_data_source_ids || selectedDataSourceIds }
                            : s
                        ),
                      }));
                      setDataSourceModal({ isOpen: false, stepId: null });
                    } else {
                      const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
                      console.error("Failed to save data source selection:", errorData);
                      alert(`Failed to save: ${errorData.error || "Please try again"}`);
                    }
                  } catch (error) {
                    console.error("Failed to save data source selection:", error);
                    alert("Failed to save data source selection. Please try again.");
                  }
                }}
                className={`px-4 py-2 rounded-2xl ${colors.buttonPrimary} ${colors.buttonPrimaryHover} text-white text-sm font-medium`}
              >
                Save Selection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
