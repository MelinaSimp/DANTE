// app/frontend/agent/[agentId]/page.tsx - Agent Selection Page
"use client";

import { useEffect } from "react";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import { Bot, Calendar, FileText, CalendarClock, Phone, Mail, Inbox } from "lucide-react";
import { useFeatures } from "@/hooks/useFeatures";
import type { FeatureId } from "@/lib/features";
import MobileNav from "@/components/frontend/MobileNav";

export default function AgentSelectionPage() {
  const params = useParams();
  const pathname = usePathname();
  const agentId = params.agentId as string;
  const { features } = useFeatures();

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
      requiresAgent: true,
      featureId: "calendar" as FeatureId
    },
    { 
      name: "Client Details", 
      icon: FileText, 
      href: "/client-details-overview",
      active: pathname === "/client-details-overview",
      requiresAgent: true,
      featureId: "client_details" as FeatureId
    },
    { 
      name: "Meeting Planner", 
      icon: CalendarClock, 
      href: `/frontend/agent/${agentId}/llm`,
      active: pathname?.includes("/llm"),
      requiresAgent: true,
      featureId: "meeting_planner" as FeatureId
    },
    { 
      name: "Sales", 
      icon: Phone, 
      href: `/frontend/agent/${agentId}/sales`,
      active: pathname?.includes("/sales"),
      requiresAgent: true,
      featureId: "sales" as FeatureId
    },
    { 
      name: "Emailing", 
      icon: Mail, 
      href: `/frontend/agent/${agentId}/emailing`,
      active: pathname?.includes("/emailing"),
      requiresAgent: true,
      featureId: "emailing" as FeatureId
    },
    { 
      name: "Inbox", 
      icon: Inbox, 
      href: `/frontend/agent/${agentId}/inbox`,
      active: pathname?.includes("/inbox"),
      requiresAgent: true,
      featureId: "inbox" as FeatureId
    },
  ];

  const mobileNavItems = sidebarItems
    .filter((item) => !item.featureId || features.includes(item.featureId))
    .map(({ name, icon, href, active }) => ({ name, icon, href, active }));

  return (
    <div className="min-h-screen bg-[#f5f5f7] flex flex-col md:flex-row" style={{ background: '#f5f5f7' }}>
      <MobileNav items={mobileNavItems} backHref="/frontend" backLabel="Back" />
      {/* Left Sidebar */}
      <div className="hidden md:flex flex-col w-48 border-r border-gray-200 bg-white shrink-0">
        <div className="p-4 border-b border-gray-200 flex items-center gap-2">
          <Link href="/frontend" className="flex items-center gap-2">
            <img src="/brand/logo-circle.png" alt="Drift" className="w-7 h-7 rounded-full object-cover" />
            <span className="text-sm font-semibold text-gray-900">Drift</span>
          </Link>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {sidebarItems.filter((item) => !item.featureId || features.includes(item.featureId)).map((item) => {
            const Icon = item.icon;
            const isActive = item.active;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive ? "bg-gray-100 text-black" : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex items-center justify-center px-8 py-6">
        <div className="text-center max-w-2xl">
          <h1 className="text-3xl font-semibold text-gray-900 mb-4">Agent Selected</h1>
          <p className="text-gray-600 mb-6">
            Use the sidebar to navigate between features.
          </p>
        </div>
      </div>
    </div>
  );
}
