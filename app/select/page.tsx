// app/select/page.tsx - Frontend/Backend Selection Page
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

export default function SelectPage() {
  const router = useRouter();
  const [showBackendPassword, setShowBackendPassword] = useState(false);
  const [backendPassword, setBackendPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isSuperadmin, setIsSuperadmin] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/auth");
        return;
      }
      fetch("/api/me", { credentials: "include" })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data?.is_superadmin) setIsSuperadmin(true);
        })
        .catch(() => {});
    });
  }, [router]);

  const handleBackendAccess = async () => {
    if (!backendPassword.trim()) {
      setPasswordError("Please enter a password");
      return;
    }

    // Verify password via API
    try {
      const response = await fetch("/api/backend/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: backendPassword }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.valid) {
          // Store in sessionStorage so they don't have to enter it again this session
          sessionStorage.setItem("backend_authenticated", "true");
          router.push("/app");
        } else {
          setPasswordError("Incorrect password");
        }
      } else {
        setPasswordError("Error verifying password. Please try again.");
      }
    } catch (error) {
      console.error("Password verification error:", error);
      setPasswordError("Error verifying password. Please try again.");
    }
  };

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
        <div className={`grid grid-cols-1 ${isSuperadmin ? "md:grid-cols-3" : "md:grid-cols-2"} gap-6`}>
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
                <div className="relative bg-white rounded-full p-4 shadow-md overflow-hidden">
                  <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center" style={{ clipPath: 'inset(15% 15% 15% 15%)' }}>
                    <img 
                      src="/brand/frontend-icon.png?v=3" 
                      alt="Frontend"
                      className="w-full h-full object-contain scale-125"
                    />
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
          <div className="relative">
            <button
              onClick={() => setShowBackendPassword(!showBackendPassword)}
              className="group relative bg-white rounded-2xl shadow-lg p-10 hover:shadow-xl transition-all duration-300 border border-gray-100 w-full"
              style={{ background: '#ffffff' }}
            >
            <div className="flex flex-col items-center text-center">
              {/* Icon with colorful gradient background - Apple style */}
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-gradient-to-br from-orange-400 via-red-500 to-pink-500 rounded-full blur-xl opacity-40 group-hover:opacity-60 animate-pulse"></div>
                <div className="relative bg-gray-900 rounded-full p-4 shadow-md">
                  <img 
                    src="/brand/backend-icon.png?v=3" 
                    alt="Backend"
                    className="w-16 h-16 rounded-full object-contain"
                  />
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

          {/* Password Input - Slides down from button */}
          {showBackendPassword && (
            <div className="mt-4 bg-white rounded-2xl shadow-lg p-6 border border-gray-100 animate-in slide-in-from-top-2 duration-300">
              <div className="space-y-4">
                <label className="block text-sm font-medium text-gray-900" style={{ color: '#111827' }}>
                  Enter Backend Password
                </label>
                <input
                  type="password"
                  value={backendPassword}
                  onChange={(e) => {
                    setBackendPassword(e.target.value);
                    setPasswordError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleBackendAccess();
                    }
                  }}
                  placeholder="Password"
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900"
                  style={{ background: '#ffffff' }}
                  autoFocus
                />
                {passwordError && (
                  <p className="text-sm text-red-600">{passwordError}</p>
                )}
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleBackendAccess}
                    className="flex-1 px-4 py-3 rounded-xl bg-black text-white font-medium hover:bg-gray-800 transition"
                  >
                    Access Backend
                  </button>
                  <button
                    onClick={() => {
                      setShowBackendPassword(false);
                      setBackendPassword("");
                      setPasswordError("");
                    }}
                    className="px-4 py-3 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
          </div>

          {/* Admin Card - Only for superadmins */}
          {isSuperadmin && (
            <button
              onClick={() => router.push("/admin")}
              className="group relative bg-white rounded-2xl shadow-lg p-10 hover:shadow-xl transition-all duration-300 border border-gray-100"
              style={{ background: '#ffffff' }}
            >
              <div className="flex flex-col items-center text-center">
                <div className="relative mb-6">
                  <div className="absolute inset-0 bg-gradient-to-br from-yellow-400 via-orange-500 to-red-500 rounded-full blur-xl opacity-40 group-hover:opacity-60 animate-pulse"></div>
                  <div className="relative bg-gray-900 rounded-full p-4 shadow-md flex items-center justify-center">
                    <svg className="w-16 h-16 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                  </div>
                </div>
                <h2 className="text-2xl font-semibold text-gray-900 mb-3" style={{ color: '#111827' }}>
                  Admin
                </h2>
                <p className="text-gray-600 text-sm leading-relaxed" style={{ color: '#4b5563' }}>
                  Manage workspaces, features, and billing
                </p>
              </div>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

