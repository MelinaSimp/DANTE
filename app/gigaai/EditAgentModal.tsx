"use client";

import { useState, useEffect } from "react";
import { X, Phone } from "lucide-react";
import { useTheme } from "./ThemeProvider";

interface Agent {
  id: string;
  name: string;
  modality: "chat" | "voice" | "multi-modal";
  description?: string;
  phoneNumber?: string;
}

interface EditAgentModalProps {
  agent: Agent;
  onClose: () => void;
  onSave: (agentData: { name: string; modality: "chat" | "voice" | "multi-modal"; description?: string; phoneNumber?: string }) => void;
}

export default function EditAgentModal({ agent, onClose, onSave }: EditAgentModalProps) {
  const { colors } = useTheme();
  const [name, setName] = useState(agent.name);
  const [modality, setModality] = useState<"chat" | "voice" | "multi-modal">(agent.modality);
  const [description, setDescription] = useState(agent.description || "");
  const [phoneNumber, setPhoneNumber] = useState(agent.phoneNumber || "");

  useEffect(() => {
    setName(agent.name);
    setModality(agent.modality);
    setDescription(agent.description || "");
    setPhoneNumber(agent.phoneNumber || "");
  }, [agent]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSave({
        name: name.trim(),
        modality,
        description: description.trim() || undefined,
        phoneNumber: phoneNumber.trim() || undefined,
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className={`w-full max-w-md rounded-2xl border ${colors.border} bg-[#242423] p-6 shadow-2xl`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-lg font-semibold ${colors.text}`}>Edit Agent</h3>
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
              Agent Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Customer Support Agent"
              className={`w-full rounded-lg border ${colors.border} ${colors.inputBg} ${colors.text} placeholder:${colors.textTertiary} focus:border-[#3351ff] focus:outline-none px-4 py-2 text-sm`}
              autoFocus
            />
          </div>

          <div>
            <label className={`block text-sm font-medium ${colors.textSecondary} mb-2`}>
              Modality
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setModality("chat")}
                className={`px-4 py-2 rounded-lg border transition ${
                  modality === "chat"
                    ? `${colors.selected}`
                    : `${colors.bgTertiary} ${colors.textTertiary} ${colors.hover}`
                } ${colors.border}`}
              >
                Chat
              </button>
              <button
                type="button"
                onClick={() => setModality("voice")}
                className={`px-4 py-2 rounded-lg border transition ${
                  modality === "voice"
                    ? `${colors.selected}`
                    : `${colors.bgTertiary} ${colors.textTertiary} ${colors.hover}`
                } ${colors.border}`}
              >
                Voice
              </button>
              <button
                type="button"
                onClick={() => setModality("multi-modal")}
                className={`px-4 py-2 rounded-lg border transition ${
                  modality === "multi-modal"
                    ? `${colors.selected}`
                    : `${colors.bgTertiary} ${colors.textTertiary} ${colors.hover}`
                } ${colors.border}`}
              >
                Multi-modal
              </button>
            </div>
          </div>

          <div>
            <label className={`block text-sm font-medium ${colors.textSecondary} mb-2`}>
              <Phone className="h-4 w-4 inline mr-1" />
              Twilio Phone Number
            </label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+1234567890"
              className={`w-full rounded-lg border ${colors.border} ${colors.inputBg} ${colors.text} placeholder:${colors.textTertiary} focus:border-[#3351ff] focus:outline-none px-4 py-2 text-sm`}
            />
            <p className={`text-xs ${colors.textTertiary} mt-1`}>
              Enter your Twilio phone number for voice calls
            </p>
          </div>

          <div>
            <label className={`block text-sm font-medium ${colors.textSecondary} mb-2`}>
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe what this agent does..."
              className={`w-full rounded-lg border ${colors.border} ${colors.inputBg} ${colors.text} placeholder:${colors.textTertiary} focus:border-[#3351ff] focus:outline-none resize-none px-4 py-2 text-sm`}
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
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


