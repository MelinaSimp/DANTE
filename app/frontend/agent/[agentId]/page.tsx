// app/frontend/agent/[agentId]/page.tsx - Agent Selection Page
"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";

export default function AgentSelectionPage() {
  const params = useParams();
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

  return (
    <div className="min-h-screen bg-[#f5f5f7]" style={{ background: '#f5f5f7' }}>
      <div className="flex-1 ml-72 flex items-center justify-center px-8 py-6">
        <div className="text-center max-w-2xl">
          <h1 className="text-3xl font-semibold text-gray-900 mb-4">Agent Selected</h1>
          <p className="text-gray-600 mb-6">
            Use the sidebar to navigate to Calendar, Data Sources, Policies, LLM, or Insights.
          </p>
        </div>
      </div>
    </div>
  );
}
