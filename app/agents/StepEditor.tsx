"use client";

// Right-side step editor drawer — tabs for code / input schema / callable
// functions / APIs / global variables / branches. Harvey-ized Apr 2026:
// white canvas, 1px left rule, tokenized inputs and tabs. Monospace
// textareas for code, everything else is Inter. Purple accent removed —
// active tab underline is ink, citation-style chip for tags.

import { useState, useEffect } from "react";
import { X, Code, FileText, Zap, Globe, Plus, Trash2 } from "lucide-react";

interface Step {
  id: string;
  name: string;
  type: "say" | "gather" | "code" | "api_call" | "condition" | "qa";
  code?: string;
  ai_message?: string;
  input_schema?: Record<string, any>;
  callable_functions?: any[];
  apis?: any[];
  global_variables?: Record<string, any>;
}

interface StepBranch {
  id: string;
  condition: string;
  condition_tag?: string;
  next_step_id?: string;
  next_scenario_id?: string;
  action: string;
}

interface StepEditorProps {
  step: Step;
  onClose: () => void;
  onSave: (updates: Partial<Step>) => Promise<void>;
}

export default function StepEditor({ step, onClose, onSave }: StepEditorProps) {
  const [activeTab, setActiveTab] = useState<
    "code" | "input" | "functions" | "apis" | "globals" | "branches"
  >("code");
  const [name, setName] = useState(step.name);
  const [code, setCode] = useState(step.code || "");
  const [aiMessage, setAiMessage] = useState(step.ai_message || "");
  const [branches, setBranches] = useState<StepBranch[]>([]);

  useEffect(() => {
    setName(step.name);
    setCode(step.code || "");
    setAiMessage(step.ai_message || "");
    loadBranches();
  }, [step]);

  const loadBranches = async () => {
    try {
      const response = await fetch(`/api/steps/${step.id}/branches`);
      if (response.ok) {
        const data = await response.json();
        setBranches(data || []);
      }
    } catch (error) {
      console.error("Error loading branches:", error);
    }
  };

  const handleCreateBranch = async () => {
    try {
      const response = await fetch(`/api/steps/${step.id}/branches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          condition: "Customer provides info",
          condition_tag: "@info_confirmed",
          action: "proceed",
        }),
      });

      if (response.ok) {
        await loadBranches();
      }
    } catch (error) {
      console.error("Error creating branch:", error);
    }
  };

  const handleDeleteBranch = async (branchId: string) => {
    try {
      const response = await fetch(
        `/api/steps/${step.id}/branches/${branchId}`,
        {
          method: "DELETE",
        }
      );

      if (response.ok) {
        await loadBranches();
      }
    } catch (error) {
      console.error("Error deleting branch:", error);
    }
  };

  const handleUpdateBranch = async (
    branchId: string,
    updates: Partial<StepBranch>
  ) => {
    try {
      const response = await fetch(
        `/api/steps/${step.id}/branches/${branchId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        }
      );

      if (response.ok) {
        await loadBranches();
      }
    } catch (error) {
      console.error("Error updating branch:", error);
    }
  };

  const handleSave = async () => {
    const updates: Partial<Step> = {
      name,
      code: step.type === "code" ? code : undefined,
      ai_message: step.type === "say" ? aiMessage : undefined,
    };
    await onSave(updates);
  };

  const inputStyle: React.CSSProperties = {
    background: "var(--canvas)",
    border: "1px solid var(--rule)",
    borderRadius: "var(--r-input)",
    color: "var(--ink)",
  };

  return (
    <div
      className="fixed right-0 top-0 h-full w-full max-w-xl z-50 flex flex-col"
      style={{
        background: "var(--canvas)",
        borderLeft: "1px solid var(--rule)",
        color: "var(--ink)",
      }}
    >
      {/* Header */}
      <div
        className="px-6 py-4"
        style={{ borderBottom: "1px solid var(--rule)" }}
      >
        <div className="flex items-start justify-between mb-1">
          <div className="min-w-0">
            <div
              className="label-section mb-1"
              style={{ color: "var(--ink-subtle)" }}
            >
              Step · {step.type}
            </div>
            <h2
              className="heading-display truncate"
              style={{ fontSize: 24, color: "var(--ink)" }}
            >
              {name || "Untitled step"}
            </h2>
            <p
              className="text-xs mt-1"
              style={{ color: "var(--ink-muted)", lineHeight: 1.5 }}
            >
              {step.type === "code"
                ? "Executable block — loads values into the agent store and emits an assistant message."
                : step.type === "say"
                ? "Configure the message the agent will speak at this step."
                : "Configure this step."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 transition"
            style={{ color: "var(--ink-muted)", borderRadius: "var(--r-input)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--canvas-subtle)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div
        className="px-6"
        style={{ borderBottom: "1px solid var(--rule)" }}
      >
        <div className="flex gap-5 overflow-x-auto">
          {step.type === "code" && (
            <>
              <TabButton
                icon={Code}
                label="Code"
                active={activeTab === "code"}
                onClick={() => setActiveTab("code")}
              />
              <TabButton
                icon={FileText}
                label="Input schema"
                active={activeTab === "input"}
                onClick={() => setActiveTab("input")}
              />
              <TabButton
                icon={Zap}
                label="Functions"
                active={activeTab === "functions"}
                onClick={() => setActiveTab("functions")}
              />
              <TabButton
                icon={Globe}
                label="APIs"
                active={activeTab === "apis"}
                onClick={() => setActiveTab("apis")}
              />
              <TabButton
                icon={Globe}
                label="Globals"
                active={activeTab === "globals"}
                onClick={() => setActiveTab("globals")}
              />
            </>
          )}
          <TabButton
            icon={FileText}
            label="Branches"
            active={activeTab === "branches"}
            onClick={() => setActiveTab("branches")}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {step.type === "code" && activeTab === "code" && (
          <div className="space-y-4">
            <div>
              <div
                className="label-section mb-1.5"
                style={{ color: "var(--ink-muted)" }}
              >
                Step name
              </div>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-sm outline-none"
                style={inputStyle}
              />
            </div>

            <div>
              <div
                className="label-section mb-1.5"
                style={{ color: "var(--ink-muted)" }}
              >
                Code
              </div>
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full h-96 mono text-xs px-3 py-3 outline-none resize-none"
                style={{ ...inputStyle, lineHeight: 1.55 }}
                placeholder={`# Loads a user's profile and updates global store
store_updates = {}
assistant_message = ""

try:
  result = await get_user_profile(user_id)
  if not result.get("success"):
    assistant_message = "Failed to load profile."
  else:
    store_updates["user_name"] = result.get("name")
    store_updates["user_tier"] = result.get("tier")
    assistant_message = f"Profile loaded for {result.get('name')}."
except Exception as e:
  assistant_message = f"Error: {str(e)}"`}
              />
            </div>
          </div>
        )}

        {step.type === "say" && (
          <div className="space-y-4">
            <div>
              <div
                className="label-section mb-1.5"
                style={{ color: "var(--ink-muted)" }}
              >
                Step name
              </div>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-sm outline-none"
                style={inputStyle}
              />
            </div>

            <div>
              <div
                className="label-section mb-1.5"
                style={{ color: "var(--ink-muted)" }}
              >
                AI message
              </div>
              <textarea
                value={aiMessage}
                onChange={(e) => setAiMessage(e.target.value)}
                rows={8}
                className="w-full px-3 py-3 text-sm outline-none resize-none"
                style={{ ...inputStyle, lineHeight: 1.55 }}
                placeholder="Welcome! May I confirm your full name and date of birth to begin?"
              />
            </div>
          </div>
        )}

        {activeTab === "input" && (
          <EmptyTab message="Input schema configuration coming soon." />
        )}
        {activeTab === "functions" && (
          <EmptyTab message="Callable functions configuration coming soon." />
        )}
        {activeTab === "apis" && (
          <EmptyTab message="API configuration coming soon." />
        )}
        {activeTab === "globals" && (
          <EmptyTab message="Global variables configuration coming soon." />
        )}

        {activeTab === "branches" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div
                className="label-section"
                style={{ color: "var(--ink-muted)" }}
              >
                Branching logic
              </div>
              <button
                onClick={handleCreateBranch}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition"
                style={{
                  background: "var(--ink)",
                  color: "var(--canvas)",
                  borderRadius: "var(--r-input)",
                  fontWeight: 500,
                }}
              >
                <Plus className="h-3 w-3" />
                Add branch
              </button>
            </div>

            {branches.length === 0 ? (
              <div
                className="text-center py-10 text-xs"
                style={{ color: "var(--ink-subtle)" }}
              >
                No branches yet. Add a branch to create if-then logic.
              </div>
            ) : (
              <div className="space-y-3">
                {branches.map((branch) => (
                  <div
                    key={branch.id}
                    className="card-flat p-4 space-y-3"
                    style={{ background: "var(--canvas)" }}
                  >
                    <div>
                      <div
                        className="label-section mb-1.5"
                        style={{ color: "var(--ink-muted)" }}
                      >
                        If condition
                      </div>
                      <input
                        type="text"
                        value={branch.condition}
                        onChange={(e) =>
                          handleUpdateBranch(branch.id, {
                            condition: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 text-sm outline-none"
                        style={inputStyle}
                        placeholder="Customer provides info"
                      />
                    </div>

                    <div>
                      <div
                        className="label-section mb-1.5"
                        style={{ color: "var(--ink-muted)" }}
                      >
                        Condition tag
                      </div>
                      <input
                        type="text"
                        value={branch.condition_tag || ""}
                        onChange={(e) =>
                          handleUpdateBranch(branch.id, {
                            condition_tag: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 text-sm mono outline-none"
                        style={inputStyle}
                        placeholder="@info_confirmed"
                      />
                    </div>

                    <div>
                      <div
                        className="label-section mb-1.5"
                        style={{ color: "var(--ink-muted)" }}
                      >
                        Then proceed to
                      </div>
                      <select
                        value={
                          branch.next_step_id || branch.next_scenario_id || ""
                        }
                        onChange={(e) => {
                          if (e.target.value.startsWith("step_")) {
                            handleUpdateBranch(branch.id, {
                              next_step_id: e.target.value.replace("step_", ""),
                              next_scenario_id: undefined,
                            });
                          } else if (e.target.value.startsWith("scenario_")) {
                            handleUpdateBranch(branch.id, {
                              next_scenario_id: e.target.value.replace(
                                "scenario_",
                                ""
                              ),
                              next_step_id: undefined,
                            });
                          }
                        }}
                        className="w-full px-3 py-2 text-sm outline-none"
                        style={inputStyle}
                      >
                        <option value="">Select next step or scenario…</option>
                      </select>
                    </div>

                    <div className="flex justify-end">
                      <button
                        onClick={() => handleDeleteBranch(branch.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition"
                        style={{
                          background: "var(--danger-soft)",
                          color: "var(--danger)",
                          border: "1px solid var(--danger)",
                          borderRadius: "var(--r-input)",
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="px-6 py-3 flex items-center justify-end gap-2"
        style={{ borderTop: "1px solid var(--rule)" }}
      >
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-xs transition"
          style={{
            background: "var(--canvas)",
            color: "var(--ink)",
            border: "1px solid var(--rule)",
            borderRadius: "var(--r-input)",
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="px-3 py-1.5 text-xs transition"
          style={{
            background: "var(--ink)",
            color: "var(--canvas)",
            borderRadius: "var(--r-input)",
            fontWeight: 500,
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}

function TabButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: any;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="py-3 text-xs flex items-center gap-1.5 whitespace-nowrap transition"
      style={{
        color: active ? "var(--ink)" : "var(--ink-muted)",
        fontWeight: active ? 500 : 400,
        borderBottom: active ? "2px solid var(--ink)" : "2px solid transparent",
        marginBottom: -1,
      }}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function EmptyTab({ message }: { message: string }) {
  return (
    <div
      className="text-center py-10 text-xs"
      style={{ color: "var(--ink-subtle)" }}
    >
      {message}
    </div>
  );
}
