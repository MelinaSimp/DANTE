// app/select/page.tsx - Frontend/Backend Selection Page
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

export default function SelectPage() {
  const router = useRouter();

  useEffect(() => {
    // Check if user is authenticated
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/auth");
      }
    });
  }, [router]);

  // Override global dark theme for select page
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const main = document.querySelector('main');
    
    // Apply light theme with !important via inline styles
    html.style.setProperty('background', '#f5f5f7', 'important');
    body.style.setProperty('background', '#f5f5f7', 'important');
    body.style.setProperty('color', '#111827', 'important');
    if (main) {
      (main as HTMLElement).style.setProperty('background', '#f5f5f7', 'important');
    }
    
    // Cleanup on unmount
    return () => {
      html.style.removeProperty('background');
      body.style.removeProperty('background');
      body.style.removeProperty('color');
      if (main) {
        (main as HTMLElement).style.removeProperty('background');
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center px-4 py-16" style={{ background: '#f5f5f7' }}>
      {/* Top Logo - Apple style */}
      <div className="absolute top-8 left-8">
        <Link href="/" className="inline-flex items-center gap-2">
          <img 
            src="/brand/logo-circle.png" 
            alt="Drift Logo"
            className="w-6 h-6 rounded-full object-cover"
          />
          <span className="text-lg font-medium text-gray-900" style={{ color: '#111827' }}>Drift</span>
        </Link>
      </div>

      <div className="w-full max-w-4xl">
        {/* Title */}
        <div className="text-center mb-12">
          <h1 className="text-3xl font-semibold text-gray-900 mb-3" style={{ color: '#111827' }}>
            Welcome to Drift
          </h1>
          <p className="text-gray-600 text-lg" style={{ color: '#4b5563' }}>
            Choose your experience
          </p>
        </div>

        {/* Selection Cards - Apple style */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Frontend Card */}
          <button
            onClick={() => router.push("/frontend")}
            className="group relative bg-white rounded-2xl shadow-lg p-10 hover:shadow-xl transition-all duration-300 border border-gray-100"
            style={{ background: '#ffffff' }}
          >
            <div className="flex flex-col items-center text-center">
              {/* Icon with colorful gradient background - Apple style */}
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 rounded-full blur-xl opacity-40 group-hover:opacity-60 animate-pulse"></div>
                <div className="relative bg-white rounded-full p-4 shadow-md w-20 h-20 flex items-center justify-center">
                  {/* Simple diamond/star shape without extra lines */}
                  <div className="w-10 h-10 relative">
                    <div className="absolute inset-0 transform rotate-45 border-4 border-blue-600 rounded-sm"></div>
                  </div>
                </div>
              </div>
              
              <h2 className="text-2xl font-semibold text-gray-900 mb-3" style={{ color: '#111827' }}>
                Frontend
              </h2>
              <p className="text-gray-600 text-sm leading-relaxed" style={{ color: '#4b5563' }}>
                Clean, minimal interface for interacting with agents
              </p>
            </div>
          </button>

          {/* Backend Card */}
          <button
            onClick={() => router.push("/app")}
            className="group relative bg-white rounded-2xl shadow-lg p-10 hover:shadow-xl transition-all duration-300 border border-gray-100"
            style={{ background: '#ffffff' }}
          >
            <div className="flex flex-col items-center text-center">
              {/* Icon with colorful gradient background - Apple style */}
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-gradient-to-br from-orange-400 via-red-500 to-pink-500 rounded-full blur-xl opacity-40 group-hover:opacity-60 animate-pulse"></div>
                <div className="relative bg-gray-900 rounded-full p-4 shadow-md w-20 h-20 flex items-center justify-center">
                  {/* Simple diamond/star shape without extra lines */}
                  <div className="w-10 h-10 relative">
                    <div className="absolute inset-0 transform rotate-45 border-4 border-white rounded-sm"></div>
                  </div>
                </div>
              </div>
              
              <h2 className="text-2xl font-semibold text-gray-900 mb-3" style={{ color: '#111827' }}>
                Backend
              </h2>
              <p className="text-gray-600 text-sm leading-relaxed" style={{ color: '#4b5563' }}>
                Full control and configuration for managing agents
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

