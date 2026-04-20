"use client";

// Agent flow canvas — renders scenarios + steps + branches as a vertical
// stack inside a single flat card. Harvey-ized Apr 2026: the
// glassmorphism "desert background" card and purple/blue branch pills
// are gone. Steps read like editable document rows; branches render as
// plain rules with mono tags. One accent color only.

import { useState, useEffect } from "react";
import {
  Plus,
  ChevronRight,
  Trash2,
  Database,
  CornerDownRight,
} from "lucide-react";
import StepEditor from "./StepEditor";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm-dialog";

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
  const [allBranches, setAllBranches] = useState<
    Record<string, Record<string, StepBranch[]>>
  >({});
  const [selectedStep, setSelectedStep] = useState<Step | null>(null);
  const [selectedStepScenario, setSelectedStepScenario] =
    useState<Scenario | null>(null);
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

          const scenarioBranches: Record<string, StepBranch[]> = {};
          for (const step of steps) {
            const branchesResponse = await fetch(
              `/api/steps/${step.id}/branches`
            );
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
    const ok = await confirmDialog({
      title: "Delete step?",
      message:
        "Are you sure you want to delete this step? This action cannot be undone.",
      confirmText: "Delete",
      variant: "danger",
    });
    if (!ok) return;

    try {
      const response = await fetch(`/api/steps/${stepId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        await loadAllSteps();
        if (selectedStep?.id === stepId) {
          setSelectedStep(null);
          setSelectedStepScenario(null);
          setShowStepEditor(false);
        }
      } else {
        const error = await response.json();
        toast.error("Failed to delete step", error.error || "Unknown error");
      }
    } catch (error) {
      console.error("Error deleting step:", error);
      toast.error("Failed to delete step", "Please try again.");
    }
  };

  const getStepById = (stepId: string, scenarioId: string): Step | null => {
    const steps = allSteps[scenarioId] || [];
    return steps.find((s) => s.id === stepId) || null;
  };

  const getStepIndex = (stepId: string, scenarioId: string): number => {
    const steps = allSteps[scenarioId] || [];
    return steps.findIndex((s) => s.id === stepId);
  };

  const getTargetStepName = (
    branch: StepBranch,
    currentScenarioId: string
  ): string => {
    if (branch.next_step_id) {
      const targetStep = getStepById(branch.next_step_id, currentScenarioId);
      if (targetStep) {
        const index = getStepIndex(branch.next_step_id, currentScenarioId);
        return `Step ${index + 1}`;
      }
    }
    if (branch.next_scenario_id) {
      const targetScenario = scenarios.find(
        (s) => s.id === branch.next_scenario_id
      );
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
        return "API call";
      case "condition":
        return "Condition";
      case "qa":
        return "Q/A";
      default:
        return "Step";
    }
  };

  return (
    <div
      className="h-full flex flex-col"
      style={{ background: "var(--canvas-subtle)" }}
    >
      <div className="flex-1 overflow-y-auto px-8 py-8">
        {scenarios.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div
              className="text-center max-w-md px-8 py-12 card-flat"
              style={{ background: "var(--canvas)" }}
            >
              <div
                className="label-section mb-2"
                style={{ color: "var(--ink-subtle)" }}
              >
                Empty flow
              </div>
              <h3
                className="heading-display mb-3"
                style={{ fontSize: 26, color: "var(--ink)" }}
              >
                No scenarios yet.
              </h3>
              <p
                className="text-sm mb-6"
                style={{ color: "var(--ink-muted)", lineHeight: 1.55 }}
              >
                A scenario groups the steps for one kind of conversation —
                intake, follow-up, escalation. Start with one.
              </p>
              <button
                onClick={handleCreateScenario}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm transition"
                style={{
                  background: "var(--ink)",
                  color: "var(--canvas)",
                  borderRadius: "var(--r-input)",
                  fontWeight: 500,
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                New scenario
              </button>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto">
            <div
              className="card-flat overflow-hidden"
              style={{ background: "var(--canvas)" }}
            >
              {/* Scenario title + add step */}
              <div
                className="flex items-center justify-between px-6 py-4"
                style={{ borderBottom: "1px solid var(--rule)" }}
              >
                <div>
                  <div
                    className="label-section mb-0.5"
                    style={{ color: "var(--ink-subtle)" }}
                  >
                    Scenario
                  </div>
                  <h2
                    className="heading-display"
                    style={{ fontSize: 20, color: "var(--ink)" }}
                  >
                    {selectedScenario?.name || "Select a scenario"}
                  </h2>
                  {selectedScenario?.description && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: "var(--ink-muted)" }}
                    >
                      {selectedScenario.description}
                    </p>
                  )}
                </div>
                {selectedScenario && (
                  <button
                    onClick={() => handleCreateStep(selectedScenario.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs transition"
                    style={{
                      background: "var(--ink)",
                      color: "var(--canvas)",
                      borderRadius: "var(--r-input)",
                      fontWeight: 500,
                    }}
                  >
                    <Plus className="h-3 w-3" />
                    Add step
                  </button>
                )}
              </div>

              <div className="px-6 py-6 space-y-10">
                {scenarios.map((scenario, scenarioIdx) => {
                  const steps = allSteps[scenario.id] || [];
                  const branches = allBranches[scenario.id] || {};

                  if (steps.length === 0) return null;

                  return (
                    <div key={scenario.id}>
                      <div
                        className="label-section mb-4"
                        style={{ color: "var(--ink-subtle)" }}
                      >
                        Scenario {scenarioIdx + 1} · {scenario.name}
                      </div>

                      <ol className="space-y-0">
                        {steps.map((step, stepIdx) => {
                          const stepBranches = branches[step.id] || [];

                          return (
                            <li key={step.id} className="relative">
                              <div
                                onClick={() => {
                                  setSelectedStep(step);
                                  setSelectedStepScenario(scenario);
                                  setShowStepEditor(true);
                                }}
                                className="group cursor-pointer py-4"
                                style={{
                                  borderTop:
                                    stepIdx === 0
                                      ? undefined
                                      : "1px solid var(--rule)",
                                }}
                              >
                                <div className="flex items-start gap-4">
                                  {/* Step index */}
                                  <div
                                    className="mono flex-shrink-0 w-8 text-right"
                                    style={{
                                      fontSize: 11,
                                      color: "var(--ink-subtle)",
                                      paddingTop: 2,
                                    }}
                                  >
                                    {String(stepIdx + 1).padStart(2, "0")}
                                  </div>

                                  {/* Content */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-2">
                                      <span
                                        className="label-section"
                                        style={{ color: "var(--ink-muted)" }}
                                      >
                                        {getStepTypeLabel(step)}
                                      </span>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteStep(step.id, scenario.id);
                                        }}
                                        className="opacity-0 group-hover:opacity-100 p-1 transition"
                                        style={{ color: "var(--ink-subtle)" }}
                                        title="Delete step"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    </div>

                                    {step.type === "say" && step.ai_message && (
                                      <p
                                        className="text-sm"
                                        style={{
                                          color: "var(--ink)",
                                          lineHeight: 1.55,
                                        }}
                                      >
                                        &ldquo;{step.ai_message}&rdquo;
                                      </p>
                                    )}
                                    {step.type === "code" && step.code && (
                                      <pre
                                        className="mono overflow-x-auto px-3 py-2"
                                        style={{
                                          fontSize: 11,
                                          background: "var(--canvas-subtle)",
                                          border: "1px solid var(--rule)",
                                          borderRadius: "var(--r-input)",
                                          color: "var(--ink)",
                                          lineHeight: 1.5,
                                        }}
                                      >
                                        {step.code.substring(0, 200)}
                                        {step.code.length > 200 && "…"}
                                      </pre>
                                    )}
                                    {step.type === "gather" && (
                                      <p
                                        className="text-sm"
                                        style={{ color: "var(--ink-muted)" }}
                                      >
                                        Gather user input…
                                      </p>
                                    )}
                                    {step.type === "qa" && (
                                      <div className="space-y-1.5">
                                        <p
                                          className="text-sm"
                                          style={{
                                            color: "var(--ink)",
                                            lineHeight: 1.55,
                                          }}
                                        >
                                          {step.qa_query
                                            ? `Query: "${step.qa_query}"`
                                            : "Use previous Gather input"}
                                        </p>
                                        <div
                                          className="flex items-center gap-1.5 mono"
                                          style={{
                                            fontSize: 11,
                                            color: "var(--ink-muted)",
                                          }}
                                        >
                                          <Database className="h-3 w-3" />
                                          <span>
                                            {step.qa_data_source_ids &&
                                            step.qa_data_source_ids.length > 0
                                              ? `${step.qa_data_source_ids.length} data source(s)`
                                              : "All data sources"}
                                          </span>
                                        </div>
                                        {step.qa_fallback_message && (
                                          <p
                                            className="text-xs italic"
                                            style={{
                                              color: "var(--ink-subtle)",
                                            }}
                                          >
                                            Fallback: {step.qa_fallback_message}
                                          </p>
                                        )}
                                      </div>
                                    )}

                                    {/* Branches */}
                                    {stepBranches.length > 0 && (
                                      <div className="mt-3 space-y-1.5">
                                        {stepBranches.map((branch) => {
                                          const targetName = getTargetStepName(
                                            branch,
                                            scenario.id
                                          );
                                          return (
                                            <div
                                              key={branch.id}
                                              className="flex items-center gap-2 flex-wrap text-xs"
                                              style={{
                                                color: "var(--ink-muted)",
                                              }}
                                            >
                                              <CornerDownRight
                                                className="h-3 w-3 flex-shrink-0"
                                                style={{
                                                  color: "var(--ink-subtle)",
                                                }}
                                              />
                                              <span>{branch.condition}</span>
                                              {branch.condition_tag && (
                                                <span
                                                  className="chip-citation"
                                                  style={{ fontSize: 10 }}
                                                >
                                                  {branch.condition_tag}
                                                </span>
                                              )}
                                              <ChevronRight
                                                className="h-3 w-3 flex-shrink-0"
                                                style={{
                                                  color: "var(--ink-subtle)",
                                                }}
                                              />
                                              <span
                                                style={{
                                                  color: "var(--ink)",
                                                  fontWeight: 500,
                                                }}
                                              >
                                                {targetName}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}

                                    {/* Default flow */}
                                    {stepBranches.length === 0 &&
                                      stepIdx < steps.length - 1 && (
                                        <div
                                          className="mt-3 flex items-center gap-1.5 text-xs"
                                          style={{ color: "var(--ink-subtle)" }}
                                        >
                                          <CornerDownRight className="h-3 w-3" />
                                          <span>
                                            proceed to step {stepIdx + 2}
                                          </span>
                                        </div>
                                      )}
                                  </div>
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

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
