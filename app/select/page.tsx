"use client";

// Workspace hub / role picker. Harvey-ized: pure white canvas,
// editorial serif header, flat cards in a grid, 1px rules. No GLSL,
// no purple orb, no hover-to-reveal gate — on a CCO's first visit
// every destination is visible immediately.
//
// Post-auth users normally skip this page (callback redirects to
// /dashboard). /select remains accessible for multi-role workspaces
// and superadmins who need Backend/Admin.

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Monitor,
  Server,
  Shield,
  LogOut,
  Settings,
  LayoutDashboard,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { reportError } from "@/lib/report-error";

interface NavItem {
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
  requiresSuperadmin?: boolean;
}

export default function SelectPage() {
  const router = useRouter();
  const [showBackendPassword, setShowBackendPassword] = useState(false);
  const [backendPassword, setBackendPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [ready, setReady] = useState(false);
  const passwordRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/auth");
        return;
      }
      fetch("/api/me", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data) return;
          if (data.is_superadmin) setIsSuperadmin(true);
          if (!data.workspace_id && !data.is_superadmin) {
            router.push("/join");
            return;
          }
          setReady(true);
        })
        .catch(reportError("select: check workspace"));
    });
  }, [router]);

  // Same canvas override pattern as /auth — pave over any legacy
  // dark-theme styling on html/body/main so this page reads pure white.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const main = document.querySelector("main");
    html.style.setProperty("background", "var(--canvas)", "important");
    body.style.setProperty("background", "var(--canvas)", "important");
    body.style.setProperty("color", "var(--ink)", "important");
    if (main)
      (main as HTMLElement).style.setProperty(
        "background",
        "var(--canvas)",
        "important"
      );
    return () => {
      html.style.removeProperty("background");
      body.style.removeProperty("background");
      body.style.removeProperty("color");
      if (main) (main as HTMLElement).style.removeProperty("background");
    };
  }, []);

  useEffect(() => {
    if (!showBackendPassword) return;
    const h = (e: MouseEvent) => {
      if (
        passwordRef.current &&
        !passwordRef.current.contains(e.target as Node)
      ) {
        setShowBackendPassword(false);
        setBackendPassword("");
        setPasswordError("");
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showBackendPassword]);

  const handleBackendAccess = async () => {
    if (!backendPassword.trim()) {
      setPasswordError("Please enter a password");
      return;
    }
    try {
      const r = await fetch("/api/backend/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: backendPassword }),
      });
      if (r.ok) {
        const data = await r.json();
        if (data.valid) {
          sessionStorage.setItem("backend_authenticated", "true");
          router.push("/app");
        } else setPasswordError("Incorrect password");
      } else setPasswordError("Error verifying password");
    } catch {
      setPasswordError("Error verifying password");
    }
  };

  const navItems: NavItem[] = [
    {
      name: "Dashboard",
      description: "Client book, calls, flags awaiting review.",
      icon: LayoutDashboard,
      action: () => router.push("/dashboard"),
    },
    {
      name: "Frontend",
      description: "Live agents and voice interactions.",
      icon: Monitor,
      action: () => router.push("/frontend"),
    },
    {
      name: "Backend",
      description: "Configure agents, prompts, tools.",
      icon: Server,
      action: () => setShowBackendPassword(true),
    },
    {
      name: "Admin",
      description: "Manage members, invites, billing.",
      icon: Shield,
      action: () => router.push("/admin"),
      requiresSuperadmin: true,
    },
    {
      name: "Settings",
      description: "Workspace settings and integrations.",
      icon: Settings,
      action: () => router.push("/settings"),
    },
  ];

  const visibleItems = navItems.filter(
    (item) => !item.requiresSuperadmin || isSuperadmin
  );

  if (!ready) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--canvas)" }}
      >
        <div
          className="text-sm mono"
          style={{ color: "var(--ink-subtle)" }}
        >
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative min-h-screen flex flex-col"
      style={{ background: "var(--canvas)" }}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-6 md:px-10 py-5"
        style={{ borderBottom: "1px solid var(--rule)" }}
      >
        <Link href="/" className="inline-flex items-center gap-2 group">
          <img
            src="/brand/logo-circle.png"
            alt="Drift"
            className="w-6 h-6 rounded-full object-cover"
          />
          <span
            className="heading-display text-xl"
            style={{ color: "var(--ink)" }}
          >
            Drift
          </span>
        </Link>
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            router.push("/auth");
          }}
          className="inline-flex items-center gap-1.5 text-xs transition-colors"
          style={{ color: "var(--ink-muted)" }}
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 md:py-16">
        <div className="w-full max-w-3xl">
          <div className="mb-8">
            <div className="label-section mb-2">Workspace</div>
            <h1
              className="heading-display text-4xl md:text-5xl mb-2"
              style={{ color: "var(--ink)" }}
            >
              Where would you like to go?
            </h1>
            <p
              className="prose-body"
              style={{ color: "var(--ink-muted)" }}
            >
              Most advisors spend their day in the dashboard. Other
              surfaces are here if you need them.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.name}
                  onClick={item.action}
                  className="card-flat-hover text-left p-5 transition-colors"
                  style={{
                    borderColor: "var(--rule)",
                    background: "var(--canvas)",
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="flex items-center justify-center shrink-0"
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: "var(--r-chip)",
                        background: "var(--accent-soft)",
                        color: "var(--accent)",
                      }}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-sm font-medium mb-0.5"
                        style={{ color: "var(--ink)" }}
                      >
                        {item.name}
                      </div>
                      <div
                        className="text-xs leading-relaxed"
                        style={{ color: "var(--ink-muted)" }}
                      >
                        {item.description}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {showBackendPassword && (
            <div
              ref={passwordRef}
              className="mt-6 card-flat p-6 max-w-sm"
              style={{
                borderColor: "var(--rule)",
                animation: "panelSlideUp 0.18s ease-out",
              }}
            >
              <style>{`@keyframes panelSlideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
              <div className="label-section mb-2">Backend access</div>
              <input
                type="password"
                value={backendPassword}
                onChange={(e) => {
                  setBackendPassword(e.target.value);
                  setPasswordError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleBackendAccess();
                }}
                placeholder="Enter password"
                className="w-full px-3.5 py-2.5 text-sm outline-none"
                style={{
                  border: "1px solid var(--rule)",
                  background: "var(--canvas)",
                  color: "var(--ink)",
                  borderRadius: "var(--r-input)",
                }}
                autoFocus
              />
              {passwordError && (
                <p
                  className="text-xs mt-2"
                  style={{ color: "var(--danger)" }}
                >
                  {passwordError}
                </p>
              )}
              <button
                onClick={handleBackendAccess}
                className="w-full mt-3 px-4 py-2.5 text-sm font-medium transition"
                style={{
                  background: "var(--ink)",
                  color: "var(--canvas)",
                  borderRadius: "var(--r-input)",
                }}
              >
                Access Backend
              </button>
            </div>
          )}
        </div>
      </div>

      <div
        className="text-center text-[11px] mono py-5"
        style={{ color: "var(--ink-subtle)" }}
      >
        © {new Date().getFullYear()} Drift AI
      </div>
    </div>
  );
}
