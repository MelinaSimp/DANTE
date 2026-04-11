"use client";

import { useState } from "react";
import { User, Volume2, Sparkles, Settings } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { toast } from "@/components/ui/toast";

interface VoiceModel {
  id: string;
  name: string;
  description: string;
  selected: boolean;
}

interface CharacterTrait {
  id: string;
  name: string;
  value: string;
}

interface PersonalizationPageProps {
  agentId?: string;
}

export default function PersonalizationPage({ agentId }: PersonalizationPageProps) {
  const { colors } = useTheme();
  const [voiceModels] = useState<VoiceModel[]>([
    { id: "1", name: "Professional", description: "Clear, professional tone", selected: true },
    { id: "2", name: "Friendly", description: "Warm and approachable", selected: false },
    { id: "3", name: "Casual", description: "Relaxed and conversational", selected: false },
    { id: "4", name: "Formal", description: "Structured and authoritative", selected: false },
  ]);

  const [traits, setTraits] = useState<CharacterTrait[]>([
    { id: "1", name: "Personality", value: "Helpful and empathetic" },
    { id: "2", name: "Response Style", value: "Concise and clear" },
    { id: "3", name: "Humor Level", value: "Professional, minimal humor" },
    { id: "4", name: "Formality", value: "Moderate" },
  ]);

  const [selectedVoice, setSelectedVoice] = useState("1");

  const updateTrait = (id: string, value: string) => {
    setTraits((prev) => prev.map((trait) => (trait.id === id ? { ...trait, value } : trait)));
  };

  return (
    <div className={`h-full flex flex-col overflow-y-auto ${colors.text}`} style={{ background: '#000000' }}>
      <div className="max-w-4xl mx-auto w-full p-6">
        <div className="mb-6">
          <h2 className={`text-base font-semibold ${colors.text} mb-2`}>Personalization</h2>
          <p className={`${colors.textSecondary} text-xs`}>
            Configure character traits, voice models, and personality settings for your AI agent.
          </p>
        </div>

        <div className="space-y-6 rounded-3xl border border-white/10 bg-[#242423]/90 backdrop-blur-sm p-6">
        {/* Voice Models */}
        <div className={`rounded-3xl border ${colors.border} ${colors.cardBg} p-6`}>
          <div className="flex items-center gap-3 mb-4">
            <Volume2 className={`h-5 w-5 ${colors.iconSecondary}`} />
            <h3 className={`text-lg font-semibold ${colors.text}`}>Voice Model</h3>
          </div>
          <p className={`${colors.textSecondary} text-sm mb-4`}>
            Select the voice model that best matches your brand's tone
          </p>
          <div className="grid grid-cols-2 gap-3">
            {voiceModels.map((model) => (
              <button
                key={model.id}
                onClick={() => setSelectedVoice(model.id)}
                className={`p-4 rounded-3xl border transition text-left ${
                  selectedVoice === model.id
                    ? "border-[#3351ff] bg-[#3351ff]/20"
                    : `${colors.border} ${colors.cardBg} hover:${colors.borderSecondary}`
                }`}
              >
                <div className={`font-semibold ${colors.text} mb-1`}>{model.name}</div>
                <div className={`text-xs ${colors.textSecondary}`}>{model.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Character Traits */}
        <div className={`rounded-3xl border ${colors.border} ${colors.cardBg} p-6`}>
          <div className="flex items-center gap-3 mb-4">
            <Sparkles className={`h-5 w-5 ${colors.iconSecondary}`} />
            <h3 className={`text-lg font-semibold ${colors.text}`}>Character Traits</h3>
          </div>
          <p className={`${colors.textSecondary} text-sm mb-4`}>
            Define personality characteristics for your AI agent
          </p>
          <div className="space-y-4">
            {traits.map((trait) => (
              <div key={trait.id} className="flex items-center gap-4">
                <label className={`w-32 text-sm font-medium ${colors.textSecondary}`}>
                  {trait.name}
                </label>
                <input
                  type="text"
                  value={trait.value}
                  onChange={(e) => updateTrait(trait.id, e.target.value)}
                  className={`flex-1 rounded-2xl border ${colors.border} ${colors.inputBg} px-4 py-2 text-sm ${colors.text} placeholder:${colors.textTertiary} focus:border-[#3351ff] focus:outline-none`}
                  placeholder="Enter trait value"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Additional Settings */}
        <div className={`rounded-3xl border ${colors.border} ${colors.cardBg} p-6`}>
          <div className="flex items-center gap-3 mb-4">
            <Settings className={`h-5 w-5 ${colors.iconSecondary}`} />
            <h3 className={`text-lg font-semibold ${colors.text}`}>Additional Settings</h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-sm font-medium ${colors.text}`}>Response Length</div>
                <div className={`text-xs ${colors.textSecondary}`}>Control how verbose the agent is</div>
              </div>
              <select className={`rounded-2xl border ${colors.border} ${colors.inputBg} px-4 py-2 text-sm ${colors.text} focus:border-[#3351ff] focus:outline-none`}>
                <option>Concise</option>
                <option>Moderate</option>
                <option>Detailed</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-sm font-medium ${colors.text}`}>Language</div>
                <div className={`text-xs ${colors.textSecondary}`}>Primary language for responses</div>
              </div>
              <select className={`rounded-2xl border ${colors.border} ${colors.inputBg} px-4 py-2 text-sm ${colors.text} focus:border-[#3351ff] focus:outline-none`}>
                <option>English</option>
                <option>Spanish</option>
                <option>French</option>
                <option>German</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-sm font-medium ${colors.text}`}>Emoji Usage</div>
                <div className={`text-xs ${colors.textSecondary}`}>Allow emojis in responses</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" />
                <div className="w-11 h-6 bg-white/20 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#3351ff] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#3351ff]"></div>
              </label>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            onClick={async () => {
              if (!agentId) return;
              try {
                const voiceModelMap: Record<string, string> = {
                  "1": "professional",
                  "2": "friendly",
                  "3": "casual",
                  "4": "formal",
                };
                const response = await fetch(`/api/agents/${agentId}/personalization`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    voice_model: voiceModelMap[selectedVoice] || "professional",
                    personality: traits.find((t) => t.name === "Personality")?.value || "helpful",
                    response_style: traits.find((t) => t.name === "Response Style")?.value || "concise",
                    humor_level: traits.find((t) => t.name === "Humor Level")?.value || "none",
                    formality: traits.find((t) => t.name === "Formality")?.value || "neutral",
                  }),
                });
                if (response.ok) {
                  toast.success("Personalization settings saved");
                } else {
                  toast.error("Failed to save settings");
                }
              } catch (error) {
                console.error("Failed to save personalization:", error);
                toast.error("Failed to save settings");
              }
            }}
            className={`px-6 py-3 rounded-2xl ${colors.buttonPrimary} ${colors.buttonPrimaryHover} text-white font-medium transition`}
          >
            Save Changes
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}

