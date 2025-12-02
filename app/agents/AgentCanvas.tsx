"use client";

import { useState, useEffect } from "react";
import { Plus, MessageCircle, Code as CodeIcon, ArrowRight, ChevronRight, Upload, CheckCircle, XCircle, Trash2, Database } from "lucide-react";
import StepEditor from "./StepEditor";

interface Scenario {
  id: string;
  name: string;
  description?: string;
  sort_order: number;
}

interface Step {
  id: string;
  name: string;
  type: "say" | "gather" | "code" | "api_call" | "condition" | "qa";
  code?: string;
  ai_message?: string;
  sort_order: number;
  // Q/A specific fields
  qa_query?: string;
  qa_data_source_ids?: string[];
  qa_fallback_message?: string;
}

interface StepBranch {
  id: string;
  condition: string;
  condition_tag?: string;
  next_step_id?: string;
  next_scenario_id?: string;
  action: string;
}

interface AgentCanvasProps {
  agentId: string;
  workspaceId: string;
}

export default function AgentCanvas({ agentId, workspaceId }: AgentCanvasProps) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [allSteps, setAllSteps] = useState<Record<string, Step[]>>({});
  const [allBranches, setAllBranches] = useState<Record<string, Record<string, StepBranch[]>>>({});
  const [selectedStep, setSelectedStep] = useState<Step | null>(null);
  const [selectedStepScenario, setSelectedStepScenario] = useState<Scenario | null>(null);
  const [showStepEditor, setShowStepEditor] = useState(false);

  useEffect(() => {
    loadScenarios();
  }, [agentId]);

  useEffect(() => {
    if (scenarios.length > 0) {
      loadAllSteps();
      if (!selectedScenario) {
        setSelectedScenario(scenarios[0]);
      }
    }
  }, [scenarios]);

  const loadScenarios = async () => {
    try {
      const response = await fetch(`/api/agents/${agentId}/scenarios`);
      if (response.ok) {
        const data = await response.json();
        setScenarios(data);
        if (data.length > 0 && !selectedScenario) {
          setSelectedScenario(data[0]);
        }
      }
    } catch (error) {
      console.error("Error loading scenarios:", error);
    }
  };

  const loadAllSteps = async () => {
    const stepsMap: Record<string, Step[]> = {};
    const branchesMap: Record<string, Record<string, StepBranch[]>> = {};

    for (const scenario of scenarios) {
      try {
        const response = await fetch(`/api/scenarios/${scenario.id}/steps`);
        if (response.ok) {
          const steps = await response.json();
          stepsMap[scenario.id] = steps || [];

          // Load branches for each step
          const scenarioBranches: Record<string, StepBranch[]> = {};
          for (const step of steps) {
            const branchesResponse = await fetch(`/api/steps/${step.id}/branches`);
            if (branchesResponse.ok) {
              const branchesData = await branchesResponse.json();
              scenarioBranches[step.id] = branchesData || [];
            }
          }
          branchesMap[scenario.id] = scenarioBranches;
        }
      } catch (error) {
        console.error(`Error loading steps for scenario ${scenario.id}:`, error);
      }
    }

    setAllSteps(stepsMap);
    setAllBranches(branchesMap);
  };

  const handleCreateScenario = async () => {
    const name = prompt("Enter scenario name:");
    if (!name) return;

    try {
      const response = await fetch(`/api/agents/${agentId}/scenarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      if (response.ok) {
        await loadScenarios();
      }
    } catch (error) {
      console.error("Error creating scenario:", error);
    }
  };

  const handleCreateStep = async (scenarioId: string) => {
    try {
      const response = await fetch(`/api/scenarios/${scenarioId}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New Step",
          type: "say",
          ai_message: "Hello! How can I help you?",
        }),
      });

      if (response.ok) {
        await loadAllSteps();
      }
    } catch (error) {
      console.error("Error creating step:", error);
    }
  };

  const handleDeleteStep = async (stepId: string, scenarioId: string) => {
    if (!confirm("Are you sure you want to delete this step? This action cannot be undone.")) {
      return;
    }

    try {
      const response = await fetch(`/api/steps/${stepId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        await loadAllSteps();
        // Clear selection if this was the selected step
        if (selectedStep?.id === stepId) {
          setSelectedStep(null);
          setSelectedStepScenario(null);
          setShowStepEditor(false);
        }
      } else {
        const error = await response.json();
        alert(`Failed to delete step: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Error deleting step:", error);
      alert("Failed to delete step. Please try again.");
    }
  };

  const getStepById = (stepId: string, scenarioId: string): Step | null => {
    const steps = allSteps[scenarioId] || [];
    return steps.find(s => s.id === stepId) || null;
  };

  const getStepIndex = (stepId: string, scenarioId: string): number => {
    const steps = allSteps[scenarioId] || [];
    return steps.findIndex(s => s.id === stepId);
  };

  const getTargetStepName = (branch: StepBranch, currentScenarioId: string): string => {
    if (branch.next_step_id) {
      const targetStep = getStepById(branch.next_step_id, currentScenarioId);
      if (targetStep) {
        const index = getStepIndex(branch.next_step_id, currentScenarioId);
        return `Step ${index + 1}`;
      }
    }
    if (branch.next_scenario_id) {
      const targetScenario = scenarios.find(s => s.id === branch.next_scenario_id);
      if (targetScenario) {
        return targetScenario.name;
      }
    }
    return "Next";
  };

  const getStepTypeLabel = (step: Step): string => {
    switch (step.type) {
      case "say":
        return "Say";
      case "gather":
        return "Gather";
      case "code":
        return "Code";
      case "api_call":
        return "API Call";
      case "condition":
        return "Condition";
      case "qa":
        return "Q/A";
      default:
        return "Step";
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#1a1612]">
      {/* Fullscreen Content - Consolidated in one box with desert background */}
      <div 
        className="flex-1 overflow-y-auto p-6 relative"
        style={{
          backgroundImage: 'url(/backgrounds/dunes.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed'
        }}
      >
        {scenarios.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-white/60 mb-4 text-sm">No scenarios yet. Create a scenario to start building your flow.</p>
              <button
                onClick={handleCreateScenario}
                className="px-6 py-3 rounded-lg bg-[#3351ff] hover:bg-[#4a64ff] text-white text-sm font-medium transition"
              >
                Create Scenario
              </button>
            </div>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto">
            {/* Consolidated Box with all content - semi-transparent to show background */}
            <div className="rounded-xl border border-white/20 bg-black/50 backdrop-blur-md p-6">
              {/* Scenario Title and Add Step in same box */}
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
                <div>
                  <h2 className="text-sm font-medium text-white/90">Scenario: {selectedScenario?.name || "Select a scenario"}</h2>
                  {selectedScenario?.description && (
                    <p className="text-xs text-white/60 mt-1">{selectedScenario.description}</p>
                  )}
                </div>
                {selectedScenario && (
                  <button
                    onClick={() => handleCreateStep(selectedScenario.id)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#3351ff] hover:bg-[#4a64ff] text-white text-xs font-medium transition"
                  >
                    <Plus className="h-3 w-3" />
                    Add Step
                  </button>
                )}
              </div>

              {/* Display All Scenarios - Consolidated Format */}
              {scenarios.map((scenario, scenarioIdx) => {
                const steps = allSteps[scenario.id] || [];
                const branches = allBranches[scenario.id] || {};

                if (steps.length === 0) return null;

                return (
                  <div key={scenario.id} className="mb-8">
                    {/* Scenario Title - Smaller font */}
                    <h3 className="text-xs font-medium text-white/70 mb-4">
                      Scenario {scenarioIdx + 1}: "{scenario.name}" Inquiry
                    </h3>

                  {/* Steps in this Scenario */}
                  <div className="space-y-8">
                    {steps.map((step, stepIdx) => {
                      const stepBranches = branches[step.id] || [];

                      return (
                        <div key={step.id} className="relative group">
                          {/* Step Content - GigaAI Format */}
                          <div
                            onClick={() => {
                              setSelectedStep(step);
                              setSelectedStepScenario(scenario);
                              setShowStepEditor(true);
                            }}
                            className="cursor-pointer hover:opacity-80 transition"
                          >
                            {/* Step Label - Smaller font */}
                            <div className="mb-2 flex items-center justify-between">
                              <span className="text-[10px] font-medium text-white/40 uppercase tracking-wide">
                                {getStepTypeLabel(step)}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation(); // Prevent opening editor
                                  handleDeleteStep(step.id, scenario.id);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded transition text-red-400/70 hover:text-red-400"
                                title="Delete step"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>

                            {/* Step Content - Smaller font */}
                            <div className="flex items-start gap-4">
                              {/* Message Content */}
                              <div className="flex-1 min-w-0">
                                {step.type === "say" && step.ai_message && (
                                  <p className="text-xs text-white/80 leading-relaxed">
                                    "{step.ai_message}"
                                  </p>
                                )}
                                {step.type === "code" && step.code && (
                                  <pre className="text-[10px] text-white/70 font-mono bg-black/60 p-2 rounded border border-white/10 overflow-x-auto">
                                    {step.code.substring(0, 200)}
                                    {step.code.length > 200 && "..."}
                                  </pre>
                                )}
                                {step.type === "gather" && (
                                  <p className="text-xs text-white/80 leading-relaxed">
                                    Gather user input...
                                  </p>
                                )}
                                {step.type === "qa" && (
                                  <div className="space-y-2">
                                    <p className="text-xs text-white/80 leading-relaxed">
                                      {step.qa_query 
                                        ? `Query: "${step.qa_query}"`
                                        : "Use previous GATHER input"}
                                    </p>
                                    <div className="flex items-center gap-2 text-[10px] text-white/60">
                                      <Database className="h-3 w-3" />
                                      <span>
                                        {step.qa_data_source_ids && step.qa_data_source_ids.length > 0
                                          ? `${step.qa_data_source_ids.length} data source(s)`
                                          : "All data sources"}
                                      </span>
                                    </div>
                                    {step.qa_fallback_message && (
                                      <p className="text-[10px] text-white/50 italic">
                                        Fallback: {step.qa_fallback_message}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Branching Logic - Smaller font */}
                            {stepBranches.length > 0 && (
                              <div className="mt-4 space-y-2 pl-0">
                                {stepBranches.map((branch) => {
                                  const targetName = getTargetStepName(branch, scenario.id);
                                  
                                  return (
                                    <div key={branch.id} className="flex items-center gap-1.5 flex-wrap text-[10px]">
                                      <span className="text-white/60">{branch.condition}</span>
                                      {branch.condition_tag && (
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                                          branch.condition_tag.startsWith('@') 
                                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' 
                                            : branch.condition_tag.includes('verify') || branch.condition_tag.includes('check')
                                            ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                                            : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                        }`}>
                                          {branch.condition_tag}
                                        </span>
                                      )}
                                      <ChevronRight className="h-3 w-3 text-white/50 flex-shrink-0" />
                                      <span className="text-white/60 font-medium">proceed to</span>
                                      <span className="text-white/70 font-semibold">{targetName}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Special Actions - Smaller font */}
                            {stepBranches.length === 0 && step.type === "say" && step.ai_message?.includes("upload") && (
                              <div className="mt-4 space-y-2 pl-0">
                                <div className="flex items-center gap-1.5 text-[10px]">
                                  <span className="text-white/60">Upload is successful:</span>
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-green-500/20 text-green-300 border border-green-500/30">
                                    verify_identity_check
                                  </span>
                                  <ChevronRight className="h-3 w-3 text-white/50" />
                                  <span className="text-white/60 font-medium">proceed to</span>
                                  <span className="text-white/70 font-semibold">Compliance Checks</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px]">
                                  <span className="text-white/60">Upload fails: retry up to 2 times</span>
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                    @info_not_provided
                                  </span>
                                  <span className="text-white/60">if still fails, proceed to</span>
                                  <span className="text-white/70 font-semibold">Escalation</span>
                                </div>
                              </div>
                            )}

                            {/* Default flow - Smaller font */}
                            {stepBranches.length === 0 && stepIdx < steps.length - 1 && step.type !== "say" && (
                              <div className="mt-4 pl-0">
                                <div className="flex items-center gap-1.5 text-[10px] text-white/40">
                                  <ChevronRight className="h-3 w-3" />
                                  <span>proceed to step {stepIdx + 2}</span>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Connection Line to Next Step */}
                          {stepIdx < steps.length - 1 && (
                            <div className="flex justify-start my-4 pl-0">
                              <div className="w-0.5 h-6 bg-white/10" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        )}
      </div>

      {/* Step Editor Sidebar */}
      {showStepEditor && selectedStep && selectedStepScenario && (
        <StepEditor
          step={selectedStep}
          onClose={() => {
            setShowStepEditor(false);
            setSelectedStep(null);
            setSelectedStepScenario(null);
          }}
          onSave={async (updates) => {
            try {
              const response = await fetch(`/api/steps/${selectedStep.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updates),
              });

              if (response.ok) {
                await loadAllSteps();
              }
            } catch (error) {
              console.error("Error updating step:", error);
            }
          }}
        />
      )}
    </div>
  );
}
