// app/frontend/page.tsx - Frontend Agent Carousel with Apple Glass Sidebar
"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import Link from "next/link";
import { Bot, Calendar, Inbox, Sparkles, ArrowRight, MessageSquare, Phone, Clock, BarChart3 } from "lucide-react";

interface Agent {
  id: string;
  name: string;
  description?: string;
  gradient_color?: string;
  status: string;
}

// Generate random gradient colors if not set
function generateGradientColor(seed: string): string {
  const colors = [
    ["#FF6B6B", "#4ECDC4", "#45B7D1"],
    ["#A8E6CF", "#FFD93D", "#FF6B9D"],
    ["#C471ED", "#F64F59", "#FBD786"],
    ["#30E8BF", "#FF8235", "#FF6E7F"],
    ["#667EEA", "#764BA2", "#F093FB"],
    ["#F093FB", "#F5576C", "#4FACFE"],
    ["#43E97B", "#38F9D7", "#667EEA"],
    ["#FA709A", "#FEE140", "#30CFC0"],
  ];
  const index = seed.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
  return JSON.stringify(colors[index]);
}

export default function FrontendPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Override global dark theme styles for Apple-style light theme
    const html = document.documentElement;
    const body = document.body;
    const main = document.querySelector('main');
    
    // Store original styles
    const originalHtmlBg = html.style.background;
    const originalBodyBg = body.style.background;
    const originalBodyColor = body.style.color;
    const originalMainBg = main ? (main as HTMLElement).style.background : null;
    
    // Apply light theme with !important to override global styles
    html.style.setProperty('background', '#f5f5f7', 'important');
    body.style.setProperty('background', '#f5f5f7', 'important');
    body.style.setProperty('color', '#111827', 'important');
    if (main) {
      (main as HTMLElement).style.setProperty('background', '#f5f5f7', 'important');
    }

    // Cleanup function to restore original styles on unmount
    return () => {
      html.style.setProperty('background', originalHtmlBg, 'important');
      body.style.setProperty('background', originalBodyBg, 'important');
      body.style.setProperty('color', originalBodyColor, 'important');
      if (main && originalMainBg !== null) {
        (main as HTMLElement).style.setProperty('background', originalMainBg, 'important');
      }
    };
  }, []);

  useEffect(() => {
    async function loadAgents() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push("/auth");
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("workspace_id")
          .eq("id", user.id)
          .maybeSingle();

        if (!profile?.workspace_id) {
          setLoading(false);
          return;
        }

        // Use API endpoint instead of direct Supabase query
        const response = await fetch("/api/agents");
        if (response.ok) {
          const agentsData = await response.json();
          // Generate gradient colors for agents that don't have one
          const agentsWithColors = (agentsData || []).map((agent: any) => ({
            id: agent.id,
            name: agent.name,
            description: agent.description,
            gradient_color: agent.gradient_color || generateGradientColor(agent.id),
            status: agent.status,
          }));
          setAgents(agentsWithColors);
        } else {
          console.error("Failed to load agents:", response.statusText);
        }
      } catch (error) {
        console.error("Failed to load agents:", error);
      } finally {
        setLoading(false);
      }
    }
    loadAgents();
  }, [router]);

  const currentAgent = agents[currentIndex];
  const gradientColors = currentAgent
    ? (JSON.parse(currentAgent.gradient_color || generateGradientColor(currentAgent.id)) as string[])
    : ["#667EEA", "#764BA2", "#F093FB"];

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : agents.length - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev < agents.length - 1 ? prev + 1 : 0));
  };

  const handleAgentClick = () => {
    if (currentAgent) {
      // Go to agent selection page - user can then choose from sidebar
      router.push(`/frontend/agent/${currentAgent.id}`);
    }
  };

  // Extract agentId from pathname if on agent-specific page
  const agentIdMatch = pathname?.match(/\/frontend\/agent\/([^/]+)/);
  const currentAgentId = agentIdMatch ? agentIdMatch[1] : null;

  // Sidebar navigation items
  const sidebarItems = [
    { 
      name: "Agents", 
      icon: Bot, 
      href: "/frontend",
      active: pathname === "/frontend" || pathname?.startsWith("/frontend/agent"),
      requiresAgent: false
    },
    { 
      name: "Calendar", 
      icon: Calendar, 
      href: currentAgentId ? `/frontend/agent/${currentAgentId}/schedule` : "#",
      active: pathname?.includes("/schedule"),
      requiresAgent: true
    },
    { 
      name: "Inbox", 
      icon: Inbox, 
      href: currentAgentId ? `/frontend/agent/${currentAgentId}/inbox` : "#",
      active: pathname?.includes("/inbox"),
      requiresAgent: true
    },
    { 
      name: "LLM", 
      icon: Sparkles, 
      href: currentAgentId ? `/frontend/agent/${currentAgentId}/llm` : "#",
      active: pathname?.includes("/llm"),
      requiresAgent: true
    },
    { 
      name: "Insights", 
      icon: BarChart3, 
      href: currentAgentId ? `/frontend/agent/${currentAgentId}/insights` : "#",
      active: pathname?.includes("/insights"),
      requiresAgent: true
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center" style={{ background: '#f5f5f7' }}>
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] flex" style={{ background: '#f5f5f7' }}>
      {/* Left Sidebar - Apple Glass Style (matching backend blocks exactly) */}
      <div className="fixed left-0 top-0 h-full w-72 z-50">
        <div 
          className="h-full border-r border-gray-300/10 bg-gray-200/90 backdrop-blur-sm shadow-2xl"
        >
          {/* Sidebar Header */}
          <div className="p-6 border-b border-gray-200/20">
            <Link href="/frontend" className="inline-flex items-center gap-2">
              <img 
                src="/brand/logo-circle.png" 
                alt="Drift Logo"
                className="w-6 h-6 rounded-full object-cover"
              />
              <span className="text-lg font-medium text-gray-900">Drift</span>
            </Link>
          </div>

          {/* Navigation Items */}
          <nav className="p-4 space-y-2">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.active;
              const isDisabled = item.requiresAgent && !currentAgentId;
              
              const linkContent = (
                <div className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  isActive
                    ? "bg-blue-600/10 text-blue-600"
                    : isDisabled
                    ? "text-gray-400 cursor-not-allowed opacity-50"
                    : "text-gray-700 hover:bg-white/30"
                }`}>
                  {/* Icon with purplish gradient halo */}
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-400 via-pink-500 to-blue-500 rounded-full blur-sm opacity-50"></div>
                    <div className="relative bg-white rounded-full p-2">
                      <Icon className={`w-4 h-4 ${isActive ? "text-blue-600" : isDisabled ? "text-gray-400" : "text-gray-600"}`} />
                    </div>
                  </div>
                  <span className={`text-sm font-medium ${isActive ? "text-blue-600" : isDisabled ? "text-gray-400" : "text-gray-700"}`}>
                    {item.name}
                  </span>
                </div>
              );

              if (isDisabled) {
                return (
                  <div
                    key={item.href}
                    title="Select an agent first"
                  >
                    {linkContent}
                  </div>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                >
                  {linkContent}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main Content Area - Dashboard Style */}
      <div className="flex-1 ml-72 flex flex-col h-screen overflow-hidden">
        {/* Top Navigation Bar */}
        <div className="bg-white border-b border-gray-200 px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push("/select")}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <ArrowRight className="h-5 w-5 text-gray-600 rotate-180" />
              </button>
              <h1 className="text-xl font-semibold text-gray-900">Agents</h1>
            </div>
            <nav className="flex gap-6">
              <button className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                Overview
              </button>
              <button className="text-sm font-medium text-blue-600 border-b-2 border-blue-600 pb-1">
                Agents
              </button>
              <button className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                Analytics
              </button>
            </nav>
          </div>
        </div>

        {/* Dashboard Content */}
        <div className="flex-1 overflow-y-auto px-8 py-6 bg-[#f5f5f7]">
          {agents.length === 0 ? (
            <div className="max-w-2xl mx-auto text-center pt-16">
              <div className="bg-white rounded-2xl shadow-sm p-12 border border-gray-200">
                <Bot className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h2 className="text-2xl font-semibold text-gray-900 mb-2">No agents found</h2>
                <p className="text-gray-600 mb-6">Please create an agent in the backend first.</p>
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-400 via-pink-500 to-blue-500 rounded-xl blur-sm opacity-50"></div>
                  <button
                    onClick={() => router.push("/select")}
                    className="relative px-6 py-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
                  >
                    Go Back
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-7xl mx-auto">
              {/* Stats Overview */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-200">
                  <div className="text-sm text-gray-600 mb-2">Total Agents</div>
                  <div className="text-3xl font-semibold text-gray-900">{agents.length}</div>
                </div>
                <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-200">
                  <div className="text-sm text-gray-600 mb-2">Active Agents</div>
                  <div className="text-3xl font-semibold text-gray-900">
                    {agents.filter(a => a.status === 'deployed').length}
                  </div>
                </div>
                <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-200">
                  <div className="text-sm text-gray-600 mb-2">Draft Agents</div>
                  <div className="text-3xl font-semibold text-gray-900">
                    {agents.filter(a => a.status === 'draft').length}
                  </div>
                </div>
              </div>

              {/* Agent Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {agents.map((agent) => {
                  const agentGradient = JSON.parse(agent.gradient_color || generateGradientColor(agent.id)) as string[];
                  return (
                    <button
                      key={agent.id}
                      onClick={() => router.push(`/frontend/agent/${agent.id}`)}
                      className="bg-white rounded-2xl shadow-sm p-6 border border-gray-200 hover:shadow-md transition-all text-left group"
                    >
                      {/* Agent Header */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold"
                            style={{
                              background: `linear-gradient(135deg, ${agentGradient[0]} 0%, ${agentGradient[1]} 100%)`,
                            }}
                          >
                            {agent.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                              {agent.name}
                            </h3>
                            <span className={`text-xs px-2 py-1 rounded-full ${
                              agent.status === 'deployed'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              {agent.status}
                            </span>
                          </div>
                        </div>
                        <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
                      </div>

                      {/* Agent Description */}
                      {agent.description && (
                        <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                          {agent.description}
                        </p>
                      )}

                      {/* Agent Metrics */}
                      <div className="flex items-center gap-6 pt-4 border-t border-gray-100">
                        <div className="flex items-center gap-2 text-gray-600">
                          <MessageSquare className="h-4 w-4" />
                          <span className="text-xs">0 conversations</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <Clock className="h-4 w-4" />
                          <span className="text-xs">0 min avg</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

