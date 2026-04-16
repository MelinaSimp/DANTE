"use client";

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
  const [activeTab, setActiveTab] = useState<"code" | "input" | "functions" | "apis" | "globals" | "branches">("code");
  const [name, setName] = useState(step.name);
  const [code, setCode] = useState(step.code || "");
  const [aiMessage, setAiMessage] = useState(step.ai_message || "");
  const [branches, setBranches] = useState<StepBranch[]>([]);
  const [allSteps, setAllSteps] = useState<any[]>([]);
  const [allScenarios, setAllScenarios] = useState<any[]>([]);

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
      const response = await fetch(`/api/steps/${step.id}/branches/${branchId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        await loadBranches();
      }
    } catch (error) {
      console.error("Error deleting branch:", error);
    }
  };

  const handleUpdateBranch = async (branchId: string, updates: Partial<StepBranch>) => {
    try {
      const response = await fetch(`/api/steps/${step.id}/branches/${branchId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

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

  return (
    <div className="fixed right-0 top-0 h-full w-1/2 border-l border-white/10 bg-black/40 backdrop-blur shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="border-b border-white/10 px-6 py-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-xl font-semibold text-white">{name}</h2>
            <p className="text-sm text-white/60 mt-1">
              {step.type === "code"
                ? "Loads a user's profile from your API and stores name + tier for later steps."
                : "Configure the AI message for this step."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-full transition"
          >
            <X className="h-5 w-5 text-white/60" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-white/10 px-6">
        <div className="flex gap-1">
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
                label="Input Schema"
                active={activeTab === "input"}
                onClick={() => setActiveTab("input")}
              />
              <TabButton
                icon={Zap}
                label="Callable functions"
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
                label="Global Variables"
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
      <div className="flex-1 overflow-y-auto p-6">
        {step.type === "code" && activeTab === "code" && (
          <div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-white/70 mb-2">
                Step Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-white/10 bg-black/40 text-white focus:outline-none focus:border-[#3351ff]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                Code
              </label>
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full h-96 font-mono text-sm px-4 py-3 rounded-lg border border-white/10 bg-black/40 text-white focus:outline-none focus:border-[#3351ff] resize-none"
                placeholder={`# Loads a user's profile and updates global store
store_updates = {}
assistant_message = ""

try:
  # API result
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
          <div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-white/70 mb-2">
                Step Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-white/10 bg-black/40 text-white focus:outline-none focus:border-[#3351ff]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                AI Message
              </label>
              <textarea
                value={aiMessage}
                onChange={(e) => setAiMessage(e.target.value)}
                rows={6}
                className="w-full px-4 py-3 rounded-lg border border-white/10 bg-black/40 text-white focus:outline-none focus:border-[#3351ff] resize-none"
                placeholder="Welcome! We're excited to get you started with your new account. May I confirm your full name and date of birth to begin?"
              />
            </div>
          </div>
        )}

        {activeTab === "input" && (
          <div className="text-white/60">
            <p>Input schema configuration coming soon...</p>
          </div>
        )}

        {activeTab === "functions" && (
          <div className="text-white/60">
            <p>Callable functions configuration coming soon...</p>
          </div>
        )}

        {activeTab === "apis" && (
          <div className="text-white/60">
            <p>API configuration coming soon...</p>
          </div>
        )}

        {activeTab === "globals" && (
          <div className="text-white/60">
            <p>Global variables configuration coming soon...</p>
          </div>
        )}

        {activeTab === "branches" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Branching Logic</h3>
              <button
                onClick={handleCreateBranch}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#3351ff] hover:bg-[#4a64ff] text-white text-sm font-medium transition"
              >
                <Plus className="h-4 w-4" />
                Add Branch
              </button>
            </div>

            {branches.length === 0 ? (
              <div className="text-center py-8 text-white/60">
                <p>No branches yet. Add a branch to create if-then logic.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {branches.map((branch) => (
                  <div key={branch.id} className="rounded-lg border border-white/10 bg-black/40 p-4">
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-white/60 mb-1.5">If condition:</label>
                        <input
                          type="text"
                          value={branch.condition}
                          onChange={(e) => handleUpdateBranch(branch.id, { condition: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-white/10 bg-black/40 text-white text-sm focus:outline-none focus:border-[#3351ff]"
                          placeholder="Customer provides info"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-white/60 mb-1.5">Condition tag:</label>
                        <input
                          type="text"
                          value={branch.condition_tag || ""}
                          onChange={(e) => handleUpdateBranch(branch.id, { condition_tag: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-white/10 bg-black/40 text-white text-sm font-mono focus:outline-none focus:border-[#3351ff]"
                          placeholder="@info_confirmed"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-white/60 mb-1.5">Then proceed to:</label>
                        <select
                          value={branch.next_step_id || branch.next_scenario_id || ""}
                          onChange={(e) => {
                            if (e.target.value.startsWith("step_")) {
                              handleUpdateBranch(branch.id, { next_step_id: e.target.value.replace("step_", ""), next_scenario_id: undefined });
                            } else if (e.target.value.startsWith("scenario_")) {
                              handleUpdateBranch(branch.id, { next_scenario_id: e.target.value.replace("scenario_", ""), next_step_id: undefined });
                            }
                          }}
                          className="w-full px-3 py-2 rounded-lg border border-white/10 bg-black/40 text-white text-sm focus:outline-none focus:border-[#3351ff]"
                        >
                          <option value="">Select next step or scenario...</option>
                          {/* We'd need to load all steps and scenarios here */}
                        </select>
                      </div>

                      <div className="flex justify-end">
                        <button
                          onClick={() => handleDeleteBranch(branch.id)}
                          className="px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-sm hover:bg-red-500/20 transition"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-white/10 px-6 py-4 flex items-center justify-end gap-3">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg border border-white/10 bg-black/40 text-white hover:bg-black/60 transition"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="px-4 py-2 rounded-lg bg-[#3351ff] hover:bg-[#4a64ff] text-white font-medium transition"
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
      className={`px-4 py-2 text-sm font-medium transition flex items-center gap-2 ${
        active
          ? "text-white border-b-2 border-[#3351ff]"
          : "text-white/60 hover:text-white"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}


