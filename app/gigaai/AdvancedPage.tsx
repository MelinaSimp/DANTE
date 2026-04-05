"use client";

import { useState, useEffect } from "react";
import { Code, Settings, Key, Webhook, Database, Phone, UserCheck, Users, Radio, Zap, Loader2, CheckCircle2 } from "lucide-react";
import { useTheme } from "./ThemeProvider";

interface AdvancedPageProps {
  agentId?: string;
  phoneNumber?: string;
  onPhoneNumberChange?: (phoneNumber: string) => void;
  onVoiceProviderChange?: (provider: string) => void;
}

export default function AdvancedPage({ agentId, phoneNumber = "", onPhoneNumberChange, onVoiceProviderChange }: AdvancedPageProps) {
  const { theme, colors } = useTheme();
  const [apiKey, setApiKey] = useState("sk_live_••••••••••••••••");
  const [showApiKey, setShowApiKey] = useState(false);
  const [localPhoneNumber, setLocalPhoneNumber] = useState(phoneNumber);
  
  // Voice provider state
  const [voiceProvider, setVoiceProvider] = useState<"custom" | "vapi">("custom");
  const [vapiSyncing, setVapiSyncing] = useState(false);
  const [vapiSyncStatus, setVapiSyncStatus] = useState<string | null>(null);
  const [vapiAssistantId, setVapiAssistantId] = useState<string | null>(null);
  
  // Agent role/specialist state
  const [agentRole, setAgentRole] = useState<string>("");
  const [isSpecialist, setIsSpecialist] = useState(false);
  const [parentAgentId, setParentAgentId] = useState<string>("");
  const [routingKeywords, setRoutingKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [availableAgents, setAvailableAgents] = useState<any[]>([]);
  
  // Load agent data
  useEffect(() => {
    if (!agentId) return;
    
    async function loadAgentData() {
      try {
        const response = await fetch(`/api/agents/${agentId}`);
        if (response.ok) {
          const agent = await response.json();
          setAgentRole(agent.agent_role || "");
          setIsSpecialist(agent.is_specialist || false);
          setParentAgentId(agent.parent_agent_id || "");
          setRoutingKeywords(agent.routing_keywords || []);
          setVoiceProvider(agent.voice_provider || "custom");
          setVapiAssistantId(agent.vapi_assistant_id || null);
        }
        
        // Load available agents for parent selection
        const agentsResponse = await fetch("/api/agents");
        if (agentsResponse.ok) {
          const agents = await agentsResponse.json();
          setAvailableAgents(agents.filter((a: any) => a.id !== agentId));
        }
      } catch (error) {
        console.error("Failed to load agent data:", error);
      }
    }
    
    loadAgentData();
  }, [agentId]);

  const handleVoiceProviderChange = async (provider: "custom" | "vapi") => {
    if (!agentId) return;
    setVoiceProvider(provider);
    setVapiSyncStatus(null);
    
    try {
      // Save voice provider to agent
      await fetch(`/api/agents/${agentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice_provider: provider }),
      });
      
      if (onVoiceProviderChange) {
        onVoiceProviderChange(provider);
      }
    } catch (error) {
      console.error("Failed to save voice provider:", error);
    }
  };

  const handleSyncToVapi = async () => {
    if (!agentId) return;
    setVapiSyncing(true);
    setVapiSyncStatus(null);
    
    try {
      const response = await fetch(`/api/agents/${agentId}/vapi-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      
      if (response.ok) {
        const data = await response.json();
        setVapiAssistantId(data.assistantId);
        setVapiSyncStatus("success");
      } else {
        const error = await response.json().catch(() => ({}));
        setVapiSyncStatus(`error: ${error.error || "Sync failed"}`);
      }
    } catch (error: any) {
      setVapiSyncStatus(`error: ${error.message}`);
    } finally {
      setVapiSyncing(false);
    }
  };

  // Update local state when prop changes
  useEffect(() => {
    setLocalPhoneNumber(phoneNumber);
  }, [phoneNumber]);

  // Handle keyword input - supports both single keywords and array format
  const handleKeywordInput = (input: string) => {
    if (!input.trim()) return;

    // Try to parse as JSON array first
    try {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed)) {
        // Valid array format - add all keywords
        const newKeywords = parsed
          .filter(k => typeof k === 'string' && k.trim().length > 0)
          .map(k => k.trim().toLowerCase());
        setRoutingKeywords([...routingKeywords, ...newKeywords.filter(k => !routingKeywords.includes(k))]);
        return;
      }
    } catch (e) {
      // Not valid JSON, treat as single keyword
    }

    // Single keyword - add if not already present
    const keyword = input.trim().toLowerCase();
    if (keyword && !routingKeywords.includes(keyword)) {
      setRoutingKeywords([...routingKeywords, keyword]);
    }
  };

  return (
    <div className={`h-full flex flex-col ${colors.bg} overflow-y-auto`} style={{ background: '#000000' }}>
      <div className="max-w-4xl mx-auto w-full p-6">
        <div className="mb-6">
          <h2 className={`text-base font-semibold ${colors.text} mb-2`}>Advanced Settings</h2>
          <p className={`${colors.textSecondary} text-xs`}>
            Configure advanced options, API keys, webhooks, and system integrations
          </p>
        </div>

        <div className="space-y-6 rounded-lg border border-white/10 bg-[#242423]/90 backdrop-blur-sm p-6">
        {/* Voice Provider Selection */}
        <div className={`rounded-xl border ${colors.border} ${colors.cardBg} p-6`}>
          <div className="flex items-center gap-3 mb-4">
            <Radio className={`h-5 w-5 ${colors.iconSecondary}`} />
            <h3 className={`text-lg font-semibold ${colors.text}`}>Voice Engine</h3>
          </div>
          <p className={`${colors.textSecondary} text-xs mb-4`}>
            Choose which voice engine powers this agent's phone calls
          </p>
          
          <div className="grid grid-cols-2 gap-3 mb-4">
            {/* Custom Engine Option */}
            <button
              type="button"
              onClick={() => handleVoiceProviderChange("custom")}
              className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                voiceProvider === "custom"
                  ? "border-blue-500 bg-blue-500/10"
                  : `border-white/10 ${colors.bgTertiary} hover:border-white/20`
              }`}
            >
              {voiceProvider === "custom" && (
                <div className="absolute top-2 right-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-400" />
                </div>
              )}
              <div className="flex items-center gap-2 mb-2">
                <Zap className={`h-5 w-5 ${voiceProvider === "custom" ? "text-blue-400" : colors.iconSecondary}`} />
                <span className={`text-sm font-semibold ${colors.text}`}>Custom Engine</span>
              </div>
              <p className={`text-xs ${colors.textTertiary}`}>
                Twilio + ElevenLabs + OpenAI — our built-in voice pipeline with full control
              </p>
            </button>
            
            {/* VAPI Option */}
            <button
              type="button"
              onClick={() => handleVoiceProviderChange("vapi")}
              className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                voiceProvider === "vapi"
                  ? "border-purple-500 bg-purple-500/10"
                  : `border-white/10 ${colors.bgTertiary} hover:border-white/20`
              }`}
            >
              {voiceProvider === "vapi" && (
                <div className="absolute top-2 right-2">
                  <CheckCircle2 className="h-4 w-4 text-purple-400" />
                </div>
              )}
              <div className="flex items-center gap-2 mb-2">
                <svg className={`h-5 w-5 ${voiceProvider === "vapi" ? "text-purple-400" : colors.iconSecondary}`} viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                </svg>
                <span className={`text-sm font-semibold ${colors.text}`}>VAPI</span>
              </div>
              <p className={`text-xs ${colors.textTertiary}`}>
                VAPI's managed voice platform — ElevenLabs + advanced telephony features
              </p>
            </button>
          </div>

          {/* VAPI Sync Controls */}
          {voiceProvider === "vapi" && (
            <div className="space-y-3 mt-4 p-4 rounded-xl bg-purple-500/5 border border-purple-500/20">
              <div className="flex items-center justify-between">
                <div>
                  <div className={`text-sm font-medium ${colors.text}`}>VAPI Assistant</div>
                  <div className={`text-xs ${colors.textTertiary}`}>
                    {vapiAssistantId
                      ? `Synced (ID: ${vapiAssistantId.substring(0, 12)}...)`
                      : "Not synced yet — sync will happen automatically on deploy"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSyncToVapi}
                  disabled={vapiSyncing}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs font-medium hover:bg-purple-500/30 transition disabled:opacity-50"
                >
                  {vapiSyncing ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <Radio className="h-3 w-3" />
                      Sync Now
                    </>
                  )}
                </button>
              </div>
              
              {vapiSyncStatus && (
                <div className={`text-xs px-3 py-2 rounded-lg ${
                  vapiSyncStatus === "success"
                    ? "bg-green-500/10 border border-green-500/20 text-green-300"
                    : "bg-red-500/10 border border-red-500/20 text-red-300"
                }`}>
                  {vapiSyncStatus === "success"
                    ? "Successfully synced agent to VAPI"
                    : vapiSyncStatus.replace("error: ", "")}
                </div>
              )}
              
              <div className={`text-xs ${colors.textTertiary} p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20`}>
                <strong className="text-yellow-300">Note:</strong> Make sure your ElevenLabs API key is added to your{" "}
                <a
                  href="https://dashboard.vapi.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-400 hover:underline"
                >
                  VAPI Dashboard
                </a>{" "}
                under Provider Keys for voice to work.
              </div>
            </div>
          )}
        </div>

        {/* Phone Number Configuration */}
        <div className={`rounded-xl border ${colors.border} ${colors.cardBg} p-6`}>
          <div className="flex items-center gap-3 mb-4">
            <Phone className={`h-5 w-5 ${colors.iconSecondary}`} />
            <h3 className={`text-lg font-semibold ${colors.text}`}>Phone Number Setup</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className={`block text-sm font-medium ${colors.textSecondary} mb-2`}>
                Phone Number
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="tel"
                  value={localPhoneNumber}
                  onChange={(e) => {
                    setLocalPhoneNumber(e.target.value);
                    if (onPhoneNumberChange) {
                      onPhoneNumberChange(e.target.value);
                    }
                  }}
                  placeholder="+1234567890"
                  className={`flex-1 rounded-lg border ${colors.border} ${colors.inputBg} px-4 py-2 text-sm ${colors.text} placeholder:${colors.textTertiary} focus:border-[#3351ff] focus:outline-none`}
                />
              </div>
              <p className={`text-xs ${colors.textTertiary} mt-2`}>
                Enter your phone number (Twilio number or existing business number). Format: +1234567890
              </p>
            </div>

            {/* Setup Options */}
            <div className={`mt-4 p-4 rounded-lg ${colors.bgTertiary} border ${colors.border}`}>
              <h4 className={`text-sm font-semibold ${colors.text} mb-3`}>Using an Existing Business Number?</h4>
              <div className={`space-y-3 text-sm ${colors.textSecondary}`}>
                <div>
                  <div className={`font-medium ${colors.text} mb-1`}>Option 1: Port to Twilio (Recommended)</div>
                  <p className={`text-xs ${colors.textTertiary}`}>
                    Transfer your existing number to Twilio for full control. Takes 1-2 weeks. 
                    <a href="https://www.twilio.com/docs/phone-numbers/porting" target="_blank" rel="noopener noreferrer" className="text-[#3351ff] hover:underline ml-1">
                      Learn more →
                    </a>
                  </p>
                </div>
                <div>
                  <div className={`font-medium ${colors.text} mb-1`}>Option 2: Call Forwarding (Quick Setup)</div>
                  <p className={`text-xs ${colors.textTertiary}`}>
                    Forward calls from your existing number to a Twilio number. Set up in minutes.
                    Configure forwarding in your current phone provider's settings.
                  </p>
                </div>
                <div>
                  <div className={`font-medium ${colors.text} mb-1`}>Option 3: SIP Trunking (For PBX Systems)</div>
                  <p className={`text-xs ${colors.textTertiary}`}>
                    Connect your existing PBX/phone system to Twilio via SIP trunking.
                    <a href="https://www.twilio.com/docs/sip-trunking" target="_blank" rel="noopener noreferrer" className="text-[#3351ff] hover:underline ml-1">
                      Learn more →
                    </a>
                  </p>
                </div>
              </div>
            </div>

            {localPhoneNumber && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/20 border border-green-500/30">
                <Phone className="h-4 w-4 text-green-300" />
                <span className="text-sm text-green-300">
                  Phone number configured: {localPhoneNumber}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* API Configuration */}
        <div className={`rounded-xl border ${colors.border} ${colors.cardBg} p-6`}>
          <div className="flex items-center gap-3 mb-4">
            <Key className={`h-5 w-5 ${colors.iconSecondary}`} />
            <h3 className={`text-lg font-semibold ${colors.text}`}>API Keys</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className={`block text-sm font-medium ${colors.textSecondary} mb-2`}>
                API Key
              </label>
              <div className="flex items-center gap-2">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className={`flex-1 rounded-lg border ${colors.border} ${colors.inputBg} px-4 py-2 text-sm ${colors.text} placeholder:${colors.textTertiary} focus:border-[#3351ff] focus:outline-none font-mono`}
                />
                <button
                  onClick={() => setShowApiKey(!showApiKey)}
                  className={`px-4 py-2 rounded-lg border ${colors.border} ${colors.buttonSecondary} ${colors.text} text-sm ${colors.hover} transition`}
                >
                  {showApiKey ? "Hide" : "Show"}
                </button>
              </div>
              <p className={`text-xs ${colors.textTertiary} mt-2`}>
                Use this API key to integrate Drift with your applications
              </p>
            </div>
            <button className={`px-4 py-2 rounded-lg ${colors.buttonPrimary} ${colors.buttonPrimaryHover} text-white text-sm font-medium transition`}>
              Regenerate API Key
            </button>
          </div>
        </div>

        {/* Webhooks */}
        <div className={`rounded-xl border ${colors.border} ${colors.cardBg} p-6`}>
          <div className="flex items-center gap-3 mb-4">
            <Webhook className={`h-5 w-5 ${colors.iconSecondary}`} />
            <h3 className={`text-lg font-semibold ${colors.text}`}>Webhooks</h3>
          </div>
          <p className={`${colors.textSecondary} text-sm mb-4`}>
            Configure webhooks to receive real-time events from your AI agent
          </p>
          <div className="space-y-3">
            <div className={`flex items-center gap-3 p-4 rounded-lg border ${colors.border} ${colors.bgTertiary}`}>
              <div className="flex-1">
                <div className={`text-sm font-medium ${colors.text} mb-1`}>
                  https://your-app.com/webhook
                </div>
                <div className={`text-xs ${colors.textTertiary}`}>Active • Receives all events</div>
              </div>
              <button className={`px-3 py-1.5 rounded-lg border ${colors.border} ${colors.buttonSecondary} ${colors.text} text-xs ${colors.hover} transition`}>
                Edit
              </button>
            </div>
            <button className={`w-full px-4 py-2 rounded-lg border ${colors.border} ${colors.buttonSecondary} ${colors.text} text-sm ${colors.hover} transition flex items-center justify-center gap-2`}>
              <Webhook className={`h-4 w-4 ${colors.icon}`} />
              Add Webhook
            </button>
          </div>
        </div>

        {/* Database Connections */}
        <div className={`rounded-xl border ${colors.border} ${colors.cardBg} p-6`}>
          <div className="flex items-center gap-3 mb-4">
            <Database className={`h-5 w-5 ${colors.iconSecondary}`} />
            <h3 className={`text-lg font-semibold ${colors.text}`}>Database Connections</h3>
          </div>
          <p className={`${colors.textSecondary} text-sm mb-4`}>
            Connect external databases to access real-time data
          </p>
          <div className="space-y-3">
            <div className={`flex items-center gap-3 p-4 rounded-lg border ${colors.border} ${colors.bgTertiary}`}>
              <div className="flex-1">
                <div className={`text-sm font-medium ${colors.text} mb-1`}>PostgreSQL</div>
                <div className={`text-xs ${colors.textTertiary}`}>Connected • Last synced 2 min ago</div>
              </div>
              <button className={`px-3 py-1.5 rounded-lg border ${colors.border} ${colors.buttonSecondary} ${colors.text} text-xs ${colors.hover} transition`}>
                Configure
              </button>
            </div>
            <button className={`w-full px-4 py-2 rounded-lg border ${colors.border} ${colors.buttonSecondary} ${colors.text} text-sm ${colors.hover} transition flex items-center justify-center gap-2`}>
              <Database className={`h-4 w-4 ${colors.icon}`} />
              Add Database Connection
            </button>
          </div>
        </div>

        {/* Custom Code */}
        <div className={`rounded-xl border ${colors.border} ${colors.cardBg} p-6`}>
          <div className="flex items-center gap-3 mb-4">
            <Code className={`h-5 w-5 ${colors.iconSecondary}`} />
            <h3 className={`text-lg font-semibold ${colors.text}`}>Custom Code</h3>
          </div>
          <p className={`${colors.textSecondary} text-sm mb-4`}>
            Add custom JavaScript/Python code to extend agent functionality
          </p>
          <textarea
            rows={8}
            className={`w-full rounded-lg border ${colors.border} ${colors.inputBg} px-4 py-3 text-sm ${colors.text} font-mono focus:border-[#3351ff] focus:outline-none`}
            placeholder="// Add your custom code here..."
          />
          <button className={`mt-3 px-4 py-2 rounded-lg ${colors.buttonPrimary} ${colors.buttonPrimaryHover} text-white text-sm font-medium transition`}>
            Save Code
          </button>
        </div>

        {/* System Settings */}
        <div className={`rounded-xl border ${colors.border} ${colors.cardBg} p-6`}>
          <div className="flex items-center gap-3 mb-4">
            <Settings className={`h-5 w-5 ${colors.iconSecondary}`} />
            <h3 className={`text-lg font-semibold ${colors.text}`}>System Settings</h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-sm font-medium ${colors.text}`}>Debug Mode</div>
                <div className={`text-xs ${colors.textSecondary}`}>Enable detailed logging</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" />
                <div className={`w-11 h-6 ${theme === "white" ? "bg-gray-300" : "bg-white/20"} peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#3351ff] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#3351ff]`}></div>
              </label>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-sm font-medium ${colors.text}`}>Rate Limiting</div>
                <div className={`text-xs ${colors.textSecondary}`}>Requests per minute</div>
              </div>
              <input
                type="number"
                defaultValue={100}
                className={`w-24 rounded-lg border ${colors.border} ${colors.inputBg} px-4 py-2 text-sm ${colors.text} focus:border-[#3351ff] focus:outline-none`}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-sm font-medium ${colors.text}`}>Timeout (seconds)</div>
                <div className={`text-xs ${colors.textSecondary}`}>Request timeout duration</div>
              </div>
              <input
                type="number"
                defaultValue={30}
                className={`w-24 rounded-lg border ${colors.border} ${colors.inputBg} px-4 py-2 text-sm ${colors.text} focus:border-[#3351ff] focus:outline-none`}
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            onClick={async () => {
              if (!agentId) return;
              try {
                const response = await fetch(`/api/agents/${agentId}/advanced-settings`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    api_key: apiKey,
                    debug_mode: false,
                    rate_limiting: 100,
                    timeout_seconds: 30,
                  }),
                });
                if (response.ok) {
                  alert("Advanced settings saved!");
                } else {
                  alert("Failed to save settings");
                }
              } catch (error) {
                console.error("Failed to save advanced settings:", error);
                alert("Failed to save settings");
              }
            }}
            className={`px-6 py-3 rounded-lg ${colors.buttonPrimary} ${colors.buttonPrimaryHover} text-white font-medium transition`}
          >
            Save All Changes
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}

