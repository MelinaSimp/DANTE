"use client";

import { useState } from "react";
import { X, Code, FileText, Zap, Globe } from "lucide-react";

interface StepEditorProps {
  step: any;
  onClose: () => void;
}

export default function StepEditor({ step, onClose }: StepEditorProps) {
  const [activeTab, setActiveTab] = useState<"code" | "input" | "functions" | "apis" | "globals">("code");
  const [code, setCode] = useState(`# Loads a user's profile and updates global store
store_updates = {}
assistant_message = ""

try:
  # API result
  result = await get_user_profile(user_id)
  
  if not result.get("success"):
    assistant_message = "Could not fetch profile. Check the user ID."`);

  return (
    <div className="fixed right-0 top-0 h-screen w-1/2 border-l border-white/10 bg-[#1a1612]/95 backdrop-blur shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="border-b border-white/10 px-6 py-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-xl font-semibold text-white">Fetch User Profile</h2>
            <p className="text-sm text-white/60 mt-1">
              Loads a user's profile from your API and stores name + tier for later steps.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-lg transition"
          >
            <X className="h-5 w-5 text-white/60" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-white/10 px-6">
        <div className="flex gap-1">
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
            label="Callable functions:"
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
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === "code" && (
          <div className="relative">
            <div className="absolute left-6 top-6 text-xs text-white/30 font-mono select-none leading-6">
              {code.split('\n').map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full h-full font-mono text-sm pl-12 pr-4 py-3 rounded-lg border border-white/10 bg-black/40 text-white focus:outline-none focus:border-[#3351ff] resize-none"
              style={{ minHeight: "400px" }}
              spellCheck={false}
            />
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
          onClick={onClose}
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

