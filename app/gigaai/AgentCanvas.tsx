"use client";

import { useState, useEffect } from "react";
import { MessageSquare, FileText, GitBranch, Code, Zap, ArrowRight, X, Plus, Trash2, Calendar, CheckCircle } from "lucide-react";
import ConfirmationModal from "./ConfirmationModal";
import { useTheme } from "./ThemeProvider";

type StepType = "say" | "gather" | "code" | "api_call" | "if" | "schedule";

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
}

const FUNCTION_PALETTE: { type: StepType; label: string; description: string; icon: any }[] = [
  { type: "say", label: "Say", description: "Send a message to the user", icon: MessageSquare },
  { type: "gather", label: "Gather", description: "Collect user input", icon: FileText },
  { type: "if", label: "If Statement", description: "Create conditional branching", icon: GitBranch },
  { type: "code", label: "Code", description: "Run custom code", icon: Code },
  { type: "api_call", label: "API Call", description: "Call an external API", icon: Zap },
  { type: "schedule", label: "Schedule", description: "Schedule an appointment", icon: Calendar },
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
    case "if":
      return "If condition is met";
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

export default function AgentCanvas({ agentId, scenarioId, scenarioName, onStepSelect }: AgentCanvasProps) {
  const { theme, colors } = useTheme();
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
    const type = event.dataTransfer.getData("step-type") as StepType;
    if (!type) return;

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
    setEditingStepId(step.id);
    setEditingText(step.message);
  };

  const saveEditing = async () => {
    if (!editingStepId) return;
    
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

  const addBranch = async (stepId: string) => {
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
    const handleDelete = async () => {
      // Show loading state
    setConfirmationModal({
      isOpen: true,
        title: "Deleting Step...",
        message: "Please wait while we delete the step.",
        confirmText: "",
        cancelText: "",
        variant: "info",
        onConfirm: () => {},
        onCancel: () => {},
      });

      try {
        console.log("[Delete Step] Attempting to delete step:", stepId);
          const response = await fetch(`/api/steps/${stepId}`, {
            method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          });

        console.log("[Delete Step] Response status:", response.status);
        console.log("[Delete Step] Response ok:", response.ok);

          if (response.ok) {
          const result = await response.json();
          console.log("[Delete Step] Delete successful:", result);
          
          // Update UI to remove the step
          setScenario((prev) => {
            const newSteps = prev.steps.filter((step) => step.id !== stepId);
            console.log("[Delete Step] Steps before:", prev.steps.length, "Steps after:", newSteps.length);
            return {
              ...prev,
              steps: newSteps,
            };
          });
          
          // Clear editing if this was the step being edited
            if (editingStepId === stepId) {
              setEditingStepId(null);
              setEditingText("");
            }
          
          // Close modal after successful delete
          setConfirmationModal({
            isOpen: false,
            title: "",
            message: "",
            confirmText: "",
            cancelText: "",
            variant: "danger",
            onConfirm: () => {},
            onCancel: () => {},
          });
        } else {
          // Get error message
          let errorMessage = "Unknown error";
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorData.message || errorData.details || `HTTP ${response.status}`;
            console.error("[Delete Step] Error response:", errorData);
          } catch (e) {
            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
            console.error("[Delete Step] Failed to parse error response:", e);
          }
          
          console.error("[Delete Step] Failed to delete step:", errorMessage);
          
          // Show error in modal
          setConfirmationModal({
            isOpen: true,
            title: "Delete Failed",
            message: `Failed to delete step: ${errorMessage}\n\nCheck the browser console (F12) for more details.`,
            confirmText: "OK",
            cancelText: "",
            variant: "danger",
            onConfirm: () => {
              setConfirmationModal({
                isOpen: false,
                title: "",
                message: "",
                confirmText: "",
                cancelText: "",
                variant: "danger",
                onConfirm: () => {},
                onCancel: () => {},
              });
            },
            onCancel: () => {},
          });
        }
      } catch (error: any) {
        console.error("[Delete Step] Exception during delete:", error);
        
        // Show error in modal
        setConfirmationModal({
          isOpen: true,
          title: "Delete Failed",
          message: `Failed to delete step: ${error?.message || "Network error"}\n\nCheck the browser console (F12) for more details.`,
          confirmText: "OK",
          cancelText: "",
          variant: "danger",
          onConfirm: () => {
            setConfirmationModal({
              isOpen: false,
              title: "",
              message: "",
              confirmText: "",
              cancelText: "",
              variant: "danger",
              onConfirm: () => {},
              onCancel: () => {},
            });
          },
          onCancel: () => {},
        });
      }
    };

    setConfirmationModal({
      isOpen: true,
      title: "Delete Step",
      message: "Are you sure you want to delete this step? This action cannot be undone.",
      confirmText: "Delete",
      cancelText: "Cancel",
      variant: "danger",
      onConfirm: handleDelete,
      onCancel: () => {
        setConfirmationModal({
          isOpen: false,
          title: "",
          message: "",
          confirmText: "",
          cancelText: "",
          variant: "danger",
          onConfirm: () => {},
          onCancel: () => {},
        });
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
                    className={`flex-shrink-0 cursor-grab active:cursor-grabbing rounded-lg border ${colors.border} ${colors.cardBg} px-4 py-3 text-xs ${colors.text} hover:border-[#3351ff]/50 ${colors.hover} transition`}
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
                className={`rounded-lg border border-white/10 bg-[#242423]/90 backdrop-blur-sm px-4 py-4 max-w-4xl mx-auto transition ${
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
                          <div className="mb-4 p-3 rounded-lg bg-yellow-500/20 border border-yellow-500/30 flex items-start gap-2">
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
                    {scenario.steps.map((step, stepIdx) => (
                      <div key={step.id} className="relative">
                        {/* Step Content - No individual box, just content */}
                        <div className="pb-4">
                        {/* Step Label */}
                        <div className="mb-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-medium ${colors.textTertiary} uppercase tracking-wide`}>
                              {step.type === "say"
                                ? "Co Say"
                                : step.type === "gather"
                                ? "Gather"
                                : step.type === "if"
                                ? "If Statement"
                                : step.type === "schedule"
                                ? "Schedule"
                                : step.type === "code"
                                ? "Code"
                                : step.type === "api_call"
                                ? "API Call"
                                : "Step"}
                            </span>
                            {step.type === "say" && (
                              <MessageSquare className={`h-3 w-3 ${colors.iconSecondary}`} />
                            )}
                            {step.type === "schedule" && (
                              <Calendar className={`h-3 w-3 ${colors.iconSecondary}`} />
                            )}
                            {/* Message Status Indicator */}
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
                            className="p-1.5 hover:bg-red-500/20 rounded transition text-red-400/70 hover:text-red-400"
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
                                className={`w-full rounded-lg border ${colors.border} ${colors.inputBg} px-3 py-2 text-xs ${colors.text} placeholder:${colors.textTertiary} focus:border-[#3351ff] focus:outline-none`}
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={saveEditing}
                                  className={`px-3 py-1.5 rounded-lg ${colors.buttonPrimary} ${colors.buttonPrimaryHover} text-[10px] font-medium text-white`}
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingStepId(null);
                                    setEditingText("");
                                  }}
                                  className={`px-3 py-1.5 rounded-lg border ${colors.border} ${colors.bgSecondary} text-[10px] ${colors.textSecondary} ${colors.hover}`}
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

                        {/* Conditional Branches */}
                        {(step.type === "say" || step.type === "if") && (
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
                                        o {branch.target || "Next step"}
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
                                      className={`text-[10px] ${colors.textTertiary} ${colors.hover} px-2 py-1`}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => deleteBranch(step.id, branch.id)}
                                      className="text-[10px] text-red-400/70 hover:text-red-400 px-2 py-1"
                                    >
                                      ×
                                    </button>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <button
                                onClick={() => addBranch(step.id)}
                                      className={`text-[10px] ${colors.textTertiary} ${colors.hover} underline decoration-dotted flex items-center gap-1`}
                              >
                                <ArrowRight className={`h-3 w-3 ${colors.iconSecondary}`} />
                                Add conditional branch
                              </button>
                            )}
                            {step.branches && step.branches.length > 0 && (
                              <button
                                onClick={() => addBranch(step.id)}
                                className={`text-[10px] ${colors.textTertiary} ${colors.hover} underline decoration-dotted ml-6 mt-2`}
                              >
                                + Add another branch
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                        {/* Connection Line to Next Step */}
                        {stepIdx < scenario.steps.length - 1 && (
                          <div className="flex justify-start my-6 pl-0">
                            <div className={`w-0.5 h-8 ${colors.border}`} />
                          </div>
                        )}
                      </div>
                    ))}
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
                className={`w-full rounded-lg border ${colors.border} ${colors.inputBg} px-3 py-2 text-xs ${colors.text} placeholder:${colors.textTertiary} focus:border-[#3351ff] focus:outline-none resize-none`}
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
                    className={`w-full text-left px-3 py-2 rounded-lg border transition text-sm ${
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
                className={`w-full rounded-lg border ${colors.border} ${colors.inputBg} ${colors.text} placeholder:${colors.textTertiary} focus:border-[#3351ff] focus:outline-none resize-none px-3 py-2 text-sm`}
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
                      className={`w-full text-left px-3 py-2 rounded-lg border ${colors.border} ${colors.cardBg} ${colors.textSecondary} ${colors.hover} transition text-xs`}
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
    </div>
  );
}
