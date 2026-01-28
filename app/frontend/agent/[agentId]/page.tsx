// app/frontend/agent/[agentId]/page.tsx - Agent Selection Page
"use client";

import { useEffect } from "react";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import { Bot, Calendar, FileText, Sparkles, BarChart3 } from "lucide-react";

export default function AgentSelectionPage() {
  const params = useParams();
  const pathname = usePathname();
  const agentId = params.agentId as string;

  useEffect(() => {
    // Override global dark theme styles for Apple-style light theme
    const html = document.documentElement;
    const body = document.body;
    const main = document.querySelector('main');
    
    const originalHtmlBg = html.style.background;
    const originalBodyBg = body.style.background;
    const originalBodyColor = body.style.color;
    const originalMainBg = main ? (main as HTMLElement).style.background : null;
    
    html.style.setProperty('background', '#f5f5f7', 'important');
    body.style.setProperty('background', '#f5f5f7', 'important');
    body.style.setProperty('color', '#111827', 'important');
    if (main) {
      (main as HTMLElement).style.setProperty('background', '#f5f5f7', 'important');
    }

    return () => {
      html.style.setProperty('background', originalHtmlBg, 'important');
      body.style.setProperty('background', originalBodyBg, 'important');
      body.style.setProperty('color', originalBodyColor, 'important');
      if (main && originalMainBg !== null) {
        (main as HTMLElement).style.setProperty('background', originalMainBg, 'important');
      }
    };
  }, []);

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
      href: `/frontend/agent/${agentId}/schedule`,
      active: pathname?.includes("/schedule"),
      requiresAgent: true
    },
    { 
      name: "Inbox", 
      icon: Inbox, 
      href: `/frontend/agent/${agentId}/inbox`,
      active: pathname?.includes("/inbox"),
      requiresAgent: true
    },
    { 
      name: "LLM", 
      icon: Sparkles, 
      href: `/frontend/agent/${agentId}/llm`,
      active: pathname?.includes("/llm"),
      requiresAgent: true
    },
    { 
      name: "Insights", 
      icon: BarChart3, 
      href: `/frontend/agent/${agentId}/insights`,
      active: pathname?.includes("/insights"),
      requiresAgent: true
    },
  ];

  return (
    <div className="min-h-screen bg-[#f5f5f7] flex" style={{ background: '#f5f5f7' }}>
      {/* Left Sidebar - Apple Glass Style */}
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
                  {/* Icon with purplish gradient halo */}
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-400 via-pink-500 to-blue-500 rounded-full blur-sm opacity-50"></div>
                    <div className="relative bg-white rounded-full p-2">
                      <Icon className={`w-4 h-4 ${isActive ? "text-blue-600" : "text-gray-600"}`} />
                    </div>
                  </div>
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
      <div className="flex-1 ml-72 flex items-center justify-center px-8 py-6">
        <div className="text-center max-w-2xl">
          <h1 className="text-3xl font-semibold text-gray-900 mb-4">Agent Selected</h1>
          <p className="text-gray-600 mb-6">
            Use the sidebar to navigate to Calendar, Client Details, LLM, or Insights.
          </p>
        </div>
      </div>
    </div>
  );
}
