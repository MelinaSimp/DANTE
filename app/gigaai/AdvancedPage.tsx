"use client";

import { useState, useEffect } from "react";
import { Code, Settings, Key, Webhook, Database, Phone, UserCheck, Users } from "lucide-react";
import { useTheme } from "./ThemeProvider";

interface AdvancedPageProps {
  agentId?: string;
  phoneNumber?: string;
  onPhoneNumberChange?: (phoneNumber: string) => void;
}

export default function AdvancedPage({ agentId, phoneNumber = "", onPhoneNumberChange }: AdvancedPageProps) {
  const { theme, colors } = useTheme();
  const [apiKey, setApiKey] = useState("sk_live_••••••••••••••••");
  const [showApiKey, setShowApiKey] = useState(false);
  const [localPhoneNumber, setLocalPhoneNumber] = useState(phoneNumber);
  
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
    <div className={`h-full flex flex-col ${colors.bg} overflow-y-auto`} style={{ background: '#ffffff', backgroundImage: 'none' }}>
      <div className="max-w-4xl mx-auto w-full p-6">
        <div className="mb-6">
          <h2 className={`text-base font-semibold ${colors.text} mb-2`}>Advanced Settings</h2>
          <p className={`${colors.textSecondary} text-xs`}>
            Configure advanced options, API keys, webhooks, and system integrations
          </p>
        </div>

        <div className="space-y-6 rounded-lg border border-[#e5e7eb] bg-[#ffffff] p-6">
        {/* Agent Role & Specialist Settings */}
        <div className={`rounded-xl border ${colors.border} ${colors.cardBg} p-6`}>
          <div className="flex items-center gap-3 mb-4">
            <UserCheck className={`h-5 w-5 ${colors.iconSecondary}`} />
            <h3 className={`text-lg font-semibold ${colors.text}`}>Agent Role & Routing</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className={`block text-sm font-medium ${colors.textSecondary} mb-2`}>
                Agent Role
              </label>
              <input
                type="text"
                value={agentRole}
                onChange={(e) => setAgentRole(e.target.value)}
                placeholder="Type any role name (e.g., customer agent, mechanic, sales rep)"
                className={`w-full rounded-2xl border ${colors.border} ${colors.inputBg} px-4 py-2 text-sm ${colors.text} focus:border-[#3166bf] focus:outline-none`}
              />
              <p className={`text-xs ${colors.textTertiary} mt-2`}>
                Define the role of this agent for routing purposes. You can type any custom role name (e.g., "customer agent", "mechanic", "sales rep").
              </p>
              <div className={`mt-2 p-2 rounded-xl bg-blue-500/10 border border-blue-500/20`}>
                <p className={`text-xs text-blue-300`}>
                  💡 <strong>Tip:</strong> Use the same role name in Transfer steps to route to this agent.
                </p>
              </div>
            </div>
            
            <div className="flex items-center justify-between p-4 rounded-2xl border border-blue-500/30 bg-blue-500/10">
              <div>
                <div className={`text-sm font-medium ${colors.text} mb-1`}>Is Specialist</div>
                <div className={`text-xs ${colors.textTertiary}`}>
                  Mark this agent as a specialist that can receive transfers
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isSpecialist}
                  onChange={(e) => setIsSpecialist(e.target.checked)}
                  className="sr-only peer"
                />
                <div className={`w-11 h-6 ${theme === "white" ? "bg-gray-300" : "bg-white/20"} peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#3166bf] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#3166bf]`}></div>
              </label>
            </div>
            
            {isSpecialist && (
              <div>
                <label className={`block text-sm font-medium ${colors.textSecondary} mb-2`}>
                  Parent Agent (Main Receptionist)
                </label>
                <select
                  value={parentAgentId}
                  onChange={(e) => setParentAgentId(e.target.value)}
                  className={`w-full rounded-2xl border ${colors.border} ${colors.inputBg} px-4 py-2 text-sm ${colors.text} focus:border-[#3166bf] focus:outline-none`}
                >
                  <option value="">None</option>
                  {availableAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
                <p className={`text-xs ${colors.textTertiary} mt-2`}>
                  Link this specialist to a main receptionist agent
                </p>
              </div>
            )}
            
            <div>
              <label className={`block text-sm font-medium ${colors.textSecondary} mb-2`}>
                Routing Keywords
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === "Enter" && keywordInput.trim()) {
                      handleKeywordInput(keywordInput.trim());
                      setKeywordInput("");
                    }
                  }}
                  onPaste={(e) => {
                    // Allow a small delay to get pasted content
                    setTimeout(() => {
                      const pasted = e.clipboardData.getData('text');
                      handleKeywordInput(pasted);
                    }, 10);
                  }}
                  placeholder='Enter keyword and press Enter, or paste array: ["customer", "help", "support"]'
                  className={`flex-1 rounded-2xl border ${colors.border} ${colors.inputBg} px-4 py-2 text-sm ${colors.text} focus:border-[#3166bf] focus:outline-none`}
                />
                <button
                  onClick={() => {
                    if (keywordInput.trim()) {
                      handleKeywordInput(keywordInput.trim());
                      setKeywordInput("");
                    }
                  }}
                  className={`px-4 py-2 rounded-2xl ${colors.buttonPrimary} ${colors.buttonPrimaryHover} text-white text-sm font-medium transition`}
                >
                  Add
                </button>
              </div>
              {routingKeywords.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {routingKeywords.map((keyword, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1 rounded-2xl bg-blue-500/20 border border-blue-500/30 text-blue-300 text-xs flex items-center gap-2"
                    >
                      {keyword}
                      <button
                        onClick={() => setRoutingKeywords(routingKeywords.filter((_, i) => i !== idx))}
                        className="hover:text-red-400"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <p className={`text-xs ${colors.textTertiary} mt-2`}>
                Keywords that trigger routing to this agent (e.g., "car", "repair", "engine")
              </p>
            </div>
            
            <button
              onClick={async () => {
                if (!agentId) return;
                try {
                  const response = await fetch(`/api/agents/${agentId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      agent_role: agentRole || null,
                      is_specialist: isSpecialist,
                      parent_agent_id: parentAgentId || null,
                      routing_keywords: routingKeywords,
                    }),
                  });
                  if (response.ok) {
                    alert("Agent role settings saved!");
                  } else {
                    alert("Failed to save settings");
                  }
                } catch (error) {
                  console.error("Failed to save agent role settings:", error);
                  alert("Failed to save settings");
                }
              }}
              className={`w-full px-4 py-2 rounded-2xl ${colors.buttonPrimary} ${colors.buttonPrimaryHover} text-white text-sm font-medium transition`}
            >
              Save Role Settings
            </button>
          </div>
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
                  className={`flex-1 rounded-lg border ${colors.border} ${colors.inputBg} px-4 py-2 text-sm ${colors.text} placeholder:${colors.textTertiary} focus:border-[#3166bf] focus:outline-none`}
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
                  className={`flex-1 rounded-lg border ${colors.border} ${colors.inputBg} px-4 py-2 text-sm ${colors.text} placeholder:${colors.textTertiary} focus:border-[#3166bf] focus:outline-none font-mono`}
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
            className={`w-full rounded-lg border ${colors.border} ${colors.inputBg} px-4 py-3 text-sm ${colors.text} font-mono focus:border-[#3166bf] focus:outline-none`}
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
                <div className={`w-11 h-6 ${theme === "white" ? "bg-gray-300" : "bg-white/20"} peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#3166bf] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#3166bf]`}></div>
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
                className={`w-24 rounded-lg border ${colors.border} ${colors.inputBg} px-4 py-2 text-sm ${colors.text} focus:border-[#3166bf] focus:outline-none`}
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
                className={`w-24 rounded-lg border ${colors.border} ${colors.inputBg} px-4 py-2 text-sm ${colors.text} focus:border-[#3166bf] focus:outline-none`}
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

