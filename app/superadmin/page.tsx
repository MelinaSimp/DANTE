// app/superadmin/page.tsx
export const dynamic = "force-dynamic";

import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasSuperadminAccess } from "@/lib/superadmin";

export default async function SuperadminPage() {
  const supabase = await createServerSupabase();
  
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  // Check if user is actually a superadmin
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_superadmin, full_name")
    .eq("id", user.id)
    .maybeSingle();

  // If not superadmin, redirect to regular dashboard
  if (!hasSuperadminAccess(user.email, profile?.is_superadmin)) {
    redirect("/");
  }

  return (
    <main 
      className="min-h-screen"
      style={{
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)'
      }}
    >
      {/* Header with distinctive styling */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-blue-600/20"></div>
        <div className="relative mx-auto max-w-6xl px-4 pt-16 pb-12 text-center">
          <div className="mb-6">
            <div 
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium mb-4"
              style={{
                background: 'linear-gradient(90deg, rgba(139, 92, 246, 0.2) 0%, rgba(59, 130, 246, 0.2) 100%)',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                color: '#e2e8f0'
              }}
            >
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span>SUPERADMIN CONSOLE</span>
            </div>
          </div>
          
          <h1 
            className="text-4xl md:text-5xl font-bold mb-4"
            style={{
              background: 'linear-gradient(135deg, #ffffff 0%, #e2e8f0 50%, #94a3b8 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}
          >
            Platform Administration
          </h1>
          
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Manage the entire Drift AI platform, users, and system-wide operations
          </p>
        </div>
      </div>

      {/* Dashboard Cards with enhanced styling */}
      <section className="relative mx-auto max-w-6xl px-4 pb-32">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          
          {/* System Administration */}
          <Link
            href="/admin"
            className="group relative overflow-hidden rounded-2xl p-8 transition-all duration-300 hover:scale-105 hover:shadow-2xl"
            style={{
              background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.8) 0%, rgba(51, 65, 85, 0.8) 100%)',
              border: '1px solid rgba(139, 92, 246, 0.2)',
              backdropFilter: 'blur(10px)'
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-purple-600/10 to-blue-600/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div 
                className="flex h-16 w-16 items-center justify-center rounded-xl mb-6"
                style={{
                  background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(59, 130, 246, 0.2) 100%)',
                  border: '1px solid rgba(139, 92, 246, 0.3)'
                }}
              >
                <svg className="w-8 h-8 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-3">System Administration</h3>
              <p className="text-gray-300 text-sm leading-relaxed">
                Manage workspaces, users, and system-wide settings across the platform.
              </p>
            </div>
          </Link>

          {/* Analytics & Reports */}
          <Link
            href="/admin/analytics"
            className="group relative overflow-hidden rounded-2xl p-8 transition-all duration-300 hover:scale-105 hover:shadow-2xl"
            style={{
              background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.8) 0%, rgba(51, 65, 85, 0.8) 100%)',
              border: '1px solid rgba(34, 197, 94, 0.2)',
              backdropFilter: 'blur(10px)'
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-green-600/10 to-emerald-600/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div 
                className="flex h-16 w-16 items-center justify-center rounded-xl mb-6"
                style={{
                  background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(16, 185, 129, 0.2) 100%)',
                  border: '1px solid rgba(34, 197, 94, 0.3)'
                }}
              >
                <svg className="w-8 h-8 text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Analytics & Reports</h3>
              <p className="text-gray-300 text-sm leading-relaxed">
                Platform-wide expense tracking, usage analytics, and comprehensive reporting.
              </p>
            </div>
          </Link>

          {/* Quick Actions */}
          <div
            className="group relative overflow-hidden rounded-2xl p-8 transition-all duration-300"
            style={{
              background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.8) 0%, rgba(51, 65, 85, 0.8) 100%)',
              border: '1px solid rgba(168, 85, 247, 0.2)',
              backdropFilter: 'blur(10px)'
            }}
          >
            <div className="relative">
              <div 
                className="flex h-16 w-16 items-center justify-center rounded-xl mb-6"
                style={{
                  background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%)',
                  border: '1px solid rgba(168, 85, 247, 0.3)'
                }}
              >
                <svg className="w-8 h-8 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Quick Actions</h3>
              <div className="space-y-3">
                <div className="text-sm text-gray-300">
                  • View all workspaces
                </div>
                <div className="text-sm text-gray-300">
                  • Monitor system health
                </div>
                <div className="text-sm text-gray-300">
                  • Access debug tools
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* Enhanced Status Bar */}
      <div 
        className="fixed bottom-0 left-0 right-0 px-6 py-4"
        style={{
          background: 'linear-gradient(90deg, rgba(30, 41, 59, 0.95) 0%, rgba(51, 65, 85, 0.95) 100%)',
          borderTop: '1px solid rgba(139, 92, 246, 0.3)',
          backdropFilter: 'blur(20px)'
        }}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between text-sm">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse shadow-lg shadow-green-400/50"></div>
              <span className="text-white font-semibold tracking-wide">SUPERADMIN MODE</span>
            </div>
            <div className="w-px h-4 bg-gray-400"></div>
            <span className="text-gray-300">Platform Control Active</span>
            <div className="w-px h-4 bg-gray-400"></div>
            <span className="text-gray-300">Secure Connection</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-gray-300">Logged in as:</span>
            <span 
              className="px-3 py-1 rounded-full text-sm font-medium"
              style={{
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(59, 130, 246, 0.2) 100%)',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                color: '#e2e8f0'
              }}
            >
              {profile.full_name || "Administrator"}
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
