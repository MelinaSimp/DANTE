// app/frontend/page.tsx - Frontend Agent Carousel with Apple Glass Sidebar
"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import Link from "next/link";
import { Bot, Calendar, Database, Shield, Sparkles } from "lucide-react";

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
      router.push(`/frontend/agent/${currentAgent.id}`);
    }
  };

  // Sidebar navigation items
  const sidebarItems = [
    { 
      name: "Agents", 
      icon: Bot, 
      href: "/frontend",
      active: pathname === "/frontend" || pathname?.startsWith("/frontend/agent")
    },
    { 
      name: "Calendar", 
      icon: Calendar, 
      href: "/frontend/calendar",
      active: pathname === "/frontend/calendar"
    },
    { 
      name: "Data Sources", 
      icon: Database, 
      href: "/frontend/data-sources",
      active: pathname === "/frontend/data-sources"
    },
    { 
      name: "Policies", 
      icon: Shield, 
      href: "/frontend/policies",
      active: pathname === "/frontend/policies"
    },
    { 
      name: "LLM", 
      icon: Sparkles, 
      href: "/frontend/llm",
      active: pathname === "/frontend/llm"
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
          className="h-full border-r border-gray-300/10 shadow-2xl"
          style={{
            background: 'rgba(243, 244, 246, 0.9)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
          }}
        >
          {/* Sidebar Header */}
          <div className="p-6 border-b border-gray-200/20">
            <Link href="/" className="inline-flex items-center gap-2">
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
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                    isActive
                      ? "bg-blue-600/10 text-blue-600"
                      : "text-gray-700 hover:bg-white/30"
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? "text-blue-600" : "text-gray-600"}`} />
                  <span className={`text-sm font-medium ${isActive ? "text-blue-600" : "text-gray-700"}`}>
                    {item.name}
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex items-center justify-center px-4 py-16 ml-72">
        {agents.length === 0 ? (
          <div className="text-center">
            <h1 className="text-3xl font-light text-gray-900 mb-4">No agents found</h1>
            <p className="text-gray-600 mb-6">Please create an agent in the backend first.</p>
            <button
              onClick={() => router.push("/select")}
              className="px-6 py-3 rounded-2xl bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              Go Back
            </button>
          </div>
        ) : (
          <div className="w-full max-w-4xl">
            {/* Header */}
            <div className="text-center mb-12">
              <button
                onClick={() => router.push("/select")}
                className="text-gray-400 hover:text-gray-900 mb-6 transition-colors text-sm"
              >
                ← Back
              </button>
              <h1 className="text-4xl font-light text-gray-900 mb-2">Select an Agent</h1>
              <p className="text-gray-600">
                {currentIndex + 1} of {agents.length}
              </p>
            </div>

            {/* Agent Carousel */}
            <div className="relative flex items-center justify-center">
              {/* Previous Button */}
              {agents.length > 1 && (
                <button
                  onClick={handlePrev}
                  className="absolute left-0 z-10 w-12 h-12 rounded-full bg-white border border-gray-200 shadow-lg hover:shadow-xl transition-all flex items-center justify-center text-gray-600 hover:text-gray-900"
                >
                  ←
                </button>
              )}

              {/* Agent Circle */}
              <div className="flex-1 flex items-center justify-center">
                <button
                  onClick={handleAgentClick}
                  className="group relative w-80 h-80 rounded-full cursor-pointer transition-transform hover:scale-105"
                  style={{
                    background: `radial-gradient(circle, ${gradientColors[0]} 0%, ${gradientColors[1]} 50%, ${gradientColors[2]} 100%)`,
                    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
                  }}
                >
                  <div className="absolute inset-0 rounded-full bg-white/0 group-hover:bg-white/10 transition-colors" />
                  <div className="relative h-full flex flex-col items-center justify-center text-white px-8">
                    <h2 className="text-3xl font-light mb-2">{currentAgent?.name}</h2>
                    {currentAgent?.description && (
                      <p className="text-sm opacity-90 text-center">{currentAgent.description}</p>
                    )}
                  </div>
                </button>
              </div>

              {/* Next Button */}
              {agents.length > 1 && (
                <button
                  onClick={handleNext}
                  className="absolute right-0 z-10 w-12 h-12 rounded-full bg-white border border-gray-200 shadow-lg hover:shadow-xl transition-all flex items-center justify-center text-gray-600 hover:text-gray-900"
                >
                  →
                </button>
              )}
            </div>

            {/* Dots Indicator */}
            {agents.length > 1 && (
              <div className="flex justify-center gap-2 mt-8">
                {agents.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentIndex(index)}
                    className={`h-2 rounded-full transition-all ${
                      index === currentIndex ? "bg-gray-900 w-8" : "bg-gray-300 w-2"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

