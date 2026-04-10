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
  elevenlabsVoiceId?: string | null;
}

interface Voice {
  voice_id: string;
  name: string;
}

interface EditAgentModalProps {
  agent: Agent;
  onClose: () => void;
  onSave: (agentData: { name: string; modality: "chat" | "voice" | "multi-modal"; description?: string; phoneNumber?: string; elevenlabsVoiceId?: string | null }) => void;
}

export default function EditAgentModal({ agent, onClose, onSave }: EditAgentModalProps) {
  const { colors } = useTheme();
  const [name, setName] = useState(agent.name);
  const [modality, setModality] = useState<"chat" | "voice" | "multi-modal">(agent.modality);
  const [description, setDescription] = useState(agent.description || "");
  const [phoneNumber, setPhoneNumber] = useState(agent.phoneNumber || "");
  const [elevenlabsVoiceId, setElevenlabsVoiceId] = useState<string | null>(agent.elevenlabsVoiceId || null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  useEffect(() => {
    setName(agent.name);
    setModality(agent.modality);
    setDescription(agent.description || "");
    setPhoneNumber(agent.phoneNumber || "");
    setElevenlabsVoiceId(agent.elevenlabsVoiceId || null);
  }, [agent]);

  useEffect(() => {
    // Load available voices when modal opens
    if (modality === "voice" || modality === "multi-modal") {
      loadVoices();
    }
  }, [modality]);

  const loadVoices = async () => {
    setLoadingVoices(true);
    setVoiceError(null);
    try {
      const response = await fetch("/api/elevenlabs/voices");
      const data = await response.json();
      
      if (response.ok) {
        const voicesList = data.voices || [];
        setVoices(voicesList);
        
        if (voicesList.length === 0) {
          const errorMsg = data.error || "No voices available. Check ELEVENLABS_API_KEY configuration.";
          setVoiceError(errorMsg);
          console.warn("[EditAgentModal] No voices available:", errorMsg);
        }
      } else {
        const errorMsg = data.error || data.details || "Failed to load voices";
        setVoiceError(errorMsg);
        console.error("Failed to load voices:", data);
      }
    } catch (error: any) {
      const errorMsg = error.message || "Network error loading voices";
      setVoiceError(errorMsg);
      console.error("Failed to load voices:", error);
    } finally {
      setLoadingVoices(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSave({
        name: name.trim(),
        modality,
        description: description.trim() || undefined,
        phoneNumber: phoneNumber.trim() || undefined,
        elevenlabsVoiceId: elevenlabsVoiceId || undefined,
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

          {(modality === "voice" || modality === "multi-modal") && (
            <div>
              <label className={`block text-sm font-medium ${colors.textSecondary} mb-2`}>
                Voice (ElevenLabs)
              </label>
              {loadingVoices ? (
                <div className={`text-sm ${colors.textTertiary} py-2`}>Loading voices...</div>
              ) : (
                <>
                  <select
                    value={elevenlabsVoiceId || ""}
                    onChange={(e) => setElevenlabsVoiceId(e.target.value || null)}
                    className={`w-full rounded-lg border ${colors.border} ${colors.inputBg} ${colors.text} focus:border-[#3351ff] focus:outline-none px-4 py-2 text-sm`}
                  >
                    <option value="">Use Twilio default voice</option>
                    {voices.map((voice) => (
                      <option key={voice.voice_id} value={voice.voice_id}>
                        {voice.name}
                      </option>
                    ))}
                  </select>
                  {voiceError && (
                    <div className={`mt-2 p-3 rounded-lg border border-red-500/50 bg-red-500/10`}>
                      <p className={`text-sm text-red-400 font-medium mb-1`}>⚠️ Error loading voices:</p>
                      <p className={`text-xs text-red-300`}>{voiceError}</p>
                      <p className={`text-xs text-red-300 mt-2`}>
                        Check: 1) ELEVENLABS_API_KEY is set in Vercel, 2) API key has correct permissions, 3) Browser console for details
                      </p>
                    </div>
                  )}
                </>
              )}
              <p className={`text-xs ${colors.textTertiary} mt-1`}>
                Select an ElevenLabs voice for natural-sounding speech. Leave empty to use Twilio's default voice.
              </p>
            </div>
          )}

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


