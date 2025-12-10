"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useTheme } from "./ThemeProvider";

interface CreateScenarioModalProps {
  onClose: () => void;
  onCreate: (name: string) => void;
}

export default function CreateScenarioModal({ onClose, onCreate }: CreateScenarioModalProps) {
  const { colors } = useTheme();
  const [name, setName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onCreate(name.trim());
      setName("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className={`w-full max-w-md rounded-2xl border ${colors.border} bg-[#242423] p-6 shadow-2xl`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-lg font-semibold ${colors.text}`}>Create New Scenario</h3>
          <button
            onClick={onClose}
            className={`p-1 ${colors.hover} rounded transition`}
          >
            <X className={`h-5 w-5 ${colors.iconSecondary}`} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={`block text-sm font-medium ${colors.textSecondary} mb-2`}>
              Scenario Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., New account onboarding"
              className={`w-full rounded-lg border ${colors.border} ${colors.inputBg} ${colors.text} placeholder:${colors.textTertiary} focus:border-[#3351ff] focus:outline-none px-4 py-2 text-sm`}
              autoFocus
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-lg border ${colors.border} ${colors.bgTertiary} ${colors.text} ${colors.hover} text-sm transition`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className={`px-4 py-2 rounded-lg ${colors.buttonPrimary} ${colors.buttonPrimaryHover} text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              Create Scenario
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


