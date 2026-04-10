"use client";

import { useState, useEffect } from "react";
import { X, CheckCircle, AlertCircle, AlertTriangle, ArrowRight, ExternalLink } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { validateAgent, validateAllScenarios, ValidationError, getValidationSummary } from "@/lib/validation/agent-validator";

interface ValidationPanelProps {
  agent: any;
  scenarios: any[];
  isOpen: boolean;
  onClose: () => void;
  onFixIssue?: (error: ValidationError) => void;
  onProceedWithDeployment?: () => void;
  hasTwilioCredentials?: boolean;
}

export default function ValidationPanel({
  agent,
  scenarios,
  isOpen,
  onClose,
  onFixIssue,
  onProceedWithDeployment,
  hasTwilioCredentials = false,
}: ValidationPanelProps) {
  const { colors } = useTheme();
  const [validationResult, setValidationResult] = useState<{
    agent: any;
    scenarios: any;
    summary: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen && agent) {
      // Load steps for all scenarios before validation
      async function loadScenariosWithSteps() {
        try {
          const scenariosWithSteps = await Promise.all(
            scenarios.map(async (scenario) => {
              try {
                const stepsResponse = await fetch(`/api/scenarios/${scenario.id}/steps`);
                if (stepsResponse.ok) {
                  const stepsData = await stepsResponse.json();
                  
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
                  
                  return {
                    ...scenario,
                    steps: stepsWithBranches.sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0)),
                  };
                }
                return { ...scenario, steps: [] };
              } catch (error) {
                console.error(`Failed to load steps for scenario ${scenario.id}:`, error);
                return { ...scenario, steps: [] };
              }
            })
          );

          // Normalize agent data (handle both phone_number and phoneNumber)
          const normalizedAgent = {
            ...agent,
            phone_number: agent.phone_number || (agent as any).phoneNumber || null,
          };

          const agentValidation = validateAgent(normalizedAgent, scenariosWithSteps, hasTwilioCredentials);
          const scenariosValidation = validateAllScenarios(scenariosWithSteps);
          
          const allErrors = [...agentValidation.errors, ...scenariosValidation.errors];
          const allWarnings = [...agentValidation.warnings, ...scenariosValidation.warnings];

          setValidationResult({
            agent: agentValidation,
            scenarios: scenariosValidation,
            summary: getValidationSummary({
              isValid: allErrors.length === 0,
              errors: allErrors,
              warnings: allWarnings,
            }),
          });
        } catch (error) {
          console.error("Failed to load scenarios with steps:", error);
        }
      }
      
      loadScenariosWithSteps();
    }
  }, [isOpen, agent, scenarios, hasTwilioCredentials]);

  if (!isOpen || !validationResult) return null;

  const allErrors = [...validationResult.agent.errors, ...validationResult.scenarios.errors];
  const allWarnings = [...validationResult.agent.warnings, ...validationResult.scenarios.warnings];
  const isValid = allErrors.length === 0;

  const getLocationLabel = (location?: string) => {
    if (!location) return null;
    const parts = location.split(":");
    if (parts[0] === "scenario") {
      const scenario = scenarios.find((s) => s.id === parts[1]);
      return scenario ? `Scenario: ${scenario.name}` : null;
    }
    if (parts[0] === "step") {
      const scenario = scenarios.find((s) => s.id === parts[1]);
      if (scenario) {
        const step = scenario.steps?.find((st: any) => st.id === parts[3]);
        return step ? `Step: ${step.name || step.type}` : null;
      }
    }
    return location;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className={`${colors.bg} ${colors.border} border rounded-3xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${colors.border}`}>
          <div className="flex items-center gap-3">
            {isValid ? (
              <CheckCircle className="h-6 w-6 text-green-500" />
            ) : (
              <AlertCircle className="h-6 w-6 text-red-500" />
            )}
            <div>
              <h2 className={`text-xl font-semibold ${colors.text}`}>Pre-Deployment Validation</h2>
              <p className={`text-sm ${colors.textSecondary}`}>{validationResult.summary}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 ${colors.hover} rounded-lg transition`}
          >
            <X className={`h-5 w-5 ${colors.iconSecondary}`} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Errors */}
          {allErrors.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="h-5 w-5 text-red-500" />
                <h3 className={`font-semibold ${colors.text}`}>
                  Errors ({allErrors.length})
                </h3>
              </div>
              <div className="space-y-2">
                {allErrors.map((error, index) => (
                  <div
                    key={index}
                    className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="font-medium text-red-400 mb-1">{error.message}</div>
                        {error.location && (
                          <div className="text-sm text-white/60">
                            {getLocationLabel(error.location) || error.location}
                          </div>
                        )}
                        <div className="text-xs text-white/50 mt-1">Field: {error.field}</div>
                      </div>
                      {error.fixable && onFixIssue && (
                        <button
                          onClick={() => {
                            onFixIssue(error);
                            onClose();
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl text-sm transition"
                        >
                          Fix
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warnings */}
          {allWarnings.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                <h3 className={`font-semibold ${colors.text}`}>
                  Warnings ({allWarnings.length})
                </h3>
              </div>
              <div className="space-y-2">
                {allWarnings.map((warning, index) => (
                  <div
                    key={index}
                    className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="font-medium text-yellow-400 mb-1">{warning.message}</div>
                        {warning.location && (
                          <div className="text-sm text-white/60">
                            {getLocationLabel(warning.location) || warning.location}
                          </div>
                        )}
                        <div className="text-xs text-white/50 mt-1">Field: {warning.field}</div>
                      </div>
                      {warning.fixable && onFixIssue && (
                        <button
                          onClick={() => {
                            onFixIssue(warning);
                            onClose();
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-xl text-sm transition"
                        >
                          Fix
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Success */}
          {isValid && allWarnings.length === 0 && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-6 text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
              <div className="font-semibold text-green-400 mb-1">All validations passed!</div>
              <div className="text-sm text-white/70">Your agent is ready to deploy.</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-end gap-3 p-6 border-t ${colors.border}`}>
          <button
            onClick={onClose}
            className={`px-4 py-2 ${colors.cardBg} ${colors.border} border rounded-xl ${colors.textSecondary} hover:${colors.hover} transition`}
          >
            {isValid ? "Close" : "Cancel"}
          </button>
          {isValid && (
            <button
              onClick={() => {
                onClose();
                if (onProceedWithDeployment) {
                  onProceedWithDeployment();
                }
              }}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl transition"
            >
              Proceed with Deployment
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

